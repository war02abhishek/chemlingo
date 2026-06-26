import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { fetchInsights, WeakLesson } from '../../core/teacherApi';
import { Colors, Font, Radius } from '../../core/theme';

function WeakCard({ w }: { w: WeakLesson }) {
  const pct = Math.round(w.avg_score);
  const barColor = pct < 40 ? Colors.red : pct < 60 ? Colors.orange : Colors.amber;
  const severity = pct < 40 ? 'High' : 'Med';
  const severityBg = pct < 40 ? Colors.red + '20' : Colors.orange + '20';
  const severityColor = pct < 40 ? Colors.red : Colors.orange;
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Text style={s.lessonTitle}>{w.lesson_title}</Text>
            <View style={[s.severityBadge, { backgroundColor: severityBg }]}>
              <Text style={[s.severityText, { color: severityColor }]}>{severity}</Text>
            </View>
          </View>
          <Text style={s.topicTitle}>{w.topic_title}</Text>
        </View>
        <View style={[s.scoreBadge, { backgroundColor: barColor + '20' }]}>
          <Text style={[s.scoreVal, { color: barColor }]}>{pct}%</Text>
        </View>
      </View>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={s.struggling}>
        ⚠️ {w.struggling_count} student{w.struggling_count !== 1 ? 's' : ''} scored below 60%
      </Text>
    </View>
  );
}

export default function InsightsScreen() {
  const [data, setData] = useState<WeakLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchInsights();
      setData(rows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Insights</Text>
        <Text style={s.headerSub}>Lessons where students are struggling</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.blue} />
        }
      >
        {data.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🎉</Text>
            <Text style={s.emptyTitle}>No weak spots detected</Text>
            <Text style={s.emptySub}>All lessons have an average score above 70%. Keep it up!</Text>
          </View>
        ) : (
          data.map((w, i) => <WeakCard key={i} w={w} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: Font.display, fontSize: 24, color: Colors.ink },
  headerSub: { fontFamily: Font.body, fontSize: 13, color: Colors.muted, marginTop: 2 },
  scroll: { padding: 20, gap: 12 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 16, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lessonTitle: { fontFamily: Font.display, fontSize: 15, color: Colors.ink },
  severityBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  severityText: { fontFamily: Font.display, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  topicTitle: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 2 },
  scoreBadge: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  scoreVal: { fontFamily: Font.display, fontSize: 16 },
  barBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  struggling: { fontFamily: Font.body, fontSize: 12, color: Colors.orange },

  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  emptySub: { fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 22 },
});
