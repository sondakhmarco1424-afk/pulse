package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"pulse/internal/app"
	"pulse/internal/models"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/mysql"
	"github.com/stephenafamo/bob/dialect/mysql/im"
	"github.com/stephenafamo/bob/dialect/mysql/sm"
	"github.com/stephenafamo/bob/dialect/mysql/um"
	"github.com/stephenafamo/scan"
)

type (
	AlertsRepository interface {
		RealtimeAlerts(*websocket.Conn, models.AlertsRequestRaw) (int, error)
		CreateAlert(context.Context, *models.Alert) error
		GetPendingAlerts(context.Context, string, string) (*models.Alert, error)
		GetPendingAlertsBySymbol(context.Context, string) ([]models.Alert, error)
		UpdateAlertStatus(context.Context, int, string, float64, *string) (int64, error)
		GetAlertsByRequester(context.Context, string) ([]models.Alert, error)
		GetAlertByID(context.Context, int) (*models.Alert, error)
		GetAlertByDetails(context.Context, string, string, float64) (*models.Alert, error)
	}
	alertsRepository struct {
		db *bob.DB
	}
)

var (
	alertsCache      = make(map[string][]models.Alert)
	alertsCacheMu    sync.RWMutex
	cacheInitialized bool
)

func initializeCache(ctx context.Context, db *bob.DB) error {
	alertsCacheMu.Lock()
	defer alertsCacheMu.Unlock()

	if cacheInitialized {
		return nil
	}

	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	q := mysql.Select(
		sm.Columns("*"),
		sm.From("alerts"),
		sm.Where(mysql.Quote("notification_status").EQ(mysql.Arg("PENDING"))),
	)

	alerts, err := bob.All(ctx, db, q, scan.StructMapper[models.Alert]())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			cacheInitialized = true
			return nil
		}
		return fmt.Errorf("failed to fetch pending alerts to initialize cache: %w", err)
	}

	// Reset map
	alertsCache = make(map[string][]models.Alert)
	for _, alert := range alerts {
		symbol := strings.ToUpper(alert.Symbol)
		alertsCache[symbol] = append(alertsCache[symbol], alert)
	}

	cacheInitialized = true
	slog.Info("Successfully initialized in-memory alerts cache", "count", len(alerts))
	return nil
}

func NewAlertsRepository() AlertsRepository {
	return &alertsRepository{
		db: app.DBConn,
	}
}

func (svc *alertsRepository) WriteMessageWS(conn *websocket.Conn, result *models.BinanceDataResult) error {
	ret := map[string]interface{}{
		"Symbol":       result.Symbol,
		"Price":        result.Price,
		"AggregateID":  result.AggregateID,
		"FirstTradeID": result.FirstTradeID,
		"LastTradeID":  result.LastTradeID,
		"TradeTime":    result.TradeTime,
	}

	jsonResponse, err := json.Marshal(ret)
	if err != nil {
		fmt.Println("❌ JSON marshal error:", err)
		return err
	}

	if err := conn.WriteMessage(websocket.TextMessage, jsonResponse); err != nil {
		fmt.Println("❌ Write error:", err)
		return err
	}
	return nil
}

func (svc *alertsRepository) RealtimeAlerts(conn *websocket.Conn, request models.AlertsRequestRaw) (int, error) {
	redisrepo := NewRedisRepository()
	defer redisrepo.Close()

	var DataCh <-chan *redis.Message
	if request.ShowAll {
		DataIndex := redisrepo.PSubscribe(context.Background(), "binance:*:ticker")
		defer DataIndex.Close()
		DataCh = DataIndex.Channel()
	} else {
		DataIndex := fmt.Sprintf("binance:%s:ticker", strings.ToUpper(request.Symbol))
		DataSub := redisrepo.Subscribe(context.Background(), DataIndex)
		defer DataSub.Close()
		DataCh = DataSub.Channel()
	}

	SignalCh := make(chan string)

	go func() {
		defer close(SignalCh)

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
					slog.Warn(fmt.Sprintf("⚠️ Abnormal Closure Detected: %v", err))
				} else {
					slog.Info("Client disconnected normally.")
				}
				return
			}

			command := strings.TrimSpace(string(msg))

			if command == "CLOSE" {
				slog.Info("Received CLOSE signal")
				SignalCh <- "CLOSE"
				return
			}
		}
	}()

	for {
		select {
		case approve, ok := <-SignalCh:
			if !ok {
				slog.Warn("WebSocket connection lost (Abnormal or Normal closure)")
				return 1000, fmt.Errorf("connection_lost")
			}
			if approve == "CLOSE" {
				return 999, nil
			}
		case msg, ok := <-DataCh:
			if !ok {
				return 500, fmt.Errorf("Something happened when creating the position channel")
			}

			var msgData models.BinanceTickerRaw
			err := json.Unmarshal([]byte(msg.Payload), &msgData)
			if err != nil {
				slog.Error("Failed to unmarshal message", "error", err)
				return 500, err
			}

			if request.ShowAll || request.Symbol == "" || msgData.Symbol == request.Symbol {
				result := models.BinanceDataResult{
					Symbol:       msgData.Symbol,
					Price:        msgData.Price,
					FirstTradeID: int64(msgData.FirstTradeID),
					LastTradeID:  int64(msgData.LastTradeID),
				}
				svc.WriteMessageWS(conn, &result)
			}
		}
	}
}

func (svc *alertsRepository) CreateAlert(ctx context.Context, alert *models.Alert) error {
	if svc.db == nil {
		return fmt.Errorf("Database is not initialized")
	}

	insertQuery := mysql.Insert(
		im.Into("alerts", "requester", "symbol", "price_trigger", "notification_status", "latest_price", "trigger_direction"),
		im.Values(mysql.Arg(alert.Requester, alert.Symbol, alert.PriceTrigger, alert.NotificationStatus, alert.LatestPrice, alert.TriggerDirection)),
	)
	result, err := bob.Exec(ctx, svc.db, insertQuery)
	if err != nil {
		return fmt.Errorf("failed to insert alert: %w", err)
	}

	id, err := result.LastInsertId()
	if err == nil {
		alert.ID = int(id)
	}

	// Always sync cache under the lock
	alertsCacheMu.Lock()
	defer alertsCacheMu.Unlock()

	if cacheInitialized {
		symbol := strings.ToUpper(alert.Symbol)
		alertsCache[symbol] = append(alertsCache[symbol], *alert)
	} else {
		// Initialize the cache inline under the lock so it pulls the newly inserted alert
		q := mysql.Select(
			sm.Columns("*"),
			sm.From("alerts"),
			sm.Where(mysql.Quote("notification_status").EQ(mysql.Arg("PENDING"))),
		)
		alerts, err := bob.All(ctx, svc.db, q, scan.StructMapper[models.Alert]())
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				cacheInitialized = true
				return nil
			}
			return fmt.Errorf("failed to fetch pending alerts to initialize cache: %w", err)
		}

		alertsCache = make(map[string][]models.Alert)
		for _, a := range alerts {
			sym := strings.ToUpper(a.Symbol)
			alertsCache[sym] = append(alertsCache[sym], a)
		}
		cacheInitialized = true
		slog.Info("Successfully initialized in-memory alerts cache during alert creation", "count", len(alerts))
	}

	return nil
}

func (svc *alertsRepository) GetPendingAlerts(ctx context.Context, requester, symbol string) (*models.Alert, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	requester = strings.TrimSpace(requester)

	if !cacheInitialized {
		if err := initializeCache(ctx, svc.db); err != nil {
			return nil, err
		}
	}

	alertsCacheMu.RLock()
	defer alertsCacheMu.RUnlock()

	for _, alert := range alertsCache[symbol] {
		if strings.EqualFold(alert.Requester, requester) {
			cpy := alert
			return &cpy, nil
		}
	}

	return nil, nil
}

func (svc *alertsRepository) UpdateAlertStatus(ctx context.Context, alertID int, status string, latestPrice float64, errStr *string) (int64, error) {
	if svc.db == nil {
		return 0, fmt.Errorf("Database is not initialized")
	}

	q := mysql.Update(
		um.Table("alerts"),
		um.SetCol("notification_status").ToArg(status),
		um.SetCol("error_message").ToArg(errStr),
		um.SetCol("latest_price").ToArg(latestPrice),
		um.SetCol("triggered_at").To(mysql.F("IF",
			mysql.Arg(status).EQ(mysql.Arg("TRIGGERED")),
			mysql.Raw("CURRENT_TIMESTAMP"),
			mysql.Quote("triggered_at"),
		)),
		um.Where(mysql.Quote("id").EQ(mysql.Arg(alertID))),
		um.Where(mysql.Quote("notification_status").EQ(mysql.Arg("PENDING"))),
	)

	res, err := bob.Exec(ctx, svc.db, q)
	if err != nil {
		return 0, fmt.Errorf("failed to update alert status: %w", err)
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	// Update cache on success
	if affected > 0 && cacheInitialized {
		alertsCacheMu.Lock()
		for sym, list := range alertsCache {
			foundIndex := -1
			for i, a := range list {
				if a.ID == alertID {
					foundIndex = i
					break
				}
			}
			if foundIndex != -1 {
				alertsCache[sym] = append(list[:foundIndex], list[foundIndex+1:]...)
				break
			}
		}
		alertsCacheMu.Unlock()
	}

	return affected, nil
}

func (svc *alertsRepository) GetPendingAlertsBySymbol(ctx context.Context, symbol string) ([]models.Alert, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))

	if !cacheInitialized {
		if err := initializeCache(ctx, svc.db); err != nil {
			return nil, err
		}
	}

	alertsCacheMu.RLock()
	defer alertsCacheMu.RUnlock()

	cached := alertsCache[symbol]
	result := make([]models.Alert, len(cached))
	copy(result, cached)
	return result, nil
}

func (svc *alertsRepository) GetAlertsByRequester(ctx context.Context, requester string) ([]models.Alert, error) {
	if svc.db == nil {
		return []models.Alert{}, nil
	}

	q := mysql.Select(
		sm.Columns("*"),
		sm.From("alerts"),
		sm.Where(mysql.Quote("requester").EQ(mysql.Arg(requester))),
		sm.Where(mysql.Quote("notification_status").In(mysql.Arg("PENDING"), mysql.Arg("TRIGGERED"))),
		sm.OrderBy("created_at").Desc(),
	)

	alerts, err := bob.All(ctx, svc.db, q, scan.StructMapper[models.Alert]())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query alerts: %w", err)
	}

	return alerts, nil
}

func (svc *alertsRepository) GetAlertByID(ctx context.Context, id int) (*models.Alert, error) {
	if svc.db == nil {
		return nil, fmt.Errorf("Database is not initialized")
	}

	q := mysql.Select(
		sm.Columns("*"),
		sm.From("alerts"),
		sm.Where(mysql.Quote("id").EQ(mysql.Arg(id))),
	)

	alert, err := bob.One(ctx, svc.db, q, scan.StructMapper[models.Alert]())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query alert by id: %w", err)
	}

	return &alert, nil
}

func (svc *alertsRepository) GetAlertByDetails(ctx context.Context, requester, symbol string, priceTrigger float64) (*models.Alert, error) {
	if svc.db == nil {
		return nil, fmt.Errorf("Database is not initialized")
	}

	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	requester = strings.TrimSpace(requester)

	q := mysql.Select(
		sm.Columns("*"),
		sm.From("alerts"),
		sm.Where(mysql.Quote("requester").EQ(mysql.Arg(requester))),
		sm.Where(mysql.Quote("symbol").EQ(mysql.Arg(symbol))),
		sm.Where(mysql.Quote("price_trigger").EQ(mysql.Arg(priceTrigger))),
		sm.OrderBy("created_at").Desc(),
		sm.Limit(1),
	)

	alert, err := bob.One(ctx, svc.db, q, scan.StructMapper[models.Alert]())
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query alert by details: %w", err)
	}

	return &alert, nil
}
