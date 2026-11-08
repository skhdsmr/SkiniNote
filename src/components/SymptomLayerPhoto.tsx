import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { monitoringColors as mc, monitoringCard } from '../folders/theme';
import { SYMPTOM_KEYS, SYMPTOM_LAYERS, symptomLevel, type SymptomKey } from '../symptoms/groups';

/**
 * 촬영 사진 카드 — 왼쪽 원본, 오른쪽 증상 부위 표시 + 아래 증상 레이어 칩.
 *
 * 칩(홍반 · 구진 · 찰상 · 태선화)을 누르면 그 증상의 검출 영역을 오른쪽 사진에서 켜고 끈다.
 * "AI가 여기를 이렇게 봤어요"를 직접 확인하게 하려는 것이라, 끈 증상은 사진에서도 사라진다.
 *
 * 증상별 마스크(layers)는 모델이 증상마다 따로 내줄 때 채워진다 — 투명 PNG 한 장씩을 켜진 것만
 * 원본 위에 겹쳐 그린다. 아직 하나의 합성 오버레이(overlay)밖에 없으면 증상을 구분할 수 없어서
 * 칩이 모두 꺼졌을 때만 원본을 보여주고, 그 사실을 칩 아래에 한 줄로 알린다(지어낸 구분을 그리지 않는다).
 *
 * 단계가 "없음"인 증상은 칩이 꺼진 채 눌리지 않는다 — 검출된 것이 없는 레이어는 켤 이유가 없다.
 */
export default function SymptomLayerPhoto({
  photo,
  overlay,
  layers,
  values,
  size,
  onZoom,
  title,
}: {
  photo: ImageSourcePropType | null | undefined;
  /** 분석이 합성해 둔 병변 오버레이(원본 + 칠한 영역) — 없으면 증상 부위를 못 찾은 것 */
  overlay?: ImageSourcePropType | null;
  /** 증상별 투명 마스크 — 모델이 증상을 따로 내줄 때만 있다 */
  layers?: Partial<Record<SymptomKey, ImageSourcePropType>> | null;
  /** 기록의 세부 증상 값(0~10 스케일) — 어떤 칩을 켤 수 있는지 정한다 */
  values: Partial<Record<SymptomKey, number>>;
  size: number;
  /** 사진을 탭하면 크게 보기 — 0 원본, 1 증상 부위 표시 */
  onZoom?: (page: 0 | 1) => void;
  /** 카드 맨 위 제목 (예: "2026.11.1 촬영") */
  title?: string;
}) {
  const present = SYMPTOM_KEYS.filter((k) => symptomLevel(values, k) > 0);
  const hasLayers = !!layers && Object.keys(layers).length > 0;
  const canShow = hasLayers || !!overlay;
  const [on, setOn] = useState<Record<SymptomKey, boolean>>(() => ({
    redness: true, bumps: true, scratch: true, thickening: true,
  }));
  const active = (k: SymptomKey) => canShow && present.includes(k) && on[k];
  const anyActive = SYMPTOM_KEYS.some(active);

  const frame = { width: size, height: size };

  return (
    <View style={[monitoringCard(), styles.card]}>
      {title != null && <Text style={styles.title}>{title}</Text>}
      <View style={styles.photoRow}>
        <Pressable style={styles.photoCol} onPress={() => onZoom?.(0)} disabled={!onZoom}>
          <View style={[styles.frame, frame]}>
            {photo && <Image source={photo} style={styles.fill} resizeMode="cover" />}
          </View>
          <Text style={styles.caption}>촬영 이미지 (원본)</Text>
        </Pressable>
        <Pressable style={styles.photoCol} onPress={() => onZoom?.(1)} disabled={!onZoom}>
          <View style={[styles.frame, frame]}>
            {hasLayers ? (
              <>
                {photo && <Image source={photo} style={styles.fill} resizeMode="cover" />}
                {SYMPTOM_KEYS.filter(active).map((k) =>
                  layers![k] ? <Image key={k} source={layers![k]!} style={styles.fill} resizeMode="cover" /> : null,
                )}
              </>
            ) : (
              <Image
                source={(anyActive && overlay) || photo || undefined}
                style={styles.fill}
                resizeMode="cover"
              />
            )}
          </View>
          <Text style={styles.caption}>{canShow ? '증상 부위 표시' : '증상 부위를 찾지 못했어요'}</Text>
        </Pressable>
      </View>

      <View style={styles.layerHead}>
        <Text style={styles.layerTitle}>증상 레이어</Text>
        <Text style={styles.layerHint}>눌러서 켜고 끄기</Text>
      </View>
      <View style={styles.chipRow}>
        {SYMPTOM_KEYS.map((k) => {
          const { label, color } = SYMPTOM_LAYERS[k];
          const enabled = canShow && present.includes(k);
          const lit = active(k);
          return (
            <Pressable
              key={k}
              disabled={!enabled}
              onPress={() => setOn((s) => ({ ...s, [k]: !s[k] }))}
              style={[
                styles.chip,
                lit ? { backgroundColor: color, borderColor: color } : styles.chipOff,
                !enabled && styles.chipDisabled,
              ]}
            >
              <Text style={[styles.chipText, lit && { color: '#FFFFFF' }]}>
                {label}
                {!enabled ? ' 없음' : lit ? '' : ' 끔'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {canShow && !hasLayers && (
        <Text style={styles.note}>증상별 구분 표시는 준비 중이에요 — 지금은 전체 영역만 켜고 꺼져요</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12 },
  title: { fontSize: 14, fontWeight: '800', color: mc.ink, marginBottom: 10, paddingHorizontal: 2 },
  photoRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  photoCol: { alignItems: 'center' },
  frame: { borderRadius: 10, overflow: 'hidden', backgroundColor: mc.bg },
  fill: { position: 'absolute', width: '100%', height: '100%' },
  caption: { fontSize: 10.5, color: mc.sub, marginTop: 6, textAlign: 'center' },

  layerHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 2 },
  layerTitle: { fontSize: 12.5, fontWeight: '800', color: mc.ink },
  layerHint: { fontSize: 10.5, color: mc.sub },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  chipOff: { backgroundColor: '#FFFFFF', borderColor: '#DADDE2' },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 12.5, fontWeight: '800', color: mc.sub },
  note: { fontSize: 10.5, color: mc.sub, marginTop: 8, paddingHorizontal: 2 },
});
