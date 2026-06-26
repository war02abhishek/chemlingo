import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { setPassword } from '../../core/curriculumApi';
import { Colors, Font, Radius } from '../../core/theme';
import FlaskyMascot from '../../core/components/FlaskyMascot';

export default function SetPasswordScreen({ onDone }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSet = async () => {
    if (pw.length < 6) {
      Alert.alert('Too Short', 'Password must be at least 6 characters.');
      return;
    }
    if (pw !== confirm) {
      Alert.alert('Mismatch', 'Passwords don\'t match. Please try again.');
      return;
    }
    setLoading(true);
    try {
      await setPassword(pw);
      onDone?.();
    } catch {
      Alert.alert('Error', 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <FlaskyMascot size={64} expression="happy" />
        <Text style={s.title}>Set Your Password</Text>
        <Text style={s.sub}>Your teacher set up this account. Please choose your own password before continuing.</Text>

        <TextInput
          style={s.input}
          placeholder="New password (min 6 chars)"
          placeholderTextColor={Colors.muted}
          value={pw}
          onChangeText={setPw}
          secureTextEntry
        />
        <TextInput
          style={s.input}
          placeholder="Confirm password"
          placeholderTextColor={Colors.muted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <TouchableOpacity
          style={[s.btn, (pw.length < 6 || loading) && s.btnDisabled]}
          onPress={handleSet}
          disabled={pw.length < 6 || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Set Password & Continue</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  title: { fontFamily: Font.display, fontSize: 22, color: Colors.ink, marginTop: 20, marginBottom: 8 },
  sub: { fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  input: {
    width: '100%', borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.card, padding: 14, fontFamily: Font.body,
    fontSize: 15, color: Colors.ink, backgroundColor: Colors.surface, marginBottom: 12,
  },
  btn: {
    width: '100%', backgroundColor: Colors.green, borderRadius: Radius.button,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontFamily: Font.display, fontSize: 15, color: '#fff' },
});
