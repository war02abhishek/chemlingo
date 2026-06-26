import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Animated, Easing, ScrollView,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import FlaskyMascot from '../../core/components/FlaskyMascot';
import CelebrationOverlay from '../../core/components/CelebrationOverlay';
import { Colors, Font, Shadow3D } from '../../core/theme';

// ── Confetti config (exact from design) ──────────────────────────────────────
const CONF_COLORS = ['#2fc665', '#2f6bfe', '#ffc83d', '#8b5cf6', '#2fd0c0', '#ff8a3d'];
const CONF_COUNT = 16;

function buildConfPieces() {
  return Array.from({ length: CONF_COUNT }).map((_, i) => ({
    left: (i * 6.2 + (i % 3) * 4) % 96 + 2,
    color: CONF_COLORS[i % CONF_COLORS.length],
    delay: (i % 5) * 250,
    duration: 2400 + (i % 4) * 400,
    size: 8 + (i % 3) * 3,
    isCircle: i % 2 === 1,
  }));
}
const CONF_PIECES = buildConfPieces();

function ConfettiPiece({ piece, screenH }: { piece: typeof CONF_PIECES[0]; screenH: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(piece.delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: piece.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, screenH + 40] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '560deg'] });
  const opacity = anim.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 0.3, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: `${piece.left}%` as any,
        width: piece.size,
        height: piece.size + 2,
        backgroundColor: piece.color,
        borderRadius: piece.isCircle ? piece.size / 2 : 2,
        transform: [{ translateY }, { rotate }],
        opacity,
        pointerEvents: 'none' as any,
      }}
    />
  );
}

// ── SVG icons ────────────────────────────────────────────────────────────────
function StarIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3 14.6 8.6 21 9.3l-4.6 4.2L17.7 20 12 16.9 6.3 20l1.3-6.5L3 9.3l6.4-.7z" fill="#ffc83d" />
    </Svg>
  );
}
function GemIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2 21 8.5 12 22 3 8.5z" fill="#2fd0c0" />
      <Path d="M3 8.5h18M12 2v20" stroke="#16a99a" strokeWidth="1" fill="none" />
    </Svg>
  );
}
function ClockIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9" fill="none" stroke="#8b5cf6" strokeWidth="2.4" />
      <Path d="M12 8v4l3 2" fill="none" stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}
function FlameIcon({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2c1.2 3.2 4 4.4 4 8a4 4 0 0 1-8 0c0-1-.2-1.6.6-2.4C8 9 7 10.6 7 13a5 5 0 0 0 10 0c0-4.2-3-7.2-5-11z" fill="#ff8a3d" />
    </Svg>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
interface Params {
  xp: number;
  coins: number;
  accuracy?: number;
  lessonTitle: string;
  lessonId?: string;
  streak?: boolean;
}

export default function RewardScreen({ route, navigation }: any) {
  const { xp = 0, coins = 0, accuracy = 80, lessonTitle = 'Lesson', lessonId, streak = false }: Params = route.params ?? {};

  const [showCelebration, setShowCelebration] = useState(true);

  // popIn animation for mascot
  const popIn = useRef(new Animated.Value(0.7)).current;
  const popOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(popIn, { toValue: 1, useNativeDriver: true, tension: 70, friction: 6 }),
      Animated.timing(popOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <CelebrationOverlay
        type="lesson"
        visible={showCelebration}
        onDone={() => setShowCelebration(false)}
        duration={2200}
      />
      {/* Confetti layer */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {CONF_PIECES.map((p, i) => (
          <ConfettiPiece key={i} piece={p} screenH={812} />
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Mascot */}
        <Animated.View style={[s.mascotWrap, { transform: [{ scale: popIn }], opacity: popOpacity }]}>
          <FlaskyMascot size={120} />
        </Animated.View>

        {/* Eyebrow + title */}
        <Text style={s.eyebrow}>LESSON COMPLETE</Text>
        <Text style={s.title}>{lessonTitle}</Text>
        <Text style={s.sub}>Great chemistry!</Text>

        {/* 3 stat tiles */}
        <View style={s.tilesRow}>
          <View style={[s.tile, { backgroundColor: '#fffae8', borderColor: '#ffeeb8' }]}>
            <StarIcon size={24} />
            <Text style={[s.tileVal, { color: '#e0a200' }]}>+{xp}</Text>
            <Text style={[s.tileLabel, { color: '#bd9326' }]}>XP</Text>
          </View>
          <View style={[s.tile, { backgroundColor: '#eafaf1', borderColor: '#c8f0d8' }]}>
            <GemIcon size={22} />
            <Text style={[s.tileVal, { color: '#159083' }]}>+{coins}</Text>
            <Text style={[s.tileLabel, { color: '#3f9a8b' }]}>Coins</Text>
          </View>
          <View style={[s.tile, { backgroundColor: '#f0eaff', borderColor: '#d9caff' }]}>
            <ClockIcon size={22} />
            <Text style={[s.tileVal, { color: '#8b5cf6' }]}>{accuracy}%</Text>
            <Text style={[s.tileLabel, { color: '#7d6bb0' }]}>Accuracy</Text>
          </View>
        </View>

        {/* Streak card */}
        <View style={s.streakCard}>
          <FlameIcon size={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.streakTitle}>Keep it up!</Text>
            <Text style={s.streakSub}>Complete more lessons to build your streak</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer: Continue button */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.continueBtn, { shadowColor: Colors.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 }]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('AdventurePath')}
        >
          <Text style={s.continueBtnText}>CONTINUE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  scroll: {
    flexGrow: 1, paddingHorizontal: 24, paddingBottom: 20,
    alignItems: 'center',
    // green tint at top fading to white
    paddingTop: 20,
  },

  mascotWrap: { marginTop: 14 },
  eyebrow: { fontFamily: Font.body, fontSize: 13, color: Colors.green, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  title: { fontFamily: Font.display, fontSize: 28, color: '#16204a', lineHeight: 33, textAlign: 'center' },
  sub: { fontFamily: Font.body, fontSize: 14, color: '#8a92ab', marginTop: 4 },

  tilesRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 22 },
  tile: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4 },
  tileVal: { fontFamily: Font.display, fontSize: 20, lineHeight: 24 },
  tileLabel: { fontFamily: Font.body, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },

  streakCard: {
    width: '100%', marginTop: 14,
    backgroundColor: '#fff5ec', borderWidth: 2, borderColor: '#ffe2cc',
    borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  streakTitle: { fontFamily: Font.display, fontSize: 19, color: '#ff7a26' },
  streakSub: { fontFamily: Font.body, fontSize: 13, color: '#bf7a4a', marginTop: 2 },

  footer: {
    paddingHorizontal: 22, paddingBottom: 28, paddingTop: 14,
    borderTopWidth: 2, borderTopColor: '#eef1f8', backgroundColor: '#fff',
  },
  continueBtn: {
    backgroundColor: Colors.green, borderRadius: 16, padding: 16, alignItems: 'center',
  },
  continueBtnText: { fontFamily: Font.display, fontSize: 17, color: '#fff', letterSpacing: 0.4 },
});
