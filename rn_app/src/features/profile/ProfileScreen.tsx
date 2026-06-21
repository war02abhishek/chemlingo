import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type DuelResultEntry,
  type Profile,
  fetchHistory,
  fetchProfile,
  fetchPublicProfile,
  getTier,
  getRankProgress,
} from '../../core/profileApi';
import RankProgressBar from '../rank/RankProgressBar';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Rank card ─────────────────────────────────────────────────────────────────

function RankCard({ rating }: { rating: number }) {
  const tier = getTier(rating);
  const { nextTier, ptsToNext } = getRankProgress(rating);

  const pulse  = useRef(new Animated.Value(1)).current;
  const glow   = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1,   duration: 1200, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.4, duration: 1200, useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });

  return (
    <View style={[rc.card, { borderColor: tier.color + '60' }]}>
      {/* Background glow */}
      <Animated.View
        style={[
          rc.bgGlow,
          { backgroundColor: tier.glowColor, opacity: glowOp },
        ]}
      />

      {/* Badge + info side-by-side */}
      <View style={rc.row}>
        <Animated.View
          style={[
            rc.badge,
            {
              borderColor: tier.color,
              backgroundColor: tier.glowColor,
              shadowColor: tier.color,
              transform: [{ scale: pulse }],
            },
          ]}
        >
          <Text style={rc.badgeEmoji}>{tier.emoji}</Text>
        </Animated.View>

        <View style={rc.info}>
          <Text style={[rc.rankName, { color: tier.color }]}>{tier.name}</Text>
          <Text style={rc.rankTitle}>{tier.title}</Text>
          <View style={rc.ratingPill}>
            <Text style={rc.ratingLabel}>Rating</Text>
            <Text style={[rc.ratingValue, { color: tier.color }]}>{rating}</Text>
          </View>
        </View>
      </View>

      {/* Progress bar */}
      <View style={rc.barWrap}>
        <RankProgressBar rating={rating} />
      </View>

      {nextTier && (
        <View style={[rc.nextBanner, { borderColor: nextTier.color + '30' }]}>
          <Text style={rc.nextLabel}>Next rank: </Text>
          <Text style={rc.nextEmoji}>{nextTier.emoji}</Text>
          <Text style={[rc.nextName, { color: nextTier.color }]}>{nextTier.name}</Text>
          <Text style={rc.nextPts}> · {ptsToNext} pts away</Text>
        </View>
      )}
    </View>
  );
}

const rc = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#0D1B2E',
    padding: 20,
    gap: 16,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  bgGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  badge: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2.5,
    justifyContent: 'center', alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16, shadowOpacity: 1,
    elevation: 10,
  },
  badgeEmoji: { fontSize: 40 },

  info:       { flex: 1, gap: 4 },
  rankName:   { fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  rankTitle:  { fontSize: 13, color: '#64748B', fontWeight: '600' },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4,
    backgroundColor: '#1E293B', alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  ratingLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', textTransform: 'uppercase' },
  ratingValue: { fontSize: 16, fontWeight: '800' },

  barWrap: {},

  nextBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#1E293B',
  },
  nextLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  nextEmoji: { fontSize: 14 },
  nextName:  { fontSize: 12, fontWeight: '700' },
  nextPts:   { fontSize: 12, color: '#475569' },
});

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, color ? { color } : null]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { flex: 1, backgroundColor: '#1E293B', borderRadius: 14, alignItems: 'center', paddingVertical: 16, borderWidth: 1, borderColor: '#334155' },
  value: { fontSize: 26, fontWeight: '800', color: '#F8FAFC' },
  label: { fontSize: 11, color: '#64748B', marginTop: 4, fontWeight: '600', textTransform: 'uppercase' },
});

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ entry }: { entry: DuelResultEntry }) {
  const isWin     = entry.result === 'win';
  const isTie     = entry.result === 'tie';
  const deltaStr  = entry.rating_change >= 0 ? `+${entry.rating_change}` : `${entry.rating_change}`;
  const afterRating = entry.player_rating_before + entry.rating_change;
  const afterTier = getTier(afterRating);
  const beforeTier = getTier(entry.player_rating_before);
  const promoted  = afterTier.name !== beforeTier.name && getTier(afterRating).min > getTier(entry.player_rating_before).min;

  const deltaColor  = isWin ? '#22C55E' : isTie ? '#F59E0B' : '#EF4444';
  const resultLabel = isWin ? 'W' : isTie ? 'D' : 'L';
  const resultBg    = isWin ? '#14532D' : isTie ? '#451A03' : '#450A0A';
  const resultColor = isWin ? '#4ADE80' : isTie ? '#FCD34D' : '#F87171';

  return (
    <View style={hr.row}>
      <View style={[hr.badge, { backgroundColor: resultBg }]}>
        <Text style={[hr.badgeText, { color: resultColor }]}>{resultLabel}</Text>
      </View>

      <View style={hr.mid}>
        <Text style={hr.opp} numberOfLines={1}>vs {entry.opponent_name}</Text>
        <View style={hr.metaRow}>
          <Text style={hr.sub}>{entry.opponent_rating_before} pts · {fmtDate(entry.played_at)}</Text>
          {promoted && (
            <View style={[hr.promotedPill, { borderColor: afterTier.color + '60' }]}>
              <Text style={[hr.promotedText, { color: afterTier.color }]}>
                ↑ {afterTier.name}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={hr.right}>
        <Text style={[hr.delta, { color: deltaColor }]}>{deltaStr}</Text>
        <Text style={hr.after}>
          {afterTier.emoji} {afterRating}
        </Text>
      </View>
    </View>
  );
}
const hr = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  badge:  { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 14, fontWeight: '800' },
  mid:    { flex: 1, gap: 3 },
  opp:    { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  metaRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sub:    { fontSize: 11, color: '#475569' },
  promotedPill: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  promotedText: { fontSize: 10, fontWeight: '800' },
  right:  { alignItems: 'flex-end', gap: 2 },
  delta:  { fontSize: 16, fontWeight: '800' },
  after:  { fontSize: 11, color: '#475569' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen({ navigation, route }: { navigation: any; route: any }) {
  const viewingPlayerId = route?.params?.playerId as string | undefined;
  const isSelf = !viewingPlayerId;

  const [profile, setProfile]   = useState<Profile | null>(null);
  const [history, setHistory]   = useState<DuelResultEntry[]>([]);
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (isSelf) {
      Promise.all([fetchProfile(), fetchHistory()])
        .then(([p, h]) => { setProfile(p); setHistory(h); })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    } else {
      fetchPublicProfile(viewingPlayerId!)
        .then(({ profile: p, history: h, global_rank }) => {
          setProfile(p);
          setHistory(h);
          setGlobalRank(global_rank);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [viewingPlayerId]);

  const winRate = profile && (profile.wins + profile.losses) > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
    : 0;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isSelf ? 'Profile' : (profile?.name ?? 'Player')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#6366F1" /></View>
      ) : error ? (
        <View style={s.center}><Text style={s.errorText}>{error}</Text></View>
      ) : profile ? (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Identity */}
          <View style={s.identityRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{profile.name}</Text>
              {isSelf && <Text style={s.email}>{profile.email}</Text>}
            </View>
            {globalRank !== null && (
              <View style={s.globalRankBadge}>
                <Text style={s.globalRankLabel}>Global</Text>
                <Text style={s.globalRankNum}>#{globalRank}</Text>
              </View>
            )}
          </View>

          {/* Rank card with progress bar */}
          <RankCard rating={profile.rating} />

          {/* Stats */}
          <View style={s.statsRow}>
            <StatCard label="Wins"     value={profile.wins}    color="#22C55E" />
            <StatCard label="Losses"   value={profile.losses}  color="#EF4444" />
            <StatCard label="Win Rate" value={`${winRate}%`}   color="#6366F1" />
          </View>

          {/* Match history */}
          <Text style={s.sectionTitle}>Recent Matches</Text>
          <View style={s.historyCard}>
            {history.length === 0 ? (
              <Text style={s.empty}>No matches played yet.</Text>
            ) : (
              history.map((entry) => (
                <HistoryRow key={entry.match_id + entry.played_at} entry={entry} />
              ))
            )}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn:     { paddingHorizontal: 4 },
  backText:    { fontSize: 15, color: '#6366F1', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#F8FAFC' },

  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },

  identityRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12 },
  name:  { fontSize: 24, fontWeight: '800', color: '#F8FAFC', marginBottom: 2 },
  email: { fontSize: 13, color: '#475569' },
  globalRankBadge: {
    backgroundColor: '#1E293B', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#6366F160',
    paddingHorizontal: 12, paddingVertical: 6,
    alignItems: 'center', gap: 1,
  },
  globalRankLabel: { fontSize: 9, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 1 },
  globalRankNum:   { fontSize: 18, fontWeight: '900', color: '#818CF8' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  historyCard:  { backgroundColor: '#0F172A', paddingHorizontal: 4 },
  empty:        { textAlign: 'center', color: '#475569', paddingVertical: 24, fontSize: 14 },
  errorText:    { color: '#EF4444', fontSize: 15 },
});
