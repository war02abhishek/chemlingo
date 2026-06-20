package duel

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(_ *http.Request) bool { return true },
}

// jwtClaims mirrors middleware.Claims to avoid a circular import.
type jwtClaims struct {
	StudentID   uuid.UUID `json:"student_id"`
	InstituteID uuid.UUID `json:"institute_id"`
	jwt.RegisteredClaims
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

type createMatchReq struct {
	Name string `json:"name" binding:"required"`
}

type createMatchResp struct {
	MatchID     string `json:"match_id"`
	PlayerIndex int    `json:"player_index"`
	Status      string `json:"status"` // "waiting" | "ready"
}

// HandleCreateMatch: POST /api/v1/duel/match  (protected by middleware.Auth)
//
// Returns a match_id the client uses to open the WebSocket. If a second player
// calls this concurrently they are immediately paired (status "ready"); the
// first caller gets "waiting" until their opponent's WS connects.
func (h *Hub) HandleCreateMatch(c *gin.Context) {
	var req createMatchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	playerID := c.MustGet("student_id").(uuid.UUID).String()
	matchID, playerIdx := h.JoinOrCreate(playerID, req.Name)

	h.mu.Lock()
	m := h.matches[matchID]
	h.mu.Unlock()

	status := "waiting"
	m.mu.Lock()
	if m.state.Players[1].PlayerID != "" {
		status = "ready"
	}
	m.mu.Unlock()

	c.JSON(http.StatusOK, createMatchResp{
		MatchID:     matchID,
		PlayerIndex: playerIdx,
		Status:      status,
	})
}

// HandleDuelWS: GET /ws/duel?match_id=xxx&token=xxx
//
// Placed OUTSIDE the auth middleware group so React Native WebSocket clients
// (which cannot set custom headers) can authenticate via the ?token= query
// parameter. The handler performs its own JWT verification.
func (h *Hub) HandleDuelWS(c *gin.Context) {
	playerID, err := h.authenticateWS(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	matchID := c.Query("match_id")
	if matchID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "match_id required"})
		return
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("duel: ws upgrade failed: %v", err)
		return
	}

	client := &Client{
		conn:     conn,
		playerID: playerID,
		send:     make(chan []byte, 256),
	}

	m, ok := h.AttachClient(matchID, playerID, client)
	if !ok {
		_ = conn.WriteJSON(OutgoingMsg{Type: "error", Payload: "match not found or player not in match"})
		conn.Close()
		return
	}

	go client.writePump()
	client.readPump(m, h) // blocks until disconnect
}

// authenticateWS extracts and verifies the JWT from either the Authorization
// header or the ?token= query parameter (needed for React Native WS clients).
func (h *Hub) authenticateWS(c *gin.Context) (playerID string, err error) {
	// Prefer header for curl/Postman testing compatibility
	tokenStr := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if tokenStr == "" {
		tokenStr = c.Query("token")
	}
	if tokenStr == "" {
		return "", fmt.Errorf("missing auth token")
	}

	claims := &jwtClaims{}
	if _, err = jwt.ParseWithClaims(tokenStr, claims, func(*jwt.Token) (interface{}, error) {
		return []byte(h.JWTSecret), nil
	}); err != nil {
		return "", fmt.Errorf("invalid token")
	}

	return claims.StudentID.String(), nil
}

// ── WebSocket pumps ───────────────────────────────────────────────────────────

// readPump blocks the calling goroutine, reading messages until disconnect.
func (c *Client) readPump(m *Match, h *Hub) {
	defer c.conn.Close()

	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("duel: unexpected close for player %s: %v", c.playerID, err)
			}
			break
		}
		c.conn.SetReadDeadline(time.Now().Add(75 * time.Second))

		var msg IncomingMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "submit_answer":
			var p SubmitPayload
			if json.Unmarshal(msg.Payload, &p) == nil {
				h.handleSubmitAnswer(m, c, p)
			}
		case "ping":
			enqueue(c, mustMarshal(OutgoingMsg{Type: "pong"}))
		}
	}
}

// writePump drains c.send → WebSocket. Runs in its own goroutine.
func (c *Client) writePump() {
	pingTicker := time.NewTicker(50 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case data, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("duel: write error for player %s: %v", c.playerID, err)
				return
			}
		case <-pingTicker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ── Game logic ────────────────────────────────────────────────────────────────

// handleSubmitAnswer validates coefficients, updates HP, and triggers round-end
// checks. All state mutation happens under m.mu; WS sends happen after unlock.
func (h *Hub) handleSubmitAnswer(m *Match, c *Client, payload SubmitPayload) {
	m.mu.Lock()

	if m.state.Status != StatusActive {
		m.mu.Unlock()
		return
	}

	idx := playerIndex(m, c.playerID)
	if idx == -1 || m.state.Progress[idx].Solved {
		m.mu.Unlock()
		return
	}

	if !validateCoefficients(m.state.Equation.Answers, payload.Coefficients) {
		m.state.Progress[idx].WrongAttempts++
		wrongAttempts := m.state.Progress[idx].WrongAttempts
		m.mu.Unlock()

		sendToClient(c, OutgoingMsg{
			Type:    "validation_result",
			Payload: ValidationResult{Correct: false, WrongAttempts: wrongAttempts},
		})
		return
	}

	// ── Correct answer ───────────────────────────────────────────────────────

	remaining := time.Until(m.state.RoundEndsAt).Seconds()
	if remaining < 0 {
		remaining = 0
	}
	wrongAttempts := m.state.Progress[idx].WrongAttempts
	multiplier := 1.0 - float64(wrongAttempts)*0.1
	if multiplier < 0 {
		multiplier = 0
	}
	damage := (30.0 + remaining*0.5) * multiplier
	if damage < MinDamage {
		damage = MinDamage
	}

	oppIdx := 1 - idx
	m.state.Progress[oppIdx].HP -= damage
	if m.state.Progress[oppIdx].HP < 0 {
		m.state.Progress[oppIdx].HP = 0
	}
	m.state.Progress[idx].Solved = true
	m.state.Progress[idx].RoundsSolved++

	// Snapshot everything we need after unlock
	clients := m.clients
	state := m.state
	oppHP := m.state.Progress[oppIdx].HP
	bothSolved := m.state.Progress[0].Solved && m.state.Progress[1].Solved
	solverID := c.playerID
	result := ValidationResult{Correct: true, Damage: damage, WrongAttempts: wrongAttempts}

	m.mu.Unlock()

	// Private result → solver only
	sendToClient(c, OutgoingMsg{Type: "validation_result", Payload: result})
	// Broadcast updated HP to both players
	broadcastTo(clients, "state_update", state)

	if oppHP <= 0 || bothSolved {
		go h.endRound(m, solverID)
	}
}

// validateCoefficients requires an exact match to the lowest-integer answer key.
func validateCoefficients(answers, submitted []int) bool {
	if len(answers) != len(submitted) {
		return false
	}
	for i, a := range answers {
		if submitted[i] != a {
			return false
		}
	}
	return true
}

func playerIndex(m *Match, playerID string) int {
	for i, p := range m.state.Players {
		if p.PlayerID == playerID {
			return i
		}
	}
	return -1
}
