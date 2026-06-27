import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type SprintLeaderboardEntry,
  type SprintQuestion,
  type SprintQuestionResult,
  type SprintSubmitResponse,
  type SprintSubmission,
  fetchSprint,
  fetchSprintLeaderboard,
  submitSprint,
} from '../../core/sprintApi';

// ── Colour tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: '#0F172A',
  surface: '#1E293B',
  card: '#0D1B2E',
  accent: '#14B8A6',    // teal — distinct from daily (amber) and duel (indigo)
  accentDark: '#0F766E',
  text: '#F8FAFC',
  textSub: '#94A3B8',
  border: '#1E293B',
  correct: '#22C55E',
  correctDark: '#14532D',
  wrong: '#EF4444',
  wrongDark: '#450A0A',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function questionTypeMeta(type: string): { label: string; color: string } {
  switch (type) {
    case 'atomic_number': return { label: 'ATOMIC NUMBER', color: '#6366F1' };
    case 'symbol':        return { label: 'SYMBOL', color: C.accent };
    case 'group':         return { label: 'GROUP', color: '#F59E0B' };
    case 'period':        return { label: 'PERIOD', color: '#EC4899' };
    default:              return { label: 'QUESTION', color: C.textSub };
  }
}

// ── Leaderboard row ────────────────────────────────────────────────────────────

function SprintLeaderboardRow({ entry, isMe }: { entry: SprintLeaderboardEntry; isMe: boolean }) {
  const pct = entry.total_questions > 0 ? Math.round((entry.correct_answers / entry.total_questions) * 100) : 0;
  const medal = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : null;
  return (
    <View style={[lb.row, isMe && lb.rowMe]}>
      <Text style={[lb.pos, isMe && { color: C.accent }]}>
        {medal ?? `#${entry.position}`}
      </Text>
      <View style={lb.mid}>
        <Text style={[lb.name, isMe && { color: C.accent }]} numberOfLines={1}>
          {entry.name}{isMe ? ' (You)' : ''}
        </Text>
        <Text style={lb.sub}>{pct}% · {fmtMs(entry.completion_time_ms)}</Text>
      </View>
      <Text style={lb.score}>{entry.score}</Text>
    </View>
  );
}

const lb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B', gap: 12 },
  rowMe: { backgroundColor: '#0D2421' },
  pos:   { width: 36, fontSize: 14, fontWeight: '800', color: '#64748B', textAlign: 'center' },
  mid:   { flex: 1, gap: 2 },
  name:  { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  sub:   { fontSize: 11, color: '#64748B' },
  score: { fontSize: 16, fontWeight: '900', color: C.accent },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'error' | 'intro' | 'countdown' | 'quiz' | 'submitting' | 'results';
type QuizState = 'answering' | 'feedback';

interface RecordedAnswer {
  question_id: string;
  selected_index: number;
}

export default function SprintScreen({ navigation }: { navigation: any }) {
  // ── data
  const [questions,     setQuestions]     = useState<SprintQuestion[]>([]);
  const [date,          setDate]          = useState('');
  const [secsToReset,   setSecsToReset]   = useState(0);
  const [phase,         setPhase]         = useState<Phase>('loading');
  const [existingSub,   setExistingSub]   = useState<SprintSubmission | null>(null);
  const [personalBest,  setPersonalBest]  = useState(0);
  const [submitResult,  setSubmitResult]  = useState<SprintSubmitResponse | null>(null);
  const [lbEntries,     setLbEntries]     = useState<SprintLeaderboardEntry[]>([]);
  const [myPlayerId,    setMyPlayerId]    = useState('');
  const [lbTab,         setLbTab]         = useState<'score' | 'fastest'>('score');

  // ── quiz
  const [currentQ,      setCurrentQ]      = useState(0);
  const [quizState,     setQuizState]     = useState<QuizState>('answering');
  const [selectedIdx,   setSelectedIdx]   = useState<number | null>(null);
  const [recorded,      setRecorded]      = useState<RecordedAnswer[]>([]);
  const [elapsed,       setElapsed]       = useState(0);
  const startTimeRef = useRef<number>(0);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── countdown state
  const [countdownVal, setCountdownVal] = useState(3);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── reset-to-next countdown
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = setInterval(() => setSecsToReset((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => { setCountdown(fmtCountdown(secsToReset)); }, [secsToReset]);

  // ── initial load
  useEffect(() => {
    fetchSprint().then((res) => {
      setQuestions(res.questions);
      setDate(res.date);
      setSecsToReset(res.secs_to_reset);
      setPersonalBest(res.personal_best);
      if (res.my_submission) {
        setExistingSub(res.my_submission);
        loadLeaderboard();
        setPhase('results');
      } else {
        setPhase('intro');
      }
    }).catch(() => setPhase('error'));
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await fetchSprintLeaderboard();
      setLbEntries(res.entries);
      setMyPlayerId(res.my_player_id);
    } catch {}
  }, []);

  // ── start countdown (3-2-1-GO!)
  const startCountdown = () => {
    setCountdownVal(3);
    setPhase('countdown');
    let val = 3;
    countdownRef.current = setInterval(() => {
      val--;
      if (val < 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        beginQuiz();
      } else {
        setCountdownVal(val);
      }
    }, 700);
  };

  const beginQuiz = () => {
    setCurrentQ(0);
    setRecorded([]);
    setElapsed(0);
    setSelectedIdx(null);
    setQuizState('answering');
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 200);
    setPhase('quiz');
  };

  const handleOptionTap = (optIdx: number) => {
    if (quizState !== 'answering') return;

    const q = questions[currentQ];
    // Determine correctness by checking if selected matches the correct index.
    // We don't have the correct index client-side, so we'll record and let server validate.
    // For UX feedback we just show selection visually; real validation is on submit.
    // However for instant feedback we store selected and advance.
    // (Correct/wrong flash is cosmetic — we always advance.)
    setSelectedIdx(optIdx);
    setQuizState('feedback');

    const newRecorded = [...recorded, { question_id: q.id, selected_index: optIdx }];

    // Advance after feedback delay
    const delay = 450;
    setTimeout(() => {
      if (currentQ < questions.length - 1) {
        setRecorded(newRecorded);
        setCurrentQ((c) => c + 1);
        setSelectedIdx(null);
                setQuizState('answering');
      } else {
        // Last question — submit
        if (timerRef.current) clearInterval(timerRef.current);
        const timeMs = Date.now() - startTimeRef.current;
        setPhase('submitting');
        submitSprint({ completion_time_ms: timeMs, answers: newRecorded })
          .then((res) => {
            setSubmitResult(res);
            setPersonalBest(res.personal_best);
            loadLeaderboard();
            setPhase('results');
          })
          .catch(() => setPhase('results'));
      }
    }, delay);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Card entrance animation (reused across phases)
  const cardAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'loading') {
      cardAnim.setValue(0);
      Animated.timing(cardAnim, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    }
  }, [phase]);

  // ── Shared header
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
  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.safe}>
        {renderHeader('Periodic Sprint')}
        <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>
      </SafeAreaView>
    );
  }

  // ── ERROR
  if (phase === 'error') {
    return (
      <SafeAreaView style={s.safe}>
        {renderHeader('Periodic Sprint')}
        <View style={s.center}>
          <Text style={s.bigEmoji}>⚠️</Text>
          <Text style={s.centerText}>Failed to load sprint.{'\n'}Check your connection and try again.</Text>
          <TouchableOpacity
            onPress={() => { setPhase('loading'); fetchSprint().then((res) => { setQuestions(res.questions); setDate(res.date); setSecsToReset(res.secs_to_reset); setPersonalBest(res.personal_best); if (res.my_submission) { setExistingSub(res.my_submission); loadLeaderboard(); setPhase('results'); } else { setPhase('intro'); } }).catch(() => setPhase('error')); }}
            style={{ marginTop: 20, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── SUBMITTING
  if (phase === 'submitting') {
    return (
      <SafeAreaView style={s.safe}>
        {renderHeader('Periodic Sprint')}
        <View style={s.center}>
          <Text style={s.bigEmoji}>⚡</Text>
          <Text style={s.centerText}>Calculating results…</Text>
          <ActivityIndicator size="small" color={C.accent} style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  // ── INTRO
  if (phase === 'intro') {
    return (
      <SafeAreaView style={s.safe}>
        {renderHeader('Periodic Sprint')}
        <ScrollView contentContainerStyle={s.scroll}>
          <Animated.View style={{ opacity: cardAnim }}>
            <View style={intro.banner}>
              <Text style={intro.bannerEmoji}>⚡</Text>
              <Text style={intro.bannerTitle}>Periodic Table Sprint</Text>
              <Text style={intro.bannerSub}>Test your element knowledge against the clock</Text>
            </View>

            <View style={intro.card}>
              <Text style={intro.sectionLabel}>WHAT TO EXPECT</Text>
              <View style={intro.infoRow}>
                <Text style={intro.infoIcon}>🔢</Text>
                <Text style={intro.infoText}>10 multiple-choice questions</Text>
              </View>
              <View style={intro.infoRow}>
                <Text style={intro.infoIcon}>⏱️</Text>
                <Text style={intro.infoText}>Timer runs the whole sprint — speed earns bonus points</Text>
              </View>
              <View style={intro.infoRow}>
                <Text style={intro.infoIcon}>🎯</Text>
                <Text style={intro.infoText}>One attempt per day — leaderboard resets at midnight UTC</Text>
              </View>
              <View style={intro.infoRow}>
                <Text style={intro.infoIcon}>🏆</Text>
                <Text style={intro.infoText}>Compete on today's global leaderboard</Text>
              </View>

              <View style={intro.divider} />

              <Text style={intro.sectionLabel}>QUESTION TYPES</Text>
              <View style={intro.typeGrid}>
                {(['atomic_number', 'symbol', 'group', 'period'] as const).map((t) => {
                  const meta = questionTypeMeta(t);
                  return (
                    <View key={t} style={[intro.typePill, { borderColor: meta.color + '55', backgroundColor: meta.color + '15' }]}>
                      <Text style={[intro.typeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={intro.divider} />

              <Text style={intro.sectionLabel}>SCORING</Text>
              <View style={intro.rewardRow}>
                <Text style={intro.rewardItem}>✦ 100 pts per correct answer (max 1000)</Text>
                <Text style={intro.rewardItem}>✦ Speed bonus: up to 500 pts</Text>
                <Text style={intro.rewardItem}>✦ Max score: 1500</Text>
              </View>

              <View style={intro.divider} />

              <Text style={intro.sectionLabel}>XP REWARDS</Text>
              <View style={intro.rewardRow}>
                <Text style={intro.rewardItem}>✦ 30 XP for completing</Text>
                <Text style={intro.rewardItem}>✦ 10 XP per correct answer</Text>
                <Text style={intro.rewardItem}>✦ 50 XP for perfect accuracy</Text>
                <Text style={intro.rewardItem}>✦ 30 XP speed bonus (score ≥ 1300)</Text>
              </View>
            </View>

            {personalBest > 0 && (
              <View style={intro.pbCard}>
                <Text style={intro.pbLabel}>YOUR PERSONAL BEST</Text>
                <Text style={intro.pbScore}>{personalBest}</Text>
                <Text style={intro.pbSub}>pts</Text>
              </View>
            )}

            <View style={intro.countdownCard}>
              <Text style={intro.countdownLabel}>Resets in</Text>
              <Text style={intro.countdown}>{countdown}</Text>
            </View>

            <TouchableOpacity onPress={startCountdown} activeOpacity={0.85} style={intro.startBtn}>
              <Text style={intro.startBtnText}>START SPRINT</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── COUNTDOWN
  if (phase === 'countdown') {
    const label = countdownVal === 0 ? 'GO!' : String(countdownVal);
    const color = countdownVal === 0 ? C.correct : C.accent;
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.countdownFull}>
          <Text style={[s.countdownBig, { color }]}>{label}</Text>
          <Text style={s.countdownSub}>Get ready…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── QUIZ
  if (phase === 'quiz') {
    const q = questions[currentQ];
    if (!q) return null;
    const progress = ((currentQ) / questions.length) * 100;
    const typeMeta = questionTypeMeta(q.type);

    return (
      <SafeAreaView style={s.safe}>
        {renderHeader(`Q${currentQ + 1} / ${questions.length}`)}

        {/* Progress bar */}
        <View style={quiz.progressTrack}>
          <View style={[quiz.progressFill, { width: `${progress}%` as any }]} />
        </View>

        {/* Meta row: question type badge + timer */}
        <View style={quiz.metaRow}>
          <View style={[quiz.typeBadge, { backgroundColor: typeMeta.color + '20', borderColor: typeMeta.color + '55' }]}>
            <Text style={[quiz.typeText, { color: typeMeta.color }]}>{typeMeta.label}</Text>
          </View>
          <Text style={[quiz.timer, elapsed > 60000 && { color: C.wrong }]}>
            ⏱ {fmtTimer(elapsed)}
          </Text>
        </View>

        {/* Question card — plain View, no Animated.View (avoids old-arch touch bug) */}
        <View style={quiz.questionCard}>
          <Text style={quiz.prompt}>{q.prompt}</Text>
        </View>

        {/* Options grid — 2×2 — options live outside any Animated.View */}
        <View style={quiz.optionsGrid}>
          {q.options.map((opt, i) => {
            let bgColor = C.surface;
            let borderColor = '#334155';
            let textColor = C.text;

            if (quizState === 'feedback' && selectedIdx === i) {
              bgColor = '#2A3A2A';
              borderColor = '#334155';
              textColor = C.accent;
            }

            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleOptionTap(i)}
                activeOpacity={0.75}
                disabled={quizState !== 'answering'}
                style={[quiz.option, { backgroundColor: bgColor, borderColor }]}
              >
                <Text style={[quiz.optionText, { color: textColor }]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Question number dots */}
        <View style={quiz.dotsRow}>
          {questions.map((_, i) => (
            <View
              key={i}
              style={[
                quiz.dot,
                i < currentQ && quiz.dotDone,
                i === currentQ && quiz.dotCurrent,
              ]}
            />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ── RESULTS
  const sub: SprintSubmission | null = existingSub ?? (submitResult ? {
    score: submitResult.score,
    correct_answers: submitResult.correct_answers,
    total_questions: submitResult.total_questions,
    completion_time_ms: submitResult.completion_time_ms,
    completed_at: '',
    rewards: submitResult.rewards,
    personal_best: submitResult.personal_best,
  } : null);

  const qResults: SprintQuestionResult[] = submitResult?.question_results ?? [];
  const myRank = submitResult?.rank ?? lbEntries.find((e) => e.player_id === myPlayerId)?.position ?? 0;
  const isNewPB = submitResult && submitResult.score > 0 &&
    (existingSub === null) && submitResult.score >= personalBest;

  const sortedLb = lbTab === 'fastest'
    ? [...lbEntries].filter((e) => e.correct_answers === e.total_questions).sort((a, b) => a.completion_time_ms - b.completion_time_ms)
    : lbEntries;

  return (
    <SafeAreaView style={s.safe}>
      {renderHeader('Periodic Sprint')}
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Score hero */}
        <View style={res.hero}>
          {isNewPB && (
            <View style={res.newPbBadge}>
              <Text style={res.newPbText}>🏅 NEW PERSONAL BEST!</Text>
            </View>
          )}
          <Text style={res.heroScore}>{sub?.score ?? 0}</Text>
          <Text style={res.heroScoreLabel}>SCORE</Text>
          {myRank > 0 && (
            <View style={res.rankBadge}>
              <Text style={res.rankBadgeText}>#{myRank} Today</Text>
            </View>
          )}
        </View>

        {/* Stats strip */}
        {sub && (
          <View style={res.statsRow}>
            <View style={res.statBox}>
              <Text style={[res.statVal, { color: C.correct }]}>{sub.correct_answers}/{sub.total_questions}</Text>
              <Text style={res.statLabel}>Accuracy</Text>
            </View>
            <View style={res.statBox}>
              <Text style={[res.statVal, { color: C.accent }]}>{fmtMs(sub.completion_time_ms)}</Text>
              <Text style={res.statLabel}>Time</Text>
            </View>
            <View style={res.statBox}>
              <Text style={[res.statVal, { color: '#6366F1' }]}>+{sub.rewards.xp}</Text>
              <Text style={res.statLabel}>XP Earned</Text>
            </View>
          </View>
        )}

        {/* Personal best strip */}
        {personalBest > 0 && (
          <View style={res.pbStrip}>
            <Text style={res.pbLabel}>Personal Best</Text>
            <Text style={res.pbVal}>{personalBest} pts</Text>
          </View>
        )}

        {/* Per-question results (fresh submission only) */}
        {qResults.length > 0 && (
          <View style={res.section}>
            <Text style={res.sectionTitle}>QUESTION BREAKDOWN</Text>
            {qResults.map((r, i) => {
              const q = questions[i];
              const typeMeta = q ? questionTypeMeta(q.type) : { label: '', color: C.textSub };
              return (
                <View key={r.question_id} style={res.qRow}>
                  <View style={[res.qIcon, { backgroundColor: r.correct ? C.correctDark : C.wrongDark }]}>
                    <Text style={[res.qIconText, { color: r.correct ? C.correct : C.wrong }]}>
                      {r.correct ? '✓' : '✗'}
                    </Text>
                  </View>
                  <View style={res.qMid}>
                    <View style={[res.qTypePill, { backgroundColor: typeMeta.color + '20' }]}>
                      <Text style={[res.qTypeText, { color: typeMeta.color }]}>{typeMeta.label}</Text>
                    </View>
                    <Text style={res.qPrompt} numberOfLines={2}>
                      {q?.prompt ?? `Q${i + 1}`}
                    </Text>
                    {!r.correct && (
                      <Text style={res.qCorrect}>
                        Correct: <Text style={{ color: C.correct }}>{r.correct_option}</Text>
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Leaderboard */}
        <View style={res.section}>
          <Text style={res.sectionTitle}>TODAY'S LEADERBOARD</Text>

          <View style={res.tabRow}>
            {(['score', 'fastest'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setLbTab(tab)}
                style={[res.tab, lbTab === tab && res.tabActive]}
              >
                <Text style={[res.tabText, lbTab === tab && res.tabTextActive]}>
                  {tab === 'score' ? '🏆 Top Score' : '⚡ Fastest Perfect'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {sortedLb.length === 0 ? (
            <Text style={res.empty}>No submissions yet today.</Text>
          ) : (
            sortedLb.map((e) => (
              <SprintLeaderboardRow key={e.player_id} entry={e} isMe={e.player_id === myPlayerId} />
            ))
          )}
        </View>

        {/* Reset countdown */}
        <View style={res.countdownCard}>
          <Text style={res.countdownLabel}>Next sprint in</Text>
          <Text style={res.countdown}>{countdown}</Text>
        </View>

        {/* Play again (existing sub) */}
        {existingSub && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={res.doneBtn}
            activeOpacity={0.85}
          >
            <Text style={res.doneBtnText}>Back to Home</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  bigEmoji:    { fontSize: 48, marginBottom: 8 },
  centerText:  { fontSize: 16, color: C.textSub, fontWeight: '600' },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn:     { paddingHorizontal: 4, minWidth: 60 },
  backText:    { fontSize: 15, color: C.accent, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },

  // Full-screen countdown
  countdownFull: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  countdownBig:  { fontSize: 100, fontWeight: '900', lineHeight: 110 },
  countdownSub:  { fontSize: 16, color: C.textSub, fontWeight: '600' },
});

const intro = StyleSheet.create({
  banner: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  bannerEmoji: { fontSize: 52 },
  bannerTitle: { fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: 0.5 },
  bannerSub:   { fontSize: 13, color: C.textSub, fontWeight: '500', textAlign: 'center' },

  card: {
    backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: '#1E293B',
    padding: 20, gap: 12, marginBottom: 16,
  },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { fontSize: 18, width: 26 },
  infoText: { fontSize: 14, color: C.textSub, flex: 1, fontWeight: '500' },
  divider:  { height: 1, backgroundColor: '#1E293B', marginVertical: 4 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  typeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  rewardRow: { gap: 6 },
  rewardItem: { fontSize: 13, color: C.textSub, fontWeight: '500' },

  pbCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5, borderColor: C.accent + '55',
    padding: 16, alignItems: 'center', marginBottom: 16, flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
  pbLabel: { fontSize: 12, color: C.textSub, fontWeight: '700', textTransform: 'uppercase' },
  pbScore: { fontSize: 28, fontWeight: '900', color: C.accent },
  pbSub:   { fontSize: 14, color: C.textSub, fontWeight: '600', alignSelf: 'flex-end', marginBottom: 2 },

  countdownCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    alignItems: 'center', marginBottom: 20, gap: 4,
    borderWidth: 1, borderColor: '#334155',
  },
  countdownLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  countdown:      { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: 2 },

  startBtn: {
    backgroundColor: C.accent, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center',
    shadowColor: C.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  startBtnText: { fontSize: 17, fontWeight: '900', color: '#000', letterSpacing: 1.5 },
});

const quiz = StyleSheet.create({
  progressTrack: { height: 4, backgroundColor: '#1E293B' },
  progressFill:  { height: 4, backgroundColor: C.accent, borderRadius: 2 },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  typeBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  typeText:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  timer:     { fontSize: 15, fontWeight: '800', color: C.textSub, fontVariant: ['tabular-nums'] as any },

  questionCard: {
    backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: '#1E3A5F',
    marginHorizontal: 16, padding: 28, alignItems: 'center',
    minHeight: 110, justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  prompt: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center', lineHeight: 28 },

  optionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 16, paddingTop: 20,
  },
  option: {
    width: '47%',
    minHeight: 76, borderRadius: 16,
    backgroundColor: C.surface, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center', padding: 12,
  },
  optionText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 20 },
  dot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },
  dotDone:    { backgroundColor: C.accent },
  dotCurrent: { backgroundColor: C.text, width: 14 },
});

const res = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  newPbBadge: {
    backgroundColor: C.accentDark, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6,
    marginBottom: 4,
  },
  newPbText:      { fontSize: 13, fontWeight: '800', color: C.accent },
  heroScore:      { fontSize: 72, fontWeight: '900', color: C.accent, lineHeight: 80 },
  heroScoreLabel: { fontSize: 12, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },
  rankBadge: {
    marginTop: 8, backgroundColor: C.surface, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: C.accent + '55',
  },
  rankBadgeText: { fontSize: 14, fontWeight: '800', color: C.accent },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 8 },
  statBox:  { flex: 1, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: '#334155', alignItems: 'center', paddingVertical: 14 },
  statVal:  { fontSize: 18, fontWeight: '800' },
  statLabel:{ fontSize: 10, color: '#64748B', marginTop: 4, fontWeight: '600', textTransform: 'uppercase' },

  pbStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8, backgroundColor: C.surface,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: C.accent + '44',
  },
  pbLabel: { fontSize: 12, color: C.textSub, fontWeight: '600', textTransform: 'uppercase' },
  pbVal:   { fontSize: 16, fontWeight: '800', color: C.accent },

  section:      { marginHorizontal: 16, marginTop: 24 },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },

  qRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  qIcon:     { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  qIconText: { fontSize: 14, fontWeight: '800' },
  qMid:      { flex: 1, gap: 4 },
  qTypePill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  qTypeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  qPrompt:   { fontSize: 13, color: '#CBD5E1', fontWeight: '600', lineHeight: 18 },
  qCorrect:  { fontSize: 12, color: C.textSub },

  tabRow:       { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab:          { flex: 1, backgroundColor: C.surface, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  tabActive:    { backgroundColor: '#0D2421', borderColor: C.accent + '55' },
  tabText:      { fontSize: 12, fontWeight: '700', color: '#64748B' },
  tabTextActive:{ color: C.accent },
  empty:        { textAlign: 'center', color: '#475569', paddingVertical: 20, fontSize: 14 },

  countdownCard: { margin: 16, backgroundColor: C.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#334155' },
  countdownLabel: { fontSize: 10, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  countdown:      { fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: 2 },

  doneBtn: {
    marginHorizontal: 16, marginTop: 8, backgroundColor: C.surface,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: C.accent + '44',
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: C.accent },
});
