package tests

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"pulse/internal/models"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestGetBinanceDataMock spins up a local mock server to simulate the Binance WebSocket stream.
// Use this to debug/test the logic of your handler completely offline.
func TestGetBinanceDataMock(t *testing.T) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	// 1. Create a local mock WebSocket server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Error("Failed to upgrade connection to WebSocket", "error", err)
			return
		}
		defer conn.Close()

		// Send mock Binance trade messages
		mockMessages := []string{
			`{"e":"aggTrade","E":1776009536848,"s":"BTCUSDT","a":3447953282,"p":"99478.43000000","q":"0.00539000","f":4043922906,"l":4043922906,"T":1776009536847,"m":false,"M":true}`,
			`{"e":"aggTrade","E":1776009536854,"s":"BTCUSDT","a":3447953283,"p":"99478.44000000","q":"0.00067000","f":4043922907,"l":4043922907,"T":1776009536853,"m":true,"M":true}`,
		}

		for i, msg := range mockMessages {
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
				slog.Error("Failed to write mock message", "error", err)
				return
			}
			slog.Info(fmt.Sprintf("Mock server sent message %d", i+1))
			time.Sleep(100 * time.Millisecond) // Simulating network delay
		}
	}))
	defer server.Close()

	// Convert http:// schema to ws:// schema for the mock server URL
	url := "ws" + server.URL[4:]

	headers := http.Header{}
	headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	dialer := websocket.Dialer{}
	conn, resp, err := dialer.Dial(url, headers)
	if err != nil {
		t.Fatalf("Failed to establish websocket connection to mock server: %v (HTTP Status: %v)", err, resp)
	}
	defer conn.Close()

	slog.Info("The Mock websocket connection has been established successfully")

	// Read and verify the messages
	for i := 0; i < 2; i++ {
		_, message, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("Failed to read message: %v", err)
		}

		// Print the raw JSON message to the console
		fmt.Printf("Mock Message %d Raw Payload:\n%s\n\n", i+1, string(message))

		// Parse the JSON into map[string]any to support various data types
		var messageData map[string]any
		if err := json.Unmarshal(message, &messageData); err != nil {
			t.Fatalf("Error: unable to parse message as JSON: %v", err)
		}

		slog.Info(fmt.Sprintf("Successfully parsed mock message %d", i+1), "data", messageData)
	}
}

// TestGetBinanceData (Original version connecting to external Binance endpoint)
func TestGetBinanceData(t *testing.T) {
	t.Skip("Skipping live connection test because network sandbox has no outbound internet access")

	// A valid stream URL is required (e.g., BTC/USDT aggregate trade stream)
	url := os.Getenv("BINANCE_WS_URL")
	if url == "" {
		t.Skip("BINANCE_WS_URL is not configured")
	}
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
		t.Fatalf("Failed to establish Binance websocket connection: %v (HTTP Status: %v)", err, resp)
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

	// Read 5 messages for manual verification, then stop
	for i := 0; i < 5; i++ {
		_, message, err := conn.ReadMessage()
		if err != nil {
			slog.Error(fmt.Sprintf("Disconnected from Binance websocket: %v", err))
			break
		}

		// Print the raw JSON message to the console
		fmt.Printf("Message %d Raw Payload:\n%s\n\n", i+1, string(message))

		// Parse the JSON into map[string]any to support various data types
		var messageData models.BinanceTickerRaw
		if err := json.Unmarshal(message, &messageData); err != nil {
			slog.Error(fmt.Sprintf("Error: unable to parse message as JSON: %v", err))
			continue
		}

		slog.Info(fmt.Sprintf("Successfully parsed message %d", i+1), "data", messageData)
	}
}
