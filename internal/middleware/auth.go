package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

// JWTAuthMiddleware wraps endpoints in Go-style microservice middleware format.
// Keycloak authentication has been removed, this now just extracts the requester from request.
func JWTAuthMiddleware(handler gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		requester := strings.TrimSpace(c.Query("requester"))
		if requester == "" {
			var req struct {
				Requester string `json:"requester"`
			}
			if err := c.ShouldBindBodyWith(&req, binding.JSON); err == nil {
				requester = req.Requester
			}
		}
		c.Set("requester_email", requester)
		handler(c)
	}
}
