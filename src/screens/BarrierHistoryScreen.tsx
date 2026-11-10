import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { AppColors, cardDecoration } from '../theme';
import { useFolders, isBarrierFolder } from '../folders/store';
import { BARRIER_SERIES, skinBarrierInfo } from '../folders/theme';
import LesionThumb from '../folders/components/LesionThumb';
import { BarrierChangeCard, DeltaText, shortMd } from '../components/TrendDelta';

const COLOR = BARRIER_SERIES.color;

type MetricKey = 'total' | 'wrinkle' | 'pore' | 'moisture';
const METRIC_TABS: { key: MetricKey; label: string }[] = [
  { key: 'total', label: '장벽 점수' },
  { key: 'wrinkle', label: '주름' },
  { key: 'pore', label: '모공' },
  { key: 'moisture', label: '수분량' },
];

function valueOf(scan: any, key: MetricKey): number | null {
  if (!scan) return null;
  if (key === 'total') return scan.totalScore ?? null;
  return scan.metrics?.find((m: any) => m.key === key)?.score ?? null;
}

/**
 * 장벽 기록 — 피부장벽 점수 추이 그래프.
 *
 *   홈 피부장벽 카드 "기록" ─▶ 이 화면 ─▶ 점/줄을 누르면 피부장벽 결과 상세(MonitoringDetail)
 *
 * 모니터링 관점의 화면이다. 아토피 등급(IGA)은 며칠 사이엔 거의 그대로라 호전·악화가 안 보이는데,
 * 피부장벽 점수는 연속값이라 1~2점의 작은 오르내림이 보인다. 그래서
 *   - y축을 0~100 고정이 아니라 **기록 범위에 맞춰 확대**해서 작은 변화도 기울기로 보이게 하고,
 *   - 점을 누르면 그 회차가 **바로 앞 회차보다** 얼마나 좋아졌는지/낮아졌는지를 지표별로 보여준다.
 */
export default function BarrierHistoryScreen({ navigation }: { navigation: any }) {
  const folders = useFolders();
  const folder = folders.find((f: any) => isBarrierFolder(f));
  const records: any[] = useMemo(() => (folder?.records ?? []).filter((r: any) => r.skinScan), [folder]);

  const [metric, setMetric] = useState<MetricKey>('total');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selIdx = Math.max(
    0,
    selectedId ? records.findIndex((r) => r.id === selectedId) : records.length - 1,
  );
  const selected = records[selIdx];
  const prevOfSelected = selIdx > 0 ? records[selIdx - 1] : null;

  const latest = records[records.length - 1];
  const prev = records.length > 1 ? records[records.length - 2] : null;
  const first = records[0];

  // 최근 4회 평균 vs 그 앞 4회 평균 — 하루하루의 출렁임 말고 "요즘 방향"을 한 단어로
  const recentTrend = useMemo(() => {
    if (records.length < 4) return null;
    const vals = records.map((r) => r.skinScan.totalScore as number);
    const n = Math.min(4, Math.floor(vals.length / 2));
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    return avg(vals.slice(-n)) - avg(vals.slice(-2 * n, -n));
  }, [records]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <MaterialIcons name="chevron-left" size={26} color={AppColors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>장벽 기록</Text>
          <Text style={styles.topSub}>점수 추이 그래프</Text>
        </View>
        <Pressable style={styles.measureBtn} onPress={() => navigation.navigate('Tabs', { screen: 'Camera', params: { mode: 'barrier' } })}>
          <MaterialIcons name="photo-camera" size={15} color="#FFFFFF" />
          <Text style={styles.measureBtnText}>측정하기</Text>
        </Pressable>
      </View>

      {!latest ? (
        <View style={[cardDecoration(), styles.empty]}>
          <MaterialIcons name="water-drop" size={30} color={AppColors.sub} />
          <Text style={styles.emptyTitle}>아직 피부장벽 기록이 없어요</Text>
          <Text style={styles.emptyHint}>측정하기로 얼굴을 찍으면 점수 변화가 여기에 쌓여요</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* 요약 — 지금 점수 · 지난번 대비 · 요즘 방향 */}
          <View style={[cardDecoration(), styles.summary]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>최근 장벽 점수</Text>
              <View style={styles.valueRow}>
                <Text style={styles.bigValue}>{Math.round(latest.skinScan.totalScore)}</Text>
                <PeerBadge score={latest.skinScan.totalScore} ageGroup={latest.skinScan.ageGroup} />
              </View>
              <Text style={styles.meta}>{shortMd(latest.date)} 측정 · 총 {records.length}회</Text>
            </View>
            <View style={styles.summaryCols}>
              <SummaryCol label="지난번 대비" delta={prev ? latest.skinScan.totalScore - prev.skinScan.totalScore : null} />
              <SummaryCol label="최근 흐름" delta={recentTrend} />
              <SummaryCol label="첫 측정 대비" delta={records.length > 1 ? latest.skinScan.totalScore - first.skinScan.totalScore : null} />
            </View>
          </View>

          {/* 그래프 */}
          <View style={[cardDecoration(), styles.chartCard]}>
            <View style={styles.tabs}>
              {METRIC_TABS.map((t) => {
                const on = t.key === metric;
                return (
                  <Pressable key={t.key} style={[styles.tab, on && styles.tabOn]} onPress={() => setMetric(t.key)}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TrendGraph
              records={records}
              metric={metric}
              selectedIdx={selIdx}
              onSelect={(i) => setSelectedId(records[i].id)}
            />
            <Text style={styles.chartHint}>점을 누르면 그날의 변화를 볼 수 있어요</Text>
          </View>

          {/* 고른 회차의 지난 회차 대비 변화 */}
          <View style={{ height: 12 }} />
          <BarrierChangeCard
            title={`${shortMd(selected.date)} 측정 결과`}
            current={selected.skinScan}
            previous={prevOfSelected?.skinScan ?? null}
            previousDate={prevOfSelected?.date}
          />
          <Pressable
            style={styles.detailBtn}
            onPress={() => navigation.navigate('MonitoringDetail', { folderId: folder.id, recordId: selected.id })}
          >
            <Text style={styles.detailBtnText}>{shortMd(selected.date)} 결과 상세 보기</Text>
            <MaterialIcons name="chevron-right" size={18} color={COLOR} />
          </Pressable>

          {/* 회차 목록 */}
          <Text style={styles.sectionLabel}>회차별 기록</Text>
          <View style={[cardDecoration(), { paddingHorizontal: 14 }]}>
            {[...records].reverse().map((r, i, arr) => {
              const idx = records.length - 1 - i;
              const before = idx > 0 ? records[idx - 1] : null;
              return (
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [styles.row, i !== arr.length - 1 && styles.rowLine, pressed && { opacity: 0.6 }]}
                  onPress={() => navigation.navigate('MonitoringDetail', { folderId: folder.id, recordId: r.id })}
                >
                  <LesionThumb photo={r.skinScan.photo ?? r.photo} size={42} style={undefined} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowDate}>{r.date.split('-').join('.')}</Text>
                    <Text style={styles.rowSub}>
                      주름 {Math.round(valueOf(r.skinScan, 'wrinkle') ?? 0)} · 모공 {Math.round(valueOf(r.skinScan, 'pore') ?? 0)} · 수분 {Math.round(valueOf(r.skinScan, 'moisture') ?? 0)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={styles.rowScore}>{Math.round(r.skinScan.totalScore)}</Text>
                    <DeltaText delta={before ? r.skinScan.totalScore - before.skinScan.totalScore : null} size={11.5} />
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={AppColors.sub} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryCol({ label, delta }: { label: string; delta: number | null }) {
  return (
    <View style={styles.summaryCol}>
      <Text style={styles.colLabel}>{label}</Text>
      {delta == null ? <Text style={styles.colNone}>-</Text> : <DeltaText delta={delta} size={13} withWord />}
    </View>
  );
}

function PeerBadge({ score, ageGroup }: { score: number; ageGroup?: string | null }) {
  const info = skinBarrierInfo(score, ageGroup);
  return (
    <View style={[styles.peer, { backgroundColor: info.color + '26' }]}>
      <View style={[styles.peerDot, { backgroundColor: info.color }]} />
      <Text style={styles.peerText}>{info.ko}</Text>
    </View>
  );
}

/**
 * 점수 추이 꺾은선 — x는 실제 날짜 간격, y는 기록 범위에 맞춘 확대 축(최소 10점 폭).
 * 지난 회차보다 오른 구간은 파랑, 내린 구간은 빨강 선분으로 칠해 호전·약화가 색으로도 보인다.
 */
function TrendGraph({
  records,
  metric,
  selectedIdx,
  onSelect,
}: {
  records: any[];
  metric: MetricKey;
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const [w, setW] = useState(0);
  const H = 190;
  const padL = 30, padR = 14, padT = 16, padB = 26;

  const vals = records.map((r) => valueOf(r.skinScan, metric) ?? 0);
  const ts = records.map((r) => new Date(r.date).getTime());

  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(10, hi - lo);
  const mid = (lo + hi) / 2;
  lo = Math.max(0, Math.floor((mid - span / 2 - 2) / 5) * 5);
  hi = Math.min(100, Math.ceil((mid + span / 2 + 2) / 5) * 5);
  if (hi - lo < 10) hi = Math.min(100, lo + 10);

  const plotW = Math.max(1, w - padL - padR);
  const plotH = H - padT - padB;
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const x = (i: number) => padL + (t1 > t0 ? ((ts[i] - t0) / (t1 - t0)) * plotW : plotW / 2);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;

  const step = (hi - lo) / 4;
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + k * step);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;

  const area =
    vals.length > 1
      ? `M${x(0)} ${y(vals[0])} ` +
        vals.map((v, i) => `L${x(i)} ${y(v)}`).join(' ') +
        ` L${x(vals.length - 1)} ${padT + plotH} L${x(0)} ${padT + plotH} Z`
      : '';

  // x축 라벨 — 처음·가운데·마지막
  const labelIdx = Array.from(new Set([0, Math.floor((records.length - 1) / 2), records.length - 1]));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="barrierFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={COLOR} stopOpacity={0.18} />
              <Stop offset="1" stopColor={COLOR} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={AppColors.line} strokeWidth={1} />
              <SvgText x={padL - 6} y={y(t) + 3.5} fontSize={10} fill={AppColors.sub} textAnchor="end">
                {Math.round(t)}
              </SvgText>
            </React.Fragment>
          ))}
          {/* 기간 평균선 */}
          <Line x1={padL} x2={w - padR} y1={y(avg)} y2={y(avg)} stroke={COLOR} strokeOpacity={0.45} strokeDasharray="4 4" />
          <SvgText x={w - padR} y={y(avg) - 4} fontSize={9.5} fill={COLOR} textAnchor="end">
            평균 {Math.round(avg)}
          </SvgText>
          {area !== '' && <Path d={area} fill="url(#barrierFill)" />}
          {/* 선 색은 피부 장벽 아이콘의 보라 하나로 통일 */}
          {vals.length > 1 && (
            <Path
              d={vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' ')}
              stroke={COLOR} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round"
            />
          )}
          {/* 고른 회차 세로선 */}
          <Line
            x1={x(selectedIdx)} x2={x(selectedIdx)} y1={padT} y2={padT + plotH}
            stroke={COLOR} strokeOpacity={0.35} strokeWidth={1}
          />
          {vals.map((v, i) => {
            const on = i === selectedIdx;
            return (
              <React.Fragment key={i}>
                <Circle cx={x(i)} cy={y(v)} r={on ? 6 : 4} fill={on ? COLOR : '#FFFFFF'} stroke={COLOR} strokeWidth={2} />
                {on && (
                  <SvgText x={x(i)} y={y(v) - 10} fontSize={11} fontWeight="bold" fill={AppColors.ink} textAnchor="middle">
                    {Math.round(v)}
                  </SvgText>
                )}
                {/* 손가락으로 누르기 쉽게 넓은 투명 영역 */}
                <Rect
                  x={x(i) - 14} y={padT} width={28} height={plotH}
                  fill="transparent"
                  onPress={() => onSelect(i)}
                />
              </React.Fragment>
            );
          })}
          {labelIdx.map((i) => (
            <SvgText
              key={`l${i}`}
              x={x(i)}
              y={H - 8}
              fontSize={10}
              fill={AppColors.sub}
              textAnchor={i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}
            >
              {shortMd(records[i].date)}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: AppColors.card,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.line,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: AppColors.ink },
  topSub: { fontSize: 11.5, fontWeight: '600', color: AppColors.sub, marginTop: 1 },
  measureBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLOR,
  },
  measureBtnText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },

  body: { padding: 16, paddingBottom: 32 },

  summary: { padding: 16, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: AppColors.sub },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  bigValue: { fontSize: 32, fontWeight: '800', color: AppColors.ink },
  meta: { fontSize: 11.5, color: AppColors.sub, marginTop: 2 },
  summaryCols: { flexDirection: 'row', marginTop: 14, gap: 8 },
  summaryCol: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: AppColors.bg },
  colLabel: { fontSize: 11, fontWeight: '700', color: AppColors.sub },
  colNone: { fontSize: 13, fontWeight: '800', color: AppColors.sub },
  peer: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  peerDot: { width: 7, height: 7, borderRadius: 4 },
  peerText: { fontSize: 11.5, fontWeight: '800', color: AppColors.ink },

  chartCard: { padding: 14 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, backgroundColor: AppColors.bg },
  tabOn: { backgroundColor: COLOR },
  tabText: { fontSize: 12, fontWeight: '700', color: AppColors.sub },
  tabTextOn: { color: '#FFFFFF' },
  chartHint: { fontSize: 11, color: AppColors.sub, textAlign: 'center', marginTop: 4 },

  detailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  detailBtnText: { fontSize: 13, fontWeight: '800', color: COLOR },

  sectionLabel: { fontSize: 13, fontWeight: '800', color: AppColors.sub, marginTop: 20, marginBottom: 8, paddingLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: AppColors.line },
  rowDate: { fontSize: 14, fontWeight: '800', color: AppColors.ink },
  rowSub: { fontSize: 11.5, color: AppColors.sub, marginTop: 4 },
  rowScore: { fontSize: 17, fontWeight: '800', color: AppColors.ink },

  empty: { margin: 16, padding: 28, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: AppColors.ink },
  emptyHint: { fontSize: 12, color: AppColors.sub, textAlign: 'center' },
});
