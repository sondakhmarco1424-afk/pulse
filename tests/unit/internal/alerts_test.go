package tests

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"pulse/internal/config"
	"pulse/internal/models"
	routers "pulse/internal/router"
	"pulse/internal/service"
)

type mockClient struct {
	conn       net.Conn
	subType    string // "SUBSCRIBE" or "PSUBSCRIBE"
	subChannel string
}

// SimpleMockRedis represents a lightweight RESP mock server.
type SimpleMockRedis struct {
	listener net.Listener
	addr     string
	port     int
	mu       sync.Mutex
	clients  []*mockClient
	conns    []net.Conn
}

func NewSimpleMockRedis(t *testing.T) *SimpleMockRedis {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start mock redis listener: %v", err)
	}
	_, portStr, _ := net.SplitHostPort(l.Addr().String())
	port, _ := strconv.Atoi(portStr)

	mr := &SimpleMockRedis{
		listener: l,
		addr:     "127.0.0.1",
		port:     port,
	}

	go mr.acceptLoop(t)
	return mr
}

func (mr *SimpleMockRedis) acceptLoop(t *testing.T) {
	for {
		conn, err := mr.listener.Accept()
		if err != nil {
			return
		}
		mr.mu.Lock()
		mr.conns = append(mr.conns, conn)
		mr.mu.Unlock()
		go mr.handleConn(conn, t)
	}
}

func (mr *SimpleMockRedis) handleConn(conn net.Conn, t *testing.T) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Logf("mock Redis connection read error: %v", err)
			return
		}
		line = strings.TrimSpace(line)
		t.Logf("mock Redis received raw line: %s", line)

		if strings.HasPrefix(line, "*") {
			numTokens, _ := strconv.Atoi(line[1:])
			tokens := make([]string, numTokens)
			for i := 0; i < numTokens; i++ {
				lenLine, err := reader.ReadString('\n')
				if err != nil {
					t.Logf("mock Redis token len read error: %v", err)
					return
				}
				lenLine = strings.TrimSpace(lenLine)
				t.Logf("mock Redis raw token len: %s", lenLine)
				if !strings.HasPrefix(lenLine, "$") {
					continue
				}
				tokenLen, _ := strconv.Atoi(lenLine[1:])
				
				buf := make([]byte, tokenLen+2)
				_, err = reader.Read(buf)
				if err != nil {
					t.Logf("mock Redis token data read error: %v", err)
					return
				}
				tokens[i] = string(buf[:tokenLen])
			}

			t.Logf("mock Redis parsed tokens: %v", tokens)

			if len(tokens) > 0 {
				cmd := strings.ToUpper(tokens[0])
				if cmd == "SUBSCRIBE" || cmd == "PSUBSCRIBE" {
					channel := tokens[1]
					mr.mu.Lock()
					mr.clients = append(mr.clients, &mockClient{
						conn:       conn,
						subType:    cmd,
						subChannel: channel,
					})
					mr.mu.Unlock()

					resp := fmt.Sprintf("*3\r\n$9\r\nsubscribe\r\n$%d\r\n%s\r\n:1\r\n", len(channel), channel)
					conn.Write([]byte(resp))
					t.Logf("mock Redis responded to subscribe: %s", channel)
				} else if cmd == "PING" {
					conn.Write([]byte("+PONG\r\n"))
				} else if cmd == "AUTH" {
					conn.Write([]byte("+OK\r\n"))
				} else if cmd == "HELLO" {
					conn.Write([]byte("-ERR unknown command 'hello'\r\n"))
				} else {
					conn.Write([]byte("+OK\r\n"))
				}
			}
		}
	}
}

func (mr *SimpleMockRedis) Publish(channel string, message string) {
	mr.mu.Lock()
	defer mr.mu.Unlock()
	for _, client := range mr.clients {
		match := false
		if client.subType == "SUBSCRIBE" {
			match = (client.subChannel == channel)
		} else if client.subType == "PSUBSCRIBE" {
			if strings.HasSuffix(client.subChannel, "*") {
				prefix := client.subChannel[:len(client.subChannel)-1]
				match = strings.HasPrefix(channel, prefix)
			} else {
				match = (client.subChannel == channel)
			}
		}

		if match {
			var resp string
			if client.subType == "PSUBSCRIBE" {
				resp = fmt.Sprintf("*4\r\n$8\r\npmessage\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
					len(client.subChannel), client.subChannel,
					len(channel), channel,
					len(message), message)
			} else {
				resp = fmt.Sprintf("*3\r\n$7\r\nmessage\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
					len(client.subChannel), client.subChannel,
					len(message), message)
			}
			client.conn.Write([]byte(resp))
		}
	}
}

func (mr *SimpleMockRedis) Close() {
	mr.listener.Close()
	mr.mu.Lock()
	defer mr.mu.Unlock()
	for _, conn := range mr.conns {
		conn.Close()
	}
}

// TestGetAlertsFlow tests that the new REST API endpoint for fetching alerts behaves as expected.
func TestGetAlertsFlow(t *testing.T) {
	// Initialize configuration
	config.Setup("../../../internal/config/config.yml")


	// Spin up test server with our gin router
	router := routers.Init()
	ts := httptest.NewServer(router)
	defer ts.Close()

	// Make HTTP GET request to /api/v1/alerts without a requester
	resp, err := http.Get(ts.URL + "/api/v1/alerts")
	if err != nil {
		t.Fatalf("failed to make HTTP request: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected status 400 Bad Request when requester query param is missing, got %v", resp.StatusCode)
	}

	// Make HTTP GET request to /api/v1/alerts with a requester
	resp, err = http.Get(ts.URL + "/api/v1/alerts?requester=test@example.com")
	if err != nil {
		t.Fatalf("failed to make HTTP request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200 OK, got %v", resp.StatusCode)
	}
}

// TestCreateAlertValidation tests the service-level inputs validation, specifically empty or invalid email formatting.
func TestCreateAlertValidation(t *testing.T) {
	// Initialize configuration
	config.Setup("../../../internal/config/config.yml")

	svc := service.NewAlertsService()
	ctx := context.Background()

	// 1. Test empty email
	_, err := svc.CreateAlert(ctx, models.AlertsRequestRaw{
		Requester:        "",
		Symbol:           "BTCUSDT",
		Price:            "100.0",
		TriggerDirection: "ABOVE",
	})
	if err == nil || !strings.Contains(err.Error(), "requester email is required") {
		t.Errorf("expected empty email error, got %v", err)
	}

	// 2. Test invalid email format
	_, err = svc.CreateAlert(ctx, models.AlertsRequestRaw{
		Requester:        "not-an-email",
		Symbol:           "BTCUSDT",
		Price:            "100.0",
		TriggerDirection: "ABOVE",
	})
	if err == nil || !strings.Contains(err.Error(), "invalid requester email format") {
		t.Errorf("expected invalid email format error, got %v", err)
	}

	// 3. Test Binance disconnected error
	_, err = svc.CreateAlert(ctx, models.AlertsRequestRaw{
		Requester:        "user@example.com",
		Symbol:           "BTCUSDT",
		Price:            "100.0",
		TriggerDirection: "ABOVE",
	})
	if err == nil || !strings.Contains(err.Error(), "cannot connect to Binance") {
		t.Errorf("expected cannot connect to Binance error when disconnected, got %v", err)
	}
}

