import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { fetchTeacherOverview, TeacherOverview } from '../../core/teacherApi';
import { Colors, Font, Radius } from '../../core/theme';

function KPICard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <View style={[s.kpiCard, { borderTopColor: color }]}>
      <Text style={s.kpiIcon}>{icon}</Text>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MOCK_BARS = [40, 60, 35, 80, 55, 20, 10];

export default function OverviewScreen() {
  const [data, setData] = useState<TeacherOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const ov = await fetchTeacherOverview();
      setData(ov);
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
        <Text style={s.headerTitle}>Overview</Text>
        <Text style={s.headerSub}>Your batch at a glance</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={Colors.blue}
          />
        }
      >
        <View style={s.kpiGrid}>
          <KPICard label="Active Students" value={data?.active_students ?? 0} icon="👨‍🎓" color={Colors.blue} />
          <KPICard label="Avg Streak" value={`${(data?.avg_streak ?? 0).toFixed(1)}d`} icon="🔥" color={Colors.orange} />
          <KPICard label="Lessons / Week" value={data?.lessons_this_week ?? 0} icon="📚" color={Colors.green} />
          <KPICard label="At Risk" value={data?.at_risk_count ?? 0} icon="⚠️" color={Colors.red} />
        </View>

        {(data?.at_risk_count ?? 0) > 0 && (
          <View style={s.alertBanner}>
            <Text style={s.alertIcon}>⚠️</Text>
            <Text style={s.alertText}>
              {data?.at_risk_count} student{(data?.at_risk_count ?? 0) > 1 ? 's have' : ' has'} been inactive for 3+ days.
            </Text>
          </View>
        )}

        <View style={s.chartCard}>
          <Text style={s.chartTitle}>📊 7-Day Engagement</Text>
          <Text style={s.chartSub}>Lesson completions across your batches</Text>
          <View style={s.barRow}>
            {DAY_LABELS.map((day, i) => (
              <View key={i} style={s.barWrap}>
                <View style={[s.bar, { height: MOCK_BARS[i], backgroundColor: Colors.blue + (MOCK_BARS[i] > 50 ? 'ff' : '80') }]} />
                <Text style={s.barLabel}>{day}</Text>
              </View>
            ))}
          </View>
        </View>
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
  scroll: { padding: 20, gap: 16 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: {
    flex: 1, minWidth: '44%', backgroundColor: Colors.surface,
    borderRadius: Radius.card, borderTopWidth: 4,
    padding: 16, alignItems: 'center', gap: 4,
  },
  kpiIcon: { fontSize: 22 },
  kpiVal: { fontFamily: Font.display, fontSize: 26 },
  kpiLabel: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, textAlign: 'center' },

  alertBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.red + '15', borderRadius: Radius.card,
    borderLeftWidth: 4, borderLeftColor: Colors.red, padding: 14,
  },
  alertIcon: { fontSize: 18 },
  alertText: { fontFamily: Font.body, fontSize: 13, color: Colors.red, flex: 1, lineHeight: 20 },

  chartCard: { backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 16 },
  chartTitle: { fontFamily: Font.display, fontSize: 15, color: Colors.ink, marginBottom: 4 },
  chartSub: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginBottom: 16 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 },
  barWrap: { alignItems: 'center', flex: 1, gap: 4 },
  bar: { width: 24, borderRadius: 4 },
  barLabel: { fontFamily: Font.body, fontSize: 11, color: Colors.muted },
});
