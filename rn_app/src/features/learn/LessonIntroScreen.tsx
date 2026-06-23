import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Animated, Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import FlaskyMascot from '../../core/components/FlaskyMascot';
import { Colors, Font, Shadow3D } from '../../core/theme';

// ── SVG icons ────────────────────────────────────────────────────────────────
function CloseIcon() {
  return (
    <Svg width="18" height="18" viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" stroke="#6b7393" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}

// Concept chips per game mode
const MODE_CHIPS: Record<string, { label: string; bg: string; color: string }[]> = {
  reaction_predictor: [
    { label: 'Reactants', bg: '#e8f0ff', color: '#2f6bfe' },
    { label: 'Products', bg: '#e6f8f1', color: '#159083' },
    { label: 'Mechanisms', bg: '#f0eaff', color: '#8b5cf6' },
  ],
  periodic_sprint: [
    { label: 'Elements', bg: '#e8f0ff', color: '#2f6bfe' },
    { label: 'Periodic trends', bg: '#e6f8f1', color: '#159083' },
    { label: 'Properties', bg: '#f0eaff', color: '#8b5cf6' },
  ],
  compound_builder: [
    { label: 'Valence', bg: '#e8f0ff', color: '#2f6bfe' },
    { label: 'Bonding', bg: '#e6f8f1', color: '#159083' },
    { label: 'Structure', bg: '#f0eaff', color: '#8b5cf6' },
  ],
};

const GAME_ROUTE: Record<string, string> = {
  reaction_predictor: 'ReactionPredictor',
  periodic_sprint: 'PeriodicSprint',
  compound_builder: 'CompoundBuilder',
};

interface Params {
  lessonId: string;
  lessonTitle: string;
  lessonPosition?: number;
  topicTitle: string;
  topicIcon: string;
  conceptText: string;
  xpReward: number;
  coinReward: number;
  gameMode: string;
}

export default function LessonIntroScreen({ route, navigation }: any) {
  const {
    lessonId, lessonTitle, lessonPosition = 1,
    topicTitle, topicIcon, conceptText, xpReward, coinReward, gameMode,
  }: Params = route.params;

  const gameRoute = GAME_ROUTE[gameMode] ?? 'ReactionPredictor';

  // Floating animation for Flasky mascot
  const floatY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(floatY, { toValue: -7, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(floatY, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  const handleStart = () => {
    navigation.navigate(gameRoute, { lessonId, lessonMode: true, lessonTitle });
  };

  const chips = MODE_CHIPS[gameMode] ?? MODE_CHIPS.reaction_predictor;

  // Show concept text — bold the first keyword if pattern is "X forms when..." or similar
  const fullConcept = (conceptText ?? '').trim() || 'Study this concept and then test your knowledge with a practice game.';

  return (
    <SafeAreaView style={s.safe}>
      {/* Header: X + 3 progress bars */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.goBack()}>
          <CloseIcon />
        </TouchableOpacity>
        <View style={s.progressBars}>
          <View style={[s.progressSeg, s.progressSegActive]} />
          <View style={[s.progressSeg, s.progressSegInactive]} />
          <View style={[s.progressSeg, s.progressSegInactive]} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow */}
        <Text style={s.eyebrow}>CONCEPT · LESSON {lessonPosition}</Text>
        {/* Title */}
        <Text style={s.title}>{lessonTitle}</Text>

        {/* Floating Flasky mascot */}
        <Animated.View style={[s.mascotWrap, { transform: [{ translateY: floatY }] }]}>
          <FlaskyMascot size={96} />
        </Animated.View>

        {/* Speech bubble card */}
        <View style={s.bubble}>
          {/* Triangle pointer at top */}
          <View style={s.bubbleArrow} />
          <Text style={s.bubbleText}>{fullConcept}</Text>
        </View>

        {/* Striped diagram placeholder */}
        <View style={s.diagram}>
          <Text style={s.diagramLabel}>Diagram · {lessonTitle}</Text>
        </View>

        {/* Concept chips */}
        <View style={s.chipsRow}>
          {chips.map((chip) => (
            <View key={chip.label} style={[s.chip, { backgroundColor: chip.bg }]}>
              <Text style={[s.chipText, { color: chip.color }]}>{chip.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky footer: START PRACTICE */}
      <View style={s.footer}>
        <TouchableOpacity style={[s.startBtn, { shadowColor: Colors.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 }]} activeOpacity={0.85} onPress={handleStart}>
          <Text style={s.startBtnText}>START PRACTICE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f9fd' },
  scroll: { paddingHorizontal: 22, paddingBottom: 20, alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#eef1f8', justifyContent: 'center', alignItems: 'center',
  },
  progressBars: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 9, borderRadius: 99 },
  progressSegActive: { backgroundColor: Colors.green },
  progressSegInactive: { backgroundColor: '#dfe4ee' },

  eyebrow: {
    fontFamily: Font.body, fontSize: 12, color: '#2f6bfe',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6,
  },
  title: { fontFamily: Font.display, fontSize: 26, color: '#16204a', marginTop: 2, textAlign: 'center' },

  mascotWrap: { marginTop: 18, marginBottom: 6 },

  bubble: {
    position: 'relative', backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#e8ecf5',
    borderRadius: 18, padding: 16,
    shadowColor: '#eef1f8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2,
    alignSelf: 'stretch', marginTop: 6,
  },
  bubbleArrow: {
    position: 'absolute', top: -9, left: 40,
    width: 16, height: 16,
    backgroundColor: '#fff',
    borderLeftWidth: 2, borderTopWidth: 2, borderColor: '#e8ecf5',
    transform: [{ rotate: '45deg' }],
  },
  bubbleText: {
    fontFamily: Font.body, fontSize: 15, color: '#3a4365',
    lineHeight: 22,
  },

  diagram: {
    width: '100%', height: 140, borderRadius: 16,
    borderWidth: 2, borderColor: '#cbd3e2', borderStyle: 'dashed',
    backgroundColor: '#f2f5fb',
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
    overflow: 'hidden',
  },
  diagramLabel: { fontFamily: 'monospace', fontSize: 12, color: '#9aa3b8', letterSpacing: 0.5 },

  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 11 },
  chipText: { fontFamily: Font.display, fontSize: 13 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 22, paddingBottom: 28, paddingTop: 14,
    borderTopWidth: 2, borderTopColor: '#eef1f8', backgroundColor: '#fff',
  },
  startBtn: {
    backgroundColor: Colors.green, borderRadius: 16, padding: 16, alignItems: 'center',
  },
  startBtnText: { fontFamily: Font.display, fontSize: 17, color: '#fff', letterSpacing: 0.4 },
});
