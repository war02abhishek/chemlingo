package duel

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/store"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// waitingPlayer is serialised into the Redis LIST during matchmaking.
type waitingPlayer struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
	MatchID  string `json:"match_id"`
}

// Hub manages WebSocket connections local to this pod and coordinates with
// Redis for matchmaking, state storage, and cross-pod message delivery.
type Hub struct {
	rdb       *redis.Client
	db        *store.Store
	equations []Equation
	JWTSecret string

	// localClients holds the WebSocket connections THIS pod owns.
	// Key: matchID → slice of *Client connected to this pod.
	localMu      sync.RWMutex
	localClients map[string][]*Client
}

func NewHub(rdb *redis.Client, equations []Equation, jwtSecret string, db *store.Store) *Hub {
	h := &Hub{
		rdb:          rdb,
		db:           db,
		equations:    equations,
		JWTSecret:    jwtSecret,
		localClients: make(map[string][]*Client),
	}
	go h.subscribeLoop()
	return h
}

// ── Matchmaking ───────────────────────────────────────────────────────────────

// JoinOrCreate either pairs the caller with a waiting player (atomic RPOP) or
// enqueues them. Returns matchID and the caller's player index (0 or 1).
func (h *Hub) JoinOrCreate(ctx context.Context, playerID, name string) (matchID string, playerIdx int) {
	// Atomic pop — only one pod wins even under concurrent load.
	raw, err := h.rdb.RPop(ctx, keyQueue).Result()
	if err == redis.Nil {
		// Nobody waiting — create match skeleton, push self onto queue.
		matchID = uuid.NewString()
		state := MatchState{
			MatchID:     matchID,
			Status:      StatusWaiting,
			TotalRounds: TotalRounds,
			Players:     [2]PlayerInfo{{PlayerID: playerID, Name: name}},
			Progress:    [2]PlayerProgress{{PlayerID: playerID}},
		}
		h.saveState(ctx, matchID, state)

		entry, _ := json.Marshal(waitingPlayer{PlayerID: playerID, Name: name, MatchID: matchID})
		h.rdb.LPush(ctx, keyQueue, entry)
		return matchID, 0
	}
	if err != nil {
		log.Printf("hub: redis RPOP error: %v", err)
		// Fallback: create a new solo match and wait.
		return h.JoinOrCreate(ctx, playerID, name)
	}

	// Paired with the waiting player.
	var waiter waitingPlayer
	if err := json.Unmarshal([]byte(raw), &waiter); err != nil {
		log.Printf("hub: malformed queue entry: %v", err)
		return h.JoinOrCreate(ctx, playerID, name)
	}

	// Never pair a player with themselves (happens when they cancel and rejoin).
	if waiter.PlayerID == playerID {
		log.Printf("hub: skipping self-pair for player %s, re-queuing as new match", playerID)
		// Clean up the stale match state and create a fresh one.
		h.rdb.Del(ctx, keyMatch+waiter.MatchID)
		return h.JoinOrCreate(ctx, playerID, name)
	}

	state, ok := h.loadState(ctx, waiter.MatchID)
	if !ok {
		// Waiter's match expired — try again.
		return h.JoinOrCreate(ctx, playerID, name)
	}
	state.Players[1] = PlayerInfo{PlayerID: playerID, Name: name}
	state.Progress[1] = PlayerProgress{PlayerID: playerID}
	h.saveState(ctx, waiter.MatchID, state)
	return waiter.MatchID, 1
}

// ── Client attachment ─────────────────────────────────────────────────────────

// AttachClient registers a live WebSocket client on this pod.
// When both players are connected (connectedCnt in Redis reaches 2) this pod
// starts the match.
func (h *Hub) AttachClient(ctx context.Context, matchID, playerID string, c *Client) bool {
	state, ok := h.loadState(ctx, matchID)
	if !ok {
		return false
	}

	// Verify this player belongs to the match.
	idx := playerIndexInState(&state, playerID)
	if idx == -1 {
		return false
	}

	// Add to this pod's local map.
	h.localMu.Lock()
	h.localClients[matchID] = append(h.localClients[matchID], c)
	h.localMu.Unlock()

	// Subscribe to the match channel if this is the first conn for this match
	// on this pod.
	h.localMu.RLock()
	first := len(h.localClients[matchID]) == 1
	h.localMu.RUnlock()
	if first {
		// subscribeLoop watches a pattern; individual subscription not needed.
		// (handled in subscribeLoop via PSubscribe)
	}

	// Atomically increment connected-player count in Redis.
	connKey := keyMatch + matchID + ":conncount"
	count, err := h.rdb.Incr(ctx, connKey).Result()
	h.rdb.Expire(ctx, connKey, matchTTL)
	if err != nil {
		log.Printf("hub: conncount incr error: %v", err)
		return true
	}

	if count == 2 {
		// Both players connected — this pod starts the match.
		go h.startMatch(matchID)
	} else if state.Status == StatusActive {
		// Reconnect: send current state immediately so UI can resume.
		data := mustMarshal(OutgoingMsg{Type: "state_sync", Payload: state})
		enqueue(c, data)
	}

	return true
}

// RemoveClient is called when a WebSocket closes (normal or abnormal).
func (h *Hub) RemoveClient(ctx context.Context, c *Client) {
	matchID := c.matchID

	h.localMu.Lock()
	conns := h.localClients[matchID]
	filtered := conns[:0]
	for _, existing := range conns {
		if existing != c {
			filtered = append(filtered, existing)
		}
	}
	if len(filtered) == 0 {
		delete(h.localClients, matchID)
	} else {
		h.localClients[matchID] = filtered
	}
	h.localMu.Unlock()

	// Decrement connected count and mark player offline.
	connKey := keyMatch + matchID + ":conncount"
	h.rdb.Decr(ctx, connKey)
	h.rdb.Del(ctx, keyConn+matchID+":"+c.playerID)

	// Notify opponent.
	h.publish(ctx, matchID, OutgoingMsg{
		Type:    "opponent_disconnected",
		Payload: map[string]string{"player_id": c.playerID},
	})

	// Start reconnect grace window. If the player doesn't reconnect in time,
	// end the match and award victory to the opponent.
	go func() {
		time.Sleep(reconnectWindow)
		// Check if the player reconnected (conn key will have been re-set).
		exists, _ := h.rdb.Exists(ctx, keyConn+matchID+":"+c.playerID).Result()
		if exists == 0 {
			h.forfeit(ctx, matchID, c.playerID)
		}
	}()
}

// ── Match lifecycle ───────────────────────────────────────────────────────────

// startMatch is called when both players have connected their WebSockets.
// It picks all equations for the race upfront and sends match_joined to both.
func (h *Hub) startMatch(matchID string) {
	ctx := context.Background()
	state, ok := h.loadState(ctx, matchID)
	if !ok {
		return
	}
	state.Status = StatusActive
	state.Equations = h.pickEquations(TotalRounds)
	now := time.Now()
	for i := range state.Progress {
		state.Progress[i].CurrentRound = 1
		state.Progress[i].RoundStartedAt = now
	}
	h.saveState(ctx, matchID, state)
	h.publish(ctx, matchID, OutgoingMsg{Type: "match_joined", Payload: state})
}

// finishMatch is called when both players have finished all equations.
func (h *Hub) finishMatch(matchID string) {
	ctx := context.Background()
	state, ok := h.loadState(ctx, matchID)
	if !ok {
		return
	}
	t0, t1 := state.Progress[0].TotalTimeMs, state.Progress[1].TotalTimeMs
	switch {
	case t0 < t1:
		state.Winner = state.Players[0].PlayerID
	case t1 < t0:
		state.Winner = state.Players[1].PlayerID
	}
	h.commitMatchEnd(ctx, state)
}

// forfeit ends the match immediately when a player abandons without reconnecting.
func (h *Hub) forfeit(ctx context.Context, matchID, disconnectedPlayerID string) {
	state, ok := h.loadState(ctx, matchID)
	if !ok {
		return
	}
	for i := range state.Progress {
		if state.Progress[i].PlayerID == disconnectedPlayerID {
			remaining := state.TotalRounds - state.Progress[i].RoundsSolved
			state.Progress[i].TotalTimeMs += int64(remaining) * ForfeitPenaltyMs
			state.Progress[i].Finished = true
		}
	}
	for _, p := range state.Players {
		if p.PlayerID != disconnectedPlayerID {
			state.Winner = p.PlayerID
			break
		}
	}
	h.commitMatchEnd(ctx, state)
}

// commitMatchEnd is the single place where a match transitions to Finished.
// A Redis SETNX lock ensures exactly one pod (and one goroutine) runs this per match.
func (h *Hub) commitMatchEnd(ctx context.Context, state MatchState) {
	lockKey := keyMatch + state.MatchID + ":endlock"
	set, err := h.rdb.SetNX(ctx, lockKey, "1", 15*time.Second).Result()
	if err != nil || !set {
		return // another goroutine/pod already handling this
	}

	// Re-read state under lock to avoid stale reads.
	fresh, ok := h.loadState(ctx, state.MatchID)
	if !ok || fresh.Status == StatusFinished {
		return
	}
	fresh.Status = StatusFinished
	fresh.Winner = state.Winner

	ratingChanges := h.persistRatings(ctx, fresh)

	h.saveState(ctx, state.MatchID, fresh)
	h.publish(ctx, state.MatchID, OutgoingMsg{
		Type: "match_end",
		Payload: MatchEndPayload{
			WinnerID:      fresh.Winner,
			FinalState:    fresh,
			RatingChanges: ratingChanges,
		},
	})
	time.AfterFunc(500*time.Millisecond, func() { h.closeMatchConns(state.MatchID) })
	time.AfterFunc(5*time.Second, func() { h.cleanupMatch(state.MatchID) })
}

// persistRatings computes Elo deltas, writes them to Postgres, and returns
// the per-player changes to include in the match_end payload.
// On any DB error it returns zero-delta changes so the match still ends cleanly.
func (h *Hub) persistRatings(ctx context.Context, state MatchState) [2]RatingChange {
	noChange := [2]RatingChange{
		{PlayerID: state.Players[0].PlayerID, Before: StartingRating, Delta: 0, After: StartingRating},
		{PlayerID: state.Players[1].PlayerID, Before: StartingRating, Delta: 0, After: StartingRating},
	}

	p0UUID, err0 := uuid.Parse(state.Players[0].PlayerID)
	p1UUID, err1 := uuid.Parse(state.Players[1].PlayerID)
	if err0 != nil || err1 != nil {
		log.Printf("hub: invalid player UUID: %v %v", err0, err1)
		return noChange
	}

	r0, r1, err := h.db.GetStudentRatings(ctx, p0UUID, p1UUID)
	if err != nil {
		log.Printf("hub: GetStudentRatings error: %v", err)
		return noChange
	}

	tied := state.Winner == ""
	p0Won := state.Winner == state.Players[0].PlayerID
	p1Won := state.Winner == state.Players[1].PlayerID

	d0 := ComputeElo(r0, r1, p0Won, tied)
	d1 := ComputeElo(r1, r0, p1Won, tied)

	rec := model.MatchResultRecord{
		MatchID:        state.MatchID,
		P0ID:           p0UUID,
		P1ID:           p1UUID,
		P0RatingBefore: r0,
		P1RatingBefore: r1,
		P0Delta:        d0,
		P1Delta:        d1,
		P0Result:       resultStr(p0Won, tied),
		P1Result:       resultStr(p1Won, tied),
	}
	if err := h.db.RecordMatchResult(ctx, rec); err != nil {
		log.Printf("hub: RecordMatchResult error: %v", err)
		return noChange
	}

	return [2]RatingChange{
		{PlayerID: state.Players[0].PlayerID, Before: r0, Delta: d0, After: r0 + d0},
		{PlayerID: state.Players[1].PlayerID, Before: r1, Delta: d1, After: r1 + d1},
	}
}

func resultStr(won, tied bool) string {
	if tied {
		return "tie"
	}
	if won {
		return "win"
	}
	return "loss"
}

// ── Pub/Sub ───────────────────────────────────────────────────────────────────

// publish sends a message to all pods subscribed to this match's channel.
func (h *Hub) publish(ctx context.Context, matchID string, msg OutgoingMsg) {
	data := mustMarshal(msg)
	if err := h.rdb.Publish(ctx, chanMatch+matchID, data).Err(); err != nil {
		log.Printf("hub: publish error matchID=%s: %v", matchID, err)
	}
}

// subscribeLoop runs in a background goroutine for the lifetime of this pod.
// It forwards match pub/sub messages to the WebSocket clients connected to this pod.
func (h *Hub) subscribeLoop() {
	ctx := context.Background()
	pubsub := h.rdb.PSubscribe(ctx, chanMatch+"*")
	defer pubsub.Close()

	for msg := range pubsub.Channel() {
		matchID := msg.Channel[len(chanMatch):]
		h.deliverToLocalClients(matchID, []byte(msg.Payload))
	}
}

// deliverToLocalClients fans out a raw message to every WebSocket connection
// this pod holds for the given match.
func (h *Hub) deliverToLocalClients(matchID string, data []byte) {
	h.localMu.RLock()
	conns := h.localClients[matchID]
	// Copy slice to avoid holding the lock while sending.
	snapshot := make([]*Client, len(conns))
	copy(snapshot, conns)
	h.localMu.RUnlock()

	for _, c := range snapshot {
		enqueue(c, data)
	}
}

// ── Redis state helpers ───────────────────────────────────────────────────────

func (h *Hub) saveState(ctx context.Context, matchID string, state MatchState) {
	data, err := json.Marshal(state)
	if err != nil {
		log.Printf("hub: marshal state error: %v", err)
		return
	}
	h.rdb.HSet(ctx, keyMatch+matchID, "state", data)
	h.rdb.Expire(ctx, keyMatch+matchID, matchTTL)
}

func (h *Hub) loadState(ctx context.Context, matchID string) (MatchState, bool) {
	raw, err := h.rdb.HGet(ctx, keyMatch+matchID, "state").Result()
	if err != nil {
		return MatchState{}, false
	}
	var state MatchState
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		return MatchState{}, false
	}
	return state, true
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────

func (h *Hub) closeMatchConns(matchID string) {
	h.localMu.RLock()
	conns := h.localClients[matchID]
	snapshot := make([]*Client, len(conns))
	copy(snapshot, conns)
	h.localMu.RUnlock()

	for _, c := range snapshot {
		c.conn.WriteMessage(1, mustMarshal(OutgoingMsg{Type: "close", Payload: "match finished"}))
		c.conn.Close()
	}
}

func (h *Hub) cleanupMatch(matchID string) {
	ctx := context.Background()
	h.rdb.Del(ctx, keyMatch+matchID)
}

// ── Equation selection ────────────────────────────────────────────────────────

// pickEquations picks n distinct equations for a match, ordered easy→medium→hard.
func (h *Hub) pickEquations(n int) []Equation {
	buckets := map[string][]Equation{"easy": {}, "medium": {}, "hard": {}}
	for _, eq := range h.equations {
		buckets[eq.Difficulty] = append(buckets[eq.Difficulty], eq)
	}
	for k := range buckets {
		rand.Shuffle(len(buckets[k]), func(i, j int) {
			buckets[k][i], buckets[k][j] = buckets[k][j], buckets[k][i]
		})
	}
	order := []string{"easy", "medium", "hard"}
	var result []Equation
	for _, diff := range order {
		for _, eq := range buckets[diff] {
			result = append(result, eq)
			if len(result) == n {
				return result
			}
		}
	}
	return result
}

// ── Utility ───────────────────────────────────────────────────────────────────

func enqueue(c *Client, data []byte) {
	select {
	case c.send <- data:
	default:
		log.Printf("hub: send buffer full for player %s, dropping message", c.playerID)
	}
}

func mustMarshal(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("hub: marshal error: %v", err)
		return []byte(`{"type":"error","payload":"internal error"}`)
	}
	return b
}

func playerIndexInState(state *MatchState, playerID string) int {
	for i, p := range state.Players {
		if p.PlayerID == playerID {
			return i
		}
	}
	return -1
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
