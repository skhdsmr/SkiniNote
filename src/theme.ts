import { Platform, ViewStyle } from 'react-native';

/** 디자인 토큰 — 원본 Flutter 디자인의 색상을 그대로 옮긴 값 */
export const AppColors = {
  bg: '#EDF0F4',
  card: '#FFFFFF',
  greenBody: '#A8E06C',
  greenTop: '#93D258',
  greenDeep: '#2E4A14',
  greenMuted: '#4C6B2C',
  ink: '#1C1C1E',
  sub: '#8E8E93',
  line: '#ECECEF',

  // 중증도 색상
  sev1: '#5FC36A', // 경증
  sev2: '#F2B33C', // 중등증
  sev3: '#EB5757', // 중증

  // 4단계 지표(피부 질환·가려움 안정도·수면 점수·세부 증상)의 "좋음/없음"·"주의/미미함" 색.
  // sev1~3과 별개 축이라 새로 둔다 — 저 셋은 이미 다른 화면(진단 확신도 등)에서 다른 의미로 쓴다.
  // 4단계 색은 전신 상태 디자인 시안의 파스텔 톤 — 좋음(파랑) · 주의(노랑) · 나쁨(주황, folders/theme의
  // warn) · 매우 나쁨(sevSevere). sev3은 오류 문구 등 다른 곳에서도 쓰는 빨강이라 4단계용을 따로 둔다.
  sev0: '#BFD3F6',
  sevCaution: '#F7D35C',
  sevSevere: '#EE7B7E',

  navInactive: '#B6BAC1',
} as const;

/**
 * 배경색 위에 올릴 글자색 — 밝은 배경(파스텔 4단계 색 등)이면 잉크색, 어두우면 흰색.
 * 4단계 색이 파스텔로 바뀌면서 흰 글자가 안 읽히게 돼서, 배지들이 배경색을 보고 고른다.
 */
export function textOnColor(bg: string): string {
  const m = /^#?([0-9a-f]{6})/i.exec(bg ?? '');
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const brightness = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return brightness > 0.55 ? AppColors.ink : '#FFFFFF';
}

/**
 * 흰 카드 공통 그림자/데코레이션.
 * Flutter의 BoxShadow(color: 0x0F1E283C, blur: 18, offset: (0,4)) 대응.
 * iOS는 shadow*, Android는 elevation 사용.
 */
export function cardDecoration(radius = 20): ViewStyle {
  return {
    backgroundColor: AppColors.card,
    borderRadius: radius,
    ...Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#1E283C',
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  };
}
