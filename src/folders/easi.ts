/**
 * 부위 점수 — IGA(0~4) × 면적 점수(0~6).
 *
 * 예전에는 IGA(0~4)를 100점으로 치환한 "피부 종합 상태"를 썼고, 증상도 0~3단계를 0~100점으로
 * 바꿔 보여줬다. 지금은:
 *   · 증상별 중증도는 0~3단계를 **그대로** 쓴다 (없음 0 · 미미함 1 · 두드러짐 2 · 뚜렷함 3)
 *   · 부위 점수 = IGA(0~4) × 면적 점수(0~6)  →  0~24, 화면에는 100점으로 환산
 *   · 전체 점수 = 부위 점수(100점 환산)를 가중 합산 (머리·목 0.1 · 팔 0.2 · 몸통 0.3 · 다리 0.4)
 *
 * 면적 점수는 사진으로 재지 않는다. 사진은 부위의 일부만 찍히므로, **모니터링을 시작할 때 한 번**
 * "표시된 병변이 손바닥(손가락 포함) 몇 개 크기인가요?"를 물어 정한다. 부위 전체가 손 몇 개
 * 넓이인지는 EASI 임상시험 프로토콜(NCT04684485)의 값을 쓴다.
 */
import type { CoarseGroupId } from '../monitoring/bodyParts';
import { symptomLevel } from '../symptoms/groups';
import { COARSE_OF_PART } from '../monitoring/bodyParts';
import { SKIN_SEGMENTS } from './theme';
import { folderHasSeverity } from './store';

export const EASI_GROUP_LABEL: Record<CoarseGroupId, string> = {
  head: '머리·목', arm: '팔', torso: '몸통', leg: '다리',
};

/** 부위 전체가 손바닥 몇 개 넓이인지 (손 1개 = 부위의 100/hands %) */
export const EASI_HANDS: Record<CoarseGroupId, number> = { head: 10, arm: 20, torso: 30, leg: 40 };

/** 전체 점수의 부위 가중치 (합 1.0) */
export const EASI_WEIGHT: Record<CoarseGroupId, number> = { head: 0.1, arm: 0.2, torso: 0.3, leg: 0.4 };

/** 면적 점수 k(1~6)가 시작되는 손바닥 개수 — 6점은 "이상", 나머지는 다음 점수의 시작 전까지 */
const AREA_FROM: Record<CoarseGroupId, number[]> = {
  head: [0.1, 1, 3, 5, 7, 9],
  arm: [0.2, 2, 6, 10, 14, 18],
  torso: [0.3, 3, 9, 15, 21, 27],
  leg: [0.4, 4, 12, 20, 28, 36],
};

export interface AreaOption { score: number; label: string }

/**
 * 설문 선택지 — 팔이면 "2개 미만 · 2~6개 · 6~10개 · 10~14개 · 14~18개 · 18개 이상".
 * 면적 점수(0~6)는 **시스템 내부 값**이라 화면에는 내지 않는다. 사용자는 손바닥 개수만 고른다.
 */
export function areaOptions(group: CoarseGroupId): AreaOption[] {
  const from = AREA_FROM[group];
  return from.map((_, i) => {
    const label = i === 0 ? `${from[1]}개 미만` : i === 5 ? `${from[5]}개 이상` : `${from[i]}~${from[i + 1]}개`;
    return { score: i + 1, label };
  });
}

/** 증상 4종의 단계(각 0~3) */
export function signGrades(values: any): { redness: number; bumps: number; scratch: number; thickening: number } {
  return {
    redness: symptomLevel(values, 'redness'),
    bumps: symptomLevel(values, 'bumps'),
    scratch: symptomLevel(values, 'scratch'),
    thickening: symptomLevel(values, 'thickening'),
  };
}

/** IGA(0~4) × 면적 점수(0~6)의 최댓값 */
export const MAX_PART_RAW = 4 * 6;

/**
 * 화면에 내는 점수는 **높을수록 좋다**(100 = 병변 없음) — 앱의 다른 지표(가려움 안정도·수면 점수)와
 * 방향을 맞추려고, 위 EASI 점수(높을수록 나쁨)를 100에서 뺀다. IGA 때와 같은 규칙이다.
 */
export const toDisplay = (severity100: number) => Math.round(100 - severity100);

/**
 * 표시 점수 → 4단계. 경계는 EASI의 중증도 구간(0 · ≤1 · ≤7 · ≤21 · ≤50 · >50, 0~72 기준)을
 * 100점으로 환산해 넷으로 묶었다: 거의 깨끗함(좋음) · 경증(주의) · 중등도(나쁨) · 중증 이상(매우 나쁨).
 * ⚠️ 부위 하나에 전신 구간을 그대로 대는 잠정값이다.
 */
export const EASI_SEGMENTS = [
  { to: 70.8, ko: '매우 나쁨', color: SKIN_SEGMENTS[0].color },
  { to: 90.3, ko: '나쁨', color: SKIN_SEGMENTS[1].color },
  { to: 98.6, ko: '주의', color: SKIN_SEGMENTS[2].color },
  { to: 100, ko: '좋음', color: SKIN_SEGMENTS[3].color },
];

export interface PartScore { iga: number; area: number; raw: number; score100: number }

/**
 * 부위 점수 = IGA(0~4) × 면적 점수(0~6) → 0~24, 100점 환산은 ÷24 × 100.
 * (IGA × 면적이 EASI와 0.95의 상관을 보인다는 논문에 따라 4가지 징후 합 대신 IGA를 쓴다.)
 * 면적 설문 전(areaScore 없음)이면 null. 면적 0(병변 없음)은 설문을 받은 값이라 0점이 맞다.
 */
export function partScoreOf(values: any, areaScore: number | null | undefined): PartScore | null {
  if (areaScore == null || typeof values?.iga !== 'number') return null;
  const raw = values.iga * areaScore;
  return { iga: values.iga, area: areaScore, raw, score100: (raw / MAX_PART_RAW) * 100 };
}

/** 부위 점수(표시 점수) — 면적 설문 전이면 null */
export function partDisplayOf(values: any, areaScore: number | null | undefined): number | null {
  const ps = partScoreOf(values, areaScore);
  return ps ? toDisplay(ps.score100) : null;
}

/**
 * 전체 점수 — 덩어리(머리·목/팔/몸통/다리)마다 가장 최근 기록의 부위 점수(EASI 점수)를 구해 가중치
 * (0.1/0.2/0.3/0.4)를 곱해 합친다. 같은 덩어리에 자리가 둘 이상이면(왼팔·오른팔 등) 평균을 쓴다.
 * 지켜보지 않는 덩어리는 병변 0으로 친다. 면적 설문 전인 폴더는 점수를 낼 수 없어 뺀다(missing).
 * 반환은 화면 점수(높을수록 좋음). 쓸 수 있는 폴더가 하나도 없으면 value=null.
 */
export function overallOfFolders(
  folders: any[],
  groupOf: (folder: any) => CoarseGroupId | null | undefined,
): { value: number | null; missing: number } {
  const acc: Partial<Record<CoarseGroupId, { sum: number; n: number }>> = {};
  let missing = 0;
  folders.forEach((f) => {
    if (!f.records?.length || !folderHasSeverity(f)) return;
    const g = groupOf(f);
    if (!g) return;
    const ps = partScoreOf(f.records[f.records.length - 1], f.areaScore);
    if (!ps) { missing += 1; return; }
    const a = (acc[g] ??= { sum: 0, n: 0 });
    a.sum += ps.score100;
    a.n += 1;
  });
  const groups = Object.keys(acc) as CoarseGroupId[];
  if (!groups.length) return { value: null, missing };
  const sev = groups.reduce((sum, g) => sum + EASI_WEIGHT[g] * (acc[g]!.sum / acc[g]!.n), 0);
  return { value: toDisplay(sev), missing };
}

export { COARSE_OF_PART };
