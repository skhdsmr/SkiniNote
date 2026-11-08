import { DISPLAY_SCALE, SYMPTOM_SEGMENTS_BASE, segmentFor } from '../folders/theme';

/**
 * 증상 4종(홍반·구진·찰상·태선화)을 사용자 언어 3묶음으로 번역한다.
 *
 * 모델은 증상을 4종으로 따로 내지만 "구진"·"태선화" 같은 말은 사용자에게 낯설다. 그래서 메인 화면은
 * 의미 단위 3묶음으로 보여주고, 의학 용어는 사진 위 증상 레이어 칩과 작은 회색 태그에만 둔다.
 *
 *   염증 반응   (홍반 + 구진)  — 지금 피부가 예민하게 반응하고 있어요 → 트리거 관리·보습
 *   긁은 흔적   (찰상)         — 긁어서 피부가 손상됐어요            → 긁기 습관·감염 주의
 *   만성 흔적   (태선화)       — 오래 반복돼서 두꺼워졌어요          → 장기 치료·진료
 *
 * 기록 필드 이름(redness·bumps·scratch·thickening)은 저장된 기록과 같다 — 바꾸지 않는다.
 */
export type SymptomKey = 'redness' | 'bumps' | 'scratch' | 'thickening';
export type GroupKey = 'inflammation' | 'scratch' | 'chronic';
/** 묶음마다 이어지는 특화 화면 */
export type InsightKind = 'trigger' | 'scratch' | 'recovery';

/** 특화 화면의 네비게이션 이름 (RootNavigator) — 모두 { folderId }를 받는다 */
export const INSIGHT_ROUTE: Record<InsightKind, 'TriggerDetective' | 'ScratchReport' | 'RecoveryTracker'> = {
  trigger: 'TriggerDetective',
  scratch: 'ScratchReport',
  recovery: 'RecoveryTracker',
};

export const SYMPTOM_KEYS: SymptomKey[] = ['redness', 'bumps', 'scratch', 'thickening'];

/** 사진 위 증상 레이어 — 의학 용어는 여기에만 쓴다 */
export const SYMPTOM_LAYERS: Record<SymptomKey, { label: string; color: string }> = {
  redness: { label: '홍반', color: '#EB5757' },
  bumps: { label: '구진', color: '#C2185B' },
  scratch: { label: '찰상', color: '#F0924B' },
  thickening: { label: '태선화', color: '#8D6E63' },
};

export interface SymptomGroup {
  key: GroupKey;
  /** 메인 화면에 보이는 이름 */
  label: string;
  members: SymptomKey[];
  /** 증상이 있을 때 / 없을 때 사용자에게 건네는 한 줄 */
  message: string;
  clearMessage: string;
  insight: InsightKind;
  /** 특화 화면으로 가는 버튼 문구 */
  insightLabel: string;
}

export const SYMPTOM_GROUPS: SymptomGroup[] = [
  {
    key: 'inflammation',
    label: '염증 반응',
    members: ['redness', 'bumps'],
    message: '지금 피부가 예민하게 반응하고 있어요',
    clearMessage: '피부가 차분해요',
    insight: 'trigger',
    insightLabel: '염증 패턴 자세히 보기',
  },
  {
    key: 'scratch',
    label: '긁은 흔적',
    members: ['scratch'],
    message: '긁어서 피부가 손상됐어요',
    clearMessage: '긁은 흔적이 없어요',
    insight: 'scratch',
    insightLabel: '긁기 패턴 자세히 보기',
  },
  {
    key: 'chronic',
    label: '만성 흔적',
    members: ['thickening'],
    message: '이 부위는 오래 반복돼서 두꺼워졌어요',
    clearMessage: '두꺼워진 피부가 없어요',
    insight: 'recovery',
    insightLabel: '회복 패턴 자세히 보기',
  },
];

export const groupOf = (key: GroupKey): SymptomGroup => SYMPTOM_GROUPS.find((g) => g.key === key)!;

/**
 * 증상 하나의 단계 0~3 — 0 없음 · 1 미미함 · 2 두드러짐 · 3 뚜렷함 (모델의 None/Mild/Moderate/Severe).
 * 기록에는 0~10 스케일로 저장돼 있어 화면 스케일로 옮긴 뒤 공용 구간(SYMPTOM_SEGMENTS_BASE)으로 고른다.
 */
export function symptomLevel(values: Partial<Record<SymptomKey, number>>, key: SymptomKey): number {
  return segmentFor(DISPLAY_SCALE.symptom(values[key] ?? 0), SYMPTOM_SEGMENTS_BASE).index;
}

/** 묶음의 단계 — 평균이 아니라 가장 나쁜 쪽이다. 홍반이 약해도 구진이 뚜렷하면 염증은 뚜렷하다 */
export function groupLevel(values: Partial<Record<SymptomKey, number>>, group: SymptomGroup): number {
  return Math.max(...group.members.map((m) => symptomLevel(values, m)));
}

/** 단계(0~3) → 이름·색 — 앱의 다른 지표와 같은 4단계 이름·색을 그대로 쓴다 */
export function levelInfo(level: number): { ko: string; color: string } {
  const seg = SYMPTOM_SEGMENTS_BASE[Math.min(3, Math.max(0, level))];
  return { ko: seg.ko, color: seg.color };
}

/** 나타난 묶음 이름들 — 전신 지도 동그라미 안 숫자(개수)와 말풍선이 쓴다 */
export function presentGroupLabels(values: Partial<Record<SymptomKey, number>>): string[] {
  return SYMPTOM_GROUPS.filter((g) => groupLevel(values, g) > 0).map((g) => g.label);
}
