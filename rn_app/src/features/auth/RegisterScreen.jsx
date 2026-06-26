import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, SafeAreaView, ScrollView,
} from 'react-native';
import { register } from '../../core/api';

export default function RegisterScreen({ navigation, onLoginSuccess }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState('student');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handleRegister = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await register(name.trim(), email.trim(), password, role);
      const resolvedRole = data.student?.role ?? role;
      onLoginSuccess?.(resolvedRole);
    } catch (e) {
      const msg = e?.response?.data?.error ?? 'Registration failed';
      setError(msg === 'email already registered' ? 'That email is already registered' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>🧪 Flasky</Text>
        <Text style={s.subtitle}>Create your account</Text>

        <TextInput
          style={s.input}
          placeholder="Full name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={s.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={s.input}
          placeholder="Password (min 6 chars)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Text style={s.roleLabel}>I am a</Text>
        <View style={s.roleRow}>
          <TouchableOpacity
            style={[s.roleBtn, role === 'student' && s.roleBtnActive]}
            onPress={() => setRole('student')}
          >
            <Text style={[s.roleBtnText, role === 'student' && s.roleBtnTextActive]}>Student</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.roleBtn, role === 'teacher' && s.roleBtnActive]}
            onPress={() => setRole('teacher')}
          >
            <Text style={[s.roleBtnText, role === 'teacher' && s.roleBtnTextActive]}>Teacher</Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={s.error}>{error}</Text>}

        <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.loginLink} onPress={() => navigation?.goBack()}>
          <Text style={s.loginLinkText}>Already have an account? <Text style={s.loginLinkBold}>Log in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title:     { fontSize: 32, fontWeight: 'bold', marginBottom: 4 },
  subtitle:  { color: '#888', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, marginBottom: 14, fontSize: 16,
  },
  roleLabel: { fontSize: 14, color: '#555', marginBottom: 10 },
  roleRow:   { flexDirection: 'row', gap: 12, marginBottom: 20 },
  roleBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  roleBtnActive:     { borderColor: '#2fc665', backgroundColor: '#f0fdf4' },
  roleBtnText:       { fontSize: 15, color: '#888', fontWeight: '600' },
  roleBtnTextActive: { color: '#2fc665' },
  error: { color: 'red', marginBottom: 10, fontSize: 14 },
  btn: {
    backgroundColor: '#2fc665', borderRadius: 10,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  btnText:       { color: '#fff', fontWeight: '600', fontSize: 16 },
  loginLink:     { marginTop: 20, alignItems: 'center' },
  loginLinkText: { color: '#888', fontSize: 14 },
  loginLinkBold: { color: '#2fc665', fontWeight: '700' },
});
