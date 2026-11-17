/**
 * 두 날짜 비교 — 경과 관찰 화면에서 A·B 두 회차를 고르고 "비교하기"를 누르면 뜨는 창.
 *
 *   사진 A · B 나란히
 *   한 줄 요약 ("4주 동안 한 단계 좋아졌고, 넓이는 18% 줄었어요.")
 *   피부 질환 A → B (점수 + 단계 배지) · 병변 넓이 변화
 *   4가지 세부증상 A → B
 *   제품 이행률 — A~B 기간 동안 (예전 경과 관찰 화면의 이행률 막대 그대로)
 *   AI 그래프 해석 — ⚠️ 지금은 기록 값으로 문장을 짜 맞춘 규칙 기반 예시다(실제 AI 호출 없음)
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import {
  monitoringColors as mc, monitoringCard, DISPLAY_SCALE, SKIN_SEGMENTS, SYMPTOM_SEGMENTS_BASE, SYMPTOMS,
  segmentFor, skinConditionInfo,
} from '../theme';
import { useFolder, useFolders, folderHasSeverity, isBarrierFolder, daysBetween, todayKey } from '../store';
import { useRoutines } from '../../context/RoutineContext';
import { useProfile } from '../../context/ProfileContext';
import { plainSiteLabel } from '../../models';
import LesionThumb from '../components/LesionThumb';
import { textOnColor } from '../../theme';

const SYMPTOM_ORDER = ['redness', 'bumps', 'scratch', 'thickening'];
const SYMPTOM_ICONS = { redness: 'local-fire-department', bumps: 'grain', scratch: 'gesture', thickening: 'layers' };
const PRODUCTS = ['BT4 Complex', '음압 패치'];
const AI_COLOR = '#6B4FC8';

const md = (key) => {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
};
const toDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** 4단계 배열에서의 위치 — 클수록 좋은 쪽 (SKIN_SEGMENTS는 매우 나쁨부터) */
const skinLevelIndex = (v) => SKIN_SEGMENTS.findIndex((s) => s.ko === skinConditionInfo(v).ko);
const numKo = ['', '한', '두', '세'];

/** 밝은 단계 색을 글자로 쓸 때 읽히게 */
function deepen(hex, amount = 0.38) {
  const n = parseInt(hex.slice(1), 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function LevelBadge({ band }) {
  return (
    <View style={[styles.badge, { backgroundColor: band.color }]}>
      <Text style={[styles.badgeText, { color: textOnColor(band.color) }]}>{band.ko}</Text>
    </View>
  );
}

/** "넓이 지수" 두 값 → 변화율 (첫 값 대비) */
const areaChange = (a, b) =>
  a?.lesionAreaFaceIndex > 0 && b?.lesionAreaFaceIndex > 0 ? b.lesionAreaFaceIndex / a.lesionAreaFaceIndex - 1 : null;
const areaPhrase = (d) =>
  Math.round(d * 100) === 0 ? '비슷해요' : `${Math.abs(Math.round(d * 100))}% ${d < 0 ? '줄었어요' : '늘었어요'}`;

export default function MonitoringCompareScreen({ navigation, route }) {
  const { folderId, aId, bId } = route.params || {};
  const folder = useFolder(folderId);
  const folders = useFolders();
  const { adherenceRate } = useRoutines();
  const { healthConnected } = useProfile();

  const A = folder?.records.find((r) => r.id === aId);
  const B = folder?.records.find((r) => r.id === bId);
  if (!folder || !A || !B) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ padding: 20, color: mc.sub }}>비교할 기록을 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  const hasSeverity = folderHasSeverity(folder);
  const days = Math.max(0, daysBetween(A.date, B.date));
  const period = days >= 7 ? `${Math.round(days / 7)}주` : `${days}일`;
  const skinA = DISPLAY_SCALE.iga(A.iga);
  const skinB = DISPLAY_SCALE.iga(B.iga);
  const stepDiff = skinLevelIndex(skinB) - skinLevelIndex(skinA); // + = 좋아짐
  const area = areaChange(A, B);

  // ── 한 줄 요약 — 강조할 부분은 초록(좋아짐)/빨강(나빠짐)
  const parts = [];
  if (hasSeverity) {
    parts.push(
      stepDiff === 0
        ? { text: '단계는 그대로였고', tone: null }
        : { text: `${numKo[Math.abs(stepDiff)] ?? Math.abs(stepDiff)} 단계 ${stepDiff > 0 ? '좋아졌고' : '나빠졌고'}`, tone: stepDiff > 0 ? 'good' : 'bad' },
    );
  }
  if (area != null) {
    parts.push({ text: `넓이는 ${areaPhrase(area)}`, tone: Math.round(area * 100) === 0 ? null : area < 0 ? 'good' : 'bad' });
  }

  // ── 제품 이행률 — A~B 기간
  const rates = PRODUCTS.map((name) => ({ name, rate: adherenceRate(name, toDate(A.date), toDate(B.date)) })).filter(
    (p) => p.rate != null,
  );

  // ── AI 그래프 해석 (규칙 기반 예시)
  const insights = buildInsights({ A, B, hasSeverity, healthConnected, area, folders, period });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Text style={{ fontSize: 20, color: mc.ink }}>‹</Text>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {plainSiteLabel(folder.name)} · 두 날짜 비교
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* 사진 A · B + 요약 + 피부 질환 · 병변 넓이 */}
        <View style={[monitoringCard(), styles.card]}>
          <View style={styles.photoRow}>
            {[['A', A], ['B', B]].map(([k, r]) => (
              <View key={k} style={styles.photoCol}>
                <LesionThumb photo={r.photo} mode="photo" size={150} style={styles.photo} />
                <Text style={styles.photoCap}>{md(r.date)}</Text>
              </View>
            ))}
          </View>

          {parts.length > 0 && (
            <Text style={styles.summary}>
              {period} 동안{' '}
              {parts.map((p, i) => (
                <Text key={i}>
                  {i > 0 && ', '}
                  <Text style={p.tone === 'good' ? styles.good : p.tone === 'bad' ? styles.bad : null}>{p.text}</Text>
                </Text>
              ))}
              .
            </Text>
          )}

          {hasSeverity && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>피부 질환</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.rowNum}>{Math.round(skinA)}</Text>
              <LevelBadge band={skinConditionInfo(skinA)} />
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.rowNum}>{Math.round(skinB)}</Text>
              <LevelBadge band={skinConditionInfo(skinB)} />
            </View>
          )}
          {area != null && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>병변 넓이</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.rowValue}>{areaPhrase(area)}</Text>
            </View>
          )}
        </View>

        {/* 4가지 세부증상 A → B */}
        {hasSeverity && (
          <View style={[monitoringCard(), styles.card]}>
            <Text style={styles.cardTitle}>4가지 세부증상</Text>
            {SYMPTOM_ORDER.map((key, i) => {
              const a = segmentFor(DISPLAY_SCALE.symptom(A[key] ?? 0), SYMPTOM_SEGMENTS_BASE);
              const b = segmentFor(DISPLAY_SCALE.symptom(B[key] ?? 0), SYMPTOM_SEGMENTS_BASE);
              return (
                <View key={key} style={[styles.symRow, i > 0 && styles.divided]}>
                  <View style={[styles.symIcon, { backgroundColor: b.color + '33' }]}>
                    <MaterialIcons name={SYMPTOM_ICONS[key]} size={16} color={deepen(b.color)} />
                  </View>
                  <Text style={styles.symLabel}>{SYMPTOMS[key].label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.symLevel, { color: mc.sub }]}>{a.ko}</Text>
                  <Text style={styles.arrow}>→</Text>
                  <Text style={[styles.symLevel, { color: deepen(b.color) }]}>{b.ko}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 제품 이행률 — A~B 기간 */}
        {rates.length > 0 && (
          <View style={[monitoringCard(), styles.card]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>제품 이행률</Text>
              <Text style={styles.cardSub}>
                {md(A.date)} ~ {md(B.date)}
              </Text>
            </View>
            {rates.map((p, i) => {
              const pct = Math.round(p.rate * 100);
              return (
                <View key={p.name} style={{ marginTop: i === 0 ? 4 : 14 }}>
                  <View style={styles.adhHead}>
                    <Text style={styles.adhLabel}>{p.name} 이행률</Text>
                    <Text style={styles.adhValue}>{pct}%</Text>
                  </View>
                  <View style={styles.adhTrack}>
                    <View style={[styles.adhFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* AI 그래프 해석 */}
        {insights.length > 0 && (
          <View style={[monitoringCard(), styles.card, styles.aiCard]}>
            <View style={styles.cardHead}>
              <Text style={styles.aiTitle}>✦ AI 그래프 해석</Text>
              <Text style={styles.cardSub}>
                {period} · {md(todayKey())} 생성
              </Text>
            </View>
            {insights.map((parts2, i) => (
              <View key={i} style={styles.aiRow}>
                <View style={styles.aiNum}>
                  <Text style={styles.aiNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.aiText}>
                  {parts2.map((p, k) => (
                    <Text key={k} style={p.b ? styles.aiBold : null}>
                      {p.t}
                    </Text>
                  ))}
                </Text>
              </View>
            ))}
            <Text style={styles.aiFoot}>기록을 바탕으로 만든 해석이에요. 의학적 진단이 아니에요.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A~B 기간의 해석 문장들 — 기록 값만으로 만든다. 문장마다 [{ t: 글, b: 굵게 }] 조각 배열.
 * ⚠️ 실제 AI가 아니라 규칙으로 짜 맞춘 예시다 — 나중에 실제 모델 호출로 바꿀 자리.
 */
function buildInsights({ A, B, hasSeverity, healthConnected, area, folders, period }) {
  const out = [];
  const metrics = [
    hasSeverity && { name: '피부 질환', a: DISPLAY_SCALE.iga(A.iga), b: DISPLAY_SCALE.iga(B.iga) },
    { name: '가려움 안정도', a: DISPLAY_SCALE.itch(A.itchVas), b: DISPLAY_SCALE.itch(B.itchVas) },
    healthConnected && { name: '수면 점수', a: A.sleepScore, b: B.sleepScore },
  ].filter(Boolean);

  // 1) 전반 + 가장 크게 오른 지표
  const up = metrics.filter((m) => Math.round(m.b - m.a) > 0);
  const best = [...metrics].sort((x, y) => y.b - y.a - (x.b - x.a))[0];
  if (best && Math.round(best.b - best.a) > 0) {
    out.push([
      { t: up.length === metrics.length ? `${metrics.length}개 지표 모두 ${period} 동안 좋아졌어요. ` : `${period} 동안 ${up.length}개 지표가 좋아졌어요. ` },
      { t: '가장 크게 오른 건 ' },
      { t: `${best.name}(${Math.round(best.a)} → ${Math.round(best.b)})`, b: true },
      { t: '예요.' },
    ]);
  } else if (metrics.length) {
    out.push([{ t: `${period} 동안 눈에 띄게 좋아진 지표는 없어요.` }]);
  }

  // 2) 가려움과 수면이 함께 움직였는지
  const itchUp = DISPLAY_SCALE.itch(B.itchVas) - DISPLAY_SCALE.itch(A.itchVas);
  const sleepUp = healthConnected ? B.sleepScore - A.sleepScore : null;
  if (sleepUp != null && Math.abs(itchUp) >= 5) {
    if (Math.sign(itchUp) === Math.sign(sleepUp) && Math.abs(sleepUp) >= 2) {
      out.push([
        { t: `가려움이 ${itchUp > 0 ? '나아지면서' : '심해지면서'} ` },
        { t: `수면 점수도 함께 ${sleepUp > 0 ? '올랐어요' : '내려갔어요'}`, b: true },
        { t: '.' },
      ]);
    } else {
      out.push([{ t: '가려움과 수면 점수는 ' }, { t: '서로 다르게 움직였어요', b: true }, { t: '.' }]);
    }
  }

  // 3) 같은 기간 피부 장벽
  const barrier = folders.find((f) => isBarrierFolder(f));
  const scans = (barrier?.records ?? []).filter(
    (r) => r.skinScan?.totalScore != null && daysBetween(A.date, r.date) >= 0 && daysBetween(r.date, B.date) >= 0,
  );
  if (scans.length >= 2) {
    const s0 = Math.round(scans[0].skinScan.totalScore);
    const s1 = Math.round(scans[scans.length - 1].skinScan.totalScore);
    out.push([
      { t: '같은 기간 ' },
      { t: `피부 장벽 점수가 ${s0} → ${s1}로 ${s1 >= s0 ? '올랐어요' : '내려갔어요'}`, b: true },
      { t: '. 같은 시기의 변화라 원인이라고 단정할 수는 없어요.' },
    ]);
  }

  // 4) 병변 넓이
  if (area != null) {
    const pct = Math.round(area * 100);
    out.push(
      pct === 0
        ? [{ t: '병변 넓이는 ' }, { t: '거의 그대로', b: true }, { t: '예요. 다음 촬영 때 같은 거리에서 찍어 확인해 보세요.' }]
        : [
            { t: '병변 넓이는 ' },
            { t: `${Math.abs(pct)}% ${pct < 0 ? '줄었어요' : '늘었어요'}`, b: true },
            { t: '. 다음 촬영 때 같은 거리에서 찍어 확인해 보세요.' },
          ],
    );
  }
  return out.slice(0, 4);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mc.bg },
  topBar: {
    height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    backgroundColor: mc.card, borderBottomWidth: 1, borderBottomColor: mc.line,
  },
  topBarTitle: { fontSize: 15, fontWeight: '700', color: mc.ink, flexShrink: 1 },
  body: { padding: 12, gap: 12, paddingBottom: 32 },
  card: { padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: mc.ink, marginBottom: 6 },
  cardSub: { fontSize: 12, color: mc.sub },

  photoRow: { flexDirection: 'row', gap: 10 },
  photoCol: { flex: 1, alignItems: 'center' },
  photo: { width: '100%', height: undefined, aspectRatio: 1, borderRadius: 14 },
  photoCap: { fontSize: 12.5, fontWeight: '700', color: mc.sub, marginTop: 6 },
  summary: { fontSize: 15, fontWeight: '800', color: mc.ink, marginTop: 14, lineHeight: 22 },
  good: { color: '#3E8E2F' },
  bad: { color: '#D2453F' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  rowLabel: { fontSize: 14, fontWeight: '700', color: mc.ink },
  rowNum: { fontSize: 16, fontWeight: '900', color: mc.ink },
  rowValue: { fontSize: 14.5, fontWeight: '800', color: mc.ink },
  arrow: { fontSize: 14, color: mc.sub, marginHorizontal: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11.5, fontWeight: '800' },

  symRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  divided: { borderTopWidth: 1, borderTopColor: mc.line },
  symIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  symLabel: { fontSize: 14, fontWeight: '700', color: mc.ink },
  symLevel: { fontSize: 13, fontWeight: '800' },

  adhHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  adhLabel: { flex: 1, fontSize: 13, fontWeight: '800', color: mc.ink },
  adhValue: { fontSize: 13, fontWeight: '800', color: mc.greenDeep },
  adhTrack: { height: 10, borderRadius: 5, backgroundColor: mc.line, overflow: 'hidden' },
  adhFill: { height: '100%', borderRadius: 5, backgroundColor: mc.greenTop },

  aiCard: { backgroundColor: '#FBFAFF', borderWidth: 1, borderColor: '#E6E0F7' },
  aiTitle: { fontSize: 16, fontWeight: '800', color: mc.ink },
  aiRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  aiNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ECE6FA', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  aiNumText: { fontSize: 12, fontWeight: '800', color: AI_COLOR },
  aiText: { flex: 1, fontSize: 14, lineHeight: 21, color: mc.ink },
  aiBold: { fontWeight: '900' },
  aiFoot: { fontSize: 12, color: mc.sub, marginTop: 16, lineHeight: 17 },
});
