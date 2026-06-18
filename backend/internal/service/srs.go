package service

import (
	"math"
	"time"

	"github.com/chemlingo/backend/internal/model"
)

const (
	xpCorrect   = 10
	xpIncorrect = 0
	xpTimeBonus = 5 // awarded if answered in < 5 seconds
)

// SM2 applies the SM-2 spaced repetition algorithm.
// quality: 0-5 (0-2 = fail, 3-5 = pass)
func SM2(card *model.SRSCard, quality int) {
	if quality < 3 {
		card.Repetitions = 0
		card.IntervalDays = 1
	} else {
		switch card.Repetitions {
		case 0:
			card.IntervalDays = 1
		case 1:
			card.IntervalDays = 6
		default:
			card.IntervalDays = int(math.Round(float64(card.IntervalDays) * card.EaseFactor))
		}
		card.Repetitions++
	}

	card.EaseFactor += 0.1 - float64(5-quality)*(0.08+float64(5-quality)*0.02)
	if card.EaseFactor < 1.3 {
		card.EaseFactor = 1.3
	}

	card.NextReviewAt = time.Now().AddDate(0, 0, card.IntervalDays)
}

// CalcXP returns XP earned for an attempt
func CalcXP(isCorrect bool, timeTakenMs int) int {
	if !isCorrect {
		return xpIncorrect
	}
	xp := xpCorrect
	if timeTakenMs < 5000 {
		xp += xpTimeBonus
	}
	return xp
}

// QualityFromAttempt maps attempt result to SM-2 quality score
func QualityFromAttempt(isCorrect bool, timeTakenMs int) int {
	if !isCorrect {
		return 1
	}
	if timeTakenMs < 5000 {
		return 5
	}
	if timeTakenMs < 15000 {
		return 4
	}
	return 3
}
