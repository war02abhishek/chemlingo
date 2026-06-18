import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import useDrillStore from '../../../core/store/drillStore';

export default function ReactionMatcher({ drill }) {
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const startTime = useRef(Date.now());
  const submitAnswer = useDrillStore((s) => s.submitAnswer);

  const reactants = drill.question_data.reactants;
  const options = drill.question_data.options;

  const onOptionTap = (option) => {
    if (result !== null) return;
    const correct = drill.correct_answer.product;
    const isCorrect = option === correct;
    setSelected(option);
    setResult(isCorrect);
    submitAnswer({ isCorrect, timeTakenMs: Date.now() - startTime.current, answer: { selected: option } });
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.heading}>Match the reaction product</Text>

      <View style={s.reactantsRow}>
        {reactants.map((r) => (
          <View key={r} style={s.chip}><Text style={s.chipText}>{r}</Text></View>
        ))}
      </View>
      <Text style={s.arrow}>↓</Text>

      {options.map((opt) => {
        const isSelected = selected === opt;
        const bg = isSelected ? (result ? '#dcfce7' : '#fee2e2') : '#f3f4f6';
        const border = isSelected ? (result ? '#16a34a' : '#dc2626') : '#d1d5db';
        return (
          <TouchableOpacity key={opt} style={[s.option, { backgroundColor: bg, borderColor: border }]} onPress={() => onOptionTap(opt)}>
            <Text>{opt}</Text>
          </TouchableOpacity>
        );
      })}

      {result !== null && (
        <View style={[s.banner, { backgroundColor: result ? '#f0fdf4' : '#fef2f2' }]}>
          <Text style={{ color: result ? '#166534' : '#991b1b', fontWeight: '600' }}>
            {result ? '✅ Correct! +XP' : '❌ Incorrect — review this reaction'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24 },
  heading: { fontSize: 18, fontWeight: '600', marginBottom: 24 },
  reactantsRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { backgroundColor: '#e0e7ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontWeight: 'bold' },
  arrow: { textAlign: 'center', fontSize: 20, marginBottom: 24 },
  option: {
    borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12,
  },
  banner: { borderRadius: 12, padding: 16, marginTop: 8 },
});
