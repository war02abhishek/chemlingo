import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { fetchStudentDetail, StudentDetail, TopicProgress } from '../../core/teacherApi';
import { Colors, Font, Radius } from '../../core/theme';
import { xpToLevel } from '../../core/theme';

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${Math.round(pct * 100)}%` as any }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 6, backgroundColor: Colors.border, borderRadius: 99, overflow: 'hidden' },
  fill:  { height: 6, backgroundColor: Colors.blue, borderRadius: 99 },
});

function TopicCard({ t }: { t: TopicProgress }) {
  const pct = t.total_lessons > 0 ? Math.round((t.lessons_completed / t.total_lessons) * 100) : 0;
  return (
    <View style={tc.wrap}>
      <View style={tc.header}>
        <Text style={tc.title}>{t.topic_title}</Text>
        {t.boss_defeated && <Text style={tc.badge}>Boss ✓</Text>}
      </View>
      <View style={tc.meta}>
        <Text style={tc.sub}>{t.lessons_completed}/{t.total_lessons} lessons</Text>
        <Text style={tc.pct}>{pct}%</Text>
      </View>
      <ProgressBar value={t.lessons_completed} total={t.total_lessons} />
    </View>
  );
}

const tc = StyleSheet.create({
  wrap:   { backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 14, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title:  { fontFamily: Font.display, fontSize: 14, color: Colors.ink, flex: 1 },
  badge:  { backgroundColor: Colors.green + '20', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  meta:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sub:    { fontFamily: Font.body, fontSize: 12, color: Colors.muted },
  pct:    { fontFamily: Font.body, fontSize: 12, color: Colors.blue },
});

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={sc.wrap}>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  wrap:  { width: '30%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 12, alignItems: 'center' },
  value: { fontFamily: Font.display, fontSize: 17, color: Colors.ink, marginBottom: 2 },
  label: { fontFamily: Font.body, fontSize: 11, color: Colors.muted },
});

function formatDate(iso: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function StudentDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { studentId, name } = route.params as { studentId: string; name: string };

  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchStudentDetail(studentId);
      setDetail(d);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.blue} /></View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={s.safe}>
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.errorText}>Couldn't load student data.</Text>
          <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); load(); }}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const level = xpToLevel(detail.total_xp);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.blue} />}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{detail.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}</Text>
          </View>
          <Text style={s.heroName}>{detail.full_name}</Text>
          <Text style={s.heroEmail}>{detail.email}</Text>
          <Text style={s.heroSub}>Last active: {formatDate(detail.last_active)}</Text>
        </View>

        {/* 6-stat grid */}
        <View style={s.statsGrid}>
          <StatChip label="Level" value={level} />
          <StatChip label="XP" value={detail.total_xp} />
          <StatChip label="Streak" value={`${detail.current_streak}🔥`} />
          <StatChip label="Lessons" value={detail.lessons_total} />
          <StatChip label="Accuracy" value={detail.accuracy_pct > 0 ? `${Math.round(detail.accuracy_pct)}%` : '—'} />
          <StatChip label="Rating" value={detail.rating} />
        </View>

        {/* Weak areas */}
        {(() => {
          const weak = detail.topics.filter((t) => t.lessons_completed > 0 && !t.boss_defeated);
          if (weak.length === 0) return null;
          return (
            <>
              <Text style={s.sectionTitle}>Weak Areas</Text>
              <View style={s.weakChips}>
                {weak.map((t, i) => (
                  <View key={i} style={s.weakChip}>
                    <Text style={s.weakChipText}>{t.topic_title}</Text>
                  </View>
                ))}
              </View>
            </>
          );
        })()}

        {/* Send Nudge */}
        <TouchableOpacity
          style={s.nudgeBtn}
          onPress={() => Alert.alert('Nudge Sent', `A reminder will be sent to ${detail.full_name}.\n\n(Push notifications coming in the next update.)`)}
          activeOpacity={0.8}
        >
          <Text style={s.nudgeBtnText}>📣 Send a Nudge</Text>
        </TouchableOpacity>

        {/* Topic progress */}
        <Text style={s.sectionTitle}>Topic Progress</Text>
        {detail.topics.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>No topic progress yet.</Text>
          </View>
        ) : (
          detail.topics.map((t, i) => <TopicCard key={i} t={t} />)
        )}

        {/* Recent lessons */}
        <Text style={s.sectionTitle}>Recent Lessons</Text>
        {detail.recent_lessons.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>No lessons completed yet.</Text>
          </View>
        ) : (
          detail.recent_lessons.map((r, i) => (
            <View key={i} style={s.lessonRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.lessonTitle}>{r.lesson_title}</Text>
                <Text style={s.lessonTopic}>{r.topic_title} · {formatDate(r.completed_at)}</Text>
              </View>
              <View style={[s.scoreBadge, { backgroundColor: r.score > 0 ? Colors.green + '20' : Colors.red + '15' }]}>
                <Text style={[s.scoreText, { color: r.score > 0 ? Colors.green : Colors.muted }]}>{r.score} pts</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.bg },
  topBar:      { paddingHorizontal: 16, paddingVertical: 12 },
  backText:    { fontFamily: Font.body, fontSize: 14, color: Colors.blue },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:   { fontFamily: Font.body, fontSize: 14, color: Colors.muted, marginBottom: 12 },
  retry:       { backgroundColor: Colors.blue, borderRadius: Radius.button, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:   { fontFamily: Font.display, fontSize: 13, color: '#fff' },
  content:     { paddingHorizontal: 16, paddingBottom: 40 },
  hero:        { alignItems: 'center', paddingVertical: 20 },
  avatar:      { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.blue + '25', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  avatarText:  { fontFamily: Font.display, fontSize: 22, color: Colors.blue },
  heroName:    { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  heroEmail:   { fontFamily: Font.body, fontSize: 13, color: Colors.muted, marginTop: 2 },
  heroSub:     { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 4 },
  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  sectionTitle:{ fontFamily: Font.display, fontSize: 15, color: Colors.ink, marginBottom: 10, marginTop: 4 },
  emptyCard:   { backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 20, alignItems: 'center', marginBottom: 10 },
  emptyText:   { fontFamily: Font.body, fontSize: 13, color: Colors.muted },
  weakChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  weakChip:    { backgroundColor: Colors.red + '15', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  weakChipText:{ fontFamily: Font.body, fontSize: 12, color: Colors.red },
  nudgeBtn:    { backgroundColor: Colors.blue + '12', borderRadius: Radius.card, padding: 14, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: Colors.blue + '30' },
  nudgeBtnText:{ fontFamily: Font.display, fontSize: 14, color: Colors.blue },
  lessonRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 12, marginBottom: 8 },
  lessonTitle: { fontFamily: Font.body, fontSize: 14, color: Colors.ink },
  lessonTopic: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 2 },
  scoreBadge:  { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  scoreText:   { fontFamily: Font.display, fontSize: 13 },
});
