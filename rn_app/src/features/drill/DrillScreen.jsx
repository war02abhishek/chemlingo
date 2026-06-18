import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import useDrillStore from '../../core/store/drillStore';
import ReactionMatcher from './widgets/ReactionMatcher';
import TrendSlider from './widgets/TrendSlider';
import ColorPrecipitateId from './widgets/ColorPrecipitateId';
import ExceptionBossFight from './widgets/ExceptionBossFight';

const DRILL_WIDGETS = {
  reaction_matcher: ReactionMatcher,
  trend_slider: TrendSlider,
  color_precipitate_id: ColorPrecipitateId,
  exception_boss_fight: ExceptionBossFight,
};

export default function DrillScreen() {
  const { drills, currentIndex, isLoading, error, loadDrills, currentDrill, isDone } = useDrillStore();

  useEffect(() => { loadDrills(); }, []);

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#6366F1" /></View>;
  if (error) return <View style={s.center}><Text style={s.error}>{error}</Text></View>;
  if (isDone()) return <View style={s.center}><Text style={s.done}>Session complete! 🎉</Text></View>;

  const drill = currentDrill();
  const DrillWidget = DRILL_WIDGETS[drill?.type];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.counter}>{currentIndex + 1} / {drills.length}</Text>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${(currentIndex / drills.length) * 100}%` }]} />
        </View>
      </View>
      {DrillWidget
        ? <DrillWidget drill={drill} />
        : <View style={s.center}><Text>Unknown drill type: {drill?.type}</Text></View>
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { color: 'red' },
  done: { fontSize: 22, fontWeight: 'bold' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  counter: { fontWeight: '600', color: '#555' },
  progressTrack: {
    flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 4 },
});
