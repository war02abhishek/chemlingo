import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { Colors, Font, Radius, Shadow3D } from '../../core/theme';
import FlaskyMascot from '../../core/components/FlaskyMascot';

export default function BossBattleScreen({ route, navigation }: any) {
  const { topicTitle } = route.params ?? {};

  return (
    <SafeAreaView style={s.safe}>
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Text style={s.backText}>← Back</Text>
      </TouchableOpacity>
      <View style={s.center}>
        <Text style={s.bossEmoji}>👹</Text>
        <Text style={s.title}>Boss Battle</Text>
        <Text style={s.topic}>{topicTitle}</Text>
        <FlaskyMascot size={80} expression="thinking" />
        <Text style={s.sub}>Boss Battles are coming soon. Complete all lessons in this topic to unlock this feature!</Text>
        <TouchableOpacity style={[s.btn, Shadow3D(Colors.greenDark)]} onPress={() => navigation.goBack()}>
          <Text style={s.btnText}>Back to Path</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  back: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { fontFamily: Font.body, fontSize: 15, color: Colors.blue },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  bossEmoji: { fontSize: 64 },
  title: { fontFamily: Font.display, fontSize: 28, color: Colors.red },
  topic: { fontFamily: Font.body, fontSize: 15, color: Colors.muted },
  sub: { fontFamily: Font.bodyRegular, fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  btn: { backgroundColor: Colors.green, borderRadius: Radius.button, paddingVertical: 14, paddingHorizontal: 40, marginTop: 8 },
  btnText: { fontFamily: Font.display, fontSize: 16, color: '#fff' },
});
