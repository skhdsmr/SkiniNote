// Expo Go용 react-native-fast-tflite 스텁.
//
// 원본 앱(app_re)은 react-native-nitro-modules 위에서 도는 네이티브 TFLite로 기기에서 직접
// 추론한다. Expo Go에는 그 네이티브 모듈이 들어 있지 않아서, 그대로 번들하면 앱이 열리자마자
// 죽는다. 그래서 metro.config.js가 모든 플랫폼에서 이 파일로 바꿔 끼운다.
//
// 같은 모양(loadTensorflowModel -> { run() })을 내되 쓰는 순간 거절한다. 촬영 탭은
// DUMP_RESULTS(src/exam/dumpAnalysis.ts)가 켜져 있어 모델을 부르지 않고, 얼굴·자세 검출처럼
// 그래도 부르는 곳은 실패하면 그 기능만 조용히 끄도록 되어 있다 (src/ai/modelLoader.ts).
export function loadTensorflowModel() {
  return Promise.reject(
    new Error('TFLite 모델 추론은 Expo Go에서 지원되지 않습니다 (개발 빌드 전용 기능).')
  );
}
