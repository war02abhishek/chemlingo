import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  ActivityIndicator, RefreshControl, TextInput, TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { fetchBatchStudents, StudentRow } from '../../core/teacherApi';
import { Colors, Font, Radius } from '../../core/theme';
import { xpToLevel } from '../../core/theme';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function StudentCard({ s, onPress }: { s: StudentRow; onPress: () => void }) {
  const level = xpToLevel(s.total_xp);
  const isAtRisk = !s.last_active || new Date(s.last_active) < new Date(Date.now() - 3 * 86400000);
  return (
    <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.7}>
      <View style={card.avatar}>
        <Text style={card.avatarText}>{initials(s.full_name)}</Text>
      </View>
      <View style={card.info}>
        <View style={card.nameRow}>
          <Text style={card.name}>{s.full_name}</Text>
          {isAtRisk && <View style={card.riskBadge}><Text style={card.riskText}>At Risk</Text></View>}
        </View>
        <Text style={card.meta}>Lv {level} · {s.current_streak}🔥 streak · {s.lessons_this_week} lessons this week</Text>
      </View>
      <Text style={card.xp}>{s.total_xp} XP</Text>
      <Text style={{ fontSize: 16, color: Colors.muted }}>›</Text>
    </TouchableOpacity>
  );
}

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 14, marginBottom: 10,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.blue + '25', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontFamily: Font.display, fontSize: 15, color: Colors.blue },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name: { fontFamily: Font.display, fontSize: 14, color: Colors.ink },
  riskBadge: { backgroundColor: Colors.red + '20', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  riskText: { fontFamily: Font.body, fontSize: 11, color: Colors.red },
  meta: { fontFamily: Font.body, fontSize: 12, color: Colors.muted },
  xp: { fontFamily: Font.display, fontSize: 13, color: Colors.blue },
});

function isAtRisk(s: StudentRow) {
  return !s.last_active || new Date(s.last_active) < new Date(Date.now() - 3 * 86400000);
}

export default function StudentsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const activeFilter: 'at_risk' | undefined = route.params?.filter;

  const [all, setAll] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchBatchStudents();
      setAll(rows);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = all
    .filter((s) => !query || s.full_name.toLowerCase().includes(query.toLowerCase()))
    .filter((s) => activeFilter !== 'at_risk' || isAtRisk(s));

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <View style={st.center}><ActivityIndicator size="large" color={Colors.blue} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <Text style={st.title}>Students</Text>
        <Text style={st.sub}>{all.length} enrolled</Text>
      </View>

      <View style={st.searchWrap}>
        <TextInput
          style={st.search}
          placeholder="Search by name…"
          placeholderTextColor={Colors.muted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {activeFilter === 'at_risk' && (
        <View style={st.filterBanner}>
          <Text style={st.filterText}>⚠️ Showing at-risk students only</Text>
          <TouchableOpacity onPress={() => navigation.setParams({ filter: undefined })}>
            <Text style={st.filterClear}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <StudentCard s={item} onPress={() => navigation.navigate('StudentDetail', { studentId: item.id, name: item.full_name })} />
        )}
        contentContainerStyle={st.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.blue} />
        }
        ListEmptyComponent={
          <View style={st.empty}>
            <Text style={st.emptyText}>{query ? 'No students match your search.' : 'No students in your batches yet.'}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontFamily: Font.display, fontSize: 24, color: Colors.ink },
  sub: { fontFamily: Font.body, fontSize: 13, color: Colors.muted, marginTop: 2 },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 10 },
  search: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: Font.body, fontSize: 14, color: Colors.ink,
    borderWidth: 1, borderColor: Colors.border,
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontFamily: Font.body, fontSize: 14, color: Colors.muted },
  filterBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: Colors.red + '12', borderRadius: Radius.chip,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  filterText: { fontFamily: Font.body, fontSize: 13, color: Colors.red, flex: 1 },
  filterClear: { fontFamily: Font.display, fontSize: 13, color: Colors.red },
});
