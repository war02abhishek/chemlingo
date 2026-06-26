package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type bucket struct {
	tokens   float64
	lastFill time.Time
	mu       sync.Mutex
}

func (b *bucket) allow(rate float64, burst float64) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	elapsed := now.Sub(b.lastFill).Seconds()
	b.lastFill = now
	b.tokens += elapsed * rate
	if b.tokens > burst {
		b.tokens = burst
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

type ipStore struct {
	buckets map[string]*bucket
	mu      sync.Mutex
}

func (s *ipStore) get(ip string) *bucket {
	s.mu.Lock()
	defer s.mu.Unlock()
	if b, ok := s.buckets[ip]; ok {
		return b
	}
	b := &bucket{tokens: 10, lastFill: time.Now()}
	s.buckets[ip] = b
	return b
}

// RateLimit creates a per-IP token-bucket rate limiter.
// rate: tokens refilled per second; burst: max burst size.
func RateLimit(rate float64, burst float64) gin.HandlerFunc {
	store := &ipStore{buckets: make(map[string]*bucket)}
	return func(c *gin.Context) {
		ip := c.ClientIP()
		b := store.get(ip)
		if !b.allow(rate, burst) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, please slow down"})
			return
		}
		c.Next()
	}
}
