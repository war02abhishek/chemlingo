import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout } from '../../core/api';
import { fetchProfile, getTier, fetchDailyChallenge, type DailyChallengeSubmission } from '../../core/profileApi';
import { fetchSprint, type SprintSubmission } from '../../core/sprintApi';
import { fetchCompoundDaily, type CompoundSubmission } from '../../core/compoundApi';

// ── colour tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: '#0F172A',
  surface: '#1E293B',
  primary: '#6366F1',
  fire: '#F97316',
  text: '#F8FAFC',
  textSub: '#94A3B8',
  locked: '#334155',
  lockedText: '#64748B',
  border: '#334155',
};

// ── types ──────────────────────────────────────────────────────────────────────
interface Game {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  locked: boolean;
  route?: string;
}

const GAMES: Game[] = [
  {
    id: 'duel',
    icon: '⚔️',
    title: 'Reaction Duel',
    subtitle: 'Balance chemical equations against a real opponent',
    locked: false,
    route: 'Duel',
  },
  {
    id: 'periodic',
    icon: '🔬',
    title: 'Periodic Sprint',
    subtitle: 'Race through the periodic table',
    locked: false,
    route: 'PeriodicSprint',
  },
  {
    id: 'molecule',
    icon: '🧪',
    title: 'Compound Builder',
    subtitle: 'Build ionic formulas from component ions',
    locked: false,
    route: 'CompoundBuilder',
  },
];

// ── component ──────────────────────────────────────────────────────────────────
interface Props {
  navigation: any;
  onLogout: () => void;
}

export default function HomeScreen({ navigation, onLogout }: Props) {
  const [streak, setStreak]             = React.useState(0);
  const [rating, setRating]             = React.useState<number | null>(null);
  const [dcSub, setDcSub]               = React.useState<DailyChallengeSubmission | null>(null);
  const [dcLoaded, setDcLoaded]         = React.useState(false);
  const [sprintSub, setSprintSub]           = React.useState<SprintSubmission | null>(null);
  const [sprintLoaded, setSprintLoaded]     = React.useState(false);
  const [compoundSub, setCompoundSub]       = React.useState<CompoundSubmission | null>(null);
  const [compoundLoaded, setCompoundLoaded] = React.useState(false);
  const [secsToReset, setSecsToReset]   = React.useState(0);
  const [countdown, setCountdown]       = React.useState('');

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity   = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    AsyncStorage.getItem('streak_count').then((v) => setStreak(v ? parseInt(v) : 0));
    fetchProfile().then((p) => setRating(p.rating)).catch(() => {});
    fetchDailyChallenge().then((res) => {
      setDcSub(res.my_submission);
      setSecsToReset(res.secs_to_reset);
      setDcLoaded(true);
    }).catch(() => setDcLoaded(true));
    fetchSprint().then((res) => {
      setSprintSub(res.my_submission);
      setSprintLoaded(true);
    }).catch(() => setSprintLoaded(true));
    fetchCompoundDaily().then((res) => {
      setCompoundSub(res.my_submission);
      setCompoundLoaded(true);
    }).catch(() => setCompoundLoaded(true));

    Animated.timing(headerOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    Animated.parallel([
      Animated.timing(cardOpacity,   { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: 0, duration: 400, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // Countdown tick
  useEffect(() => {
    const tick = setInterval(() => {
      setSecsToReset((s) => {
        const next = Math.max(0, s - 1);
        const h = Math.floor(next / 3600);
        const m = Math.floor((next % 3600) / 60);
        const sec = next % 60;
        setCountdown(`${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`);
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── header — outside ScrollView, SafeAreaView provides top inset ── */}
      <Animated.View style={[s.header, { opacity: headerOpacity }]}>
        <View style={s.headerLeft}>
          <Text style={s.logo}>ChemLingo</Text>
          <Text style={s.greetingSub}>What will you learn today?</Text>
        </View>
        <View style={s.headerRight}>
          {rating !== null && (
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} activeOpacity={0.8}>
              <RatingChip rating={rating} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Leaderboard')} activeOpacity={0.8} style={s.trophyBtn}>
            <Text style={s.trophyIcon}>🏆</Text>
          </TouchableOpacity>
          <StreakBadge count={streak} />
          <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
            <Text style={s.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── game cards — only this part scrolls ── */}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Daily Challenge card — plain View so useNativeDriver animations don't break touches */}
        {dcLoaded && (
          <View style={{ marginBottom: 12 }}>
            <DailyChallengeCard
              submission={dcSub}
              countdown={countdown}
              onPress={() => navigation.navigate('DailyChallenge')}
            />
          </View>
        )}

        {/* Periodic Sprint card */}
        {sprintLoaded && (
          <View style={{ marginBottom: 12 }}>
            <SprintCard
              submission={sprintSub}
              countdown={countdown}
              onPress={() => navigation.navigate('PeriodicSprint')}
            />
          </View>
        )}

        {/* Compound Builder card */}
        {compoundLoaded && (
          <View style={{ marginBottom: 16 }}>
            <CompoundCard
              submission={compoundSub}
              countdown={countdown}
              onPress={() => navigation.navigate('CompoundBuilder')}
            />
          </View>
        )}

        <Animated.View
          style={[
            s.cardsWrap,
            { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
          ]}
        >

          {GAMES.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onPress={() => !game.locked && game.route && navigation.navigate(game.route)}
            />
          ))}

          <TouchableOpacity
            onPress={() => navigation.navigate('Leaderboard')}
            activeOpacity={0.85}
            style={s.leaderboardBanner}
          >
            <View style={s.leaderboardBannerLeft}>
              <Text style={s.leaderboardBannerIcon}>🏆</Text>
              <View>
                <Text style={s.leaderboardBannerTitle}>Global Leaderboard</Text>
                <Text style={s.leaderboardBannerSub}>See how you rank against all players</Text>
              </View>
            </View>
            <Text style={s.leaderboardBannerChevron}>›</Text>
          </TouchableOpacity>
        </Animated.View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function DailyChallengeCard({
  submission,
  countdown,
  onPress,
}: {
  submission: DailyChallengeSubmission | null;
  countdown: string;
  onPress: () => void;
}) {
  const done = submission !== null;
  const pct  = done && submission!.total_questions > 0
    ? Math.round((submission!.correct_answers / submission!.total_questions) * 100)
    : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.dcCard}>
      {/* top accent bar */}
      <View style={[s.dcAccent, { backgroundColor: done ? '#22C55E' : '#F59E0B' }]} />
      <View style={s.dcBody}>
        <View style={s.dcLeft}>
          <Text style={s.dcEmoji}>{done ? '✅' : '📅'}</Text>
        </View>
        <View style={s.dcMid}>
          <Text style={s.dcTitle}>Daily Challenge</Text>
          {done ? (
            <>
              <Text style={[s.dcStatus, { color: '#22C55E' }]}>Completed · {pct}% accuracy</Text>
              <Text style={s.dcScore}>{submission!.score} pts · +{submission!.rewards.xp} XP</Text>
            </>
          ) : (
            <>
              <Text style={[s.dcStatus, { color: '#F59E0B' }]}>Not started yet</Text>
              <Text style={s.dcScore}>Resets in {countdown}</Text>
            </>
          )}
        </View>
        <View style={s.dcRight}>
          <Text style={s.dcChevron}>›</Text>
        </View>
      </View>
      {!done && (
        <View style={s.dcFooter}>
          <Text style={s.dcFooterText}>⚗️  Balance 5 equations · Compete globally</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SprintCard({
  submission,
  countdown,
  onPress,
}: {
  submission: SprintSubmission | null;
  countdown: string;
  onPress: () => void;
}) {
  const done = submission !== null;
  const pct  = done && submission!.total_questions > 0
    ? Math.round((submission!.correct_answers / submission!.total_questions) * 100)
    : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.sprintCard}>
      <View style={[s.dcAccent, { backgroundColor: done ? '#14B8A6' : '#6366F1' }]} />
      <View style={s.dcBody}>
        <View style={s.dcLeft}>
          <Text style={s.dcEmoji}>{done ? '✅' : '⚡'}</Text>
        </View>
        <View style={s.dcMid}>
          <Text style={s.dcTitle}>Periodic Sprint</Text>
          {done ? (
            <>
              <Text style={[s.dcStatus, { color: '#14B8A6' }]}>Completed · {pct}% accuracy</Text>
              <Text style={s.dcScore}>{submission!.score} pts · +{submission!.rewards.xp} XP</Text>
            </>
          ) : (
            <>
              <Text style={[s.dcStatus, { color: '#6366F1' }]}>Not started yet</Text>
              <Text style={s.dcScore}>Resets in {countdown}</Text>
            </>
          )}
        </View>
        <View style={s.dcRight}>
          <Text style={[s.dcChevron, { color: done ? '#14B8A6' : '#6366F1' }]}>›</Text>
        </View>
      </View>
      {!done && (
        <View style={s.dcFooter}>
          <Text style={s.dcFooterText}>🔬  10 MCQ questions · Speed bonus scoring</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function CompoundCard({
  submission,
  countdown,
  onPress,
}: {
  submission: CompoundSubmission | null;
  countdown: string;
  onPress: () => void;
}) {
  const done = submission !== null;
  const pct  = done && submission!.total_questions > 0
    ? Math.round((submission!.correct_answers / submission!.total_questions) * 100)
    : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.compoundCard}>
      <View style={[s.dcAccent, { backgroundColor: done ? '#8B5CF6' : '#A78BFA' }]} />
      <View style={s.dcBody}>
        <View style={s.dcLeft}>
          <Text style={s.dcEmoji}>{done ? '✅' : '🧪'}</Text>
        </View>
        <View style={s.dcMid}>
          <Text style={s.dcTitle}>Compound Builder</Text>
          {done ? (
            <>
              <Text style={[s.dcStatus, { color: '#8B5CF6' }]}>Completed · {pct}% accuracy</Text>
              <Text style={s.dcScore}>{submission!.score} pts · +{submission!.rewards.xp} XP</Text>
            </>
          ) : (
            <>
              <Text style={[s.dcStatus, { color: '#A78BFA' }]}>Not started yet</Text>
              <Text style={s.dcScore}>Resets in {countdown}</Text>
            </>
          )}
        </View>
        <View style={s.dcRight}>
          <Text style={[s.dcChevron, { color: done ? '#8B5CF6' : '#A78BFA' }]}>›</Text>
        </View>
      </View>
      {!done && (
        <View style={s.dcFooter}>
          <Text style={s.dcFooterText}>🔬  5 ionic compounds · Build from ions · Valency practice</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function StreakBadge({ count }: { count: number }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (count === 0) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, [count]);

  return (
    <View style={s.streakBadge}>
      <Animated.Text style={[s.fireEmoji, { transform: [{ scale: pulse }] }]}>🔥</Animated.Text>
      <Text style={s.streakCount}>{count}</Text>
    </View>
  );
}

function RatingChip({ rating }: { rating: number }) {
  const tier = getTier(rating);
  return (
    <View style={[s.ratingChip, { borderColor: tier.color + '66' }]}>
      <Text style={s.ratingChipEmoji}>{tier.emoji}</Text>
      <Text style={[s.ratingChipText, { color: tier.color }]}>{rating}</Text>
    </View>
  );
}

function GameCard({ game, onPress }: { game: Game; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 300, friction: 10 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }).start();

  if (game.locked) {
    return (
      <View style={[s.card, s.cardLocked]}>
        <View style={s.cardLock}><Text style={s.lockIcon}>🔒</Text></View>
        <View style={s.cardBody}>
          <Text style={s.cardIconLocked}>{game.icon}</Text>
          <View style={s.cardText}>
            <Text style={s.cardTitleLocked}>{game.title}</Text>
            <Text style={s.cardSubtitleLocked}>Coming soon</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={1} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[s.card, s.cardActive, { transform: [{ scale }] }]}>
        <View style={s.cardGlow} />
        <View style={s.cardBody}>
          <Text style={s.cardIcon}>{game.icon}</Text>
          <View style={s.cardText}>
            <Text style={s.cardTitle}>{game.title}</Text>
            <Text style={s.cardSubtitle}>{game.subtitle}</Text>
          </View>
        </View>
        <TouchableOpacity style={s.playBtn} onPress={onPress}>
          <Text style={s.playBtnText}>PLAY</Text>
        </TouchableOpacity>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft:  { flex: 1 },
  headerRight: { alignItems: 'flex-end', gap: 8 },

  logo: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: 0.5 },
  greetingSub: { fontSize: 13, color: C.textSub, marginTop: 4 },

  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  fireEmoji: { fontSize: 18 },
  streakCount: { fontSize: 15, fontWeight: '700', color: C.fire },

  ratingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5,
  },
  ratingChipEmoji: { fontSize: 14 },
  ratingChipText:  { fontSize: 13, fontWeight: '800' },

  trophyBtn: {
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F59E0B44',
  },
  trophyIcon: { fontSize: 16 },

  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#7F1D1D',
  },
  logoutText: { fontSize: 13, fontWeight: '700', color: '#FCA5A5' },

  leaderboardBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B44',
    paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 4,
  },
  leaderboardBannerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  leaderboardBannerIcon:    { fontSize: 28 },
  leaderboardBannerTitle:   { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  leaderboardBannerSub:     { fontSize: 12, color: C.textSub },
  leaderboardBannerChevron: { fontSize: 24, color: '#F59E0B', fontWeight: '700' },

  // Daily Challenge card
  dcCard: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5,
    borderColor: '#F59E0B44', overflow: 'hidden',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  // Periodic Sprint card (same layout, teal accent)
  sprintCard: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5,
    borderColor: '#14B8A644', overflow: 'hidden',
    shadowColor: '#14B8A6', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  // Compound Builder card (violet accent)
  compoundCard: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5,
    borderColor: '#8B5CF644', overflow: 'hidden',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  dcAccent:   { height: 3 },
  dcBody:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  dcLeft:     { width: 40, alignItems: 'center' },
  dcEmoji:    { fontSize: 28 },
  dcMid:      { flex: 1, gap: 2 },
  dcTitle:    { fontSize: 16, fontWeight: '800', color: C.text },
  dcStatus:   { fontSize: 12, fontWeight: '700' },
  dcScore:    { fontSize: 11, color: C.textSub, fontWeight: '600' },
  dcRight:    {},
  dcChevron:  { fontSize: 26, color: '#F59E0B', fontWeight: '700' },
  dcFooter:   { paddingHorizontal: 16, paddingBottom: 12 },
  dcFooterText: { fontSize: 11, color: C.textSub, fontWeight: '500' },

  cardsWrap: { gap: 16 },
  card: { borderRadius: 16, overflow: 'hidden' },
  cardActive: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cardLocked: { backgroundColor: C.locked, borderWidth: 1, borderColor: C.border, opacity: 0.6 },
  cardGlow: { height: 3, backgroundColor: C.primary },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  cardIcon: { fontSize: 36 },
  cardIconLocked: { fontSize: 32, opacity: 0.5 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 3 },
  cardTitleLocked: { fontSize: 16, fontWeight: '600', color: C.lockedText, marginBottom: 3 },
  cardSubtitle: { fontSize: 13, color: C.textSub, lineHeight: 18 },
  cardSubtitleLocked: { fontSize: 12, color: C.lockedText },
  cardLock: { position: 'absolute', top: 12, right: 12 },
  lockIcon: { fontSize: 16 },
  playBtn: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  playBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 1.5 },
});
