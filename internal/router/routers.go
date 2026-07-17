package routers

import (
	sentrygin "github.com/getsentry/sentry-go/gin"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"pulse/docs"
	"pulse/internal/config"
	"pulse/internal/controller"
	"pulse/internal/middleware"
)

func CORS() gin.HandlerFunc {
	// To allow CORS
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// InitRouter initialize routing information
func Init() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(CORS())

	if config.Sentry != nil && config.Sentry.Enabled {
		r.Use(sentrygin.New(sentrygin.Options{
			Repanic: true,
		}))
	}

	docs.SwaggerInfo.BasePath = "/api/v1"
	docs.SwaggerInfo.Host = config.Server.SwaggerPath
	docs.SwaggerInfo.Version = config.App.Version
	docs.SwaggerInfo.Schemes = []string{config.Server.SwaggerScheme}

	swaggerV1Handler := ginSwagger.WrapHandler(swaggerFiles.NewHandler())
	r.GET("/swagger/*any", func(c *gin.Context) {
		swaggerV1Handler(c)
	})

	v1ControllerAlerts := controller.NewAlertController()
	v1ControllerBinance := controller.NewBinanceController()

	apiv1 := r.Group("/api/v1")
	{
		uri := "/alerts"
		apiGroup := apiv1.Group(uri)
		{
			apiGroup.GET("", middleware.JWTAuthMiddleware(v1ControllerAlerts.GetAlerts))
			apiGroup.POST("/create", middleware.JWTAuthMiddleware(v1ControllerAlerts.CreateAlert))
			apiGroup.POST("/cancel", middleware.JWTAuthMiddleware(v1ControllerAlerts.CancelAlert))
		}

		apiv1.POST("/fcm/subscribe", middleware.JWTAuthMiddleware(v1ControllerAlerts.SubscribeFCM))

		binanceGroup := apiv1.Group("/binance")
		{
			binanceGroup.GET("/history", v1ControllerBinance.GetSubscribedSymbolsHistory)
		}
	}

	return r
}
