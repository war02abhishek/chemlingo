import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchCompoundDaily,
  submitCompoundDaily,
  fetchCompoundLeaderboard,
  fetchPracticeQuestion,
  buildFormulaPreview,
  type CompoundQuestion,
  type CompoundIon,
  type CompoundSubmitResponse,
  type CompoundLeaderboardEntry,
  type SelectedIon,
  type CompoundQuestionResult,
} from '../../core/compoundApi';

// ── colour tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: '#0F172A',
  surface: '#1E293B',
  border: '#334155',
  text: '#F8FAFC',
  textSub: '#94A3B8',
  accent: '#8B5CF6',    // violet — unique to Compound Builder
  accentDim: '#8B5CF620',
  easy: '#22C55E',
  medium: '#F59E0B',
  hard: '#EF4444',
  correct: '#22C55E',
  wrong: '#EF4444',
};

type Phase =
  | 'loading'
  | 'intro'
  | 'mode_select'
  | 'difficulty_select'
  | 'countdown'
  | 'quiz'
  | 'submitting'
  | 'results';

type QuizMode = 'daily' | 'practice';
type QuizState = 'building' | 'feedback';

interface QuizAnswer {
  questionId: string;
  selectedIons: SelectedIon[];
  correct?: boolean;
  correctFormula?: string;
  correctIons?: SelectedIon[];
}

interface Props {
  navigation: any;
}

export default function CompoundBuilderScreen({ navigation }: Props) {
  const [phase, setPhase]         = useState<Phase>('loading');
  const [mode, setMode]           = useState<QuizMode>('daily');
  const [questions, setQuestions] = useState<CompoundQuestion[]>([]);
  const [qIndex, setQIndex]       = useState(0);
  const [answers, setAnswers]     = useState<QuizAnswer[]>([]);
  const [selected, setSelected]   = useState<SelectedIon[]>([]);
  const [quizState, setQuizState] = useState<QuizState>('building');
  const [hintVisible, setHintVisible] = useState(false);
  const [countdownVal, setCountdownVal] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [submitResult, setSubmitResult] = useState<CompoundSubmitResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<CompoundLeaderboardEntry[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [myRank, setMyRank] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const [isNewPB, setIsNewPB] = useState(false);
  const [lbTab, setLbTab] = useState<'score' | 'speed'>('score');
  const [practiceCorrect, setPracticeCorrect] = useState<boolean | null>(null);

  const startTimeRef = useRef<number>(0);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim    = useRef(new Animated.Value(0)).current;

  // ── loading ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCompoundDaily()
      .then((res) => {
        setPersonalBest(res.personal_best);
        if (res.my_submission) {
          // Already submitted today — show intro with completion state
          setSubmitResult({
            score: res.my_submission.score,
            correct_answers: res.my_submission.correct_answers,
            total_questions: res.my_submission.total_questions,
            completion_time_ms: res.my_submission.completion_time_ms,
            question_results: [],
            rewards: res.my_submission.rewards,
            rank: 0,
            personal_best: res.my_submission.personal_best,
          });
          fetchCompoundLeaderboard().then((lb) => {
            setLeaderboard(lb.entries ?? []);
            setMyPlayerId(lb.my_player_id);
            setMyRank(lb.my_rank);
          }).catch(() => {});
          setPhase('intro'); // show intro so user can still practice
        } else {
          setQuestions(res.questions);
          setPhase('intro');
        }
      })
      .catch(() => setPhase('intro'));
  }, []);

  // ── timer ──────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return Date.now() - startTimeRef.current;
  }, []);

  useEffect(() => () => { timerRef.current && clearInterval(timerRef.current); }, []);

  // ── countdown ──────────────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setPhase('countdown');
    setCountdownVal(3);
    let n = 3;
    const iv = setInterval(() => {
      n -= 1;
      setCountdownVal(n);
      if (n <= 0) {
        clearInterval(iv);
        beginQuiz();
      }
    }, 700);
  }, []);

  const beginQuiz = () => {
    setQIndex(0);
    setAnswers([]);
    setSelected([]);
    setHintVisible(false);
    setQuizState('building');
    startTimer();
    setPhase('quiz');
  };

  // ── ion selection ──────────────────────────────────────────────────────────
  const currentQuestion = questions[qIndex];

  const addIon = (ionId: string) => {
    setSelected((prev) => {
      const existing = prev.find((s) => s.ion_id === ionId);
      if (existing) {
        return prev.map((s) =>
          s.ion_id === ionId ? { ...s, count: Math.min(s.count + 1, 4) } : s,
        );
      }
      return [...prev, { ion_id: ionId, count: 1 }];
    });
  };

  const changeCount = (ionId: string, delta: number) => {
    setSelected((prev) => {
      const updated = prev
        .map((s) => (s.ion_id === ionId ? { ...s, count: s.count + delta } : s))
        .filter((s) => s.count > 0);
      return updated;
    });
  };

  const clearFormula = () => setSelected([]);

  // ── submit answer ──────────────────────────────────────────────────────────
  const submitAnswer = async () => {
    if (selected.length === 0 || quizState === 'feedback') return;
    setQuizState('feedback');

    if (mode === 'practice') {
      // Charge balance check (client-side for practice)
      const ionCharges: Record<string, number> = {
        'na+': 1, 'k+': 1, 'ca2+': 2, 'mg2+': 2, 'al3+': 3,
        'fe2+': 2, 'fe3+': 3, 'nh4+': 1, 'cu2+': 2, 'zn2+': 2,
        'cl-': -1, 'br-': -1, 'f-': -1, 'o2-': -2, 's2-': -2,
        'oh-': -1, 'no3-': -1, 'so4-': -2, 'co3-': -2, 'po4-': -3,
        'hco3-': -1, 'so3-': -2,
      };
      const total = selected.reduce(
        (sum, s) => sum + (ionCharges[s.ion_id] ?? 0) * s.count, 0,
      );
      const correct = total === 0;
      setPracticeCorrect(correct);
      animateFeedback(correct);
      setTimeout(() => {
        setQuizState('building');
        setSelected([]);
        setHintVisible(false);
        setPracticeCorrect(null);
        // Load next practice question
        fetchPracticeQuestion(currentQuestion?.difficulty ?? 'any')
          .then((res) => setQuestions([res.question]))
          .catch(() => {});
      }, 1500);
      return;
    }

    // Daily mode — record answer locally, advance
    const newAnswer: QuizAnswer = {
      questionId: currentQuestion.id,
      selectedIons: selected,
    };

    animateFeedback(true); // optimistic; real validation on submit
    await new Promise((r) => setTimeout(r, 800));

    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);

    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
      setSelected([]);
      setHintVisible(false);
      setQuizState('building');
    } else {
      // Last question — submit all
      const totalMs = stopTimer();
      setPhase('submitting');
      try {
        const result = await submitCompoundDaily({
          completion_time_ms: totalMs,
          answers: updatedAnswers.map((a) => ({
            question_id: a.questionId,
            selected_ions: a.selectedIons,
          })),
        });
        setSubmitResult(result);
        setIsNewPB(result.score > personalBest);
        const lb = await fetchCompoundLeaderboard();
        setLeaderboard(lb.entries ?? []);
        setMyPlayerId(lb.my_player_id);
        setMyRank(lb.my_rank);
        setPhase('results');
      } catch {
        setPhase('results');
      }
    }
  };

  // ── animations ─────────────────────────────────────────────────────────────
  const animateFeedback = (correct: boolean) => {
    if (correct) {
      Animated.sequence([
        Animated.timing(feedbackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(feedbackAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  };

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  // ── render phases ──────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}><Text style={s.loadingText}>Loading...</Text></View>
      </SafeAreaView>
    );
  }

  if (phase === 'intro') {
    const dailyDone = submitResult !== null;
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backText}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.introContainer}>
          <Text style={s.introEmoji}>🧪</Text>
          <Text style={s.introTitle}>Compound Builder</Text>
          <Text style={s.introSub}>
            Build correct ionic formulas from component ions.{'\n'}Learn valency through hands-on construction.
          </Text>

          {/* Daily completed banner */}
          {dailyDone ? (
            <View style={s.completedBanner}>
              <Text style={s.completedBannerTitle}>✅ Daily Completed</Text>
              <Text style={s.completedBannerScore}>
                {submitResult!.correct_answers}/{submitResult!.total_questions} correct · {submitResult!.score} pts · +{submitResult!.rewards.xp} XP
              </Text>
              <TouchableOpacity style={s.viewResultsBtn} onPress={() => setPhase('results')}>
                <Text style={s.viewResultsBtnText}>View Results & Leaderboard</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.infoCard}>
              <InfoRow icon="⚡" text="5 compounds per daily challenge" />
              <InfoRow icon="🎯" text="Select ions + adjust quantities" />
              <InfoRow icon="📐" text="Balance charges to form the formula" />
              <InfoRow icon="💡" text="Hints available (no penalty)" />
              <InfoRow icon="🏆" text="Speed scoring + global leaderboard" />
            </View>
          )}

          {personalBest > 0 && !dailyDone && (
            <View style={s.pbBadge}>
              <Text style={s.pbLabel}>Personal Best</Text>
              <Text style={s.pbValue}>{personalBest} pts</Text>
            </View>
          )}

          {/* Practice always available */}
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => {
              setMode('practice');
              setPhase('difficulty_select');
            }}
          >
            <Text style={s.primaryBtnText}>🔬 PRACTICE MODE</Text>
          </TouchableOpacity>

          {/* Daily challenge button — only if not done today */}
          {!dailyDone && questions.length > 0 && (
            <TouchableOpacity
              style={[s.primaryBtn, s.dailyBtn]}
              onPress={() => {
                setMode('daily');
                startCountdown();
              }}
            >
              <Text style={s.primaryBtnText}>📅 DAILY CHALLENGE</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'difficulty_select') {
    const pickDifficulty = (diff: 'easy' | 'medium' | 'hard' | 'any') => {
      fetchPracticeQuestion(diff)
        .then((res) => {
          setQuestions([res.question]);
          setQIndex(0);
          setSelected([]);
          setHintVisible(false);
          setQuizState('building');
          startTimer();
          setPhase('quiz');
        })
        .catch(() => {});
    };

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.header}>
          <TouchableOpacity onPress={() => setPhase('intro')} style={s.backBtn}>
            <Text style={s.backText}>‹ Back</Text>
          </TouchableOpacity>
        </View>
        <View style={s.modeContainer}>
          <Text style={s.modeTitle}>Select Difficulty</Text>
          {(['any', 'easy', 'medium', 'hard'] as const).map((d) => (
            <TouchableOpacity key={d} style={s.modeCard} onPress={() => pickDifficulty(d)}>
              <Text style={s.modeCardEmoji}>
                {d === 'any' ? '🎲' : d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴'}
              </Text>
              <Text style={s.modeCardTitle}>{d.charAt(0).toUpperCase() + d.slice(1)}</Text>
              <Text style={s.modeCardSub}>
                {d === 'any'
                  ? 'Random mix'
                  : d === 'easy'
                  ? 'Binary ionic compounds'
                  : d === 'medium'
                  ? 'Polyatomic ions'
                  : 'Complex ionic formulas'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'countdown') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}>
          <Text style={s.countdownNum}>{countdownVal > 0 ? countdownVal : 'GO!'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'quiz' && currentQuestion) {
    const formula = buildFormulaPreview(currentQuestion.available_ions, selected);
    const hasSelection = selected.some((s) => s.count > 0);
    const diffColor =
      currentQuestion.difficulty === 'easy'
        ? C.easy
        : currentQuestion.difficulty === 'medium'
        ? C.medium
        : C.hard;

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        {/* Header row */}
        <View style={s.quizHeader}>
          {mode === 'daily' ? (
            <Text style={s.quizProgress}>
              {qIndex + 1} / {questions.length}
            </Text>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
              <Text style={s.backText}>✕</Text>
            </TouchableOpacity>
          )}
          <Text style={s.quizTimer}>{fmtTime(elapsedMs)}</Text>
        </View>

        {/* Progress dots (daily only) */}
        {mode === 'daily' && (
          <View style={s.dotsRow}>
            {questions.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i < qIndex
                    ? s.dotDone
                    : i === qIndex
                    ? s.dotCurrent
                    : s.dotPending,
                ]}
              />
            ))}
          </View>
        )}

        <ScrollView contentContainerStyle={s.quizScroll} keyboardShouldPersistTaps="handled">
          {/* Difficulty badge */}
          <View style={[s.diffBadge, { backgroundColor: diffColor + '22', borderColor: diffColor + '66' }]}>
            <Text style={[s.diffBadgeText, { color: diffColor }]}>
              {currentQuestion.difficulty.toUpperCase()}
            </Text>
          </View>

          {/* Compound name */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <Text style={s.compoundName}>{currentQuestion.name}</Text>
          </Animated.View>

          {/* Formula preview */}
          <Animated.View
            style={[
              s.formulaBox,
              { borderColor: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.correct] }) },
            ]}
          >
            <Text style={[s.formulaText, !hasSelection && s.formulaPlaceholder]}>
              {hasSelection ? formula : '?'}
            </Text>
          </Animated.View>

          {/* Selected ions row */}
          {selected.length > 0 && (
            <View style={s.selectedRow}>
              {selected.map(({ ion_id, count }) => {
                const ion = currentQuestion.available_ions.find((i) => i.id === ion_id);
                if (!ion) return null;
                return (
                  <View key={ion_id} style={s.selectedChip}>
                    <TouchableOpacity onPress={() => changeCount(ion_id, -1)} style={s.countBtn}>
                      <Text style={s.countBtnText}>−</Text>
                    </TouchableOpacity>
                    <View style={s.selectedChipMid}>
                      <Text style={s.selectedSymbol}>{ion.symbol}</Text>
                      <Text style={s.selectedCount}>×{count}</Text>
                    </View>
                    <TouchableOpacity onPress={() => changeCount(ion_id, +1)} style={s.countBtn}>
                      <Text style={s.countBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Available ions */}
          <View style={s.ionsGrid}>
            {currentQuestion.available_ions.map((ion) => {
              const isSelected = selected.some((s) => s.ion_id === ion.id);
              return (
                <TouchableOpacity
                  key={ion.id}
                  style={[s.ionChip, isSelected && s.ionChipSelected]}
                  onPress={() => addIon(ion.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.ionSymbol, isSelected && s.ionSymbolSelected]}>
                    {ion.symbol}
                  </Text>
                  <Text style={[s.ionName, isSelected && s.ionNameSelected]}>
                    {ion.name}
                  </Text>
                  <View style={[s.chargeBadge, { backgroundColor: ion.charge > 0 ? '#3B82F620' : '#EF444420' }]}>
                    <Text style={[s.chargeText, { color: ion.charge > 0 ? '#3B82F6' : '#EF4444' }]}>
                      {ion.charge > 0 ? `+${ion.charge}` : ion.charge}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Hint */}
          {hintVisible ? (
            <View style={s.hintBox}>
              <Text style={s.hintText}>💡 {currentQuestion.hint}</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setHintVisible(true)} style={s.hintBtn}>
              <Text style={s.hintBtnText}>💡 Show Hint</Text>
            </TouchableOpacity>
          )}

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity style={s.clearBtn} onPress={clearFormula}>
              <Text style={s.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, !hasSelection && s.submitBtnDisabled]}
              onPress={submitAnswer}
              disabled={!hasSelection || quizState === 'feedback'}
            >
              <Text style={s.submitBtnText}>
                {mode === 'daily' && qIndex === questions.length - 1 ? 'FINISH' : 'SUBMIT'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}>
          <Text style={s.loadingText}>Calculating results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── results ────────────────────────────────────────────────────────────────
  if (phase === 'results' && submitResult) {
    const pct = Math.round((submitResult.correct_answers / submitResult.total_questions) * 100);
    const sortedLb = [...leaderboard].sort(
      lbTab === 'score'
        ? (a, b) => b.score - a.score || a.completion_time_ms - b.completion_time_ms
        : (a, b) => a.completion_time_ms - b.completion_time_ms,
    );

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <ScrollView contentContainerStyle={s.resultsScroll}>
          {/* Score card */}
          <View style={s.resultsCard}>
            <Text style={s.resultsEmoji}>
              {pct === 100 ? '🏆' : pct >= 60 ? '✅' : '🔬'}
            </Text>
            {isNewPB && <Text style={s.newPBBanner}>🎉 NEW PERSONAL BEST!</Text>}
            <Text style={s.resultsScore}>{submitResult.score}</Text>
            <Text style={s.resultsScoreLabel}>points</Text>

            <View style={s.resultsMeta}>
              <MetaStat label="Correct" value={`${submitResult.correct_answers}/${submitResult.total_questions}`} />
              <MetaStat label="Accuracy" value={`${pct}%`} />
              <MetaStat label="Time" value={fmtTime(submitResult.completion_time_ms)} />
              <MetaStat label="XP Earned" value={`+${submitResult.rewards.xp}`} color={C.accent} />
            </View>
            {myRank > 0 && (
              <Text style={s.rankText}>You ranked #{myRank} today</Text>
            )}
          </View>

          {/* Per-question breakdown */}
          {submitResult.question_results.length > 0 && (
            <View style={s.breakdownSection}>
              <Text style={s.sectionTitle}>Question Breakdown</Text>
              {submitResult.question_results.map((r, i) => (
                <QuestionResultRow key={r.question_id} result={r} index={i} />
              ))}
            </View>
          )}

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <View style={s.lbSection}>
              <Text style={s.sectionTitle}>Today's Leaderboard</Text>
              <View style={s.lbTabs}>
                <TouchableOpacity
                  style={[s.lbTab, lbTab === 'score' && s.lbTabActive]}
                  onPress={() => setLbTab('score')}
                >
                  <Text style={[s.lbTabText, lbTab === 'score' && s.lbTabTextActive]}>
                    Score
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.lbTab, lbTab === 'speed' && s.lbTabActive]}
                  onPress={() => setLbTab('speed')}
                >
                  <Text style={[s.lbTabText, lbTab === 'speed' && s.lbTabTextActive]}>
                    Fastest
                  </Text>
                </TouchableOpacity>
              </View>
              {sortedLb.map((entry, i) => (
                <LbRow
                  key={entry.player_id}
                  entry={{ ...entry, position: i + 1 }}
                  isMe={entry.player_id === myPlayerId}
                  showTime={lbTab === 'speed'}
                />
              ))}
            </View>
          )}

          <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>DONE</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ── sub-components ─────────────────────────────────────────────────────────────

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

function MetaStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.metaStat}>
      <Text style={[s.metaValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.metaLabel}>{label}</Text>
    </View>
  );
}

function QuestionResultRow({ result, index }: { result: CompoundQuestionResult; index: number }) {
  return (
    <View style={[s.qResultRow, { borderLeftColor: result.correct ? C.correct : C.wrong }]}>
      <Text style={[s.qResultIcon, { color: result.correct ? C.correct : C.wrong }]}>
        {result.correct ? '✓' : '✗'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={s.qResultLabel}>Question {index + 1}</Text>
        <Text style={s.qResultFormula}>{result.correct_formula}</Text>
      </View>
    </View>
  );
}

function LbRow({
  entry,
  isMe,
  showTime,
}: {
  entry: CompoundLeaderboardEntry;
  isMe: boolean;
  showTime: boolean;
}) {
  return (
    <View style={[s.lbRow, isMe && s.lbRowMe]}>
      <Text style={[s.lbPos, isMe && { color: C.accent }]}>#{entry.position}</Text>
      <Text style={[s.lbName, isMe && { color: C.accent }]} numberOfLines={1}>
        {entry.name}
      </Text>
      <Text style={[s.lbStat, isMe && { color: C.accent }]}>
        {showTime
          ? `${Math.floor(entry.completion_time_ms / 1000)}s`
          : `${entry.score} pts`}
      </Text>
    </View>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: C.textSub },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  backBtn: { alignSelf: 'flex-start' },
  backText: { fontSize: 17, color: C.accent, fontWeight: '600' },

  // ── intro ──
  introContainer: {
    alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40,
  },
  introEmoji: { fontSize: 64, marginBottom: 16 },
  introTitle: { fontSize: 28, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' },
  introSub: { fontSize: 14, color: C.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  infoCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: C.accent + '44', width: '100%', gap: 12, marginBottom: 24,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  infoText: { fontSize: 13, color: C.textSub, flex: 1 },

  pbBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.accentDim, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10, marginBottom: 20,
    borderWidth: 1, borderColor: C.accent + '44',
  },
  pbLabel: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  pbValue: { fontSize: 20, color: C.accent, fontWeight: '800' },

  completedBanner: {
    width: '100%', backgroundColor: '#22C55E18', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#22C55E44', padding: 18,
    alignItems: 'center', gap: 6, marginBottom: 8,
  },
  completedBannerTitle: { fontSize: 16, fontWeight: '800', color: '#22C55E' },
  completedBannerScore: { fontSize: 13, color: C.textSub, textAlign: 'center' },
  viewResultsBtn: {
    marginTop: 6, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#22C55E22', borderRadius: 10,
    borderWidth: 1, borderColor: '#22C55E66',
  },
  viewResultsBtnText: { fontSize: 13, color: '#22C55E', fontWeight: '700' },

  primaryBtn: {
    width: '100%', backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  dailyBtn: { backgroundColor: '#334155', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1.5 },

  // ── mode / difficulty select ──
  modeContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  modeTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8 },
  modeCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 20,
    borderWidth: 1.5, borderColor: C.border, gap: 4,
  },
  modeCardAccent: { borderColor: C.accent + '66' },
  modeCardEmoji: { fontSize: 28, marginBottom: 4 },
  modeCardTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  modeCardSub: { fontSize: 13, color: C.textSub },

  // ── countdown ──
  countdownNum: { fontSize: 80, fontWeight: '900', color: C.accent },

  // ── quiz ──
  quizHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  quizProgress: { fontSize: 15, fontWeight: '700', color: C.textSub },
  quizTimer: { fontSize: 18, fontWeight: '800', color: C.accent, fontVariant: ['tabular-nums'] },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotDone:    { backgroundColor: C.correct },
  dotCurrent: { backgroundColor: C.accent, width: 20 },
  dotPending: { backgroundColor: C.border },

  quizScroll: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },

  diffBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  diffBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  compoundName: { fontSize: 26, fontWeight: '800', color: C.text, lineHeight: 34 },

  formulaBox: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 2,
    paddingVertical: 20, alignItems: 'center', justifyContent: 'center',
    minHeight: 80,
  },
  formulaText: { fontSize: 32, fontWeight: '700', color: C.text, letterSpacing: 1 },
  formulaPlaceholder: { color: C.border, fontSize: 36 },

  // Selected ions with +/- controls
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.accent + '88', overflow: 'hidden',
  },
  countBtn: { paddingHorizontal: 10, paddingVertical: 10, backgroundColor: C.accentDim },
  countBtnText: { fontSize: 18, color: C.accent, fontWeight: '700' },
  selectedChipMid: { paddingHorizontal: 10, alignItems: 'center' },
  selectedSymbol: { fontSize: 15, fontWeight: '700', color: C.text },
  selectedCount:  { fontSize: 11, color: C.accent, fontWeight: '700' },

  // Ion chips (6 in a 3-column grid)
  ionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ionChip: {
    width: '30%', flexGrow: 1,
    backgroundColor: C.surface, borderRadius: 14, padding: 12,
    borderWidth: 1.5, borderColor: C.border, alignItems: 'center', gap: 4,
  },
  ionChipSelected: { borderColor: C.accent, backgroundColor: C.accentDim },
  ionSymbol: { fontSize: 18, fontWeight: '700', color: C.text },
  ionSymbolSelected: { color: C.accent },
  ionName: { fontSize: 10, color: C.textSub, textAlign: 'center' },
  ionNameSelected: { color: C.accent },
  chargeBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chargeText: { fontSize: 11, fontWeight: '700' },

  hintBox: {
    backgroundColor: '#F59E0B18', borderRadius: 12,
    borderWidth: 1, borderColor: '#F59E0B44', padding: 14,
  },
  hintText: { fontSize: 13, color: '#FCD34D', lineHeight: 20 },
  hintBtn: { alignSelf: 'flex-start' },
  hintBtnText: { fontSize: 13, color: C.textSub, textDecorationLine: 'underline' },

  actionRow: { flexDirection: 'row', gap: 12 },
  clearBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.border, alignItems: 'center',
  },
  clearBtnText: { fontSize: 15, color: C.textSub, fontWeight: '700' },
  submitBtn: {
    flex: 2, paddingVertical: 16, borderRadius: 14, alignItems: 'center',
    backgroundColor: C.accent,
  },
  submitBtnDisabled: { backgroundColor: C.border },
  submitBtnText: { fontSize: 15, color: '#fff', fontWeight: '800', letterSpacing: 1 },

  // ── results ──
  resultsScroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 20 },
  resultsCard: {
    backgroundColor: C.surface, borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.accent + '44', gap: 8,
  },
  resultsEmoji: { fontSize: 52, marginBottom: 4 },
  newPBBanner: { fontSize: 14, fontWeight: '800', color: C.accent },
  resultsScore: { fontSize: 56, fontWeight: '900', color: C.text },
  resultsScoreLabel: { fontSize: 14, color: C.textSub, marginBottom: 8 },

  resultsMeta: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20,
  },
  metaStat: { alignItems: 'center', minWidth: 70 },
  metaValue: { fontSize: 20, fontWeight: '800', color: C.text },
  metaLabel: { fontSize: 11, color: C.textSub, marginTop: 2 },

  rankText: { fontSize: 13, color: C.accent, fontWeight: '700', marginTop: 4 },

  breakdownSection: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 4 },
  qResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
    borderLeftWidth: 3,
  },
  qResultIcon: { fontSize: 18, fontWeight: '700', width: 20 },
  qResultLabel: { fontSize: 12, color: C.textSub },
  qResultFormula: { fontSize: 16, fontWeight: '700', color: C.text },

  lbSection: { gap: 8 },
  lbTabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  lbTab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  lbTabActive: { borderColor: C.accent, backgroundColor: C.accentDim },
  lbTabText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
  lbTabTextActive: { color: C.accent },

  lbRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  lbRowMe: { borderWidth: 1.5, borderColor: C.accent + '66' },
  lbPos: { fontSize: 14, fontWeight: '700', color: C.textSub, width: 32 },
  lbName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  lbStat: { fontSize: 14, fontWeight: '700', color: C.textSub },

  doneBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1.5 },
});
