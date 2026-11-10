import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, cardDecoration } from '../theme';
import { BARRIER_SERIES } from '../folders/theme';
import type { SkinScanResult } from '../skinScan/api';

/**
 * 지난 측정 대비 변화 표시 — 아토피(피부 질환 표시값)와 피부장벽(총점) 모두 "높을수록 좋음"이라
 * 같은 규칙을 쓴다: 오르면 호전(파랑 ▲), 내리면 약화(빨강 ▼), 차이가 작으면 유지(회색 –).
 *
 * 아토피 등급(IGA)은 한 단계가 크게 움직여 며칠 사이에는 거의 변하지 않는다. 피부장벽 점수는
 * 연속값이라 1~2점의 작은 호전·약화도 보이는데, 그걸 놓치지 않게 하는 게 이 표시의 목적이다.
 */

export const UP_COLOR = '#3E7BEA';
export const DOWN_COLOR = '#E5534B';
export const FLAT_COLOR = AppColors.sub;

/** 이 값보다 작게 움직이면 "유지"로 본다 (측정 오차 수준) */
const FLAT_EPS = 0.5;

export type Trend = 'up' | 'down' | 'flat';

export function trendOf(delta: number | null | undefined): Trend {
  if (delta == null || Math.abs(delta) < FLAT_EPS) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export function trendColor(t: Trend) {
  return t === 'up' ? UP_COLOR : t === 'down' ? DOWN_COLOR : FLAT_COLOR;
}

export function trendWord(t: Trend) {
  return t === 'up' ? '호전' : t === 'down' ? '약화' : '유지';
}

/** ▲ +3 / ▼ -2 / – 0 — 숫자만 짧게 (목록·카드 구석용) */
export function DeltaText({
  delta,
  size = 12.5,
  suffix = '',
  withWord = false,
}: {
  delta: number | null | undefined;
  size?: number;
  suffix?: string;
  /** 숫자 뒤에 "호전/약화/유지"를 붙인다 */
  withWord?: boolean;
}) {
  if (delta == null) return <Text style={[styles.delta, { fontSize: size, color: FLAT_COLOR }]}>첫 측정</Text>;
  const t = trendOf(delta);
  const color = trendColor(t);
  const rounded = Math.round(delta);
  const icon = t === 'up' ? 'arrow-drop-up' : t === 'down' ? 'arrow-drop-down' : 'remove';
  return (
    <View style={styles.deltaRow}>
      <MaterialIcons name={icon} size={size + 6} color={color} style={{ marginHorizontal: -3 }} />
      <Text style={[styles.delta, { fontSize: size, color }]}>
        {t === 'flat' ? '0' : `${rounded > 0 ? '+' : ''}${rounded}`}
        {suffix}
        {withWord ? ` ${trendWord(t)}` : ''}
      </Text>
    </View>
  );
}

/** 기록 날짜("2026-08-06") → "8.6" */
export function shortMd(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  return `${parseInt(m, 10)}.${parseInt(d, 10)}`;
}

type ScanLike = Pick<SkinScanResult, 'totalScore' | 'metrics'>;

const METRIC_ORDER: { key: 'wrinkle' | 'pore' | 'moisture'; label: string }[] = [
  { key: 'wrinkle', label: '주름' },
  { key: 'pore', label: '모공' },
  { key: 'moisture', label: '수분량' },
];

/**
 * 피부장벽 "지난 측정 대비" 카드 — 총점 변화 + 주름·모공·수분량 각각의 변화.
 * 측정 직후 결과 화면 맨 위와 장벽 기록 화면이 같이 쓴다.
 */
export function BarrierChangeCard({
  current,
  previous,
  previousDate,
  title = '지난 측정 대비',
}: {
  current: ScanLike;
  previous: ScanLike | null;
  previousDate?: string;
  title?: string;
}) {
  const total = previous ? current.totalScore - previous.totalScore : null;
  const t = trendOf(total);
  const metricScore = (s: ScanLike | null, key: string) => s?.metrics.find((m) => m.key === key)?.score ?? null;

  const headline =
    total == null
      ? '첫 측정이에요. 다음 측정부터 변화를 비교해 드려요'
      : t === 'flat'
        ? '지난번과 비슷하게 유지되고 있어요'
        : t === 'up'
          ? `피부장벽이 ${Math.abs(Math.round(total))}점 좋아졌어요`
          : `피부장벽이 ${Math.abs(Math.round(total))}점 낮아졌어요`;

  return (
    <View style={[cardDecoration(), styles.card]}>
      <View style={styles.cardHead}>
        <View style={[styles.dot, { backgroundColor: BARRIER_SERIES.color }]} />
        <Text style={styles.cardTitle}>{title}</Text>
        {previousDate && <Text style={styles.cardDate}>{shortMd(previousDate)} 측정과 비교</Text>}
      </View>
      <Text style={[styles.headline, { color: total == null ? AppColors.ink : trendColor(t) }]}>{headline}</Text>
      {previous && (
        <View style={styles.metricRow}>
          {METRIC_ORDER.map(({ key, label }) => {
            const cur = metricScore(current, key);
            const prev = metricScore(previous, key);
            return (
              <View key={key} style={styles.metricCell}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>{cur != null ? Math.round(cur) : '-'}</Text>
                <DeltaText delta={cur != null && prev != null ? cur - prev : null} size={12} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  deltaRow: { flexDirection: 'row', alignItems: 'center' },
  delta: { fontWeight: '800' },

  card: { padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: AppColors.ink, flex: 1 },
  cardDate: { fontSize: 11.5, fontWeight: '600', color: AppColors.sub },
  headline: { fontSize: 15.5, fontWeight: '800', marginTop: 10 },
  metricRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: AppColors.bg,
    gap: 2,
  },
  metricLabel: { fontSize: 11.5, fontWeight: '700', color: AppColors.sub },
  metricValue: { fontSize: 18, fontWeight: '800', color: AppColors.ink },
});
