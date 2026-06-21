import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { getRankProgress } from '../../core/profileApi';

interface Props {
  rating: number;
}

export default function RankProgressBar({ rating }: Props) {
  const { tier, nextTier, ptsInTier, ptsToNext, rangePts, progress } =
    getRankProgress(rating);

  const fillAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 900,
      delay: 150,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1200, useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  const fillPct = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });

  const isMaster = !nextTier;

  return (
    <View style={s.wrap}>

      {/* Tier labels */}
      <View style={s.labelRow}>
        <View style={s.labelLeft}>
          <Text style={s.labelEmoji}>{tier.emoji}</Text>
          <Text style={[s.labelName, { color: tier.color }]}>{tier.name}</Text>
        </View>
        {isMaster ? (
          <Text style={[s.labelName, { color: tier.color }]}>MAX</Text>
        ) : (
          <View style={s.labelRight}>
            <Text style={[s.labelName, { color: nextTier!.color }]}>{nextTier!.name}</Text>
            <Text style={s.labelEmoji}>{nextTier!.emoji}</Text>
          </View>
        )}
      </View>

      {/* Progress track */}
      <View style={s.track}>
        {/* Segment dividers (5 equal sections within tier) */}
        {!isMaster && [1, 2, 3, 4].map((n) => (
          <View
            key={n}
            style={[s.divider, { left: `${n * 20}%` as any }]}
          />
        ))}

        {/* Fill */}
        <Animated.View
          style={[
            s.fill,
            { width: fillPct, backgroundColor: tier.color },
          ]}
        />

        {/* Glow on leading edge */}
        <Animated.View
          style={[
            s.fillGlow,
            { width: fillPct, shadowColor: tier.color, opacity: glowOpacity },
          ]}
        />
      </View>

      {/* Bottom info */}
      <View style={s.infoRow}>
        <Text style={s.pts}>
          {ptsInTier}
          {rangePts ? ` / ${rangePts} pts` : ' pts'}
        </Text>
        {isMaster ? (
          <Text style={[s.toNext, { color: tier.color }]}>Pinnacle of Chemistry</Text>
        ) : (
          <Text style={[s.toNext, { color: tier.color }]}>
            {ptsToNext} pts to {nextTier!.name} {nextTier!.emoji}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelEmoji: { fontSize: 18 },
  labelName:  { fontSize: 13, fontWeight: '700' },

  track: {
    height: 12,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    borderRadius: 6,
  },
  fillGlow: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
    elevation: 4,
  },
  divider: {
    position: 'absolute',
    top: 2, bottom: 2,
    width: 1,
    backgroundColor: '#0F172A',
    zIndex: 1,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pts:    { fontSize: 12, color: '#64748B', fontWeight: '600' },
  toNext: { fontSize: 12, fontWeight: '700' },
});
