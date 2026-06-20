import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  chipMax: number;      // how many chips to render (1 … chipMax)
  onChipPress: (value: number) => void;
  disabled?: boolean;   // locks all chips (e.g. player already solved the round)
}

function Chip({
  value,
  onPress,
  disabled,
}: {
  value: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (disabled) return;
    // Tactile pop animation
    scale.value = withSequence(
      withTiming(0.88, { duration: 80 }),
      withTiming(1.08, { duration: 80 }),
      withTiming(1, { duration: 60 }),
    );
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={disabled ? 1 : 0.8}>
      <Animated.View style={[s.chip, disabled && s.chipDisabled, animStyle]}>
        <Text style={[s.chipText, disabled && s.chipTextDisabled]}>{value}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function NumberChips({ chipMax, onChipPress, disabled = false }: Props) {
  const values = Array.from({ length: chipMax }, (_, i) => i + 1);

  return (
    <View style={s.grid}>
      {values.map((n) => (
        <Chip
          key={n}
          value={n}
          onPress={() => onChipPress(n)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

const CHIP_SIZE = 56;

const s = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  chipDisabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  chipText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chipTextDisabled: {
    color: '#9CA3AF',
  },
});
