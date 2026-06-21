import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type LeaderboardEntry,
  type LeaderboardResponse,
  fetchLeaderboard,
  getTier,
} from '../../core/profileApi';

// ── helpers ────────────────────────────────────────────────────────────────────

function winPct(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return '—';
  return `${Math.round((wins / total) * 100)}%`;
}

function formatLastUpdated(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

// ── Podium ────────────────────────────────────────────────────────────────────

interface PodiumCardProps {
  entry: LeaderboardEntry;
  isMe: boolean;
  platformHeight: number;
  onPress: () => void;
}

function PodiumCard({ entry, isMe, platformHeight, onPress }: PodiumCardProps) {
  const tier  = getTier(entry.rating);
  const scale = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(30)).current;
  const cardOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = entry.position === 1 ? 100 : entry.position === 2 ? 200 : 300;
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scale,  { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(cardOp, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(cardY,  { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const medal = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : '🥉';
  const platformColor = entry.position === 1 ? '#F59E0B' : entry.position === 2 ? '#9CA3AF' : '#CD7F32';
  const isCenter = entry.position === 1;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={pod.wrap}>
      <Animated.View
        style={[
          pod.card,
          isMe && pod.cardMe,
          isCenter && pod.cardCenter,
          { transform: [{ scale }, { translateY: cardY }], opacity: cardOp },
        ]}
      >
        <Text style={pod.medal}>{medal}</Text>
        <Text style={[pod.badge, { color: tier.color }]}>{tier.emoji}</Text>
        <Text style={[pod.name, isCenter && pod.nameCenter]} numberOfLines={1}>
          {entry.name}{isMe ? ' (You)' : ''}
        </Text>
        <Text style={[pod.rating, { color: tier.color }]}>{entry.rating}</Text>
        <Text style={pod.pct}>{winPct(entry.wins, entry.losses)}</Text>
      </Animated.View>

      {/* Platform */}
      <View style={[pod.platform, { height: platformHeight, backgroundColor: platformColor + '33', borderTopColor: platformColor }]}>
        <Text style={[pod.pos, { color: platformColor }]}>#{entry.position}</Text>
      </View>
    </TouchableOpacity>
  );
}

const pod = StyleSheet.create({
  wrap:        { alignItems: 'center', flex: 1 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
    width: '100%',
    marginBottom: 0,
  },
  cardCenter: {
    borderColor: '#F59E0B66',
    backgroundColor: '#1C2A1A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  cardMe: { borderColor: '#6366F166', backgroundColor: '#1E1E3A' },
  medal:   { fontSize: 26 },
  badge:   { fontSize: 18 },
  name:    { fontSize: 11, fontWeight: '700', color: '#CBD5E1', textAlign: 'center' },
  nameCenter: { fontSize: 12, color: '#F8FAFC' },
  rating:  { fontSize: 13, fontWeight: '800' },
  pct:     { fontSize: 10, color: '#64748B', fontWeight: '600' },
  platform: {
    width: '100%',
    borderTopWidth: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pos: { fontSize: 13, fontWeight: '900' },
});

// ── Row (rank 4+) ─────────────────────────────────────────────────────────────

interface RowProps {
  entry: LeaderboardEntry;
  isMe: boolean;
  index: number;
  onPress: () => void;
}

function LeaderboardRow({ entry, isMe, index, onPress }: RowProps) {
  const tier = getTier(entry.rating);
  const slideX = useRef(new Animated.Value(40)).current;
  const op     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 300, delay: index * 40, useNativeDriver: true }),
      Animated.timing(op,     { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Animated.View
        style={[
          row.wrap,
          isMe && row.wrapMe,
          { transform: [{ translateX: slideX }], opacity: op },
        ]}
      >
        <Text style={[row.pos, isMe && { color: '#6366F1' }]}>#{entry.position}</Text>

        <View style={[row.badge, { backgroundColor: tier.glowColor }]}>
          <Text style={row.badgeEmoji}>{tier.emoji}</Text>
        </View>

        <View style={row.mid}>
          <Text style={[row.name, isMe && { color: '#818CF8' }]} numberOfLines={1}>
            {entry.name}{isMe ? ' (You)' : ''}
          </Text>
          <Text style={[row.tier, { color: tier.color }]}>{tier.name}</Text>
        </View>

        <View style={row.right}>
          <Text style={[row.rating, { color: tier.color }]}>{entry.rating}</Text>
          <Text style={row.pct}>{winPct(entry.wins, entry.losses)}</Text>
        </View>

        <Text style={row.chevron}>›</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
    gap: 12,
    backgroundColor: '#0F172A',
  },
  wrapMe: { backgroundColor: '#1E1E3A' },
  pos:    { width: 32, fontSize: 12, fontWeight: '800', color: '#475569', textAlign: 'right' },
  badge:  { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  badgeEmoji: { fontSize: 18 },
  mid:    { flex: 1, gap: 1 },
  name:   { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  tier:   { fontSize: 11, fontWeight: '600' },
  right:  { alignItems: 'flex-end', gap: 1 },
  rating: { fontSize: 14, fontWeight: '800' },
  pct:    { fontSize: 11, color: '#64748B', fontWeight: '600' },
  chevron: { fontSize: 20, color: '#334155', marginLeft: -4 },
});

// ── Sticky "Your Rank" row ────────────────────────────────────────────────────

function StickyMyRank({ entry, total, onPress }: { entry: LeaderboardEntry; total: number; onPress: () => void }) {
  const tier = getTier(entry.rating);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={my.outer}>
      <View style={my.bar}>
        <Text style={my.label}>Your Rank</Text>
        <View style={my.inner}>
          <Text style={my.pos}>#{entry.position}</Text>
          <View style={[my.badge, { backgroundColor: tier.glowColor }]}>
            <Text style={{ fontSize: 16 }}>{tier.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={my.name} numberOfLines={1}>{entry.name}</Text>
            <Text style={[my.tier, { color: tier.color }]}>{tier.name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[my.rating, { color: tier.color }]}>{entry.rating}</Text>
            <Text style={my.pct}>{winPct(entry.wins, entry.losses)}</Text>
          </View>
          <Text style={my.total}>/ {total}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const my = StyleSheet.create({
  outer: {
    paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4,
    backgroundColor: '#0F172A',
    borderTopWidth: 1, borderTopColor: '#6366F133',
  },
  bar: {
    backgroundColor: '#1E1E3A',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#6366F160',
    padding: 12,
    gap: 6,
  },
  label: { fontSize: 10, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 1 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pos:   { fontSize: 14, fontWeight: '900', color: '#818CF8', width: 36, textAlign: 'center' },
  badge: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  name:  { fontSize: 14, fontWeight: '700', color: '#CBD5E1' },
  tier:  { fontSize: 11, fontWeight: '600' },
  rating:{ fontSize: 15, fontWeight: '800' },
  pct:   { fontSize: 11, color: '#64748B', fontWeight: '600' },
  total: { fontSize: 11, color: '#475569', fontWeight: '600' },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LeaderboardScreen({ navigation }: { navigation: any }) {
  const [data, setData]           = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, forceUpdate]           = useState(0); // for relative-time re-render
  const headerOp = useRef(new Animated.Value(0)).current;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchLeaderboard();
      setData(res);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      if (!silent) setError('Could not load leaderboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    Animated.timing(headerOp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    // Auto-refresh every 30 seconds
    const tick = setInterval(() => {
      load(true);
      forceUpdate((n) => n + 1);
    }, 30_000);
    // Re-render the "X sec ago" text every 10s without re-fetching
    const clockTick = setInterval(() => forceUpdate((n) => n + 1), 10_000);
    return () => { clearInterval(tick); clearInterval(clockTick); };
  }, []);

  const navigateToPlayer = (entry: LeaderboardEntry) => {
    if (entry.player_id === data?.my_player_id) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('Profile', { playerId: entry.player_id });
    }
  };

  const isInTop = data ? data.entries.some((e) => e.player_id === data.my_player_id) : false;
  const top3    = data?.entries.slice(0, 3) ?? [];
  const rest    = data?.entries.slice(3)    ?? [];

  // Podium reorder: [rank2, rank1, rank3] (center = tallest)
  const podiumOrder = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
    ? [top3[1], top3[0]]
    : top3;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <Animated.View style={[s.header, { opacity: headerOp }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Leaderboard</Text>
        <View style={s.headerRight}>
          <View style={s.globalChip}>
            <Text style={s.globalChipText}>Global</Text>
          </View>
        </View>
      </Animated.View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor="#6366F1"
              />
            }
          >
            {/* Crown banner */}
            <View style={s.banner}>
              <Text style={s.bannerIcon}>🏆</Text>
              <Text style={s.bannerTitle}>Global Rankings</Text>
              <Text style={s.bannerSub}>
                {data?.total_players ?? 0} players competing
              </Text>
            </View>

            {/* Podium */}
            {top3.length > 0 && (
              <View style={s.podiumWrap}>
                {podiumOrder.map((entry) => {
                  const isMe = entry.player_id === data?.my_player_id;
                  const platformH = entry.position === 1 ? 72 : entry.position === 2 ? 52 : 36;
                  return (
                    <PodiumCard
                      key={entry.player_id}
                      entry={entry}
                      isMe={isMe}
                      platformHeight={platformH}
                      onPress={() => navigateToPlayer(entry)}
                    />
                  );
                })}
              </View>
            )}

            {/* Divider */}
            {rest.length > 0 && (
              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerLabel}>Rankings</Text>
                <View style={s.dividerLine} />
              </View>
            )}

            {/* Rows 4+ */}
            {rest.map((entry, idx) => (
              <LeaderboardRow
                key={entry.player_id}
                entry={entry}
                isMe={entry.player_id === data?.my_player_id}
                index={idx}
                onPress={() => navigateToPlayer(entry)}
              />
            ))}

            {/* Footer */}
            <View style={s.footer}>
              {lastUpdated && (
                <Text style={s.footerText}>
                  Updated {formatLastUpdated(lastUpdated)} · auto-refreshes every 30s
                </Text>
              )}
              <View style={{ height: 16 }} />
            </View>
          </ScrollView>

          {/* Sticky "your rank" row — shown when user is outside top 50 */}
          {!isInTop && data?.my_entry && (
            <StickyMyRank
              entry={data.my_entry}
              total={data.total_players}
              onPress={() => navigation.navigate('Profile')}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn:     { paddingHorizontal: 4, minWidth: 60 },
  backText:    { fontSize: 15, color: '#6366F1', fontWeight: '600' },
  title:       { fontSize: 17, fontWeight: '700', color: '#F8FAFC' },
  headerRight: { minWidth: 60, alignItems: 'flex-end' },
  globalChip: {
    backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  globalChipText: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },

  banner: {
    alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, gap: 4,
  },
  bannerIcon:  { fontSize: 40 },
  bannerTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.5 },
  bannerSub:   { fontSize: 12, color: '#64748B', fontWeight: '600' },

  podiumWrap: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, gap: 8, marginBottom: 8,
  },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  dividerLine:  { flex: 1, height: 1, backgroundColor: '#1E293B' },
  dividerLabel: { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 1 },

  footer:     { paddingVertical: 16, alignItems: 'center' },
  footerText: { fontSize: 11, color: '#334155', fontWeight: '500' },

  errorText: { color: '#EF4444', fontSize: 15, textAlign: 'center' },
  retryBtn:  { backgroundColor: '#1E293B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#6366F1', fontWeight: '700' },
});
