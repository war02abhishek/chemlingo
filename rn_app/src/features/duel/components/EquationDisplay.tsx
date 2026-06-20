import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Equation } from '../../../types/duel';

interface Props {
  equation: Equation;
  slots: (number | null)[];
  activeSlotIndex: number | null;
  onSlotPress: (index: number) => void;
}

export interface EquationDisplayRef {
  /** Plays a shake animation — call on wrong answer. */
  shake: () => void;
  /** Plays a green-flash animation — call on correct answer. */
  flash: () => void;
}

const SHAKE_AMPLITUDE = 8;
const SHAKE_DURATION = 60;

export const EquationDisplay = forwardRef<EquationDisplayRef, Props>(
  ({ equation, slots, activeSlotIndex, onSlotPress }, ref) => {
    const translateX = useSharedValue(0);
    const flashOpacity = useSharedValue(0);

    useImperativeHandle(ref, () => ({
      shake() {
        translateX.value = withSequence(
          withTiming(-SHAKE_AMPLITUDE, { duration: SHAKE_DURATION }),
          withTiming(SHAKE_AMPLITUDE, { duration: SHAKE_DURATION }),
          withTiming(-SHAKE_AMPLITUDE, { duration: SHAKE_DURATION }),
          withTiming(SHAKE_AMPLITUDE, { duration: SHAKE_DURATION }),
          withTiming(0, { duration: SHAKE_DURATION }),
        );
      },
      flash() {
        flashOpacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withTiming(0, { duration: 500 }),
        );
      },
    }));

    const rowStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    const flashStyle = useAnimatedStyle(() => ({
      opacity: flashOpacity.value,
    }));

    const elements: React.ReactNode[] = [];
    equation.labels.forEach((label, i) => {
      // Insert → separator before product slots
      if (i === equation.separator_idx) {
        elements.push(
          <Text key="arrow" style={s.arrow}>→</Text>,
        );
      } else if (i > 0) {
        elements.push(
          <Text key={`plus${i}`} style={s.operator}>+</Text>,
        );
      }

      const value = slots[i];
      const isActive = activeSlotIndex === i;
      const isEmpty = value === null;

      elements.push(
        <View key={`term${i}`} style={s.term}>
          <TouchableOpacity
            style={[s.slot, isActive && s.slotActive, !isEmpty && s.slotFilled]}
            onPress={() => onSlotPress(i)}
            activeOpacity={0.7}
          >
            <Text style={[s.slotValue, isEmpty && s.slotPlaceholder]}>
              {isEmpty ? '?' : String(value)}
            </Text>
          </TouchableOpacity>
          <Text style={s.label}>{label}</Text>
        </View>,
      );
    });

    return (
      <View style={s.wrapper}>
        {/* Green correct-answer flash overlay */}
        <Animated.View style={[s.flashOverlay, flashStyle]} pointerEvents="none" />

        <Animated.View style={[s.row, rowStyle]}>
          {elements}
        </Animated.View>

        <Text style={s.hint}>Tap a box, then tap a number chip</Text>
      </View>
    );
  },
);

EquationDisplay.displayName = 'EquationDisplay';

const s = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  term: {
    alignItems: 'center',
    gap: 4,
  },
  slot: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotActive: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
    // shadow for depth
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  slotFilled: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  slotValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  slotPlaceholder: {
    color: '#9CA3AF',
    fontWeight: '400',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
  },
  operator: {
    fontSize: 20,
    fontWeight: '300',
    color: '#9CA3AF',
    paddingBottom: 20, // align with slot baseline
  },
  arrow: {
    fontSize: 22,
    fontWeight: '300',
    color: '#6366F1',
    paddingBottom: 20,
    marginHorizontal: 4,
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: '#9CA3AF',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#10B981',
    borderRadius: 16,
    zIndex: 1,
  },
});
