package main

import (
	"context"
	"log"
	"net/http"

	"github.com/chemlingo/backend/config"
	"github.com/chemlingo/backend/internal/curriculum"
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
	if err := curriculum.SeedTopics(context.Background(), s); err != nil {
		log.Fatalf("curriculum seed: %v", err)
	}
	if err := s.SeedDemoUsers(context.Background()); err != nil {
		log.Fatalf("seed users: %v", err)
	}

	authHandler := handler.NewAuthHandler(s, cfg.JWTSecret)
	profileHandler := handler.NewProfileHandler(s)
	leaderboardHandler := handler.NewLeaderboardHandler(s)
	dailyChallengeHandler := handler.NewDailyChallengeHandler(s)
	sprintHandler := handler.NewSprintHandler(s)
	compoundHandler := handler.NewCompoundHandler(s)
	curriculumHandler := handler.NewCurriculumHandler(s)
	predictorHandler := handler.NewPredictorHandler(s)
	teacherHandler := handler.NewTeacherHandler(s)
	pyqHandler := handler.NewPYQHandler(s)
	questionsHandler := handler.NewQuestionsHandler(s)
	duelHub := duel.NewHub(rdb, duel.LoadEquations(), cfg.JWTSecret, s)

	// ── Routes ────────────────────────────────────────────────────────────────
	r := gin.Default()

	// Rate limiters: 5 req/min burst for auth, 2 req/s burst for duel matching
	authRL := middleware.RateLimit(5.0/60, 5)
	duelRL  := middleware.RateLimit(2, 10)

	// Public
	r.POST("/auth/login", authRL, authHandler.Login)
	r.POST("/auth/register", authRL, authHandler.Register)
	r.POST("/auth/refresh", authHandler.Refresh)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	// Duel WebSocket — JWT via ?token= (React Native can't set WS headers)
	r.GET("/ws/duel", duelHub.HandleDuelWS)

	// Protected
	api := r.Group("/api/v1", middleware.Auth(cfg.JWTSecret))
	{
		api.POST("/duel/match", duelRL, duelHub.HandleCreateMatch)
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

		// Curriculum
		api.GET("/curriculum", curriculumHandler.GetCurriculum)
		api.GET("/curriculum/progress", curriculumHandler.GetProgress)
		api.POST("/lessons/:id/complete", curriculumHandler.CompleteLesson)
		api.GET("/topics/:id/boss", curriculumHandler.GetBossQuestions)
		api.POST("/topics/:id/boss/submit", curriculumHandler.SubmitBoss)

		// Reaction Predictor
		api.GET("/predictor/lesson/:lesson_id", predictorHandler.GetLessonQuestions)
		api.POST("/predictor/lesson/:lesson_id/submit", predictorHandler.SubmitLesson)
		api.GET("/predictor/practice", predictorHandler.GetPracticeQuestion)

		// Teacher
		api.GET("/teacher/overview", teacherHandler.GetOverview)
		api.GET("/teacher/students", teacherHandler.GetStudents)
		api.GET("/teacher/students/:id", teacherHandler.GetStudentDetail)
		api.GET("/teacher/insights", teacherHandler.GetInsights)
		api.GET("/teacher/batches", teacherHandler.GetBatches)
		api.POST("/teacher/batches", teacherHandler.CreateBatch)
		api.POST("/teacher/batches/:id/students", teacherHandler.AddStudentToBatch)
		api.GET("/teacher/batches/:id/curriculum", teacherHandler.GetBatchCurriculum)
		api.PUT("/teacher/batches/:id/topic/advance", teacherHandler.AdvanceBatchTopic)
		api.PUT("/teacher/batches/:id/topic/pause", teacherHandler.PauseBatchTopic)
		api.PUT("/teacher/batches/:id/topic/extend", teacherHandler.ExtendBatchTopic)

		// PYQ
		api.GET("/topics/:id/pyq", pyqHandler.GetPYQQuestions)
		api.POST("/topics/:id/pyq/submit", pyqHandler.SubmitPYQ)

		// Question bank — teacher CRUD
		api.POST("/teacher/questions", questionsHandler.Create)
		api.PUT("/teacher/questions/:id/approve", questionsHandler.Approve)
		api.GET("/teacher/questions", questionsHandler.List)

		// Question bank — student-facing (approved only)
		api.GET("/questions", questionsHandler.ListApproved)
		api.POST("/questions/submit", questionsHandler.Submit)

		// Student batch join + password change
		api.POST("/batches/join", teacherHandler.JoinBatch)
		api.PUT("/profile/password", authHandler.SetPassword)
	}

	log.Printf("ChemLingo backend running on :%s", cfg.Port)
	r.Run(":" + cfg.Port)
}
