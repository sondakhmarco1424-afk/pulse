package repository

import (
	"context"
	"fmt"
	"log/slog"
	"pulse/internal/config"
	"time"

	"github.com/redis/go-redis/v9"
)

type (
	RedisRepository interface {
		RedisSet(string, *[]string, interface{}, time.Duration) error
		RedisGet(ctx context.Context, key string) (string, error)
		PublishData(string, interface{}) error
		Subscribe(context.Context, ...string) *redis.PubSub
		PSubscribe(context.Context, ...string) *redis.PubSub
		LPushAndTrim(context.Context, string, interface{}, int64) error
		LRange(context.Context, string, int64, int64) ([]string, error)
		Close() error
	}
	redisRepository struct {
		Client *redis.Client
	}
)

func NewRedisRepository() RedisRepository {
	client := Connect()
	return &redisRepository{
		Client: client,
	}
}

func Connect() *redis.Client {
	options := &redis.Options{
		Addr:     fmt.Sprintf("%s:%d", config.Redis.Host, config.Redis.Port),
		Password: config.Redis.Password,
		DB:       config.Redis.DB,
	}
	client := redis.NewClient(options)
	return client
}

func (repo *redisRepository) RedisSet(key string, index *[]string, value interface{}, expiration time.Duration) error {
	client := repo.Client

	err := client.Set(context.Background(), key, value, expiration).Err()
	if err != nil {
		slog.Error(fmt.Sprintf("Unable to SET data in Redis, error: %v", err))
		return err
	}
	if index != nil {
		for _, indexdata := range *index {
			slog.Debug(fmt.Sprintf("Set Index %s in key %s", indexdata, key))
			err = client.Set(context.Background(), indexdata, key, expiration).Err()
			if err != nil {
				slog.Error(fmt.Sprintf("Unable to SET index in Redis, error: %v", err))
				return err
			}
		}
	}

	return nil
}

func (repo *redisRepository) PublishData(channel string, data interface{}) error {
	client := repo.Client

	err := client.Publish(context.Background(), channel, data).Err()
	if err != nil {
		slog.Error(fmt.Sprintf("Error Publishing data : %v", err))
		return err
	}
	return nil
}

func (repo *redisRepository) Subscribe(ctx context.Context, channels ...string) *redis.PubSub {
	return repo.Client.Subscribe(ctx, channels...)
}

func (repo *redisRepository) PSubscribe(ctx context.Context, patterns ...string) *redis.PubSub {
	return repo.Client.PSubscribe(ctx, patterns...)
}

func (repo *redisRepository) LPushAndTrim(ctx context.Context, key string, value interface{}, size int64) error {
	client := repo.Client
	err := client.LPush(ctx, key, value).Err()
	if err != nil {
		return err
	}
	return client.LTrim(ctx, key, 0, size-1).Err()
}

func (repo *redisRepository) LRange(ctx context.Context, key string, start, stop int64) ([]string, error) {
	return repo.Client.LRange(ctx, key, start, stop).Result()
}

func (repo *redisRepository) RedisGet(ctx context.Context, key string) (string, error) {
	return repo.Client.Get(ctx, key).Result()
}

func (repo *redisRepository) Close() error {
	return repo.Client.Close()
}
