# 피부 케어 — Expo Go 버전

`app_re`의 UI를 **아이폰 Expo Go로 바로 열 수 있게** 만든 사본입니다.
화면·흐름은 원본과 같고, 분석 결과만 예시 값(dump 모드)으로 나옵니다.

## 원본(app_re)과 다른 점

| | app_re (원본) | app_expogo (이 폴더) |
|---|---|---|
| 실행 방법 | 개발 빌드 / APK 설치 | Expo Go (빌드 없음) |
| Expo SDK | 54 | 58 — App Store의 Expo Go가 최신 SDK만 열기 때문 |
| TFLite 추론 | 기기에서 실행 | 실행 안 함 — `stubs/react-native-fast-tflite.js`로 대체 |
| 분석 결과 | 모델 출력 | 예시 값 (`src/exam/dumpAnalysis.ts`의 `DUMP_RESULTS = true`) |
| 빠진 패키지 | — | `react-native-fast-tflite`, `react-native-nitro-modules`, `expo-dev-client` |

- 결과 화면에는 "화면 확인용 예시 값이에요" 안내가 표시됩니다.
- 얼굴·자세 검출(촬영 가이드의 자 / 전신 정렬)은 모델이 없어 조용히 꺼지고, 나머지 촬영 흐름은 그대로 동작합니다.

## 실행 방법

SDK 58은 Node 22 이상이 필요합니다. 서버의 기본 node는 20이라 `/home/work/MINJI/.node22`에 설치해 두었습니다
(홈 디렉터리 `~`는 컨테이너를 다시 켜면 지워지므로 MINJI 아래에 둡니다).

```bash
export PATH=/home/work/MINJI/.node22/bin:$PATH
cd ~/MINJI/app_expogo
npm install          # 처음 한 번 (node_modules가 이미 있으면 생략)
npx expo start --tunnel
```

1. 아이폰 App Store에서 **Expo Go**를 설치합니다.
2. 터미널에 뜬 QR 코드를 아이폰 **기본 카메라 앱**으로 찍으면 Expo Go로 열립니다.

`--tunnel`은 서버와 아이폰이 같은 Wi-Fi에 있지 않아도 연결되게 합니다. 같은 네트워크라면
`npx expo start`만으로도 됩니다.

## 원본 변경 사항을 가져올 때

`app_re/src`를 덮어쓴 뒤 아래 두 가지만 다시 확인하면 됩니다.

- `src/exam/dumpAnalysis.ts`의 `DUMP_RESULTS`를 `true`로 둡니다.
- RN 0.88부터 `View`/`ScrollView`가 함수 컴포넌트라 `useRef<View>`가 타입 오류가 납니다 —
  `useRef<React.ComponentRef<typeof View>>`로 씁니다. (`npx tsc --noEmit`으로 확인)
