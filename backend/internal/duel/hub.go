package duel

import (
	"encoding/json"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/google/uuid"
)

// waitingPlayer holds the metadata of the first player queued for matchmaking.
// The actual WS Client is attached separately once the connection is upgraded.
type waitingPlayer struct {
	playerID string
	name     string
	matchID  string
}

// Hub manages all live matches and the single-slot matchmaking queue.
type Hub struct {
	mu        sync.Mutex
	matches   map[string]*Match
	queue     *waitingPlayer
	equations []Equation
	JWTSecret string // exported so handler.go can reference it without an accessor
}

func NewHub(equations []Equation, jwtSecret string) *Hub {
	return &Hub{
		matches:   make(map[string]*Match),
		equations: equations,
		JWTSecret: jwtSecret,
	}
}

// ── Matchmaking ───────────────────────────────────────────────────────────────

// JoinOrCreate either pairs the caller with a waiting player or enqueues them.
// Returns matchID and the caller's player index (0 = first, 1 = second).
func (h *Hub) JoinOrCreate(playerID, name string) (matchID string, playerIdx int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.queue != nil && h.queue.playerID != playerID {
		// Pair with the waiting player
		waiter := h.queue
		h.queue = nil

		m := h.matches[waiter.matchID]
		m.state.Players[1] = PlayerInfo{PlayerID: playerID, Name: name}
		m.state.Progress[1] = PlayerProgress{PlayerID: playerID, HP: InitialHP}
		return waiter.matchID, 1
	}

	// No partner yet — create match skeleton and queue self
	matchID = uuid.NewString()
	m := &Match{
		id:   matchID,
		done: make(chan struct{}),
	}
	m.state = MatchState{
		MatchID:     matchID,
		Status:      StatusWaiting,
		TotalRounds: TotalRounds,
		Players: [2]PlayerInfo{
			{PlayerID: playerID, Name: name},
		},
		Progress: [2]PlayerProgress{
			{PlayerID: playerID, HP: InitialHP},
		},
	}
	h.matches[matchID] = m
	h.queue = &waitingPlayer{playerID: playerID, name: name, matchID: matchID}
	return matchID, 0
}

// AttachClient binds a live WS client to its slot in the match.
// When both slots are filled, startMatch fires in a goroutine.
func (h *Hub) AttachClient(matchID, playerID string, c *Client) (*Match, bool) {
	h.mu.Lock()
	m, ok := h.matches[matchID]
	h.mu.Unlock()
	if !ok {
		return nil, false
	}

	m.mu.Lock()
	idx := -1
	for i, p := range m.state.Players {
		if p.PlayerID == playerID {
			idx = i
			break
		}
	}
	if idx == -1 {
		m.mu.Unlock()
		return nil, false
	}
	m.clients[idx] = c
	m.connectedCnt++
	shouldStart := m.connectedCnt == 2
	m.mu.Unlock()

	if shouldStart {
		go h.startMatch(m)
	}
	return m, true
}

// ── Match lifecycle ───────────────────────────────────────────────────────────

func (h *Hub) startMatch(m *Match) {
	m.mu.Lock()
	m.state.Status = StatusActive
	clients := m.clients
	state := m.state
	m.mu.Unlock()

	broadcastTo(clients, "match_joined", state)
	h.startRound(m)
}

func (h *Hub) startRound(m *Match) {
	m.mu.Lock()
	m.state.CurrentRound++
	m.roundEnded = false
	eq := h.pickEquation(m.state.CurrentRound)
	now := time.Now()
	m.state.Equation = eq
	m.state.RoundStartsAt = now
	m.state.RoundEndsAt = now.Add(RoundDuration)
	for i := range m.state.Progress {
		m.state.Progress[i].Solved = false
		m.state.Progress[i].WrongAttempts = 0
	}
	round := m.state.CurrentRound
	clients := m.clients
	state := m.state
	m.mu.Unlock()

	broadcastTo(clients, "round_start", state)

	// Round timer — only fires endRound if this round is still active.
	go func(capturedRound int) {
		select {
		case <-time.After(RoundDuration):
			m.mu.Lock()
			isCurrent := m.state.CurrentRound == capturedRound
			m.mu.Unlock()
			if isCurrent {
				h.endRound(m, "")
			}
		case <-m.done:
		}
	}(round)
}

func (h *Hub) endRound(m *Match, winnerID string) {
	m.mu.Lock()
	if m.roundEnded || m.state.Status == StatusFinished {
		m.mu.Unlock()
		return
	}
	m.roundEnded = true

	p0HP := m.state.Progress[0].HP
	p1HP := m.state.Progress[1].HP
	matchOver := p0HP <= 0 || p1HP <= 0 || m.state.CurrentRound >= m.state.TotalRounds

	if matchOver {
		m.state.Status = StatusFinished
		if p0HP >= p1HP {
			m.state.Winner = m.state.Players[0].PlayerID
		} else {
			m.state.Winner = m.state.Players[1].PlayerID
		}
		clients := m.clients
		finalState := m.state
		m.mu.Unlock()

		broadcastTo(clients, "match_end", MatchEndPayload{
			WinnerID:   finalState.Winner,
			FinalState: finalState,
		})
		m.finish()
		h.mu.Lock()
		delete(h.matches, m.id)
		h.mu.Unlock()
		return
	}
	clients := m.clients
	m.mu.Unlock()

	broadcastTo(clients, "round_end", RoundEndPayload{
		WinnerID:    winnerID,
		NextRoundIn: BetweenRounds.Seconds(),
	})

	go func() {
		time.Sleep(BetweenRounds)
		h.startRound(m)
	}()
}

func (h *Hub) pickEquation(round int) Equation {
	difficulty := "easy"
	switch {
	case round == 2:
		difficulty = "medium"
	case round >= 3:
		difficulty = "hard"
	}

	var pool []Equation
	for _, eq := range h.equations {
		if eq.Difficulty == difficulty {
			pool = append(pool, eq)
		}
	}
	if len(pool) == 0 {
		return h.equations[rand.Intn(len(h.equations))]
	}
	return pool[rand.Intn(len(pool))]
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

// broadcastTo sends a message to all clients in the snapshot. Must be called
// without m.mu held, since enqueue is non-blocking but the callers snapshot
// clients before releasing the lock.
func broadcastTo(clients [2]*Client, msgType string, payload interface{}) {
	data := mustMarshal(OutgoingMsg{Type: msgType, Payload: payload})
	for _, c := range clients {
		if c != nil {
			enqueue(c, data)
		}
	}
}

func sendToClient(c *Client, msg OutgoingMsg) {
	if c != nil {
		enqueue(c, mustMarshal(msg))
	}
}

// enqueue drops the message (with a warning) if the send buffer is full.
func enqueue(c *Client, data []byte) {
	select {
	case c.send <- data:
	default:
		log.Printf("duel: send buffer full for player %s, dropping message", c.playerID)
	}
}

func mustMarshal(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("duel: marshal error: %v", err)
		return []byte(`{"type":"error","payload":null}`)
	}
	return b
}
