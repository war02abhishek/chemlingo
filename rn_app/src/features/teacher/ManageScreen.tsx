import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import {
  fetchBatches, createBatch, addStudentToBatch,
  getBatchCurriculum, advanceTopic, pauseTopic, extendTopic,
  BatchRow, TopicSequenceRow,
} from '../../core/teacherApi';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';

// ── Topic card ────────────────────────────────────────────────────────────────

function TopicCard({
  topic, onAdvance, onPause, onExtend, actionLoading,
}: {
  topic: TopicSequenceRow;
  onAdvance: () => void;
  onPause: () => void;
  onExtend: () => void;
  actionLoading: boolean;
}) {
  if (topic.status === 'done') {
    return (
      <View style={tc.row}>
        <Text style={tc.icon}>{topic.icon}</Text>
        <Text style={tc.title} numberOfLines={1}>{topic.title}</Text>
        <View style={tc.donePill}>
          <Text style={tc.doneText}>✓ Done</Text>
        </View>
      </View>
    );
  }

  if (topic.status === 'locked') {
    return (
      <View style={[tc.row, tc.lockedRow]}>
        <Text style={[tc.icon, { opacity: 0.35 }]}>{topic.icon}</Text>
        <Text style={[tc.title, { color: Colors.muted }]} numberOfLines={1}>{topic.title}</Text>
        <Text style={{ fontSize: 14 }}>🔒</Text>
      </View>
    );
  }

  // current
  const hasSchedule = topic.day_total > 0;
  const pct = hasSchedule ? Math.min(topic.day_current / topic.day_total, 1) : 0;
  const dayLabel = hasSchedule ? `Day ${topic.day_current} of ${topic.day_total}` : 'In Progress';

  return (
    <View style={tc.currentCard}>
      <View style={tc.currentHeader}>
        <Text style={tc.icon}>{topic.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={tc.currentTitle}>{topic.title}</Text>
          <Text style={tc.dayLabel}>{dayLabel}</Text>
        </View>
        <View style={[tc.statusPill, topic.paused ? tc.pausedPill : tc.activePill]}>
          <Text style={[tc.statusText, topic.paused ? tc.pausedText : tc.activeText]}>
            {topic.paused ? 'Paused' : 'Active'}
          </Text>
        </View>
      </View>

      {hasSchedule && (
        <View style={tc.progressTrack}>
          <View style={[tc.progressFill, { width: `${Math.round(pct * 100)}%` as any }]} />
        </View>
      )}

      <View style={tc.actions}>
        <TouchableOpacity
          style={tc.actionBtn}
          onPress={onPause}
          disabled={actionLoading}
          activeOpacity={0.7}
        >
          <Text style={tc.actionBtnText}>{topic.paused ? '▶ Resume' : '⏸ Pause'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={tc.actionBtn}
          onPress={onExtend}
          disabled={actionLoading}
          activeOpacity={0.7}
        >
          <Text style={tc.actionBtnText}>+2 Days</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[tc.actionBtn, tc.advanceBtn, Shadow3D(Colors.blueDark), topic.paused && { opacity: 0.4 }]}
          onPress={topic.paused ? () => Alert.alert('Batch Paused', 'Resume the batch before advancing to the next topic.') : onAdvance}
          disabled={actionLoading}
          activeOpacity={0.7}
        >
          {actionLoading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={tc.advanceText}>→ Next Topic</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const tc = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 14, marginBottom: 8,
  },
  lockedRow: { opacity: 0.65 },
  icon: { fontSize: 20 },
  title: { flex: 1, fontFamily: Font.body, fontSize: 14, color: Colors.ink },
  donePill: {
    backgroundColor: Colors.green + '20', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  doneText: { fontFamily: Font.display, fontSize: 12, color: Colors.green },

  currentCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 16, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: Colors.blue,
  },
  currentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  currentTitle: { fontFamily: Font.display, fontSize: 14, color: Colors.ink },
  dayLabel: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  activePill: { backgroundColor: Colors.green + '20' },
  pausedPill: { backgroundColor: Colors.amber + '30' },
  statusText: { fontFamily: Font.display, fontSize: 11 },
  activeText: { color: Colors.green },
  pausedText: { color: Colors.amber },
  progressTrack: {
    height: 5, backgroundColor: Colors.border, borderRadius: 99,
    overflow: 'hidden', marginBottom: 14,
  },
  progressFill: { height: 5, backgroundColor: Colors.blue, borderRadius: 99 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.button,
    paddingVertical: 9, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  actionBtnText: { fontFamily: Font.body, fontSize: 12, color: Colors.ink },
  advanceBtn: {
    backgroundColor: Colors.blue, borderWidth: 0,
  },
  advanceText: { fontFamily: Font.display, fontSize: 12, color: '#fff' },
});

// ── Batch card ────────────────────────────────────────────────────────────────

function BatchCard({
  b, selected, onSelect, onAddStudent,
}: {
  b: BatchRow;
  selected: boolean;
  onSelect: () => void;
  onAddStudent: () => void;
}) {
  return (
    <TouchableOpacity
      style={[bc.card, selected && bc.selectedCard]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View style={[bc.icon, selected && bc.selectedIcon]}>
        <Text style={bc.iconText}>🏫</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={bc.name}>{b.name}</Text>
        <Text style={bc.meta}>{b.student_count} student{b.student_count !== 1 ? 's' : ''}</Text>
      </View>
      <TouchableOpacity style={bc.addBtn} onPress={onAddStudent}>
        <Text style={bc.addBtnText}>+ Student</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const bc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 14,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  selectedCard: { borderColor: Colors.blue + '50', backgroundColor: Colors.blue + '06' },
  icon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.blue + '18', justifyContent: 'center', alignItems: 'center',
  },
  selectedIcon: { backgroundColor: Colors.blue + '30' },
  iconText: { fontSize: 20 },
  name: { fontFamily: Font.display, fontSize: 14, color: Colors.ink },
  meta: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.blue + '15', borderRadius: Radius.button,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  addBtnText: { fontFamily: Font.body, fontSize: 12, color: Colors.blue },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ManageScreen({ onLogout }: { onLogout?: () => void }) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [curriculum, setCurriculum] = useState<TopicSequenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showBatchSwitcher, setShowBatchSwitcher] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [addTarget, setAddTarget] = useState<{ id: string; name: string } | null>(null);
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const rows = await fetchBatches();
      setBatches(rows);
      if (rows.length > 0 && !selectedBatchId) {
        setSelectedBatchId(rows[0].id);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBatchId]);

  const loadCurriculum = useCallback(async (batchId: string) => {
    setCurriculumLoading(true);
    try {
      const topics = await getBatchCurriculum(batchId);
      setCurriculum(topics);
    } catch {
      setCurriculum([]);
    } finally {
      setCurriculumLoading(false);
    }
  }, []);

  useEffect(() => { loadBatches(); }, []);
  useEffect(() => {
    if (selectedBatchId) loadCurriculum(selectedBatchId);
  }, [selectedBatchId]);

  const handleAdvance = async () => {
    if (!selectedBatchId) return;
    setActionLoading(true);
    try {
      await advanceTopic(selectedBatchId);
      await loadCurriculum(selectedBatchId);
      await loadBatches();
    } catch (e: any) {
      Alert.alert('Cannot Advance', e?.response?.data?.error ?? 'Already at the last topic.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    if (!selectedBatchId) return;
    setActionLoading(true);
    try {
      await pauseTopic(selectedBatchId);
      await loadCurriculum(selectedBatchId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!selectedBatchId) return;
    setActionLoading(true);
    try {
      await extendTopic(selectedBatchId);
      await loadCurriculum(selectedBatchId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddStudent = async () => {
    if (!addTarget || !addEmail.trim()) return;
    setAdding(true);
    try {
      const result = await addStudentToBatch(addTarget.id, addEmail.trim().toLowerCase());
      setAddEmail('');
      setAddTarget(null);
      loadBatches();
      if (result.created && result.temp_password) {
        Alert.alert(
          'Account Created',
          `No account found for that email, so one was created.\n\nTemp password: ${result.temp_password}\n\nShare this with the student.`,
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert('Error', 'Could not add student. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createBatch(newName.trim());
      setNewName('');
      setShowCreate(false);
      loadBatches();
    } catch {
      Alert.alert('Error', 'Could not create batch. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  const hasAnyCurrentOrDone = curriculum.some((t) => t.status === 'current' || t.status === 'done');

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Manage</Text>
          <Text style={s.headerSub}>Batches & curriculum</Text>
        </View>
        <View style={s.headerRight}>
          {batches.length > 0 && (
            <TouchableOpacity style={s.batchPill} onPress={() => setShowBatchSwitcher(true)}>
              <Text style={s.batchPillText} numberOfLines={1}>{selectedBatch?.name ?? 'Select'}</Text>
              <Text style={s.batchChevron}> ▾</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.createBtn, Shadow3D(Colors.blueDark)]}
            onPress={() => setShowCreate(true)}
          >
            <Text style={s.createBtnText}>+ Batch</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadBatches(); if (selectedBatchId) loadCurriculum(selectedBatchId); }}
            tintColor={Colors.blue}
          />
        }
      >
        {batches.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🏫</Text>
            <Text style={s.emptyTitle}>No batches yet</Text>
            <Text style={s.emptySub}>Create your first batch to start managing your curriculum.</Text>
          </View>
        ) : (
          <>
            {/* Curriculum section */}
            {selectedBatch && (
              <View style={s.section}>
                <View style={s.syllabusHeader}>
                  <Text style={s.sectionTitle}>Syllabus</Text>
                  {selectedBatch.batch_code ? (
                    <View style={s.batchCodePill}>
                      <Text style={s.batchCodeLabel}>Join code  </Text>
                      <Text style={s.batchCodeValue}>{selectedBatch.batch_code}</Text>
                    </View>
                  ) : null}
                </View>
                {curriculumLoading ? (
                  <View style={s.curriculumLoader}>
                    <ActivityIndicator color={Colors.blue} />
                  </View>
                ) : curriculum.length === 0 ? (
                  <View style={s.curriculumEmpty}>
                    <Text style={s.curriculumEmptyText}>No topics loaded yet.</Text>
                  </View>
                ) : (
                  <>
                    {!hasAnyCurrentOrDone && (
                      <View style={s.startBanner}>
                        <Text style={s.startBannerText}>No topic assigned yet</Text>
                        <TouchableOpacity
                          style={[s.startBtn, Shadow3D(Colors.blueDark)]}
                          onPress={handleAdvance}
                          disabled={actionLoading}
                        >
                          {actionLoading
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={s.startBtnText}>▶ Start Curriculum</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    )}
                    {curriculum.map((topic) => (
                      <TopicCard
                        key={topic.id}
                        topic={topic}
                        onAdvance={handleAdvance}
                        onPause={handlePause}
                        onExtend={handleExtend}
                        actionLoading={actionLoading}
                      />
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Batches section */}
            <Text style={s.sectionTitle}>Batches</Text>
            {batches.map((b) => (
              <BatchCard
                key={b.id}
                b={b}
                selected={b.id === selectedBatchId}
                onSelect={() => setSelectedBatchId(b.id)}
                onAddStudent={() => setAddTarget({ id: b.id, name: b.name })}
              />
            ))}
          </>
        )}

        {onLogout && (
          <TouchableOpacity style={s.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
            <Text style={s.logoutText}>Log Out</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Batch switcher modal */}
      <Modal visible={showBatchSwitcher} transparent animationType="slide" onRequestClose={() => setShowBatchSwitcher(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Switch Batch</Text>
            {batches.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[s.switcherRow, b.id === selectedBatchId && s.switcherRowActive]}
                onPress={() => { setSelectedBatchId(b.id); setShowBatchSwitcher(false); }}
              >
                <Text style={s.switcherName}>{b.name}</Text>
                <Text style={s.switcherMeta}>{b.student_count} students</Text>
                {b.id === selectedBatchId && <Text style={s.switcherCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowBatchSwitcher(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add student modal */}
      <Modal visible={!!addTarget} transparent animationType="slide" onRequestClose={() => setAddTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Add Student to {addTarget?.name}</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Student email address"
              placeholderTextColor={Colors.muted}
              value={addEmail}
              onChangeText={setAddEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setAddTarget(null); setAddEmail(''); }}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, Shadow3D(Colors.blueDark)]}
                onPress={handleAddStudent}
                disabled={adding}
              >
                {adding
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmText}>Add</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create batch modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Create Batch</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Batch name (e.g. JEE 2025 A)"
              placeholderTextColor={Colors.muted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowCreate(false); setNewName(''); }}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, Shadow3D(Colors.blueDark)]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmText}>Create</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontFamily: Font.display, fontSize: 22, color: Colors.ink },
  headerSub: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  batchPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.blue + '12', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
    maxWidth: 130,
  },
  batchPillText: { fontFamily: Font.display, fontSize: 12, color: Colors.blue, flexShrink: 1 },
  batchChevron: { fontFamily: Font.body, fontSize: 11, color: Colors.blue },
  createBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.button,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  createBtnText: { fontFamily: Font.display, fontSize: 13, color: '#fff' },

  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },

  section: { marginBottom: 4 },
  syllabusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 8 },
  sectionTitle: {
    fontFamily: Font.display, fontSize: 14, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  batchCodePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.green + '15', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  batchCodeLabel: { fontFamily: Font.body, fontSize: 11, color: Colors.muted },
  batchCodeValue: { fontFamily: Font.display, fontSize: 13, color: Colors.green, letterSpacing: 1.5 },
  curriculumLoader: { paddingVertical: 24, alignItems: 'center' },
  curriculumEmpty: { paddingVertical: 16, alignItems: 'center' },
  curriculumEmptyText: { fontFamily: Font.body, fontSize: 13, color: Colors.muted },

  startBanner: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 16, alignItems: 'center', gap: 12, marginBottom: 8,
  },
  startBannerText: { fontFamily: Font.body, fontSize: 14, color: Colors.muted },
  startBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.button,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  startBtnText: { fontFamily: Font.display, fontSize: 14, color: '#fff' },

  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  emptySub: { fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 22 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 14,
  },
  modalTitle: { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.card,
    paddingHorizontal: 16, paddingVertical: 12,
    fontFamily: Font.body, fontSize: 15, color: Colors.ink,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontFamily: Font.body, fontSize: 15, color: Colors.muted },
  confirmBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.button,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  confirmText: { fontFamily: Font.display, fontSize: 15, color: '#fff' },

  switcherRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  switcherRowActive: { backgroundColor: Colors.blue + '06' },
  switcherName: { flex: 1, fontFamily: Font.display, fontSize: 15, color: Colors.ink },
  switcherMeta: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginRight: 8 },
  switcherCheck: { fontFamily: Font.display, fontSize: 16, color: Colors.blue },

  logoutBtn: {
    marginTop: 16, borderWidth: 1.5, borderColor: '#ff4d5e55',
    borderRadius: Radius.card, padding: 15, alignItems: 'center',
    backgroundColor: '#fff5f5',
  },
  logoutText: { fontFamily: Font.display, fontSize: 15, color: '#ff4d5e' },
});
