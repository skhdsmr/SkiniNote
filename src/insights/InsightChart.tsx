import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { monitoringColors as mc } from '../folders/theme';

export interface ChartLine {
  label: string;
  color: string;
  /** 기록마다 값 — 없으면 null */
  values: (number | null)[];
  max: number;
}

/**
 * 기록 순서대로 막대(단계 0~3) 하나와 꺾은선 몇 개를 한 칸 위에 겹쳐 그리는 작은 차트.
 * 줄마다 최댓값이 달라(수면 100 · 가려움 10 …) 각자의 최댓값으로 0~1로 맞춘다 — 값 자체가 아니라
 * 오르내림을 견주려는 것이라 축 눈금은 그리지 않는다.
 */
export default function InsightChart({
  labels,
  bars,
  barColor,
  barLabel,
  lines = [],
  height = 180,
}: {
  labels: string[];
  bars: number[];
  barColor: string;
  barLabel: string;
  lines?: ChartLine[];
  height?: number;
}) {
  const [w, setW] = useState(0);
  const padX = 8;
  const padTop = 10;
  const padBottom = 24;
  const innerH = height - padTop - padBottom;
  const n = Math.max(1, bars.length);
  const slot = w > 0 ? (w - padX * 2) / n : 0;
  const cx = (i: number) => padX + slot * i + slot / 2;
  const yOf = (v: number, max: number) => padTop + innerH * (1 - Math.min(1, Math.max(0, v / max)));

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {[0, 1, 2, 3].map((g) => (
              <Line key={g} x1={padX} x2={w - padX} y1={yOf(g, 3)} y2={yOf(g, 3)} stroke={mc.line} strokeWidth={1} />
            ))}
            {bars.map((v, i) => {
              const top = yOf(v, 3);
              return (
                <Rect
                  key={i}
                  x={cx(i) - Math.min(slot * 0.55, 22) / 2}
                  y={v > 0 ? top : yOf(0, 3) - 2}
                  width={Math.min(slot * 0.55, 22)}
                  height={v > 0 ? yOf(0, 3) - top : 2}
                  rx={4}
                  fill={barColor}
                  opacity={v > 0 ? 0.9 : 0.35}
                />
              );
            })}
            {lines.map((ln) => {
              const pts = ln.values
                .map((v, i) => (v == null ? null : ([cx(i), yOf(v, ln.max)] as [number, number])))
                .filter((p): p is [number, number] => p !== null);
              return (
                <React.Fragment key={ln.label}>
                  {pts.length > 1 && (
                    <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={ln.color} strokeWidth={2.2} />
                  )}
                  {pts.map((p, i) => (
                    <Circle key={i} cx={p[0]} cy={p[1]} r={3.4} fill="#FFFFFF" stroke={ln.color} strokeWidth={2} />
                  ))}
                </React.Fragment>
              );
            })}
            {labels.map((lb, i) =>
              // 기록이 많으면 라벨이 겹친다 — 대략 6개만 남긴다
              i % Math.ceil(n / 6) === 0 || i === n - 1 ? (
                <SvgText key={i} x={cx(i)} y={height - 6} fontSize={10} fill={mc.sub} textAnchor="middle">
                  {lb}
                </SvgText>
              ) : null,
            )}
          </Svg>
        )}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: barColor }]} />
          <Text style={styles.legendText}>{barLabel}</Text>
        </View>
        {lines.map((ln) => (
          <View key={ln.label} style={styles.legendItem}>
            <View style={[styles.dot, { borderColor: ln.color }]} />
            <Text style={styles.legendText}>{ln.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 10, borderRadius: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: '#FFFFFF' },
  legendText: { fontSize: 11.5, color: mc.sub },
});
