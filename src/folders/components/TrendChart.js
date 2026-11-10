/**
 * 수면 점수 · 가려움(VAS) · 피부 질환(IGA)를 하나의 결합 그래프에 겹쳐 그린다.
 * 세 지표 모두 theme.js의 DISPLAY_SCALE로 0~100 표시값으로 맞춰서 같은 축, 같은 25/50/75/100
 * 눈금 위에 그대로 겹쳐 그린다(다른 화면의 스케일 바·요약 박스와 완전히 같은 스케일).
 * 셋 다 같은 방식(꺾은선 + 점)으로 그려서, 색으로만 지표를 구분한다.
 *   - 수면 점수: 이미 0~100 → 그대로, 파란 꺾은선
 *   - 피부 질환 IGA(기댓값, 0~4의 연속값) × 25: 쿨 그레이 꺾은선
 *   - 가려움 VAS(0~10) × 10: 웜 브라운 꺾은선
 *
 * 점 하나(=촬영 1회)가 항상 POINT_W만큼의 고정 폭을 차지하도록 그려서, 기록이 많아
 * 한 화면에 안 들어가도 잘라내지 않고 옆으로 계속 이어지게 한다. 화면 쪽(부모)이
 * 이 그래프와 날짜/사진 행을 같은 가로 ScrollView 안에 두면 스크롤해도 서로 어긋나지 않는다.
 * 그래프 위에는 포인트 폭만큼의 투명 터치 영역을 겹쳐 그려서, 포인트를 한 번 탭하면
 * onSelect(record)로 선택만 바뀌어 그 날짜의 세로 폭 전체가 초록색 띠로 물들고(요약 박스도
 * 갱신), 같은 포인트를 다시 한번(두 번째) 탭하면 onDoubleSelect(record)로 그 기록의 상세
 * 결과로 넘어간다.
 *
 * 세로 높이는 부모가 넘겨주는 고정값 chartHeight를 그대로 쓴다 — 예전에는 남는 공간을 실측해서
 * 꽉 채우도록 계산했지만, 화면이 좁으면 그 계산이 어긋나면서 그래프 아래 날짜/사진 줄이 화면
 * 밖으로 밀려 잘리는 문제가 있었다. 고정 높이를 쓰고, 넘치면 부모 화면이 세로로 스크롤하게 하는
 * 편이 어떤 화면 크기에서도 안전하다.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { monitoringColors as mc, CHART_SERIES, DISPLAY_SCALE, scanGradientColor, SCAN_LEGEND_STOPS } from '../theme';

export const MIN_CHART_H = 150; // chartHeight를 안 넘겨줬을 때 쓰는 기본값
// 그래프 점 하나 = 점 아래 날짜/사진 칸과 반드시 같은 폭이어야 정렬됨. 세로를 키운 만큼 폭은
// 좁혀서(예전 64) 그래프가, 그리고 선택 시 물드는 띠(아래 selectedIndex Rect)가 길쭉하게 보이게 한다.
export const POINT_W = 50;
export const Y_AXIS_W = 34; // 왼쪽 y축 숫자 라벨 칼럼 폭 — 가로 스크롤과 무관하게 고정
const PAD_TOP = 16;
// 아래 여백을 넉넉히 둔다 — 너무 좁으면(예전 8) 가로 스크롤바(웹)가 y=0 선과 겹쳐 잘린 것처럼 보인다.
const PAD_BOTTOM = 22;

// 0(바닥)은 축 자체가 기준선이라 라벨을 따로 안 그리고, 가로줄 4개를 25 단위로 균등하게 긋는다
const GRID_VALUES = [100, 75, 50, 25];
const AXIS_MAX = 100;

// 그래프에 그리는 순서 — 뒤에 그릴수록 위에 겹쳐 보인다. 파란 수면 점수를 맨 위에 그려 항상 또렷하게 보이게 한다.
const SERIES_ORDER = ['skin', 'itch', 'sleep'];

export function chartContentWidth(n) {
  return Math.max(POINT_W, POINT_W * n);
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const xAt = (i) => (i + 0.5) * POINT_W;
const yAt = (v, h) => PAD_TOP + (1 - clamp01(v / AXIS_MAX)) * (h - PAD_TOP - PAD_BOTTOM);

// 정규화 — 다른 화면(요약 박스·상세 결과)과 같은 DISPLAY_SCALE로 셋 다 0~100 표시값으로 맞춘다
export const normalize = {
  sleep: (r) => r.sleepScore, // 0~100 그대로
  itch: (r) => DISPLAY_SCALE.itch(r.itchVas), // VAS(0~10) × 10 → 0~100
  skin: (r) => DISPLAY_SCALE.iga(r.iga), // IGA 기댓값(0~4) × 25 → 0~100
};

function toPointsAttr(pts) {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * 결합 그래프 본체 — 지표 이름은 TrendChartLegend가, 좌우 y축 숫자는 TrendChartYAxis가 각각
 * 스크롤 밖 고정 자리에 그린다. selectedId와 같은 기록의 폭 전체를 옅은 회색 띠로 칠해 어떤
 * 날짜가 선택되어 있는지 보여주고, 포인트를 탭하면 onSelect(record)로 선택을 바꾼다. 상세 결과는
 * 이 그래프에서 바로 넘어가지 않는다 — 아래 "피부 상태 상세 결과" 영역에서 그대로 펼쳐 본다.
 *
 * series로 그릴 지표를 줄일 수 있다 — 아토피가 아닌 폴더는 "피부 질환"(IGA) 자체가 근거
 * 없는 값이라 상위(MonitoringFolderScreen)가 ['itch', 'sleep']만 넘겨 그 선을 아예 뺀다.
 */
export default function TrendChart({ records, chartHeight = MIN_CHART_H, selectedId, onSelect, series = SERIES_ORDER }) {
  const n = records.length;
  const width = chartContentWidth(n);
  const h = chartHeight;
  const selectedIndex = Math.max(0, records.findIndex((r) => r.id === selectedId));

  const handlePress = (r) => {
    onSelect?.(r);
  };

  // 지표별 (x, y) 점 목록을 미리 계산해 둔다 — 꺾은선과 점 둘 다 이 좌표를 그대로 쓴다.
  const seriesPts = {};
  series.forEach((key) => {
    seriesPts[key] = records.map((r, i) => [xAt(i), yAt(normalize[key](r), h)]);
  });

  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h}>
        {/* 선택된 날짜를 가리키는 세로 띠 — 점선 대신 그 날짜의 폭(POINT_W) 전체를 옅은 회색으로
            칠해서 강조한다. 날짜 칸(위 DateCell)의 초록 배지와는 다른 색을 써서, 그래프 위 꺾은선
            색(피부 질환·가려움 안정도·수면 점수)과 초록이 겹쳐 헷갈리지 않게 한다. 그리드/
            데이터보다 먼저 그려서 뒤(배경)에 깔린다. 기본은 가장 최근 기록(오른쪽 끝). */}
        {records[selectedIndex] && (
          <Rect
            x={xAt(selectedIndex) - POINT_W / 2} y={0} width={POINT_W} height={h}
            fill={mc.sub} opacity={0.16}
          />
        )}

        {/* 가로줄 4개 — 25 단위로 균등한 위치, 왼쪽 y축과 같은 실제 값(25/50/75/100)을 쓴다 */}
        {GRID_VALUES.map((v) => {
          const y = yAt(v, h);
          return <Line key={`grid-${v}`} x1={0} y1={y} x2={width} y2={y} stroke={mc.line} strokeWidth={1} />;
        })}

        {/* 지표들을 같은 방식(꺾은선 + 점)으로 그린다 — 뒤에 그릴수록 위에 겹쳐 보인다 */}
        {series.map((key) => {
          const pts = seriesPts[key];
          const color = CHART_SERIES[key].color;
          return (
            <React.Fragment key={key}>
              {n > 1 && (
                <Polyline points={toPointsAttr(pts)} fill="none" stroke={color}
                  strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {records.map((r, i) => (
                <Circle key={`${key}-pt-${r.id}`} cx={pts[i][0]} cy={pts[i][1]}
                  r={i === selectedIndex ? 4.6 : 3.4} fill={color} stroke="#fff"
                  strokeWidth={i === selectedIndex ? 1.8 : 1.2} />
              ))}
            </React.Fragment>
          );
        })}
      </Svg>

      {/* 터치 영역 — 포인트 하나(POINT_W 폭)를 한 번 탭하면 그 날짜가 선택되고, 두 번 연속 탭(더블클릭)하면 상세 결과로 넘어간다 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', width, height: h }}>
          {records.map((r) => (
            <Pressable key={`hit-${r.id}`} style={{ width: POINT_W, height: h }} onPress={() => handlePress(r)} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** 그래프 왼쪽에 고정으로 붙는 y축 숫자 칼럼(0~100) — TrendChart의 가로줄과 같은 높이에 맞춰 그린다 */
export function TrendChartYAxis({ chartHeight = MIN_CHART_H }) {
  return (
    <View style={{ width: Y_AXIS_W, height: chartHeight }}>
      {GRID_VALUES.map((v) => (
        <Text key={v} style={[styles.axisLabel, { top: yAt(v, chartHeight) - 7 }]}>{v}</Text>
      ))}
    </View>
  );
}

/**
 * 세 지표가 한 그래프에 겹쳐 그려지므로, 무엇이 무슨 색인지 알려주는 범례 배지 — 그래프
 * 위에 겹쳐서 100 가로줄과 부딪히지 않도록, 그래프보다 먼저 일반 문서 흐름으로 그 위에 놓고
 * 쓴다(더 이상 absolute 겹침이 아니라 그래프를 아래로 밀어내는 자기 자리를 가진 한 줄이다).
 */
export function TrendChartLegend({ series = SERIES_ORDER }) {
  return (
    <View style={styles.legendRow}>
      {series.map((key) => {
        const s = CHART_SERIES[key];
        return (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.labelText}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * 피부상태측정 그라데이션 띠 — 결합 그래프 바로 아래, 같은 가로 스크롤 안에 놓여 날짜별 x 위치가
 * 꺾은선 점과 그대로 맞물린다. 각 회차 점수(0~100 연속값)를 scanGradientColor로 색에 옮기고, 그
 * 색을 회차 가운데(xAt)에 그라데이션 기준점으로 찍어 회차 사이가 부드럽게 이어지게 한다 — 아토피
 * 단계처럼 칸마다 딱 끊기지 않는다. 측정하지 않은 회차(skinScan 없음)는 회색 칸으로 덮는다.
 */
export const SCAN_BAND_H = 16;
export const SCAN_BAND_GAP = 8; // 그래프와 띠 사이 여백

export function SkinScanBand({ records, selectedId, onSelect }) {
  const width = chartContentWidth(records.length);
  const measured = records
    .map((r, i) => ({ i, score: r.skinScan?.totalScore }))
    .filter((p) => p.score != null);
  const selectedIndex = records.findIndex((r) => r.id === selectedId);
  const selectedScore = selectedIndex >= 0 ? records[selectedIndex].skinScan?.totalScore : null;
  const gradId = 'skinScanGrad';
  return (
    <View style={{ width, height: SCAN_BAND_H, marginTop: SCAN_BAND_GAP }}>
      <Svg width={width} height={SCAN_BAND_H}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2={String(width)} y2="0" gradientUnits="userSpaceOnUse">
            {/* react-native-svg의 LinearGradient는 자식을 전부 cloneElement 하므로 false/null 자식이
                섞이면 터진다 — `조건 && <Stop/>` 대신 항상 Stop만 담긴 배열을 넘긴다 */}
            {(measured.length > 0
              ? measured.map((p) => ({ key: String(p.i), offset: xAt(p.i) / width, color: scanGradientColor(p.score) }))
              : [{ key: 'none', offset: 0, color: NO_SCAN_COLOR }]
            ).map((s) => <Stop key={s.key} offset={String(s.offset)} stopColor={s.color} />)}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={SCAN_BAND_H} fill={`url(#${gradId})`} />
        {records.map((r, i) => (r.skinScan?.totalScore == null ? (
          <Rect key={`na-${r.id}`} x={i * POINT_W} y={0} width={POINT_W} height={SCAN_BAND_H} fill={NO_SCAN_COLOR} />
        ) : null))}
        {/* 고른 회차 칸 — 칸 안은 그 회차 점수의 색 하나로 칠한다 (그라데이션이 칸 안에서 섞이지 않게) */}
        {selectedIndex >= 0 && (
          <Rect
            x={selectedIndex * POINT_W + 1} y={1} width={POINT_W - 2} height={SCAN_BAND_H - 2}
            fill={selectedScore != null ? scanGradientColor(selectedScore) : NO_SCAN_COLOR}
            stroke={mc.ink} strokeWidth={1.6} rx={3}
          />
        )}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', width, height: SCAN_BAND_H }}>
          {records.map((r) => (
            <Pressable key={`scanhit-${r.id}`} style={{ width: POINT_W, height: SCAN_BAND_H }} onPress={() => onSelect?.(r)} />
          ))}
        </View>
      </View>
    </View>
  );
}

const NO_SCAN_COLOR = '#E4E7EB';

/*
  ───────── 피부 장벽 점수 꺾은선 (피부 장벽 폴더 전용) ─────────

  예전에는 점수를 그라데이션 띠(SkinScanBand)의 색으로만 보여줘서 "몇 점이 올랐는지"가 안 읽혔다.
  장벽 점수는 연속값이라 1~2점의 작은 호전·약화를 보는 게 핵심이므로, y축을 0~100 고정이 아니라
  **기록 범위에 맞춰 확대**한다(최소 10점 폭, 5점 단위 눈금). 날짜 칸과 같은 POINT_W 폭을 써서
  같은 가로 스크롤 안에서 날짜와 점이 맞물린다. y축 숫자는 BarrierScoreYAxis가 스크롤 밖에 그린다.
*/
export const BARRIER_CHART_H = 200;

/** 점수 범위 → 확대한 y축 [lo, hi]와 눈금(위→아래) */
export function barrierAxis(records) {
  const vals = records.map((r) => r.skinScan?.totalScore).filter((v) => v != null);
  if (vals.length === 0) return { lo: 50, hi: 100, ticks: [100, 87.5, 75, 62.5, 50] };
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(10, max - min);
  const mid = (min + max) / 2;
  let lo = Math.max(0, Math.floor((mid - span / 2 - 2) / 5) * 5);
  let hi = Math.min(100, Math.ceil((mid + span / 2 + 2) / 5) * 5);
  if (hi - lo < 10) { if (hi + 5 <= 100) hi += 5; else lo -= 5; }
  const step = (hi - lo) / 4;
  return { lo, hi, ticks: [0, 1, 2, 3, 4].map((k) => hi - k * step) };
}

const yIn = (v, lo, hi, h) => PAD_TOP + (1 - clamp01((v - lo) / (hi - lo))) * (h - PAD_TOP - PAD_BOTTOM);


export function BarrierScoreChart({ records, chartHeight = BARRIER_CHART_H, selectedId, onSelect, color }) {
  const n = records.length;
  const width = chartContentWidth(n);
  const h = chartHeight;
  const { lo, hi, ticks } = barrierAxis(records);
  const selectedIndex = Math.max(0, records.findIndex((r) => r.id === selectedId));
  const pts = records.map((r, i) =>
    r.skinScan?.totalScore != null ? { i, v: r.skinScan.totalScore, x: xAt(i), y: yIn(r.skinScan.totalScore, lo, hi, h) } : null,
  );
  const measured = pts.filter(Boolean);
  const sel = pts[selectedIndex];

  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h}>
        {records[selectedIndex] && (
          <Rect x={xAt(selectedIndex) - POINT_W / 2} y={0} width={POINT_W} height={h} fill={mc.sub} opacity={0.16} />
        )}
        {ticks.map((t) => (
          <Line key={`bg-${t}`} x1={0} x2={width} y1={yIn(t, lo, hi, h)} y2={yIn(t, lo, hi, h)} stroke={mc.line} strokeWidth={1} />
        ))}
        {/* 선 색은 피부 장벽 아이콘의 보라 하나로 통일한다 */}
        {measured.length > 1 && (
          <Polyline
            points={measured.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke={color} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"
          />
        )}
        {measured.map((p) => {
          const on = p.i === selectedIndex;
          return (
            <Circle key={`bp-${p.i}`} cx={p.x} cy={p.y} r={on ? 5.2 : 3.8}
              fill={on ? color : '#fff'} stroke={color} strokeWidth={2} />
          );
        })}
      </Svg>
      {/* 고른 회차 점수 — 점 바로 위 */}
      {sel && (
        <Text style={[styles.pointLabel, { left: sel.x - 20, top: Math.max(0, sel.y - 22) }]}>{Math.round(sel.v)}</Text>
      )}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', width, height: h }}>
          {records.map((r) => (
            <Pressable key={`bhit-${r.id}`} style={{ width: POINT_W, height: h }} onPress={() => onSelect?.(r)} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** 장벽 점수 그래프 왼쪽 고정 y축 — BarrierScoreChart와 같은 확대 범위·눈금 */
export function BarrierScoreYAxis({ records, chartHeight = BARRIER_CHART_H }) {
  const { lo, hi, ticks } = barrierAxis(records);
  return (
    <View style={{ width: Y_AXIS_W, height: chartHeight }}>
      {ticks.map((t) => (
        <Text key={t} style={[styles.axisLabel, { top: yIn(t, lo, hi, chartHeight) - 7 }]}>
          {Number.isInteger(t) ? t : t.toFixed(1)}
        </Text>
      ))}
    </View>
  );
}

/** 장벽 그래프 범례 */
export function BarrierScoreLegend({ color }) {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.labelText}>피부 장벽 점수</Text>
      </View>
    </View>
  );
}

/** 띠 범례 — "피부 장벽" 이름 옆에 낮음(왼쪽)→높음(오른쪽) 그라데이션 견본을 붙인다 */
export function SkinScanLegend() {
  const W = 72;
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendItem}>
        <Text style={styles.labelText}>피부 장벽</Text>
        <Text style={styles.scanLegendEnd}>낮음</Text>
        <Svg width={W} height={8}>
          <Defs>
            <LinearGradient id="scanLegendGrad" x1="0" y1="0" x2="1" y2="0">
              {SCAN_LEGEND_STOPS.map((s) => <Stop key={s.offset} offset={String(s.offset)} stopColor={s.color} />)}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={8} rx={4} fill="url(#scanLegendGrad)" />
        </Svg>
        <Text style={styles.scanLegendEnd}>높음</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scanLegendEnd: { fontSize: 10, color: mc.sub, fontWeight: '600' },
  legendRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 3, paddingBottom: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pointLabel: {
    position: 'absolute', width: 40, textAlign: 'center',
    fontSize: 11.5, fontWeight: '800', color: mc.ink,
  },
  labelText: { fontSize: 10.5, color: mc.ink, fontWeight: '600' },
  axisLabel: {
    position: 'absolute', right: 6, fontSize: 10, color: mc.sub,
    textAlign: 'right', width: Y_AXIS_W - 6,
  },
});
