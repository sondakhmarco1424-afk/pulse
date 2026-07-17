package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"pulse/internal/config"

	"github.com/gorilla/websocket"
)

type (
	BinanceRepository interface {
		ConnectWs()
	}
	binanceRepository struct {
	}
)

func NewBinanceRepository() BinanceRepository {
	return &binanceRepository{}
}

func (svc *binanceRepository) ConnectWs() {
	redis_repo := NewRedisRepository()
	defer redis_repo.Close()

	url := config.Binance.WsUrl
	headers := http.Header{}
	headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	// Force IPv4 (tcp4) to prevent timeouts if your ISP or local network has broken IPv6 routing
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		NetDial: func(network, addr string) (net.Conn, error) {
			return net.DialTimeout("tcp4", addr, 5*time.Second)
		},
	}

	slog.Info("Attempting to connect to Binance WebSocket...")
	conn, resp, err := dialer.Dial(url, headers)

	// Exit early if dialing fails to prevent nil pointer dereference
	if err != nil {
		slog.Error("Failed to establish Binance websocket connection", "error", err, "response", resp)
		return
	}
	defer conn.Close()

	subRequest := map[string]interface{}{
		"method": "SUBSCRIBE",
		"params": []string{
			"bnbusdt@ticker",
			"btcusdt@ticker",
			"ethusdt@ticker",
			"solusdt@ticker",
		},
		"id": 1,
	}

	if err := conn.WriteJSON(subRequest); err != nil {
		slog.Error("Failed to subscribe to streams", "error", err)
		return
	}

	slog.Info("The Binance websocket connection has been established successfully")

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			slog.Error(fmt.Sprintf("Disconnected from Binance websocket: %v", err))
			break
		}
		// Parse the JSON into map[string]any to support various data types
		var messageData map[string]interface{}
		if err := json.Unmarshal(message, &messageData); err != nil {
			slog.Error(fmt.Sprintf("Error: unable to parse message as JSON: %v", err))
			continue
		}

		// 1. Generate key
		var key string
		rawSymbol, exist := messageData["s"]
		if !exist || rawSymbol == nil {
			continue
		}
		key = fmt.Sprintf("binance:%v:ticker", rawSymbol)

		// 2. Marshal the map to JSON bytes before writing to Redis
		jsonBytes, err := json.Marshal(messageData)
		if err != nil {
			slog.Error(fmt.Sprintf("Failed to marshal message to JSON: %v", err))
			continue
		}

		// 3. Save to Redis
		err = redis_repo.RedisSet(key, nil, jsonBytes, 0)
		if err != nil {
			slog.Error(fmt.Sprintf("Failed to set data in Redis: %v", err))
		}

		// 3b. Save rolling history to Redis List
		historyKey := fmt.Sprintf("binance:%v:history", rawSymbol)
		err = redis_repo.LPushAndTrim(context.Background(), historyKey, jsonBytes, 100)
		if err != nil {
			slog.Error(fmt.Sprintf("Failed to store history in Redis: %v", err))
		}

		// 4. Publish to Redis channel
		err = redis_repo.PublishData(key, jsonBytes)
		if err != nil {
			slog.Error(fmt.Sprintf("Failed to publish data: %v", err))
		}
	}
}
