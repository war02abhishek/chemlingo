package main

import (
	"context"
	"log"
	"net/http"

	"github.com/chemlingo/backend/config"
	"github.com/chemlingo/backend/internal/duel"
	"github.com/chemlingo/backend/internal/handler"
	"github.com/chemlingo/backend/internal/middleware"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg := config.Load()

	db, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer db.Close()

	s := store.New(db)
	authHandler := handler.NewAuthHandler(s, cfg.JWTSecret)
	duelHub := duel.NewHub(duel.LoadEquations(), cfg.JWTSecret)

	r := gin.Default()

	// Public
	r.POST("/auth/login", authHandler.Login)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	// Duel WebSocket — own JWT auth via ?token= param (React Native can't set WS headers)
	r.GET("/ws/duel", duelHub.HandleDuelWS)

	// Protected
	api := r.Group("/api/v1", middleware.Auth(cfg.JWTSecret))
	{
		api.POST("/duel/match", duelHub.HandleCreateMatch)
	}

	log.Printf("ChemLingo backend running on :%s", cfg.Port)
	r.Run(":" + cfg.Port)
}
