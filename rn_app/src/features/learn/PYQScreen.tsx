import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';
import {
  fetchPYQQuestions, submitPYQ,
  type PYQQuestion, type PYQResult,
} from '../../core/pyqApi';
import CelebrationOverlay from '../../core/components/CelebrationOverlay';

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={pd.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[pd.dot, i < current && pd.done, i === current && pd.active]} />
      ))}
    </View>
  );
}
const pd = StyleSheet.create({
  row:    { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5E7EB' },
  done:   { backgroundColor: Colors.green },
  active: { backgroundColor: Colors.blue, width: 20 },
});

// ── Exam tag ──────────────────────────────────────────────────────────────────

function ExamTag({ exam, year }: { exam: string; year: number }) {
  const color = exam === 'JEE Advanced' ? Colors.purple : exam === 'NEET' ? Colors.orange : Colors.blue;
  return (
    <View style={[et.pill, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[et.text, { color }]}>{exam} {year}</Text>
    </View>
  );
}
const et = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 12 },
  text: { fontFamily: Font.display, fontSize: 11, letterSpacing: 0.4 },
});

// ── Result screen ─────────────────────────────────────────────────────────────

function ResultScreen({
  correct, total, xpEarned, coinsEarned, topicTitle,
  questions, results, onDone,
}: {
  correct: number; total: number; xpEarned: number; coinsEarned: number;
  topicTitle: string; questions: PYQQuestion[]; results: PYQResult[];
  onDone: () => void;
}) {
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 12 }).start();
  }, []);

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const emoji = pct >= 80 ? '🎯' : pct >= 60 ? '📚' : '💪';

  const qMap = new Map(questions.map((q) => [q.id, q]));

  return (
    <ScrollView contentContainerStyle={rs.scroll} showsVerticalScrollIndicator={false}>
      <Animated.View style={[rs.card, { transform: [{ scale }] }]}>
        <Text style={rs.emoji}>{emoji}</Text>
        <Text style={rs.score}>{correct}/{total}</Text>
        <Text style={rs.label}>PYQ Score · {pct}%</Text>
        <Text style={rs.topic}>{topicTitle}</Text>
        <View style={rs.rewardRow}>
          <View style={rs.pill}>
            <Text style={rs.pillText}>+{xpEarned} XP</Text>
          </View>
          <View style={[rs.pill, { backgroundColor: Colors.teal }]}>
            <Text style={rs.pillText}>+{coinsEarned} coins</Text>
          </View>
        </View>
      </Animated.View>

      <Text style={rs.reviewTitle}>Answer Review</Text>
      {results.map((r) => {
        const q = qMap.get(r.question_id);
        if (!q) return null;
        return (
          <View key={r.question_id} style={[rs.reviewCard, r.correct ? rs.correctCard : rs.wrongCard]}>
            <ExamTag exam={q.exam} year={q.year} />
            <Text style={rs.qText}>{q.statement}</Text>
            <View style={rs.ansRow}>
              <Text style={[rs.ansLabel, r.correct ? rs.correctLabel : rs.wrongLabel]}>
                {r.correct ? '✓ Correct' : '✗ Wrong'}
              </Text>
              {!r.correct && (
                <Text style={rs.correctAns}>  Correct: {q.options[r.correct_index]}</Text>
              )}
            </View>
            <Text style={rs.explanation}>{r.explanation}</Text>
          </View>
        );
      })}

      <TouchableOpacity
        style={[rs.btn, Shadow3D(Colors.greenDark)]}
        onPress={onDone}
        activeOpacity={0.85}
      >
        <Text style={rs.btnText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const rs = StyleSheet.create({
  scroll:      { padding: 20, paddingBottom: 40 },
  card:        { backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 24, alignItems: 'center', marginBottom: 24 },
  emoji:       { fontSize: 48, marginBottom: 8 },
  score:       { fontFamily: Font.display, fontSize: 40, color: Colors.ink },
  label:       { fontFamily: Font.body, fontSize: 13, color: Colors.muted, marginBottom: 4 },
  topic:       { fontFamily: Font.display, fontSize: 14, color: Colors.ink, marginBottom: 16 },
  rewardRow:   { flexDirection: 'row', gap: 10 },
  pill:        { backgroundColor: Colors.green, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
  pillText:    { fontFamily: Font.display, fontSize: 13, color: '#fff' },
  reviewTitle: { fontFamily: Font.display, fontSize: 14, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  reviewCard:  { borderRadius: Radius.card, padding: 16, marginBottom: 12, borderWidth: 1.5 },
  correctCard: { backgroundColor: Colors.green + '0C', borderColor: Colors.green + '40' },
  wrongCard:   { backgroundColor: Colors.red + '0C', borderColor: Colors.red + '40' },
  qText:       { fontFamily: Font.body, fontSize: 14, color: Colors.ink, marginBottom: 8, lineHeight: 20 },
  ansRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  ansLabel:    { fontFamily: Font.display, fontSize: 13 },
  correctLabel: { color: Colors.green },
  wrongLabel:   { color: Colors.red },
  correctAns:  { fontFamily: Font.body, fontSize: 13, color: Colors.muted },
  explanation: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, lineHeight: 18, fontStyle: 'italic' },
  btn:         { backgroundColor: Colors.green, borderRadius: Radius.button, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText:     { fontFamily: Font.display, fontSize: 15, color: '#fff' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type Phase = 'loading' | 'intro' | 'quiz' | 'submitting' | 'results';

export default function PYQScreen({ route, navigation }: any) {
  const { topicId, topicTitle, topicSlug } = route.params as {
    topicId: string; topicTitle: string; topicSlug: string;
  };

  const [phase, setPhase]         = useState<Phase>('loading');
  const [questions, setQuestions] = useState<PYQQuestion[]>([]);
  const [bestScore, setBestScore] = useState(0);
  const [current, setCurrent]     = useState(0);
  const [answers, setAnswers]     = useState<{ question_id: string; selected_index: number }[]>([]);
  const [selected, setSelected]   = useState<number | null>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    try {
      const res = await fetchPYQQuestions(topicId);
      setQuestions(res.questions);
      setBestScore(res.best_score);
      setPhase('intro');
    } catch {
      navigation.goBack();
    }
  }, [topicId, navigation]);

  useEffect(() => { load(); }, [load]);

  const fadeIn = (cb: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(cb);
  };

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
  };

  const handleNext = () => {
    if (selected === null) return;
    const q = questions[current];
    const newAnswers = [...answers, { question_id: q.id, selected_index: selected }];
    setAnswers(newAnswers);

    if (current + 1 < questions.length) {
      fadeIn(() => {
        setCurrent((c) => c + 1);
        setSelected(null);
      });
    } else {
      handleSubmit(newAnswers);
    }
  };

  const handleSubmit = async (finalAnswers: typeof answers) => {
    setPhase('submitting');
    try {
      const res = await submitPYQ(topicId, finalAnswers);
      setSubmitResult(res);
      if (res.score >= 60) setShowCelebration(true);
      setPhase('results');
    } catch {
      setPhase('results');
    }
  };

  if (phase === 'loading') {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={Colors.amber} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.green} />
          <Text style={s.submittingText}>Submitting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'results' && submitResult) {
    return (
      <SafeAreaView style={s.safe}>
        <CelebrationOverlay
          type="pyq_good"
          visible={showCelebration}
          onDone={() => setShowCelebration(false)}
          duration={2200}
        />
        <ResultScreen
          correct={submitResult.correct}
          total={submitResult.total}
          xpEarned={submitResult.xp_earned}
          coinsEarned={submitResult.coins_earned}
          topicTitle={topicTitle}
          questions={questions}
          results={submitResult.results}
          onDone={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'intro') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.introWrap}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.introIcon}>📋</Text>
          <Text style={s.introTitle}>Past Year Questions</Text>
          <Text style={s.introTopic}>{topicTitle}</Text>
          <Text style={s.introSub}>{questions.length} questions from JEE Main, JEE Advanced & NEET</Text>
          {bestScore > 0 && (
            <View style={s.bestPill}>
              <Text style={s.bestText}>Best: {bestScore}%</Text>
            </View>
          )}
          <View style={s.infoRow}>
            <View style={s.infoPill}><Text style={s.infoText}>+15 XP per correct</Text></View>
            <View style={s.infoPill}><Text style={s.infoText}>+5 coins per correct</Text></View>
          </View>
          <TouchableOpacity
            style={[s.startBtn, Shadow3D(Colors.amberDark ?? Colors.amber)]}
            onPress={() => setPhase('quiz')}
            activeOpacity={0.85}
          >
            <Text style={s.startBtnText}>Start Practice →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Quiz phase
  const q = questions[current];
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.quizHeader}>
        <Text style={s.qNum}>{current + 1} / {questions.length}</Text>
        <ProgressDots total={questions.length} current={current} />
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView style={{ opacity: fadeAnim }} contentContainerStyle={s.quizScroll}>
        <ExamTag exam={q.exam} year={q.year} />
        <Text style={s.statement}>{q.statement}</Text>

        <View style={s.optionsWrap}>
          {q.options.map((opt, i) => {
            const isSelected = selected === i;
            return (
              <TouchableOpacity
                key={i}
                style={[s.optionBtn, isSelected && s.optionSelected]}
                onPress={() => handleSelect(i)}
                activeOpacity={0.8}
                disabled={selected !== null}
              >
                <Text style={s.optionLabel}>{String.fromCharCode(65 + i)}.</Text>
                <Text style={[s.optionText, isSelected && s.optionTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selected !== null && (
          <TouchableOpacity
            style={[s.nextBtn, Shadow3D(Colors.blueDark)]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={s.nextBtnText}>
              {current + 1 < questions.length ? 'Next →' : 'Submit'}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: Colors.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  submittingText: { fontFamily: Font.body, fontSize: 14, color: Colors.muted, marginTop: 12 },

  // Intro
  introWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  backBtn:    { position: 'absolute', top: 16, left: 16 },
  backText:   { fontFamily: Font.body, fontSize: 14, color: Colors.blue },
  introIcon:  { fontSize: 56, marginBottom: 12 },
  introTitle: { fontFamily: Font.display, fontSize: 26, color: Colors.ink, marginBottom: 4 },
  introTopic: { fontFamily: Font.display, fontSize: 15, color: Colors.blue, marginBottom: 6 },
  introSub:   { fontFamily: Font.body, fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  bestPill:   { backgroundColor: Colors.amber + '20', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 16 },
  bestText:   { fontFamily: Font.display, fontSize: 13, color: Colors.amber },
  infoRow:    { flexDirection: 'row', gap: 8, marginBottom: 24 },
  infoPill:   { backgroundColor: Colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  infoText:   { fontFamily: Font.body, fontSize: 12, color: Colors.muted },
  startBtn:   { width: '100%', backgroundColor: Colors.amber, borderRadius: Radius.button, padding: 16, alignItems: 'center' },
  startBtnText: { fontFamily: Font.display, fontSize: 16, color: '#fff' },

  // Quiz
  quizHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  qNum:       { fontFamily: Font.display, fontSize: 13, color: Colors.muted, width: 40 },
  quizScroll: { padding: 20, paddingBottom: 40 },
  statement:  { fontFamily: Font.body, fontSize: 16, color: Colors.ink, lineHeight: 24, marginBottom: 20 },
  optionsWrap: { gap: 10, marginBottom: 20 },
  optionBtn:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 14, borderWidth: 1.5, borderColor: Colors.border },
  optionSelected: { borderColor: Colors.blue, backgroundColor: Colors.blue + '0F' },
  optionLabel: { fontFamily: Font.display, fontSize: 14, color: Colors.muted, width: 20 },
  optionText:  { fontFamily: Font.body, fontSize: 14, color: Colors.ink, flex: 1, lineHeight: 20 },
  optionTextSelected: { color: Colors.blue },
  nextBtn:    { backgroundColor: Colors.blue, borderRadius: Radius.button, padding: 16, alignItems: 'center' },
  nextBtnText: { fontFamily: Font.display, fontSize: 15, color: '#fff' },
});
