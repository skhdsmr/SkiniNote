import type { TensorflowModel } from 'react-native-fast-tflite';
import { SKIN_API_URL } from '../skinScan/api';

/**
 * TFLite 모델을 서버에서 돌리는 TensorflowModel (질환 분석 3개 + 촬영 중 자 검출 3개).
 *
 * Expo Go에는 TFLite 네이티브 모듈이 없어서 기기에서 모델을 못 돌린다. 그래서 `run()`만 서버
 * (피부상태_파이프라인/serve_skin.py의 /tflite/{name})로 보낸다 — 서버는 **이 앱에 들어 있는 것과
 * 같은 .tflite 파일**을 실행한다. 전처리(Skia로 자르고 정규화)와 후처리(softmax·마스크·등급)는
 * 앱 코드 그대로라, 기기에서 돌린 것과 같은 결과가 나온다.
 *
 * 입력은 float32 raw bytes로 보내고(512²×3이면 약 3MB), 출력은 모델 출력 순서 그대로 base64로 받는다.
 *
 * 촬영 중 자 검출 모델(얼굴·몸통)도 서버로 보낸다. 판정 루프는 한 프레임이 끝나야 다음 프레임을
 * 찍으므로(busy 플래그) 서버 왕복이 겹쳐 쌓이지 않고, 틱이 그만큼 느려질 뿐이다. 대신 입력을
 * uint8 픽셀로 되돌려 보내 크기를 1/4로 줄인다 — 이 모델들의 입력은 p/127.5−1 또는 p/255라
 * 되돌려도 값이 한 비트도 달라지지 않는다 (서버가 같은 식으로 다시 정규화한다).
 */
export const REMOTE_MODELS: ReadonlySet<string> = new Set([
  'disease_cls_512',
  'seg_lesion_512',
  'sev_cls_384',
  'face_det_128',
  'pose_det_224',
  'pose_landmark_256',
]);

/** uint8로 보낼 모델과 그 정규화 (serve_skin.py의 U8_NORM과 짝) */
const U8_NORM: Readonly<Record<string, 'pm1' | 'unit'>> = {
  face_det_128: 'pm1',
  pose_det_224: 'pm1',
  pose_landmark_256: 'unit',
};

/** 질환 분석은 한 번에 수 MB라 넉넉히, 촬영 중 검출은 짧게 — 걸린 채로 판정 루프를 붙잡지 않도록 */
const TIMEOUT_MS = 60_000;
const LIVE_TIMEOUT_MS = 8_000;

function toU8(input: ArrayBuffer, norm: 'pm1' | 'unit'): ArrayBuffer {
  const f = new Float32Array(input);
  const out = new Uint8Array(f.length);
  if (norm === 'pm1') for (let i = 0; i < f.length; i++) out[i] = Math.round((f[i] + 1) * 127.5);
  else for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * 255);
  return out.buffer;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** base64 → ArrayBuffer (출력 마스크가 1MB라 문자열을 거치지 않고 바로 바이트로 푼다) */
function decodeBase64(s: string): ArrayBuffer {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n =
      (B64_INDEX[s.charCodeAt(i)] << 18) |
      (B64_INDEX[s.charCodeAt(i + 1)] << 12) |
      (B64_INDEX[s.charCodeAt(i + 2)] << 6) |
      B64_INDEX[s.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out.buffer;
}

export function remoteModel(name: string): TensorflowModel {
  const run = async (inputs: ArrayBuffer[]): Promise<ArrayBuffer[]> => {
    if (!SKIN_API_URL) {
      throw new Error('분석 서버 주소가 없어요 — .env에 EXPO_PUBLIC_SKIN_API_URL을 넣어주세요');
    }
    const norm = U8_NORM[name];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), norm ? LIVE_TIMEOUT_MS : TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${SKIN_API_URL}/tflite/${name}${norm ? `?u8=${norm}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: (norm ? toU8(inputs[0], norm) : inputs[0]) as any,
        signal: ctrl.signal,
      });
    } catch (e: any) {
      throw new Error(`분석 서버에 연결하지 못했어요 (${name})\n${SKIN_API_URL}\n(${e?.message ?? e})`);
    } finally {
      clearTimeout(timer);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.outputs) {
      throw new Error(body?.detail || `모델 실행에 실패했어요 (${name}, HTTP ${res.status})`);
    }
    return (body.outputs as string[]).map(decodeBase64);
  };
  return {
    run,
    runSync: () => {
      throw new Error('서버 모델은 동기 실행을 지원하지 않아요');
    },
    inputs: [],
    outputs: [],
  };
}
