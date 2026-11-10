import React, { useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { AppColors, cardDecoration } from '../theme';
import { addDaysKey, daysBetween } from '../folders/store';
import { BARRIER_SERIES, CHART_SERIES, DISPLAY_SCALE, NO_GRADE_COLOR, skinConditionInfo } from '../folders/theme';
import { useRoutines } from '../context/RoutineContext';

// 홈 화면 상태 카드와 같은 지표 아이콘 (흰 그림 + 지표 색 원)
const BARRIER_ICON = require('../../assets/icon/barrier_icon_white.png');
const ITCH_ICON = require('../../assets/icon/itch_icon_white.png');
const SLEEP_ICON = require('../../assets/icon/sleep_icon_white.png');

/**
 * 전신 경과 (사람 단위) — 지켜보는 모든 자리의 변화와 가려움 · 수면 · 루틴 이행을 **한 표에서** 주 단위로 본다.
 *
 *   표    : 행 = 자리, 열 = 주(週). 칸 색 = 그 주 마지막 기록의 IGA 중증도 — **위 전신 지도의 동그라미와
 *           같은 값·같은 색**(가장 나쁜 병변의 IGA → SKIN_SEGMENTS 4단계, 아토피가 아니면 회색).
 *           슬라이더가 가리키는 주는 그 날짜까지의 마지막 기록을 써서 지도와 똑같은 기록을 가리킨다.
 *   가려움 안정도 · 수면 점수 : 한 그래프에 겹친 주별 평균 꺾은선 — 경과 관찰 그래프(TrendChart)와 같은 0~100 표시값,
 *     같은 25/50/75/100 눈금, 같은 색(CHART_SERIES)을 쓴다
 *   루틴  : BT4 · 음압 패치 주별 이행 — 그 주 절반 이상 챙겼으면 O, 아니면 X
 *
 * **위 지도 슬라이더와 맞물린다.** 슬라이더가 가리키는 날이 들어 있는 주의 열 전체에 띠가 깔리고
 * 날짜 글자가 강조된다. 그 주가 표 밖이면 표가 그 주까지 옮겨 간다(가운데 오게). 거꾸로 열(날짜·칸)을
 * 누르면 슬라이더가 그 주의 마지막 날로 옮겨 가고 지도도 그 시점으로 바뀐다.
 */

export interface TimelineSite {
  folderId: string;
  label: string;
  records: any[];
  gradable: boolean;
}

/** 한 화면에 보이는 주 수 — 휴대폰 폭에서 칸이 너무 작아지지 않는 최대치 */
const VISIBLE_WEEKS = 8;
const LABEL_W = 78;
const CELL_GAP = 5;
const ROW_H = 26;
const CHART_H = 124;
/** 경과 관찰 그래프와 같은 눈금 — 0은 바닥선 */
const GRID_VALUES = [100, 75, 50, 25];

/**
 * 기록 하나의 대표 IGA — 전신 지도(WholeBodyResultScreen groupMarkers)와 같은 규칙:
 * 병변별 IGA(lesionAreaRegions)가 있으면 그중 **가장 나쁜 값**, 없으면 기록 전체의 IGA.
 */
export function worstIgaOf(record: any): number {
  const regions: { iga: number }[] | null = record?.lesionAreaRegions ?? null;
  return regions?.length ? Math.max(...regions.map((r) => r.iga)) : record.iga;
}

/** 기록 없는 주 칸 */
const EMPTY_BORDER = '#D7DBE0';

const ITCH_COLOR = CHART_SERIES.itch.color;
const SLEEP_COLOR = CHART_SERIES.sleep.color;
/** 피부 장벽 점수 — 피부 장벽 아이콘·장벽 그래프와 같은 보라 */
const BARRIER_COLOR = BARRIER_SERIES.color;
/** 루틴 이행 O 기준 — 그 주에 챙겨야 했던 횟수 중 이만큼 이상 체크했으면 O */
const ROUTINE_OK_RATE = 0.5;
const OX_O_COLOR = '#3E9B4F';
const OX_X_COLOR = '#E2584B';
const SELECT_BAND = 'rgba(147, 210, 88, 0.16)';

export default function WholeBodyTimeline({
  sites,
  today,
  span,
  selectedKey,
  onSelectDay,
  healthConnected,
  barrierRecords = [],
  onOpenSite,
  onOpenBarrier,
}: {
  sites: TimelineSite[];
  today: string;
  /** 슬라이더 범위(가장 오래된 기록 ~ 오늘, 일 수) */
  span: number;
  selectedKey: string;
  /** 슬라이더 값(0 = 가장 오래된 날, span = 오늘)으로 옮긴다 */
  onSelectDay: (dayIndex: number) => void;
  healthConnected: boolean;
  /** 피부 장벽 폴더의 기록 — 그래프에 장벽 점수 선을 하나 더 그린다 (몸의 자리가 아니라 표 행에는 없다) */
  barrierRecords?: any[];
  /** 행 이름(예: "몸통 아토피")을 누르면 그 자리의 경과 관찰 페이지로 */
  onOpenSite?: (folderId: string) => void;
  /** 범례의 "피부 장벽 ›"을 누르면 피부 장벽 경과 관찰 페이지로 */
  onOpenBarrier?: () => void;
}) {
  const { adherenceRate } = useRoutines();
  const [gridW, setGridW] = useState(0);

  // 주 단위 열 — 마지막 열이 오늘로 끝난다. 열 i = [end-6, end]
  const totalWeeks = Math.max(1, Math.ceil((span + 1) / 7));
  const weekEnd = (w: number) => addDaysKey(today, -(totalWeeks - 1 - w) * 7);
  const weekStart = (w: number) => addDaysKey(weekEnd(w), -6);
  const weekOf = (key: string) =>
    Math.min(totalWeeks - 1, Math.max(0, totalWeeks - 1 - Math.floor(daysBetween(key, today) / 7)));

  const selectedWeek = weekOf(selectedKey);
  const n = Math.min(VISIBLE_WEEKS, totalWeeks);
  // 고른 주가 최근 n주 안이면 최근 창 그대로, 아니면 그 주가 가운데 오도록 창을 옮긴다
  const startWeek =
    selectedWeek >= totalWeeks - n ? totalWeeks - n : Math.max(0, selectedWeek - Math.floor(n / 2));
  const weeks = Array.from({ length: n }, (_, i) => startWeek + i);

  const colW = gridW > 0 ? (gridW - LABEL_W) / n : 0;
  const colX = (i: number) => LABEL_W + i * colW;
  const colCenter = (i: number) => colX(i) + colW / 2 - LABEL_W; // 차트 SVG(라벨 칸 제외) 안의 x

  const inWeek = (key: string, w: number) =>
    daysBetween(weekStart(w), key) >= 0 && daysBetween(key, weekEnd(w)) >= 0;

  const selectWeek = (w: number) => {
    // 그 주의 마지막 날(단, 오늘을 넘지 않게)로 슬라이더를 옮긴다
    const end = weekEnd(w);
    onSelectDay(Math.max(0, Math.min(span, span - daysBetween(end, today))));
  };

  /**
   * 자리 × 주 칸 색 — 그 주의 마지막 기록의 IGA 중증도 색. 고른 주는 슬라이더 날짜까지만 본다
   * (지도가 그 날짜 기준 마지막 기록을 그리므로 같은 기록을 가리키게). 기록이 없으면 null(점선 칸).
   */
  const cellColor = (site: TimelineSite, w: number): string | null => {
    const cutoff = w === selectedWeek ? selectedKey : weekEnd(w);
    const inside = site.records.filter((r) => daysBetween(weekStart(w), r.date) >= 0 && daysBetween(r.date, cutoff) >= 0);
    if (!inside.length) return null;
    if (!site.gradable) return NO_GRADE_COLOR;
    return skinConditionInfo(DISPLAY_SCALE.iga(worstIgaOf(inside[inside.length - 1]))).color;
  };

  // ── 주별 평균 — 모든 자리의 그 주 기록을 모아 평균한 뒤 0~100 표시값으로 (경과 관찰 그래프와 같은 환산)
  const weekAvg = (field: 'itchVas' | 'sleepScore', toDisplay: (v: number) => number) =>
    weeks.map((w) => {
      const vals = sites.flatMap((s) => s.records.filter((r) => inWeek(r.date, w)).map((r) => r[field])).filter(
        (v) => typeof v === 'number',
      );
      return vals.length ? toDisplay(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null;
    });
  // 가려움 안정도 = 100 - VAS×10 (높을수록 좋음) / 수면 점수 = 원래 0~100
  const itch = useMemo(() => weekAvg('itchVas', DISPLAY_SCALE.itch), [sites, startWeek, n, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const sleep = useMemo(() => weekAvg('sleepScore', (v) => v), [sites, startWeek, n, today]); // eslint-disable-line react-hooks/exhaustive-deps
  // 피부 장벽 점수 — 그 주에 잰 장벽 총점의 평균 (원래 0~100, 높을수록 좋음)
  const barrier = useMemo(
    () =>
      weeks.map((w) => {
        const vals = barrierRecords
          .filter((r) => r.skinScan?.totalScore != null && inWeek(r.date, w))
          .map((r) => r.skinScan.totalScore as number);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }),
    [barrierRecords, startWeek, n, today], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── 루틴 이행 (등록된 제품만)
  const toDate = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const routines = ['BT4 Complex', '음압 패치']
    .map((name) => ({
      name,
      short: name === 'BT4 Complex' ? 'BT4' : '음압',
      rates: weeks.map((w) => adherenceRate(name, toDate(weekStart(w)), toDate(weekEnd(w)))),
    }))
    .filter((r) => r.rates.some((v) => v != null));

  const selIdx = weeks.indexOf(selectedWeek);
  const md = (key: string) => {
    const [, m, d] = key.split('-').map(Number);
    return `${m}/${d}`;
  };

  return (
    <View style={[cardDecoration(), styles.card]}>
      <View onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
        {gridW > 0 && (
          <>
            {/* 고른 주 — 표·차트·루틴을 가로지르는 띠 */}
            {selIdx >= 0 && (
              <View
                pointerEvents="none"
                style={[styles.band, { left: colX(selIdx) + 1, width: colW - 2 }]}
              />
            )}

            {/* 주 라벨 (그 주의 첫날) */}
            <View style={styles.row}>
              <View style={{ width: LABEL_W }} />
              {weeks.map((w, i) => (
                <Pressable key={w} style={{ width: colW, alignItems: 'center' }} onPress={() => selectWeek(w)} hitSlop={6}>
                  <Text style={[styles.weekLabel, i === selIdx && styles.weekLabelOn]}>{md(weekStart(w))}</Text>
                </Pressable>
              ))}
            </View>

            {/* 자리 × 주 */}
            {sites.map((site) => (
              <View key={site.folderId} style={[styles.row, { height: ROW_H + CELL_GAP }]}>
                <Pressable
                  style={({ pressed }) => [styles.rowLabelBtn, pressed && { opacity: 0.5 }]}
                  onPress={() => onOpenSite?.(site.folderId)}
                  disabled={!onOpenSite}
                  hitSlop={4}
                >
                  <Text style={styles.rowLabelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {site.label}
                  </Text>
                  {onOpenSite && <Text style={styles.rowLabelArrow}>›</Text>}
                </Pressable>
                {weeks.map((w, i) => {
                  const color = cellColor(site, w);
                  return (
                    <Pressable key={w} style={{ width: colW, alignItems: 'center' }} onPress={() => selectWeek(w)}>
                      <View
                        style={[
                          styles.cell,
                          { width: colW - CELL_GAP },
                          color
                            ? { backgroundColor: color, borderColor: color }
                            : { backgroundColor: 'transparent', borderColor: EMPTY_BORDER, borderStyle: 'dashed' },
                          i === selIdx && styles.cellOn,
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ))}

            {/* 가려움 안정도 + 수면 점수 + 피부 장벽 점수 — 경과 관찰 그래프처럼 한 그래프(0~100)에 겹쳐 그린다.
                수면 점수는 스마트워치를 연동했을 때만 선이 있다. */}
            <View style={[styles.seriesLegend, { marginTop: 8, zIndex: 2, elevation: 2 }]}>
              {/* 피부 장벽 점수를 맨 왼쪽에 */}
              {/* 행 이름("몸통 아토피 ›")과 같은 규칙 — › 가 붙은 이름은 누르면 경과 관찰 페이지로 */}
              <SeriesKey icon={BARRIER_ICON} color={BARRIER_COLOR} label="피부 장벽" onPress={onOpenBarrier} />
              <SeriesKey icon={ITCH_ICON} color={ITCH_COLOR} label={CHART_SERIES.itch.label} />
              <SeriesKey
                icon={SLEEP_ICON}
                color={SLEEP_COLOR}
                label={healthConnected ? CHART_SERIES.sleep.label : `${CHART_SERIES.sleep.label} (미연동)`}
              />
            </View>
            <WeekLine
              series={[
                { values: itch, color: ITCH_COLOR },
                ...(healthConnected ? [{ values: sleep, color: SLEEP_COLOR }] : []),
                { values: barrier, color: BARRIER_COLOR },
              ]}
              max={100}
              colCenter={colCenter}
              width={gridW - LABEL_W}
              selIdx={selIdx}
            />

            {/* 루틴 이행 */}
            {routines.length > 0 && (
              <>
                {/* 제목 없이 BT4 · 음압 줄만 — 그래프와 살짝 띄운다 */}
                <View style={{ height: 8 }} />
                {routines.map((r) => (
                  <View key={r.name} style={[styles.row, { height: ROW_H + CELL_GAP }]}>
                    <Text style={styles.rowLabel}>{r.short}</Text>
                    {/* 그 주에 챙겨야 했던 횟수의 절반 이상을 체크했으면 O, 아니면 X. 그 주에 할 날이 없었으면 비운다 */}
                    {r.rates.map((rate, i) => {
                      const ok = rate != null && rate >= ROUTINE_OK_RATE;
                      return (
                        <View key={i} style={{ width: colW, alignItems: 'center' }}>
                          <View
                            style={[
                              styles.cell,
                              styles.oxCell,
                              { width: colW - CELL_GAP },
                              rate == null && { borderColor: '#D7DBE0', borderStyle: 'dashed' },
                              i === selIdx && styles.cellOn,
                            ]}
                          >
                            {rate != null && (
                              <Text style={[styles.oxText, { color: ok ? OX_O_COLOR : OX_X_COLOR }]}>{ok ? 'O' : 'X'}</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            {/* 열 전체 터치 영역 — 칸·그래프·O/X·빈 여백 어디를 눌러도 그 주로 옮긴다.
                맨 위에 겹쳐 두되 왼쪽 행 이름 칸(LABEL_W)은 비워 둬서 "몸통 아토피 ›" 등은 그대로 눌린다.
                (그래프 위 범례 "피부 장벽 ›"은 이 영역 안이라 범례 줄만 따로 위로 올린다 — 아래 seriesLegend) */}
            <View style={[StyleSheet.absoluteFill, { left: LABEL_W, flexDirection: 'row' }]}>
              {weeks.map((w) => (
                <Pressable key={`col-${w}`} style={{ width: colW, height: '100%' }} onPress={() => selectWeek(w)} />
              ))}
            </View>
          </>
        )}
      </View>

    </View>
  );
}

/** 그래프 범례 한 칸 — 홈 상태 카드와 같은 아이콘(지표 색 원 + 흰 그림) + 이름 */
function SeriesKey({
  icon,
  color,
  label,
  onPress,
}: {
  icon: ImageSourcePropType;
  color: string;
  label: string;
  /** 있으면 누를 수 있는 칸 — 이름 뒤에 › 를 붙인다 */
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.seriesKey, pressed && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
    >
      <View style={[styles.seriesIcon, { backgroundColor: color }]}>
        <Image source={icon} style={{ width: 13, height: 13 }} resizeMode="contain" />
      </View>
      <Text style={styles.seriesText}>{label}</Text>
      {onPress && <Text style={styles.rowLabelArrow}>›</Text>}
    </Pressable>
  );
}

/** 주별 값 꺾은선(여러 지표를 한 그래프에) — 열 가운데에 점, 값이 없는 주는 선을 끊는다. 고른 주의 점은 크게 */
function WeekLine({
  series,
  max,
  colCenter,
  width,
  selIdx,
}: {
  series: { values: (number | null)[]; color: string }[];
  max: number;
  colCenter: (i: number) => number;
  width: number;
  selIdx: number;
}) {
  const pad = 8;
  const y = (v: number) => pad + (1 - Math.min(1, Math.max(0, v / max))) * (CHART_H - pad * 2);
  // 값이 이어지는 구간끼리 묶어 선을 긋는다
  const runsOf = (values: (number | null)[]) => {
    const runs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    values.forEach((v, i) => {
      if (v == null) {
        if (cur.length) runs.push(cur);
        cur = [];
      } else cur.push({ x: colCenter(i), y: y(v) });
    });
    if (cur.length) runs.push(cur);
    return runs;
  };

  return (
    <View style={{ flexDirection: 'row', height: CHART_H }}>
      {/* y축 숫자 — 경과 관찰 그래프와 같은 100/75/50/25 */}
      <View style={{ width: LABEL_W, height: CHART_H }}>
        {GRID_VALUES.map((g) => (
          <Text key={g} style={[styles.axisLabel, { top: y(g) - 7 }]}>
            {g}
          </Text>
        ))}
      </View>
      <Svg width={width} height={CHART_H}>
        {GRID_VALUES.map((g) => (
          <Line key={g} x1={0} x2={width} y1={y(g)} y2={y(g)} stroke={AppColors.line} strokeWidth={1} />
        ))}
        <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={AppColors.line} strokeWidth={1} />
        {series.map(({ values, color }, si) => (
          <React.Fragment key={si}>
            {runsOf(values).map((run, k) =>
              run.length > 1 ? (
                <Polyline
                  key={k}
                  points={run.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {values.map((v, i) =>
              v == null ? null : (
                <Circle
                  key={i}
                  cx={colCenter(i)}
                  cy={y(v)}
                  r={i === selIdx ? 5 : 3.2}
                  fill={color}
                  stroke="#FFFFFF"
                  strokeWidth={i === selIdx ? 1.6 : 0}
                />
              ),
            )}
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },

  band: { position: 'absolute', top: 0, bottom: 0, borderRadius: 8, backgroundColor: SELECT_BAND },
  row: { flexDirection: 'row', alignItems: 'center' },
  weekLabel: { fontSize: 10.5, fontWeight: '600', color: AppColors.sub, paddingVertical: 4 },
  weekLabelOn: { color: AppColors.greenMuted, fontWeight: '800' },
  rowLabelBtn: { width: LABEL_W, flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  rowLabelText: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: AppColors.ink },
  rowLabelArrow: { fontSize: 15, fontWeight: '700', color: AppColors.sub, marginLeft: 2 },
  rowLabel: { width: LABEL_W, fontSize: 12.5, fontWeight: '700', color: AppColors.ink },
  cell: { height: ROW_H - 3, borderRadius: 6, borderWidth: 1.3 },
  oxCell: { alignItems: 'center', justifyContent: 'center', borderColor: '#D7DBE0', backgroundColor: '#FFFFFF' },
  oxText: { fontSize: 13, fontWeight: '900' },
  // 고른 주 표시 — 기록 없는 점선 칸이어도 고르면 실선으로 (선택 테두리는 항상 같은 모양)
  cellOn: { borderWidth: 2.5, borderColor: AppColors.ink, borderStyle: 'solid' },

  axisLabel: { position: 'absolute', right: 8, fontSize: 10, color: AppColors.sub },
  seriesLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6, marginBottom: 2 },
  seriesKey: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seriesIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seriesText: { fontSize: 10.5, fontWeight: '600', color: AppColors.ink },

});
