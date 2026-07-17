package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"pulse/internal/models"
	"pulse/internal/repository"

	"firebase.google.com/go/v4/messaging"
)

type (
	FCMNotificationService interface {
		KafkaSendFCMNotification(ctx context.Context, data []byte) bool
		Send(ctx context.Context, payload models.AlertsKafkaPayload) error
		Subscribe(ctx context.Context, token, email string) error
	}

	fcmNotificationService struct{}
)

func NewFCMNotificationService() FCMNotificationService {
	return &fcmNotificationService{}
}

func (svc *fcmNotificationService) KafkaSendFCMNotification(ctx context.Context, data []byte) bool {
	var payload models.AlertsKafkaPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		slog.Error("Failed to unmarshal Alerts notification payload", "error", err)
		return true
	}

	if err := svc.Send(ctx, payload); err != nil {
		slog.Error("Failed to send Alerts notification", "error", err)
		return false
	}

	return true
}

func (svc *fcmNotificationService) Send(ctx context.Context, payload models.AlertsKafkaPayload) error {
	firebaseRepo := repository.NewFirebaseRepository()

	topic := payload.TargetTopic
	if topic == nil || strings.TrimSpace(*topic) == "" {
		resolvedTopic := ResolveFCMTopic(payload.TargetEmail)
		topic = &resolvedTopic
	}

	if strings.TrimSpace(*topic) == "" {
		return fmt.Errorf("fcm target topic is empty")
	}

	client, err := firebaseRepo.MessagingClient(ctx)
	if err != nil {
		return err
	}

	out := make(map[string]string)

	for k, v := range payload.Data {
		out[k] = v
	}

	message := &messaging.Message{
		Topic: *topic,
		Data:  out,
	}

	payloadJson, _ := json.Marshal(message.Data)
	fmt.Printf("Alerts message payload: %s", string(payloadJson))

	response, err := client.Send(ctx, message)
	if err != nil {
		return err
	}

	fmt.Printf("Alerts data notification sent to topic %s with response %s", *topic, response)
	return nil
}

func ResolveFCMTopic(email string) string {
	email = strings.TrimSpace(email)
	if email != "" {
		return toTopicName(email)
	}
	return ""
}

func toTopicName(email string) string {
	topic := strings.ToLower(strings.TrimSpace(email))
	topic = strings.ReplaceAll(topic, "_", "_us_")
	topic = strings.ReplaceAll(topic, "+", "_pl_")
	topic = strings.ReplaceAll(topic, ".", "_dt_")
	topic = strings.ReplaceAll(topic, "@", "_at_")
	topic = strings.ReplaceAll(topic, "-", "_dh_")

	// Prepend "user_" and then collapse any consecutive underscores
	result := "user_" + topic
	for strings.Contains(result, "__") {
		result = strings.ReplaceAll(result, "__", "_")
	}
	return result
}

func (svc *fcmNotificationService) Subscribe(ctx context.Context, token, email string) error {
	firebaseRepo := repository.NewFirebaseRepository()
	client, err := firebaseRepo.MessagingClient(ctx)
	if err != nil {
		return err
	}

	topic := ResolveFCMTopic(email)
	if topic == "" {
		return fmt.Errorf("invalid email to resolve topic")
	}

	resp, err := client.SubscribeToTopic(ctx, []string{token}, topic)
	if err != nil {
		return fmt.Errorf("failed to subscribe token to topic: %w", err)
	}

	slog.Info("Successfully subscribed FCM token to topic", "email", email, "topic", topic, "success_count", resp.SuccessCount)
	return nil
}


