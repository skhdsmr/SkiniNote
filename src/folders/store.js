/**
 * 모니터링 폴더 저장소 (세션 메모리 + 구독).
 *
 * 폴더 하나 = 모니터링 대상(MonitorTarget) 하나. 폴더 안에는 촬영 날짜별 기록
 * (수면 점수 · 가려움 VAS · 피부 질환 IGA)이 쌓인다.
 *
 * 폴더는 사용자가 직접 만들지 않는다 — 카메라 탭의 "신규 검사"(부위 선택 → 촬영 방법 →
 * 촬영 → 결과)를 끝낸 뒤 결과 화면에서 "경과 기록에 연동"을 누르면
 * ensureFolder가 "{부위} {질환}" 이름으로 만들고 recordExam이 그 검사의 실측값을 첫 기록으로
 * 넣는다. 프리셋 폴더 5개는 UI 흐름 시연용 dump 시계열이다.
 *
 * ⚠️ 세션 메모리에만 유지된다(앱 재시작 시 초기화).
 */
import { useSyncExternalStore } from 'react';
import { SEVERITY_SUPPORTED_DISEASE } from '../ai/labels';
import { ATOPIC_PHOTOS, ATOPIC_OVERLAYS, CHEEK_PHOTOS, CHEEK_OVERLAYS, TORSO_PHOTOS, TORSO_OVERLAYS, FACE_PHOTO } from './dumpPhotos';
import { DEMO_TARGETS, VISIBLE_DEMO_TARGET_IDS, folderNameOf } from './targets';

/** 이 폴더의 진단명이 4가지 증상·IGA 모델이 커버하는 질환(아토피피부염)인지 — "피부 질환"·
 *  "4가지 증상" 카드를 보여줄지 모니터링 화면들이 이 값으로 정한다. */
export function folderHasSeverity(folder) {
  return folder?.disease === SEVERITY_SUPPORTED_DISEASE;
}

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => keyOf(new Date());
export const addDaysKey = (dateKey, n) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return keyOf(dt);
};
export const daysBetween = (fromKey, toKey) => {
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  const ms = new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1);
  return Math.round(ms / 86400000);
};
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round1 = (v) => Math.round(v * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 넓이 지수 ↔ "부위의 몇 %" 환산 상수 (ai/scaleFrame의 areaOverAreaRef와 같은 값).
 *
 * dump 기록을 만들 때만 쓴다 — 화면이 쓰는 방향(지수 ÷ 상수 = %)의 **역방향**으로, 의도한 %를
 * 지수로 되돌린다. 여기서 직접 import하지 않는 이유는 이 파일이 순수 JS 저장소라 ai 계층에
 * 의존을 만들지 않기 위해서다. 값이 갈라지면 데모 지도의 원 크기만 어긋나므로 위험이 작다.
 */
const AREA_OVER_AREA_REF = { face: 5.5, torso: 1.05 };

/** 문자열 -> 32bit 정수 시드 (간단 해시) */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** seed -> [0,1) 결정적 난수 제공자 (mulberry32) */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 촬영 시작일부터 spanDays 동안 captureCount번 촬영했다고 가정하고
 * 3개 지표(수면 점수 · 가려움 VAS · 피부 질환 IGA)의 dump 시계열을 생성한다.
 * 실제 사용자는 매일 촬영하지 않으므로 날짜 간격을 일부러 들쭉날쭉하게 만든다.
 *
 * from -> to로 밋밋하게 한쪽으로만 줄어들면 비현실적이라, 물결(wave) 성분을 얹어
 * 중간중간 좋아졌다 나빠졌다 하는 변동을 준다. 처음/마지막 기록은 폴더가 의도한
 * from/to 값 그대로 남도록 물결의 진폭을 양 끝에서 0으로 줄이는 envelope을 곱한다.
 */
/**
 * "병변이 여러 곳" 예시(RegionSymptomsCard)를 미리보기용으로 딱 한 장에 붙여 둔다 — 실제로는
 * seg가 판정 단위를 2개 이상으로 나눈 촬영에서만 생기는 값이라(ai/lesionRegions.ts), 데모
 * 시계열은 그런 촬영을 하지 않으므로 실제 값을 만들 방법이 없다. bbox는 원본 픽셀이 아니라
 * "이 사진을 100×100이라고 치면"의 비율이다 — 화면은 비율로만 잘라 그리므로 실제 사진 크기와
 * 무관하게 항상 같은 자리를 가리킨다.
 */
const DEMO_REGIONS = [
  { bbox: { x: 8, y: 12, width: 30, height: 26, imageWidth: 100, imageHeight: 100 }, symptoms: { redness: true, bumps: true, scratch: false, thickening: false } },
  { bbox: { x: 58, y: 46, width: 24, height: 22, imageWidth: 100, imageHeight: 100 }, symptoms: { redness: true, bumps: false, scratch: true, thickening: false } },
  { bbox: { x: 26, y: 66, width: 20, height: 18, imageWidth: 100, imageHeight: 100 }, symptoms: { redness: false, bumps: true, scratch: false, thickening: true } },
];

/**
 * dump 넓이 지수를 병변 몇 개로 쪼갠다 — 전신 지도의 원 개수·크기가 여기서 나온다.
 *
 * 개수는 IGA를 따라간다(심한 회차일수록 여러 곳에 번져 있는 것이 자연스럽다). 크기는 일부러
 * 고르지 않게 나눈다 — 똑같이 나누면 원들이 포개진 것처럼 보여서, 개별 넓이를 재고 있다는
 * 사실 자체가 화면에서 안 읽힌다. 등급은 첫 조각이 가장 나쁘고 뒤로 갈수록 낮다: 기록의
 * iga는 실제 분석에서도 **가장 나쁜 단위**의 등급이라(analyzeLocal의 worstIndex) 그 규칙을 맞춘다.
 */
function splitAreaIntoRegions(areaIndex, iga, jitter) {
  const count = clamp(1 + Math.round(iga / 2 + jitter), 1, 3);
  const weights = Array.from({ length: count }, (_, k) => 1 / (k + 1.6));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, k) => ({
    index: round1((areaIndex * w) / total),
    iga: Math.max(0, iga - k),
  }));
}

/*
  피부상태측정(얼굴 스캔) dump 결과 — 서버(피부상태_파이프라인/serve_skin.py)의 /analyze 응답과
  같은 구조(metrics · items · ageNorm · levelEdges)라 SkinScanScreen의 결과 컴포넌트를 그대로 쓴다.

  ⚠️ 전부 지어낸 값이다. 수분 평균·SD는 moisture_ref_train.json에서 대략 잡은 값이고, 연령대는
  20대로 고정했다. 실제 스캔 결과를 폴더 기록에 저장하는 경로는 아직 없다.
*/
const DUMP_SCAN_AGE_GROUP = '20대';
const MOISTURE_ALL = { mean: 61.6, sd: 8.5 }; // 전체 기준 — 레벨 경계는 이 값으로 정한다(서버와 같은 규칙)
const MOISTURE_AGE = { group: DUMP_SCAN_AGE_GROUP, n: 160, mean: 62.8, sd: 9.0 };
const MOISTURE_EDGES = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25].map((k) => round1(MOISTURE_ALL.mean + k * MOISTURE_ALL.sd));
const LEVEL_MAX = 7;
const scanBand = (score) => (score >= 80 ? ['good', '좋음'] : score >= 60 ? ['normal', '보통'] : score >= 40 ? ['caution', '주의'] : ['care', '관리 필요']);
const scoreToLevel = (score) => clamp(Math.round(1 + (score / 100) * 6), 1, LEVEL_MAX);

/*
  데모 얼굴 사진(FACE_PHOTO, 480×480)의 측정 부위 — 피부장벽 서버(serve_skin.py /analyze)에 그 사진을
  한 번 실제로 보내 받은 MediaPipe crop 박스·얼굴 윤곽을 그대로 옮겨 둔 값이다. 이게 있어야 기록의
  결과 상세가 바로 스캔 결과처럼 "측정 부위" 박스를 사진 위에 그린다(없으면 사진만 나온다).
*/
const DUMP_FACE_GEOMETRY = {
  width: 480,
  height: 480,
  face: [63, 73, 423, 495],
  boxes: [
    { part: 'forehead', label: '이마', box: [130, 0, 340, 210] },
    { part: 'glabella', label: '미간', box: [203, 118, 274, 189] },
    { part: 'l_perocular', label: '왼쪽 눈가', box: [54, 186, 111, 242] },
    { part: 'r_perocular', label: '오른쪽 눈가', box: [373, 179, 429, 236] },
    { part: 'l_cheek', label: '왼쪽 볼', box: [76, 233, 205, 361] },
    { part: 'r_cheek', label: '오른쪽 볼', box: [280, 230, 407, 357] },
    { part: 'chin', label: '턱', box: [108, 207, 381, 480] },
  ],
};

/** total: 종합 점수(0~100), jitter(phase): 지표마다 다르게 흔드는 값 */
function makeDumpSkinScan(total, jitter) {
  const t = Math.round(total);
  const score = (phase, bias) => clamp(Math.round(t + bias + jitter(phase)), 0, 100);
  const levelItem = (key, label, s, ageAvgLevel) => ({ key, label, parts: [], level: scoreToLevel(s), levelMax: LEVEL_MAX, ageAvgLevel });
  const metric = (key, label, s, extra) => ({ key, label, score: s, band: scanBand(s)[0], bandLabel: scanBand(s)[1], ageAvgScore: null, parts: [], ...extra });

  const wFore = score(9.1, 4);
  const wEye = score(9.7, 1);
  const pore = score(10.4, -3);
  const moistScore = score(11.7, -1);
  // 수분 점수(0~100)를 실측 단위로 되돌린다 — 60점 ≈ 전체 평균, 20점마다 약 1SD
  const moistValue = round1(clamp(MOISTURE_ALL.mean + ((moistScore - 60) / 20) * MOISTURE_ALL.sd, 32, 94));
  const moistLevel = 1 + MOISTURE_EDGES.filter((e) => moistValue >= e).length;

  return {
    ...DUMP_FACE_GEOMETRY,
    total: t, // 경과 그래프 아래 그라데이션 띠가 쓰는 값
    photo: FACE_PHOTO, // 피부장벽진단 때 찍은 얼굴 사진 — 경과 관찰 촬영 이미지 칸 맨 왼쪽
    totalScore: t,
    totalBand: scanBand(t)[0],
    totalBandLabel: scanBand(t)[1],
    ageGroup: DUMP_SCAN_AGE_GROUP,
    /*
      항목별 또래 비교(z) — 결과 화면 총점 옆 멘트("○○이 또래 평균보다 낮아요")가 쓴다.
      서버는 연령대 평균·SD로 계산하지만 덤프에는 원자료가 없어서, 레벨은 연령대 평균 레벨과의
      차이를 대략 1.5레벨 = 1SD로, 수분량은 연령대 평균·SD로 잡는다.
    */
    totalItems: [
      { key: 'forehead_glabella', label: '이마·미간 주름', z: Math.round(((scoreToLevel(wFore) - 5.1) / 1.5) * 100) / 100 },
      { key: 'perocular', label: '눈가 주름', z: Math.round(((scoreToLevel(wEye) - 4.6) / 1.5) * 100) / 100 },
      { key: 'cheek', label: '볼 모공', z: Math.round(((scoreToLevel(pore) - 4.2) / 1.5) * 100) / 100 },
      { key: 'moisture', label: '수분량', z: Math.round(((moistValue - MOISTURE_AGE.mean) / MOISTURE_AGE.sd) * 100) / 100 },
    ],
    metrics: [
      metric('wrinkle', '주름', Math.round((wFore + wEye) / 2), {
        value: 0,
        items: [levelItem('forehead_glabella', '이마·미간', wFore, 5.1), levelItem('perocular', '눈가', wEye, 4.6)],
      }),
      metric('pore', '모공', pore, { value: 0, items: [levelItem('cheek', '볼', pore, 4.2)] }),
      metric('moisture', '수분량', moistScore, {
        value: moistValue,
        ageNorm: { ...MOISTURE_AGE, lo: MOISTURE_AGE.mean - 0.25 * MOISTURE_AGE.sd, hi: MOISTURE_AGE.mean + 0.25 * MOISTURE_AGE.sd },
        levelEdges: MOISTURE_EDGES,
        items: [{ key: 'moisture', label: '수분량', parts: [], level: moistLevel, levelMax: LEVEL_MAX, ageAvgLevel: 4.1 }],
      }),
    ],
  };
}

function generateRecords(startKey, seedBase, { spanDays, captureCount, from, to, photos, overlays, photoStart = 0, demoMultiRegionOnLast, areaKind, dateOverrides }) {
  const rng = makeRng(seedBase);

  // 0일차, 마지막 날은 반드시 포함 + 중간은 불규칙 간격으로 샘플링
  const offsets = new Set([0, spanDays]);
  while (offsets.size < captureCount) {
    offsets.add(Math.round(1 + rng() * (spanDays - 2)));
  }
  const sorted = Array.from(offsets).sort((a, b) => a - b);

  /*
    이 폴더가 사진 풀의 몇 번째부터 쓸지.

    여러 폴더가 같은 풀(ATOPIC_PHOTOS)을 나눠 쓰는데, 그러면 어느 폴더에 어떤 사진이 보일지가
    회차 수에 따라 우연히 정해진다 — 실제로 다리 폴더와 팔 폴더의 최신 사진이 서로 바뀌었으면
    하는 요청이 나온 이유가 이것이다. 시작 위치를 폴더마다 명시해 두면 **어떤 사진이 보일지를
    회차 수와 무관하게 정할 수 있다.** 사진과 오버레이가 같은 인덱스를 쓰므로 짝은 늘 맞는다.
  */
  const photoAt = (i) => (photoStart + i) % photos.length;

  const wavePhase = rng() * Math.PI * 2;
  const waveFreq = 2.2 + rng() * 2.3; // 전체 구간 동안 오르내림이 대략 2~4.5회 정도 반복

  const records = sorted.map((offset, i) => {
    const t = sorted.length > 1 ? i / (sorted.length - 1) : 1;
    const noise = () => (rng() - 0.5);
    const envelope = Math.sin(t * Math.PI); // 0(양 끝) ~ 1(중간) — 첫/최근 기록은 from/to 값을 그대로 유지
    const wave = (phaseOffset) => Math.sin(t * Math.PI * waveFreq + wavePhase + phaseOffset) * envelope;

    const sleepSpan = Math.max(6, Math.abs(to.sleep - from.sleep));
    const itchSpan = Math.max(1.5, Math.abs(to.itch - from.itch));
    const igaSpan = Math.max(1, Math.abs(to.iga - from.iga));

    // 수면 점수(삼성헬스, 0~100, 정수) · 가려움 VAS(0~10, 정수) — 둘 다 그대로 나올 수 있는 값이다.
    const sleepScore = clamp(Math.round(lerp(from.sleep, to.sleep, t) + wave(0) * sleepSpan * 0.4 + noise() * sleepSpan * 0.14), 0, 100);
    const itchVas = clamp(Math.round(lerp(from.itch, to.itch, t) + wave(1.3) * itchSpan * 0.4 + noise() * itchSpan * 0.14), 0, 10);
    // 피부 질환(IGA) — 모델은 5단계(0~4) 확률의 기댓값을 계산해서 쓰지만, 화면·기록에 실제로
    // 남는 값(igaGrade)은 그 기댓값을 등급 경계로 이산화한 정수다(src/ai/dex.ts의 bucketize) —
    // 1.7 같은 소수는 실제로는 절대 나오지 않으므로, dump도 정수 등급만 뽑는다.
    const igaContinuous = clamp(lerp(from.iga, to.iga, t) + wave(2.6) * igaSpan * 0.4 + noise() * igaSpan * 0.14, 0, 4);
    const iga = Math.round(igaContinuous);

    /*
      세부 증상(피부 붉기 · 오돌토돌함 · 긁은 상처 · 피부 두꺼워짐) — 모델은 sign마다 4단계
      (None~Severe, 0~3)만 예측하므로 화면 스케일(0~10)로 옮겨도 {0, 3.3, 6.7, 10} 네 값만
      나올 수 있다(examMetrics.signDisplayValue와 같은 식). 종합 점수(iga)를 중심으로 등급을
      흔들어, 같은 날이라도 증상별로 조금씩 다른 등급이 나오게 한다.

      **envelope을 씌우지 않는다.** envelope은 첫·마지막 회차를 폴더가 의도한 from/to 값에
      정확히 붙들어 두려고 양 끝에서 진폭을 0으로 만드는 장치인데, 세부 증상은 from/to로
      지정하는 값이 아니다. 그런데도 같이 씌워 두어서 **마지막 회차에서는 네 증상이 전부 같은
      등급으로 붙어 버렸다** — 상세 결과 화면이 기본으로 여는 것이 그 마지막 회차라, 데모를
      열 때마다 "없음·없음·없음·없음"만 보였다.
    */
    const symptomWave = (phaseOffset) => Math.sin(t * Math.PI * waveFreq + wavePhase + phaseOffset);
    const symptomNoise = (phaseOffset) => symptomWave(phaseOffset) * 1.0 + noise() * 1.1;
    const gradeToDisplay10 = (grade) => Math.round((grade / 3) * 100) / 10;
    const symptomGrade = (phaseOffset) => Math.round(clamp((iga * 3) / 4 + symptomNoise(phaseOffset), 0, 3));
    const redness = gradeToDisplay10(symptomGrade(3.1));
    const bumps = gradeToDisplay10(symptomGrade(4.4));
    const scratch = gradeToDisplay10(symptomGrade(5.7));
    const thickening = gradeToDisplay10(symptomGrade(7.0));

    const date = addDaysKey(startKey, offset);
    /*
      배율이 상쇄된 넓이 지수 — 전신 지도의 점선 원이 이 값으로 커졌다 작아진다.

      **왜 dump에도 넣는가.** 이 값은 실제 촬영이 자(얼굴·몸통)를 찾았을 때만 생기는데, 데모
      폴더의 시계열은 촬영 없이 만들어진다. 그래서 넣지 않으면 전신 지도에 점선 원이 하나도
      안 떠서, 기능이 있는지 없는지조차 확인할 수 없다.

      IGA를 따라가게 만든다 — 병변이 심한 회차에 넓기도 한 것이 실제 추이의 모습이고, 그래야
      슬라이더를 끌 때 색과 크기가 함께 움직이는 것이 자연스럽게 보인다. 값은 "부위의 몇 %"
      (coveragePct) 기준으로 먼저 잡고(iga 0 → 2%, iga 4 → 20%) 지수로 되돌린다 — 화면이
      쓰는 환산(areaTrend의 coveragePctOf)의 역방향이라 그 화면에서 의도한 %가 그대로 나온다.

      ⚠️ 지어낸 값이다. 실기기 임계값을 잡을 때 이 숫자를 근거로 쓰면 안 된다.
    */
    const areaIndex = round1(
      clamp(2 + iga * 4.5 + noise() * 1.5, 0.5, 25) * AREA_OVER_AREA_REF[areaKind],
    );
    return {
      id: `${startKey}-${offset}`,
      seed: hashStr(`${startKey}-${offset}-${seedBase}`),
      date,
      dayOffset: offset,
      ts: new Date(date).getTime(),
      sleepScore,
      itchVas,
      iga,
      redness,
      bumps,
      scratch,
      thickening,
      // LesionThumb의 사진 오버레이 윤곽선 크기에만 쓰는 dump 값 — IGA 단계가 높을수록 넓게 잡는다.
      // UI 지표/그래프에는 더 이상 "병변 면적"으로 노출하지 않는다.
      lesionAreaPct: clamp(round1(3 + iga * 6 + noise() * 3), 0.5, 45),
      lesionAreaFaceIndex: areaIndex,
      lesionAreaScaleKind: areaKind,
      /*
        그 넓이를 병변 하나하나로 쪼갠 것 — 전신 지도가 이 개수만큼 원을 그린다.

        dump에도 넣는 이유는 위 전체 지수와 같다: 실제 촬영 없이는 원이 하나뿐이라 "여러 개"가
        되는지 확인할 방법이 없다. 조각의 합은 전체와 같게 맞춘다 — 화면이 두 값을 함께
        읽지는 않지만, 어긋난 dump는 나중에 실제 값을 의심하게 만든다.

        ⚠️ 개수도 크기도 지어낸 값이다.
      */
      lesionAreaRegions: splitAreaIntoRegions(areaIndex, iga, noise()),
      // 촬영 순서(i, 시간순 정렬됨)에 맞춰 실제 사진을 1:1로 매칭 — 그려낸 이미지가 아니라 실제 dump 이미지
      photo: photos[photoAt(i)],
      /*
        그 사진의 병변 오버레이 — 미리 구워 둔 에셋이다(tools/bake_dump_overlays.py).
        사진과 **같은 인덱스**를 쓴다: 다른 사진의 마스크를 얹으면 엉뚱한 자리를 병변이라고
        가리키게 되고, 그건 지어낸 도형을 그리던 예전과 다를 바가 없다.
      */
      overlay: overlays ? overlays[photoAt(i)] : null,
      /*
        피부상태측정(얼굴 스캔 — src/skinScan) 결과. 실제 총점과 같은 50~100 범위, 높을수록 좋다.
        IGA가 나쁠수록 낮게 나오도록 대략 따라가되(IGA 0 → 약 98, 4 → 약 54) 물결을 크게 얹어
        한 폴더 안에서도 낮은 값부터 높은 값까지 고루 나오게 한다 — 띠 색이 한쪽으로 몰리지 않게.
        ⚠️ 지어낸 dump 값이다 — 실제 스캔 결과를 기록에 저장하는 경로는 아직 없다.

        [분리판] 아토피 기록에는 피부장벽 값을 붙이지 않는다(피부장벽은 피부 장벽 폴더에만 쌓인다).
        다만 호출은 그대로 둔다 — 안에서 쓰는 noise()가 난수를 소비해서, 빼면 뒤 회차의 데모 값
        (IGA·증상)이 통합판과 달라진다. 값만 버린다.
      */
      skinScan: (makeDumpSkinScan(
        clamp(lerp(98, 54, igaContinuous / 4) + symptomWave(8.3) * 12 + noise() * 6, 50, 100),
        (phase) => symptomWave(phase) * 7 + noise() * 6,
      ), null),
      // 가장 최근 기록(오늘, offset === spanDays)에만 "병변 여러 곳" 예시를 붙인다 — 매 회차마다
      // 붙이면 정말 그렇게 찍힌 것처럼 보이고, 미리보기는 한 장이면 충분하다.
      ...(demoMultiRegionOnLast && offset === spanDays ? { regions: DEMO_REGIONS } : null),
    };
  });

  /*
    특정 날짜 하나만 손으로 고친다 (dateOverrides). 공식이 뽑은 값을 완전히 갈아 끼우는 대신
    "전날 대비 이렇게 바뀐다"로 적을 수 있게, 이미 계산된 바로 전 기록을 두 번째 인자로 넘긴다 —
    순서대로 처리하므로 그 전 기록에 override가 있었다면 그 결과까지 반영된 값이다.
  */
  if (dateOverrides) {
    for (let i = 0; i < records.length; i++) {
      const fix = dateOverrides[records[i].date];
      if (fix) records[i] = { ...records[i], ...fix(records[i], records[i - 1] ?? null) };
    }
  }

  return records;
}

/**
 * @param areaKind dump 넓이 지수를 어느 자 기준으로 적을지.
 *   ⚠️ 팔·다리 폴더에는 실제로 대응하는 자가 없다(지금 자가 있는 곳은 얼굴·몸통뿐). 그래도
 *   'face'를 기본으로 두는 이유는 이 값이 **원 크기에 전혀 영향을 주지 않기 때문**이다 —
 *   여기서 곱한 상수를 화면이 그대로 나누므로 의도한 %가 왕복해서 그대로 돌아온다. 값이
 *   쓰이는 곳은 "얼굴의 12%" 같은 문구뿐이고, 그 카드는 지금 화면에서 내려가 있다.
 */
function makeFolder({ id, targetId, name, disease, spanDaysAgoStart, spanDays, captureCount, from, to, photos, overlays, photoStart, demoMultiRegionOnLast, areaKind = 'face', dateOverrides }) {
  const startDate = addDaysKey(todayKey(), -spanDaysAgoStart);
  const seedBase = hashStr(id + name);
  return {
    id,
    targetId,
    name,
    disease,
    startDate,
    createdTs: Date.now(),
    records: generateRecords(startDate, seedBase, { spanDays, captureCount, from, to, photos, overlays, photoStart, demoMultiRegionOnLast, areaKind, dateOverrides }),
  };
}

/** 데모 폴더도 실제 등록으로 만들어진 폴더와 똑같이 "{부위} {질환}" 이름을 쓴다 */
const demoName = (t) => folderNameOf(t.label, t.diagnosis?.disease);

/*
  ── 프리셋 폴더 (dump) ───────────────────────────────────────────────
  다섯을 다 만들어 두되 **화면에 올리는 것은 VISIBLE_DEMO_TARGET_IDS에 든 자리뿐이다**
  (지금은 팔 건선·몸통 아토피 둘). 나머지를 여기서 지우지 않는 이유는 targets.ts의 그 상수
  주석에 적어 뒀다 — 시계열 값들이 화면 확인용으로 골라 만든 것이라 되살리기 비싸다.

  다 만든 뒤에 거르는 것은 만드는 비용이 사실상 없어서다(폴더당 기록 6~14줄). 정의를 그대로 둔 채
  목록 하나로만 켜고 끌 수 있는 편이, 만들기 전에 거르려고 정의를 구조부터 바꾸는 것보다 낫다.

  순서: 마지막 기록이 전부 "오늘"이라(spanDaysAgoStart === spanDays로 맞춰 둠) 최신 시각이
  동률인데, latestRecordAcrossFolders()는 그때 먼저 나온 쪽을 최신으로 본다 — 홈 화면의 "최근
  피부 상태"가 어느 폴더를 보여줄지가 여기서 정해진다. 그래서 아래 목록의 **선언 순서가 아니라
  VISIBLE_DEMO_TARGET_IDS의 순서**를 따르게 했다: 보이는 것과 그 순서를 한 곳에서 정하지 않으면,
  목록에서 하나를 껐을 때 홈 카드가 왜 딴 폴더로 바뀌었는지 알 수 없다.
*/
const DEMO_FOLDERS = [
  makeFolder({
    id: 'f3',
    targetId: DEMO_TARGETS[2].id, // 다리 아토피피부염
    name: demoName(DEMO_TARGETS[2]),
    disease: DEMO_TARGETS[2].diagnosis?.disease,
    spanDaysAgoStart: 30,
    spanDays: 30,
    captureCount: 10,
    from: { sleep: 64, itch: 6, iga: 3.2 },
    /*
      최종 IGA 1 → "주의"(노랑). 개선 사례이되 **0으로 끝내지 않는다.**

      0은 "완전히 나았다"라서 네 증상도 전부 0이 될 수밖에 없다 — 상세 결과 화면이 온통
      "없음"으로 덮이고, 무엇보다 그 옆에 붙은 사진에는 발진이 뚜렷하게 보인다. 화면이 사진과
      모순되는 것이 개선 폭이 조금 줄어드는 것보다 나쁘다.
    */
    to: { sleep: 79, itch: 2, iga: 1.4 },
    photos: ATOPIC_PHOTOS,
    overlays: ATOPIC_OVERLAYS,
    // 최신 회차(i=9)가 14번 사진이 되도록: (4 + 9) % 14 = 13 — 팔 폴더와 맞바꾼 자리다
    photoStart: 4,
  }),
  makeFolder({
    id: 'f1',
    targetId: DEMO_TARGETS[0].id, // 팔 건선
    name: demoName(DEMO_TARGETS[0]),
    disease: DEMO_TARGETS[0].diagnosis?.disease,
    spanDaysAgoStart: 53,
    spanDays: 53,
    captureCount: 14,
    from: { sleep: 58, itch: 7, iga: 3.8 },
    to: { sleep: 84, itch: 2, iga: 0.4 },
    photos: ATOPIC_PHOTOS,
    overlays: ATOPIC_OVERLAYS,
    // 최신 회차(i=13)가 10번 사진이 되도록: (10 + 13) % 14 = 9 — 다리 폴더와 맞바꾼 자리다
    photoStart: 10,
  }),
  makeFolder({
    id: 'f2',
    targetId: DEMO_TARGETS[1].id, // 머리 주사
    name: demoName(DEMO_TARGETS[1]),
    disease: DEMO_TARGETS[1].diagnosis?.disease,
    spanDaysAgoStart: 21,
    spanDays: 21,
    captureCount: 7,
    from: { sleep: 82, itch: 2, iga: 0.8 },
    to: { sleep: 68, itch: 5, iga: 3.6 },
    photos: CHEEK_PHOTOS,
    overlays: CHEEK_OVERLAYS,
  }),
  makeFolder({
    id: 'f4',
    targetId: DEMO_TARGETS[3].id, // 얼굴 아토피피부염
    name: demoName(DEMO_TARGETS[3]),
    disease: DEMO_TARGETS[3].diagnosis?.disease,
    spanDaysAgoStart: 18,
    spanDays: 18,
    captureCount: 6,
    /*
      나빠지는 사례. 최종 IGA 3 → "나쁨"(주황).

      전신 지도는 아토피 폴더만 올리는데, 예전에는 다리·얼굴 둘 다 좋아지는 시계열이라 어느
      시점을 골라도 두 점의 색이 거의 같았다 — 색 구분이 있는지조차 확인할 수 없었다. 지금은
      다리(개선·파랑) · 몸통(유지·노랑) · 얼굴(악화·주황) 셋이 서로 다른 단계에 놓인다.
      IGA 표시값이 100 − 등급×25라 등급 1과 2가 같은 "주의"에 묶이므로, 색을 갈라 두려면
      최종 등급이 0 / 1~2 / 3 / 4처럼 **다른 구간**에 떨어져야 한다.
    */
    from: { sleep: 78, itch: 2, iga: 1.2 },
    to: { sleep: 62, itch: 6, iga: 3.2 },
    photos: CHEEK_PHOTOS,
    overlays: CHEEK_OVERLAYS,
  }),
  makeFolder({
    id: 'f5',
    targetId: DEMO_TARGETS[4].id, // 몸통 아토피피부염
    name: demoName(DEMO_TARGETS[4]),
    disease: DEMO_TARGETS[4].diagnosis?.disease,
    areaKind: 'torso',
    spanDaysAgoStart: 24,
    spanDays: 24,
    captureCount: 8,
    /*
      좋아지는 사례로 뒤집었다. 시작 IGA 3.9 → "매우 나쁨"(빨강), 최종 IGA 1.4 → "주의"(노랑).
      f3(다리)와 같은 이유로 0까지 내리지 않는다 — 완전히 나은 것으로 끝내면 세부 증상도
      전부 0이 되어 사진(뚜렷한 발진)과 화면이 모순된다.
    */
    from: { sleep: 54, itch: 8, iga: 3.9 },
    to: { sleep: 76, itch: 3, iga: 1.4 },
    // 실제 몸통 아토피 사진 1장(첨부받은 것)을 모든 회차에 재사용한다 — dumpPhotos.js 참고.
    photos: TORSO_PHOTOS,
    overlays: TORSO_OVERLAYS,
    /*
      8/5 회차 손보정: 공식대로면 이날 피부 질환(iga)가 전날보다 나빠지는데, 그러면 안
      되고 전날과 같은 값으로 "유지"돼야 한다. 수면 점수·가려움(VAS)도 전날보다 좋아지는
      쪽으로 튼다 — 가려움은 VAS가 낮을수록 표시 점수(가려움 안정도)가 올라간다.
    */
    dateOverrides: {
      '2026-08-05': (r, prev) => (prev ? {
        iga: prev.iga,
        sleepScore: clamp(prev.sleepScore + 3, 0, 100),
        itchVas: clamp(prev.itchVas - 1, 0, 10),
      } : {}),
    },
    /*
      seg가 판정 단위를 여러 개로 나눈 촬영의 미리보기(RegionSymptomsCard).

      다리 폴더에 붙어 있던 것을 옮겨 왔다 — 그 폴더를 감추면서 예시가 데모에서 통째로 사라졌다.
      붙일 자리의 기준은 그때와 같다: **보이는 폴더 중 홈에서 가장 먼저 뜨는 대표 폴더**라야
      확인하기 쉽다(VISIBLE_DEMO_TARGET_IDS의 첫 자리가 이 폴더다).
    */
    demoMultiRegionOnLast: true,
  }),
];

/*
  ── 피부 장벽 폴더 ───────────────────────────────────────────────────
  피부 장벽만 잰 기록을 모으는 폴더(kind: 'barrier'). 얼굴 전체를 재는 측정이라 자리가 하나뿐이어서
  폴더도 하나만 둔다 — 신규 증상 기록에서 피부 질환을 넘어가고 피부 장벽만 재면 여기에 쌓인다.

  기록에는 피부 질환 값(iga·증상·넓이)이 없다(null). 경과 페이지는 이 폴더를 피부 장벽 전용
  화면(BarrierFolderScreen)으로 보여주고, 홈의 "최근 피부 상태"는 이 폴더를 건너뛴다.
*/
export const BARRIER_FOLDER_NAME = '피부 장벽';
/** 피부 장벽 측정 촬영 대상 id — SkinScanScreen의 FACE_SCAN_TARGET과 같은 값 */
export const BARRIER_TARGET_ID = 'tgt_skin_barrier_scan';
export const isBarrierFolder = (folder) => folder?.kind === 'barrier';

/** 피부 장벽만 잰 기록 한 줄 — 피부 질환 값은 비워 둔다 */
function barrierRecord({ folderId, date, dayOffset, ts, sleepScore, itchVas, skinScan }) {
  /** @type {any} — 피부 질환 값이 비어 있어 일반 기록과 모양이 달라, 타입 추론에서 섞이지 않게 둔다 */
  const record = {
    id: `${folderId}-${date}-${ts}`,
    seed: hashStr(`${folderId}-${date}-${ts}`),
    date,
    dayOffset,
    ts,
    sleepScore,
    itchVas,
    iga: null,
    redness: null,
    bumps: null,
    scratch: null,
    thickening: null,
    lesionAreaPct: null,
    lesionAreaFaceIndex: null,
    lesionAreaScaleKind: null,
    lesionAreaRegions: null,
    lesionAreaLowRes: false,
    // 목록·기록 탭 썸네일은 그날 찍은 얼굴 사진
    photo: skinScan?.photo ?? null,
    overlay: null,
    skinScan,
  };
  return record;
}

/**
 * 피부 장벽 덤프 폴더 — 점수가 from → to로 대략 오르며 출렁인다(⚠️ 지어낸 값).
 * 얼굴 사진은 dumpPhotos의 FACE_PHOTO 한 장을 모든 회차가 같이 쓴다.
 */
function makeBarrierFolder({ id, spanDays, stepDays, from, to }) {
  const startDate = addDaysKey(todayKey(), -spanDays);
  const rng = makeRng(hashStr(`${id}:barrier`));
  /*
    대략 stepDays마다 한 번(±1일) 잰다 — 무작위로 흩으면 한 주가 통째로 비어 전신 결과 그래프의 선이
    끊겼다. 간격이 6일을 넘지 않으므로 어느 주(7일)에도 최소 한 번은 기록이 있다. 첫날·오늘은 항상 잰다.
  */
  const offsets = new Set([0, spanDays]);
  for (let d = stepDays; d < spanDays - 1; d += stepDays) {
    offsets.add(clamp(d + Math.round((rng() - 0.5) * 2), 1, spanDays - 1));
  }
  const sorted = [...offsets].sort((a, b) => a - b);
  const phase = rng() * Math.PI * 2;
  const now = Date.now();
  const records = sorted.map((offset, i) => {
    const t = sorted.length > 1 ? i / (sorted.length - 1) : 1;
    const envelope = Math.sin(t * Math.PI); // 첫·마지막 회차는 from/to 그대로
    const wave = (k) => Math.sin(t * Math.PI * 3.1 + phase + k) * envelope;
    const noise = () => rng() - 0.5;
    const total = clamp(lerp(from, to, t) + wave(0) * 9 + noise() * 4, 50, 100);
    const scan = makeDumpSkinScan(total, (k) => wave(k) * 6 + noise() * 5);
    return barrierRecord({
      folderId: id,
      date: addDaysKey(startDate, offset),
      dayOffset: offset,
      ts: now - (spanDays - offset) * 86400000,
      sleepScore: clamp(Math.round(lerp(68, 80, t) + wave(1.7) * 6 + noise() * 4), 0, 100),
      itchVas: clamp(Math.round(lerp(4, 2, t) + wave(2.9) * 1.5 + noise()), 0, 10),
      skinScan: scan,
    });
  });
  /** @type {any} */
  const folder = { id, kind: 'barrier', targetId: BARRIER_TARGET_ID, name: BARRIER_FOLDER_NAME, disease: undefined, startDate, createdTs: now, records };
  return folder;
}

/*
  피부 장벽 데모 기록은 화면에 오른 다른 데모 폴더의 **가장 오래된 기록부터 오늘까지** 이어지게 만든다 —
  전신 결과 그래프(가려움·수면·피부 장벽)가 같은 기간을 처음부터 끝까지 나란히 그리도록.
*/
const DEMO_SPAN_DAYS = Math.max(
  0,
  ...DEMO_FOLDERS.filter((f) => VISIBLE_DEMO_TARGET_IDS.includes(f.targetId)).map((f) =>
    f.records.length ? daysBetween(f.records[0].date, todayKey()) : 0,
  ),
);
const DEMO_BARRIER_FOLDER = makeBarrierFolder({ id: 'fb1', spanDays: DEMO_SPAN_DAYS || 24, stepDays: 4, from: 62, to: 90 });

/** 화면에 실제로 오르는 데모 폴더 — 목록에 없는 자리는 만들어만 두고 쓰지 않는다 */
let folders = [
  ...VISIBLE_DEMO_TARGET_IDS.flatMap((id) => {
    // 목록에 없는 id가 적혀 있어도 앱은 그 폴더만 빠진 채 그대로 돈다
    const folder = DEMO_FOLDERS.find((f) => f.targetId === id);
    return folder ? [folder] : [];
  }),
  DEMO_BARRIER_FOLDER,
];

const listeners = new Set();
function emit() { listeners.forEach((l) => l()); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function getFolders() { return folders; }
export function useFolders() { return useSyncExternalStore(subscribe, getFolders); }
export function getFolder(id) { return folders.find((f) => f.id === id) || null; }
export function useFolder(id) {
  useFolders(); // 변경 시 리렌더 트리거용 구독
  return getFolder(id);
}

/** 한 모니터링 대상(MonitorTarget)에 딸린 폴더 */
export function getFolderByTarget(targetId) {
  return folders.find((f) => f.targetId === targetId) || null;
}

/**
 * 모든 폴더를 통틀어 가장 최근 촬영 기록 하나 (홈 화면 요약 카드용). 폴더 안 기록은 항상
 * 날짜 오름차순(offset 순)으로 쌓이므로 각 폴더의 마지막 기록끼리만 ts로 비교하면 된다.
 * 폴더가 하나도 없으면(또는 전부 기록이 비어 있으면) null.
 */
export function latestRecordAcrossFolders() {
  let best = null;
  for (const folder of folders) {
    // 홈의 "최근 피부 상태"는 피부 질환 기록을 보여주는 카드라 피부 장벽 전용 폴더는 건너뛴다
    if (isBarrierFolder(folder)) continue;
    const last = folder.records[folder.records.length - 1];
    if (last && (!best || last.ts > best.record.ts)) best = { folder, record: last };
  }
  return best;
}

export function useLatestMonitoringRecord() {
  useFolders(); // 변경 시 리렌더 트리거용 구독
  return latestRecordAcrossFolders();
}

export function deleteFolder(id) {
  folders = folders.filter((f) => f.id !== id);
  emit();
}

/**
 * 한 모니터링 대상의 폴더를 (없으면 "{부위} {질환}" 이름으로 만들어서) 돌려준다 — 기록은 넣지 않는다.
 *
 * 카메라 탭의 "경과 기록에 연동" 흐름이 쓴다: 폴더를 먼저 확보한 뒤 recordExam으로 방금 검사한
 * 실측값을 오늘 기록으로 넣는다. 여기서 일부러 emit하지 않는데, 기록이 0개인 순간이 구독자에게
 * 보이면 폴더 화면이 빈 배열을 그리게 되기 때문이다 — 기록까지 채운 recordExam이 한 번만 알린다.
 *
 * @param {{ targetId: string, name: string, disease?: string }} args
 * @returns {string} 폴더 id
 */
export function ensureFolder({ targetId, name, disease }) {
  const existing = getFolderByTarget(targetId);
  /*
    이미 있으면 **그대로 돌려준다 — 이름도 질환명도 건드리지 않는다.**

    예전에는 질환명이 바뀌면 폴더 이름을 따라 바꿨다. 그런데 그러면 예전 회차까지 소급해서
    새 질환의 폴더가 된다: '주사'로 판정돼 쌓인 두 장 위에 '아토피피부염' 기록이 붙고 이름만
    아토피로 바뀌어, 사용자 눈에는 처음부터 아토피였던 것이 된다. 더 나쁜 것은 등급이다 —
    아토피가 아닌 회차는 등급을 아예 재지 않고 0으로 저장되는데(unsupportedDiseaseResult),
    폴더가 아토피가 되는 순간 그 0들이 "완벽히 깨끗함"으로 그래프에 그려진다.

    지금은 애초에 그 상황이 생기지 않는다. "신규 증상 기록하기"가 매번 새 대상을 만들고
    (MonitoringContext의 createTarget), 이어서 기록은 질환 분류를 돌리지 않으므로
    **한 폴더의 질환은 만들어질 때 정해지고 끝까지 바뀌지 않는다.** 이 함수는 그 불변을
    지키는 쪽에 서 있으면 된다 — 여기로 다시 들어오는 경우는 같은 결과 화면에서 연동 버튼을
    두 번 누른 정도다.
  */
  if (existing) return existing.id;

  const id = `f_${targetId}`;
  folders = [
    { id, targetId, name: uniqueFolderName(name), disease, startDate: todayKey(), createdTs: Date.now(), records: [] },
    ...folders,
  ];
  return id;
}

/**
 * 같은 이름의 폴더가 이미 있으면 뒤에 번호를 붙인다 ("머리 아토피피부염" → "머리 아토피피부염 (2)").
 *
 * 신규 등록이 매번 새 폴더를 만들게 되면서 필요해졌다 — 같은 자리에 같은 질환이 다시 잡히면
 * 이름이 글자 하나까지 똑같은 폴더가 둘 생긴다. 목록에 마지막 기록 날짜가 함께 나오긴 하지만,
 * "이어서 기록할 폴더"를 고르는 자리에서 이름만으로 구분이 안 되면 엉뚱한 폴더에 이어붙게 된다.
 */
function uniqueFolderName(name) {
  if (!folders.some((f) => f.name === name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!folders.some((f) => f.name === candidate)) return candidate;
  }
}

/**
 * 카메라 탭 검사 결과(온디바이스 모델의 **실측값**)를 폴더의 오늘 기록으로 남긴다.
 *
 * addRecord가 만드는 dump 수치와 달리 iga·세부 증상·병변 면적이 전부 실제 분석 결과다.
 * 같은 날 이미 기록이 있으면(하루 여러 번 검사) 새로 덮어쓴다.
 *
 * 수면 점수는 검사가 만들어내는 값이 아니라 삼성헬스 연동 값이라, 직전 기록의 값을 이어받는다.
 * 이어받을 기록조차 없으면 그래프가 깨지지 않도록 중립값을 넣되 hasSleepSource=false로 알려서
 * 결과 화면이 "등록 안함"을 띄우게 한다.
 *
 * 가려움(itchVas)도 마찬가지로 검사가 재는 값이 아니다 — 기록 탭에서 하루에 한 번 받는다
 * (records/itchStore). 그날 아직 적지 않았으면 null이 넘어오고, 그때는 직전 기록의 값을
 * 이어받는다. 나중에 적으면 applyDayItch가 이 기록까지 소급해서 고치므로, 이 자리의 값은
 * "아직 그날 값이 없는 동안 그래프가 끊기지 않게 하는 임시값"이다.
 *
 * @param {{ folderId: string, iga: number, redness: number, bumps: number, scratch: number,
 *           thickening: number, itchVas: number|null, areaPct: number,
 *           faceAreaIndex?: number|null, faceAreaKind?: 'face'|'torso'|null, lowRes?: boolean,
 *           areaRegions?: {index: number, iga: number}[]|null,
 *           photoUri?: string, maskUri?: string, skinScan?: any }} args
 * @returns {{ record: any, hasSleepSource: boolean }|null}
 */
export function recordExam({
  folderId, iga, redness, bumps, scratch, thickening, itchVas, areaPct,
  faceAreaIndex = null, faceAreaKind = null, lowRes = false, areaRegions = null, photoUri, maskUri,
  skinScan = null,
}) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;

  const date = todayKey();
  const dayOffset = daysBetween(folder.startDate, date);
  const last = folder.records[folder.records.length - 1];
  const stamp = Date.now();

  const record = {
    id: `${folder.id}-${date}-${stamp}`,
    seed: hashStr(`${folder.id}-${date}-${stamp}`),
    date,
    dayOffset,
    ts: stamp,
    sleepScore: last ? last.sleepScore : 75,
    itchVas: itchVas != null ? clamp(Math.round(itchVas), 0, 10) : (last ? last.itchVas : 0),
    iga: clamp(round1(iga), 0, 4),
    redness: clamp(round1(redness), 0, 10),
    bumps: clamp(round1(bumps), 0, 10),
    scratch: clamp(round1(scratch), 0, 10),
    thickening: clamp(round1(thickening), 0, 10),
    lesionAreaPct: clamp(round1(areaPct), 0.5, 100),
    /*
      배율이 상쇄된 넓이 지수 — 이것만이 회차 간 비교에 쓸 수 있다.
      lesionAreaPct는 사진 대비 %라 10cm만 가까이 가도 두 배가 된다.

      상한을 두지 않는다(얼굴 크기 d·v 대비 지수라 100을 넘을 수 있다). 그리고 없는 값은 0이
      아니라 null이어야 한다 — "못 쟀다"와 "없다"는 다르다. 0으로 채우면 그래프가 "병변이
      사라졌다"고 말하게 된다.
    */
    lesionAreaFaceIndex: faceAreaIndex == null ? null : Math.max(0, round1(faceAreaIndex)),
    /** 그 지수를 무엇으로 나눴는지. 없으면 얼굴 — 이 필드가 생기기 전 기록은 전부 얼굴이었다 */
    lesionAreaScaleKind: faceAreaIndex == null ? null : faceAreaKind ?? 'face',
    /*
      **병변 하나하나의** 넓이 지수와 등급 — 위 전체 지수를 조각으로 나눠 놓은 것이다.
      전신 지도가 이 배열을 받아 병변 개수만큼 원을 그리고, 원마다 자기 넓이로 크기를 정한다.

      전체 지수와 같은 자로 잰 값이라 단위가 같다(둘 다 100 × 넓이 ÷ d·v). 옛 기록에는 이 필드가
      없으므로 화면은 없을 때 원 하나로 되돌아갈 수 있어야 한다 — 없는 것과 "병변이 0개"는 다르다.
    */
    lesionAreaRegions: faceAreaIndex == null ? null : areaRegions ?? null,
    /*
      원본 해상도가 낮아 값이 흔들릴 수 있는 회차. 값을 빼지는 않는다 — 해상도는 넓이를
      틀리게 만들지 않고 흔들리게만 하기 때문이다. 추세가 이 점에서 튀었을 때 이유를 댈 수
      있어야 해서 기록까지 따라온다(areaTrend의 AreaPoint.lowRes).
    */
    lesionAreaLowRes: faceAreaIndex == null ? false : !!lowRes,
    photo: photoUri ? { uri: photoUri } : (last ? last.photo : null),
    /*
      분석이 합성해 둔 병변 오버레이 — 촬영 직후 결과 화면이 보여주는 바로 그 그림이다.

      사진과 달리 **직전 기록에서 물려받지 않는다.** 오버레이는 그 사진에서 찾은 병변의 모양이라,
      다른 사진 위에 얹으면 엉뚱한 자리를 병변이라고 가리키게 된다. 없으면 없는 채로 둔다 —
      화면(LesionThumb)이 그때만 예전의 윤곽선 도형으로 되돌아간다.
    */
    overlay: maskUri ? { uri: maskUri } : null,
    /*
      피부 장벽 측정 결과 — 신규 증상 기록에서 피부 장벽 측정까지 했으면 서버 응답(SkinScanResult)에
      얼굴 사진(photo)을 붙여 넘겨받는다. 안 쟀으면 null이라 띠에서 회색(미측정)으로 보인다.
    */
    skinScan,
  };

  /*
    촬영 한 번이 기록 하나다 — 같은 날 두 번 찍어도 덮어쓰지 않는다.

    예전에는 날짜가 같으면 덮어썼다. "하루에 한 줄"은 그래프를 단순하게 만들지만 대가가 컸다:
    아침에 찍은 사진이 저녁에 찍으면 **소리 없이 사라진다.** 사용자는 저장 완료를 봤는데 기록에는
    없으니 앱이 사진을 잃어버린 것으로 보인다.

    넓이 추이에는 더 직접적인 문제가 있다. 같은 날 여러 번 찍으면 잰 회차가 영영 한 개라
    "기준이 되는 첫 촬영이 기록됐어요"에서 다음으로 넘어가질 못한다 — 하루 안에서는 넓이 기능이
    아예 동작하지 않는 셈이다.

    같은 날 기록이 여럿이면 시간 순으로 나란히 쌓인다(ts로 뒷순위를 가른다).
  */
  const records = [...folder.records, record].sort((a, b) => a.dayOffset - b.dayOffset || a.ts - b.ts);
  folders = folders.map((f) => (f.id === folder.id ? { ...f, records } : f));
  emit();
  return { record, hasSleepSource: !!last };
}

/** 피부 장벽 폴더 id — 없으면 새로 만든다 (폴더는 하나뿐이다) */
export function ensureBarrierFolder() {
  const existing = folders.find(isBarrierFolder);
  if (existing) return existing.id;
  const id = `fb_${Date.now()}`;
  folders = [
    ...folders,
    { id, kind: 'barrier', targetId: BARRIER_TARGET_ID, name: BARRIER_FOLDER_NAME, startDate: todayKey(), createdTs: Date.now(), records: [] },
  ];
  emit();
  return id;
}

/**
 * 피부 장벽 폴더에 오늘 기록을 남긴다 — 피부 질환을 넘어가고 피부 장벽만 잰 촬영.
 * @param {{ folderId: string, skinScan: any, itchVas: number|null }} args
 * @returns {{ record: any }|null}
 */
export function recordBarrier({ folderId, skinScan, itchVas }) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;
  const date = todayKey();
  const last = folder.records[folder.records.length - 1];
  const record = barrierRecord({
    folderId,
    date,
    dayOffset: daysBetween(folder.startDate, date),
    ts: Date.now(),
    sleepScore: last ? last.sleepScore : 75,
    itchVas: itchVas != null ? clamp(Math.round(itchVas), 0, 10) : (last ? last.itchVas : 0),
    skinScan,
  });
  const records = [...folder.records, record].sort((a, b) => a.dayOffset - b.dayOffset || a.ts - b.ts);
  folders = folders.map((f) => (f.id === folderId ? { ...f, records } : f));
  emit();
  return { record };
}

/**
 * 기록 하나를 지운다 — 이어서 기록하기에서 피부 질환을 "다시 촬영"하면 같은 회차의 앞 기록을
 * 새 기록으로 바꿔야 해서 쓴다(안 지우면 같은 회차가 두 줄로 남는다).
 *
 * @returns {boolean} 지웠는지
 */
export function removeRecord(folderId, recordId) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder || !folder.records.some((r) => r.id === recordId)) return false;
  const records = folder.records.filter((r) => r.id !== recordId);
  folders = folders.map((f) => (f.id === folderId ? { ...f, records } : f));
  emit();
  return true;
}

/**
 * 이미 남긴 기록에 피부 장벽 측정 결과를 붙인다 — 이어서 기록하기에서 피부 질환을 먼저 찍고
 * 피부 장벽을 나중에 쟀을 때 쓴다(반대 순서면 recordExam의 skinScan으로 처음부터 함께 넣는다).
 * 다시 쟀으면 새 값으로 덮어쓴다 — 한 기록에 피부 장벽은 하나다.
 *
 * @param {string} folderId
 * @param {string} recordId
 * @param {any} skinScan — 서버 응답(SkinScanResult)에 얼굴 사진 photo를 붙인 것
 * @returns {boolean} 붙였는지
 */
export function attachSkinScan(folderId, recordId, skinScan) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder || !folder.records.some((r) => r.id === recordId)) return false;
  const records = folder.records.map((r) => (r.id === recordId ? { ...r, skinScan } : r));
  folders = folders.map((f) => (f.id === folderId ? { ...f, records } : f));
  emit();
  return true;
}

/**
 * 그날 촬영한 기록 **전부**에 가려움 값을 입힌다 (records/itchStore가 부른다).
 *
 * 가려움은 하루의 상태라 그날 찍은 사진들이 서로 다른 값을 가질 이유가 없다. 그런데 촬영과
 * 기록의 순서는 사용자가 정하므로, 아침에 두 장 찍고 저녁에 가려움을 적는 일이 얼마든지 생긴다 —
 * 그때 아침 기록 둘이 예전 값(직전 기록에서 물려받은 값)으로 남으면 사용자가 방금 적은 것과
 * 기록이 어긋난다. 그래서 나중에 적어도 소급해서 함께 고친다.
 *
 * 값이 실제로 바뀐 기록이 하나도 없으면 아무에게도 알리지 않는다 — 촬영할 때마다 같은 값을
 * 다시 입히게 되는데, 그때마다 폴더 목록·달력·그래프를 통째로 다시 그릴 이유가 없다.
 *
 * @param {string} dateKey — "2026-08-12" (기록의 date와 같은 형식)
 * @param {number} vas — 가려움 VAS 0~10
 * @returns {number} 값이 바뀐 기록 수
 */
export function applyDayItch(dateKey, vas) {
  const v = clamp(Math.round(vas), 0, 10);
  let touched = 0;

  const next = folders.map((folder) => {
    if (!folder.records.some((r) => r.date === dateKey && r.itchVas !== v)) return folder;
    const records = folder.records.map((r) => {
      if (r.date !== dateKey || r.itchVas === v) return r;
      touched += 1;
      return { ...r, itchVas: v };
    });
    return { ...folder, records };
  });

  if (!touched) return 0;
  folders = next;
  emit();
  return touched;
}

/**
 * "오늘의 피부 상태 기록" 버튼으로 방금 촬영한 사진을 폴더에 새 기록으로 추가한다.
 * 아직 실제 분석 파이프라인이 없어(온디바이스 모델 연동 전) 마지막 기록 값을 기준으로 살짝
 * 흔들어 오늘치 dump 수치를 만든다 — 프리셋 폴더의 시계열 생성과 같은 잡음 스타일이다.
 * 같은 날 이미 기록이 있으면(하루 여러 번 촬영) 새로 덮어쓴다.
 *
 * @param {string} folderId
 * @param {{ uri: string }} photo — 카메라/앨범에서 방금 고른 사진
 */
export function addRecord(folderId, photo) {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;

  const date = todayKey();
  const dayOffset = daysBetween(folder.startDate, date);
  const last = folder.records[folder.records.length - 1];
  const rng = makeRng(hashStr(`${folderId}-${date}-${Date.now()}`));
  const jitter = (span, amt) => (rng() - 0.5) * span * amt;

  const sleepScore = clamp(Math.round((last ? last.sleepScore : 75) + jitter(100, 0.12)), 0, 100);
  const itchVas = clamp(Math.round((last ? last.itchVas : 3) + jitter(10, 0.12)), 0, 10);
  const iga = clamp(round1((last ? last.iga : 1.5) + jitter(4, 0.12)), 0, 4);
  const skin10 = iga * 2;
  const symptomNoise = () => jitter(3, 0.4);
  const redness = clamp(round1(skin10 + symptomNoise()), 0, 10);
  const bumps = clamp(round1(skin10 + symptomNoise()), 0, 10);
  const scratch = clamp(round1(skin10 + symptomNoise()), 0, 10);
  const thickening = clamp(round1(skin10 + symptomNoise()), 0, 10);

  const record = {
    id: `${folderId}-${date}-${Date.now()}`,
    seed: hashStr(`${folderId}-${date}-${Date.now()}`),
    date,
    dayOffset,
    ts: Date.now(),
    sleepScore,
    itchVas,
    iga,
    redness,
    bumps,
    scratch,
    thickening,
    lesionAreaPct: clamp(round1(3 + iga * 6 + jitter(3, 0.4)), 0.5, 45),
    photo,
  };

  const existingIdx = folder.records.findIndex((r) => r.date === date);
  const records = existingIdx >= 0
    ? folder.records.map((r, i) => (i === existingIdx ? record : r))
    : [...folder.records, record].sort((a, b) => a.dayOffset - b.dayOffset);

  folders = folders.map((f) => (f.id === folderId ? { ...f, records } : f));
  emit();
  return record;
}
