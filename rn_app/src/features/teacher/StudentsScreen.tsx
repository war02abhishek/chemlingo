import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { fetchBatchStudents, StudentRow } from '../../core/teacherApi';
import { Colors, Font, Radius } from '../../core/theme';
import { xpToLevel } from '../../core/theme';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function StudentCard({ s }: { s: StudentRow }) {
  const level = xpToLevel(s.total_xp);
  const isAtRisk = !s.last_active || new Date(s.last_active) < new Date(Date.now() - 3 * 86400000);
  return (
    <View style={card.wrap}>
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
    </View>
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

export default function StudentsScreen() {
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

  const filtered = query
    ? all.filter((s) => s.full_name.toLowerCase().includes(query.toLowerCase()))
    : all;

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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <StudentCard s={item} />}
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
});
