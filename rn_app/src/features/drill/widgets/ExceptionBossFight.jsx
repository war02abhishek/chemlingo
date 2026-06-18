import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import useDrillStore from '../../../core/store/drillStore';

const TOTAL = 60;

export default function ExceptionBossFight({ drill }) {
  const { question, options } = drill.question_data;
  const [remaining, setRemaining] = useState(TOTAL);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const startTime = useRef(Date.now());
  const submitAnswer = useDrillStore((s) => s.submitAnswer);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          // timeout — only submit if not already answered
          setResult((prev) => {
            if (prev === null) {
              submitAnswer({ isCorrect: false, timeTakenMs: TOTAL * 1000, answer: { selected: null, timeout: true } });
              return false;
            }
            return prev;
          });
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const onSelect = (opt) => {
    if (result !== null) return;
    const isCorrect = opt === drill.correct_answer.exception;
    setSelected(opt);
    setResult(isCorrect);
    submitAnswer({ isCorrect, timeTakenMs: Date.now() - startTime.current, answer: { selected: opt } });
  };

  const timerColor = remaining <= 10 ? '#dc2626' : '#16a34a';
  const progress = remaining / TOTAL;

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.topRow}>
        <Text style={s.bossLabel}>⚡ Boss Fight</Text>
        <View style={[s.timerBadge, { backgroundColor: timerColor + '22' }]}>
          <Text style={[s.timerText, { color: timerColor }]}>{remaining}s</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.track}>
        <View style={[s.fill, { width: `${progress * 100}%`, backgroundColor: timerColor }]} />
      </View>

      <Text style={s.question}>{question}</Text>

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

      {result === false && selected === null && (
        <Text style={s.timeout}>⏰ Time's up!</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bossLabel: { fontSize: 18, fontWeight: 'bold', color: '#ea580c' },
  timerBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  timerText: { fontWeight: 'bold' },
  track: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden', marginBottom: 32 },
  fill: { height: '100%', borderRadius: 4 },
  question: { fontSize: 16, marginBottom: 24 },
  option: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  timeout: { color: '#dc2626', fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
});
