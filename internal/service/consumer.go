package service

import (
	"context"
	"fmt"
	"log/slog"
	"pulse/internal/app"
	"pulse/internal/config"
)

type NotificationConsumer interface {
	Start(ctx context.Context) error
}

type notificationConsumer struct {
}

func NewNotificationConsumer() NotificationConsumer {
	return &notificationConsumer{}
}

func (c *notificationConsumer) Start(ctx context.Context) error {
	if config.Kafka == nil || len(config.Kafka.Brokers) == 0 {
		slog.Warn("Kafka config not loaded, skipping consumer start")
		return nil
	}

	consumer, err := app.NewKafkaConsumer(app.DefaultKafkaConfigMap("pulse-notification-group"))
	if err != nil {
		return fmt.Errorf("failed to create kafka consumer: %w", err)
	}

	notificationSvc := NewFCMNotificationService()

	consumer.Subscribe(config.Kafka.FCMNotificationsTopic, func(ctx context.Context, data []byte) error {
		slog.Info("Received notification event from Kafka. Emitting notification...")
		success := notificationSvc.KafkaSendFCMNotification(ctx, data)
		if !success {
			return fmt.Errorf("failed to process and send FCM notification")
		}
		return nil
	})

	return consumer.Start(ctx)
}
