import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
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
import { getTier, getTierIndex } from '../../core/profileApi';
import { useDuelSocket } from '../../hooks/useDuelSocket';
import RankUpModal from '../rank/RankUpModal';
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

function fmtMs(ms: number): string {
  if (ms <= 0) return '0.0s';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

// ── Confetti ──────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#6366F1','#F59E0B','#22C55E','#EC4899','#F97316','#3B82F6','#A78BFA','#34D399'];

function Confetti({ visible }: { visible: boolean }) {
  const particles = useRef(
    Array.from({ length: 36 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 70 + Math.random() * 160;
      return {
        x: new RNAnimated.Value(0), y: new RNAnimated.Value(0),
        opacity: new RNAnimated.Value(0), rotate: new RNAnimated.Value(0),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        circle: Math.random() > 0.5,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 90,
      };
    })
  ).current;

  useEffect(() => {
    if (!visible) return;
    const anims = particles.map((p) => {
      p.x.setValue(0); p.y.setValue(0); p.opacity.setValue(1); p.rotate.setValue(0);
      return RNAnimated.parallel([
        RNAnimated.timing(p.x, { toValue: p.dx, duration: 1000, useNativeDriver: true }),
        RNAnimated.timing(p.y, { toValue: p.dy, duration: 1000, useNativeDriver: true }),
        RNAnimated.timing(p.rotate, { toValue: 8, duration: 1000, useNativeDriver: true }),
        RNAnimated.sequence([
          RNAnimated.delay(500),
          RNAnimated.timing(p.opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      ]);
    });
    RNAnimated.parallel(anims).start();
  }, [visible]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const spin = p.rotate.interpolate({ inputRange: [0,8], outputRange: ['0deg','1440deg'] });
        return (
          <RNAnimated.View key={i} style={{
            position:'absolute', top:'45%', left:'47%',
            width: p.circle ? 10 : 8, height: p.circle ? 10 : 16,
            backgroundColor: p.color, borderRadius: p.circle ? 5 : 2,
            opacity: p.opacity,
            transform: [{ translateX: p.x },{ translateY: p.y },{ rotate: spin }],
          }} />
        );
      })}
    </View>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function RaceBar({
  name, solved, total, finished, totalMs, roundStartedAt, isMe,
}: {
  name: string;
  solved: number;
  total: number;
  finished: boolean;
  totalMs: number;
  roundStartedAt: string | null;
  isMe: boolean;
}) {
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    if (finished || !roundStartedAt) { setExtra(0); return; }
    const start = new Date(roundStartedAt).getTime();
    const id = setInterval(() => setExtra(Date.now() - start), 100);
    return () => clearInterval(id);
  }, [roundStartedAt, finished, solved]); // reset when round advances

  const pct = total > 0 ? Math.min(solved / total, 1) : 0;
  const displayTime = finished ? totalMs : totalMs + extra;

  return (
    <View style={rb.wrap}>
      <View style={rb.row}>
        <Text style={[rb.name, isMe && rb.nameMe]} numberOfLines={1}>{name}</Text>
        <Text style={[rb.time, finished && rb.timeDone]}>
          {finished ? `✓ ${fmtMs(displayTime)}` : fmtMs(displayTime)}
        </Text>
        <Text style={rb.count}>{solved}/{total}</Text>
      </View>
      <View style={rb.track}>
        <View style={[rb.fill, isMe ? rb.fillMe : rb.fillOpp, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const rb = StyleSheet.create({
  wrap: { marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  name: { flex: 1, fontSize: 13, fontWeight: '600', color: '#6B7280' },
  nameMe: { color: '#1F2937' },
  time: { fontSize: 13, fontWeight: '700', color: '#6B7280', minWidth: 60, textAlign: 'right' },
  timeDone: { color: '#059669' },
  count: { fontSize: 12, color: '#9CA3AF', minWidth: 28, textAlign: 'right' },
  track: { height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  fillMe:  { backgroundColor: '#6366F1' },
  fillOpp: { backgroundColor: '#EC4899' },
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function DuelScreen({ navigation }: { navigation: any }) {
  const [matchId, setMatchId]       = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<0 | 1>(0);
  const [joining, setJoining]       = useState(false);
  const [joinError, setJoinError]   = useState<string | null>(null);

  // Local equation slots
  const [slots, setSlots]         = useState<(number | null)[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  // Which equation index we are displaying locally (0-indexed)
  const [equationIdx, setEquationIdx] = useState(0);

  const [showConfetti, setShowConfetti] = useState(false);
  const [showRankUp, setShowRankUp]     = useState(false);

  const eqRef = useRef<EquationDisplayRef>(null);
  const overlayOpacity = useSharedValue(0);
  const overlayStyle   = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const { phase, matchState, lastValidation, matchEnd, sendAnswer } =
    useDuelSocket(matchId);

  // ── Join match ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setJoining(true);
    createOrJoinMatch('Player')
      .then(({ match_id, player_index }) => {
        setMatchId(match_id);
        setPlayerIndex(player_index as 0 | 1);
        setJoinError(null);
      })
      .catch((e: Error) => setJoinError(e.message))
      .finally(() => setJoining(false));
  }, []);

  // ── Reset slots when equation changes ─────────────────────────────────────

  const currentEquation = matchState?.equations?.[equationIdx] ?? null;

  useEffect(() => {
    if (!currentEquation) return;
    setSlots(buildEmptySlots(currentEquation.labels.length));
    setActiveSlot(0);
  }, [equationIdx, currentEquation?.id]);

  // ── Validation result ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastValidation) return;
    if (lastValidation.correct) {
      eqRef.current?.flash();
      // Advance to next equation immediately — no waiting for opponent
      setEquationIdx((i) => i + 1);
    } else {
      eqRef.current?.shake();
    }
  }, [lastValidation]);

  // ── Match end ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'finished' || !matchEnd) return;
    overlayOpacity.value = withTiming(1, { duration: 500 });
    const isWinner = matchEnd.winner_id === matchState?.progress[playerIndex]?.player_id;
    if (isWinner) {
      setTimeout(() => setShowConfetti(true), 350);
      setTimeout(() => setShowConfetti(false), 1600);
    }
  }, [phase, matchEnd]);

  // ── Interaction ───────────────────────────────────────────────────────────

  const handleSlotPress = useCallback((idx: number) => setActiveSlot(idx), []);

  const handleChipPress = useCallback((value: number) => {
    if (activeSlot === null) return;
    setSlots((prev) => {
      const next = [...prev];
      next[activeSlot] = value;
      setActiveSlot(nextEmptySlot(next, activeSlot));
      return next;
    });
  }, [activeSlot]);

  const handleSubmit = useCallback(() => {
    if (slots.some((v) => v === null)) return;
    sendAnswer(slots as number[]);
  }, [slots, sendAnswer]);

  const handleClear = useCallback(() => {
    if (!currentEquation) return;
    setSlots(buildEmptySlots(currentEquation.labels.length));
    setActiveSlot(0);
  }, [currentEquation]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const allFilled   = slots.length > 0 && slots.every((v) => v !== null);
  const myProgress  = matchState?.progress[playerIndex];
  const oppProgress = matchState?.progress[1 - playerIndex];
  const myName      = matchState?.players[playerIndex]?.name ?? 'You';
  const oppName     = matchState?.players[1 - playerIndex]?.name ?? 'Opponent';
  const totalRounds = matchState?.total_rounds ?? 0;
  const myFinished  = myProgress?.finished ?? false;
  const isWinner    = matchEnd?.winner_id === myProgress?.player_id;
  const isTie       = matchEnd !== null && matchEnd?.winner_id === '';
  const myRating    = matchEnd?.rating_changes?.find(
    (rc) => rc.player_id === myProgress?.player_id
  ) ?? null;

  // Detect rank-up from rating change
  const rankUpData = (() => {
    if (!myRating || myRating.delta <= 0) return null;
    const before = getTier(myRating.before);
    const after  = getTier(myRating.after);
    if (getTierIndex(after) > getTierIndex(before)) return { before, after };
    return null;
  })();

  // ── Early states ──────────────────────────────────────────────────────────

  if (joining) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={s.statusText}>Finding an opponent…</Text>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  if (joinError) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.errorText}>{joinError}</Text>
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtnText}>Back to Home</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Main race UI ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Progress bars (top) ───────────────────────────────────────────── */}
      <View style={s.progressPanel}>
        <RaceBar
          name={myName}
          solved={myProgress?.rounds_solved ?? 0}
          total={totalRounds}
          finished={myFinished}
          totalMs={myProgress?.total_time_ms ?? 0}
          roundStartedAt={myProgress?.round_started_at ?? null}
          isMe={true}
        />
        <RaceBar
          name={oppName}
          solved={oppProgress?.rounds_solved ?? 0}
          total={totalRounds}
          finished={oppProgress?.finished ?? false}
          totalMs={oppProgress?.total_time_ms ?? 0}
          roundStartedAt={null}   // we don't tick opponent's clock on the client
          isMe={false}
        />
      </View>

      {/* ── Equation counter ──────────────────────────────────────────────── */}
      <View style={s.eqBadge}>
        <Text style={s.eqBadgeText}>
          {myFinished
            ? '✓ All done! Waiting for opponent…'
            : `Question ${equationIdx + 1} of ${totalRounds}`}
        </Text>
        {currentEquation && (
          <View style={s.diffPill}>
            <Text style={s.diffText}>{currentEquation.difficulty}</Text>
          </View>
        )}
      </View>

      {/* ── Equation + wrong attempt counter ─────────────────────────────── */}
      {!myFinished && currentEquation ? (
        <>
          <ScrollView contentContainerStyle={s.equationArea} scrollEnabled={false}>
            <EquationDisplay
              ref={eqRef}
              equation={currentEquation}
              slots={slots}
              activeSlotIndex={activeSlot}
              onSlotPress={handleSlotPress}
            />
            {(myProgress?.wrong_attempts ?? 0) > 0 && (
              <Text style={s.wrongCounter}>
                ✗ {myProgress!.wrong_attempts} wrong
                {myProgress!.wrong_attempts > 1 ? ' attempts' : ' attempt'}
              </Text>
            )}
          </ScrollView>

          {/* ── Number chips + submit ─────────────────────────────────────── */}
          <View style={s.bottomPanel}>
            <NumberChips
              chipMax={currentEquation.chip_max}
              onChipPress={handleChipPress}
              disabled={false}
            />
            <View style={s.actionRow}>
              <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
                <Text style={s.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, !allFilled && s.submitBtnOff]}
                onPress={handleSubmit}
                disabled={!allFilled}
              >
                <Text style={s.submitBtnText}>Submit ⚡</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        // You finished — show your time while opponent is still going
        !myFinished ? null : (
          <View style={s.finishedWait}>
            <Text style={s.finishedEmoji}>⏳</Text>
            <Text style={s.finishedTitle}>You finished!</Text>
            <Text style={s.finishedTime}>Your time: {fmtMs(myProgress?.total_time_ms ?? 0)}</Text>
            <Text style={s.finishedSub}>Waiting for {oppName} to complete…</Text>
          </View>
        )
      )}

      {/* ── Match-end overlay ─────────────────────────────────────────────── */}
      {phase === 'finished' && matchEnd && (
        <Animated.View style={[s.endOverlay, overlayStyle]}>
          <Text style={s.endEmoji}>{isTie ? '🤝' : isWinner ? '🏆' : '💀'}</Text>
          <Text style={s.endTitle}>{isTie ? "It's a Tie!" : isWinner ? 'You Win!' : 'You Lose!'}</Text>

          {/* Side-by-side time cards */}
          <View style={s.endCards}>
            <View style={[s.endCard, isWinner && s.endCardGold]}>
              <Text style={s.endCardName}>{myName}</Text>
              <Text style={[s.endCardTime, isWinner && s.endCardTimeGold]}>
                {fmtMs(myProgress?.total_time_ms ?? 0)}
              </Text>
              <Text style={s.endCardSub}>
                {myProgress?.rounds_solved ?? 0}/{totalRounds} solved
              </Text>
            </View>
            <Text style={s.endVs}>vs</Text>
            <View style={[s.endCard, !isWinner && !isTie && s.endCardGold]}>
              <Text style={s.endCardName}>{oppName}</Text>
              <Text style={[s.endCardTime, !isWinner && !isTie && s.endCardTimeGold]}>
                {fmtMs(oppProgress?.total_time_ms ?? 0)}
              </Text>
              <Text style={s.endCardSub}>
                {oppProgress?.rounds_solved ?? 0}/{totalRounds} solved
              </Text>
            </View>
          </View>

          {!isTie && (
            <Text style={s.endDiff}>
              {isWinner
                ? `${fmtMs(Math.abs((oppProgress?.total_time_ms ?? 0) - (myProgress?.total_time_ms ?? 0)))} faster`
                : `${fmtMs(Math.abs((myProgress?.total_time_ms ?? 0) - (oppProgress?.total_time_ms ?? 0)))} slower`}
            </Text>
          )}

          {myRating && (
            <View style={s.ratingRow}>
              <Text style={s.ratingLabel}>Rating</Text>
              <Text style={s.ratingBefore}>
                {getTier(myRating.before).emoji} {myRating.before}
              </Text>
              <Text style={s.ratingArrow}>→</Text>
              <Text style={s.ratingAfter}>
                {getTier(myRating.after).emoji} {myRating.after}
              </Text>
              <Text style={[s.ratingDelta, myRating.delta >= 0 ? s.ratingPos : s.ratingNeg]}>
                {myRating.delta >= 0 ? `+${myRating.delta}` : `${myRating.delta}`}
              </Text>
            </View>
          )}

          {/* Rank-up banner — shown when tier improved */}
          {rankUpData && (
            <View style={[s.rankUpBanner, { borderColor: rankUpData.after.color + '60' }]}>
              <Text style={s.rankUpBannerIcon}>⬆</Text>
              <Text style={[s.rankUpBannerText, { color: rankUpData.after.color }]}>
                PROMOTED TO {rankUpData.after.name.toUpperCase()}
              </Text>
              <Text style={s.rankUpBannerEmoji}>{rankUpData.after.emoji}</Text>
            </View>
          )}

          {/* Continue / Claim rank button */}
          {rankUpData ? (
            <TouchableOpacity
              style={[s.homeBtn, { backgroundColor: rankUpData.after.color }]}
              onPress={() => setShowRankUp(true)}
            >
              <Text style={s.homeBtnText}>⬆ Claim Rank</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.homeBtn} onPress={() => navigation.navigate('CompeteHome')}>
              <Text style={s.homeBtnText}>Continue</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      <Confetti visible={showConfetti} />

      {rankUpData && (
        <RankUpModal
          visible={showRankUp}
          oldTier={rankUpData.before}
          newTier={rankUpData.after}
          onContinue={() => {
            setShowRankUp(false);
            navigation.navigate('CompeteHome');
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC' },

  progressPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },

  eqBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  eqBadgeText: { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  diffPill: {
    backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  diffText: { fontSize: 11, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase' },

  equationArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  wrongCounter: { textAlign: 'center', marginTop: 8, fontSize: 12, color: '#EF4444', fontWeight: '500' },

  bottomPanel: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingBottom: 8 },
  actionRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  clearBtn: {
    flex: 1, height: 48, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#D1D5DB',
    justifyContent: 'center', alignItems: 'center',
  },
  clearBtnText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  submitBtn: { flex: 2, height: 48, borderRadius: 12, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  submitBtnOff: { backgroundColor: '#C7D2FE', elevation: 0 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  finishedWait: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  finishedEmoji: { fontSize: 52 },
  finishedTitle: { fontSize: 24, fontWeight: '800', color: '#1F2937' },
  finishedTime: { fontSize: 20, fontWeight: '700', color: '#059669' },
  finishedSub: { fontSize: 14, color: '#6B7280', marginTop: 4 },

  endOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.95)',
    justifyContent: 'center', alignItems: 'center', gap: 12, zIndex: 10,
  },
  endEmoji: { fontSize: 72 },
  endTitle: { fontSize: 34, fontWeight: '900', color: '#FFFFFF' },

  endCards: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  endCard: {
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20,
    backgroundColor: '#1E293B', borderRadius: 16,
    borderWidth: 2, borderColor: '#334155',
  },
  endCardGold: { borderColor: '#FFD700', backgroundColor: '#1C1A0A' },
  endCardName: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
  endCardTime: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  endCardTimeGold: { color: '#FFD700' },
  endCardSub: { fontSize: 11, color: '#475569', marginTop: 4 },
  endVs: { fontSize: 14, color: '#475569', fontWeight: '700' },

  endDiff: { fontSize: 14, color: '#94A3B8' },

  ratingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1E293B', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  ratingLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginRight: 4 },
  ratingBefore: { fontSize: 18, fontWeight: '700', color: '#94A3B8' },
  ratingArrow: { fontSize: 14, color: '#475569' },
  ratingAfter: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  ratingDelta: { fontSize: 16, fontWeight: '800', marginLeft: 6 },
  ratingPos: { color: '#22C55E' },
  ratingNeg: { color: '#EF4444' },

  rankUpBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#1E293B',
  },
  rankUpBannerIcon:  { fontSize: 16, color: '#F59E0B', fontWeight: '900' },
  rankUpBannerText:  { fontSize: 13, fontWeight: '900', letterSpacing: 1, flex: 1 },
  rankUpBannerEmoji: { fontSize: 20 },

  homeBtn: { marginTop: 8, backgroundColor: '#6366F1', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 16 },
  homeBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },

  statusText: { fontSize: 16, color: '#6B7280', marginTop: 12 },
  errorText: { fontSize: 15, color: '#EF4444' },
  cancelBtn: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#D1D5DB' },
  cancelBtnText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
});
