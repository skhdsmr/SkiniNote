import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { monitoringColors as mc } from '../folders/theme';
import { todayKey, useFolders } from '../folders/store';
import { SYMPTOM_LAYERS } from '../symptoms/groups';
import { InsightCard, InsightShell, NoFolder, useInsightFolder } from './InsightShell';
import InsightChart from './InsightChart';
import {
  CHRONIC_FLAG_DAYS,
  chronicFlagOf,
  monthlyChronic,
  RANGE_LABEL,
  RANGE_MONTHS,
  recoveryMessage,
  type ChronicFlag,
  type InsightRecord,
  type RangeKey,
} from './insights';

const BROWN = SYMPTOM_LAYERS.thickening.color;
const TONE_COLOR = { better: mc.greenMuted, same: mc.ink, worse: '#C0392B', unknown: mc.sub } as const;

/**
 * 회복 트래커 (만성 흔적) — 두꺼워진 피부는 몇 주~몇 달에 걸쳐 변해서 일 단위로 보면 매일 변화가 없어
 * 보인다. 그래서 월 평균만 보여주고, 변화가 작아 보여도 자연스럽다는 기대치 문구를 함께 둔다.
 *
 * 같은 자리에서 만성 흔적이 CHRONIC_FLAG_DAYS(6주) 넘게 이어지면 "진료 때 상의할 항목"으로 자동 정리해
 * 보여준다 — 지켜보는 모든 자리를 훑으므로 이 화면에서 한 번에 본다.
 */
export default function RecoveryTrackerScreen({ navigation, route }: { navigation: any; route: any }) {
  const { folder, records, siteName } = useInsightFolder(route.params?.folderId);
  const folders = useFolders();
  const [range, setRange] = useState<RangeKey>('6m');

  const today = todayKey();
  const points = useMemo(() => monthlyChronic(records, RANGE_MONTHS[range], today), [records, range, today]);
  const message = useMemo(() => recoveryMessage(points), [points]);

  // 모든 자리에서 오래 이어진 만성 흔적 — 아토피 채점 기준이 있는 자리만(그 외는 증상 값이 근거가 없다)
  const flags = useMemo<ChronicFlag[]>(() => {
    const out: ChronicFlag[] = [];
    (folders as any[]).forEach((f) => {
      if (f.disease !== '아토피피부염' || !f.records?.length) return;
      const recs: InsightRecord[] = f.records;
      const flag = chronicFlagOf(recs, today);
      if (flag) out.push({ folderId: f.id, site: f.name, ...flag });
    });
    return out;
  }, [folders, today]);

  if (!folder) return <NoFolder navigation={navigation} />;

  return (
    <InsightShell navigation={navigation} title="회복 트래커" sub={`${siteName} · 만성 흔적`}>
      <View style={styles.segment}>
        {(Object.keys(RANGE_MONTHS) as RangeKey[]).map((k) => (
          <Pressable key={k} style={[styles.segBtn, range === k && styles.segBtnOn]} onPress={() => setRange(k)}>
            <Text style={[styles.segText, range === k && styles.segTextOn]}>{RANGE_LABEL[k]}</Text>
          </Pressable>
        ))}
      </View>

      <InsightCard title="두꺼워진 정도 · 월 평균">
        <InsightChart
          labels={points.map((p) => `${p.month}월`)}
          bars={points.map((p) => p.avg ?? 0)}
          barColor={BROWN}
          barLabel="만성 흔적 (칸, 월 평균)"
        />
        <Text style={styles.foot}>기록이 없는 달은 비워 둬요 · 일 단위 그래프는 보여주지 않아요</Text>
      </InsightCard>

      <InsightCard tint="#EFF5E4">
        <Text style={[styles.msgTitle, { color: TONE_COLOR[message.tone] }]}>{message.title}</Text>
        <Text style={styles.msgBody}>{message.body}</Text>
      </InsightCard>

      <InsightCard title="진료 때 상의할 항목">
        {flags.length ? (
          flags.map((f, i) => (
            <View key={f.folderId} style={[styles.flagRow, i > 0 && styles.divided]}>
              <MaterialIcons name="check-circle" size={20} color={BROWN} />
              <View style={{ flex: 1 }}>
                <Text style={styles.flagTitle}>
                  {f.site} · 만성 흔적 {f.weeks}주째
                </Text>
                <Text style={styles.flagSub}>{f.since.replace(/-/g, '.')}부터 이어지고 있어요</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.foot}>
            만성 흔적이 {Math.round(CHRONIC_FLAG_DAYS / 7)}주 넘게 이어지는 자리가 생기면 여기에 자동으로 정리돼요
          </Text>
        )}
        {flags.length > 0 && (
          <Pressable style={styles.exportBtn} onPress={() => navigation.navigate('DataExport')}>
            <Text style={styles.exportText}>진료용 기록 내보내기</Text>
          </Pressable>
        )}
      </InsightCard>
    </InsightShell>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: '#E7E9EC', borderRadius: 16, padding: 3 },
  segBtn: { flex: 1, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: '#FFFFFF' },
  segText: { fontSize: 13, fontWeight: '700', color: mc.sub },
  segTextOn: { color: mc.ink, fontWeight: '800' },
  foot: { fontSize: 11.5, color: mc.sub, marginTop: 10, lineHeight: 17 },
  msgTitle: { fontSize: 16, fontWeight: '800' },
  msgBody: { fontSize: 13, color: mc.greenMuted, marginTop: 6, lineHeight: 19 },
  divided: { borderTopWidth: 1, borderTopColor: mc.line },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  flagTitle: { fontSize: 14, fontWeight: '800', color: mc.ink },
  flagSub: { fontSize: 11.5, color: mc.sub, marginTop: 3 },
  exportBtn: { marginTop: 8, height: 46, borderRadius: 14, backgroundColor: mc.greenTop, alignItems: 'center', justifyContent: 'center' },
  exportText: { fontSize: 14, fontWeight: '800', color: '#16320A' },
});
