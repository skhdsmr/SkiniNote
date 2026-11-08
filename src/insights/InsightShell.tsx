import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { monitoringColors as mc, monitoringCard } from '../folders/theme';
import { useFolder } from '../folders/store';
import type { InsightRecord } from './insights';

/**
 * 특화 화면(트리거 탐정 · 긁기 패턴 · 회복 트래커)이 같이 쓰는 틀 — 경과 관찰 상세 결과와 같은
 * 상단 바(뒤로가기 + 제목)와 카드 간격을 그대로 쓴다.
 */
export function InsightShell({
  navigation,
  title,
  sub,
  children,
}: {
  navigation: any;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 20, color: mc.ink }}>‹</Text>
          <View>
            <Text style={styles.topBarTitle}>{title}</Text>
            {sub ? (
              <Text style={styles.topBarSub} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** 흰 카드 + 제목 */
export function InsightCard({ title, children, tint }: { title?: string; children: React.ReactNode; tint?: string }) {
  return (
    <View style={[monitoringCard(), styles.card, tint ? { backgroundColor: tint } : null]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** 폴더 하나의 기록을 오래된 순으로 — 폴더가 없으면 null */
export function useInsightFolder(folderId: string | undefined) {
  const folder = useFolder(folderId);
  const records = useMemo<InsightRecord[]>(
    () =>
      (folder?.records ?? []).map((r: any) => ({
        id: r.id,
        date: r.date,
        sleepScore: r.sleepScore,
        itchVas: r.itchVas,
        redness: r.redness,
        bumps: r.bumps,
        scratch: r.scratch,
        thickening: r.thickening,
      })),
    [folder],
  );
  return { folder, records, siteName: folder ? folder.name : '' };
}

export function NoFolder({ navigation }: { navigation: any }) {
  return (
    <InsightShell navigation={navigation} title="기록을 찾을 수 없어요">
      <InsightCard>
        <Text style={styles.empty}>지켜보는 자리를 찾지 못했어요. 경과 관찰에서 다시 열어 주세요.</Text>
      </InsightCard>
    </InsightShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mc.bg },
  topBar: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20,
    backgroundColor: mc.card, borderBottomWidth: 1, borderBottomColor: mc.line,
  },
  topBarTitle: { fontSize: 15, fontWeight: '700', color: mc.ink },
  topBarSub: { fontSize: 11, color: mc.sub, maxWidth: 220 },
  card: { padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: mc.ink, marginBottom: 12 },
  empty: { fontSize: 13, color: mc.sub, lineHeight: 19 },
});
