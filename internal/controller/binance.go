package controller

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"pulse/internal/repository"

	"github.com/gin-gonic/gin"
)

type (
	BinanceController interface {
		GetSubscribedSymbolsHistory(ctx *gin.Context)
		GetStatus(ctx *gin.Context)
	}
	binanceController struct {
	}
)

func NewBinanceController() BinanceController {
	return &binanceController{}
}

// GetStatus godoc
// @Summary Get current Binance WebSocket connection status
// @Description Returns whether the Go backend is currently connected to Binance WebSocket.
// @Tags Binance
// @Produce json
// @Success 200 {object} map[string]bool "Connection status"
// @Router /binance/status [get]
func (c *binanceController) GetStatus(ctx *gin.Context) {
	binanceRepo := repository.NewBinanceRepository()
	ctx.JSON(http.StatusOK, gin.H{"connected": binanceRepo.IsConnected()})
}

// GetSubscribedSymbolsHistory godoc
// @Summary Get price history of subscribed symbols
// @Description Fetches recent price tick history (up to 100 entries per symbol) from Redis cache for graphs.
// @Tags Binance
// @Produce json
// @Success 200 {object} map[string][]interface{} "A map of symbol to their historic tick array"
// @Failure 500 {object} map[string]string "Error message"
// @Router /binance/history [get]
func (c *binanceController) GetSubscribedSymbolsHistory(ctx *gin.Context) {
	redisRepo := repository.NewRedisRepository()
	defer redisRepo.Close()

	symbols := []string{"BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"}
	historyMap := make(map[string][]interface{})

	for _, s := range symbols {
		key := fmt.Sprintf("binance:%s:history", s)
		rawTicks, err := redisRepo.LRange(ctx.Request.Context(), key, 0, -1)
		if err != nil {
			slog.Error("Failed to fetch history from Redis", "symbol", s, "error", err)
			continue
		}

		parsedTicks := make([]interface{}, 0, len(rawTicks))
		for _, tickStr := range rawTicks {
			var parsed map[string]interface{}
			if err := json.Unmarshal([]byte(tickStr), &parsed); err == nil {
				parsedTicks = append(parsedTicks, parsed)
			} else {
				parsedTicks = append(parsedTicks, tickStr)
			}
		}
		historyMap[s] = parsedTicks
	}

	ctx.JSON(http.StatusOK, historyMap)
}
