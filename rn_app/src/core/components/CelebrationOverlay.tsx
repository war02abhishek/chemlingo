/**
 * CelebrationOverlay
 *
 * Full-screen dopamine burst: emoji particles rain from top, Flasky bounces,
 * headline text pops in, phone vibrates. Auto-dismisses after `duration` ms.
 *
 * Usage:
 *   <CelebrationOverlay type="lesson" visible={show} onDone={() => setShow(false)} />
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated, Easing, Modal, StyleSheet, Text,
  TouchableWithoutFeedback, Vibration, View,
} from 'react-native';
import { Colors, Font } from '../theme';
import FlaskyMascot from './FlaskyMascot';

// ── Vibration patterns ────────────────────────────────────────────────────────

const PATTERNS = {
  lesson:   [0, 40, 60, 80],
  duel_win: [0, 60, 40, 100, 40, 180],
  streak:   [0, 120, 60, 120, 60, 240],
  boss_pass:[0, 80, 50, 120, 50, 200],
  pyq_good: [0, 40, 60, 80],
};

// ── Particle config ───────────────────────────────────────────────────────────

const EMOJIS = {
  lesson:   ['⭐', '✨', '🪙', '💫', '⭐', '🪙', '✨', '💫', '⭐', '✨', '🪙', '💫'],
  duel_win: ['🏆', '⭐', '🎉', '✨', '🏆', '🎉', '⭐', '✨', '🏆', '🎉', '⭐', '✨'],
  streak:   ['🔥', '🔥', '⚡', '🔥', '🔥', '⚡', '🔥', '🔥', '⚡', '🔥', '🔥', '⚡'],
  boss_pass:['🏅', '⭐', '💎', '✨', '🏅', '⭐', '💎', '✨', '🏅', '⭐', '💎', '✨'],
  pyq_good: ['📚', '⭐', '✅', '💡', '📚', '⭐', '✅', '💡', '📚', '⭐', '✅', '💡'],
};

const HEADLINES = {
  lesson:   'LESSON COMPLETE!',
  duel_win: 'VICTORY!',
  streak:   'ON FIRE! 🔥',
  boss_pass:'BOSS DEFEATED!',
  pyq_good: 'GREAT SCORE!',
};

const SUBLINES = {
  lesson:   'Keep the momentum going',
  duel_win: 'You crushed it!',
  streak:   'Streak is burning!',
  boss_pass:'Topic unlocked!',
  pyq_good: 'Well prepared!',
};

const ACCENT = {
  lesson:   Colors.green,
  duel_win: Colors.amber,
  streak:   Colors.orange,
  boss_pass:Colors.purple,
  pyq_good: Colors.blue,
};

export type CelebrationType = keyof typeof PATTERNS;

interface Props {
  type: CelebrationType;
  visible: boolean;
  onDone: () => void;
  duration?: number; // ms before auto-dismiss (default 2600)
}

// ── Single particle ───────────────────────────────────────────────────────────

interface ParticleProps {
  emoji: string;
  startX: number;
  dx: number;
  delay: number;
  duration: number;
  size: number;
}

function Particle({ emoji, startX, dx, delay, duration, size }: ParticleProps) {
  const y       = useRef(new Animated.Value(-60)).current;
  const x       = useRef(new Animated.Value(startX)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(y, { toValue: 800, duration, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(x, { toValue: startX + dx, duration, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 6, duration, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(duration * 0.55),
          Animated.timing(opacity, { toValue: 0, duration: duration * 0.45, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 6], outputRange: ['0deg', '720deg'] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        fontSize: size,
        transform: [{ translateX: x }, { translateY: y }, { rotate: spin }],
        opacity,
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CelebrationOverlay({ type, visible, onDone, duration = 2600 }: Props) {
  const headlineScale   = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const mascotY         = useRef(new Animated.Value(60)).current;
  const mascotOpacity   = useRef(new Animated.Value(0)).current;

  const emojis = EMOJIS[type];
  const accent = ACCENT[type];

  // Stable particle positions so they don't re-randomise on re-render
  const particles = useRef(
    emojis.map((emoji, i) => ({
      emoji,
      startX: (i / emojis.length) * 360 + Math.random() * 20,
      dx: (Math.random() - 0.5) * 120,
      delay: i * 80 + Math.random() * 100,
      duration: 1400 + Math.random() * 600,
      size: 20 + Math.random() * 14,
    }))
  ).current;

  const runAnimations = useCallback(() => {
    // Vibrate
    Vibration.vibrate(PATTERNS[type]);

    // Headline pop
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(headlineScale, { toValue: 1, useNativeDriver: true, bounciness: 18 }),
        Animated.timing(headlineOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();

    // Mascot slide up
    Animated.sequence([
      Animated.delay(350),
      Animated.parallel([
        Animated.spring(mascotY, { toValue: 0, useNativeDriver: true, bounciness: 14 }),
        Animated.timing(mascotOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();
  }, [type]);

  const resetAnimations = useCallback(() => {
    headlineScale.setValue(0);
    headlineOpacity.setValue(0);
    mascotY.setValue(60);
    mascotOpacity.setValue(0);
  }, []);

  useEffect(() => {
    if (visible) {
      resetAnimations();
      runAnimations();
      const t = setTimeout(onDone, duration);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onDone}>
        <View style={s.overlay}>

          {/* Particle layer */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {particles.map((p, i) => (
              <Particle key={i} {...p} />
            ))}
          </View>

          {/* Content */}
          <View style={s.content} pointerEvents="none">
            <Animated.View style={{ transform: [{ scale: headlineScale }], opacity: headlineOpacity, alignItems: 'center' }}>
              <Text style={[s.headline, { color: accent }]}>{HEADLINES[type]}</Text>
              <Text style={s.subline}>{SUBLINES[type]}</Text>
            </Animated.View>

            <Animated.View style={{ transform: [{ translateY: mascotY }], opacity: mascotOpacity, marginTop: 20 }}>
              <FlaskyMascot size={100} expression="celebrating" />
            </Animated.View>
          </View>

          {/* Tap-to-dismiss hint */}
          <Text style={s.tapHint}>Tap to continue</Text>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headline: {
    fontFamily: Font.display,
    fontSize: 34,
    letterSpacing: 1,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subline: {
    fontFamily: Font.body,
    fontSize: 16,
    color: '#fff',
    marginTop: 6,
    opacity: 0.85,
  },
  tapHint: {
    position: 'absolute',
    bottom: 52,
    fontFamily: Font.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
});
