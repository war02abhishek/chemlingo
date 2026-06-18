package main

import (
	"context"
	"log"
	"net/http"

	"github.com/chemlingo/backend/config"
	"github.com/chemlingo/backend/internal/handler"
	"github.com/chemlingo/backend/internal/middleware"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()

	// Postgres
	db, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer db.Close()

	// Redis
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	rdb := redis.NewClient(redisOpts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("redis: %v", err)
	}

	s := store.New(db)
	authHandler := handler.NewAuthHandler(s, cfg.JWTSecret)
	drillHandler := handler.NewDrillHandler(s, rdb)
	lbHandler := handler.NewLeaderboardHandler(rdb)
	hintHandler := handler.NewHintProxyHandler(cfg.AIServiceURL)
	wsHub := handler.NewWSHub()

	r := gin.Default()

	// Public
	r.POST("/auth/login", authHandler.Login)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	// Protected
	api := r.Group("/api/v1", middleware.Auth(cfg.JWTSecret))
	{
		api.GET("/drills/due", drillHandler.GetDueDrills)
		api.POST("/drills/attempt", drillHandler.SubmitAttempt)
		api.GET("/leaderboard", lbHandler.GetLeaderboard)
		api.GET("/ws", wsHub.HandleConnection)
		api.POST("/hint", hintHandler.ProxyHint)
	}

	log.Printf("ChemLingo backend running on :%s", cfg.Port)
	r.Run(":" + cfg.Port)
}
