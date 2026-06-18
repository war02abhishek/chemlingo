package handler

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type WSHub struct {
	mu      sync.RWMutex
	clients map[string]*websocket.Conn // key: studentID
}

func NewWSHub() *WSHub {
	return &WSHub{clients: make(map[string]*websocket.Conn)}
}

func (h *WSHub) HandleConnection(c *gin.Context) {
	studentID := c.MustGet("student_id").(interface{ String() string }).String()

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	h.mu.Lock()
	h.clients[studentID] = conn
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.clients, studentID)
		h.mu.Unlock()
	}()

	for {
		var msg WSMessage
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		h.handleMessage(studentID, &msg)
	}
}

func (h *WSHub) handleMessage(studentID string, msg *WSMessage) {
	// Extensible: add cases for future real-time features (duels, live streaks, etc.)
	switch msg.Type {
	case "ping":
		h.sendTo(studentID, WSMessage{Type: "pong"})
	}
}

func (h *WSHub) sendTo(studentID string, msg WSMessage) {
	h.mu.RLock()
	conn, ok := h.clients[studentID]
	h.mu.RUnlock()
	if ok {
		conn.WriteJSON(msg)
	}
}

func (h *WSHub) Broadcast(msg WSMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, conn := range h.clients {
		conn.WriteJSON(msg)
	}
}
