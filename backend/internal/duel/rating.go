package duel

import "math"

const (
	StartingRating = 1200
	kFactor        = 32.0
)

// ComputeElo returns the Elo delta for a player given their rating, their
// opponent's rating, and whether they won (won=true), tied (won=false,tied=true),
// or lost (won=false,tied=false).
func ComputeElo(myRating, oppRating int, won, tied bool) int {
	expected := 1.0 / (1.0 + math.Pow(10, float64(oppRating-myRating)/400.0))
	var actual float64
	switch {
	case won:
		actual = 1.0
	case tied:
		actual = 0.5
	default:
		actual = 0.0
	}
	return int(math.Round(kFactor * (actual - expected)))
}

// TierForRating returns a human-readable tier name for a given rating.
func TierForRating(r int) string {
	switch {
	case r >= 2000:
		return "Master"
	case r >= 1800:
		return "Diamond"
	case r >= 1600:
		return "Platinum"
	case r >= 1400:
		return "Gold"
	case r >= 1200:
		return "Silver"
	default:
		return "Bronze"
	}
}
