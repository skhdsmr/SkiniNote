import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { monitoringColors as mc, CHART_SERIES } from '../folders/theme';
import { useRoutines } from '../context/RoutineContext';
import { InsightCard, InsightShell, NoFolder, useInsightFolder } from './InsightShell';
import InsightChart from './InsightChart';
import {
  BEDTIME_ROUTINES,
  INFECTION_SIGNS,
  scratchLevel,
  scratchVsSleep,
  shouldCheckInfection,
} from './insights';

const ORANGE = mc.warn;

/**
 * 긁기 패턴 (긁은 흔적) — 긁은 흔적이 늘어난 기록을 가려움 점수·수면 점수와 한 차트에 겹쳐 보여주고,
 * 긁은 흔적이 두드러지거나 늘었을 때는 감염 체크 카드를 띄운다.
 *
 * 앱의 기록에는 촬영 시각이 없어 "밤에 긁는다"는 말은 하지 않는다 — 수면 점수가 낮은 기록과 견주는
 * 것까지만 한다. 취침 전 루틴은 따로 알림 설정을 만들지 않고 루틴 탭에 일상 루틴으로 등록하게 한다.
 */
export default function ScratchReportScreen({ navigation, route }: { navigation: any; route: any }) {
  const { folder, records, siteName } = useInsightFolder(route.params?.folderId);
  const { routines, add } = useRoutines();
  const [checked, setChecked] = useState<boolean[]>(() => INFECTION_SIGNS.map(() => false));

  const insight = useMemo(() => scratchVsSleep(records), [records]);
  const checkInfection = useMemo(() => shouldCheckInfection(records), [records]);

  if (!folder) return <NoFolder navigation={navigation} />;

  const recent = records.slice(-10);
  const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const anyChecked = checked.some(Boolean);
  const registered = (name: string) => routines.some((r) => r.name === name);

  return (
    <InsightShell navigation={navigation} title="긁기 패턴" sub={`${siteName} · 긁은 흔적`}>
      <InsightCard>
        <Text style={styles.headline}>{insight.text}</Text>
        <View style={{ height: 12 }} />
        {recent.length ? (
          <InsightChart
            labels={recent.map((r) => shortDate(r.date))}
            bars={recent.map(scratchLevel)}
            barColor={ORANGE}
            barLabel="긁은 흔적 (칸)"
            lines={[
              { label: '가려움 점수', color: CHART_SERIES.itch.color, max: 10, values: recent.map((r) => r.itchVas) },
              { label: '수면 점수', color: CHART_SERIES.sleep.color, max: 100, values: recent.map((r) => r.sleepScore) },
            ]}
          />
        ) : (
          <Text style={styles.muted}>아직 기록이 없어요</Text>
        )}
      </InsightCard>

      {checkInfection && (
        <View style={styles.infectionWrap}>
          <InsightCard title="긁은 흔적이 늘었어요">
            <Text style={styles.muted}>감염 신호가 있는지 한 번 확인해 주세요</Text>
            <View style={{ height: 10 }} />
            {INFECTION_SIGNS.map((s, i) => (
              <Pressable
                key={s}
                style={[styles.signRow, checked[i] && styles.signRowOn]}
                onPress={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
              >
                <MaterialIcons
                  name={checked[i] ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={checked[i] ? ORANGE : '#B6BAC1'}
                />
                <Text style={[styles.signText, checked[i] && styles.signTextOn]}>{s}</Text>
              </Pressable>
            ))}
            {anyChecked && (
              <View style={styles.adviceBox}>
                <Text style={styles.adviceTitle}>하나라도 해당되면 진료를 권해요</Text>
                <Text style={styles.adviceBody}>긁은 상처에 세균 감염이 생기면 보습제만으로는 낫기 어려워요</Text>
                <Pressable
                  style={styles.findBtn}
                  onPress={() => Linking.openURL('https://www.google.com/maps/search/' + encodeURIComponent('피부과'))}
                >
                  <Text style={styles.findBtnText}>가까운 피부과 찾기</Text>
                </Pressable>
              </View>
            )}
          </InsightCard>
        </View>
      )}

      <InsightCard title="자기 전 루틴">
        <Text style={styles.muted}>긁는 것을 줄이는 습관이에요. 루틴 탭에 추가하면 알림과 체크도 함께 쓸 수 있어요</Text>
        {BEDTIME_ROUTINES.map((r, i) => {
          const done = registered(r.name);
          return (
            <View key={r.name} style={[styles.routineRow, i > 0 && styles.divided]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routineName}>{r.name}</Text>
                <Text style={styles.routineWhy}>
                  {r.time} · {r.why}
                </Text>
              </View>
              <Pressable
                disabled={done}
                style={[styles.addBtn, done && styles.addBtnDone]}
                onPress={() => add('routine', { name: r.name, times: [r.time] })}
              >
                <Text style={[styles.addBtnText, done && styles.addBtnTextDone]}>{done ? '추가됨' : '루틴에 추가'}</Text>
              </Pressable>
            </View>
          );
        })}
      </InsightCard>
    </InsightShell>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 17, fontWeight: '800', color: mc.ink, lineHeight: 24 },
  muted: { fontSize: 12.5, color: mc.sub, lineHeight: 19 },
  divided: { borderTopWidth: 1, borderTopColor: mc.line },
  infectionWrap: { borderRadius: 20, borderWidth: 2, borderColor: ORANGE },
  signRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: '#F6F8FA', paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  signRowOn: { backgroundColor: '#FFF4E5' },
  signText: { fontSize: 14, color: mc.ink },
  signTextOn: { fontWeight: '800' },
  adviceBox: { backgroundColor: '#FDECEC', borderRadius: 12, padding: 14, marginTop: 4 },
  adviceTitle: { fontSize: 14, fontWeight: '800', color: '#C0392B' },
  adviceBody: { fontSize: 12, color: '#3A3A3C', marginTop: 4, lineHeight: 17 },
  findBtn: { marginTop: 12, height: 44, borderRadius: 14, backgroundColor: mc.greenTop, alignItems: 'center', justifyContent: 'center' },
  findBtnText: { fontSize: 14, fontWeight: '800', color: '#16320A' },
  routineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  routineName: { fontSize: 14.5, fontWeight: '800', color: mc.ink },
  routineWhy: { fontSize: 11.5, color: mc.sub, marginTop: 3 },
  addBtn: { borderRadius: 14, backgroundColor: '#EFF5E4', paddingHorizontal: 12, paddingVertical: 8 },
  addBtnDone: { backgroundColor: '#F1F3F6' },
  addBtnText: { fontSize: 12, fontWeight: '800', color: mc.greenMuted },
  addBtnTextDone: { color: mc.sub },
});
