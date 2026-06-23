import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { fetchDailyChallenge } from '../../core/profileApi';
import { fetchSprint } from '../../core/sprintApi';
import { fetchCompoundDaily } from '../../core/compoundApi';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';

const GAMES = [
  {
    title: 'Reaction Duel',
    subtitle: '1v1 real-time equation battle',
    icon: '⚔️',
    color: Colors.duel,
    colorDark: '#4338CA',
    route: 'Duel',
  },
  {
    title: 'Periodic Sprint',
    subtitle: '10 MCQs against the clock',
    icon: '⚡',
    color: Colors.sprint,
    colorDark: '#0F766E',
    route: 'PeriodicSprint',
  },
  {
    title: 'Compound Builder',
    subtitle: 'Balance ionic charges & build formulas',
    icon: '🔬',
    color: Colors.compound,
    colorDark: '#6D3FCF',
    route: 'CompoundBuilder',
  },
  {
    title: 'Daily Challenge',
    subtitle: 'Balance 5 equations every day',
    icon: '📅',
    color: Colors.daily,
    colorDark: '#B45309',
    route: 'DailyChallenge',
  },
];

export default function CompeteHomeScreen({ navigation }: any) {
  const [dailyDone, setDailyDone] = useState(false);
  const [sprintDone, setSprintDone] = useState(false);
  const [compoundDone, setCompoundDone] = useState(false);

  useEffect(() => {
    fetchDailyChallenge().then((d) => setDailyDone(!!d.my_submission)).catch(() => {});
    fetchSprint().then((d) => setSprintDone(!!d.my_submission)).catch(() => {});
    fetchCompoundDaily().then((d) => setCompoundDone(!!d.my_submission)).catch(() => {});
  }, []);

  const doneMap: Record<string, boolean> = {
    DailyChallenge: dailyDone,
    PeriodicSprint: sprintDone,
    CompoundBuilder: compoundDone,
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Compete</Text>
          <Text style={s.headerSub}>Challenge yourself and others</Text>
        </View>

        {/* Game cards */}
        {GAMES.map((g) => {
          const done = doneMap[g.route];
          return (
            <TouchableOpacity
              key={g.route}
              style={[s.card, Shadow3D(g.colorDark), { borderTopColor: g.color }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate(g.route)}
            >
              <View style={[s.iconBox, { backgroundColor: g.color + '22' }]}>
                <Text style={s.icon}>{g.icon}</Text>
              </View>
              <View style={s.cardText}>
                <Text style={[s.cardTitle, { color: Colors.ink }]}>{g.title}</Text>
                <Text style={s.cardSub}>{g.subtitle}</Text>
              </View>
              {done && (
                <View style={[s.doneBadge, { backgroundColor: Colors.green + '22' }]}>
                  <Text style={[s.doneBadgeText, { color: Colors.green }]}>✓ Done</Text>
                </View>
              )}
              {!done && (
                <Text style={[s.chevron, { color: g.color }]}>›</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Leaderboard */}
        <TouchableOpacity
          style={[s.lbBanner, Shadow3D('#1a55d4')]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Leaderboard')}
        >
          <Text style={s.lbIcon}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.lbTitle}>Global Leaderboard</Text>
            <Text style={s.lbSub}>See where you rank worldwide</Text>
          </View>
          <Text style={[s.chevron, { color: '#fff' }]}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  header: { paddingTop: 24, paddingBottom: 20 },
  headerTitle: {
    fontFamily: Font.display,
    fontSize: 28,
    color: Colors.ink,
  },
  headerSub: {
    fontFamily: Font.body,
    fontSize: 14,
    color: Colors.muted,
    marginTop: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderTopWidth: 3,
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 24 },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: Font.display,
    fontSize: 16,
    color: Colors.ink,
  },
  cardSub: {
    fontFamily: Font.body,
    fontSize: 12,
    color: Colors.muted,
    marginTop: 2,
  },
  doneBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  doneBadgeText: { fontFamily: Font.body, fontSize: 12 },
  chevron: { fontSize: 28, fontWeight: '300' },
  lbBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.blue,
    borderRadius: Radius.card,
    padding: 16,
    marginTop: 8,
    gap: 14,
  },
  lbIcon: { fontSize: 28 },
  lbTitle: { fontFamily: Font.display, fontSize: 16, color: '#fff' },
  lbSub: { fontFamily: Font.body, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
