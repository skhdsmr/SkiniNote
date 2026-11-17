import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors } from '../theme';
import Body2DView, { tightProjector } from '../components/Body2DView';
import { edgePoint } from '../components/bodyShape';
import { CoarseGroupId } from '../monitoring/bodyParts';

/** 덩어리 하나의 지금 상태 — 이름표 · 색 칠하기 · 상세 카드가 같은 값을 쓴다 */
export interface GroupStatus {
  /** level = 4단계 중 하나 · nograde = 기록은 있으나 등급 없음 · none = 기록 없음 */
  state: 'level' | 'nograde' | 'none';
  /** 칠할 색 (none이면 없음) */
  color?: string;
  /** 이름표에 적을 상태 ("주의", "기록 없음") — 등급 없는 질환은 비워 두고 질환 이름만 적는다 */
  statusText: string;
  /** 이름표에 적을 질환 이름 ("아토피", "건선", 얼굴 피부 장벽이면 "장벽") */
  disease?: string;
  /** 이름표 테두리·선 색을 칠하기 색과 다르게 둘 때 (피부 장벽 = 보라) */
  tagColor?: string;
}

/** 이름표에 쓰는 부위 이름 */
export const GROUP_NAMES: Record<CoarseGroupId, string> = { head: '얼굴', torso: '몸통', arm: '팔', leg: '다리' };

/**
 * 이름표 자리 — 얼굴·몸통은 오른쪽, 팔·다리는 왼쪽. 선은 그 조각 가장자리(edgePoint)에서 나간다.
 * 팔·다리는 그림 왼쪽 조각(0번)에 잇는다.
 */
type TagPlace = { group: CoarseGroupId; side: 'left' | 'right'; poly: number; yFrac: number };
const TAGS: TagPlace[] = [
  { group: 'head', side: 'right', poly: 0, yFrac: 0.5 },
  { group: 'torso', side: 'right', poly: 0, yFrac: 0.45 },
  { group: 'arm', side: 'left', poly: 0, yFrac: 0.28 },
  { group: 'leg', side: 'left', poly: 0, yFrac: 0.35 },
];
const TAG_H = 26;

/**
 * 한 덩어리에 이름표를 하나 더 달 때 (얼굴: 아토피는 오른쪽, 피부 장벽은 왼쪽).
 * 칠하는 색·부위 누르기는 덩어리 기본 이름표(status)를 따르고, 이 이름표는 눌렀을 때 동작만 따로 가진다.
 */
export interface ExtraTag extends TagPlace {
  key: string;
  status: GroupStatus;
  onPress: () => void;
}
const NONE_COLOR = '#C9CDD3';

/** 밝은 단계 색(노랑 등)을 글자로 쓸 때 읽히도록 어둡게 */
function darken(hex: string, amount = 0.35): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - amount)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 전신 지도 + 부위 이름표. 부위(그림)나 이름표를 누르면 그 덩어리를 고른다(다시 누르면 해제).
 * 고른 덩어리는 그림에 진한 테두리, 이름표는 검정으로 채운다. 기록 없는 덩어리는 고를 수 없다.
 */
export default function LabeledBodyMap({
  status,
  extraTags = [],
  selected,
  onSelect,
}: {
  status: Record<CoarseGroupId, GroupStatus>;
  extraTags?: ExtraTag[];
  selected: CoarseGroupId | null;
  onSelect: (g: CoarseGroupId | null) => void;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const project = size.w > 0 ? tightProjector(size.w, size.h) : null;

  const fills: Partial<Record<CoarseGroupId, string>> = {};
  (Object.keys(status) as CoarseGroupId[]).forEach((g) => {
    if (status[g].color) fills[g] = status[g].color!;
  });

  const toggle = (g: CoarseGroupId) => {
    if (status[g].state === 'none') return;
    onSelect(selected === g ? null : g);
  };

  // 기본 이름표(덩어리마다 하나) + 추가 이름표 — 선·이름표를 같은 목록으로 그린다
  const allTags = [
    ...TAGS.map((t) => ({ ...t, key: t.group, st: status[t.group], on: selected === t.group, press: () => toggle(t.group) })),
    ...extraTags.map((t) => ({ ...t, st: t.status, on: false, press: t.onPress })),
  ];

  return (
    <View style={styles.wrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* 1) 이름표 선 — 그림 아래에 깔아서, 몸통 선이 팔 조각 뒤로 지나가게 한다 */}
      {project && (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          {allTags.map((t) => {
            const p = project(edgePoint(t.group, t.poly, t.yFrac, t.side));
            const { st, on } = t;
            return (
              <Line
                key={t.key}
                x1={p.x}
                y1={p.y}
                x2={t.side === 'right' ? size.w - 20 : 20}
                y2={p.y}
                stroke={on ? AppColors.ink : st.tagColor ?? st.color ?? NONE_COLOR}
                strokeWidth={1.2}
                strokeDasharray={st.state === 'none' ? '3,3' : undefined}
              />
            );
          })}
        </Svg>
      )}

      {/* 2) 몸 그림 */}
      <Body2DView partFills={fills} selectedGroup={selected} onPick={(g) => toggle(g)} />

      {/* 3) 이름표 */}
      {project &&
        allTags.map((t) => {
          const p = project(edgePoint(t.group, t.poly, t.yFrac, t.side));
          const { st, on } = t;
          const none = st.state === 'none';
          const tone = st.tagColor ?? st.color ?? NONE_COLOR;
          return (
            <Pressable
              key={t.key}
              onPress={t.press}
              disabled={none}
              hitSlop={4}
              style={[
                styles.tag,
                t.side === 'right' ? { right: 0 } : { left: 0 },
                { top: p.y - TAG_H / 2, borderColor: on ? AppColors.ink : tone },
                none && styles.tagNone,
                on && styles.tagOn,
              ]}
            >
              <Text style={[styles.tagName, none && styles.tagNoneText, on && styles.tagOnText]}>{GROUP_NAMES[t.group]}</Text>
              {/* 부위 | 질환 | 단계 — 세로 구분선으로 나눠서 "몸통 아토피"가 한 단어처럼 읽히지 않게 */}
              {!none && st.disease && (
                <>
                  <View style={[styles.tagSep, on && styles.tagSepOn]} />
                  <Text style={[styles.tagDisease, on && styles.tagOnText]}>{st.disease}</Text>
                </>
              )}
              {st.statusText !== '' && <View style={[styles.tagSep, on && styles.tagSepOn]} />}
              {st.statusText !== '' && (
                <Text
                  style={[
                    styles.tagStatus,
                    { color: none ? '#B5BAC1' : st.state === 'nograde' ? AppColors.sub : darken(tone) },
                    on && styles.tagOnText,
                  ]}
                >
                  {st.statusText}
                </Text>
              )}
              {/* 누르면 넘어간다는 신호 — 이름표 색의 화살표 */}
              {!none && (
                <MaterialIcons
                  name="chevron-right"
                  size={17}
                  color={on ? '#FFFFFF' : darken(tone, 0.2)}
                  style={styles.tagGo}
                />
              )}
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 120 },
  tag: {
    position: 'absolute',
    height: TAG_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: TAG_H / 2,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  tagNone: { borderStyle: 'dashed', borderColor: NONE_COLOR },
  tagOn: { backgroundColor: AppColors.ink, borderColor: AppColors.ink },
  // 부위 이름이 가장 먼저 읽히도록 — 질환·단계보다 크고 굵게
  tagName: { fontSize: 13.5, fontWeight: '900', color: AppColors.ink },
  tagStatus: { fontSize: 11, fontWeight: '700' },
  tagDisease: { fontSize: 11, fontWeight: '600', color: '#5F6670' },
  tagSep: { width: 1, height: 11, backgroundColor: '#D3D7DD', marginHorizontal: 1 },
  tagSepOn: { backgroundColor: 'rgba(255,255,255,0.4)' },
  tagGo: { marginLeft: -1, marginRight: -5 },
  tagNoneText: { color: '#B5BAC1' },
  tagOnText: { color: '#FFFFFF' },
});
