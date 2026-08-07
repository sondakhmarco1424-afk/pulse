package app

import (
	"context"
	"fmt"
	"log/slog"
	"pulse/internal/config"
	"sync"

	"github.com/segmentio/kafka-go"
)

type (
	fcmKafkaProducer interface {
		SyncMessage(topic string, message string) error
	}

	KafkaProducer struct {
		Writer *kafka.Writer
	}

	KafkaConsumer interface {
		Subscribe(topic string, handler func(ctx context.Context, data []byte) error)
		Start(ctx context.Context) error
		Close() error
	}

	kafkaConsumer struct {
		brokers       []string
		groupID       string
		subscriptions map[string]func(ctx context.Context, data []byte) error
		readers       []*kafka.Reader
		mu            sync.Mutex
		running       bool
	}
)

var (
	globalKafkaProducer fcmKafkaProducer
	kafkaProducerOnce   sync.Once
)

func ProducerKafkaConfigMap() map[string]interface{} {
	brokers := []string{}
	if config.Kafka != nil {
		brokers = config.Kafka.Brokers
	}
	return map[string]interface{}{
		"bootstrap.servers": brokers,
	}
}

func GetKafkaProducer() (fcmKafkaProducer, error) {
	var err error
	kafkaProducerOnce.Do(func() {
		globalKafkaProducer, err = NewKafkaProducer(ProducerKafkaConfigMap())
	})
	if err != nil {
		return nil, err
	}
	return globalKafkaProducer, nil
}

func NewKafkaProducer(configMap map[string]interface{}) (fcmKafkaProducer, error) {
	var brokers []string
	if val, ok := configMap["bootstrap.servers"]; ok {
		switch v := val.(type) {
		case []string:
			brokers = v
		case string:
			brokers = []string{v}
		}
	}

	if len(brokers) == 0 {
		if config.Kafka != nil {
			brokers = config.Kafka.Brokers
		}
	}

	if len(brokers) == 0 {
		return nil, fmt.Errorf("no kafka brokers configured")
	}

	w := &kafka.Writer{
		Addr:     kafka.TCP(brokers...),
		Balancer: &kafka.LeastBytes{},
	}

	return &KafkaProducer{
		Writer: w,
	}, nil
}

func (kp *KafkaProducer) SyncMessage(topic string, message string) error {
	err := kp.Writer.WriteMessages(context.Background(),
		kafka.Message{
			Topic: topic,
			Value: []byte(message),
		},
	)
	return err
}

func DefaultKafkaConfigMap(groupID string) map[string]interface{} {
	brokers := []string{}
	if config.Kafka != nil {
		brokers = config.Kafka.Brokers
	}
	return map[string]interface{}{
		"bootstrap.servers": brokers,
		"group.id":          groupID,
	}
}

func NewKafkaConsumer(configMap map[string]interface{}) (KafkaConsumer, error) {
	var brokers []string
	var groupID string

	if val, ok := configMap["bootstrap.servers"]; ok {
		switch v := val.(type) {
		case []string:
			brokers = v
		case string:
			brokers = []string{v}
		}
	}

	if val, ok := configMap["group.id"]; ok {
		if s, ok := val.(string); ok {
			groupID = s
		}
	}

	if len(brokers) == 0 && config.Kafka != nil {
		brokers = config.Kafka.Brokers
	}
	if len(brokers) == 0 {
		return nil, fmt.Errorf("no kafka brokers configured")
	}

	return &kafkaConsumer{
		brokers:       brokers,
		groupID:       groupID,
		subscriptions: make(map[string]func(ctx context.Context, data []byte) error),
	}, nil
}

func (kc *kafkaConsumer) Subscribe(topic string, handler func(ctx context.Context, data []byte) error) {
	kc.mu.Lock()
	defer kc.mu.Unlock()
	kc.subscriptions[topic] = handler
}

func (kc *kafkaConsumer) Start(ctx context.Context) error {
	kc.mu.Lock()
	if kc.running {
		kc.mu.Unlock()
		return fmt.Errorf("consumer is already running")
	}
	kc.running = true
	kc.mu.Unlock()

	var wg sync.WaitGroup
	errChan := make(chan error, len(kc.subscriptions))

	for topic, handler := range kc.subscriptions {
		readerConfig := kafka.ReaderConfig{
			Brokers:  kc.brokers,
			Topic:    topic,
			MinBytes: 10,
			MaxBytes: 10e6, // 10MB
		}
		if kc.groupID != "" {
			readerConfig.GroupID = kc.groupID
		}

		reader := kafka.NewReader(readerConfig)
		kc.mu.Lock()
		kc.readers = append(kc.readers, reader)
		kc.mu.Unlock()

		wg.Add(1)
		go func(t string, r *kafka.Reader, h func(context.Context, []byte) error) {
			defer wg.Done()
			slog.Info("Started reading from Kafka topic", "topic", t, "groupID", kc.groupID)
			for {
				select {
				case <-ctx.Done():
					slog.Info("Stopping consumer due to context cancellation", "topic", t)
					return
				default:
					msg, err := r.ReadMessage(ctx)
					if err != nil {
						if ctx.Err() != nil {
							return
						}
						slog.Error("Failed to read message from Kafka topic", "topic", t, "error", err)
						errChan <- err
						return
					}

					slog.Debug("Received Kafka message", "topic", t, "offset", msg.Offset)
					if err := h(ctx, msg.Value); err != nil {
						slog.Error("Handler error for Kafka topic", "topic", t, "error", err)
					}
				}
			}
		}(topic, reader, handler)
	}

	go func() {
		wg.Wait()
		close(errChan)
	}()

	select {
	case err := <-errChan:
		if err != nil {
			return err
		}
	case <-ctx.Done():
		return ctx.Err()
	}

	return nil
}

func (kc *kafkaConsumer) Close() error {
	kc.mu.Lock()
	defer kc.mu.Unlock()
	var firstErr error
	for _, reader := range kc.readers {
		if err := reader.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	kc.readers = nil
	kc.running = false
	return firstErr
}
