import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import useDrillStore from '../../../core/store/drillStore';

export default function ColorPrecipitateId({ drill }) {
  const { color_hex, color_name, options } = drill.question_data;
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const startTime = useRef(Date.now());
  const submitAnswer = useDrillStore((s) => s.submitAnswer);

  const onSelect = (opt) => {
    if (result !== null) return;
    const isCorrect = opt === drill.correct_answer.compound;
    setSelected(opt);
    setResult(isCorrect);
    submitAnswer({ isCorrect, timeTakenMs: Date.now() - startTime.current, answer: { selected: opt } });
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.heading}>Identify the compound</Text>

      <View style={[s.swatch, { backgroundColor: color_hex }]} />
      <Text style={s.colorName}>{color_name}</Text>

      {options.map((opt) => {
        const isSelected = selected === opt;
        const bg = isSelected ? (result ? '#dcfce7' : '#fee2e2') : '#f3f4f6';
        const border = isSelected ? (result ? '#16a34a' : '#dc2626') : '#d1d5db';
        return (
          <TouchableOpacity key={opt} style={[s.option, { backgroundColor: bg, borderColor: border }]} onPress={() => onSelect(opt)}>
            <Text>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, alignItems: 'stretch' },
  heading: { fontSize: 18, fontWeight: '600', marginBottom: 24 },
  swatch: {
    width: 120, height: 120, borderRadius: 60,
    alignSelf: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  colorName: { textAlign: 'center', color: '#888', fontSize: 16, marginBottom: 32 },
  option: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
});
