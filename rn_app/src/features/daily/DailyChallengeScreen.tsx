import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ChallengeQuestion,
  type DailyChallengeLeaderboardEntry,
  type DailyChallengeSubmission,
  type QuestionResult,
  type SubmitChallengeResponse,
  fetchDailyChallenge,
  fetchDailyChallengeLeaderboard,
  submitDailyChallenge,
} from '../../core/profileApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s % 60}s`;
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function diffColor(d: string) {
  return d === 'easy' ? '#22C55E' : d === 'medium' ? '#F59E0B' : '#EF4444';
}

function typeLabel(type: string) {
  return type === 'true_false' ? 'True / False'
       : type === 'element_id' ? 'Element ID'
       : type === 'balancing'  ? 'Balance Equation'
       : 'MCQ';
}

function typeIcon(type: string) {
  return type === 'true_false' ? '⚖️'
       : type === 'element_id' ? '⚛️'
       : type === 'balancing'  ? '⚗️'
       : '🔬';
}

// ── Choice question UI (MCQ / element_id / true_false) ─────────────────────

function ChoiceQuestion({
  question, selected, onSelect,
}: { question: ChallengeQuestion; selected: number | null; onSelect: (i: number) => void }) {
  return (
    <View style={cq.wrap}>
      <Text style={cq.prompt}>{question.prompt}</Text>
      <View style={cq.optionsWrap}>
        {question.options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[cq.option, selected === i && cq.optionSelected]}
            onPress={() => onSelect(i)}
            activeOpacity={0.75}
          >
            <View style={[cq.optionBadge, selected === i && cq.optionBadgeSelected]}>
              <Text style={[cq.optionBadgeText, selected === i && cq.optionBadgeTextSelected]}>
                {question.type === 'true_false' ? (i === 0 ? 'T' : 'F') : String.fromCharCode(65 + i)}
              </Text>
            </View>
            <Text style={[cq.optionText, selected === i && cq.optionTextSelected]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const cq = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 8, flex: 1 },
  prompt: {
    fontSize: 20, fontWeight: '700', color: '#F1F5F9', lineHeight: 28,
    textAlign: 'center', marginBottom: 24, paddingHorizontal: 8,
  },
  optionsWrap: { gap: 10 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1E293B', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#334155',
    padding: 14,
  },
  optionSelected: { borderColor: '#6366F1', backgroundColor: '#1E1E3A' },
  optionBadge: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#475569',
    alignItems: 'center', justifyContent: 'center',
  },
  optionBadgeSelected: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  optionBadgeText: { fontSize: 13, fontWeight: '800', color: '#64748B' },
  optionBadgeTextSelected: { color: '#fff' },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  optionTextSelected: { color: '#E2E8F0' },
});

// ── Balancing equation UI (legacy chip slots) ─────────────────────────────

function EquationSlot({ value, active, onPress }: { value: number | null; active: boolean; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])).start();
    } else { pulse.stopAnimation(); pulse.setValue(1); }
  }, [active]);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Animated.View style={[eq.slot, active && eq.slotActive, { transform: [{ scale: pulse }] }]}>
        <Text style={[eq.slotText, active && eq.slotTextActive, value === null && eq.slotPlaceholder]}>
          {value !== null ? String(value) : '?'}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const eq = StyleSheet.create({
  slot: {
    minWidth: 32, height: 36, borderRadius: 8,
    backgroundColor: '#1E293B', borderWidth: 1.5, borderColor: '#334155',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  slotActive:      { borderColor: '#6366F1', backgroundColor: '#1E1E3A' },
  slotText:        { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  slotTextActive:  { color: '#818CF8' },
  slotPlaceholder: { color: '#475569' },
});

function NumberPad({ onNumber, onClear }: { onNumber: (n: number) => void; onClear: () => void }) {
  return (
    <View style={np.wrap}>
      {[1,2,3,4,5,6,7,8,9].map(n => (
        <TouchableOpacity key={n} onPress={() => onNumber(n)} style={np.chip}>
          <Text style={np.chipText}>{n}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onClear} style={[np.chip, np.clearChip]}>
        <Text style={[np.chipText, np.clearText]}>⌫</Text>
      </TouchableOpacity>
    </View>
  );
}

const np = StyleSheet.create({
  wrap:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  chip:      { width: 52, height: 52, borderRadius: 14, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  chipText:  { fontSize: 20, fontWeight: '700', color: '#F8FAFC' },
  clearChip: { borderColor: '#EF444440', backgroundColor: '#450A0A' },
  clearText: { color: '#F87171' },
});

// ── Leaderboard row ───────────────────────────────────────────────────────────

function DCLeaderboardRow({ entry, isMe }: { entry: DailyChallengeLeaderboardEntry; isMe: boolean }) {
  const pct = entry.total_questions > 0 ? Math.round((entry.correct_answers / entry.total_questions) * 100) : 0;
  const medal = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : null;
  return (
    <View style={[lb.row, isMe && lb.rowMe]}>
      <Text style={[lb.pos, isMe && { color: '#818CF8' }]}>{medal ?? `#${entry.position}`}</Text>
      <View style={lb.mid}>
        <Text style={[lb.name, isMe && { color: '#818CF8' }]} numberOfLines={1}>{entry.name}{isMe ? ' (You)' : ''}</Text>
        <Text style={lb.sub}>{pct}% · {fmtMs(entry.completion_time_ms)}</Text>
      </View>
      <Text style={lb.score}>{entry.score}</Text>
    </View>
  );
}

const lb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B', gap: 12 },
  rowMe: { backgroundColor: '#1E1E3A' },
  pos:   { width: 36, fontSize: 14, fontWeight: '800', color: '#64748B', textAlign: 'center' },
  mid:   { flex: 1, gap: 2 },
  name:  { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  sub:   { fontSize: 11, color: '#64748B' },
  score: { fontSize: 16, fontWeight: '900', color: '#F59E0B' },
});

// ── Recorded answer type ──────────────────────────────────────────────────────

interface RecordedAnswer {
  question_id: string;
  selected_index: number;
  coefficients: number[];
}

// ── Screen ────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'intro' | 'quiz' | 'submitting' | 'results';

export default function DailyChallengeScreen({ navigation }: { navigation: any }) {
  // data
  const [questions,    setQuestions]    = useState<ChallengeQuestion[]>([]);
  const [date,         setDate]         = useState('');
  const [secsToReset,  setSecsToReset]  = useState(0);
  const [phase,        setPhase]        = useState<Phase>('loading');
  const [existingSub,  setExistingSub]  = useState<DailyChallengeSubmission | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitChallengeResponse | null>(null);
  const [lbEntries,    setLbEntries]    = useState<DailyChallengeLeaderboardEntry[]>([]);
  const [myPlayerId,   setMyPlayerId]   = useState('');
  const [lbTab,        setLbTab]        = useState<'score' | 'fastest'>('score');

  // quiz state
  const [currentQ,       setCurrentQ]       = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null); // for choice types
  const [slots,          setSlots]          = useState<(number | null)[]>([]); // for balancing
  const [activeSlot,     setActiveSlot]     = useState(0);
  const [recorded,       setRecorded]       = useState<RecordedAnswer[]>([]);
  const startTimeRef = useRef<number>(0);
  const [elapsed,        setElapsed]        = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // countdown
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = setInterval(() => setSecsToReset(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => { setCountdown(fmtCountdown(secsToReset)); }, [secsToReset]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await fetchDailyChallengeLeaderboard();
      setLbEntries(res.entries);
      setMyPlayerId(res.my_player_id);
    } catch {}
  }, []);

  // initial load
  useEffect(() => {
    fetchDailyChallenge().then(res => {
      setQuestions(res.questions);
      setDate(res.date);
      setSecsToReset(res.secs_to_reset);
      if (res.my_submission) {
        setExistingSub(res.my_submission);
        loadLeaderboard();
        setPhase('results');
      } else {
        setPhase('intro');
      }
    }).catch(() => setPhase('intro'));
  }, []);

  // reset per-question state when question changes
  useEffect(() => {
    if (phase !== 'quiz' || questions.length === 0) return;
    const q = questions[currentQ];
    setSelectedOption(null);
    if (q.type === 'balancing') {
      // balancing slots are derived from options count (legacy)
      setSlots(new Array(q.options?.length ?? 4).fill(null));
      setActiveSlot(0);
    }
  }, [currentQ, phase]);

  const startChallenge = () => {
    setCurrentQ(0); setRecorded([]); setElapsed(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 500);
    setPhase('quiz');
  };

  const isChoiceType = (q: ChallengeQuestion) => q.type !== 'balancing';

  const canAdvance = () => {
    const q = questions[currentQ];
    if (!q) return false;
    return isChoiceType(q) ? selectedOption !== null : slots.every(s => s !== null);
  };

  const handleNext = () => {
    const q = questions[currentQ];
    const answer: RecordedAnswer = isChoiceType(q)
      ? { question_id: q.id, selected_index: selectedOption ?? -1, coefficients: [] }
      : { question_id: q.id, selected_index: -1, coefficients: slots as number[] };

    const newRecorded = [...recorded, answer];

    if (currentQ < questions.length - 1) {
      setRecorded(newRecorded);
      setCurrentQ(c => c + 1);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      const timeMs = Date.now() - startTimeRef.current;
      setPhase('submitting');
      submitDailyChallenge({ completion_time_ms: timeMs, answers: newRecorded })
        .then(res => { setSubmitResult(res); loadLeaderboard(); setPhase('results'); })
        .catch(() => setPhase('results'));
    }
  };

  // slide animation per question
  const slideX = useRef(new Animated.Value(60)).current;
  const slideOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'quiz') return;
    slideX.setValue(60); slideOp.setValue(0);
    Animated.parallel([
      Animated.timing(slideX,  { toValue: 0,   duration: 300, useNativeDriver: true }),
      Animated.timing(slideOp, { toValue: 1,   duration: 300, useNativeDriver: true }),
    ]).start();
  }, [currentQ, phase]);

  const displayDate = date ? new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }) : '';

  const renderHeader = (title: string) => (
    <View style={s.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <Text style={s.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 60 }} />
    </View>
  );

  // ── LOADING
  if (phase === 'loading') return (
    <SafeAreaView style={s.safe}>
      {renderHeader('Daily Challenge')}
      <View style={s.center}><ActivityIndicator size="large" color="#F59E0B" /></View>
    </SafeAreaView>
  );

  // ── SUBMITTING
  if (phase === 'submitting') return (
    <SafeAreaView style={s.safe}>
      {renderHeader('Daily Challenge')}
      <View style={s.center}>
        <Text style={{ fontSize: 48 }}>⚗️</Text>
        <Text style={s.submittingText}>Calculating results…</Text>
        <ActivityIndicator size="small" color="#F59E0B" style={{ marginTop: 12 }} />
      </View>
    </SafeAreaView>
  );

  // ── INTRO
  if (phase === 'intro') {
    const typeCounts: Record<string, number> = {};
    questions.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] ?? 0) + 1; });
    return (
      <SafeAreaView style={s.safe}>
        {renderHeader('Daily Challenge')}
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={intro.banner}>
            <Text style={intro.bannerEmoji}>📅</Text>
            <Text style={intro.bannerTitle}>Today's Challenge</Text>
            <Text style={intro.bannerDate}>{displayDate}</Text>
          </View>

          <View style={intro.card}>
            <Text style={intro.sectionLabel}>WHAT TO EXPECT</Text>
            <View style={intro.infoRow}>
              <Text style={intro.infoIcon}>🎯</Text>
              <Text style={intro.infoText}>{questions.length} mixed chemistry questions</Text>
            </View>
            <View style={intro.infoRow}>
              <Text style={intro.infoIcon}>⏱️</Text>
              <Text style={intro.infoText}>Timer starts when you tap Start</Text>
            </View>
            <View style={intro.infoRow}>
              <Text style={intro.infoIcon}>🔒</Text>
              <Text style={intro.infoText}>One attempt per day — make it count!</Text>
            </View>
            <View style={intro.infoRow}>
              <Text style={intro.infoIcon}>🏆</Text>
              <Text style={intro.infoText}>Compete on today's leaderboard</Text>
            </View>

            <View style={intro.divider} />
            <Text style={intro.sectionLabel}>QUESTION TYPES TODAY</Text>
            <View style={intro.typeRow}>
              {Object.entries(typeCounts).map(([type, count]) => (
                <View key={type} style={intro.typePill}>
                  <Text style={intro.typePillIcon}>{typeIcon(type)}</Text>
                  <Text style={intro.typePillText}>{count}× {typeLabel(type)}</Text>
                </View>
              ))}
            </View>

            <View style={intro.divider} />
            <Text style={intro.sectionLabel}>REWARDS</Text>
            <View style={{ gap: 4 }}>
              <Text style={intro.rewardItem}>✦ 50 XP for completing</Text>
              <Text style={intro.rewardItem}>✦ 20 XP per correct answer</Text>
              <Text style={intro.rewardItem}>✦ 100 XP for perfect accuracy</Text>
              <Text style={intro.rewardItem}>✦ 50 XP speed bonus (under 90s)</Text>
            </View>
          </View>

          <View style={intro.countdownCard}>
            <Text style={intro.countdownLabel}>Next challenge in</Text>
            <Text style={intro.countdown}>{countdown}</Text>
          </View>

          <TouchableOpacity onPress={startChallenge} style={intro.startBtn}>
            <Text style={intro.startBtnText}>START CHALLENGE</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── QUIZ
  if (phase === 'quiz') {
    const q = questions[currentQ];
    if (!q) return null;
    const progress = (currentQ / questions.length) * 100;

    return (
      <SafeAreaView style={s.safe}>
        {renderHeader(`Q ${currentQ + 1} / ${questions.length}`)}

        {/* Progress bar */}
        <View style={quiz.progressTrack}>
          <View style={[quiz.progressFill, { width: `${progress}%` as any }]} />
        </View>

        {/* Meta row */}
        <View style={quiz.meta}>
          <View style={quiz.typePill}>
            <Text style={quiz.typeIcon}>{typeIcon(q.type)}</Text>
            <Text style={quiz.typeText}>{typeLabel(q.type)}</Text>
          </View>
          <View style={[quiz.diffPill, { backgroundColor: diffColor(q.difficulty) + '22', borderColor: diffColor(q.difficulty) + '55' }]}>
            <Text style={[quiz.diffText, { color: diffColor(q.difficulty) }]}>{q.difficulty}</Text>
          </View>
          <Text style={quiz.timer}>⏱ {fmtMs(elapsed)}</Text>
        </View>

        {/* Question card */}
        <Animated.View style={{ flex: 1, transform: [{ translateX: slideX }], opacity: slideOp }}>
          {isChoiceType(q) ? (
            <ChoiceQuestion question={q} selected={selectedOption} onSelect={setSelectedOption} />
          ) : (
            /* Balancing UI — prompt as equation display + number pad */
            <View style={quiz.balancingWrap}>
              <Text style={quiz.balancingPrompt}>{q.prompt}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                {slots.map((v, i) => (
                  <EquationSlot key={i} value={v} active={activeSlot === i} onPress={() => setActiveSlot(i)} />
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        {/* Number pad for balancing only */}
        {!isChoiceType(q) && (
          <View style={quiz.padWrap}>
            <NumberPad
              onNumber={n => { setSlots(prev => { const next = [...prev]; next[activeSlot] = n; return next; }); }}
              onClear={() => { setSlots(prev => { const next = [...prev]; next[activeSlot] = null; return next; }); }}
            />
          </View>
        )}

        {/* Next / Finish button */}
        <View style={quiz.nextWrap}>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!canAdvance()}
            style={[quiz.nextBtn, !canAdvance() && quiz.nextBtnDisabled]}
          >
            <Text style={quiz.nextBtnText}>
              {currentQ < questions.length - 1 ? 'Next →' : 'Finish ✓'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── RESULTS
  const sub: DailyChallengeSubmission | null = existingSub ?? (submitResult ? {
    score: submitResult.score, correct_answers: submitResult.correct_answers,
    total_questions: submitResult.total_questions, completion_time_ms: submitResult.completion_time_ms,
    completed_at: '', rewards: submitResult.rewards,
  } : null);

  const qResults: QuestionResult[] = submitResult?.question_results ?? [];
  const myRank = submitResult?.rank ?? lbEntries.find(e => e.player_id === myPlayerId)?.position ?? 0;
  const sortedLb = lbTab === 'fastest'
    ? [...lbEntries].filter(e => e.correct_answers === e.total_questions).sort((a, b) => a.completion_time_ms - b.completion_time_ms)
    : lbEntries;

  return (
    <SafeAreaView style={s.safe}>
      {renderHeader('Daily Challenge')}
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Score hero */}
        <View style={res.hero}>
          <Text style={res.heroDate}>{displayDate}</Text>
          <Text style={res.heroScore}>{sub?.score ?? 0}</Text>
          <Text style={res.heroScoreLabel}>SCORE</Text>
          {myRank > 0 && (
            <View style={res.rankBadge}><Text style={res.rankBadgeText}>#{myRank} Today</Text></View>
          )}
        </View>

        {/* Stats */}
        {sub && (
          <View style={res.statsRow}>
            <View style={res.statBox}>
              <Text style={[res.statVal, { color: '#22C55E' }]}>{sub.correct_answers}/{sub.total_questions}</Text>
              <Text style={res.statLabel}>Correct</Text>
            </View>
            <View style={res.statBox}>
              <Text style={[res.statVal, { color: '#F59E0B' }]}>{fmtMs(sub.completion_time_ms)}</Text>
              <Text style={res.statLabel}>Time</Text>
            </View>
            <View style={res.statBox}>
              <Text style={[res.statVal, { color: '#6366F1' }]}>+{sub.rewards.xp}</Text>
              <Text style={res.statLabel}>XP</Text>
            </View>
          </View>
        )}

        {/* Per-question results */}
        {qResults.length > 0 && (
          <View style={res.section}>
            <Text style={res.sectionTitle}>QUESTION RESULTS</Text>
            {qResults.map((r, i) => {
              const q = questions.find(x => x.id === r.question_id);
              return (
                <View key={r.question_id} style={res.qRow}>
                  <View style={[res.qIcon, { backgroundColor: r.correct ? '#14532D' : '#450A0A' }]}>
                    <Text style={[res.qIconText, { color: r.correct ? '#4ADE80' : '#F87171' }]}>
                      {r.correct ? '✓' : '✗'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={res.qLabel} numberOfLines={2}>{q?.prompt ?? `Question ${i + 1}`}</Text>
                    {q && <Text style={res.qType}>{typeIcon(q.type)} {typeLabel(q.type)} · {q.concept}</Text>}
                  </View>
                  <Text style={[res.qResult, { color: r.correct ? '#22C55E' : '#EF4444' }]}>
                    {r.correct ? 'Correct' : 'Wrong'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Leaderboard */}
        <View style={res.section}>
          <Text style={res.sectionTitle}>TODAY'S LEADERBOARD</Text>
          <View style={res.tabRow}>
            {(['score', 'fastest'] as const).map(tab => (
              <TouchableOpacity key={tab} onPress={() => setLbTab(tab)}
                style={[res.tab, lbTab === tab && res.tabActive]}>
                <Text style={[res.tabText, lbTab === tab && res.tabTextActive]}>
                  {tab === 'score' ? '🏆 Top Score' : '⚡ Fastest'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {sortedLb.length === 0
            ? <Text style={res.empty}>No submissions yet today.</Text>
            : sortedLb.map(e => <DCLeaderboardRow key={e.player_id} entry={e} isMe={e.player_id === myPlayerId} />)
          }
        </View>

        <View style={res.countdownCard}>
          <Text style={res.countdownLabel}>Next challenge in</Text>
          <Text style={res.countdown}>{countdown}</Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: '#0F172A' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn:        { paddingHorizontal: 4, minWidth: 60 },
  backText:       { fontSize: 15, color: '#6366F1', fontWeight: '600' },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: '#F8FAFC' },
  scroll:         { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  submittingText: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
});

const intro = StyleSheet.create({
  banner:       { alignItems: 'center', paddingVertical: 24, gap: 6 },
  bannerEmoji:  { fontSize: 48 },
  bannerTitle:  { fontSize: 22, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.5 },
  bannerDate:   { fontSize: 13, color: '#64748B', fontWeight: '600' },
  card:         { backgroundColor: '#0D1B2E', borderRadius: 20, borderWidth: 1, borderColor: '#1E293B', padding: 20, gap: 12, marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon:     { fontSize: 18, width: 24 },
  infoText:     { fontSize: 14, color: '#94A3B8', flex: 1, fontWeight: '500' },
  divider:      { height: 1, backgroundColor: '#1E293B', marginVertical: 4 },
  typeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E293B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#334155' },
  typePillIcon: { fontSize: 14 },
  typePillText: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  rewardItem:   { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  countdownCard:{ backgroundColor: '#1E293B', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 20, gap: 4, borderWidth: 1, borderColor: '#334155' },
  countdownLabel:{ fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  countdown:    { fontSize: 28, fontWeight: '900', color: '#F8FAFC', letterSpacing: 2 },
  startBtn:     { backgroundColor: '#F59E0B', borderRadius: 16, paddingVertical: 18, alignItems: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  startBtnText: { fontSize: 17, fontWeight: '900', color: '#000', letterSpacing: 1.5 },
});

const quiz = StyleSheet.create({
  progressTrack: { height: 4, backgroundColor: '#1E293B' },
  progressFill:  { height: 4, backgroundColor: '#F59E0B', borderRadius: 2 },
  meta:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  typePill:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1E293B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#334155' },
  typeIcon:      { fontSize: 13 },
  typeText:      { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  diffPill:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  diffText:      { fontSize: 11, fontWeight: '700' },
  timer:         { marginLeft: 'auto' as any, fontSize: 13, fontWeight: '700', color: '#64748B' },
  balancingWrap: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  balancingPrompt:{ fontSize: 22, fontWeight: '700', color: '#F1F5F9', textAlign: 'center', marginBottom: 8 },
  padWrap:       { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  nextWrap:      { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 },
  nextBtn:       { backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  nextBtnDisabled:{ backgroundColor: '#334155', shadowOpacity: 0 },
  nextBtnText:   { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 0.5 },
});

const res = StyleSheet.create({
  hero:           { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 4 },
  heroDate:       { fontSize: 12, color: '#64748B', fontWeight: '600' },
  heroScore:      { fontSize: 72, fontWeight: '900', color: '#F59E0B', lineHeight: 80 },
  heroScoreLabel: { fontSize: 12, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },
  rankBadge:      { marginTop: 8, backgroundColor: '#1E293B', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: '#6366F160' },
  rankBadgeText:  { fontSize: 14, fontWeight: '800', color: '#818CF8' },
  statsRow:       { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 8 },
  statBox:        { flex: 1, backgroundColor: '#1E293B', borderRadius: 14, borderWidth: 1, borderColor: '#334155', alignItems: 'center', paddingVertical: 14 },
  statVal:        { fontSize: 18, fontWeight: '800' },
  statLabel:      { fontSize: 10, color: '#64748B', marginTop: 4, fontWeight: '600', textTransform: 'uppercase' },
  section:        { marginHorizontal: 16, marginTop: 24 },
  sectionTitle:   { fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  qRow:           { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  qIcon:          { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  qIconText:      { fontSize: 14, fontWeight: '800' },
  qLabel:         { fontSize: 13, color: '#CBD5E1', fontWeight: '600', lineHeight: 18 },
  qType:          { fontSize: 11, color: '#475569', marginTop: 3 },
  qResult:        { fontSize: 12, fontWeight: '700', marginTop: 2 },
  tabRow:         { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab:            { flex: 1, backgroundColor: '#1E293B', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  tabActive:      { backgroundColor: '#1E1E3A', borderColor: '#6366F160' },
  tabText:        { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive:  { color: '#818CF8' },
  empty:          { textAlign: 'center', color: '#475569', paddingVertical: 20, fontSize: 14 },
  countdownCard:  { margin: 16, backgroundColor: '#1E293B', borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#334155' },
  countdownLabel: { fontSize: 10, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  countdown:      { fontSize: 24, fontWeight: '900', color: '#F8FAFC', letterSpacing: 2 },
});
