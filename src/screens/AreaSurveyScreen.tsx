import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monitoringColors as mc, monitoringCard } from '../folders/theme';
import { areaOptions, EASI_GROUP_LABEL } from '../folders/easi';
import type { CoarseGroupId } from '../monitoring/bodyParts';

/**
 * 면적 설문 — 신규 증상 기록에서 반복 촬영(5장)과 분석이 끝난 뒤, 결과 화면 앞에 한 번 나온다.
 *
 * 사진은 부위의 일부만 찍히므로 면적은 사진으로 재지 않는다. 모델이 찾은 병변 영역을 보여 주며
 * "손바닥(손가락 포함) 몇 개 크기인지" 묻고, 그 답을 시스템 내부의 면적 점수(0~6)로 바꿔
 * 부위 점수 계산에 쓴다. **면적 점수 자체는 화면에 내지 않는다** — 사용자는 개수만 고른다.
 */
export default function AreaSurveyScreen({
  group,
  photoUri,
  overlayUri,
  onSubmit,
}: {
  group: CoarseGroupId;
  photoUri: string;
  /** 모델이 찾은 병변 영역을 칠한 사진 — 없으면(못 찾았거나 정상 피부) 원본을 보여 준다 */
  overlayUri?: string | null;
  onSubmit: (areaScore: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<number | null>(null);
  const options = areaOptions(group);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>{EASI_GROUP_LABEL[group]} · 면적 확인</Text>
        <Text style={styles.title}>병변은 손바닥 몇 개 크기인가요?</Text>
        <Text style={styles.sub}>표시된 병변을 손바닥(손가락 포함) 크기로 가늠해 골라 주세요. 모니터링을 시작할 때 한 번만 물어요.</Text>

        <View style={styles.photoWrap}>
          <Image source={{ uri: overlayUri || photoUri }} style={styles.photo} resizeMode="contain" />
        </View>

        {options.map((o) => {
          const on = picked === o.score;
          return (
            <Pressable key={o.score} onPress={() => setPicked(o.score)} style={[styles.option, on && styles.optionOn]}>
              <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          disabled={picked == null}
          onPress={() => picked != null && onSubmit(picked)}
          style={[styles.btn, picked == null && styles.btnOff]}
        >
          <Text style={styles.btnText}>결과 보기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mc.bg },
  body: { padding: 20, paddingBottom: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: mc.greenMuted },
  title: { fontSize: 20, fontWeight: '800', color: mc.ink, marginTop: 6 },
  sub: { fontSize: 12.5, color: mc.sub, lineHeight: 19, marginTop: 8 },
  photoWrap: { ...monitoringCard(16), marginTop: 16, marginBottom: 14, padding: 8, alignItems: 'center' },
  photo: { width: '100%', height: 230, borderRadius: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: mc.card,
    borderWidth: 1, borderColor: '#E7E9EC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
  },
  optionOn: { backgroundColor: '#E3F2CF', borderColor: mc.greenTop },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#9AA0A8', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: mc.greenDeep },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: mc.greenDeep },
  optionText: { fontSize: 14, fontWeight: '600', color: mc.ink },
  optionTextOn: { color: mc.greenDeep, fontWeight: '800' },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: mc.bg },
  btn: { backgroundColor: mc.greenTop, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnOff: { opacity: 0.4 },
  btnText: { fontSize: 15, fontWeight: '800', color: '#16320A' },
});
