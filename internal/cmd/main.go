// @title Pulse Real-Time Crypto Alert Engine API
// @version 1.0
// @description This is the API server for the Pulse Real-Time Crypto Alert Aggregation Engine.
// @termsOfService http://swagger.io/terms/
// @host localhost:8081
// @BasePath /api/v1
package main

import (
	"context"
	"fmt"
	"log/slog"
	"pulse/internal/app"
	"pulse/internal/config"
	"pulse/internal/repository"
	routers "pulse/internal/router"
	"pulse/internal/service"
	"time"

	"github.com/gin-gonic/gin"
)

func binanceInit() {
	binance_repo := repository.NewBinanceRepository()
	binance_repo.ConnectWs()
}

func main() {
	slog.Info("Server is starting ...")

	// Initialize configuration
	config.Setup("internal/config/config.yml")

	// Enable debug mode only when needed
	gin.SetMode(gin.DebugMode)
	slog.SetLogLoggerLevel(slog.LevelDebug)
	slog.Debug("Program Run in Debug Mode")

	// 1. Initialize MySQL DB pool
	if err := app.InitDB(); err != nil {
		slog.Error("Database connection initialization failed", "error", err)
		panic(err)
	}

	// 2. Start Binance Websocket stream connection
	go func() {
		retryDelay := 5 * time.Second
		if config.Binance.ReconnectDelaySeconds > 0 {
			retryDelay = time.Duration(config.Binance.ReconnectDelaySeconds) * time.Second
		}
		for {
			slog.Info("Initializing Binance WebSocket...")
			binanceInit()
			slog.Warn("Binance WebSocket disconnected; reconnecting", "retry_in", retryDelay)
			time.Sleep(retryDelay)
		}
	}()

	// 3. Start GoLive Checker background evaluation worker
	goLiveWorker := service.NewGoLiveChecker()
	go func() {
		if err := goLiveWorker.Start(context.Background()); err != nil {
			slog.Error("GoLive Checker failed", "error", err)
		}
	}()

	// 4. Start Kafka notification consumer
	notificationConsumer := service.NewNotificationConsumer()
	go func() {
		if err := notificationConsumer.Start(context.Background()); err != nil {
			slog.Error("Kafka notification consumer failed", "error", err)
		}
	}()

	http_handler := routers.Init()

	err := http_handler.Run(fmt.Sprintf(":%d", config.Server.Port))

	if err != nil {
		slog.Error("Server ended with error: " + err.Error())
	}
}
