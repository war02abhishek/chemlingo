import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, SafeAreaView } from 'react-native';
import { getLeaderboard } from '../../core/api';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getLeaderboard()
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6366F1" /></View>;
  if (error) return <View style={s.center}><Text style={{ color: 'red' }}>{error}</Text></View>;

  return (
    <SafeAreaView style={s.safe}>
      <Text style={s.title}>Leaderboard 🏆</Text>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.rank)}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Text style={s.medal}>{MEDALS[item.rank] ?? ''}</Text>
            {!MEDALS[item.rank] && (
              <View style={s.badge}><Text style={s.badgeText}>{item.rank}</Text></View>
            )}
            <Text style={s.name}>{item.student_id}</Text>
            <Text style={s.xp}>{item.xp} XP</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', padding: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  medal: { fontSize: 24, width: 36 },
  badge: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb',
    justifyContent: 'center', alignItems: 'center', marginRight: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  name: { flex: 1, marginLeft: 8 },
  xp: { fontWeight: 'bold' },
});
