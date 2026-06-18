import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import useDrillStore from '../../../core/store/drillStore';

export default function TrendSlider({ drill }) {
  const property = drill.question_data.property;
  const [items, setItems] = useState(() => [...drill.question_data.elements].sort(() => Math.random() - 0.5));
  const [result, setResult] = useState(null);
  const startTime = useRef(Date.now());
  const submitAnswer = useDrillStore((s) => s.submitAnswer);

  const checkAnswer = () => {
    const correct = drill.correct_answer.order;
    const isCorrect = items.join(',') === correct.join(',');
    setResult(isCorrect);
    submitAnswer({ isCorrect, timeTakenMs: Date.now() - startTime.current, answer: { order: items } });
  };

  return (
    <View style={s.container}>
      <Text style={s.heading}>Arrange by {property} (lowest → highest)</Text>
      <Text style={s.sub}>Long-press and drag to reorder</Text>

      <DraggableFlatList
        data={items.map((el, i) => ({ key: el, label: el, index: i }))}
        keyExtractor={(item) => item.key}
        onDragEnd={({ data }) => {
          if (result !== null) return;
          setItems(data.map((d) => d.label));
        }}
        renderItem={({ item, drag, isActive }) => (
          <ScaleDecorator>
            <TouchableOpacity onLongPress={drag} style={[s.row, isActive && s.rowActive]}>
              <View style={s.badge}><Text style={s.badgeText}>{item.index + 1}</Text></View>
              <Text style={s.rowText}>{item.label}</Text>
              <Text style={s.handle}>☰</Text>
            </TouchableOpacity>
          </ScaleDecorator>
        )}
      />

      {result === null ? (
        <TouchableOpacity style={s.btn} onPress={checkAnswer}>
          <Text style={s.btnText}>Submit Order</Text>
        </TouchableOpacity>
      ) : (
        <View style={[s.banner, { backgroundColor: result ? '#f0fdf4' : '#fef2f2' }]}>
          <Text style={{ color: result ? '#166534' : '#991b1b' }}>
            {result ? '✅ Correct order!' : '❌ Wrong order — check the trend'}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  heading: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  sub: { color: '#888', marginBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb',
    borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  rowActive: { backgroundColor: '#e0e7ff' },
  badge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366F1',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  rowText: { flex: 1, fontWeight: '600' },
  handle: { color: '#aaa', fontSize: 18 },
  btn: {
    backgroundColor: '#6366F1', borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  banner: { borderRadius: 12, padding: 16, marginTop: 8 },
});
