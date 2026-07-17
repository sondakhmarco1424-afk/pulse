package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"pulse/internal/app"
	"pulse/internal/config"
	"pulse/internal/models"
	"pulse/internal/repository"
	"strconv"
	"strings"
)

type GoLiveChecker interface {
	Start(ctx context.Context) error
}

type goLiveChecker struct {
}

func NewGoLiveChecker() GoLiveChecker {
	return &goLiveChecker{}
}

func (c *goLiveChecker) Start(ctx context.Context) error {
	redisRepo := repository.NewRedisRepository()
	defer redisRepo.Close()

	alertsRepo := repository.NewAlertsRepository()

	slog.Info("Starting GoLiveChecker alert evaluation background worker...")
	pubSub := redisRepo.PSubscribe(ctx, "binance:*:ticker")
	defer pubSub.Close()

	ch := pubSub.Channel()

	for {
		select {
		case <-ctx.Done():
			slog.Info("GoLiveChecker worker shutting down...")
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				slog.Error("Redis PubSub channel closed in checker")
				return fmt.Errorf("redis pubsub channel closed")
			}

			go c.evaluateTick(ctx, msg.Payload, alertsRepo)
		}
	}
}

func (c *goLiveChecker) evaluateTick(ctx context.Context, payload string, alertsRepo repository.AlertsRepository) {
	var ticker models.BinanceTickerRaw
	if err := json.Unmarshal([]byte(payload), &ticker); err != nil {
		slog.Error("Failed to unmarshal ticker payload in checker", "error", err)
		return
	}

	symbol := strings.ToUpper(ticker.Symbol)
	currentPrice, err := strconv.ParseFloat(ticker.LastPrice, 64)
	if err != nil || currentPrice <= 0 {
		return
	}

	// Fetch all pending alerts for this symbol
	alerts, err := alertsRepo.GetPendingAlertsBySymbol(ctx, symbol)
	if err != nil {
		slog.Error("Failed to query pending alerts for symbol", "symbol", symbol, "error", err)
		return
	}

	if len(alerts) == 0 {
		return
	}

	for _, alert := range alerts {
		triggered := false

		if alert.TriggerDirection == "ABOVE" && currentPrice >= alert.PriceTrigger {
			triggered = true
		} else if alert.TriggerDirection == "BELOW" && currentPrice <= alert.PriceTrigger {
			triggered = true
		}

		if triggered {
			// Perform atomic update in DB - only 1 worker gets rows affected = 1
			if alert.NotificationStatus != "PENDING" {
				continue
			}
			affected, err := alertsRepo.UpdateAlertStatus(ctx, alert.ID, "TRIGGERED", currentPrice, nil)
			if err != nil {
				slog.Error("Failed to atomically update alert status", "alert_id", alert.ID, "error", err)
				continue
			}

			if affected == 1 {
				slog.Info("Alert triggered successfully!", "alert_id", alert.ID, "symbol", symbol, "target", alert.PriceTrigger, "current", currentPrice)

				// Construct the notification text: "The currency {symbol} is currently {ABOVE/BELOW} {price}"
				bodyText := fmt.Sprintf("The currency %s is currently %s %.2f", symbol, alert.TriggerDirection, currentPrice)

				// Build the AlertsKafkaPayload matching model
				kafkaPayload := models.AlertsKafkaPayload{
					EventType:   "ALERTS_PRICE_NOTIFICATION",
					TargetEmail: alert.Requester,
					Data: map[string]string{
						"title":  "Price Alert Triggered",
						"body":   bodyText,
						"symbol": symbol,
						"price":  fmt.Sprintf("%.2f", currentPrice),
					},
				}

				// Publish to Kafka notifications topic
				producer, err := app.NewKafkaProducer(app.ProducerKafkaConfigMap())
				if err != nil {
					slog.Error("Failed to create Kafka producer to dispatch notification", "error", err)
					continue
				}

				msgBytes, err := json.Marshal(kafkaPayload)
				if err != nil {
					slog.Error("Failed to marshal Kafka notification payload", "error", err)
					continue
				}

				err = producer.SyncMessage(config.Kafka.FCMNotificationsTopic, string(msgBytes))
				if err != nil {
					slog.Error("Failed to publish notification payload to Kafka", "error", err)
				} else {
					slog.Info("Dispatched alert notification to Kafka topic", "topic", config.Kafka.FCMNotificationsTopic, "alert_id", alert.ID)
				}
			}
		}
	}
}
