import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  hp: number;       // 0–100
  maxHp?: number;
  name: string;
  color: string;
  flipped?: boolean; // if true, bar shrinks from the left (opponent side)
}

const ANIM_DURATION = 600;

export function HealthBar({ hp, maxHp = 100, name, color, flipped = false }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animWidth = useSharedValue(0);

  // Animate bar width whenever hp or trackWidth changes.
  useEffect(() => {
    if (trackWidth <= 0) return;
    const targetWidth = Math.max(0, (hp / maxHp)) * trackWidth;
    animWidth.value = withTiming(targetWidth, { duration: ANIM_DURATION });
  }, [hp, maxHp, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({ width: animWidth.value }));

  const hpColor = hp > 50 ? color : hp > 25 ? '#F59E0B' : '#EF4444';

  return (
    <View style={[s.container, flipped && s.containerFlipped]}>
      <Text style={[s.name, flipped && s.nameRight]} numberOfLines={1}>
        {name}
      </Text>

      <View
        style={s.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            s.fill,
            { backgroundColor: hpColor },
            flipped && s.fillRight,
            fillStyle,
          ]}
        />
      </View>

      <Text style={[s.hp, flipped && s.hpRight]}>{Math.ceil(hp)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  containerFlipped: {
    flexDirection: 'row-reverse',
  },
  name: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    width: 56,
  },
  nameRight: {
    textAlign: 'right',
  },
  track: {
    flex: 1,
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
  },
  fillRight: {
    alignSelf: 'flex-end',
  },
  hp: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    width: 28,
    textAlign: 'right',
  },
  hpRight: {
    textAlign: 'left',
  },
});
