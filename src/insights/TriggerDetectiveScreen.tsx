import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { monitoringColors as mc, CHART_SERIES } from '../folders/theme';
import { levelInfo } from '../symptoms/groups';
import { InsightCard, InsightShell, NoFolder, useInsightFolder } from './InsightShell';
import InsightChart from './InsightChart';
import {
  detectInflammationSurge,
  findPatterns,
  inflammationLevel,
  inspectFactors,
  type FactorKey,
} from './insights';

const RED = mc.sev3;

/**
 * 트리거 탐정 (염증 반응) — 염증 반응이 갑자기 늘었을 때 그 즈음의 일지를 평소와 견줘 "혹시 이런
 * 변화가 있었나요?"를 묻고, 기록이 쌓이면 나만의 패턴을 찾아준다.
 *
 * 지금 앱이 가진 일지는 수면 점수와 가려움뿐이라 둘만 실제로 견준다. 날씨·습도·새 제품·땀·음식은 일지가
 * 쌓이는 곳이 아직 없어 "연동 준비 중"으로 두고 값을 지어내지 않는다. 문장은 관찰만 전한다("~했어요")
 * — 상관이 있어 보인다는 것이지 원인을 단정하지 않는다.
 */
export default function TriggerDetectiveScreen({ navigation, route }: { navigation: any; route: any }) {
  const { folder, records, siteName } = useInsightFolder(route.params?.folderId);
  // 맞아요/아니에요 — 이 화면 안에서만 유지한다(다른 곳에 저장하지 않는다)
  const [answers, setAnswers] = useState<Partial<Record<FactorKey, 'yes' | 'no'>>>({});

  const surge = useMemo(() => detectInflammationSurge(records), [records]);
  const factors = useMemo(() => (surge ? inspectFactors(records, surge) : []), [records, surge]);
  const patterns = useMemo(() => findPatterns(records), [records]);

  if (!folder) return <NoFolder navigation={navigation} />;

  const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const recent = records.slice(-8);

  return (
    <InsightShell navigation={navigation} title="트리거 탐정" sub={`${siteName} · 염증 반응`}>
      {surge ? (
        <InsightCard tint="#FDECEC">
          <Text style={[styles.alertTitle, { color: RED }]}>염증 반응이 늘었어요</Text>
          <Text style={styles.alertSub}>
            {shortDate(surge.previous.date)} {levelInfo(inflammationLevel(surge.previous)).ko} →{' '}
            {shortDate(surge.current.date)} {levelInfo(inflammationLevel(surge.current)).ko}
          </Text>
          <Text style={styles.alertBody}>그 즈음의 일지에서 평소와 다른 점을 찾아봤어요</Text>
        </InsightCard>
      ) : (
        <InsightCard>
          <Text style={styles.okTitle}>최근 염증 반응이 늘지 않았어요</Text>
          <Text style={styles.okBody}>갑자기 늘어나면 그 즈음의 일지를 함께 보여드릴게요</Text>
        </InsightCard>
      )}

      <InsightCard title="염증 반응 추이">
        {recent.length ? (
          <InsightChart
            labels={recent.map((r) => shortDate(r.date))}
            bars={recent.map(inflammationLevel)}
            barColor={RED}
            barLabel="염증 반응 (칸)"
            lines={[{ label: '수면 점수', color: CHART_SERIES.sleep.color, max: 100, values: recent.map((r) => r.sleepScore) }]}
          />
        ) : (
          <Text style={styles.muted}>아직 기록이 없어요</Text>
        )}
      </InsightCard>

      {surge && (
        <InsightCard title="혹시 이런 변화가 있었나요?">
          {factors.map((f, i) => (
            <View key={f.key} style={[styles.factorRow, i > 0 && styles.divided]}>
              <View style={styles.factorHead}>
                <View style={[styles.tag, f.flagged && styles.tagFlag]}>
                  <Text style={[styles.tagText, f.flagged && styles.tagTextFlag]}>{f.label}</Text>
                </View>
              </View>
              {f.available ? (
                <>
                  <Text style={[styles.factorText, f.flagged && styles.factorTextFlag]}>{f.text}</Text>
                  {f.flagged ? (
                    <View style={styles.answerRow}>
                      <Pressable
                        style={[styles.answerBtn, answers[f.key] === 'yes' && styles.answerYes]}
                        onPress={() => setAnswers((a) => ({ ...a, [f.key]: 'yes' }))}
                      >
                        <Text style={[styles.answerText, answers[f.key] === 'yes' && styles.answerYesText]}>맞아요</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.answerBtn, answers[f.key] === 'no' && styles.answerNo]}
                        onPress={() => setAnswers((a) => ({ ...a, [f.key]: 'no' }))}
                      >
                        <Text style={styles.answerText}>아니에요</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.subtle}>평소와 비슷해요</Text>
                  )}
                </>
              ) : (
                <Text style={styles.subtle}>일지 연동 준비 중이에요</Text>
              )}
            </View>
          ))}
        </InsightCard>
      )}

      <InsightCard title="나의 패턴">
        {patterns.length ? (
          patterns.map((p) => (
            <View key={p.title} style={styles.pattern}>
              <Text style={styles.patternTitle}>{p.title}</Text>
              <Text style={styles.patternDetail}>{p.detail}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>
            기록이 쌓이면 "수면이 나빴던 다음에 염증이 늘었어요" 같은 나만의 패턴을 찾아드려요 (지금 {records.length}회 기록)
          </Text>
        )}
        <Text style={styles.footNote}>기록으로 본 경향일 뿐, 원인을 단정하지 않아요</Text>
      </InsightCard>
    </InsightShell>
  );
}

const styles = StyleSheet.create({
  alertTitle: { fontSize: 18, fontWeight: '800' },
  alertSub: { fontSize: 13, color: '#3A3A3C', marginTop: 6 },
  alertBody: { fontSize: 12.5, color: mc.sub, marginTop: 10 },
  okTitle: { fontSize: 16, fontWeight: '800', color: mc.ink },
  okBody: { fontSize: 12.5, color: mc.sub, marginTop: 6, lineHeight: 18 },
  muted: { fontSize: 12.5, color: mc.sub, lineHeight: 19 },
  factorRow: { paddingVertical: 12 },
  divided: { borderTopWidth: 1, borderTopColor: mc.line },
  factorHead: { flexDirection: 'row', marginBottom: 8 },
  tag: { backgroundColor: '#F1F3F6', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4 },
  tagFlag: { backgroundColor: '#FFF4E5' },
  tagText: { fontSize: 11.5, fontWeight: '800', color: mc.sub },
  tagTextFlag: { color: '#B8650F' },
  factorText: { fontSize: 14, color: mc.sub },
  factorTextFlag: { color: mc.ink, fontWeight: '800' },
  subtle: { fontSize: 12.5, color: mc.sub },
  answerRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  answerBtn: { borderRadius: 16, borderWidth: 1.5, borderColor: '#DADDE2', paddingHorizontal: 16, paddingVertical: 7 },
  answerYes: { backgroundColor: mc.greenTop, borderColor: mc.greenTop },
  answerNo: { backgroundColor: '#F1F3F6' },
  answerText: { fontSize: 12.5, fontWeight: '800', color: mc.sub },
  answerYesText: { color: '#16320A' },
  pattern: { marginBottom: 12 },
  patternTitle: { fontSize: 15, fontWeight: '800', color: mc.ink, lineHeight: 21 },
  patternDetail: { fontSize: 12.5, color: mc.sub, marginTop: 4, lineHeight: 18 },
  footNote: { fontSize: 11, color: mc.sub, marginTop: 4 },
});
