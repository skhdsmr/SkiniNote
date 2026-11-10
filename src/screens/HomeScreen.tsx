import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, ImageSourcePropType, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, cardDecoration } from '../theme';
import { CareItem, ITCH_SURVEY_ROUTINE, SKIN_RECORD_ROUTINE, plainSiteLabel } from '../models';
import { SectionHeader, RoutineRowContent } from '../components/widgets';
import { useRoutines } from '../context/RoutineContext';
import { useProfile } from '../context/ProfileContext';
import { useMonitoring } from '../context/MonitoringContext';
import { useFolders, useLatestMonitoringRecord, folderHasSeverity, isBarrierFolder } from '../folders/store';
import { DISPLAY_SCALE, skinConditionInfo, itchBand, sleepBand, skinBarrierInfo, CHART_SERIES, BARRIER_SERIES } from '../folders/theme';
import { levelColor } from './SkinScanScreen';
import { StatBox } from '../components/MetricCard';

// 경과 관찰 폴더 화면의 요약칸과 같은 원형 배지 아이콘 — 같은 지표는 어느 화면에서 봐도 같게 보이도록
const BARRIER_ICON = require('../../assets/icon/barrier_icon_white.png');
const DISEASE_ICON = require('../../assets/icon/disease_icon_white.png');
const ITCH_ICON = require('../../assets/icon/itch_icon_white.png');
const SLEEP_ICON = require('../../assets/icon/sleep_icon_white.png');

export default function HomeScreen({ navigation }: { navigation: any }) {
  const { careItemsForOffset, toggleForOffset } = useRoutines();
  const { name, healthConnected } = useProfile();
  const { findTarget } = useMonitoring();
  const latest = useLatestMonitoringRecord();
  // 피부 장벽 폴더(하나뿐)의 가장 최근 측정 — "최근 피부 장벽 상태" 카드
  const folders = useFolders();
  const barrierFolder = folders.find((f: any) => isBarrierFolder(f));
  const barrierLatest = barrierFolder
    ? [...barrierFolder.records].reverse().find((r: any) => r.skinScan)
    : undefined;
  // 피부 바로 스캔 — 장벽/질환 중 무엇을 잴지 고르는 칸이 펼쳐져 있는지
  const [scanPickOpen, setScanPickOpen] = useState(false);

  /** 요약 카드를 누르면 가장 최근 촬영의 상세 결과 페이지로 바로 넘어간다 */
  const goLatestDetail = () => {
    if (!latest) return;
    navigation.navigate('MonitoringDetail', { folderId: latest.folder.id, recordId: latest.record.id });
  };

  // 가장 최근 기록이 어느 부위를 찍은 건지 — 모니터링 대상(target)이 자리를 들고 있다
  const latestTarget = latest?.folder.targetId ? findTarget(latest.folder.targetId) : undefined;
  const latestSiteLabel = latestTarget ? plainSiteLabel(latestTarget.label) : undefined;
  /* 카드 제목의 "(부위) (질환명)" 부분 — 나머지 글자와 다른 색으로 강조해서 눈에 먼저 들어오게
     한다. 아직 진단을 안 붙인 폴더는 질환명이 없으니 부위까지만("몸통"), 부위조차 못 찾으면
     빈 문자열이라 카드가 예전처럼 "최근 피부 상태"로 대신한다. */
  const statusHighlight = [latestSiteLabel, latest?.folder.disease].filter(Boolean).join(' ');

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
    >
      <Text style={styles.greeting}>안녕하세요, {name}님</Text>
      <View style={{ height: 3 }} />
      <Text style={styles.headline}>오늘 피부 상태를 확인해볼까요?</Text>
      <View style={{ height: 18 }} />

      <RecentStatusCard
        record={latest?.record}
        highlight={statusHighlight}
        hasSeverity={latest ? folderHasSeverity(latest.folder) : false}
        healthConnected={healthConnected}
        onPress={goLatestDetail}
      />

      <View style={{ height: 14 }} />
      <BarrierStatusCard
        scan={barrierLatest?.skinScan}
        onPress={() =>
          barrierFolder && barrierLatest &&
          navigation.navigate('MonitoringDetail', { folderId: barrierFolder.id, recordId: barrierLatest.id })
        }
      />

      <View style={{ height: 14 }} />
      {/* 문진 없이 지금 피부만 찍어 결과만 보는 길 — 기록으로 남기지 않는다.
          오늘 할 일(루틴) 목록보다 먼저 두어, 상태를 확인한 바로 다음 동작으로 이어지게 한다. */}
      {/* 누르면 카드 아래에 "피부 장벽 측정 / 피부 질환 측정"이 펼쳐지고, 고르면 그 촬영으로 들어간다 */}
      <View style={[cardDecoration(), styles.quickCard]}>
        <Pressable style={styles.quickHead} onPress={() => setScanPickOpen((o) => !o)}>
          <View style={styles.quickIcon}>
            <MaterialIcons name="center-focus-strong" size={22} color="#16320A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>피부 바로 스캔</Text>
            {/* 설명 두 문장은 각각 한 줄로 — 칸이 좁으면 줄바꿈 대신 글씨를 조금 줄인다 (전체 두 줄) */}
            <Text style={styles.quickSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              피부를 빠르게 촬영하고 분석 결과를 확인해요
            </Text>
            {/* 고르면 바로 카메라로 들어가므로, 저장되지 않는다는 건 여기서 미리 알려야 한다 */}
            <Text style={styles.noticeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              피부 바로 스캔 기능으로 촬영한 사진은 저장되지 않아요
            </Text>
          </View>
          <MaterialIcons name={scanPickOpen ? 'expand-less' : 'expand-more'} size={22} color={AppColors.sub} />
        </Pressable>
        {scanPickOpen && (
          <View style={styles.scanPickRow}>
            <ScanPickButton
              icon={BARRIER_ICON}
              color={BARRIER_SERIES.color}
              title="피부 장벽 측정"
              sub="주름 · 모공 · 수분량"
              onPress={() => {
                setScanPickOpen(false);
                navigation.navigate('Camera', { mode: 'quickBarrier' }); // 저장 없는 장벽 스캔
              }}
            />
            <ScanPickButton
              icon={DISEASE_ICON}
              color={CHART_SERIES.skin.color}
              title="피부 질환 측정"
              sub="병변 · 증상 4가지"
              onPress={() => {
                setScanPickOpen(false);
                navigation.navigate('Camera', { mode: 'quick' });
              }}
            />
          </View>
        )}
      </View>

      <SectionHeader title="오늘의 피부 케어" onMore={() => navigation.navigate('Routine')} />
      <TodayCareCard
        items={careItemsForOffset(0)}
        /* "가려움증 문진하기" 줄은 체크만 하는 게 아니라 실제로 적으러 갈 수 있어야 한다 */
        onOpenItch={() => navigation.navigate('Records', { focus: 'itch' })}
        /* "피부 상태 기록하기" 줄은 카메라 탭 "이어서 기록하기"가 이미 골라진 채로 넘어간다 */
        onQuickRecord={() => navigation.navigate('Camera', { mode: 'atopy', pick: 'followUp' })}
        onToggle={(key) => toggleForOffset(0, key)}
      />
    </ScrollView>
  );
}

/**
 * "경과 관찰" 요약 카드 — 상세 결과·경과 관찰 화면과 같은 생김새(큰 숫자 + 단계 배지)를 쓴다.
 * 예전의 진한 초록 카드는 값이 작아 정작 중요한 "지금 어느 단계인지"가 눈에 안 들어왔다.
 */
function RecentStatusCard({
  record,
  highlight,
  hasSeverity,
  healthConnected,
  onPress,
}: {
  /** skinScan — 그 회차에 피부상태측정(얼굴 스캔)을 했으면 종합 점수가 있다. 없으면 "미측정" */
  record?: { iga: number; itchVas: number; sleepScore: number; skinScan?: { totalScore: number; ageGroup?: string | null } | null };
  /** 제목 가운데의 "(부위) (질환명)" — 다른 글자와 다른 색으로 강조한다. 빈 문자열이면 "최근 피부 상태"로 대신한다 */
  highlight: string;
  /**
   * 가장 최근 기록이 속한 폴더의 진단명이 아토피피부염인지 — IGA 점수·등급 배지를 보여줄지 정한다.
   * 아토피가 아니면 점수 자체가 없는 지표라 배지 없이 값만 남긴다(가려움·수면과 같은 자리라 칸은 늘 셋).
   */
  hasSeverity: boolean;
  healthConnected: boolean;
  onPress: () => void;
}) {
  if (!record) {
    return (
      <View style={[cardDecoration(), styles.emptyStatus]}>
        <MaterialIcons name="photo-camera" size={26} color={AppColors.sub} />
        <View style={{ height: 8 }} />
        <Text style={styles.emptyStatusText}>아직 기록이 없어요{'\n'}첫 촬영을 남기면 여기에 상태가 쌓여요</Text>
      </View>
    );
  }

  const skinValue = DISPLAY_SCALE.iga(record.iga);
  const itchValue = DISPLAY_SCALE.itch(record.itchVas);
  const sleepValue = healthConnected ? record.sleepScore : null;

  return (
    <Pressable onPress={onPress} style={[cardDecoration(), styles.statusCard]}>
      <View style={styles.statusHead}>
        <Text style={styles.statusTitle} numberOfLines={1}>
          {highlight ? (
            <>
              최근 <Text style={styles.statusTitleHighlight}>{highlight}</Text> 상태
            </>
          ) : (
            '최근 피부 상태'
          )}
        </Text>
        <View style={{ flex: 1 }} />
        <MaterialIcons name="chevron-right" size={20} color={AppColors.sub} />
      </View>
      <View style={styles.statusRow}>
        <StatBox
          label="피부 질환"
          value={`${skinValue}`}
          band={hasSeverity ? skinConditionInfo(skinValue) : undefined}
          icon={DISEASE_ICON}
          circleColor={CHART_SERIES.skin.color}
        />
        <StatBox
          label="가려움 안정도"
          value={`${itchValue}`}
          band={itchBand(itchValue)}
          icon={ITCH_ICON}
          circleColor={CHART_SERIES.itch.color}
        />
        <StatBox
          label="수면 점수"
          value={sleepValue != null ? `${sleepValue}` : '-'}
          band={sleepValue != null ? sleepBand(sleepValue) : null}
          icon={SLEEP_ICON}
          circleColor={CHART_SERIES.sleep.color}
        />
      </View>
    </Pressable>
  );
}

/**
 * "최근 피부 장벽 상태" 카드 — 위 "최근 (부위) (질환) 상태" 카드와 같은 틀(제목 + 화살표).
 *   [● 피부 장벽  90 ............ 또래 상위 3%]
 *   [주름 이마·미간 Lv.7] [주름 눈가 Lv.6] [모공 볼 Lv.6] [수분량 Lv.7]
 * 피부 장벽 폴더의 가장 최근 측정을 보여주고, 누르면 그 측정의 결과 상세로 간다.
 */
function BarrierStatusCard({ scan, onPress }: { scan?: any; onPress: () => void }) {
  if (!scan) {
    return (
      <View style={[cardDecoration(), styles.emptyStatus]}>
        <Text style={styles.emptyStatusText}>아직 피부 장벽 기록이 없어요</Text>
      </View>
    );
  }
  const score = Math.round(scan.totalScore);
  const peer = skinBarrierInfo(scan.totalScore, scan.ageGroup);
  const metric = (key: string) => scan.metrics?.find((m: any) => m.key === key);
  const wrinkle = metric('wrinkle');
  const pore = metric('pore');
  const moisture = metric('moisture');
  // 주름 두 부위 · 모공 · 수분량 — 결과 화면의 레벨 상자와 같은 이름·같은 레벨
  const boxes: { metric?: string; part: string; item: any }[] = [
    ...(wrinkle?.items ?? []).map((it: any) => ({ metric: wrinkle.label, part: it.label, item: it })),
    ...(pore?.items ?? []).map((it: any) => ({ metric: pore.label, part: it.label, item: it })),
    ...(moisture?.items?.[0] ? [{ part: moisture.label, item: moisture.items[0] }] : []),
  ];
  return (
    <Pressable onPress={onPress} style={[cardDecoration(), styles.statusCard]}>
      <View style={styles.statusHead}>
        <Text style={styles.statusTitle} numberOfLines={1}>
          최근 <Text style={[styles.statusTitleHighlight, { color: BARRIER_SERIES.color }]}>피부 장벽</Text> 상태
        </Text>
        <View style={{ flex: 1 }} />
        <MaterialIcons name="chevron-right" size={20} color={AppColors.sub} />
      </View>

      <View style={styles.barrierRow}>
        <View style={[styles.barrierIcon, { backgroundColor: BARRIER_SERIES.color }]}>
          <Image source={BARRIER_ICON} style={{ width: 22, height: 22 }} resizeMode="contain" />
        </View>
        <Text style={styles.barrierLabel}>피부 장벽</Text>
        <Text style={styles.barrierValue}>{score}</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.barrierPill, { backgroundColor: peer.color }]}>
          <Text style={styles.barrierPillText} numberOfLines={1}>{peer.ko}</Text>
        </View>
      </View>

      <View style={styles.levelRow}>
        {boxes.map((b) => (
          <View key={b.item.key} style={styles.levelBox}>
            {b.metric ? <Text style={styles.levelMetric}>{b.metric}</Text> : null}
            <Text style={[styles.levelPart, !b.metric && { marginTop: 8 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {b.part}
            </Text>
            <Text style={[styles.levelValue, { color: levelColor(b.item.level) }]}>
              Lv.{b.item.level}
              <Text style={styles.levelMax}>/{b.item.levelMax}</Text>
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/**
 * "오늘의 피부 케어" 카드 — 오늘 할 일상 루틴과 사용 제품을 시각 순으로 섞어 보여준다.
 * 사용자가 추가한 항목은 몇 개든 다 보여준다 — 예전엔 3개까지만 보이고 나머지는 "더 보기"로
 * 루틴 탭까지 가야 했는데, 홈에서 오늘 할 일을 한눈에 다 보는 게 우선이라 잘라내지 않는다.
 * 지난 날짜를 넘겨보는 기능은 두지 않는다 — 홈에서는 "오늘 무엇이 남았는지"만 보면 되고,
 * 지난 기록은 기록 탭에서 본다.
 */
function TodayCareCard({
  items,
  onToggle,
  onOpenItch,
  onQuickRecord,
}: {
  items: CareItem[];
  onToggle: (key: string) => void;
  onOpenItch: () => void;
  /*
    "피부 상태 기록하기" 줄이 눌러서 가는 곳 — 카메라 탭 "이어서 기록하기"로 바로 넘어간다.
    예전엔 이 줄에만 시각 옆에 별도의 "바로 가기 >" 알약 버튼을 달아서, 같은 "눌러서 간다"는
    성격인데도 가려움 줄(이름 자체를 누르고, 화살표는 이름 옆에 작게 붙는다)과 생김새가
    갈라졌다 — 시각도 그 알약 버튼에 밀려 맨 끝이 아니었다. 이제 onOpen 하나로 합쳐 가려움
    줄과 같은 모양을 쓴다.
  */
  onQuickRecord: () => void;
}) {
  if (items.length === 0) {
    return (
      <View style={[cardDecoration(), styles.careEmpty]}>
        <Text style={styles.careEmptyText}>오늘 등록된 루틴·제품이 없어요</Text>
      </View>
    );
  }
  return (
    <View style={[cardDecoration(), { paddingHorizontal: 18 }]}>
      {items.map((item, i) => (
        <View
          key={item.key}
          style={[
            { paddingVertical: 15 },
            i !== items.length - 1 && { borderBottomWidth: 1, borderBottomColor: AppColors.line },
          ]}
        >
          <FadingCareRow
            item={item}
            /* 문진 줄은 체크박스도 문진으로 보낸다 — 이유는 RoutineScreen 같은 자리에 적어 뒀다.
               체크박스는 그대로 두고, "눌러서 간다"는 이름 쪽(onOpen)만 가려움 줄과 통일한다. */
            onToggle={item.name === ITCH_SURVEY_ROUTINE ? onOpenItch : () => onToggle(item.key)}
            onOpen={
              item.name === ITCH_SURVEY_ROUTINE ? onOpenItch
                : item.name === SKIN_RECORD_ROUTINE ? onQuickRecord
                : undefined
            }
          />
        </View>
      ))}
    </View>
  );
}

/** 체크 시 목록에서 사라지지 않고, 줄긋기와 함께 서서히 흐려지는 홈 케어 행 */
function FadingCareRow({
  item,
  onToggle,
  onOpen,
}: {
  item: CareItem;
  onToggle?: () => void;
  onOpen?: () => void;
}) {
  const opacity = useRef(new Animated.Value(item.done ? 0.45 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: item.done ? 0.45 : 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [item.done, opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <RoutineRowContent item={item} onToggle={onToggle} onOpen={onOpen} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 14, color: AppColors.sub },
  headline: { fontSize: 18, fontWeight: '700', color: AppColors.ink },

  statusCard: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  statusTitle: { fontSize: 16.5, fontWeight: '800', color: AppColors.ink, flexShrink: 1 },
  statusTitleHighlight: { color: AppColors.greenMuted },
  statusRow: { flexDirection: 'row', gap: 6 },

  barrierRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barrierIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  barrierLabel: { fontSize: 14, fontWeight: '700', color: AppColors.sub },
  barrierValue: { fontSize: 26, fontWeight: '800', color: AppColors.ink },
  barrierPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, flexShrink: 1 },
  barrierPillText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  levelRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  levelBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: AppColors.bg,
  },
  levelMetric: { fontSize: 10.5, fontWeight: '700', color: AppColors.sub },
  levelPart: { fontSize: 12.5, fontWeight: '800', color: AppColors.ink, marginTop: 1 },
  levelValue: { fontSize: 17, fontWeight: '800', marginTop: 6 },
  levelMax: { fontSize: 10.5, fontWeight: '700', color: AppColors.sub },

  emptyStatus: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  emptyStatusText: { fontSize: 13, color: AppColors.sub, textAlign: 'center', lineHeight: 19 },

  careEmpty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  careEmptyText: { fontSize: 13, color: AppColors.sub },

  // 피부 촬영 탭의 "피부 바로 스캔" 카드와 같은 치수를 쓴다 — 같은 글이 한쪽에서만 두 줄로
  // 접히지 않게 하려면 글자가 놓이는 폭까지 같아야 한다
  quickCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  quickHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanPickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  scanPickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: AppColors.bg,
  },
  scanPickIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scanPickTitle: { fontSize: 14, fontWeight: '800', color: AppColors.ink, marginTop: 8 },
  scanPickSub: { fontSize: 11, color: AppColors.sub, marginTop: 3, textAlign: 'center' },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppColors.greenTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  quickSub: { fontSize: 12, color: AppColors.sub, lineHeight: 17, marginTop: 4 },
  noticeText: { fontSize: 11.5, fontWeight: '600', color: AppColors.sub, lineHeight: 17, marginTop: 4 },
});

/** 피부 바로 스캔에서 무엇을 잴지 고르는 버튼 — 지표 아이콘(경과 관찰 요약칸과 같은 색 원) + 이름 */
function ScanPickButton({
  icon,
  color,
  title,
  sub,
  onPress,
}: {
  icon: ImageSourcePropType;
  color: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.scanPickBtn, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View style={[styles.scanPickIcon, { backgroundColor: color }]}>
        <Image source={icon} style={{ width: 22, height: 22 }} resizeMode="contain" />
      </View>
      <Text style={styles.scanPickTitle}>{title}</Text>
      <Text style={styles.scanPickSub}>{sub}</Text>
    </Pressable>
  );
}
