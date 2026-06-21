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
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()

	// ── Postgres ──────────────────────────────────────────────────────────────
	db, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer db.Close()

	// ── Redis ─────────────────────────────────────────────────────────────────
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis: bad URL %q: %v", cfg.RedisURL, err)
	}
	rdb := redis.NewClient(redisOpts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("redis: ping failed: %v", err)
	}
	defer rdb.Close()
	log.Printf("Redis connected: %s", cfg.RedisURL)

	// ── App wiring ────────────────────────────────────────────────────────────
	s := store.New(db)
	if err := s.Migrate(context.Background()); err != nil {
		log.Fatalf("migration: %v", err)
	}

	authHandler := handler.NewAuthHandler(s, cfg.JWTSecret)
	profileHandler := handler.NewProfileHandler(s)
	leaderboardHandler := handler.NewLeaderboardHandler(s)
	dailyChallengeHandler := handler.NewDailyChallengeHandler(s)
	sprintHandler := handler.NewSprintHandler(s)
	compoundHandler := handler.NewCompoundHandler(s)
	duelHub := duel.NewHub(rdb, duel.LoadEquations(), cfg.JWTSecret, s)

	// ── Routes ────────────────────────────────────────────────────────────────
	r := gin.Default()

	// Public
	r.POST("/auth/login", authHandler.Login)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	// Duel WebSocket — JWT via ?token= (React Native can't set WS headers)
	r.GET("/ws/duel", duelHub.HandleDuelWS)

	// Protected
	api := r.Group("/api/v1", middleware.Auth(cfg.JWTSecret))
	{
		api.POST("/duel/match", duelHub.HandleCreateMatch)
		api.GET("/profile", profileHandler.GetProfile)
		api.GET("/profile/history", profileHandler.GetHistory)
		api.GET("/leaderboard", leaderboardHandler.GetLeaderboard)
		api.GET("/players/:id/profile", leaderboardHandler.GetPublicProfile)
		api.GET("/daily-challenge", dailyChallengeHandler.GetChallenge)
		api.POST("/daily-challenge/submit", dailyChallengeHandler.SubmitChallenge)
		api.GET("/daily-challenge/leaderboard", dailyChallengeHandler.GetLeaderboard)
		api.GET("/sprint", sprintHandler.GetSprint)
		api.POST("/sprint/submit", sprintHandler.SubmitSprint)
		api.GET("/sprint/leaderboard", sprintHandler.GetSprintLeaderboard)
		api.GET("/compound/daily", compoundHandler.GetDaily)
		api.POST("/compound/daily/submit", compoundHandler.SubmitDaily)
		api.GET("/compound/daily/leaderboard", compoundHandler.GetLeaderboard)
		api.GET("/compound/practice", compoundHandler.GetPractice)
		api.POST("/compound/practice/check", compoundHandler.CheckPractice)
	}

	log.Printf("ChemLingo backend running on :%s", cfg.Port)
	r.Run(":" + cfg.Port)
}
