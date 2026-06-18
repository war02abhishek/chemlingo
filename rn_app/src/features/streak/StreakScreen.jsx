import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

const CARDS = [
  { label: 'Current Streak', value: '—', icon: '🔥' },
  { label: 'Best Streak', value: '—', icon: '🏆' },
  { label: 'Catalysts (Freezes)', value: '—', icon: '🧪' },
];

export default function StreakScreen() {
  return (
    <SafeAreaView style={s.safe}>
      <Text style={s.title}>Your Streak 🔥</Text>
      <View style={s.container}>
        {CARDS.map((card) => (
          <View key={card.label} style={s.card}>
            <Text style={s.icon}>{card.icon}</Text>
            <View>
              <Text style={s.label}>{card.label}</Text>
              <Text style={s.value}>{card.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', padding: 16 },
  container: { padding: 16, gap: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#f3f4f6', borderRadius: 16, padding: 20,
  },
  icon: { fontSize: 32 },
  label: { color: '#888', marginBottom: 2 },
  value: { fontSize: 28, fontWeight: 'bold' },
});
