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

// GET /api/v1/teacher/students/:id
func (h *TeacherHandler) GetStudentDetail(c *gin.Context) {
	if _, ok := teacherID(c); !ok {
		return
	}
	studentID := c.Param("id")
	detail, err := h.store.GetStudentDetail(c.Request.Context(), studentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// POST /api/v1/teacher/batches/:id/students
func (h *TeacherHandler) AddStudentToBatch(c *gin.Context) {
	if _, ok := teacherID(c); !ok {
		return
	}
	batchID := c.Param("id")
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.store.AddStudentToBatch(c.Request.Context(), batchID, req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// POST /api/v1/batches/join
func (h *TeacherHandler) JoinBatch(c *gin.Context) {
	playerID, ok := teacherID(c)
	if !ok {
		return
	}
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	batchName, err := h.store.JoinBatchByCode(c.Request.Context(), playerID, req.Code)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid batch code"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "batch_name": batchName})
}

// POST /api/v1/teacher/batches (create)
// GET  /api/v1/teacher/batches/:id — returns batch including batch_code

// GET /api/v1/teacher/batches/:id/curriculum
func (h *TeacherHandler) GetBatchCurriculum(c *gin.Context) {
	if _, ok := teacherID(c); !ok {
		return
	}
	batchID := c.Param("id")
	topics, err := h.store.GetBatchCurriculum(c.Request.Context(), batchID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "batch not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"topics": topics})
}

// PUT /api/v1/teacher/batches/:id/topic/advance
func (h *TeacherHandler) AdvanceBatchTopic(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	batchID := c.Param("id")
	if err := h.store.AdvanceBatchTopic(c.Request.Context(), tid, batchID); err != nil {
		if err.Error() == "already at last topic" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Already at the last topic"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PUT /api/v1/teacher/batches/:id/topic/pause
func (h *TeacherHandler) PauseBatchTopic(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	batchID := c.Param("id")
	if err := h.store.PauseBatchTopic(c.Request.Context(), tid, batchID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PUT /api/v1/teacher/batches/:id/topic/extend
func (h *TeacherHandler) ExtendBatchTopic(c *gin.Context) {
	tid, ok := teacherID(c)
	if !ok {
		return
	}
	batchID := c.Param("id")
	if err := h.store.ExtendBatchTopic(c.Request.Context(), tid, batchID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
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
