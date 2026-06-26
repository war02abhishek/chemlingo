import React, { useRef, useState } from 'react';
import {
  Animated, Dimensions, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const GOALS = [
  { key: 'jee',   label: 'JEE',  emoji: '⚡', desc: 'Joint Entrance Examination' },
  { key: 'neet',  label: 'NEET', emoji: '🩺', desc: 'National Eligibility Entrance Test' },
  { key: 'other', label: 'Other', emoji: '🎯', desc: 'General chemistry learning' },
];

export default function OnboardingScreen({ onComplete }) {
  const scrollRef = useRef(null);
  const [page, setPage]       = useState(0);
  const [goal, setGoal]       = useState(null);

  const goTo = (n) => {
    scrollRef.current?.scrollTo({ x: n * width, animated: true });
    setPage(n);
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem('onboarding_done', '1');
    if (goal) await AsyncStorage.setItem('study_goal', goal);
    onComplete?.();
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Pages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: width * 3 }}
      >
        {/* Page 1 — Welcome */}
        <View style={[s.page, { width }]}>
          <Text style={s.mascot}>🧪</Text>
          <Text style={s.h1}>Welcome to Flasky!</Text>
          <Text style={s.body}>
            Learn chemistry through a structured adventure path, practice with mini-games, and compete with friends.
          </Text>
          <Text style={s.body} />
          <Text style={s.body}>Your path to chemistry mastery starts now.</Text>
        </View>

        {/* Page 2 — Goal */}
        <View style={[s.page, { width }]}>
          <Text style={s.h1}>What's your goal?</Text>
          <Text style={s.sub}>We'll personalise your experience</Text>
          <View style={s.goalList}>
            {GOALS.map((g) => (
              <TouchableOpacity
                key={g.key}
                style={[s.goalCard, goal === g.key && s.goalCardActive]}
                onPress={() => setGoal(g.key)}
              >
                <Text style={s.goalEmoji}>{g.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.goalLabel, goal === g.key && { color: '#2fc665' }]}>{g.label}</Text>
                  <Text style={s.goalDesc}>{g.desc}</Text>
                </View>
                {goal === g.key && <Text style={s.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Page 3 — First lesson nudge */}
        <View style={[s.page, { width }]}>
          <Text style={s.mascot}>🔬</Text>
          <Text style={s.h1}>Ready to start?</Text>
          <Text style={s.body}>
            Your first lesson in <Text style={{ fontWeight: '700', color: '#2fc665' }}>Physical Chemistry</Text> is waiting.
            Complete it to unlock more of the adventure path!
          </Text>
          <View style={s.badges}>
            <View style={s.badge}><Text style={s.badgeText}>+50 XP on first lesson</Text></View>
            <View style={[s.badge, { backgroundColor: '#0D9488' }]}><Text style={s.badgeText}>+10 coins</Text></View>
          </View>
        </View>
      </ScrollView>

      {/* Dots */}
      <View style={s.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[s.dot, page === i && s.dotActive]} />
        ))}
      </View>

      {/* CTA */}
      <View style={s.footer}>
        {page < 2 ? (
          <TouchableOpacity
            style={[s.btn, page === 1 && !goal && s.btnDisabled]}
            disabled={page === 1 && !goal}
            onPress={() => goTo(page + 1)}
          >
            <Text style={s.btnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.btn} onPress={handleFinish}>
            <Text style={s.btnText}>Let's Go! 🚀</Text>
          </TouchableOpacity>
        )}

        {page === 0 && (
          <TouchableOpacity style={s.skipBtn} onPress={handleFinish}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#fff' },
  page:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },

  mascot: { fontSize: 72, marginBottom: 8 },
  h1:     { fontSize: 28, fontWeight: '800', color: '#16204a', textAlign: 'center' },
  sub:    { fontSize: 14, color: '#8892a4', textAlign: 'center', marginTop: -8 },
  body:   { fontSize: 16, color: '#445', lineHeight: 26, textAlign: 'center' },

  goalList: { gap: 12, width: '100%', marginTop: 8 },
  goalCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: '#e9edf5', borderRadius: 14, padding: 16,
  },
  goalCardActive: { borderColor: '#2fc665', backgroundColor: '#f0fdf4' },
  goalEmoji:      { fontSize: 28 },
  goalLabel:      { fontSize: 16, fontWeight: '700', color: '#16204a' },
  goalDesc:       { fontSize: 12, color: '#8892a4' },
  check:          { fontSize: 18, color: '#2fc665', fontWeight: '700' },

  badges:    { flexDirection: 'row', gap: 10, marginTop: 8 },
  badge:     { backgroundColor: '#D97706', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 12 },
  dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e9edf5' },
  dotActive:  { width: 20, backgroundColor: '#2fc665' },

  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
  btn: {
    backgroundColor: '#2fc665', borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#e9edf5' },
  btnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },
  skipBtn:     { alignItems: 'center' },
  skipText:    { fontSize: 14, color: '#8892a4' },
});
