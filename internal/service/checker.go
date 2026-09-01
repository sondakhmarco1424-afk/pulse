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
	"time"
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
	alertsRepo := repository.NewAlertsRepository()
	minDelay := retryDuration(config.Redis.ReconnectMinSeconds, time.Second)
	maxDelay := retryDuration(config.Redis.ReconnectMaxSeconds, 30*time.Second)
	if maxDelay < minDelay {
		maxDelay = minDelay
	}
	retryDelay := minDelay

	for {
		if err := ctx.Err(); err != nil {
			slog.Info("GoLiveChecker worker shutting down...")
			return err
		}

		redisRepo := repository.NewRedisRepository()
		if err := redisRepo.Ping(ctx); err != nil {
			_ = redisRepo.Close()
			slog.Warn("Redis is unavailable; alert checker will retry", "error", err, "retry_in", retryDelay)
			if !waitForRetry(ctx, retryDelay) {
				return ctx.Err()
			}
			retryDelay = nextRetryDelay(retryDelay, maxDelay)
			continue
		}

		pubSub := redisRepo.PSubscribe(ctx, "binance:*:ticker")
		if _, err := pubSub.Receive(ctx); err != nil {
			_ = pubSub.Close()
			_ = redisRepo.Close()
			slog.Warn("Failed to subscribe alert checker to Redis; retrying", "error", err, "retry_in", retryDelay)
			if !waitForRetry(ctx, retryDelay) {
				return ctx.Err()
			}
			retryDelay = nextRetryDelay(retryDelay, maxDelay)
			continue
		}

		slog.Info("GoLiveChecker subscribed to Redis price ticks")
		retryDelay = minDelay
		ch := pubSub.Channel()
		connectionLost := false

		for !connectionLost {
			select {
			case <-ctx.Done():
				_ = pubSub.Close()
				_ = redisRepo.Close()
				slog.Info("GoLiveChecker worker shutting down...")
				return ctx.Err()
			case msg, ok := <-ch:
				if !ok {
					connectionLost = true
					continue
				}
				c.evaluateTick(ctx, msg.Payload, alertsRepo)
			}
		}

		_ = pubSub.Close()
		_ = redisRepo.Close()
		slog.Warn("Redis PubSub channel closed; alert checker will reconnect", "retry_in", retryDelay)
		if !waitForRetry(ctx, retryDelay) {
			return ctx.Err()
		}
		retryDelay = nextRetryDelay(retryDelay, maxDelay)
	}
}

func retryDuration(seconds int, fallback time.Duration) time.Duration {
	if seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func waitForRetry(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func nextRetryDelay(current, maximum time.Duration) time.Duration {
	next := current * 2
	if next > maximum {
		return maximum
	}
	return next
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
						"title":      "Price Alert Triggered",
						"body":       bodyText,
						"symbol":     symbol,
						"price":      fmt.Sprintf("%.2f", currentPrice),
						"app_origin": alert.AppOrigin,
					},
				}

				// Publish to Kafka notifications topic using singleton producer
				fcmSvc := NewFCMNotificationService()
				producer, err := app.GetKafkaProducer()
				if err != nil {
					slog.Error("Failed to get Kafka producer, sending notification directly via FCM", "error", err)
					if sendErr := fcmSvc.Send(ctx, kafkaPayload); sendErr != nil {
						slog.Error("Direct FCM fallback failed", "error", sendErr)
					} else {
						slog.Info("Dispatched alert notification directly via FCM fallback", "alert_id", alert.ID)
					}
					continue
				}

				msgBytes, err := json.Marshal(kafkaPayload)
				if err != nil {
					slog.Error("Failed to marshal Kafka notification payload", "error", err)
					continue
				}

				err = producer.SyncMessage(config.Kafka.FCMNotificationsTopic, string(msgBytes))
				if err != nil {
					slog.Error("Failed to publish notification payload to Kafka, falling back to direct FCM", "error", err)
					if sendErr := fcmSvc.Send(ctx, kafkaPayload); sendErr != nil {
						slog.Error("Direct FCM fallback failed", "error", sendErr)
					} else {
						slog.Info("Dispatched alert notification directly via FCM fallback", "alert_id", alert.ID)
					}
				} else {
					slog.Info("Dispatched alert notification to Kafka topic", "topic", config.Kafka.FCMNotificationsTopic, "alert_id", alert.ID)
				}
			}
		}
	}
}
