/**
 * 기준일 대비 경과 판정 — 부위 상세 화면과 전신 경과 화면이 함께 쓰는 단 하나의 출처.
 *
 * 절대 점수("0/100 매우 나쁨")가 아니라 **그 부위의 기준일(기본: 첫 촬영일) 대비 변화율**로 말한다.
 * 첫 촬영에서 "매우 나쁨"이 떠도 사용자가 할 수 있는 일이 없지만, "기준일보다 좋아짐/비슷/나빠짐"은
 * 행동으로 이어진다.
 *
 * 세 축(염증 활동 · 긁은 상처 · 두꺼워진 피부)은 서로 다른 속도로 변하고 판정 주기도 달라서
 * 한 선으로 합치지 않고 따로 판정한다.
 *
 * ⚠️ SDC(측정 오차 범위)는 잠정값이다. 세부 증상은 등급(0~3)이 {0, 3.3, 6.7, 10}으로 끊겨 나오므로
 *    한 등급 차이가 기준값에 따라 33~100% 변화로 환산된다. 실기기로 같은 자리를 연속 촬영해 σ를 잰 뒤
 *    다시 잡을 것. 크게 잡으면 진짜 변화를 "비슷해요"라 하는 쪽으로 틀리는데, 반대(오차를 호전이라
 *    말하는 것)가 훨씬 나쁘다.
 */
import { monitoringColors as mc } from './theme';

export const DAY_MS = 86400000;
/** 변화율 계산의 분모 하한 — 기준값이 0(증상 없음)일 때 0으로 나누지 않고, 한 등급(3.3)을 100%로 본다 */
const BASE_FLOOR = 3.3;
/** 이만큼 줄면 "많이 좋아짐" */
const MUCH_BETTER_PCT = -60;
/** 그래프 y축 범위(±%) */
export const PCT_LIMIT = 100;

export const AXES = [
  { key: 'inflam', label: '염증 활동', sub: '홍반+구진', sdc: 30, value: (r) => (r.redness + r.bumps) / 2 },
  { key: 'scratch', label: '긁은 상처', sub: '', sdc: 40, value: (r) => r.scratch },
  // 두꺼워진 피부는 천천히 변한다 — 기준일에서 이만큼 지난 점만 판정하고 그 전은 "참고"로 둔다
  { key: 'thick', label: '두꺼워진 피부', sub: '4주 간격', sdc: 40, value: (r) => r.thickening, minDays: 28 },
];

/** 판정 → 표시. tone은 칩·칸 색을 고르는 키 */
export const VERDICTS = {
  much: { ko: '많이 좋아짐', short: '개선', tone: 'better' },
  better: { ko: '좋아짐', short: '개선', tone: 'better' },
  same: { ko: '비슷해요', short: '비슷', tone: 'same' },
  worse: { ko: '나빠짐', short: '악화', tone: 'worse' },
  pending: { ko: '판정 대기', short: '대기', tone: 'pending' },
};

/** tone별 색 — 앱의 연두 톤(greenTop 계열)을 개선에, 붉은 계열을 악화에 쓴다 */
export const TONE = {
  better: { bg: '#E3F2CF', border: '#93D258', text: '#2E4A14', dot: '#5E9B2E' },
  same: { bg: '#F1F3F6', border: '#DADDE2', text: '#6B6F76', dot: '#9AA0A8' },
  worse: { bg: '#FBE4E0', border: '#E9A79E', text: '#9E3326', dot: '#E2584B' },
  pending: { bg: '#FFFFFF', border: '#DADDE2', text: '#8E8E93', dot: '#9AA0A8' },
};

export function toneOf(verdictKey) {
  return TONE[VERDICTS[verdictKey]?.tone ?? 'pending'];
}

export function verdictFromPct(pct, sdc) {
  if (Math.abs(pct) <= sdc) return 'same';
  if (pct > 0) return 'worse';
  return pct <= MUCH_BETTER_PCT ? 'much' : 'better';
}

export function baseIndexOf(folder) {
  const i = folder.baselineId ? folder.records.findIndex((r) => r.id === folder.baselineId) : -1;
  return i >= 0 ? i : 0;
}

/**
 * 한 축의 점 목록 — 기준일 이후 회차마다 기준일 대비 변화율(%)과 판정.
 * valid=false는 최소 비교 간격이 안 찼다는 뜻이라 그래프에서 빈 원으로 그리고 판정에서 뺀다.
 */
export function axisPoints(records, baseIdx, axis) {
  const base = records[baseIdx];
  const baseVal = axis.value(base);
  const denom = Math.max(baseVal, BASE_FLOOR);
  return records.slice(baseIdx).map((record, k) => {
    const pct = Math.max(-PCT_LIMIT, Math.min(PCT_LIMIT, ((axis.value(record) - baseVal) / denom) * 100));
    const days = (record.ts - base.ts) / DAY_MS;
    const isBase = k === 0;
    const valid = !isBase && days >= (axis.minDays ?? 0);
    return {
      record, pct, isBase, valid,
      verdict: valid ? verdictFromPct(pct, axis.sdc) : null,
      outside: valid && Math.abs(pct) > axis.sdc,
    };
  });
}

/** 한 축의 지금 판정 — 가장 최근의 유효한 점. 없으면 판정 대기 */
export function axisVerdict(points) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].valid) return points[i].verdict;
  return 'pending';
}

/**
 * 한 회차의 종합 판정 — 세 축 중 하나라도 나빠졌으면 악화, 아니면 하나라도 좋아졌으면 개선.
 * 평균 내지 않는다(평균은 한 축의 악화를 다른 축의 개선으로 지워 버린다). 판정할 축이 없으면 null.
 */
export function recordVerdict(records, baseIdx, index) {
  if (index <= baseIdx) return null;
  const keys = [];
  for (const axis of AXES) {
    const pts = axisPoints(records, baseIdx, axis);
    const p = pts.find((x) => x.record.id === records[index].id);
    if (p?.valid) keys.push(p.verdict);
  }
  if (!keys.length) return null;
  if (keys.includes('worse')) return 'worse';
  if (keys.includes('much') || keys.includes('better')) return 'better';
  return 'same';
}

/** 부위의 지금 종합 판정 — 가장 최근 회차 기준 */
export function folderVerdict(folder) {
  const b = baseIndexOf(folder);
  return recordVerdict(folder.records, b, folder.records.length - 1);
}

export function md(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export { mc };
