import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { joinBatch } from '../../core/curriculumApi';
import { Colors, Font, Radius } from '../../core/theme';
import FlaskyMascot from '../../core/components/FlaskyMascot';

export default function JoinBatchScreen({ onDone }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await joinBatch(trimmed);
      Alert.alert('Joined!', `You've been added to ${res.batch_name}.`, [
        { text: "Let's Go!", onPress: () => onDone?.() },
      ]);
    } catch {
      Alert.alert('Invalid Code', 'That batch code wasn\'t found. Check with your teacher.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <FlaskyMascot size={72} expression="happy" />
        <Text style={s.title}>Join Your Batch</Text>
        <Text style={s.sub}>Ask your teacher for the 6-character batch code and enter it below.</Text>

        <TextInput
          style={s.input}
          placeholder="e.g. A1B2C3"
          placeholderTextColor={Colors.muted}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={6}
        />

        <TouchableOpacity
          style={[s.btn, (!code.trim() || loading) && s.btnDisabled]}
          onPress={handleJoin}
          disabled={!code.trim() || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Join Batch</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.skip} onPress={() => onDone?.()}>
          <Text style={s.skipText}>Skip for now — I'll join later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  title: { fontFamily: Font.display, fontSize: 24, color: Colors.ink, marginTop: 20, marginBottom: 8 },
  sub: { fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  input: {
    width: '100%', borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.card, padding: 14, fontFamily: Font.display,
    fontSize: 22, color: Colors.ink, textAlign: 'center',
    backgroundColor: Colors.surface, letterSpacing: 4, marginBottom: 16,
  },
  btn: {
    width: '100%', backgroundColor: Colors.blue, borderRadius: Radius.button,
    padding: 16, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontFamily: Font.display, fontSize: 15, color: '#fff' },
  skip: { marginTop: 20 },
  skipText: { fontFamily: Font.body, fontSize: 13, color: Colors.muted },
});
