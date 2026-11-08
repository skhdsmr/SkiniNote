/**
 * 부위 경과 그래프 — 이전 결합 그래프와 같은 형태: 세 축(염증 활동 · 긁은 상처 · 두꺼워진 피부)을
 * 한 그래프에 겹쳐 그린다.
 *
 *  - y축: 기준일 대비 변화율(%), 0선 = 기준일, 위쪽 = 나빠짐
 *  - x축: 점 간격 균등(날짜 칸과 같은 폭), 선택한 날은 회색 띠 + 초록 날짜 배지
 *  - 빈 원: 기준일, 그리고 최소 비교 간격이 안 찬 점(두꺼워진 피부 4주)
 *  - 점이나 날짜 칸을 누르면 onSelect(record) — 아래 사진 비교가 그날로 바뀐다
 */
import React, { useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle } from 'react-native-svg';
import { AXES, PCT_LIMIT, axisPoints } from '../progress';
import { monitoringColors as mc, CHART_SERIES } from '../theme';

const CHART_H = 190;
const PAD_Y = 16;
const POINT_W = 50; // 점 하나 = 날짜 칸 하나, 같은 폭 — 이전 결합 그래프와 같다
const Y_AXIS_W = 34;
const DATE_ROW_H = 56;
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const TICKS = [100, 50, 0, -50, -100];
// 이전 그래프의 시리즈 색을 그대로 이어 쓴다
const AXIS_COLOR = { inflam: CHART_SERIES.skin.color, scratch: CHART_SERIES.itch.color, thick: CHART_SERIES.sleep.color };
const y = (pct) => PAD_Y + (1 - (pct + PCT_LIMIT) / (PCT_LIMIT * 2)) * (CHART_H - PAD_Y * 2);
const xAt = (i) => (i + 0.5) * POINT_W;

/**
 * 세 축을 한 그래프에 **겹쳐** 그린다(이전 결합 그래프와 같은 형태) — 같은 y축(기준일 대비 %), 같은
 * 눈금, 점 간격 균등, 날짜 칸 줄 + 선택 날짜 회색 띠 + 하단 범례. 점은 기준일/판정 전이면 빈 원.
 */
export default function ProgressGraphs({ records, baseIdx, selectedId, onSelect }) {
  const shown = records.slice(baseIdx);
  const width = Math.max(POINT_W, shown.length * POINT_W);
  const selIdx = Math.max(0, shown.findIndex((r) => r.id === selectedId));
  const sel = shown[selIdx >= 0 && selectedId ? selIdx : shown.length - 1];
  const selI = shown.indexOf(sel);
  const series = AXES.map((axis) => ({ axis, pts: axisPoints(records, baseIdx, axis), color: AXIS_COLOR[axis.key] }));
  const scrollRef = useRef(null);

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: Y_AXIS_W }}>
          <View style={{ height: DATE_ROW_H }} />
          <View style={{ height: CHART_H }}>
            {TICKS.map((v) => (
              <Text key={v} style={[styles.tick, { top: y(v) - 7 }]}>{v > 0 ? `+${v}` : v}</Text>
            ))}
          </View>
        </View>
        <ScrollView ref={scrollRef} horizontal style={{ flex: 1 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          <View style={{ width }}>
            <View style={{ flexDirection: 'row', height: DATE_ROW_H }}>
              {shown.map((r) => {
                const d = new Date(r.ts);
                const on = r.id === sel.id;
                return (
                  <Pressable key={r.id} style={styles.dateCell} onPress={() => onSelect?.(r)}>
                    <View style={[styles.dateInner, on && styles.dateInnerOn]}>
                      <Text style={[styles.dateWeek, on && styles.dateTextOn]}>{WEEKDAY_KO[d.getDay()]}</Text>
                      <Text style={[styles.dateDay, on && styles.dateTextOn]}>{d.getMonth() + 1}/{d.getDate()}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ width, height: CHART_H }}>
              <Svg width={width} height={CHART_H}>
                <Rect x={xAt(selI) - POINT_W / 2} y={0} width={POINT_W} height={CHART_H} fill={mc.sub} opacity={0.16} />
                {TICKS.map((v) => (
                  <Line key={v} x1={0} y1={y(v)} x2={width} y2={y(v)} stroke={v === 0 ? '#C9CDD3' : mc.line}
                    strokeWidth={1} strokeDasharray={v === 0 ? '3,3' : undefined} />
                ))}
                {series.map(({ axis, pts, color }) => (
                  <React.Fragment key={axis.key}>
                    {pts.length > 1 && (
                      <Polyline points={pts.map((p, i) => `${xAt(i)},${y(p.pct)}`).join(' ')}
                        fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {pts.map((p, i) => {
                      const hollow = p.isBase || !p.valid;
                      const on = i === selI;
                      return (
                        <Circle key={p.record.id} cx={xAt(i)} cy={y(p.pct)} r={on ? 4.6 : 3.4}
                          fill={hollow ? '#fff' : color} stroke={hollow ? color : '#fff'}
                          strokeWidth={hollow ? 1.8 : on ? 1.8 : 1.2} />
                      );
                    })}
                  </React.Fragment>
                ))}
              </Svg>
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <View style={{ flexDirection: 'row', width, height: CHART_H }}>
                  {shown.map((r) => (
                    <Pressable key={`hit-${r.id}`} style={{ width: POINT_W, height: CHART_H }} onPress={() => onSelect?.(r)} />
                  ))}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
      <View style={styles.legendRow}>
        {series.map(({ axis, color }) => (
          <View key={axis.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{axis.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>0선 = 기준일 · 위쪽 = 나빠짐 · 빈 원 = 기준일/판정 전(두꺼워진 피부는 4주 후부터)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tick: { position: 'absolute', right: 6, width: Y_AXIS_W - 6, textAlign: 'right', fontSize: 10, color: mc.sub },
  dateCell: { width: POINT_W, alignItems: 'center', justifyContent: 'center' },
  dateInner: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, minWidth: 42 },
  dateInnerOn: { backgroundColor: mc.greenTop },
  dateWeek: { fontSize: 11.5, fontWeight: '700', color: mc.sub },
  dateDay: { fontSize: 14, fontWeight: '800', color: mc.ink, marginTop: 2 },
  dateTextOn: { color: mc.greenDeep },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 3, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10.5, color: mc.ink, fontWeight: '600' },
  note: { fontSize: 10.5, color: mc.sub, marginTop: 8 },
});
