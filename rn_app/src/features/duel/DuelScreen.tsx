import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { createOrJoinMatch } from '../../core/duelApi';
import { useDuelSocket } from '../../hooks/useDuelSocket';
import { HealthBar } from './components/HealthBar';
import {
  EquationDisplay,
  type EquationDisplayRef,
} from './components/EquationDisplay';
import { NumberChips } from './components/NumberChips';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmptySlots(count: number): (number | null)[] {
  return new Array(count).fill(null);
}

function nextEmptySlot(slots: (number | null)[], after = -1): number | null {
  const idx = slots.findIndex((v, i) => v === null && i > after);
  return idx === -1 ? null : idx;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DuelScreen() {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<0 | 1>(0);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const eqRef = useRef<EquationDisplayRef>(null);

  // Overlay fade-in for match-end screen
  const overlayOpacity = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const { phase, matchState, lastValidation, matchEnd, isConnected, sendAnswer } =
    useDuelSocket(matchId);

  // ── Join match on mount ────────────────────────────────────────────────────

  useEffect(() => {
    setJoining(true);
    createOrJoinMatch('Player') // name comes from user profile in a real build
      .then(({ match_id, player_index }) => {
        setMatchId(match_id);
        setPlayerIndex(player_index as 0 | 1);
        setJoinError(null);
      })
      .catch((e: Error) => setJoinError(e.message))
      .finally(() => setJoining(false));
  }, []);

  // ── Reset slots on each new round ─────────────────────────────────────────

  useEffect(() => {
    if (!matchState?.equation?.labels?.length) return;
    const empty = buildEmptySlots(matchState.equation.labels.length);
    setSlots(empty);
    setActiveSlot(0);
  }, [matchState?.current_round]);

  // ── React to validation results ───────────────────────────────────────────

  useEffect(() => {
    if (!lastValidation) return;
    if (lastValidation.correct) {
      eqRef.current?.flash();
    } else {
      eqRef.current?.shake();
    }
  }, [lastValidation]);

  // ── Fade-in match-end overlay ─────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'finished') {
      overlayOpacity.value = withTiming(1, { duration: 400 });
    }
  }, [phase]);

  // ── Interaction handlers ──────────────────────────────────────────────────

  const handleSlotPress = useCallback((idx: number) => {
    setActiveSlot(idx);
  }, []);

  const handleChipPress = useCallback(
    (value: number) => {
      if (activeSlot === null) return;
      setSlots((prev) => {
        const next = [...prev];
        next[activeSlot] = value;
        // Advance to the next empty slot automatically
        const next_ = nextEmptySlot(next, activeSlot);
        setActiveSlot(next_);
        return next;
      });
    },
    [activeSlot],
  );

  const handleSubmit = useCallback(() => {
    if (slots.some((v) => v === null)) return;
    sendAnswer(slots as number[]);
  }, [slots, sendAnswer]);

  const handleClear = useCallback(() => {
    if (!matchState?.equation) return;
    setSlots(buildEmptySlots(matchState.equation.labels.length));
    setActiveSlot(0);
  }, [matchState?.equation]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const allFilled = slots.length > 0 && slots.every((v) => v !== null);
  const mySolved = matchState?.progress[playerIndex]?.solved ?? false;
  const chipsDisabled = mySolved || phase !== 'round';

  const myProgress = matchState?.progress[playerIndex];
  const oppProgress = matchState?.progress[1 - playerIndex];
  const myName = matchState?.players[playerIndex]?.name ?? 'You';
  const oppName = matchState?.players[1 - playerIndex]?.name ?? 'Opponent';

  // ── Early-exit states ─────────────────────────────────────────────────────

  if (joining) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={s.statusText}>Finding an opponent…</Text>
      </SafeAreaView>
    );
  }

  if (joinError) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errorText}>{joinError}</Text>
      </SafeAreaView>
    );
  }

  if (phase === 'connecting' || phase === 'waiting' || !matchState) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={s.statusText}>
          {phase === 'connecting' ? 'Connecting…' : 'Waiting for opponent…'}
        </Text>
      </SafeAreaView>
    );
  }

  // ── Main game UI ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      {/* ── Top: dual health bars ─────────────────────────────────────────── */}
      <View style={s.header}>
        <HealthBar
          hp={myProgress?.hp ?? 100}
          name={myName}
          color="#6366F1"
        />
        <View style={s.vsTag}>
          <Text style={s.vsText}>VS</Text>
        </View>
        <HealthBar
          hp={oppProgress?.hp ?? 100}
          name={oppName}
          color="#EC4899"
          flipped
        />
      </View>

      {/* ── Round + timer context ─────────────────────────────────────────── */}
      <View style={s.roundBadge}>
        <Text style={s.roundText}>
          Round {matchState.current_round} / {matchState.total_rounds}
        </Text>
        {mySolved && (
          <View style={s.solvedPill}>
            <Text style={s.solvedPillText}>✓ Solved</Text>
          </View>
        )}
      </View>

      {/* ── Middle: equation display with coefficient slots ───────────────── */}
      <ScrollView
        contentContainerStyle={s.equationArea}
        scrollEnabled={false}
      >
        <EquationDisplay
          ref={eqRef}
          equation={matchState.equation}
          slots={slots}
          activeSlotIndex={mySolved ? null : activeSlot}
          onSlotPress={handleSlotPress}
        />

        {/* Wrong attempt counter */}
        {(myProgress?.wrong_attempts ?? 0) > 0 && !mySolved && (
          <Text style={s.wrongCounter}>
            ✗ {myProgress!.wrong_attempts} wrong attempt
            {myProgress!.wrong_attempts > 1 ? 's' : ''} (−
            {(myProgress!.wrong_attempts * 10).toFixed(0)}% damage)
          </Text>
        )}
      </ScrollView>

      {/* ── Between rounds overlay ────────────────────────────────────────── */}
      {phase === 'between_rounds' && (
        <View style={s.betweenRoundsOverlay}>
          <Text style={s.betweenRoundsText}>
            Next round in a moment…
          </Text>
        </View>
      )}

      {/* ── Bottom: number chips + submit ─────────────────────────────────── */}
      {!mySolved && phase === 'round' && (
        <View style={s.bottomPanel}>
          <NumberChips
            chipMax={matchState.equation.chip_max}
            onChipPress={handleChipPress}
            disabled={chipsDisabled}
          />

          <View style={s.actionRow}>
            <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
              <Text style={s.clearBtnText}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.submitBtn, !allFilled && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!allFilled}
            >
              <Text style={s.submitBtnText}>Submit ⚡</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {mySolved && phase === 'round' && (
        <View style={s.waitingPanel}>
          <Text style={s.waitingText}>Waiting for opponent…</Text>
        </View>
      )}

      {/* ── Match-end overlay ─────────────────────────────────────────────── */}
      {phase === 'finished' && matchEnd && (
        <Animated.View style={[s.matchEndOverlay, overlayStyle]}>
          <Text style={s.matchEndEmoji}>
            {matchEnd.winner_id === myProgress?.player_id ? '🏆' : '💀'}
          </Text>
          <Text style={s.matchEndTitle}>
            {matchEnd.winner_id === myProgress?.player_id ? 'You Win!' : 'You Lose!'}
          </Text>
          <Text style={s.matchEndSub}>
            {matchEnd.winner_id === myProgress?.player_id
              ? 'Great chemistry instincts!'
              : 'Better luck next time!'}
          </Text>
          <View style={s.finalScores}>
            <Text style={s.finalScore}>
              {myName}: {Math.ceil(myProgress?.hp ?? 0)} HP
            </Text>
            <Text style={s.finalScore}>
              {oppName}: {Math.ceil(oppProgress?.hp ?? 0)} HP
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#FAFAFA' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 8,
  },
  vsTag: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsText: { color: '#FFFFFF', fontWeight: '800', fontSize: 10 },

  // Round badge
  roundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  roundText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  solvedPill: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  solvedPillText: { fontSize: 12, fontWeight: '700', color: '#059669' },

  // Equation area
  equationArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  // Wrong attempts
  wrongCounter: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },

  // Between rounds overlay
  betweenRoundsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  betweenRoundsText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Bottom panel
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  clearBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  submitBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#C7D2FE', shadowOpacity: 0, elevation: 0 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Waiting panel (after player solves)
  waitingPanel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    padding: 24,
    alignItems: 'center',
  },
  waitingText: { fontSize: 15, color: '#6B7280' },

  // Match-end overlay
  matchEndOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  matchEndEmoji: { fontSize: 72 },
  matchEndTitle: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  matchEndSub: { fontSize: 16, color: '#D1D5DB' },
  finalScores: { marginTop: 16, gap: 6, alignItems: 'center' },
  finalScore: { fontSize: 15, color: '#9CA3AF' },

  // Status / error
  statusText: { fontSize: 16, color: '#6B7280', marginTop: 12 },
  errorText: { fontSize: 15, color: '#EF4444' },
});
