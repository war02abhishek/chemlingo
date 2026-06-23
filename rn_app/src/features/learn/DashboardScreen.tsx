import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, RefreshControl, ActivityIndicator, Animated,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchProfile, Profile } from '../../core/profileApi';
import { fetchCurriculum, fetchTopicLessons, TopicWithProgress, LessonWithStatus } from '../../core/curriculumApi';
import FlaskyMascot from '../../core/components/FlaskyMascot';
import { Colors, Font, Radius, Shadow3D, xpToLevel, xpProgressInLevel } from '../../core/theme';

// ── Inline SVG icons ────────────────────────────────────────────────────────
function FlameIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2c1.2 3.2 4 4.4 4 8a4 4 0 0 1-8 0c0-1-.2-1.6.6-2.4C8 9 7 10.6 7 13a5 5 0 0 0 10 0c0-4.2-3-7.2-5-11z" fill="#ff8a3d" />
    </Svg>
  );
}
function StarIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3 14.6 8.6 21 9.3l-4.6 4.2L17.7 20 12 16.9 6.3 20l1.3-6.5L3 9.3l6.4-.7z" fill="#ffc83d" />
    </Svg>
  );
}
function GemIcon({ size = 17 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2 21 8.5 12 22 3 8.5z" fill="#2fd0c0" />
      <Path d="M3 8.5h18M12 2v20" stroke="#16a99a" strokeWidth="1" fill="none" />
    </Svg>
  );
}
function HeartIcon({ size = 20, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 21s-7.5-4.7-9.7-9.4C.6 8 2.3 4.4 5.8 4.4c2 0 3.4 1.2 4.2 2.5.8-1.3 2.2-2.5 4.2-2.5 3.5 0 5.2 3.6 3.5 7.2C19.5 16.3 12 21 12 21z"
        fill={filled ? '#ff4d5e' : '#e8ecf5'}
        stroke={filled ? '#d63a49' : '#c8cfe0'}
        strokeWidth="0.5"
      />
    </Svg>
  );
}
function LightningIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="#ff8a3d" />
    </Svg>
  );
}
function SwordsIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 4l5 5-2 2-5-5zM19 4l-5 5 2 2 5-5zM10 11l3 3-7 7H3v-3zM14 11l-3 3 7 7h3v-3z" fill="#8b5cf6" />
    </Svg>
  );
}
function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Stat header (flame/star/gem chips + hearts) ──────────────────────────────
function StatHeader({ streak, xp, coins, hearts }: { streak: number; xp: number; coins: number; hearts: number }) {
  return (
    <View style={st.headerWrap}>
      <View style={st.header}>
        <View style={[st.chip, { backgroundColor: '#fff5ec', borderColor: '#ffd6b0' }]}>
          <FlameIcon size={20} />
          <Text style={[st.chipVal, { color: '#e85d00' }]}>{streak}</Text>
        </View>
        <View style={[st.chip, { backgroundColor: '#fffae8', borderColor: '#ffe080' }]}>
          <StarIcon size={20} />
          <Text style={[st.chipVal, { color: '#b88000' }]}>{xp}</Text>
        </View>
        <View style={[st.chip, { backgroundColor: '#e6faf8', borderColor: '#9fe8e0' }]}>
          <GemIcon size={19} />
          <Text style={[st.chipVal, { color: '#0e8a7e' }]}>{coins}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={st.hearts}>
          {Array.from({ length: 3 }).map((_, i) => (
            <HeartIcon key={i} size={22} filled={i < hearts} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nextLesson, setNextLesson] = useState<{ topic: TopicWithProgress; lesson: LessonWithStatus } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [prof, curr] = await Promise.all([fetchProfile(), fetchCurriculum()]);
      setProfile(prof);

      for (const topic of curr.topics) {
        if (topic.lessons_completed < topic.total_lessons) {
          const { lessons } = await fetchTopicLessons(topic.slug);
          const incomplete = lessons.find((l) => !l.completed);
          if (incomplete) {
            setNextLesson({ topic, lesson: incomplete });
            break;
          }
        }
      }
    } catch {
      // empty state shown
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.green} /></View>
      </SafeAreaView>
    );
  }

  const prof = profile;
  const level = xpToLevel(prof?.total_xp ?? 0);
  const nextLevel = level + 1;
  const { pct: xpPct } = xpProgressInLevel(prof?.total_xp ?? 0);
  const name = prof?.name?.split(' ')[0] ?? 'Chemist';
  const streak = prof?.current_streak ?? 0;
  const totalXp = prof?.total_xp ?? 0;
  const coins = prof?.coins ?? 0;
  const hearts = prof?.hearts ?? 5;

  const lessonDone = !nextLesson;
  const progressPct = nextLesson
    ? Math.round((nextLesson.topic.lessons_completed / nextLesson.topic.total_lessons) * 100)
    : 100;

  const tasks = [
    { title: 'Daily lesson', sub: nextLesson?.lesson.title ?? 'All done!', done: lessonDone, reward: `+${nextLesson?.lesson.xp_reward ?? 50} XP` },
    { title: 'Daily Challenge', sub: '5 mixed questions', done: false, reward: '+30 XP' },
    { title: 'Win 1 Duel', sub: 'Reaction Duel', done: false, reward: '+15 XP' },
  ];

  const xpToNext = Math.round((1 - xpPct) * (XP_NEEDED[level - 1] ?? 10000));

  return (
    <SafeAreaView style={s.safe}>
      <StatHeader streak={streak} xp={totalXp} coins={coins} hearts={hearts} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />}
      >
        {/* Welcome */}
        <View style={s.welcome}>
          <View>
            <Text style={s.welcomeSub}>Welcome back,</Text>
            <Text style={s.welcomeName}>{name}</Text>
          </View>
          <FlaskyMascot size={46} />
        </View>

        {/* Hero card */}
        <LinearGradient
          colors={['#2f6bfe', '#5b8bff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.heroCard}
        >
          <View style={s.heroDecor} />
          <View style={s.heroRow}>
            <View style={s.levelDisc}>
              <Text style={s.levelDiscText}>L{level}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>Level {level} · Reactant</Text>
              <View style={s.xpBarBg}>
                <View style={[s.xpBarFill, { width: `${Math.round(xpPct * 100)}%` as any }]} />
              </View>
              <Text style={s.xpBarLabel}>{totalXp} XP · {xpToNext} to Level {nextLevel}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* 3 Stat tiles */}
        <View style={s.tilesRow}>
          <View style={[s.tile, { backgroundColor: '#fff5ec', borderColor: '#ffe2cc' }]}>
            <FlameIcon size={22} />
            <Text style={[s.tileVal, { color: '#ff7a26' }]}>{streak}</Text>
            <Text style={s.tileLabel}>Streak</Text>
          </View>
          <View style={[s.tile, { backgroundColor: '#fffae8', borderColor: '#ffeeb8' }]}>
            <StarIcon size={22} />
            <Text style={[s.tileVal, { color: '#e0a200' }]}>{totalXp}</Text>
            <Text style={s.tileLabel}>XP</Text>
          </View>
          <View style={[s.tile, { backgroundColor: '#eafaf1', borderColor: '#c8f0d8' }]}>
            <GemIcon size={20} />
            <Text style={[s.tileVal, { color: '#159083' }]}>{coins}</Text>
            <Text style={s.tileLabel}>Coins</Text>
          </View>
        </View>

        {/* Continue card */}
        <View style={s.continueCard}>
          <Text style={s.continueSup}>Continue learning</Text>
          <View style={s.continueRow}>
            <Text style={s.continueLessonTitle} numberOfLines={1}>
              {nextLesson?.lesson.title ?? 'All lessons complete!'}
            </Text>
            <Text style={s.continuePct}>{progressPct}%</Text>
          </View>
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${progressPct}%` as any }]} />
          </View>
          <TouchableOpacity
            style={[s.continueBtn, Shadow3D(Colors.greenDark)]}
            activeOpacity={0.85}
            onPress={() => {
              if (!nextLesson) return;
              navigation.navigate('LessonIntro', {
                lessonId: nextLesson.lesson.id,
                lessonTitle: nextLesson.lesson.title,
                lessonPosition: nextLesson.lesson.position,
                topicTitle: nextLesson.topic.title,
                topicIcon: nextLesson.topic.icon,
                conceptText: nextLesson.lesson.concept_text,
                xpReward: nextLesson.lesson.xp_reward,
                coinReward: nextLesson.lesson.coin_reward,
                gameMode: nextLesson.lesson.game_mode,
              });
            }}
          >
            <Text style={s.continueBtnText}>CONTINUE</Text>
          </TouchableOpacity>
        </View>

        {/* Today's tasks */}
        <Text style={s.sectionTitle}>Today's tasks</Text>
        <View style={s.tasksList}>
          {tasks.map((task, i) => (
            <View key={i} style={[s.taskRow, i < tasks.length - 1 && { borderBottomWidth: 1.5, borderBottomColor: Colors.border }]}>
              <View style={[s.taskDot, task.done && s.taskDotDone]}>
                {task.done && <CheckIcon size={16} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTitle}>{task.title}</Text>
                <Text style={s.taskSub}>{task.sub}</Text>
              </View>
              <View style={s.taskReward}>
                <Text style={s.taskRewardText}>{task.reward}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View style={s.quickGrid}>
          <TouchableOpacity
            style={[s.quickCard, { backgroundColor: '#fff4ec', borderColor: '#ffd9bf' }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Compete', { screen: 'DailyChallenge' })}
          >
            <LightningIcon size={24} />
            <Text style={s.quickTitle}>Daily Challenge</Text>
            <Text style={[s.quickSub, { color: '#bf7a4a' }]}>5 questions · +30 XP</Text>
          </TouchableOpacity>
          <View style={[s.quickCard, { backgroundColor: '#efe9ff', borderColor: '#d9caff' }]}>
            <SwordsIcon size={24} />
            <Text style={s.quickTitle}>Reaction Duel</Text>
            <Text style={[s.quickSub, { color: '#7d6bb0' }]}>Coming up · 1v1</Text>
          </View>
        </View>

        {/* View full path button */}
        <TouchableOpacity
          style={s.pathBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('AdventurePath')}
        >
          <Text style={s.pathBtnText}>View Full Learning Path →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// XP needed per level (delta from threshold[i] to threshold[i+1])
const XP_NEEDED = [500, 1000, 1500, 2500, 3500, 5000, 7000, 9000, 12000, 10000];

const st = StyleSheet.create({
  headerWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1.5,
    borderBottomColor: '#eef1f8',
    paddingBottom: 2,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 2, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  chipVal: { fontFamily: Font.display, fontSize: 17, lineHeight: 21 },
  hearts: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f9fd' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 18, paddingBottom: 48 },

  welcome: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  welcomeSub: { fontFamily: Font.body, fontSize: 14, color: '#8a92ab' },
  welcomeName: { fontFamily: Font.display, fontSize: 24, color: Colors.ink, lineHeight: 28 },

  heroCard: { borderRadius: 22, padding: 18, marginBottom: 14, overflow: 'hidden' },
  heroDecor: {
    position: 'absolute', right: -30, top: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  levelDisc: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  levelDiscText: { fontFamily: Font.display, fontSize: 24, color: '#fff' },
  heroTitle: { fontFamily: Font.display, fontSize: 17, color: '#fff', marginBottom: 8 },
  xpBarBg: { height: 9, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, overflow: 'hidden' },
  xpBarFill: { height: 9, backgroundColor: '#ffd84d', borderRadius: 99 },
  xpBarLabel: { fontFamily: Font.body, fontSize: 12, color: '#dbe6ff', marginTop: 6 },

  tilesRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tile: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 12, alignItems: 'center', gap: 4 },
  tileVal: { fontFamily: Font.display, fontSize: 19, lineHeight: 24 },
  tileLabel: {
    fontFamily: Font.body, fontSize: 10, color: '#bd9326',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  continueCard: {
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e8ecf5',
    borderRadius: 20, padding: 16, marginBottom: 14,
    shadowColor: '#eef1f8', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2,
  },
  continueSup: {
    fontFamily: Font.body, fontSize: 11, color: '#8a92ab',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  continueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  continueLessonTitle: { fontFamily: Font.display, fontSize: 19, color: Colors.ink, flex: 1 },
  continuePct: { fontFamily: Font.display, fontSize: 14, color: Colors.green },
  progressBg: { marginTop: 8, height: 9, backgroundColor: '#eef1f8', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: 9, backgroundColor: Colors.green, borderRadius: 99 },
  continueBtn: {
    marginTop: 14, backgroundColor: Colors.green, borderRadius: 15, padding: 13, alignItems: 'center',
  },
  continueBtnText: { fontFamily: Font.display, fontSize: 16, color: '#fff', letterSpacing: 0.4 },

  sectionTitle: { fontFamily: Font.display, fontSize: 15, color: Colors.ink, marginBottom: 8 },

  tasksList: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e8ecf5', borderRadius: 16, marginBottom: 14, overflow: 'hidden' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskDot: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 2.5, borderColor: '#dfe4ee', backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  taskDotDone: { backgroundColor: Colors.green, borderColor: Colors.green },
  taskTitle: { fontFamily: Font.display, fontSize: 15, color: Colors.ink },
  taskSub: { fontFamily: Font.body, fontSize: 12, color: '#8a92ab', marginTop: 1 },
  taskReward: { backgroundColor: '#fffae8', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9 },
  taskRewardText: { fontFamily: Font.display, fontSize: 13, color: '#e0a200' },

  quickGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  quickCard: { flex: 1, borderWidth: 2, borderRadius: 18, padding: 14, gap: 4 },
  quickTitle: { fontFamily: Font.display, fontSize: 15, color: Colors.ink, marginTop: 4 },
  quickSub: { fontFamily: Font.body, fontSize: 11 },

  pathBtn: {
    borderRadius: 14, padding: 14, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e8ecf5',
  },
  pathBtnText: { fontFamily: Font.display, fontSize: 14, color: Colors.blue },
});
