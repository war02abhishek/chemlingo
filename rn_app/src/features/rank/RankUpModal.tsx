import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { type Tier } from '../../core/profileApi';

// ── Particle burst ────────────────────────────────────────────────────────────

const BURST_COLORS = [
  '#F59E0B', '#EC4899', '#6366F1', '#22C55E',
  '#F97316', '#3B82F6', '#A78BFA', '#34D399',
];

function ParticleBurst({ visible, color }: { visible: boolean; color: string }) {
  const COUNT = 28;
  const particles = useRef(
    Array.from({ length: COUNT }, (_, i) => {
      const angle  = (i / COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const dist   = 80 + Math.random() * 140;
      const jitter = (Math.random() - 0.5) * 40;
      return {
        x:       new Animated.Value(0),
        y:       new Animated.Value(0),
        opacity: new Animated.Value(0),
        scale:   new Animated.Value(0),
        color:   i % 4 === 0 ? color : BURST_COLORS[i % BURST_COLORS.length],
        circle:  Math.random() > 0.4,
        dx:      Math.cos(angle) * dist + jitter,
        dy:      Math.sin(angle) * dist - 60 + jitter,
        size:    6 + Math.random() * 8,
        delay:   Math.random() * 120,
      };
    })
  ).current;

  useEffect(() => {
    if (!visible) return;
    particles.forEach((p) => {
      p.x.setValue(0); p.y.setValue(0);
      p.opacity.setValue(0); p.scale.setValue(0);
    });
    const anims = particles.map((p) =>
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 1, duration: 80,   useNativeDriver: true }),
          Animated.spring(p.scale,   { toValue: 1, friction: 5,    useNativeDriver: true }),
          Animated.timing(p.x,       { toValue: p.dx, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(p.y,       { toValue: p.dy, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(450),
            Animated.timing(p.opacity, { toValue: 0, duration: 450, useNativeDriver: true }),
          ]),
        ]),
      ])
    );
    Animated.parallel(anims).start();
  }, [visible]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: '45%', left: '47%',
            width: p.size, height: p.circle ? p.size : p.size * 1.8,
            backgroundColor: p.color,
            borderRadius: p.circle ? p.size / 2 : 2,
            opacity: p.opacity,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { scale: p.scale },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  oldTier: Tier;
  newTier: Tier;
  onContinue: () => void;
}

export default function RankUpModal({ visible, oldTier, newTier, onContinue }: Props) {
  // Core animations
  const bgOpacity   = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(0.6)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const titleY      = useRef(new Animated.Value(24)).current;
  const titleOp     = useRef(new Animated.Value(0)).current;
  const badgeScale  = useRef(new Animated.Value(0)).current;
  const badgePulse  = useRef(new Animated.Value(1)).current;
  const oldTierOp   = useRef(new Animated.Value(0)).current;
  const arrowOp     = useRef(new Animated.Value(0)).current;
  // Pre-allocate 3 slots — max rewards any tier has (avoids hooks-in-loop violation)
  const r0Op = useRef(new Animated.Value(0)).current;
  const r1Op = useRef(new Animated.Value(0)).current;
  const r2Op = useRef(new Animated.Value(0)).current;
  const r0Y  = useRef(new Animated.Value(12)).current;
  const r1Y  = useRef(new Animated.Value(12)).current;
  const r2Y  = useRef(new Animated.Value(12)).current;
  const rewardsOp = [r0Op, r1Op, r2Op];
  const rewardsY  = [r0Y,  r1Y,  r2Y];
  const btnOp       = useRef(new Animated.Value(0)).current;
  const btnScale    = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (!visible) {
      // reset
      bgOpacity.setValue(0);
      cardScale.setValue(0.6); cardOpacity.setValue(0);
      titleY.setValue(24); titleOp.setValue(0);
      badgeScale.setValue(0); badgePulse.setValue(1);
      oldTierOp.setValue(0); arrowOp.setValue(0);
      rewardsOp.forEach((a) => a.setValue(0));
      rewardsY.forEach((a) => a.setValue(12));
      btnOp.setValue(0); btnScale.setValue(0.9);
      return;
    }

    // Phase 1 (0ms): background fades in
    Animated.timing(bgOpacity, { toValue: 0.93, duration: 300, useNativeDriver: true }).start();

    // Phase 2 (100ms): card springs in
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();

    // Phase 3 (300ms): "RANK UP!" slides in
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(titleY,  { toValue: 0, duration: 350, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(titleOp, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();

    // Phase 4 (450ms): badge bounces in
    Animated.sequence([
      Animated.delay(450),
      Animated.spring(badgeScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
    ]).start(() => {
      // Start pulsing after entrance
      Animated.loop(
        Animated.sequence([
          Animated.timing(badgePulse, { toValue: 1.1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(badgePulse, { toValue: 1,   duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    });

    // Phase 5 (650ms): old tier arrow appear
    Animated.sequence([
      Animated.delay(650),
      Animated.parallel([
        Animated.timing(oldTierOp, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(arrowOp,   { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
    ]).start();

    // Phase 6 (800ms+): rewards stagger in
    newTier.rewards.forEach((_, idx) => {
      Animated.sequence([
        Animated.delay(800 + idx * 120),
        Animated.parallel([
          Animated.timing(rewardsOp[idx], { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(rewardsY[idx],  { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start();
    });

    // Phase 7 (button): after all rewards
    const btnDelay = 900 + newTier.rewards.length * 120;
    Animated.sequence([
      Animated.delay(btnDelay),
      Animated.parallel([
        Animated.timing(btnOp,    { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(btnScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
      ]),
    ]).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Dark backdrop */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: bgOpacity }]} />

      {/* Particles */}
      <ParticleBurst visible={visible} color={newTier.color} />

      {/* Card */}
      <View style={s.center} pointerEvents="box-none">
        <Animated.View
          style={[s.card, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}
        >
          {/* "RANK UP!" header */}
          <Animated.Text
            style={[
              s.rankUpLabel,
              { color: newTier.color, transform: [{ translateY: titleY }], opacity: titleOp },
            ]}
          >
            RANK  UP!
          </Animated.Text>

          {/* Badge */}
          <Animated.View
            style={[
              s.badgeWrap,
              {
                borderColor: newTier.color,
                backgroundColor: newTier.glowColor,
                shadowColor: newTier.color,
                transform: [{ scale: Animated.multiply(badgeScale, badgePulse) }],
              },
            ]}
          >
            <Text style={s.badgeEmoji}>{newTier.emoji}</Text>
          </Animated.View>

          {/* New tier name */}
          <Text style={[s.tierName, { color: newTier.color }]}>{newTier.name}</Text>
          <Text style={[s.tierTitle, { color: newTier.color + 'CC' }]}>{newTier.title}</Text>

          {/* Promotion arrow */}
          <Animated.View style={[s.promotionRow, { opacity: oldTierOp }]}>
            <View style={s.oldTierChip}>
              <Text style={s.oldTierEmoji}>{oldTier.emoji}</Text>
              <Text style={[s.oldTierName, { color: oldTier.color }]}>{oldTier.name}</Text>
            </View>
            <Animated.Text style={[s.arrow, { opacity: arrowOp, color: newTier.color }]}>
              →
            </Animated.Text>
            <View style={[s.newTierChip, { borderColor: newTier.color + '60', backgroundColor: newTier.glowColor }]}>
              <Text style={s.oldTierEmoji}>{newTier.emoji}</Text>
              <Text style={[s.oldTierName, { color: newTier.color }]}>{newTier.name}</Text>
            </View>
          </Animated.View>

          {/* Divider */}
          <View style={[s.divider, { backgroundColor: newTier.color + '30' }]} />

          {/* Rewards */}
          <View style={s.rewardsWrap}>
            <Text style={s.rewardsHeader}>🏆 Unlocked</Text>
            {newTier.rewards.map((reward, idx) => (
              <Animated.View
                key={reward}
                style={[
                  s.rewardRow,
                  {
                    opacity: rewardsOp[idx],
                    transform: [{ translateY: rewardsY[idx] }],
                  },
                ]}
              >
                <Text style={[s.rewardDot, { color: newTier.color }]}>✦</Text>
                <Text style={s.rewardText}>{reward}</Text>
              </Animated.View>
            ))}
          </View>

          {/* Continue button */}
          <Animated.View style={{ width: '100%', opacity: btnOp, transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              onPress={onContinue}
              activeOpacity={0.85}
              style={[s.continueBtn, { backgroundColor: newTier.color }]}
            >
              <Text style={s.continueBtnText}>Continue →</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    backgroundColor: '#0D1B2E',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#1E3A5F',
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 24,
  },

  rankUpLabel: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  badgeWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
    elevation: 12,
  },
  badgeEmoji: { fontSize: 58 },

  tierName:  { fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  tierTitle: { fontSize: 14, fontWeight: '600', marginTop: -6 },

  promotionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  oldTierChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155',
  },
  newTierChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5,
  },
  oldTierEmoji: { fontSize: 16 },
  oldTierName:  { fontSize: 13, fontWeight: '700' },
  arrow: { fontSize: 22, fontWeight: '900' },

  divider: { width: '100%', height: 1, marginVertical: 2 },

  rewardsWrap: { width: '100%', gap: 8 },
  rewardsHeader: { fontSize: 13, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  rewardDot: { fontSize: 12, fontWeight: '900' },
  rewardText: { fontSize: 14, fontWeight: '600', color: '#E2E8F0', flex: 1 },

  continueBtn: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
});
