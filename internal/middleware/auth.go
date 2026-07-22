package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

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
