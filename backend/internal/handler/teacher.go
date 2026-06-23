package handler

import (
	"net/http"

	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TeacherHandler struct {
	store *store.Store
}

func NewTeacherHandler(s *store.Store) *TeacherHandler {
	return &TeacherHandler{store: s}
}

func teacherID(c *gin.Context) (uuid.UUID, bool) {
	v, exists := c.Get("student_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing auth"})
		return uuid.UUID{}, false
	}
	id, ok := v.(uuid.UUID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return uuid.UUID{}, false
	}
	return id, true
}

// GET /api/v1/teacher/overview
func (h *TeacherHandler) GetOverview(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	ov, _ := h.store.GetTeacherOverview(c.Request.Context(), tid)
	c.JSON(http.StatusOK, ov)
}

// GET /api/v1/teacher/students?batch_id=
func (h *TeacherHandler) GetStudents(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	batchID := c.Query("batch_id")
	students, _ := h.store.GetBatchStudents(c.Request.Context(), tid, batchID)
	if students == nil {
		students = []store.StudentRow{}
	}
	c.JSON(http.StatusOK, gin.H{"students": students})
}

// GET /api/v1/teacher/insights
func (h *TeacherHandler) GetInsights(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	weak, _ := h.store.GetWeakLessons(c.Request.Context(), tid)
	if weak == nil {
		weak = []store.WeakLesson{}
	}
	c.JSON(http.StatusOK, gin.H{"weak_lessons": weak})
}

// GET /api/v1/teacher/batches
func (h *TeacherHandler) GetBatches(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	batches, _ := h.store.GetTeacherBatches(c.Request.Context(), tid)
	if batches == nil {
		batches = []store.BatchRow{}
	}
	c.JSON(http.StatusOK, gin.H{"batches": batches})
}

// POST /api/v1/teacher/batches
func (h *TeacherHandler) CreateBatch(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := h.store.CreateBatch(c.Request.Context(), tid, req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}
