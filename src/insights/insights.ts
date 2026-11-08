import { daysBetween } from '../folders/store';
import { SLEEP_SEGMENTS, segmentFor } from '../folders/theme';
import { groupLevel, groupOf } from '../symptoms/groups';

/**
 * 증상 묶음별 특화 화면(트리거 탐정 · 긁기 패턴 · 회복 트래커)이 쓰는 계산.
 *
 * 입력은 폴더(지켜보는 자리) 하나의 기록 목록뿐이다 — 기록 한 건에는 날짜·수면 점수·가려움 VAS·세부 증상이
 * 들어 있다. 날씨·습도·음식·땀·새 제품 같은 일지는 아직 앱에 쌓이는 곳이 없어서 여기서 계산하지 않는다
 * (없는 값으로 패턴을 지어내지 않는다). 그런 항목은 화면에서 "연동 준비 중"으로 보여준다.
 *
 * 값의 방향: 수면 점수는 높을수록 좋고, 가려움 VAS·증상 단계는 높을수록 나쁘다.
 */
export interface InsightRecord {
  id: string;
  date: string; // YYYY-MM-DD
  sleepScore: number;
  itchVas: number;
  redness: number;
  bumps: number;
  scratch: number;
  thickening: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const INFLAMMATION = groupOf('inflammation');
const SCRATCH = groupOf('scratch');
const CHRONIC = groupOf('chronic');

export const inflammationLevel = (r: InsightRecord) => groupLevel(r, INFLAMMATION);
export const scratchLevel = (r: InsightRecord) => groupLevel(r, SCRATCH);
export const chronicLevel = (r: InsightRecord) => groupLevel(r, CHRONIC);

/** 수면 점수가 "나쁨" 이하(앱의 수면 4단계 중 아래 둘)인지 */
export const isPoorSleep = (r: InsightRecord) => segmentFor(r.sleepScore, SLEEP_SEGMENTS).index <= 1;
/** 가려움 VAS가 높은 날 (7 이상 — 앱의 가려움 안정도 "나쁨" 이하) */
export const isHighItch = (r: InsightRecord) => r.itchVas >= 7;

// ───────────────────────── 트리거 탐정 ─────────────────────────

export interface Surge {
  /** 이번(가장 최근) 기록 */
  current: InsightRecord;
  /** 견준 직전 기록 */
  previous: InsightRecord;
  /** 단계가 몇 칸 올랐는지 */
  rise: number;
  /** 두 기록 사이에 낀 기록들(양 끝 포함) — "최근 일지" 구간 */
  window: InsightRecord[];
}

/** 가장 최근 기록에서 염증 반응이 직전보다 한 단계 이상 올랐는지. 아니면 null */
export function detectInflammationSurge(records: InsightRecord[]): Surge | null {
  if (records.length < 2) return null;
  const current = records[records.length - 1];
  const previous = records[records.length - 2];
  const rise = inflammationLevel(current) - inflammationLevel(previous);
  if (rise < 1) return null;
  return { current, previous, rise, window: [previous, current] };
}

export type FactorKey = 'sleep' | 'itch' | 'weather' | 'newProduct' | 'sweat' | 'food';

export interface Factor {
  key: FactorKey;
  label: string;
  /** 이 항목을 비교할 데이터가 앱에 있는지 — false면 화면에서 "연동 준비 중"으로 둔다 */
  available: boolean;
  /** available일 때: 평소와 다른 점이 있는지 */
  flagged?: boolean;
  /** 한 줄 설명 (예: "수면 점수 평균 62점 (평소 78점)") */
  text?: string;
}

/** 이번 구간(window)의 일지를 평소(그 전 기록 전체)와 견준다 */
export function inspectFactors(records: InsightRecord[], surge: Surge): Factor[] {
  const inWindow = new Set(surge.window.map((r) => r.id));
  const base = records.filter((r) => !inWindow.has(r.id));
  const win = surge.window;

  const sleepNow = mean(win.map((r) => r.sleepScore));
  const sleepBase = base.length ? mean(base.map((r) => r.sleepScore)) : null;
  const itchNow = mean(win.map((r) => r.itchVas));
  const itchBase = base.length ? mean(base.map((r) => r.itchVas)) : null;

  const sleepFlag = sleepBase != null && sleepNow <= sleepBase - 6;
  const itchFlag = itchBase != null && itchNow >= itchBase + 1.5;

  return [
    {
      key: 'sleep',
      label: '수면',
      available: true,
      flagged: sleepFlag,
      text:
        sleepBase != null
          ? `수면 점수 평균 ${Math.round(sleepNow)}점 (평소 ${Math.round(sleepBase)}점)`
          : `수면 점수 평균 ${Math.round(sleepNow)}점`,
    },
    {
      key: 'itch',
      label: '가려움',
      available: true,
      flagged: itchFlag,
      text:
        itchBase != null
          ? `가려움 점수 평균 ${itchNow.toFixed(1)} (평소 ${itchBase.toFixed(1)})`
          : `가려움 점수 평균 ${itchNow.toFixed(1)}`,
    },
    { key: 'weather', label: '날씨·습도', available: false },
    { key: 'newProduct', label: '새 제품', available: false },
    { key: 'sweat', label: '땀·운동', available: false },
    { key: 'food', label: '음식', available: false },
  ];
}

export interface Pattern {
  /** 한 문장 요약 */
  title: string;
  detail: string;
  hits: number;
  total: number;
}

/**
 * 개인 패턴 — "수면이 나빴던 기록 다음에 염증 반응이 올랐다" 같은, 기록이 쌓여야 보이는 규칙.
 * 근거가 되는 사례가 MIN_EVENTS번 미만이면 말하지 않는다(우연과 구분이 안 된다).
 * 상관일 뿐 원인을 단정하지 않는 문장만 쓴다.
 */
const MIN_EVENTS = 3;
const MIN_RATE = 0.6;

export function findPatterns(records: InsightRecord[]): Pattern[] {
  const out: Pattern[] = [];
  const rules: { title: string; cond: (r: InsightRecord) => boolean; what: string }[] = [
    { title: '수면 점수가 낮았던 기록 다음에 염증 반응이 올랐어요', cond: isPoorSleep, what: '수면 점수가 낮았던' },
    { title: '가려움이 심했던 기록 다음에 염증 반응이 올랐어요', cond: isHighItch, what: '가려움이 심했던' },
  ];
  rules.forEach(({ title, cond, what }) => {
    let total = 0;
    let hits = 0;
    for (let i = 0; i < records.length - 1; i++) {
      if (!cond(records[i])) continue;
      total += 1;
      if (inflammationLevel(records[i + 1]) > inflammationLevel(records[i])) hits += 1;
    }
    if (total >= MIN_EVENTS && hits / total >= MIN_RATE) {
      out.push({ title, detail: `${what} 기록 ${total}번 중 ${hits}번, 다음 기록에서 염증 반응이 올랐어요`, hits, total });
    }
  });
  return out;
}

// ───────────────────────── 긁기 패턴 ─────────────────────────

export interface ScratchInsight {
  text: string;
  /** 비교에 쓴 기록 수 — 너무 적으면 화면이 "더 쌓이면"으로 바꾼다 */
  sample: number;
}

/** 수면 점수가 낮은 날과 아닌 날의 긁은 흔적 단계를 견준다 */
export function scratchVsSleep(records: InsightRecord[]): ScratchInsight {
  const poor = records.filter(isPoorSleep);
  const good = records.filter((r) => !isPoorSleep(r));
  if (poor.length < 2 || good.length < 2) {
    return { text: '기록이 더 쌓이면 수면과 긁은 흔적의 관계를 보여드려요', sample: records.length };
  }
  const a = mean(poor.map(scratchLevel));
  const b = mean(good.map(scratchLevel));
  if (b === 0 && a === 0) return { text: '긁은 흔적이 거의 보이지 않아요', sample: records.length };
  if (a >= b * 1.3 && a - b >= 0.3) {
    const ratio = b > 0 ? `${(a / b).toFixed(1)}배` : '더 많이';
    return { text: `잠을 못 잔 날의 기록에서 긁은 흔적이 ${b > 0 ? '평균 ' : ''}${ratio} 보였어요`, sample: records.length };
  }
  return { text: '수면과 긁은 흔적 사이에 뚜렷한 관계는 아직 보이지 않아요', sample: records.length };
}

/** 최근 기록에서 긁은 흔적이 두드러지거나(2단계 이상) 늘었는지 — 감염 체크 카드를 띄울 조건 */
export function shouldCheckInfection(records: InsightRecord[]): boolean {
  if (!records.length) return false;
  const cur = scratchLevel(records[records.length - 1]);
  const prev = records.length > 1 ? scratchLevel(records[records.length - 2]) : 0;
  return cur >= 2 || cur > prev;
}

/** 감염을 의심할 만한 신호 — 하나라도 해당하면 진료를 권한다 */
export const INFECTION_SIGNS = [
  '진물이 나요',
  '노란 딱지가 생겼어요',
  '만지면 뜨겁거나 붓고 아파요',
  '열이 나거나 처져 있어요',
];

/** 잠들기 전 루틴 제안 — 루틴 탭에 그대로 등록할 수 있는 모양(이름 · 시각) */
export const BEDTIME_ROUTINES: { name: string; time: string; why: string }[] = [
  { name: '자기 전 보습제 바르기', time: '21:30', why: '밤에 건조해지면 가려워서 긁기 쉬워요' },
  { name: '손톱 짧게 정리하기', time: '21:00', why: '긁어도 상처가 덜 생겨요' },
  { name: '면장갑 끼고 자기', time: '22:00', why: '자는 동안 긁는 것을 막아요' },
];

// ───────────────────────── 회복 트래커 ─────────────────────────

export type RangeKey = '3m' | '6m' | '1y';
export const RANGE_MONTHS: Record<RangeKey, number> = { '3m': 3, '6m': 6, '1y': 12 };
export const RANGE_LABEL: Record<RangeKey, string> = { '3m': '3개월', '6m': '6개월', '1y': '1년' };

export interface MonthPoint {
  /** "2026-11" */
  key: string;
  month: number;
  /** 그 달 만성 흔적 단계(0~3)의 평균 — 기록이 없는 달은 null */
  avg: number | null;
  count: number;
}

const monthKeyOf = (date: string) => date.slice(0, 7);

/** 오늘 달부터 거꾸로 n개월, 오래된 달부터 */
export function monthlyChronic(records: InsightRecord[], months: number, todayKey: string): MonthPoint[] {
  const [ty, tm] = todayKey.split('-').map(Number);
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ty, tm - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = records.filter((r) => monthKeyOf(r.date) === key);
    out.push({
      key,
      month: d.getMonth() + 1,
      avg: inMonth.length ? mean(inMonth.map(chronicLevel)) : null,
      count: inMonth.length,
    });
  }
  return out;
}

export type RecoveryTone = 'better' | 'same' | 'worse' | 'unknown';

/** 가장 오래된 달과 가장 최근 달의 평균을 견줘 기대치를 정한다. 일 단위 변화는 보지 않는다 */
export function recoveryMessage(points: MonthPoint[]): { tone: RecoveryTone; title: string; body: string } {
  const filled = points.filter((p) => p.avg != null);
  if (filled.length < 2) {
    return {
      tone: 'unknown',
      title: '아직 변화를 말하기 일러요',
      body: '두꺼워진 피부는 몇 달에 걸쳐 변해요. 한 달 이상 기록이 쌓이면 추이를 보여드려요.',
    };
  }
  const delta = filled[filled.length - 1].avg! - filled[0].avg!;
  if (delta <= -0.4) {
    return {
      tone: 'better',
      title: '조금씩 회복되고 있어요',
      body: '두꺼워진 피부는 회복에 시간이 걸려요. 지금처럼 꾸준히 관리해 주세요.',
    };
  }
  if (delta >= 0.4) {
    return {
      tone: 'worse',
      title: '두꺼워진 정도가 조금 늘었어요',
      body: '오래 이어지는 부위는 진료 때 의사와 함께 상의해 보세요.',
    };
  }
  return {
    tone: 'same',
    title: '큰 변화는 없어요',
    body: '두꺼워진 피부는 몇 달 단위로 천천히 변해요. 매일 달라 보이지 않는 게 자연스러워요.',
  };
}

/** 진료 때 상의할 만한 만성 흔적 — 이 기간(일) 넘게 계속 이어진 자리 */
export const CHRONIC_FLAG_DAYS = 42;

export interface ChronicFlag {
  folderId: string;
  site: string;
  /** 몇 주째 이어지는지 */
  weeks: number;
  since: string;
}

/** records: 오래된 순. 만성 흔적 단계가 1 이상인 기록이 끊기지 않고 CHRONIC_FLAG_DAYS 넘게 이어지면 해당 */
export function chronicFlagOf(records: InsightRecord[], today: string): { weeks: number; since: string } | null {
  let since: string | null = null;
  for (let i = records.length - 1; i >= 0; i--) {
    if (chronicLevel(records[i]) < 1) break;
    since = records[i].date;
  }
  if (!since || !records.length) return null;
  const days = daysBetween(since, today);
  if (days < CHRONIC_FLAG_DAYS) return null;
  return { weeks: Math.floor(days / 7), since };
}

