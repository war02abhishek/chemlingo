import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';
import CelebrationOverlay from '../../core/components/CelebrationOverlay';
import {
  type BossQuestion,
  fetchBossQuestions,
  submitBoss,
} from '../../core/curriculumApi';

// ── Hearts ────────────────────────────────────────────────────────────────────

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <View style={h.row}>
      {Array.from({ length: max }).map((_, i) => (
        <Text key={i} style={h.heart}>{i < count ? '❤️' : '🖤'}</Text>
      ))}
    </View>
  );
}
const h = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 4 },
  heart: { fontSize: 22 },
});

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: total > 0 ? `${(current / total) * 100}%` : '0%' }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  fill:  { height: '100%', backgroundColor: Colors.red, borderRadius: 4 },
});

// ── Result overlay ────────────────────────────────────────────────────────────

function ResultOverlay({
  passed, correct, total, xpEarned, coinsEarned, topicTitle, onContinue, onRetry,
}: {
  passed: boolean; correct: number; total: number;
  xpEarned: number; coinsEarned: number; topicTitle: string;
  onContinue: () => void; onRetry: () => void;
}) {
  const scale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 14 }).start();
  }, []);

  return (
    <View style={ro.overlay}>
      <Animated.View style={[ro.card, { transform: [{ scale }] }]}>
        <Text style={ro.emoji}>{passed ? '🏆' : '💪'}</Text>
        <Text style={ro.title}>{passed ? 'BOSS DEFEATED!' : 'Not Quite...'}</Text>
        <Text style={ro.topic}>{topicTitle}</Text>
        <Text style={ro.score}>{correct}/{total} correct</Text>
        {passed ? (
          <>
            <View style={ro.rewardRow}>
              <View style={ro.pill}>
                <Text style={ro.pillText}>+{xpEarned} XP</Text>
              </View>
              <View style={[ro.pill, { backgroundColor: '#0D9488' }]}>
                <Text style={ro.pillText}>+{coinsEarned} coins</Text>
              </View>
            </View>
            <Text style={ro.unlockText}>Next topic unlocked!</Text>
            <TouchableOpacity style={[ro.btn, { backgroundColor: Colors.green }]} onPress={onContinue}>
              <Text style={ro.btnText}>Continue</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={ro.hint}>Need 7/10 to pass. Keep practising!</Text>
            <TouchableOpacity style={[ro.btn, { backgroundColor: Colors.red }]} onPress={onRetry}>
              <Text style={ro.btnText}>Try Again</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </View>
  );
}
const ro = StyleSheet.create({
  overlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 100 },
  card:       { backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', gap: 10 },
  emoji:      { fontSize: 56 },
  title:      { fontFamily: Font.display, fontSize: 24, color: Colors.ink },
  topic:      { fontFamily: Font.body, fontSize: 14, color: Colors.muted },
  score:      { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  rewardRow:  { flexDirection: 'row', gap: 10 },
  pill:       { backgroundColor: '#D97706', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  pillText:   { fontFamily: Font.display, fontSize: 14, color: '#fff' },
  unlockText: { fontFamily: Font.body, fontSize: 14, color: Colors.green, fontWeight: '700' },
  hint:       { fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center' },
  btn:        { borderRadius: Radius.button, paddingVertical: 14, paddingHorizontal: 44, marginTop: 6 },
  btnText:    { fontFamily: Font.display, fontSize: 16, color: '#fff' },
});

// ── No-hearts overlay ─────────────────────────────────────────────────────────

function NoHeartsOverlay({ onBack }: { onBack: () => void }) {
  return (
    <View style={ro.overlay}>
      <View style={[ro.card, { gap: 14 }]}>
        <Text style={{ fontSize: 56 }}>💔</Text>
        <Text style={[ro.title, { color: Colors.red }]}>Out of Hearts</Text>
        <Text style={{ fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center' }}>
          Hearts refill every 24 hours. Come back tomorrow to retry!
        </Text>
        <TouchableOpacity style={[ro.btn, { backgroundColor: Colors.muted }]} onPress={onBack}>
          <Text style={ro.btnText}>Back to Path</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Phase = 'loading' | 'quiz' | 'feedback' | 'submitting' | 'result' | 'no_hearts' | 'error';

export default function BossBattleScreen({ route, navigation }: any) {
  const { topicId, topicTitle } = route.params ?? {};

  const [phase, setPhase]         = useState<Phase>('loading');
  const [questions, setQuestions] = useState<BossQuestion[]>([]);
  const [current, setCurrent]     = useState(0);
  const [selected, setSelected]   = useState<number | null>(null);
  const [answered, setAnswered]   = useState<{ question_id: string; selected_index: number }[]>([]);
  const [hearts, setHearts]       = useState(3);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [result, setResult]       = useState<{
    passed: boolean; correct: number; total: number; xpEarned: number; coinsEarned: number;
  } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [errMsg, setErrMsg]       = useState('');

  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setAnswered([]);
    setCurrent(0);
    setSelected(null);
    setHearts(3);
    setResult(null);
    setWasCorrect(null);
    try {
      const qs = await fetchBossQuestions(topicId);
      setQuestions(qs);
      setPhase('quiz');
    } catch {
      setErrMsg('Failed to load Boss Battle questions');
      setPhase('error');
    }
  }, [topicId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

  const question = questions[current];

  const handleSelect = (idx: number) => {
    if (selected !== null || phase !== 'quiz') return;
    setSelected(idx);

    const correct = idx === question.correct_index;
    setWasCorrect(correct);
    setPhase('feedback');

    const newHearts = correct ? hearts : hearts - 1;

    feedbackTimer.current = setTimeout(() => {
      const newAnswered = [...answered, { question_id: question.id, selected_index: idx }];
      setAnswered(newAnswered);

      if (!correct && newHearts <= 0) {
        setHearts(0);
        setPhase('no_hearts');
        return;
      }

      if (!correct) setHearts(newHearts);

      if (current < questions.length - 1) {
        setCurrent(current + 1);
        setSelected(null);
        setWasCorrect(null);
        setPhase('quiz');
      } else {
        // All answered — submit
        setPhase('submitting');
        submitBoss(topicId, newAnswered)
          .then((res) => {
            setResult({
              passed: res.passed, correct: res.correct, total: res.total,
              xpEarned: res.xp_earned, coinsEarned: res.coins_earned,
            });
            if (res.passed) setShowCelebration(true);
            setPhase('result');
          })
          .catch(() => {
            setErrMsg('Failed to submit. Please try again.');
            setPhase('error');
          });
      }
    }, 900); // show feedback for 900ms then advance
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.red} /></View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={s.safe}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.errorText}>{errMsg}</Text>
          <TouchableOpacity style={[s.nextBtn, { marginTop: 20 }]} onPress={load}>
            <Text style={s.nextBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.red} />
          <Text style={[s.errorText, { color: Colors.muted, marginTop: 16 }]}>Submitting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isFeedback = phase === 'feedback';

  return (
    <SafeAreaView style={s.safe}>
      <CelebrationOverlay
        type="boss_pass"
        visible={showCelebration}
        onDone={() => setShowCelebration(false)}
        duration={2400}
      />
      {phase === 'result' && result && (
        <ResultOverlay
          passed={result.passed} correct={result.correct} total={result.total}
          xpEarned={result.xpEarned} coinsEarned={result.coinsEarned}
          topicTitle={topicTitle ?? 'Topic'}
          onContinue={() => navigation.navigate('AdventurePath')}
          onRetry={load}
        />
      )}
      {phase === 'no_hearts' && <NoHeartsOverlay onBack={() => navigation.navigate('AdventurePath')} />}

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.bossLabel}>👹 Boss Battle</Text>
          <ProgressBar current={current} total={questions.length} />
          <Text style={s.qCount}>{current + 1} / {questions.length}</Text>
        </View>
        <Hearts count={hearts} />
      </View>

      <Text style={s.topicLabel}>{topicTitle}</Text>

      {question && (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.qCard}>
            <Text style={s.qPrompt}>{question.prompt}</Text>
            {!!question.reactants && (
              <View style={s.reactantBox}>
                <Text style={s.reactantText}>{question.reactants}</Text>
              </View>
            )}
            {!!question.condition && (
              <Text style={s.condition}>Conditions: {question.condition}</Text>
            )}
          </View>

          <View style={s.options}>
            {question.options.map((opt, idx) => {
              const isPicked   = selected === idx;
              const isCorrect  = idx === question.correct_index;
              const showGreen  = isFeedback && isCorrect;
              const showRed    = isFeedback && isPicked && !isCorrect;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    s.optBtn,
                    isPicked && !isFeedback && s.optBtnPicked,
                    showGreen && s.optBtnCorrect,
                    showRed   && s.optBtnWrong,
                  ]}
                  onPress={() => handleSelect(idx)}
                  activeOpacity={0.7}
                  disabled={phase !== 'quiz'}
                >
                  <View style={[
                    s.optLabel,
                    showGreen && { backgroundColor: '#16A34A' },
                    showRed   && { backgroundColor: Colors.red },
                    isPicked && !isFeedback && { backgroundColor: Colors.red },
                  ]}>
                    <Text style={[s.optLabelText, (showGreen || showRed || isPicked) && { color: '#fff' }]}>
                      {String.fromCharCode(65 + idx)}
                    </Text>
                  </View>
                  <Text style={[
                    s.optText,
                    showGreen && { color: '#16A34A', fontWeight: '700' },
                    showRed   && { color: Colors.red, fontWeight: '700' },
                  ]}>
                    {opt}
                  </Text>
                  {showGreen && <Text style={{ fontSize: 18 }}>✓</Text>}
                  {showRed   && <Text style={{ fontSize: 18 }}>✗</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {isFeedback && (
            <View style={[s.feedbackBanner, wasCorrect ? s.feedbackCorrect : s.feedbackWrong]}>
              <Text style={s.feedbackText}>
                {wasCorrect ? '✓ Correct!' : `✗ Correct answer: ${question.options[question.correct_index]}`}
              </Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:   { paddingRight: 4 },
  backText:  { fontFamily: Font.body, fontSize: 15, color: Colors.blue },
  headerMid: { flex: 1, gap: 4 },
  bossLabel: { fontFamily: Font.display, fontSize: 13, color: Colors.red },
  qCount:    { fontFamily: Font.body, fontSize: 11, color: Colors.muted, textAlign: 'right' },

  topicLabel: { fontFamily: Font.body, fontSize: 13, color: Colors.muted, paddingHorizontal: 20, paddingTop: 10 },

  scroll: { padding: 20 },

  qCard: {
    backgroundColor: '#fff', borderRadius: Radius.card, padding: 20,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20, gap: 12,
  },
  qPrompt:     { fontFamily: Font.display, fontSize: 17, color: Colors.ink, lineHeight: 26 },
  reactantBox: { backgroundColor: '#FFF1F2', borderRadius: 10, padding: 12 },
  reactantText:{ fontFamily: Font.body, fontSize: 15, color: Colors.red, textAlign: 'center', fontWeight: '700' },
  condition:   { fontFamily: Font.body, fontSize: 13, color: Colors.muted, fontStyle: 'italic' },

  options: { gap: 12, marginBottom: 16 },
  optBtn: {
    backgroundColor: '#fff', borderRadius: Radius.card, borderWidth: 1.5,
    borderColor: Colors.border, flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
  },
  optBtnPicked:  { borderColor: Colors.red, backgroundColor: '#FFF1F2' },
  optBtnCorrect: { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  optBtnWrong:   { borderColor: Colors.red, backgroundColor: '#FFF1F2' },
  optLabel:      { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  optLabelText:  { fontFamily: Font.display, fontSize: 13, color: Colors.ink },
  optText:       { fontFamily: Font.body, fontSize: 15, color: Colors.ink, flex: 1 },

  feedbackBanner: { borderRadius: 12, padding: 14, alignItems: 'center' },
  feedbackCorrect:{ backgroundColor: '#F0FDF4' },
  feedbackWrong:  { backgroundColor: '#FFF1F2' },
  feedbackText:   { fontFamily: Font.display, fontSize: 14, color: Colors.ink },

  nextBtn:         { backgroundColor: Colors.red, borderRadius: Radius.button, padding: 16, alignItems: 'center' },
  nextBtnText:     { fontFamily: Font.display, fontSize: 16, color: '#fff' },
  errorText:       { fontFamily: Font.body, fontSize: 15, color: Colors.red, textAlign: 'center' },
});
