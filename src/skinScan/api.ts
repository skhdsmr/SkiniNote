import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
/**
 * 기준 피험자 965명의 연령대별 피부 장벽 총점(정렬됨) — serve_skin.py ref_total_scores로 뽑은 값.
 * 서버 공식(평균·SD·비중)을 바꾸면 이 파일도 다시 뽑아야 한다.
 */
import REF_TOTAL_SCORES from './refTotalScores.json';

/**
 * 피부장벽진단 서버(피부상태_파이프라인/serve_skin.py) 호출.
 *
 * 얼굴 부위 추출(MediaPipe)과 QuadTree 모델 3개(주름·모공·수분)는 GPU 서버에서 돈다 — Expo Go는
 * 네이티브 모델을 실행할 수 없고, QuadTree attention은 CUDA 전용 연산이라 기기용으로 바꿀 수도 없다.
 *
 * 서버 주소는 .env의 EXPO_PUBLIC_SKIN_API_URL로 정한다 (예: cloudflared가 준 https 주소).
 * Metro가 번들할 때 값을 박아 넣으므로, 바꾼 뒤에는 `npx expo start -c`로 캐시를 지우고 다시 연다.
 */

export const SKIN_API_URL =
  Platform.OS === 'web'
    ? // 웹 미리보기는 브라우저가 Metro와 같은 주소로 부른다 — metro.config.js가 /skin-api를
      // 같은 서버의 추론 서버(127.0.0.1:8765)로 넘긴다. 터널·CORS 없이 된다.
      '/skin-api'
    : (process.env.EXPO_PUBLIC_SKIN_API_URL ?? '').replace(/\/+$/, '');

export type Band = 'good' | 'normal' | 'caution' | 'care';

export interface PartResult {
  part: string;
  label: string;
  /** 모델 출력 — 주름·모공은 4단계로 묶은 등급의 기대값(Σ 등급 × 확률, 0~3), 수분은 실측 단위 */
  value: number;
  /** 등급 모델의 argmax 등급 0~3 (0이 가장 좋다, 수분에는 없다) */
  grade?: number;
  /** 사용자에게 보여주는 레벨 1~4 — 등급 0이 레벨 4 (점수처럼 높을수록 좋다) */
  level?: number;
  score: number;
  band: Band;
  bandLabel: string;
  /** 같은 연령대의 이 부위 평균 점수 (주름·모공만, 나이를 모르면 null) */
  ageAvgScore?: number | null;
  /** 같은 연령대의 이 부위 평균 레벨 (주름·모공만, 예: 3.4) */
  ageAvgLevel?: number | null;
}

export interface MetricResult {
  key: 'wrinkle' | 'pore' | 'moisture';
  label: string;
  score: number;
  band: Band;
  bandLabel: string;
  value: number;
  ageAvgScore: number | null;
  /** 수분량만 — 연령대(나이를 모르면 전체)의 수분량 평균·SD, lo~hi = 연령대 평균 범위(평균 ± 0.25SD) */
  ageNorm?: AgeNorm;
  /** 수분량만 — 레벨 경계 6개 (전체 기준, 이 값 이상이면 한 단계 위) */
  levelEdges?: number[];
  parts: PartResult[];
  /** 앱에 보여주는 레벨 항목 (주름: 이마·미간, 눈가 / 모공: 볼 / 수분량: 4부위 평균) */
  items?: LevelItem[];
}

/**
 * 레벨 1~7 (높을수록 좋다)
 *   주름·모공: 두 부위 레벨(1~4)의 평균을 정수로 — 레벨 = 평균 × 2 − 1 (평균 1 → 1, 1.5 → 2, …, 4 → 7)
 *   수분량: 전체 965명 평균에서 0.5SD 간격 (평균 ± 0.25SD = 4), 나이와 상관없는 절대 기준
 */
export interface LevelItem {
  key: string;
  label: string;
  parts: string[];
  level: number;
  levelMax: number;
  /** 같은 연령대의 평균 레벨 (나이를 모르면 null) */
  ageAvgLevel: number | null;
}

export interface AgeNorm {
  group: string;
  n: number;
  mean: number;
  sd: number;
  lo: number;
  hi: number;
}

export interface TotalItem {
  key: 'forehead_glabella' | 'perocular' | 'cheek' | 'moisture';
  label: string;
  z: number;
}

export interface RegionBox {
  part: string;
  label: string;
  /** 업로드한 이미지 좌표의 x1, y1, x2, y2 */
  box: [number, number, number, number];
}

export interface SkinScanResult {
  width: number;
  height: number;
  boxes: RegionBox[];
  /** 얼굴 윤곽(랜드마크 최소·최대) x1, y1, x2, y2 — 결과 사진을 얼굴만 잘라 보여줄 때 쓴다 */
  face?: [number, number, number, number];
  ageGroup: string | null;
  /** 피부 장벽 총점 50~100 — 연령대 기준 z-score 합성 (serve_skin.py total_score) */
  totalScore: number;
  totalBand: Band;
  totalBandLabel: string;
  /** 같은 연령대(나이를 모르면 전체) 기준 피험자 중 상위 몇 % (1~99) */
  totalTopPct?: number;
  /** 총점에 들어간 항목별 연령대 기준 z — 양수면 또래 평균보다 좋다 */
  totalItems?: TotalItem[];
  metrics: MetricResult[];
}

/**
 * 총점이 같은 연령대(없으면 전체) 기준 피험자 중 상위 몇 %인지 (1~99) — 서버 total_top_pct와 같은 식.
 * 경과 관찰 기록처럼 서버 응답(totalTopPct)이 없을 때 쓴다.
 */
export function totalTopPct(score: number, ageGroup: string | null | undefined): number {
  const ref: number[] = (REF_TOTAL_SCORES as Record<string, number[]>)[ageGroup ?? '전체'] ?? REF_TOTAL_SCORES['전체'];
  const s = Math.round(score);
  const above = ref.filter((v) => v > s).length;
  const tie = ref.filter((v) => v === s).length;
  return Math.min(Math.max(Math.round(((above + tie / 2) / ref.length) * 100), 1), 99);
}

/** 항상 "상위 N%"로 쓴다 (낮은 점수도 "상위 90%"처럼) */
export const topPctText = (p: number) => `상위 ${p}%`;

const TIMEOUT_MS = 60_000;

export async function analyzeSkin(uri: string, age?: number): Promise<SkinScanResult> {
  if (!SKIN_API_URL) {
    throw new Error('분석 서버 주소가 없어요 — .env에 EXPO_PUBLIC_SKIN_API_URL을 넣어주세요');
  }
  /*
    업로드는 네이티브(uploadAsync)로 한다. RN fetch에 FormData {uri}를 실어 보내는 방식은 Expo Go에서
    파일을 못 읽고 "Network request failed"로 끝나 요청이 서버에 닿지도 않았다.
  */
  let res: { status: number; body: string };
  try {
    res = await withTimeout(
      Platform.OS === 'web' ? uploadWeb(uri, age) : FileSystem.uploadAsync(`${SKIN_API_URL}/analyze`, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'image',
        mimeType: 'image/jpeg',
        parameters: age != null ? { age: String(age) } : undefined,
      }),
      TIMEOUT_MS,
    );
  } catch (e: any) {
    // 원인을 화면에 그대로 남긴다 — "연결 못 함"만으로는 주소·네트워크·업로드 중 무엇이 문제인지 모른다
    throw new Error(`분석 서버에 연결하지 못했어요\n${SKIN_API_URL}\n(${e?.message ?? e})`);
  }
  let body: any = null;
  try {
    body = JSON.parse(res.body);
  } catch {}
  if (res.status < 200 || res.status >= 300) {
    throw new Error(body?.detail || `분석에 실패했어요 (HTTP ${res.status})`);
  }
  return body as SkinScanResult;
}

/** 웹에는 uploadAsync가 없다 — 사진 uri(blob:/data:)를 Blob으로 읽어 FormData로 보낸다 */
async function uploadWeb(uri: string, age?: number): Promise<{ status: number; body: string }> {
  const blob = await (await fetch(uri)).blob();
  const form = new FormData();
  form.append('image', blob, 'photo.jpg');
  if (age != null) form.append('age', String(age));
  const r = await fetch(`${SKIN_API_URL}/analyze`, { method: 'POST', body: form });
  return { status: r.status, body: await r.text() };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('분석 서버가 응답하지 않아요')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
