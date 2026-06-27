package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	StudentID   uuid.UUID `json:"student_id"`
	InstituteID uuid.UUID `json:"institute_id"`
	Role        string    `json:"role,omitempty"`
	TokenType   string    `json:"token_type,omitempty"` // "access" or "refresh"
	jwt.RegisteredClaims
}

func Auth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims := &Claims{}
		_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		c.Set("student_id", claims.StudentID)
		c.Set("institute_id", claims.InstituteID)
		c.Set("role", claims.Role)
		c.Next()
	}
}
