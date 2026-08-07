package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/mail"
	"pulse/internal/app"
	"pulse/internal/config"
	"pulse/internal/models"
	"pulse/internal/repository"
	"strconv"
	"strings"
)

type (
	AlertsService interface {
		CreateAlert(ctx context.Context, data models.AlertsRequestRaw) (*models.Alert, error)
		CancelAlert(ctx context.Context, data models.AlertsRequestRaw) error
		GetAlertsByRequester(ctx context.Context, requester string) ([]models.Alert, error)
	}
	alertsService struct {
	}
)

func NewAlertsService() AlertsService {
	return &alertsService{}
}

func (svc *alertsService) CreateAlert(ctx context.Context, data models.AlertsRequestRaw) (*models.Alert, error) {
	alertsRepo := repository.NewAlertsRepository()

	// 1. Inputs validation
	requester := strings.TrimSpace(data.Requester)
	if requester == "" {
		return nil, fmt.Errorf("requester email is required")
	}
	if _, err := mail.ParseAddress(requester); err != nil {
		return nil, fmt.Errorf("invalid requester email format: %w", err)
	}

	symbol := strings.ToUpper(strings.TrimSpace(data.Symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}

	priceTrigger, err := strconv.ParseFloat(data.Price, 64)
	if err != nil || priceTrigger <= 0 {
		return nil, fmt.Errorf("invalid price trigger: %s", data.Price)
	}

	triggerDirection := strings.ToUpper(strings.TrimSpace(data.TriggerDirection))
	if triggerDirection != "ABOVE" && triggerDirection != "BELOW" {
		return nil, fmt.Errorf("invalid trigger direction: %s", data.TriggerDirection)
	}

	// 2. Binance Connection Check (Enforced in production environment)
	binanceRepo := repository.NewBinanceRepository()
	if !binanceRepo.IsConnected() && config.App.Env == "production" {
		return nil, fmt.Errorf("cannot connect to Binance: creating alerts and sending notifications is disabled")
	}

	// 2. Pre-check: Verify no existing active (PENDING) alerts for this symbol + requester
	// Leverage modular design: retrieve from repo, then run condition checks in the service
	existing, err := alertsRepo.GetPendingAlerts(ctx, requester, symbol)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing alerts: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("an active alert already exists for requester %s and symbol %s", requester, symbol)
	}

	// 3. Build and save Alert
	alert := &models.Alert{
		Requester:          requester,
		Symbol:             symbol,
		PriceTrigger:       priceTrigger,
		NotificationStatus: "PENDING",
		TriggerDirection:   triggerDirection,
		AppOrigin:          strings.TrimSpace(data.AppOrigin),
	}

	if err := alertsRepo.CreateAlert(ctx, alert); err != nil {
		return nil, fmt.Errorf("failed to create alert in repository: %w", err)
	}

	// 6. Send alert request event to Kafka using singleton producer
	producer, err := app.GetKafkaProducer()
	if err == nil {
		payload, err := json.Marshal(alert)
		if err == nil {
			_ = producer.SyncMessage("alerts-trigger", string(payload))
		}
	}

	return alert, nil
}

func (svc *alertsService) CancelAlert(ctx context.Context, data models.AlertsRequestRaw) error {
	alertsRepo := repository.NewAlertsRepository()

	// 1. Inputs validation
	requester := strings.TrimSpace(data.Requester)
	if requester == "" {
		return fmt.Errorf("requester email is required")
	}

	var alertID int
	var err error
	if data.ID != "" {
		alertID, err = strconv.Atoi(data.ID)
		if err != nil {
			return fmt.Errorf("invalid alert id: %s", data.ID)
		}
	}

	var alert *models.Alert
	if alertID > 0 {
		// Fetch by ID
		alert, err = alertsRepo.GetAlertByID(ctx, alertID)
		if err != nil {
			return fmt.Errorf("failed to fetch alert by id: %w", err)
		}
	} else {
		// Fallback to fetch by requester, symbol, and price trigger
		symbol := strings.ToUpper(strings.TrimSpace(data.Symbol))
		if symbol == "" {
			return fmt.Errorf("symbol is required")
		}

		priceTrigger, err := strconv.ParseFloat(data.Price, 64)
		if err != nil || priceTrigger <= 0 {
			return fmt.Errorf("invalid price trigger: %s", data.Price)
		}

		// Find any alert for this requester/symbol/price
		alert, err = alertsRepo.GetAlertByDetails(ctx, requester, symbol, priceTrigger)
		if err != nil {
			return fmt.Errorf("failed to check existing alerts: %w", err)
		}
	}

	if alert == nil {
		return fmt.Errorf("alert not found")
	}

	if alert.NotificationStatus != "PENDING" {
		return nil
	}
	// 4. Update alert status to CANCELLED in DB & cache
	affected, err := alertsRepo.UpdateAlertStatus(ctx, alert.ID, "CANCELLED", 0, nil)
	if err != nil {
		return fmt.Errorf("failed to cancel alert: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("no alert was cancelled")
	}

	return nil
}

func (svc *alertsService) GetAlertsByRequester(ctx context.Context, requester string) ([]models.Alert, error) {
	requester = strings.TrimSpace(requester)
	if requester == "" {
		return nil, fmt.Errorf("requester email is required")
	}

	alertsRepo := repository.NewAlertsRepository()
	return alertsRepo.GetAlertsByRequester(ctx, requester)
}
