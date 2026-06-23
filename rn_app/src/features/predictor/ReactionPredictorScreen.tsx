import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Animated, Easing,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  fetchLessonQuestions, submitLesson,
  PredictorQuestion,
} from '../../core/predictorApi';
import { completeLesson } from '../../core/curriculumApi';
import { Colors, Font, Shadow3D } from '../../core/theme';

// ── SVG icons ─────────────────────────────────────────────────────────────────
function CloseIcon() {
  return (
    <Svg width="16" height="16" viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke="#6b7393" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}
function HeartIcon({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21s-7.5-4.7-9.7-9.4C.6 8 2.3 4.4 5.8 4.4c2 0 3.4 1.2 4.2 2.5.8-1.3 2.2-2.5 4.2-2.5 3.5 0 5.2 3.6 3.5 7.2C19.5 16.3 12 21 12 21z" fill="#ff4d5e" />
    </Svg>
  );
}
function ArrowSvg() {
  return (
    <Svg width="44" height="14" viewBox="0 0 44 14">
      <Path d="M2 7h38M34 2l7 5-7 5" fill="none" stroke="#2f6bfe" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function CheckCircleSvg() {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="11" fill="#2fc665" />
      <Path d="M7 12l3 3 6-6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function WrongCircleSvg() {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="11" fill="#ff4d5e" />
      <Path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}
function FeedbackCheckSvg() {
  return (
    <Svg width="26" height="26" viewBox="0 0 24 24">
      <Path d="M5 12l4 4L19 7" fill="none" stroke="#2fc665" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function FeedbackWrongSvg() {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24">
      <Path d="M7 7l10 10M17 7L7 17" stroke="#ff4d5e" strokeWidth="3.2" strokeLinecap="round" />
    </Svg>
  );
}

const LETTERS = ['A', 'B', 'C', 'D'];

interface GameState {
  qIndex: number;
  selected: number | null;
  checked: boolean;
  correctCount: number;
  combo: number;
  sessionXp: number;
  sessionCoins: number;
  lastGain: number;
  hearts: number;
}

export default function ReactionPredictorScreen({ route, navigation }: any) {
  const { lessonId, lessonMode = false, lessonTitle = 'Reaction Predictor' } = route.params ?? {};

  const [questions, setQuestions] = useState<PredictorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gs, setGs] = useState<GameState>({
    qIndex: 0, selected: null, checked: false,
    correctCount: 0, combo: 0, sessionXp: 0, sessionCoins: 0, lastGain: 0, hearts: 5,
  });

  const startTimeRef = useRef<number>(0);
  const answersRef = useRef<{ question_id: string; selected_index: number }[]>([]);

  // Feedback bar slide-up animation
  const feedbackY = useRef(new Animated.Value(200)).current;
  const feedbackSlideUp = () => {
    feedbackY.setValue(200);
    Animated.timing(feedbackY, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  useEffect(() => {
    if (!lessonId) { setLoading(false); return; }
    fetchLessonQuestions(lessonId)
      .then((qs) => { setQuestions(qs); startTimeRef.current = Date.now(); setLoading(false); })
      .catch((e) => { console.error('fetchLessonQuestions failed:', e?.response?.status, e?.message); setLoading(false); });
  }, [lessonId]);

  const q = questions[gs.qIndex];
  const total = questions.length;
  const isLast = gs.qIndex >= total - 1;
  const progressPct = total > 0 ? Math.round(((gs.qIndex + (gs.checked ? 1 : 0)) / total) * 100) : 0;
  const correctIndex = q?.correct_index ?? 0;

  const handleSelect = (idx: number) => {
    if (gs.checked) return;
    setGs((prev) => ({ ...prev, selected: idx }));
  };

  const handleCheck = () => {
    if (gs.selected === null || gs.checked) return;
    const correct = gs.selected === correctIndex;
    const gain = correct ? 10 + Math.min(gs.combo, 5) * 2 : 0;

    answersRef.current = [...answersRef.current, { question_id: q.id, selected_index: gs.selected }];

    setGs((prev) => ({
      ...prev,
      checked: true,
      lastGain: gain,
      correctCount: prev.correctCount + (correct ? 1 : 0),
      combo: correct ? prev.combo + 1 : 0,
      sessionXp: prev.sessionXp + gain,
      sessionCoins: prev.sessionCoins + (correct ? 5 : 0),
      hearts: correct ? prev.hearts : Math.max(0, prev.hearts - 1),
    }));
    feedbackSlideUp();
  };

  const handleNext = async () => {
    if (isLast) {
      setSubmitting(true);
      const elapsed = Date.now() - startTimeRef.current;
      const finalCorrect = gs.correctCount + (gs.selected === correctIndex ? 1 : 0);
      const accuracy = Math.round((finalCorrect / total) * 100);
      try {
        const res = await submitLesson(lessonId, answersRef.current, elapsed);
        // Mark lesson complete so next lesson unlocks
        if (lessonId) await completeLesson(lessonId, res.score ?? 0).catch(() => {});
        navigation.navigate('Reward', {
          xp: res.xp_earned ?? gs.sessionXp,
          coins: res.coins_earned ?? gs.sessionCoins,
          accuracy,
          lessonTitle,
          lessonId,
          streak: true,
        });
      } catch {
        if (lessonId) await completeLesson(lessonId, 0).catch(() => {});
        navigation.navigate('Reward', {
          xp: gs.sessionXp,
          coins: gs.sessionCoins,
          accuracy,
          lessonTitle,
          lessonId,
          streak: false,
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      setGs((prev) => ({
        ...prev,
        qIndex: prev.qIndex + 1,
        selected: null,
        checked: false,
      }));
    }
  };

  if (loading || submitting) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.green} />
          {submitting && <Text style={s.submittingText}>Saving results…</Text>}
        </View>
      </SafeAreaView>
    );
  }

  if (!q) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.emptyText}>No questions available.</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCorrect = gs.checked && gs.selected === correctIndex;
  const canCheck = gs.selected !== null && !gs.checked;

  const feedbackBg = isCorrect ? '#e7f9ee' : '#ffecef';
  const feedbackTitleColor = isCorrect ? '#147a3e' : '#c0263a';
  const feedbackTitle = isCorrect ? 'Nice work!' : 'Not quite';
  const feedbackSub = isCorrect ? `+${gs.lastGain} XP earned` : `Answer: ${q?.options[correctIndex] ?? ''}`;
  const continueBtnBg = isCorrect ? '#2fc665' : '#ff4d5e';
  const continueBtnShadow = isCorrect ? '#23a052' : '#d63a49';
  const continueLabel = isLast ? 'Finish' : 'Continue';

  // "?" box style
  const qboxBg = gs.checked ? '#e7f9ee' : '#e8f0ff';
  const qboxColor = gs.checked ? '#147a3e' : '#2f6bfe';
  const qboxText = gs.checked ? (q?.options[correctIndex] ?? '') : '?';

  return (
    <SafeAreaView style={s.safe}>
      {/* Header: X + progress bar + hearts */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.goBack()}>
          <CloseIcon />
        </TouchableOpacity>
        <View style={s.progressBarBg}>
          <View style={[s.progressBarFill, { width: `${progressPct}%` as any }]} />
        </View>
        <View style={s.heartsRow}>
          <HeartIcon size={19} />
          <Text style={s.heartsVal}>{gs.hearts}</Text>
        </View>
      </View>

      {/* Scrollable game body */}
      <View style={s.body}>
        {/* Chips row: concept + combo */}
        <View style={s.chipsRow}>
          <View style={s.conceptChip}>
            <Text style={s.conceptChipText} numberOfLines={1}>{q.concept || 'Chemistry'}</Text>
          </View>
          {gs.combo >= 2 && (
            <View style={s.comboChip}>
              <Text style={s.comboChipText}>{gs.combo}x combo</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={s.gameTitle}>Predict the product</Text>
        <Text style={s.gameSub}>Reaction Predictor · Q{gs.qIndex + 1} of {total}</Text>

        {/* Reaction card */}
        <View style={s.reactionCard}>
          <Text style={s.reactants}>{q.reactants || q.prompt}</Text>
          <View style={s.arrowCol}>
            {q.condition ? (
              <Text style={s.condition}>{q.condition}</Text>
            ) : null}
            <ArrowSvg />
          </View>
          <View style={[s.qbox, { backgroundColor: qboxBg }]}>
            <Text style={[s.qboxText, { color: qboxColor, fontSize: gs.checked ? 18 : 24 }]}>{qboxText}</Text>
          </View>
        </View>

        {/* Options */}
        <View style={s.options}>
          {q.options.map((opt, idx) => {
            const isSelected = gs.selected === idx;
            const isThisCorrect = gs.checked && idx === correctIndex;
            const isThisWrong = gs.checked && idx === gs.selected && idx !== correctIndex;

            let borderColor = '#e3e7f0';
            let shadow = { shadowColor: '#e8ecf5', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 };
            let badgeBg = '#eef1f8';
            let badgeColor = '#8a92ab';
            let textColor = '#16204a';

            if (!gs.checked && isSelected) {
              borderColor = '#2f6bfe';
              shadow = { shadowColor: '#2f6bfe', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 };
              badgeBg = '#2f6bfe'; badgeColor = '#fff';
            }
            if (gs.checked) {
              if (isThisCorrect) {
                borderColor = '#2fc665'; textColor = '#147a3e';
                shadow = { shadowColor: '#2fc665', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 };
                badgeBg = '#2fc665'; badgeColor = '#fff';
              } else if (isThisWrong) {
                borderColor = '#ff4d5e'; textColor = '#c0263a';
                shadow = { shadowColor: '#ff4d5e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 };
                badgeBg = '#ff4d5e'; badgeColor = '#fff';
              } else {
                textColor = '#aab2c5';
              }
            }

            return (
              <TouchableOpacity
                key={idx}
                style={[s.option, { borderColor }, shadow]}
                onPress={() => handleSelect(idx)}
                activeOpacity={0.85}
                disabled={gs.checked}
              >
                <View style={[s.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[s.badgeText, { color: badgeColor }]}>{LETTERS[idx]}</Text>
                </View>
                <Text style={[s.optionText, { color: textColor }]} numberOfLines={2}>{opt}</Text>
                {isThisCorrect && <CheckCircleSvg />}
                {isThisWrong && <WrongCircleSvg />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Footer: Check button OR Feedback bar */}
      {!gs.checked ? (
        <View style={s.checkFooter}>
          <TouchableOpacity
            style={[s.checkBtn, canCheck ? s.checkBtnActive : s.checkBtnDisabled]}
            onPress={handleCheck}
            disabled={!canCheck}
            activeOpacity={0.85}
          >
            <Text style={[s.checkBtnText, !canCheck && s.checkBtnTextDisabled]}>Check</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View style={[s.feedbackBar, { backgroundColor: feedbackBg, transform: [{ translateY: feedbackY }] }]}>
          <View style={s.feedbackLeft}>
            <View style={s.feedbackIconCircle}>
              {isCorrect ? <FeedbackCheckSvg /> : <FeedbackWrongSvg />}
            </View>
            <View>
              <Text style={[s.feedbackTitle, { color: feedbackTitleColor }]}>{feedbackTitle}</Text>
              <Text style={s.feedbackSub}>{feedbackSub}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[s.continueBtn, { backgroundColor: continueBtnBg, shadowColor: continueBtnShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={s.continueBtnText}>{continueLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  submittingText: { fontFamily: Font.body, fontSize: 15, color: Colors.muted },
  emptyText: { fontFamily: Font.body, fontSize: 15, color: Colors.muted },
  backBtn: { padding: 12 },
  backBtnText: { fontFamily: Font.body, fontSize: 15, color: Colors.blue },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#eef1f8', justifyContent: 'center', alignItems: 'center',
  },
  progressBarBg: {
    flex: 1, height: 11, backgroundColor: '#eef1f8', borderRadius: 99, overflow: 'hidden',
  },
  progressBarFill: { height: 11, backgroundColor: Colors.green, borderRadius: 99 },
  heartsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heartsVal: { fontFamily: Font.display, fontSize: 15, color: '#ff4d5e' },

  // Game body
  body: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  conceptChip: { backgroundColor: '#f0eaff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  conceptChipText: { fontFamily: Font.display, fontSize: 12, color: '#8b5cf6', maxWidth: 180 },
  comboChip: { backgroundColor: '#fff2e8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  comboChipText: { fontFamily: Font.display, fontSize: 13, color: '#ff7a26' },

  gameTitle: { fontFamily: Font.display, fontSize: 21, color: '#16204a', marginTop: 16, marginBottom: 4 },
  gameSub: { fontFamily: Font.body, fontSize: 13, color: '#8a92ab' },

  // Reaction card
  reactionCard: {
    marginTop: 16, backgroundColor: '#f7f9fd', borderWidth: 2, borderColor: '#e8ecf5',
    borderRadius: 18, padding: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap',
  },
  reactants: { fontFamily: Font.display, fontSize: 23, color: '#16204a' },
  arrowCol: { flexDirection: 'column', alignItems: 'center', gap: 3 },
  condition: { fontFamily: Font.body, fontSize: 10, color: '#2f6bfe', textTransform: 'uppercase', letterSpacing: 0.4 },
  qbox: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, minWidth: 44, alignItems: 'center' },
  qboxText: { fontFamily: Font.display, textAlign: 'center' },

  // Options
  options: { marginTop: 18, gap: 11 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2.5, borderRadius: 16,
    paddingHorizontal: 15, paddingVertical: 14,
    backgroundColor: '#fff',
  },
  badge: { width: 28, height: 28, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontFamily: Font.display, fontSize: 14 },
  optionText: { fontFamily: Font.display, fontSize: 17, flex: 1, lineHeight: 22 },

  // Check footer
  checkFooter: {
    paddingHorizontal: 22, paddingBottom: 28, paddingTop: 14,
    borderTopWidth: 2, borderTopColor: '#eef1f8', backgroundColor: '#fff',
  },
  checkBtn: { width: '100%', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  checkBtnActive: {
    backgroundColor: Colors.green,
    shadowColor: Colors.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4,
  },
  checkBtnDisabled: { backgroundColor: '#eef1f8' },
  checkBtnText: { fontFamily: Font.display, fontSize: 17, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
  checkBtnTextDisabled: { color: '#b3bacb' },

  // Feedback bar
  feedbackBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28,
  },
  feedbackLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  feedbackIconCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
  },
  feedbackTitle: { fontFamily: Font.display, fontSize: 18 },
  feedbackSub: { fontFamily: Font.body, fontSize: 13, color: '#586079', marginTop: 2 },
  continueBtn: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  continueBtnText: { fontFamily: Font.display, fontSize: 15, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
});
