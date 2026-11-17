import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { AppColors } from '../theme';
import { CoarseGroupId } from '../monitoring/bodyParts';
import { BODY_H, BODY_W, GROUP_CENTERS, HIT_POLYS, REGION_POLYS, pointInPoly, polysToPath } from './bodyShape';

// 정면으로 서 있는 몸 — 디자인 시안 이미지(머리·몸통·좌우 팔·좌우 다리가 서로 떨어진 6조각)를
// 윤곽 추적한 다각형(bodyShape.ts)으로 그린다. 좌표계는 BODY_W×BODY_H(높이 949).
const VIEWBOX_W = BODY_W;
const VIEWBOX_H = BODY_H;
/**
 * 몸 그림 둘레에 두는 viewBox 여백.
 *
 * **react-native-svg는 viewBox 밖을 잘라낸다.** 전신 결과 화면의 넓이 원(최대 반지름 118)이
 * 팔·머리 자리에서 잘리지 않도록, 몸 좌표는 그대로 두고 보는 창만 넓힌다.
 */
const PAD_X = 80;
const PAD_TOP = 40;
/** 동그라미가 없을 때(부위 선택·색 칠하기)의 여백 — 몸 조각 가장자리 안티에일리어싱만 안 잘리게 */
const TIGHT_PAD = 4;
/**
 * 실제로 그리는 창 — 몸 좌표계에 여백을 두른 것이다. 넓은 여백은 동그라미(partMarkers)가 잘리지
 * 않게 하려는 것이라, 동그라미를 안 그리는 화면에서는 여백을 거의 없애 몸 그림을 크게 그린다.
 */
function viewBoxOf(withMarkers: boolean) {
  const px = withMarkers ? PAD_X : TIGHT_PAD;
  const pt = withMarkers ? PAD_TOP : TIGHT_PAD;
  return { x: -px, y: -pt, w: VIEWBOX_W + px * 2, h: VIEWBOX_H + pt + (withMarkers ? 0 : TIGHT_PAD) };
}

/**
 * 동그라미 없는 몸 그림(partFills·부위 선택)을 W×H 칸에 그렸을 때, 몸 좌표 → 칸 안 픽셀 좌표.
 * Body2DView는 칸 가운데에 비율을 지켜 높이(또는 폭)를 꽉 채워 그린다 — 그 배치를 그대로 따라 계산한다.
 * 그림 둘레에 이름표를 얹을 때 쓴다.
 */
export function tightProjector(W: number, H: number) {
  const v = viewBoxOf(false);
  const aspect = v.w / v.h;
  const fw = Math.min(W, H * aspect);
  const fh = fw / aspect;
  const left = (W - fw) / 2;
  const top = (H - fh) / 2;
  return (pt: { x: number; y: number }) => ({
    x: left + ((pt.x - v.x) / v.w) * fw,
    y: top + ((pt.y - v.y) / v.h) * fh,
  });
}

// 어느 부위를 고르든 항상 이 초록 하나로 칠한다 — 앱 다른 곳(선택된 칩 등)과 같은 강조색을 써서
// "부위마다 색이 다르다"는 인상을 주지 않는다.
const HIGHLIGHT_COLOR = AppColors.greenTop;
/** 시안 이미지의 몸 색 */
const BODY_COLOR = '#E2E5EA';
const MARKER_COLOR = AppColors.greenDeep;

/** 덩어리마다 칠할 도형 — 팔·다리는 좌우 두 조각을 한 path에 이어 붙여 항상 같이 물든다 */
const REGION_PATHS: Record<CoarseGroupId, string> = {
  head: polysToPath(REGION_POLYS.head),
  torso: polysToPath(REGION_POLYS.torso),
  arm: polysToPath(REGION_POLYS.arm),
  leg: polysToPath(REGION_POLYS.leg),
};
const GROUP_ORDER: CoarseGroupId[] = ['torso', 'head', 'arm', 'leg'];

/** 덩어리마다 동그라미 표시(partMarkers)를 찍을 자리 — 조각 한가운데 (팔·다리는 좌우 하나씩) */
const GROUP_MARKERS: Record<CoarseGroupId, BodyPoint2D[]> = GROUP_CENTERS;

/**
 * viewBox 좌표(vx, vy) → 네 덩어리 중 하나 (그림 밖 여백이면 null).
 * 먼저 실제 모양 안인지 보고, 아니면 조금 부풀린 탭 영역(HIT_POLYS)으로 너그럽게 판정한다 —
 * 조각 사이 틈을 눌렀을 때는 부풀린 영역이 겹칠 수 있어서 실제 모양을 먼저 본다.
 */
function classifyGroup(vx: number, vy: number): CoarseGroupId | null {
  for (const g of GROUP_ORDER) if (REGION_POLYS[g].some((p) => pointInPoly(vx, vy, p))) return g;
  for (const g of GROUP_ORDER) if (HIT_POLYS[g].some((p) => pointInPoly(vx, vy, p))) return g;
  return null;
}

export interface BodyPoint2D {
  x: number;
  y: number;
}

/** 동그라미 하나의 표시값 — 색은 상태(피부 질환), 반지름은 병변 넓이(%)를 나타낸다 */
export interface PartMarkerStyle {
  color: string;
  /** 불투명 원의 반지름 (몸 좌표 BODY_W×BODY_H). 생략하면 DEFAULT_MARKER_R */
  radius?: number;
  /**
   * 점선 원의 반지름 — **넓이를 잰 회차에만** 넘어온다. 없으면 점선 원을 그리지 않는다.
   *
   * 두 원이 서로 다른 것을 말한다: 불투명 원은 **얼마나 나쁜가**(피부 질환 색), 점선 원은
   * **얼마나 넓은가**(부위 대비 병변 넓이). 둘을 한 원의 색과 크기로 겹쳐 두면 "색이 진해졌는데
   * 작아졌다"처럼 서로 다른 축의 변화가 한 도형 안에서 섞여 읽히지 않는다. 그리고 넓이는 잰
   * 회차에만 있는 값이라, 없을 때 크기를 0으로 두면 "병변이 사라졌다"로 보인다 — 아예 안 그린다.
   */
  areaRadius?: number;
  /**
   * 불투명 원 가운데 흰 숫자로 적을 값 — 아토피피부염이면 그 병변의 세부 증상(피부 붉기·
   * 오돌토돌함·긁은 상처·피부 두꺼워짐) 중 나타난 개수. 넘기지 않으면 숫자를 안 그린다
   * (등급이 없는 질환의 회색 원 등).
   */
  count?: number;
  /** count가 가리키는 숫자를 누르면 말풍선에 적을 증상 이름 목록 — 없으면(빈 배열) "증상 없음"으로 보여준다 */
  symptomLabels?: string[];
}

/** partMarkers에 radius를 안 넘겼을 때(예전 호출부와의 호환)의 고정 크기 */
const DEFAULT_MARKER_R = 42;

/** 병변이 여럿일 때 불투명 원들이 서로 닿지 않도록 두는 여유 (1이면 딱 붙는다) */
const MARKER_GAP = 1.15;

/**
 * 한 자리에 병변이 여럿이면 그 자리 둘레에 고르게 흩는다.
 *
 * 반지름 r인 원 n개를 고리 위에 겹치지 않게 놓으려면 고리 반지름이 최소 r/sin(π/n)이라,
 * 개수가 늘수록 고리가 저절로 커진다 — 개수마다 자리를 손으로 정해 두지 않아도 된다.
 * 첫 병변(가장 넓은 것)을 12시에 두고 시계 방향으로 나머지를 붙인다.
 *
 * 점선 원(넓이)까지 고리에 맞추지는 않는다. 넓이는 원래 몸 윤곽을 넘어도 되는 값이라(위 주석)
 * 겹침을 피하려 들면 오히려 크기가 왜곡된다 — 겹치더라도 크기가 정확한 편이 낫다.
 */
function markerSpot(anchor: BodyPoint2D, i: number, n: number, r: number): BodyPoint2D {
  if (n <= 1) return anchor;
  const ring = (r * MARKER_GAP) / Math.sin(Math.PI / n);
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: anchor.x + ring * Math.cos(angle), y: anchor.y + ring * Math.sin(angle) };
}

/**
 * 부위 선택용 2D 몸 그림 — 네 덩어리를 각자의 도형으로 그리고, 지금 고른 덩어리만 채움색을
 * 초록으로 바꾼다(나머지는 옅은 회색). 그림과 탭 판정이 같은 좌표계·같은 경계를 그대로 공유해서
 * 그림 위 어디를 눌러도 눈에 보이는 그 부위가 정확히 골라진다.
 *
 * partMarkers를 넘기면(전신 결과 화면이 쓴다) 덩어리 전체를 칠하는 대신, GROUP_MARKERS에 미리
 * 정해 둔 자리에 도형을 찍는다 — "이 부위 전체"가 아니라 "이 부위가 지금 어떤 상태인가"의 표시다.
 * **동그라미 하나가 병변 하나**라, 한 자리에서 병변이 여럿 잡혔으면 그 개수만큼 둘레에 흩어 그린다.
 * 병변마다 도형은 둘이고 서로 다른 것을 말한다: **불투명 원은 얼마나 나쁜가(색), 점선 원은 얼마나
 * 넓은가(크기).** 넓이를 잰 회차가 아니면 점선 원은 아예 그리지 않는다.
 * highlightGroup·partMarkers는 같이 써도 되지만 실제로는 화면마다 하나만 쓴다.
 */
export default function Body2DView({
  highlightGroup,
  marker,
  partMarkers,
  partFills,
  selectedGroup,
  onPick,
}: {
  /** 지금 선택된 덩어리 — 좌우를 나누지 않으므로 팔/다리는 양쪽 다 이 색으로 칠한다 */
  highlightGroup?: CoarseGroupId | null;
  /** 마지막으로 탭한 위치(뷰 좌표) — 칩으로 골랐을 때는 부모가 null로 지운다 */
  marker?: BodyPoint2D | null;
  /**
   * 덩어리별 동그라미 목록 — **병변 하나에 하나씩** (전신 결과 화면이 쓴다).
   * 목록이 둘 이상이면 그 덩어리 자리 둘레에 고르게 흩어 그린다(markerSpot).
   */
  partMarkers?: Partial<Record<CoarseGroupId, PartMarkerStyle[]>>;
  /** 덩어리를 통째로 이 색으로 칠한다 — 기록 탭 추이 칸의 전신 지도(피부 질환 점수 색) */
  partFills?: Partial<Record<CoarseGroupId, string>>;
  /** 골라 둔 덩어리 — 진한 테두리로 감싼다 (추이 칸에서 부위를 눌렀을 때) */
  selectedGroup?: CoarseGroupId | null;
  onPick?: (group: CoarseGroupId, point: BodyPoint2D) => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const { x: VIEW_X, y: VIEW_Y, w: VIEW_W, h: VIEW_H } = viewBoxOf(!!partMarkers);
  const wrapRef = useRef<React.ComponentRef<typeof View>>(null);
  // 화면 절대좌표(pageX/Y) 기준 그림의 위치·크기 — locationX/Y는 RN Web에서 aspectRatio로
  // 감싼 레이어 때문에 그림 실제 위치와 어긋나는 경우가 있어서, ItchVasSlider와 같은
  // 방식(measureInWindow + pageX/Y)으로 직접 계산한다.
  const geom = useRef({ x: 0, y: 0, width: 0, height: 0 });
  /** 세부 증상 개수가 적힌 동그라미를 눌렀을 때 뜨는 말풍선 — 위치는 figureWrap 기준 픽셀 좌표 */
  const [openBubble, setOpenBubble] = useState<{ x: number; y: number; r: number; labels: string[] } | null>(null);

  useEffect(() => {
    if (!marker) return;
    pulse.setValue(1);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [marker, pulse]);

  // 회차가 바뀌면(슬라이더 등) 열려 있던 말풍선의 증상 목록이 지금 동그라미와 안 맞을 수 있어 닫는다
  useEffect(() => {
    setOpenBubble(null);
  }, [partMarkers]);

  const measureWrap = () => {
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      geom.current = { x, y, width, height };
    });
  };

  /** 렌더링과 탭 판정이 같은 자리 계산을 쓰도록 미리 펼쳐 둔다 */
  const flatMarkers = useMemo(() => {
    const out: { key: string; group: CoarseGroupId; pt: BodyPoint2D; style: PartMarkerStyle }[] = [];
    if (!partMarkers) return out;
    (Object.keys(partMarkers) as CoarseGroupId[]).forEach((group) => {
      const list = partMarkers[group]!;
      GROUP_MARKERS[group].forEach((anchor, ai) => {
        list.forEach((style, i) => {
          const r = style.radius ?? DEFAULT_MARKER_R;
          // 병변이 여럿이면 그 자리 둘레로 흩어 놓는다 (하나면 자리 그대로)
          const pt = markerSpot(anchor, i, list.length, r);
          out.push({ key: `${group}-${ai}-${i}`, group, pt, style });
        });
      });
    });
    return out;
  }, [partMarkers]);

  const onPress = (e: { nativeEvent: { pageX: number; pageY: number } }) => {
    const { x, y, width, height } = geom.current;
    if (width === 0 || height === 0) return;
    const localX = e.nativeEvent.pageX - x;
    const localY = e.nativeEvent.pageY - y;
    // 창에 여백이 생겼으므로 원점(VIEW_X/Y)과 배율(VIEW_W/H)을 함께 반영해야 한다 —
    // 여백을 빼먹으면 탭한 자리가 몸 좌표로 옮겨질 때 통째로 밀린다
    const vx = VIEW_X + (localX / width) * VIEW_W;
    const vy = VIEW_Y + (localY / height) * VIEW_H;

    // 숫자가 적힌 동그라미(세부 증상 개수)를 눌렀으면 말풍선을 열고 부위 선택으로는 넘기지 않는다
    const hit = flatMarkers.find((m) => {
      if (m.style.count == null) return false;
      const r = m.style.radius ?? DEFAULT_MARKER_R;
      const dx = vx - m.pt.x;
      const dy = vy - m.pt.y;
      return dx * dx + dy * dy <= r * r;
    });
    if (hit) {
      const r = hit.style.radius ?? DEFAULT_MARKER_R;
      setOpenBubble({
        x: ((hit.pt.x - VIEW_X) / VIEW_W) * width,
        y: ((hit.pt.y - VIEW_Y) / VIEW_H) * height,
        r: (r / VIEW_W) * width,
        labels: hit.style.symptomLabels ?? [],
      });
      return;
    }
    setOpenBubble(null);

    const group = classifyGroup(vx, vy);
    if (!group || !onPick) return;
    onPick(group, { x: localX, y: localY });
  };

  return (
    <View style={styles.container}>
      <View
        ref={wrapRef}
        style={[styles.figureWrap, { aspectRatio: VIEW_W / VIEW_H }, !partMarkers && { height: '100%' }]}
        onLayout={measureWrap}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
          {/* viewBox 밖은 잘린다(위 PAD_X 주석) — 그래서 몸 좌표 그대로 두고 창만 넓혀 두었다.
              부위별 동그라미(partMarkers)가 몸 윤곽 밖으로 걸쳐도 그 여백 안에서 온전히 그려진다. */}
          <Svg width="100%" height="100%" viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}>
            {/* 1) 바탕: 여섯 조각을 몸 색으로 — 조각 사이는 시안처럼 틈으로 비워 둔다(테두리선 없음) */}
            {GROUP_ORDER.map((g) => (
              <Path key={`base-${g}`} d={REGION_PATHS[g]} fill={BODY_COLOR} />
            ))}
            {/* 2) 고른 덩어리만 초록으로 덮어 칠한다 */}
            {highlightGroup && <Path d={REGION_PATHS[highlightGroup]} fill={HIGHLIGHT_COLOR} />}
            {/* 3) 덩어리별 색 칠하기 (추이 칸 전신 지도) */}
            {partFills &&
              GROUP_ORDER.map((g) =>
                partFills[g] ? <Path key={`fill-${g}`} d={REGION_PATHS[g]} fill={partFills[g]} /> : null,
              )}
            {selectedGroup && (
              <Path
                d={REGION_PATHS[selectedGroup]}
                fill="none"
                stroke={AppColors.ink}
                strokeWidth={6}
                strokeLinejoin="round"
              />
            )}
            {/* 4) 부위별 동그라미 — 테두리 위에 그려서 항상 또렷하게 보인다. count가 있으면
                가운데에 숫자(존재하는 세부 증상 개수)를 함께 적어, 슬라이더로 회차를 넘길 때
                동그라미가 작아지는 것과 숫자가 줄어드는 것을 같이 볼 수 있게 한다. */}
            {flatMarkers.map(({ key, pt, style }) => {
              const r = style.radius ?? DEFAULT_MARKER_R;
              // 이 원은 실제 화면에서 뷰박스 배율만큼 줄어들어 그려지므로(약 1/3) r 대비 비율을
              // 꽤 크게 잡아야 화면에서 읽히는 크기가 나온다 — 예전 0.85배는 실제로 7px 안팎이었다
              const countFontSize = r * 1.7;
              return (
                <React.Fragment key={key}>
                  <Circle cx={pt.x} cy={pt.y} r={r} fill={style.color} stroke="#FFFFFF" strokeWidth={3} />
                  {/*
                    넓이 원은 **불투명 원 위에** 옅게 얹는다. 아래에 깔면 넓이가 작은 회차에서
                    불투명 원에 완전히 가려져 "넓이를 못 쟀다"와 구분되지 않는다 —
                    위에 얹으면 작든 크든 점선 테두리가 항상 보인다.
                  */}
                  {style.areaRadius != null && (
                    <Circle
                      cx={pt.x}
                      cy={pt.y}
                      r={style.areaRadius}
                      fill={style.color}
                      fillOpacity={0.22}
                      stroke={style.color}
                      strokeWidth={3}
                      strokeDasharray="8,7"
                    />
                  )}
                  {/* 세부 증상 개수 — 원 가운데 흰 숫자. 탭 판정(hit test)은 위 onPress가 r로 따로 한다 */}
                  {style.count != null && (
                    <SvgText
                      x={pt.x}
                      y={pt.y + countFontSize * 0.36}
                      fontSize={countFontSize}
                      fontWeight="800"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      {style.count}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}
          </Svg>
        </Pressable>

        {marker && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.marker,
              { left: marker.x - 9, top: marker.y - 9, transform: [{ scale: pulse }] },
            ]}
          />
        )}

        {/* 세부 증상 말풍선 — 누른 동그라미 바로 위, 아래 꼬리가 그 동그라미를 가리킨다 */}
        {openBubble && (
          <View
            pointerEvents="box-none"
            style={[
              styles.bubbleAnchor,
              { left: openBubble.x - 88, bottom: geom.current.height - openBubble.y + openBubble.r + 8 },
            ]}
          >
            <View style={styles.bubbleCard}>
              <Pressable onPress={() => setOpenBubble(null)} style={styles.bubbleClose} hitSlop={8}>
                <Text style={styles.bubbleCloseText}>×</Text>
              </Pressable>
              {openBubble.labels.length > 0 ? (
                openBubble.labels.map((label) => (
                  <Text key={label} style={styles.bubbleText}>
                    • {label}
                  </Text>
                ))
              ) : (
                <Text style={styles.bubbleText}>나타난 세부 증상이 없어요</Text>
              )}
            </View>
            <View style={styles.bubbleTail} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 이 그림은 세로로 긴 비율(BODY_W:BODY_H)이라, 예전처럼 "폭의 62%"로 잡으면 화면에 따라
  // 세로가 이 칸보다 훨씬 길어져 아래 칩·버튼과 겹친다. 대신 세로를 이 칸 높이 기준으로 잡고
  // (100%보다 조금 작게 — 그림이 칸에 꽉 차 보이지 않도록) 가로는 aspectRatio로 따라오게 해서,
  // 어떤 화면에서도 넘치지 않고 딱 들어맞는 쪽(보통 세로)에 맞춰 줄어든다.
  figureWrap: { height: '92%', maxWidth: '100%' },
  marker: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: MARKER_COLOR,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  bubbleAnchor: { position: 'absolute', width: 176, alignItems: 'center' },
  bubbleCard: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bubbleClose: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  bubbleCloseText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 16 },
  bubbleText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700', lineHeight: 20, paddingRight: 16 },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1C1C1E',
    marginTop: -1,
  },
});
