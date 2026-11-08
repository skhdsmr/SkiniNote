/**
 * 부위 경과 그래프 — 이전 결합 그래프와 같은 형태로 증상 4종(피부 붉기 · 오돌토돌함 · 긁은 상처 ·
 * 피부 두꺼워짐)을 한 그래프에 겹쳐 그린다.
 *
 *  - y축: 점수가 아니라 **4단계 이름** 그대로 — 없음 / 미미함 / 두드러짐 / 뚜렷함 (위쪽 = 더 심함)
 *  - x축: 점 간격 균등(날짜 칸과 같은 폭), 선택한 날은 회색 띠 + 초록 날짜 배지
 *  - 같은 단계에 점이 겹치면 가려지므로 증상마다 아주 조금씩 위아래로 비켜 그린다
 *  - 점이나 날짜 칸을 누르면 onSelect(record) — 아래 사진 비교가 그날로 바뀐다
 */
import React, { useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle } from 'react-native-svg';
import { monitoringColors as mc } from '../theme';
import { symptomLevel, levelInfo } from '../../symptoms/groups';

const CHART_H = 190;
const PAD_Y = 22;
const POINT_W = 50; // 점 하나 = 날짜 칸 하나, 같은 폭 — 이전 결합 그래프와 같다
const Y_AXIS_W = 52;
const DATE_ROW_H = 56;
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const LEVELS = [3, 2, 1, 0]; // 위에서 아래로: 뚜렷함 → 없음
const SERIES = [
  { key: 'redness', label: '피부 붉기', color: '#E36657' },
  { key: 'bumps', label: '오돌토돌함', color: '#D9A21B' },
  { key: 'scratch', label: '긁은 상처', color: '#0F9488' },
  { key: 'thickening', label: '피부 두꺼워짐', color: '#1E3A8A' },
];
const JITTER = 3; // 같은 단계에서 겹치지 않게 증상별로 비키는 폭(px)
const y = (level) => PAD_Y + (1 - level / 3) * (CHART_H - PAD_Y * 2);
const yOf = (level, i) => y(level) + (i - 1.5) * JITTER;
const xAt = (i) => (i + 0.5) * POINT_W;

export default function ProgressGraphs({ records, selectedId, onSelect }) {
  const shown = records;
  const width = Math.max(POINT_W, shown.length * POINT_W);
  const last = shown[shown.length - 1];
  const sel = shown.find((r) => r.id === selectedId) || last;
  const selI = shown.indexOf(sel);
  const series = SERIES.map((sr, i) => ({
    ...sr, idx: i,
    levels: shown.map((r) => symptomLevel(r, sr.key)),
  }));
  const scrollRef = useRef(null);

  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: Y_AXIS_W }}>
          <View style={{ height: DATE_ROW_H }} />
          <View style={{ height: CHART_H }}>
            {LEVELS.map((lv) => (
              <Text key={lv} style={[styles.tick, { top: y(lv) - 7 }]}>{levelInfo(lv).ko}</Text>
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
                {LEVELS.map((lv) => (
                  <Line key={lv} x1={0} y1={y(lv)} x2={width} y2={y(lv)} stroke={mc.line} strokeWidth={1} />
                ))}
                {series.map(({ key, color, levels, idx }) => (
                  <React.Fragment key={key}>
                    {levels.length > 1 && (
                      <Polyline points={levels.map((lv, i) => `${xAt(i)},${yOf(lv, idx)}`).join(' ')}
                        fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {levels.map((lv, i) => {
                      const on = i === selI;
                      return (
                        <Circle key={shown[i].id} cx={xAt(i)} cy={yOf(lv, idx)} r={on ? 4.6 : 3.4}
                          fill={color} stroke="#fff" strokeWidth={on ? 1.8 : 1.2} />
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
        {series.map(({ key, label, color }) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
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
});
