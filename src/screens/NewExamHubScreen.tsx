import React, { useEffect } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, cardDecoration } from '../theme';
import { BARRIER_SERIES, CHART_SERIES } from '../folders/theme';

const BARRIER_ICON = require('../../assets/icon/barrier_icon_white.png');
const DISEASE_ICON = require('../../assets/icon/disease_icon_white.png');

/** 측정 하나의 상태 — 아직 안 함 / 넘어감 / 분석 완료 */
export type MeasureStatus = 'pending' | 'skipped' | 'done';

/**
 * 신규 증상 기록하기·이어서 기록하기의 첫 화면 — 피부 장벽 측정과 피부 질환 측정을 여기서 하나씩 한다.
 *
 *   안 한 측정  → [촬영하기] [넘어가기]
 *   넘어간 측정 → "넘어갔어요" + [촬영하기]  (나중에 마음이 바뀌면 다시 찍을 수 있게)
 *   끝난 측정   → "분석 완료" + [다시 촬영]
 *
 * 촬영·분석이 끝나면 "분석 완료"를 잠깐 보여주고(AnalysisDoneScreen) 이 화면으로 돌아온다.
 * 하나라도 분석이 끝나면 맨 아래 [결과 보기]가 열린다 — 두 결과를 경과 관찰 페이지와 같은 모양으로 함께 보여준다.
 */
export default function NewExamHubScreen({
  title = '신규 증상 기록하기',
  place,
  diseaseCaption = '부위를 고르고 찍어 질환 · 증상을 분석해요',
  showDisease = true,
  barrier,
  disease,
  onShootBarrier,
  onSkipBarrier,
  onShootDisease,
  onSkipDisease,
  onViewResult,
  onBack,
}: {
  /** 헤더 제목 — 신규 증상 기록하기 / 이어서 기록하기 */
  title?: string;
  /** 이어서 기록할 폴더 이름 — 있으면 질문 위에 적는다 */
  place?: string;
  /** 피부 질환 카드 설명 — 이어서 기록은 부위를 고르지 않는다 */
  diseaseCaption?: string;
  /** false면 피부 질환 측정 카드를 숨긴다 — 피부 장벽 폴더를 이어 찍을 때 */
  showDisease?: boolean;
  barrier: MeasureStatus;
  disease: MeasureStatus;
  onShootBarrier: () => void;
  onSkipBarrier: () => void;
  onShootDisease: () => void;
  onSkipDisease: () => void;
  onViewResult: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const canView = barrier === 'done' || disease === 'done';
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
          <MaterialIcons name="chevron-left" size={24} color={AppColors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {place != null && <Text style={styles.place}>{place}</Text>}
        <Text style={styles.question}>무엇을 측정할까요?</Text>
        <Text style={styles.questionSub}>필요 없는 측정은 넘어가도 돼요</Text>
        <View style={{ height: 20 }} />

        <MeasureCard
          icon={BARRIER_ICON}
          iconSize={26}
          color={BARRIER_SERIES.color}
          title="피부 장벽 측정"
          caption="얼굴을 찍어 주름 · 모공 · 수분량을 측정해요"
          status={barrier}
          onShoot={onShootBarrier}
          onSkip={onSkipBarrier}
        />
        {showDisease && <View style={{ height: 12 }} />}
        {showDisease && (
        <MeasureCard
          icon={DISEASE_ICON}
          iconSize={20}
          color={CHART_SERIES.skin.color}
          title="피부 질환 측정"
          caption={diseaseCaption}
          status={disease}
          onShoot={onShootDisease}
          onSkip={onSkipDisease}
        />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          style={[styles.resultBtn, !canView && styles.resultBtnOff]}
          onPress={onViewResult}
          disabled={!canView}
        >
          <Text style={[styles.resultBtnText, !canView && styles.resultBtnTextOff]}>결과 보기</Text>
        </Pressable>
        {!canView && <Text style={styles.footerHint}>측정을 하나 이상 마치면 결과를 볼 수 있어요</Text>}
      </View>
    </View>
  );
}

function MeasureCard({
  icon,
  iconSize,
  color,
  title,
  caption,
  status,
  onShoot,
  onSkip,
  skippable = true,
}: {
  icon: ImageSourcePropType;
  iconSize: number;
  color: string;
  title: string;
  caption: string;
  status: MeasureStatus;
  onShoot: () => void;
  onSkip: () => void;
  /** false면 [넘어가기]를 두지 않는다 */
  skippable?: boolean;
}) {
  const done = status === 'done';
  return (
    <View style={[cardDecoration(), styles.card, done && styles.cardDone]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: color }]}>
          <Image source={icon} style={{ width: iconSize, height: iconSize }} resizeMode="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardCaption}>{caption}</Text>
        </View>
        {done && (
          <View style={styles.doneTag}>
            <MaterialIcons name="check-circle" size={15} color={AppColors.greenDeep} />
            <Text style={styles.doneTagText}>분석 완료</Text>
          </View>
        )}
        {status === 'skipped' && <Text style={styles.skippedText}>넘어갔어요</Text>}
      </View>

      <View style={styles.btnRow}>
        {done ? (
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onShoot}>
            <MaterialIcons name="refresh" size={17} color={AppColors.ink} />
            <Text style={styles.btnGhostText}>다시 촬영</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onShoot}>
              <MaterialIcons name="photo-camera" size={17} color="#16320A" />
              <Text style={styles.btnPrimaryText}>촬영하기</Text>
            </Pressable>
            {status === 'pending' && skippable && (
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={onSkip}>
                <Text style={styles.btnGhostText}>넘어가기</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * 분석이 끝난 직후 잠깐 보여주는 화면 — "분석 완료"를 확인시킨 뒤 1.2초 뒤(또는 누르면 바로)
 * 측정 선택 화면으로 돌아간다.
 */
export function AnalysisDoneScreen({ title, onDone }: { title: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <Pressable style={styles.doneRoot} onPress={onDone}>
      <View style={styles.doneCircle}>
        <MaterialIcons name="check" size={44} color="#16320A" />
      </View>
      <View style={{ height: 18 }} />
      <Text style={styles.doneTitle}>분석 완료</Text>
      <View style={{ height: 6 }} />
      <Text style={styles.doneSub}>{title} 결과가 준비됐어요</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: AppColors.ink, marginRight: 38 },

  body: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  place: { fontSize: 13, fontWeight: '800', color: AppColors.greenMuted, marginBottom: 6 },
  question: { fontSize: 22, fontWeight: '800', color: AppColors.ink },
  questionSub: { fontSize: 13, color: AppColors.sub, marginTop: 6 },

  card: { padding: 16, borderWidth: 1.5, borderColor: 'transparent' },
  cardDone: { borderColor: AppColors.greenTop },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  cardCaption: { fontSize: 12, color: AppColors.sub, marginTop: 3, lineHeight: 17 },
  doneTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: '#EDF7E1',
  },
  doneTagText: { fontSize: 12, fontWeight: '800', color: AppColors.greenDeep },
  skippedText: { fontSize: 12, fontWeight: '700', color: AppColors.sub },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 12,
  },
  btnPrimary: { backgroundColor: AppColors.greenTop },
  btnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#16320A' },
  btnGhost: { backgroundColor: '#F1F3F6' },
  btnGhostText: { fontSize: 14, fontWeight: '700', color: AppColors.ink },

  footer: { paddingHorizontal: 20, paddingTop: 10 },
  resultBtn: { backgroundColor: AppColors.greenTop, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  resultBtnOff: { backgroundColor: '#E1E5EA' },
  resultBtnText: { fontSize: 16, fontWeight: '800', color: '#16320A' },
  resultBtnTextOff: { color: AppColors.sub },
  footerHint: { fontSize: 11.5, color: AppColors.sub, textAlign: 'center', marginTop: 8 },

  doneRoot: { flex: 1, backgroundColor: '#14171C', alignItems: 'center', justifyContent: 'center' },
  doneCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: AppColors.greenTop,
    alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  doneSub: { fontSize: 13.5, color: 'rgba(255,255,255,0.7)' },
});
