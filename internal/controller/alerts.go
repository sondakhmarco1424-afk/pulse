package controller

import (
	"log/slog"
	"net/http"
	"pulse/internal/models"
	"pulse/internal/service"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

type (
	AlertController interface {
		GetAlerts(ctx *gin.Context)
		CreateAlert(ctx *gin.Context)
		CancelAlert(ctx *gin.Context)
		SubscribeFCM(ctx *gin.Context)
	}
	alertController struct {
	}
)

func NewAlertController() AlertController {
	return &alertController{}
}

// GetAlerts godoc
// @Summary List alerts for a user
// @Description Retrieves all price alerts (both pending and triggered) for a user based on requester email.
// @Tags Alerts
// @Accept json
// @Produce json
// @Param requester query string true "Requester Email"
// @Success 200 {array} models.Alert "List of alerts retrieved successfully"
// @Failure 400 {object} map[string]string "Bad Request (e.g. Missing requester)"
// @Failure 500 {object} map[string]string "Internal Server Error"
// @Router /alerts [get]
func (svc *alertController) GetAlerts(ctx *gin.Context) {
	var requester string
	if val, exists := ctx.Get("requester_email"); exists {
		requester = val.(string)
	} else {
		requester = strings.TrimSpace(ctx.Query("requester"))
	}

	if requester == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "requester identifier is required"})
		return
	}

	alertsService := service.NewAlertsService()
	alerts, err := alertsService.GetAlertsByRequester(ctx.Request.Context(), requester)
	if err != nil {
		slog.Error("Failed to fetch alerts by requester", "error", err, "requester", requester)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}

	ctx.JSON(http.StatusOK, alerts)
}

// CreateAlert godoc
// @Summary Create a price alert
// @Description Creates a new pending price alert for a user, validating that no pending alerts already exist for the symbol.
// @Tags Alerts
// @Accept json
// @Produce json
// @Param request body models.AlertsRequestRaw true "Alert Creation Request Details"
// @Success 201 {object} models.Alert "Alert created successfully"
// @Failure 400 {object} map[string]string "Bad Request (e.g. Validation or duplicates)"
// @Failure 500 {object} map[string]string "Internal Server Error"
// @Router /alerts/create [post]
func (svc *alertController) CreateAlert(ctx *gin.Context) {
	var request models.AlertsRequestRaw
	if err := ctx.ShouldBindBodyWith(&request, binding.JSON); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	if val, exists := ctx.Get("requester_email"); exists {
		request.Requester = val.(string)
	}

	alertsService := service.NewAlertsService()
	alert, err := alertsService.CreateAlert(ctx.Request.Context(), request)
	if err != nil {
		slog.Error("Failed to create alert", "error", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusCreated, alert)
}

// CancelAlert godoc
// @Summary Cancel an active price alert
// @Description Cancels a pending price alert for a user based on requester, symbol, and price.
// @Tags Alerts
// @Accept json
// @Produce json
// @Param request body models.AlertsRequestRaw true "Alert Cancellation Request Details"
// @Success 200 {object} map[string]string "Alert cancelled successfully"
// @Failure 400 {object} map[string]string "Bad Request (e.g. Validation or not found)"
// @Failure 500 {object} map[string]string "Internal Server Error"
// @Router /alerts/cancel [post]
func (svc *alertController) CancelAlert(ctx *gin.Context) {
	var request models.AlertsRequestRaw
	if err := ctx.ShouldBindBodyWith(&request, binding.JSON); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	if val, exists := ctx.Get("requester_email"); exists {
		request.Requester = val.(string)
	}

	alertsService := service.NewAlertsService()
	err := alertsService.CancelAlert(ctx.Request.Context(), request)
	if err != nil {
		slog.Error("Failed to cancel alert", "error", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Alert cancelled successfully"})
}

// SubscribeFCM godoc
// @Summary Subscribe FCM token to user topic
// @Description Subscribes a client's FCM device token to their personal notification topic.
// @Tags Alerts
// @Accept json
// @Produce json
// @Param request body models.FCMSubscribeRequest true "FCM Subscription Request Details"
// @Success 200 {object} map[string]string "Subscribed successfully"
// @Failure 400 {object} map[string]string "Bad Request"
// @Failure 500 {object} map[string]string "Internal Server Error"
// @Router /fcm/subscribe [post]
func (svc *alertController) SubscribeFCM(ctx *gin.Context) {
	var request models.FCMSubscribeRequest
	if err := ctx.ShouldBindBodyWith(&request, binding.JSON); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload: " + err.Error()})
		return
	}

	if request.Email == "" {
		if val, exists := ctx.Get("requester_email"); exists {
			if emailStr, ok := val.(string); ok && emailStr != "" {
				request.Email = emailStr
			}
		}
	}

	fcmService := service.NewFCMNotificationService()
	err := fcmService.Subscribe(ctx.Request.Context(), request.Token, request.Email)
	if err != nil {
		slog.Error("Failed to subscribe FCM token", "error", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Subscribed successfully"})
}
