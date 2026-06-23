import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from 'react-native';
import { fetchBatches, createBatch, BatchRow } from '../../core/teacherApi';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';

function BatchCard({ b }: { b: BatchRow }) {
  return (
    <View style={s.batchCard}>
      <View style={s.batchIcon}>
        <Text style={s.batchIconText}>🏫</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.batchName}>{b.name}</Text>
        <Text style={s.batchMeta}>{b.student_count} student{b.student_count !== 1 ? 's' : ''}</Text>
      </View>
    </View>
  );
}

export default function ManageScreen({ onLogout }: { onLogout?: () => void }) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchBatches();
      setBatches(rows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createBatch(newName.trim());
      setNewName('');
      setShowCreate(false);
      load();
    } catch {
      Alert.alert('Error', 'Could not create batch. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Manage</Text>
          <Text style={s.headerSub}>Batches & curriculum</Text>
        </View>
        <TouchableOpacity style={[s.createBtn, Shadow3D(Colors.blueDark)]} onPress={() => setShowCreate(true)}>
          <Text style={s.createBtnText}>+ New Batch</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.blue} />
        }
      >
        {batches.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🏫</Text>
            <Text style={s.emptyTitle}>No batches yet</Text>
            <Text style={s.emptySub}>Create your first batch and add students to get started.</Text>
          </View>
        ) : (
          batches.map((b) => <BatchCard key={b.id} b={b} />)
        )}
        {/* Logout */}
        {onLogout && (
          <TouchableOpacity style={s.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
            <Text style={s.logoutText}>Log Out</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Create batch modal */}
      <Modal visible={showCreate} transparent animationType="slide">
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
  headerTitle: { fontFamily: Font.display, fontSize: 24, color: Colors.ink },
  headerSub: { fontFamily: Font.body, fontSize: 13, color: Colors.muted, marginTop: 2 },
  createBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.button,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  createBtnText: { fontFamily: Font.display, fontSize: 14, color: '#fff' },
  scroll: { padding: 20, gap: 12 },

  batchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 16,
  },
  batchIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.blue + '18', justifyContent: 'center', alignItems: 'center',
  },
  batchIconText: { fontSize: 22 },
  batchName: { fontFamily: Font.display, fontSize: 15, color: Colors.ink },
  batchMeta: { fontFamily: Font.body, fontSize: 12, color: Colors.muted, marginTop: 3 },

  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  emptySub: { fontFamily: Font.body, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 22 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16,
  },
  modalTitle: { fontFamily: Font.display, fontSize: 20, color: Colors.ink },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.card,
    paddingHorizontal: 16, paddingVertical: 12,
    fontFamily: Font.body, fontSize: 15, color: Colors.ink,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  cancelText: { fontFamily: Font.body, fontSize: 15, color: Colors.muted },
  confirmBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.button,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  confirmText: { fontFamily: Font.display, fontSize: 15, color: '#fff' },
  logoutBtn: {
    marginTop: 24, marginHorizontal: 4,
    borderWidth: 1.5, borderColor: '#ff4d5e55', borderRadius: Radius.card,
    padding: 15, alignItems: 'center', backgroundColor: '#fff5f5',
  },
  logoutText: { fontFamily: Font.display, fontSize: 15, color: '#ff4d5e' },
});
