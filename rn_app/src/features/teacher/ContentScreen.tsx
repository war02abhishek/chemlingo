import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Colors, Font, Radius } from '../../core/theme';
import { http } from '../../core/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Topic { id: string; title: string; slug: string }
interface Question {
  id: string; prompt: string; options: string[]; correct_index: number;
  explanation: string; concept: string; difficulty: string;
  game_modes: string[]; is_pyq: boolean; pyq_exam: string; pyq_year: number;
  status: string; topic_id: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchTopics(): Promise<Topic[]> {
  const { data } = await http.get<{ topics: { topic: Topic }[] }>('/api/v1/curriculum');
  return data.topics.map((t: any) => t.topic ?? t);
}

async function fetchQuestions(topicId: string, status: string): Promise<Question[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (topicId) params.set('topic_id', topicId);
  if (status) params.set('status', status);
  const { data } = await http.get<{ questions: Question[] }>(`/api/v1/teacher/questions?${params}`);
  return data.questions ?? [];
}

async function createQuestion(payload: object): Promise<void> {
  await http.post('/api/v1/teacher/questions', payload);
}

async function approveQuestion(id: string): Promise<void> {
  await http.put(`/api/v1/teacher/questions/${id}/approve`, {});
}

// ── Option editor row ─────────────────────────────────────────────────────────

function OptionRow({
  index, value, isCorrect, onChange, onMarkCorrect,
}: {
  index: number; value: string; isCorrect: boolean;
  onChange: (v: string) => void; onMarkCorrect: () => void;
}) {
  return (
    <View style={s.optionRow}>
      <TouchableOpacity
        style={[s.optionDot, isCorrect && s.optionDotCorrect]}
        onPress={onMarkCorrect}
      >
        <Text style={s.optionDotText}>{isCorrect ? '✓' : String.fromCharCode(65 + index)}</Text>
      </TouchableOpacity>
      <TextInput
        style={[s.optionInput, isCorrect && s.optionInputCorrect]}
        value={value}
        onChangeText={onChange}
        placeholder={`Option ${String.fromCharCode(65 + index)}`}
        placeholderTextColor="#aab"
      />
    </View>
  );
}

// ── Create question form ──────────────────────────────────────────────────────

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const GAME_MODES = ['lesson', 'duel', 'daily', 'boss'];

function CreateForm({ topics, onCreated }: { topics: Topic[]; onCreated: () => void }) {
  const [topicId, setTopicId]       = useState('');
  const [prompt, setPrompt]         = useState('');
  const [options, setOptions]       = useState(['', '', '', '']);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [concept, setConcept]       = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [gameModes, setGameModes]   = useState<string[]>(['lesson', 'duel', 'daily', 'boss']);
  const [isPYQ, setIsPYQ]           = useState(false);
  const [pyqExam, setPyqExam]       = useState('');
  const [pyqYear, setPyqYear]       = useState('');
  const [saving, setSaving]         = useState(false);

  const toggleMode = (m: string) => {
    setGameModes(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const handleSave = async (andApprove: boolean) => {
    if (!prompt.trim()) { Alert.alert('Required', 'Prompt cannot be empty'); return; }
    if (options.some(o => !o.trim())) { Alert.alert('Required', 'Fill all 4 options'); return; }
    if (!topicId) { Alert.alert('Required', 'Select a topic'); return; }

    setSaving(true);
    try {
      const payload = {
        type: 'mcq', topic_id: topicId, prompt: prompt.trim(),
        options, correct_index: correctIdx, explanation: explanation.trim(),
        concept: concept.trim(), difficulty, game_modes: gameModes,
        is_pyq: isPYQ, pyq_exam: isPYQ ? pyqExam : '',
        pyq_year: isPYQ && pyqYear ? parseInt(pyqYear, 10) : 0,
      };
      const { data } = await http.post<{ id: string }>('/api/v1/teacher/questions', payload);
      if (andApprove && data.id) {
        await approveQuestion(data.id);
      }
      Alert.alert('Saved', andApprove ? 'Question saved and approved!' : 'Question saved as draft.');
      // Reset
      setPrompt(''); setOptions(['', '', '', '']); setCorrectIdx(0);
      setExplanation(''); setConcept(''); setIsPYQ(false);
      setPyqExam(''); setPyqYear('');
      onCreated();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
      <Text style={s.formSection}>Topic</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
        {topics.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[s.chip, topicId === t.id && s.chipActive]}
            onPress={() => setTopicId(t.id)}
          >
            <Text style={[s.chipText, topicId === t.id && s.chipTextActive]}>{t.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.formSection}>Question prompt</Text>
      <TextInput
        style={[s.textArea]}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="e.g. H₂ + Cl₂ → ?"
        placeholderTextColor="#aab"
        multiline
        numberOfLines={3}
      />

      <Text style={s.formSection}>Options  <Text style={s.formHint}>(tap circle to mark correct)</Text></Text>
      {options.map((opt, i) => (
        <OptionRow
          key={i} index={i} value={opt} isCorrect={correctIdx === i}
          onChange={v => setOptions(prev => { const n = [...prev]; n[i] = v; return n; })}
          onMarkCorrect={() => setCorrectIdx(i)}
        />
      ))}

      <Text style={s.formSection}>Explanation</Text>
      <TextInput
        style={s.textArea}
        value={explanation}
        onChangeText={setExplanation}
        placeholder="Why is this the correct answer?"
        placeholderTextColor="#aab"
        multiline
        numberOfLines={2}
      />

      <Text style={s.formSection}>Concept tag  <Text style={s.formHint}>(e.g. Neutralisation)</Text></Text>
      <TextInput style={s.input} value={concept} onChangeText={setConcept} placeholder="concept" placeholderTextColor="#aab" />

      <Text style={s.formSection}>Difficulty</Text>
      <View style={s.chipRow}>
        {DIFFICULTIES.map(d => (
          <TouchableOpacity key={d} style={[s.chip, difficulty === d && s.chipActive]} onPress={() => setDifficulty(d)}>
            <Text style={[s.chipText, difficulty === d && s.chipTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.formSection}>Game modes</Text>
      <View style={s.chipRow}>
        {GAME_MODES.map(m => (
          <TouchableOpacity key={m} style={[s.chip, gameModes.includes(m) && s.chipActive]} onPress={() => toggleMode(m)}>
            <Text style={[s.chipText, gameModes.includes(m) && s.chipTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.pyqRow}>
        <Text style={s.formSection}>PYQ (past year)?</Text>
        <Switch value={isPYQ} onValueChange={setIsPYQ} trackColor={{ true: Colors.blue }} />
      </View>
      {isPYQ && (
        <View style={{ gap: 8 }}>
          <TextInput style={s.input} value={pyqExam} onChangeText={setPyqExam} placeholder="JEE Main / JEE Advanced / NEET" placeholderTextColor="#aab" />
          <TextInput style={s.input} value={pyqYear} onChangeText={setPyqYear} placeholder="Year (e.g. 2023)" placeholderTextColor="#aab" keyboardType="number-pad" />
        </View>
      )}

      <View style={s.saveRow}>
        <TouchableOpacity style={[s.saveBtn, s.saveDraft]} onPress={() => handleSave(false)} disabled={saving}>
          <Text style={s.saveDraftText}>{saving ? '…' : 'Save Draft'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.saveBtn, s.saveApprove]} onPress={() => handleSave(true)} disabled={saving}>
          <Text style={s.saveApproveText}>{saving ? '…' : 'Save & Approve'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Question list ─────────────────────────────────────────────────────────────

function QuestionList({
  questions, onApprove, loading,
}: { questions: Question[]; onApprove: (id: string) => void; loading: boolean }) {
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={Colors.blue} />;
  if (!questions.length) return <Text style={s.emptyText}>No questions found.</Text>;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      {questions.map(q => (
        <View key={q.id} style={s.qCard}>
          <View style={s.qHeader}>
            <View style={[s.statusDot, q.status === 'approved' ? s.statusApproved : s.statusDraft]} />
            <Text style={s.qStatus}>{q.status}</Text>
            <View style={{ flex: 1 }} />
            {q.is_pyq && (
              <View style={s.pyqBadge}><Text style={s.pyqBadgeText}>{q.pyq_exam} {q.pyq_year}</Text></View>
            )}
          </View>
          <Text style={s.qPrompt}>{q.prompt}</Text>
          {q.options?.map((opt, i) => (
            <Text key={i} style={[s.qOption, i === q.correct_index && s.qOptionCorrect]}>
              {String.fromCharCode(65 + i)}. {opt}
            </Text>
          ))}
          {q.explanation ? <Text style={s.qExplanation}>💡 {q.explanation}</Text> : null}
          <View style={s.qFooter}>
            <Text style={s.qMeta}>{q.concept}  ·  {q.difficulty}</Text>
            {q.status !== 'approved' && (
              <TouchableOpacity style={s.approveBtn} onPress={() => onApprove(q.id)}>
                <Text style={s.approveBtnText}>✓ Approve</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ContentScreen() {
  const [tab, setTab]           = useState<'create' | 'review'>('review');
  const [topics, setTopics]     = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filterTopic, setFilterTopic] = useState('');
  const [filterStatus, setFilterStatus] = useState('draft');
  const [loading, setLoading]   = useState(false);

  const loadTopics = useCallback(async () => {
    try { setTopics(await fetchTopics()); } catch {}
  }, []);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try { setQuestions(await fetchQuestions(filterTopic, filterStatus)); }
    catch { setQuestions([]); }
    finally { setLoading(false); }
  }, [filterTopic, filterStatus]);

  useEffect(() => { loadTopics(); }, []);
  useEffect(() => { if (tab === 'review') loadQuestions(); }, [tab, filterTopic, filterStatus]);

  const handleApprove = async (id: string) => {
    try {
      await approveQuestion(id);
      setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'approved' } : q));
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? e.message);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Content</Text>
        <Text style={s.headerSub}>Question bank</Text>
      </View>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        {(['review', 'create'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {t === 'review' ? '📋 Review' : '✏️ Create'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'create' ? (
        <CreateForm topics={topics} onCreated={() => setTab('review')} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Filters */}
          <View style={s.filterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(['', ...topics.map(t => t.id)]).map((tid, i) => (
                <TouchableOpacity
                  key={tid || 'all'}
                  style={[s.filterChip, filterTopic === tid && s.filterChipActive]}
                  onPress={() => setFilterTopic(tid)}
                >
                  <Text style={[s.filterChipText, filterTopic === tid && s.filterChipTextActive]}>
                    {tid ? topics.find(t => t.id === tid)?.title : 'All topics'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {['draft', 'approved', ''].map(st => (
                <TouchableOpacity
                  key={st || 'all'}
                  style={[s.filterChip, filterStatus === st && s.filterChipActive]}
                  onPress={() => setFilterStatus(st)}
                >
                  <Text style={[s.filterChipText, filterStatus === st && s.filterChipTextActive]}>
                    {st || 'All statuses'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <QuestionList questions={questions} onApprove={handleApprove} loading={loading} />
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e9edf5' },
  headerTitle: { fontFamily: Font.display, fontSize: 22, color: '#16204a' },
  headerSub: { fontFamily: Font.body, fontSize: 13, color: '#8892a4' },

  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', gap: 10, borderBottomWidth: 1, borderBottomColor: '#e9edf5' },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: Radius.chip, borderWidth: 1, borderColor: '#e9edf5', alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  tabBtnText: { fontFamily: Font.body, fontSize: 14, color: '#8892a4' },
  tabBtnTextActive: { color: '#fff' },

  // Form
  formScroll: { padding: 16, gap: 4 },
  formSection: { fontFamily: Font.display, fontSize: 14, color: '#16204a', marginTop: 14, marginBottom: 4 },
  formHint: { fontFamily: Font.body, fontSize: 12, color: '#8892a4' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9edf5', borderRadius: Radius.chip, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Font.body, fontSize: 14, color: '#16204a' },
  textArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9edf5', borderRadius: Radius.chip, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Font.body, fontSize: 14, color: '#16204a', minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e9edf5', backgroundColor: '#fff' },
  chipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  chipText: { fontFamily: Font.body, fontSize: 13, color: '#8892a4' },
  chipTextActive: { color: '#fff' },

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  optionDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#e9edf5', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  optionDotCorrect: { backgroundColor: Colors.green, borderColor: Colors.green },
  optionDotText: { fontFamily: Font.display, fontSize: 12, color: '#8892a4' },
  optionInput: { flex: 1, borderWidth: 1, borderColor: '#e9edf5', borderRadius: Radius.chip, paddingHorizontal: 12, paddingVertical: 8, fontFamily: Font.body, fontSize: 14, color: '#16204a', backgroundColor: '#fff' },
  optionInputCorrect: { borderColor: Colors.green },

  pyqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },

  saveRow: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 40 },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.button, alignItems: 'center' },
  saveDraft: { backgroundColor: '#f0f2f8', borderWidth: 1, borderColor: '#e9edf5' },
  saveApprove: { backgroundColor: Colors.green },
  saveDraftText: { fontFamily: Font.display, fontSize: 15, color: '#16204a' },
  saveApproveText: { fontFamily: Font.display, fontSize: 15, color: '#fff' },

  // Filter bar
  filterBar: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e9edf5' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#e9edf5', marginRight: 8, backgroundColor: '#fff' },
  filterChipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  filterChipText: { fontFamily: Font.body, fontSize: 12, color: '#8892a4' },
  filterChipTextActive: { color: '#fff' },

  emptyText: { textAlign: 'center', marginTop: 60, fontFamily: Font.body, fontSize: 14, color: '#8892a4' },

  // Question cards
  qCard: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12, borderRadius: Radius.card, padding: 14, borderWidth: 1, borderColor: '#e9edf5' },
  qHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusApproved: { backgroundColor: Colors.green },
  statusDraft: { backgroundColor: Colors.amber },
  qStatus: { fontFamily: Font.body, fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: 0.4 },
  pyqBadge: { backgroundColor: '#eef0ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  pyqBadgeText: { fontFamily: Font.body, fontSize: 11, color: Colors.blue },
  qPrompt: { fontFamily: Font.display, fontSize: 15, color: '#16204a', marginBottom: 8 },
  qOption: { fontFamily: Font.body, fontSize: 13, color: '#8892a4', paddingVertical: 2 },
  qOptionCorrect: { color: Colors.green, fontFamily: Font.display },
  qExplanation: { fontFamily: Font.body, fontSize: 12, color: '#8892a4', marginTop: 6, fontStyle: 'italic' },
  qFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  qMeta: { fontFamily: Font.body, fontSize: 12, color: '#aab4cc' },
  approveBtn: { backgroundColor: Colors.green, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  approveBtnText: { fontFamily: Font.display, fontSize: 12, color: '#fff' },
});
