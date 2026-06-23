import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, Easing, ActivityIndicator,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { fetchCurriculum, fetchTopicLessons, TopicWithProgress, LessonWithStatus } from '../../core/curriculumApi';
import { fetchProfile, Profile } from '../../core/profileApi';
import FlaskyMascot from '../../core/components/FlaskyMascot';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';

// ── SVG icons ────────────────────────────────────────────────────────────────
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
function HeartIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21s-7.5-4.7-9.7-9.4C.6 8 2.3 4.4 5.8 4.4c2 0 3.4 1.2 4.2 2.5.8-1.3 2.2-2.5 4.2-2.5 3.5 0 5.2 3.6 3.5 7.2C19.5 16.3 12 21 12 21z" fill="#ff4d5e" />
    </Svg>
  );
}
function CheckSvg() {
  return (
    <Svg width="34" height="34" viewBox="0 0 24 24">
      <Path d="M5 13l4 4L19 7" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function PlaySvg() {
  return (
    <Svg width="30" height="30" viewBox="0 0 24 24">
      <Path d="M8 5v14l11-7z" fill="#fff" />
    </Svg>
  );
}
function LockSvg() {
  return (
    <Svg width="28" height="28" viewBox="0 0 24 24">
      <Rect x="5" y="11" width="14" height="9" rx="2.5" fill="#aeb6c9" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#aeb6c9" strokeWidth="2.4" />
    </Svg>
  );
}
function TrophySvg() {
  return (
    <Svg width="32" height="32" viewBox="0 0 24 24">
      <Path d="M5 4h14l-1 8a6 6 0 0 1-12 0z" fill="#fff" />
      <Path d="M9 4l1.5 6h3L15 4" fill="#8b5cf6" />
      <Rect x="9" y="18" width="6" height="2.5" rx="1" fill="#fff" />
    </Svg>
  );
}

// ── Offset pattern from design ────────────────────────────────────────────────
// From design baseNodes: [{off:0},{off:58},{off:14},{off:-44},{off:6}]
const NODE_OFFSETS = [0, 58, 14, -44, 6];

type NodeKind = 'done' | 'current' | 'locked' | 'boss';

interface LessonNode {
  lesson: LessonWithStatus;
  topic: TopicWithProgress;
  kind: NodeKind;
}

function getNodeKind(lesson: LessonWithStatus, prevCompleted: boolean): NodeKind {
  if (lesson.completed) return 'done';
  if (prevCompleted || lesson.position === 1) return 'current';
  return 'locked';
}

// ── Pulse animation for current node ─────────────────────────────────────────
function useLoop(range: [number, number], duration: number) {
  const anim = useRef(new Animated.Value(range[0])).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: range[1], duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: range[0], duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  return anim;
}

// ── Node circle ───────────────────────────────────────────────────────────────
function NodeCircle({ kind, onPress }: { kind: NodeKind; onPress: () => void }) {
  const scaleAnim = useLoop([1, 1.04], 1800);

  let bg: string, shadow: object;
  if (kind === 'done') { bg = '#2fc665'; shadow = { shadowColor: '#23a052', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 5 }; }
  else if (kind === 'current') { bg = '#2fc665'; shadow = { shadowColor: '#23a052', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6 }; }
  else if (kind === 'boss') { bg = '#8b5cf6'; shadow = { shadowColor: '#6d3fd6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6 }; }
  else { bg = '#e6e9f1'; shadow = { shadowColor: '#d2d8e6', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 5 }; }

  const circleStyle: any = [
    styles.nodeCircle,
    { backgroundColor: bg },
    shadow,
    kind === 'current' && styles.nodeCircleCurrent,
  ];

  const inner = (
    <View style={circleStyle}>
      {kind === 'done' && <CheckSvg />}
      {kind === 'current' && <PlaySvg />}
      {kind === 'locked' && <LockSvg />}
      {kind === 'boss' && <TrophySvg />}
    </View>
  );

  if (kind === 'current') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {inner}
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={kind !== 'locked' ? onPress : undefined} activeOpacity={kind !== 'locked' ? 0.85 : 1}>
      {inner}
    </TouchableOpacity>
  );
}

// ── Floating animations ────────────────────────────────────────────────────────
function FloatingFlasky() {
  const floatY = useLoop([0, -7], 3000);
  return (
    <Animated.View style={[styles.flaskyBesideNode, { transform: [{ translateY: floatY }] }]}>
      <FlaskyMascot size={44} />
    </Animated.View>
  );
}

function StartBubble() {
  const bobY = useLoop([0, -5], 1600);
  return (
    <Animated.View style={[styles.startBubble, { transform: [{ translateY: bobY }] }]}>
      <Text style={styles.startBubbleText}>START</Text>
    </Animated.View>
  );
}

// ── Full screen ───────────────────────────────────────────────────────────────
interface TopicSection {
  topic: TopicWithProgress;
  nodes: LessonNode[];
}

export default function AdventurePathScreen({ navigation }: any) {
  const [sections, setSections] = useState<TopicSection[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [curr, prof] = await Promise.all([fetchCurriculum(), fetchProfile()]);
      setProfile(prof);
      const built: TopicSection[] = [];

      for (const topic of curr.topics) {
        const { lessons } = await fetchTopicLessons(topic.slug);
        const nodes: LessonNode[] = lessons.map((l, idx) => {
          const prevCompleted = idx === 0 ? true : lessons[idx - 1].completed;
          return { lesson: l, topic, kind: getNodeKind(l, prevCompleted) };
        });
        built.push({ topic, nodes });
      }

      setSections(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { return navigation.addListener('focus', load); }, [navigation, load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.green} /></View>
      </SafeAreaView>
    );
  }

  const streak = profile?.current_streak ?? 0;
  const totalXp = profile?.total_xp ?? 0;
  const coins = profile?.coins ?? 0;
  const hearts = profile?.hearts ?? 5;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Stat header */}
      <View style={styles.statHeader}>
        <View style={[styles.chip, { backgroundColor: '#fff5ec', borderColor: '#ffe2cc' }]}>
          <FlameIcon size={18} /><Text style={[styles.chipVal, { color: '#ff7a26' }]}>{streak}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: '#fffae8', borderColor: '#ffeeb8' }]}>
          <StarIcon size={18} /><Text style={[styles.chipVal, { color: '#e0a200' }]}>{totalXp}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: '#eafaf1', borderColor: '#c8f0d8' }]}>
          <GemIcon size={17} /><Text style={[styles.chipVal, { color: '#159083' }]}>{coins}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.hearts}>
          <HeartIcon size={20} /><Text style={[styles.chipVal, { color: '#ff4d5e' }]}>{hearts}</Text>
        </View>
      </View>

      {/* Back button */}
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sections.map((section) => {
          // First incomplete lesson in this section
          const currentNode = section.nodes.find((n) => n.kind === 'current');
          const topicPct = Math.round((section.topic.lessons_completed / section.topic.total_lessons) * 100);
          const topicPctStr = `${section.topic.lessons_completed}/${section.topic.total_lessons}`;

          return (
            <View key={section.topic.slug} style={styles.sectionWrap}>
              {/* Green topic banner */}
              <View style={styles.topicBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerTopic}>{section.topic.title}</Text>
                  <Text style={styles.bannerLesson}>{currentNode?.lesson.title ?? 'All complete!'}</Text>
                  <View style={styles.bannerBarBg}>
                    <View style={[styles.bannerBarFill, { width: `${topicPct}%` as any }]} />
                  </View>
                </View>
                <View style={styles.bannerCount}>
                  <Text style={styles.bannerCountNum}>{topicPctStr}</Text>
                  <Text style={styles.bannerCountLabel}>Lessons</Text>
                </View>
              </View>

              {/* Winding nodes */}
              <View style={styles.pathColumn}>
                {section.nodes.map((node, idx) => {
                  const offset = NODE_OFFSETS[idx % NODE_OFFSETS.length];
                  const isCurrent = node.kind === 'current';

                  return (
                    <View key={node.lesson.id} style={[styles.nodeRow, { transform: [{ translateX: offset }] }]}>
                      <View style={styles.nodeInner}>
                        {isCurrent && <StartBubble />}
                        <NodeCircle
                          kind={node.kind}
                          onPress={() =>
                            navigation.navigate('LessonIntro', {
                              lessonId: node.lesson.id,
                              lessonTitle: node.lesson.title,
                              lessonPosition: node.lesson.position,
                              topicTitle: section.topic.title,
                              topicIcon: section.topic.icon,
                              conceptText: node.lesson.concept_text,
                              xpReward: node.lesson.xp_reward,
                              coinReward: node.lesson.coin_reward,
                              gameMode: node.lesson.game_mode,
                            })
                          }
                        />
                        <Text style={[styles.nodeLabel, node.kind === 'locked' && { color: '#aab2c5' }]} numberOfLines={2}>
                          {node.lesson.title}
                        </Text>
                        {isCurrent && <FloatingFlasky />}
                      </View>
                    </View>
                  );
                })}

                {/* Boss Battle node */}
                <View style={[styles.nodeRow, { transform: [{ translateX: NODE_OFFSETS[4] }] }]}>
                  <View style={styles.nodeInner}>
                    <TouchableOpacity
                      disabled={section.topic.lessons_completed < section.topic.total_lessons}
                      onPress={() => navigation.navigate('BossBattle', { topicId: section.topic.id, topicTitle: section.topic.title })}
                      activeOpacity={0.85}
                    >
                      <View style={[
                        styles.nodeCircle,
                        { backgroundColor: '#8b5cf6' },
                        { shadowColor: '#6d3fd6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 6 },
                        section.topic.lessons_completed < section.topic.total_lessons && { opacity: 0.4 },
                      ]}>
                        <TrophySvg />
                      </View>
                    </TouchableOpacity>
                    <Text style={[styles.nodeLabel, { color: '#8b5cf6' }]}>Boss Battle</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f9fd' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14 },
  chipVal: { fontFamily: Font.display, fontSize: 16 },
  hearts: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  back: { paddingHorizontal: 18, paddingBottom: 4 },
  backText: { fontFamily: Font.body, fontSize: 15, color: Colors.blue },

  scroll: { paddingHorizontal: 18, paddingBottom: 40 },

  sectionWrap: { marginBottom: 32 },

  topicBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#2fc665', borderRadius: 20, padding: 16,
    marginBottom: 8,
    shadowColor: '#23a052', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 5,
  },
  bannerTopic: { fontFamily: Font.body, fontSize: 11, color: '#d6ffe6', textTransform: 'uppercase', letterSpacing: 0.8 },
  bannerLesson: { fontFamily: Font.display, fontSize: 21, color: '#fff', lineHeight: 26 },
  bannerBarBg: { marginTop: 9, width: 150, height: 8, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 99, overflow: 'hidden' },
  bannerBarFill: { height: 8, backgroundColor: '#fff', borderRadius: 99 },
  bannerCount: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: 10, alignItems: 'center', minWidth: 52 },
  bannerCountNum: { fontFamily: Font.display, fontSize: 20, color: '#fff' },
  bannerCountLabel: { fontFamily: Font.body, fontSize: 10, color: '#d6ffe6', textTransform: 'uppercase' },

  pathColumn: { gap: 30, paddingVertical: 26 },

  nodeRow: { alignItems: 'center' },
  nodeInner: { alignItems: 'center', gap: 9, position: 'relative' },

  nodeCircle: {
    width: 82, height: 82, borderRadius: 41,
    justifyContent: 'center', alignItems: 'center',
  },
  nodeCircleCurrent: {
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.9)',
  },
  nodeLabel: { fontFamily: Font.display, fontSize: 13, color: '#46506e', textAlign: 'center', maxWidth: 120 },

  startBubble: {
    position: 'absolute', top: -40, alignSelf: 'center', zIndex: 3,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#2fc665',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5,
    shadowColor: '#cdebd8', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2,
  },
  startBubbleText: { fontFamily: Font.display, fontSize: 13, color: '#1f9c54' },

  flaskyBesideNode: { position: 'absolute', top: 8, left: 78 },
});
