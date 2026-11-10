import { BARRIER_SERIES, CHART_SERIES } from '../folders/theme';
import type { CardIconSpec } from './MetricCard';

/**
 * 상세 결과 카드 제목 옆 지표 아이콘 — 요약칸(SummaryBox·StatBox)과 같은 그림·같은 원 색.
 * 경과 관찰 페이지와 신규 기록 결과 화면이 같은 값을 써서 두 화면이 같은 모양으로 보인다.
 * 원(28)이 요약칸 원보다 작아서 그림 크기도 지표마다 비율대로 줄여 둔다.
 */
export const METRIC_ICONS: Record<'barrier' | 'disease' | 'itch' | 'sleep', CardIconSpec> = {
  barrier: { source: require('../../assets/icon/barrier_icon_white.png'), color: BARRIER_SERIES.color, size: 21 },
  disease: { source: require('../../assets/icon/disease_icon_white.png'), color: CHART_SERIES.skin.color, size: 15 },
  itch: { source: require('../../assets/icon/itch_icon_white.png'), color: CHART_SERIES.itch.color, size: 18 },
  sleep: { source: require('../../assets/icon/sleep_icon_white.png'), color: CHART_SERIES.sleep.color, size: 22 },
};
