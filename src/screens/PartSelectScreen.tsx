import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors } from '../theme';
import Body2DView, { BodyPoint2D } from '../components/Body2DView';
import {
  BodySpot,
  COARSE_OF_SIDED,
  SIDE_OF_SIDED,
  SIDED_GROUPS,
  SIDED_LABELS,
  SIDED_SPOTS,
  SidedGroupId,
  sidedGroupOf,
} from '../monitoring/bodyParts';

/**
 * 부위 선택 — 머리 · 몸통 · 오른쪽/왼쪽 팔 · 오른쪽/왼쪽 다리 중 하나만 고른다.
 *
 * 예전에는 여기서 큰 덩어리를 고른 뒤 다음 화면에서 다시 세부 면(상완 앞 / 팔오금 / 손등 …)까지
 * 골라야 했는데, 매번 찍을 때마다 거치는 단계치고 너무 잘게 나뉘어 있었다. 지금은 몸 그림을
 * 탭하거나 아래 칩을 눌러 한 번만 고르면 끝난다. 팔·다리는 좌우를 고른다 — 경과 관찰이 몸 그림 위에
 * 지켜보는 자리를 찍어 보여주므로, 어느 쪽인지 알아야 그 쪽에 찍을 수 있다. 그림은 앞에서 본
 * 모습이라 그림의 왼쪽이 사용자의 오른쪽이다(그림 아래에 오른쪽/왼쪽을 적어 둔다).
 */
export default function PartSelectScreen({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: (spot: BodySpot) => void;
}) {
  const [group, setGroup] = useState<SidedGroupId | null>(null);
  const [marker, setMarker] = useState<BodyPoint2D | null>(null);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="chevron-left" size={24} color={AppColors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>부위 선택</Text>
      </View>

      <View style={styles.viewer}>
        <Body2DView
          highlightGroup={group ? COARSE_OF_SIDED[group] : null}
          highlightSide={group ? SIDE_OF_SIDED[group] : null}
          showSideLabels
          marker={marker}
          onPick={(pickedGroup, point, side) => {
            setGroup(sidedGroupOf(pickedGroup, side));
            setMarker(point);
          }}
        />
      </View>

      {/* 정면 그림만으로는 짚기 어려운 부위(등·엉덩이 등)를 위해 같은 선택지를 버튼으로도 둔다.
          2열 격자로 고정한다(머리·몸통 / 오른쪽·왼쪽 팔 / 오른쪽·왼쪽 다리) — flexWrap에 맡기면 화면 너비에
          따라 줄이 들쭉날쭉해지고 칸 너비도 글자 수에 따라 달라진다. 서로 대등한 선택지라 같은 크기여야 한다. */}
      <View style={styles.chipGrid}>
        {[SIDED_GROUPS.slice(0, 2), SIDED_GROUPS.slice(2, 4), SIDED_GROUPS.slice(4)].map((row, i) => (
          <View key={i} style={styles.chipRow}>
            {row.map((g) => {
              const selected = group === g;
              return (
                <Pressable
                  key={g}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => {
                    setGroup(g);
                    setMarker(null);
                  }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {SIDED_LABELS[g]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.selectionText}>
          {group ? SIDED_LABELS[group] : '부위를 선택해주세요'}
        </Text>
        <View style={{ height: 12 }} />
        <Pressable
          style={[styles.nextBtn, !group && styles.nextBtnDisabled]}
          disabled={!group}
          onPress={() => group && onNext(SIDED_SPOTS[group])}
        >
          <Text style={[styles.nextBtnText, !group && styles.nextBtnTextDisabled]}>이 부위로 선택</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: AppColors.ink, marginRight: 38 },
  viewer: { flex: 1, minHeight: 280 },

  chipGrid: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  /** flex: 1 — 한 줄의 두 칸이 항상 화면을 반씩 나눠 갖는다 (글자 수와 무관하게 같은 크기) */
  chip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E7E9EC',
    backgroundColor: '#F7F8FA',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: AppColors.greenTop, backgroundColor: AppColors.greenTop },
  chipText: { fontSize: 15, fontWeight: '700', color: AppColors.ink },
  chipTextSelected: { color: '#16320A' },

  footer: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12 },
  selectionText: { textAlign: 'center', fontSize: 15, fontWeight: '700', color: AppColors.ink },
  nextBtn: { backgroundColor: AppColors.greenTop, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#E7E9EC' },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#16320A' },
  nextBtnTextDisabled: { color: AppColors.sub },
});
