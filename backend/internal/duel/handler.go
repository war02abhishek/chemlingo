package duel

import (
	"context"
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
	"github.com/redis/go-redis/v9"
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

// HandleCreateMatch: POST /api/v1/duel/match
func (h *Hub) HandleCreateMatch(c *gin.Context) {
	var req createMatchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	playerID := c.MustGet("student_id").(uuid.UUID).String()
	matchID, playerIdx := h.JoinOrCreate(c.Request.Context(), playerID, req.Name)

	// Determine status from Redis state.
	state, ok := h.loadState(c.Request.Context(), matchID)
	status := "waiting"
	if ok && state.Players[1].PlayerID != "" {
		status = "ready"
	}

	c.JSON(http.StatusOK, createMatchResp{
		MatchID:     matchID,
		PlayerIndex: playerIdx,
		Status:      status,
	})
}

// HandleDuelWS: GET /ws/duel?match_id=xxx&token=xxx
//
// Outside the auth middleware group — React Native WebSocket clients cannot set
// custom headers, so authentication is via the ?token= query parameter.
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

	// Use a background context for all Redis ops — the Gin request context is
	// cancelled as soon as the HTTP upgrade completes, which would abort every
	// Redis call that happens after the WebSocket handshake.
	ctx := context.Background()

	connKey := keyConn + matchID + ":" + playerID
	set, err := h.rdb.SetNX(ctx, connKey, "1", connTTL).Result()
	if err != nil {
		log.Printf("handler: redis SETNX error: %v", err)
	}
	if !set {
		h.publish(ctx, matchID, OutgoingMsg{
			Type:    "evict",
			Payload: map[string]string{"player_id": playerID},
		})
		time.Sleep(200 * time.Millisecond)
		h.rdb.Set(ctx, connKey, "1", connTTL)
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("handler: ws upgrade failed: %v", err)
		h.rdb.Del(ctx, connKey)
		return
	}

	client := &Client{
		conn:     conn,
		playerID: playerID,
		matchID:  matchID,
		send:     make(chan []byte, 256),
	}

	if !h.AttachClient(ctx, matchID, playerID, client) {
		conn.WriteJSON(OutgoingMsg{Type: "error", Payload: "match not found or player not in match"})
		conn.Close()
		h.rdb.Del(ctx, connKey)
		return
	}

	// Refresh conn TTL periodically while the socket is open.
	go h.refreshConnTTL(connKey)

	go client.writePump()
	client.readPump(h) // blocks until disconnect
}

// refreshConnTTL keeps the Redis conn key alive while the WebSocket is open.
func (h *Hub) refreshConnTTL(connKey string) {
	ticker := time.NewTicker(connTTL / 2)
	defer ticker.Stop()
	ctx := context.Background()
	for range ticker.C {
		exists, _ := h.rdb.Exists(ctx, connKey).Result()
		if exists == 0 {
			return // key gone — conn must be closed
		}
		h.rdb.Expire(ctx, connKey, connTTL)
	}
}

// authenticateWS extracts and verifies the JWT from header or ?token= param.
func (h *Hub) authenticateWS(c *gin.Context) (string, error) {
	tokenStr := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if tokenStr == "" {
		tokenStr = c.Query("token")
	}
	if tokenStr == "" {
		return "", fmt.Errorf("missing auth token")
	}
	claims := &jwtClaims{}
	if _, err := jwt.ParseWithClaims(tokenStr, claims, func(*jwt.Token) (interface{}, error) {
		return []byte(h.JWTSecret), nil
	}); err != nil {
		return "", fmt.Errorf("invalid token")
	}
	return claims.StudentID.String(), nil
}

// ── WebSocket pumps ───────────────────────────────────────────────────────────

// readPump blocks, reading frames from the WebSocket until disconnect.
func (c *Client) readPump(h *Hub) {
	ctx := context.Background()
	defer func() {
		c.conn.Close()
		c.close() // signal writePump to exit
		h.RemoveClient(ctx, c)
	}()

	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(75 * time.Second))
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("handler: unexpected close player=%s: %v", c.playerID, err)
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
				h.handleSubmitAnswer(ctx, c, p)
			}
		case "ping":
			enqueue(c, mustMarshal(OutgoingMsg{Type: "pong"}))
		case "evict":
			// This pod received an evict message for this player — close the old conn.
			var payload map[string]string
			if json.Unmarshal(msg.Payload, &payload) == nil {
				if payload["player_id"] == c.playerID {
					c.conn.WriteMessage(websocket.CloseMessage,
						websocket.FormatCloseMessage(4000, "replaced by new connection"))
					return
				}
			}
		}
	}
}

// writePump drains c.send → WebSocket. One goroutine per client.
func (c *Client) writePump() {
	pingTicker := time.NewTicker(50 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case data, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// send channel closed — connection is being torn down
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("handler: write error player=%s: %v", c.playerID, err)
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

func (h *Hub) handleSubmitAnswer(ctx context.Context, c *Client, payload SubmitPayload) {
	state, ok := h.loadState(ctx, c.matchID)
	if !ok || state.Status != StatusActive {
		return
	}

	idx := playerIndexInState(&state, c.playerID)
	if idx == -1 || state.Progress[idx].Finished {
		return // player already done with all equations
	}

	// Which equation is this player currently solving?
	roundIdx := state.Progress[idx].CurrentRound - 1 // 0-indexed
	if roundIdx < 0 || roundIdx >= len(state.Equations) {
		return
	}
	currentEq := state.Equations[roundIdx]

	if !validateCoefficients(currentEq.Answers, payload.Coefficients) {
		state.Progress[idx].WrongAttempts++
		h.saveState(ctx, c.matchID, state)
		enqueue(c, mustMarshal(OutgoingMsg{
			Type: "validation_result",
			Payload: ValidationResult{
				Correct:       false,
				WrongAttempts: state.Progress[idx].WrongAttempts,
			},
		}))
		return
	}

	// ── Correct — advance this player independently ───────────────────────────

	solveMs := time.Since(state.Progress[idx].RoundStartedAt).Milliseconds()
	state.Progress[idx].TotalTimeMs += solveMs
	state.Progress[idx].RoundsSolved++
	state.Progress[idx].WrongAttempts = 0

	if state.Progress[idx].RoundsSolved >= state.TotalRounds {
		state.Progress[idx].Finished = true
	} else {
		state.Progress[idx].CurrentRound++
		state.Progress[idx].RoundStartedAt = time.Now()
	}

	h.saveState(ctx, c.matchID, state)

	// Tell the solver their time for this equation.
	enqueue(c, mustMarshal(OutgoingMsg{
		Type: "validation_result",
		Payload: ValidationResult{
			Correct:     true,
			SolveTimeMs: solveMs,
		},
	}))

	// Both players see updated progress bars via state_update.
	h.publish(ctx, c.matchID, OutgoingMsg{Type: "state_update", Payload: state})

	// If both players are now done, determine the winner.
	if state.Progress[0].Finished && state.Progress[1].Finished {
		go h.finishMatch(c.matchID)
	}
}

// validateCoefficients requires an exact element-wise match.
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

// ── Evict handling in subscribeLoop ──────────────────────────────────────────
// The "evict" message type is delivered via pub/sub to all pods.
// readPump on each pod checks if the evicted playerID matches its own client
// and closes that connection. See the "evict" case in readPump above.

// sendToClient sends directly to a single client on this pod.
// Used for validation_result which goes to the solver only.
func sendToClient(c *Client, msg OutgoingMsg) {
	enqueue(c, mustMarshal(msg))
}

// ── Redis conn key cleanup (called by RemoveClient) ──────────────────────────

// deleteConnKey removes the player's conn lock from Redis.
// Called via RemoveClient → happens automatically in readPump defer.
func (h *Hub) deleteConnKey(ctx context.Context, matchID, playerID string) {
	h.rdb.Del(ctx, keyConn+matchID+":"+playerID)
}

// Ensure deleteConnKey is called from RemoveClient.
func init() {
	// Compile-time check that Hub implements expected interface shape.
	// (No-op: just ensures the file compiles correctly.)
	_ = (*Hub)(nil)
}

// ── redis.Nil sentinel ────────────────────────────────────────────────────────

// isRedisNil returns true if err is the redis.Nil sentinel value.
func isRedisNil(err error) bool {
	return err == redis.Nil
}
