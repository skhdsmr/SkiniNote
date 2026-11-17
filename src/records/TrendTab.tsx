import React, { useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, cardDecoration } from '../theme';
import { useFolders, daysBetween, isBarrierFolder, todayKey } from '../folders/store';
import { BARRIER_SERIES, CHART_SERIES, DISPLAY_SCALE, NO_GRADE_COLOR, SKIN_SEGMENTS, skinConditionInfo } from '../folders/theme';
import { useProfile } from '../context/ProfileContext';
import { DaySlider, TrackedSite, useWholeBodySites } from '../screens/WholeBodyResultScreen';
import { COARSE_GROUPS, COARSE_OF_PART, CoarseGroupId } from '../monitoring/bodyParts';
import LabeledBodyMap, { ExtraTag, GroupStatus } from './LabeledBodyMap';
import { worstIgaOf } from '../components/WholeBodyTimeline';
import { useDayItchMap } from './itchStore';

const DISEASE_ICON = require('../../assets/icon/disease_icon_white.png');
const BARRIER_ICON = require('../../assets/icon/barrier_icon_white.png');
const ITCH_ICON = require('../../assets/icon/itch_icon_white.png');
const SLEEP_ICON = require('../../assets/icon/sleep_icon_white.png');

/** 2×2 작은 그래프의 높이 — 남는 높이는 전신 지도가 가져간다 */
const MINI_CHART_H = 58;

/**
 * 피부 장벽 총점 → 4단계. 장벽 점수 색(scanGradientColor)과 같은 기준점을 쓴다 —
 * 평균 75(그 이상 좋음), −1SD 67.5(주의), −2SD 60(나쁨), 그 아래 매우 나쁨.
 */
function barrierLevel(score: number) {
  const [veryBad, bad, caution, good] = SKIN_SEGMENTS; // 매우 나쁨 · 나쁨 · 주의 · 좋음 순
  if (score >= 75) return good;
  if (score >= 67.5) return caution;
  if (score >= 60) return bad;
  return veryBad;
}

/** 덩어리 하나의 상태 + 상세 카드 내용 */
interface GroupDetail extends GroupStatus {
  /** 상세 카드 이름 옆 회색 글씨 ("아토피", "피부 장벽") */
  kind?: string;
  /** 상세 카드 둘째 줄 ("피부 질환 62점 · 지난 기록보다 +3") */
  metric?: string;
  /** "경과 보기"로 열 폴더 */
  folderId?: string;
}

const signed = (d: number) => (d === 0 ? '변화 없음' : d > 0 ? `+${d}` : `${d}`);

/** 얼굴 피부 장벽 — dateKey까지 마지막 측정. 잰 적이 없으면 null */
function barrierDetail(barrierFolder: any, dateKey: string): GroupDetail | null {
  if (!barrierFolder) return null;
  const scans = barrierFolder.records.filter(
    (r: any) => r.skinScan?.totalScore != null && daysBetween(r.date, dateKey) >= 0,
  );
  if (!scans.length) return null;
  const cur = scans[scans.length - 1].skinScan.totalScore as number;
  const lv = barrierLevel(cur);
  return {
    state: 'level',
    color: lv.color,
    // 장벽은 단계 글자 없이 이름만 ("얼굴 | 장벽") — 색은 장벽 점수 단계로 칠한다
    statusText: '',
    disease: '장벽',
    // 이름표는 등급 없는 질환(건선)과 같은 회색
    tagColor: NO_GRADE_COLOR,
    folderId: barrierFolder.id,
  };
}

/** dateKey 기준 덩어리별 상태 — 그날까지 각 자리의 마지막 기록, 덩어리 안에서는 가장 나쁜 자리 */
function groupDetails(sites: TrackedSite[], barrierFolder: any, dateKey: string): Record<CoarseGroupId, GroupDetail> {
  const upto = (records: any[]) => records.filter((r) => daysBetween(r.date, dateKey) >= 0);
  const out = {} as Record<CoarseGroupId, GroupDetail>;
  COARSE_GROUPS.forEach((g) => {
    const inGroup = sites.filter((s) => s.parts.some((p) => COARSE_OF_PART[p] === g));
    const withRec = inGroup.map((s) => ({ s, recs: upto(s.records) })).filter((x) => x.recs.length);
    const graded = withRec.filter((x) => x.s.gradable);
    if (graded.length) {
      // 가장 나쁜(IGA가 가장 큰) 자리
      const worst = graded.reduce((a, b) =>
        worstIgaOf(b.recs[b.recs.length - 1]) > worstIgaOf(a.recs[a.recs.length - 1]) ? b : a,
      );
      const cur = DISPLAY_SCALE.iga(worstIgaOf(worst.recs[worst.recs.length - 1]));
      const prevRec = worst.recs[worst.recs.length - 2];
      const info = skinConditionInfo(cur);
      out[g] = {
        state: 'level',
        color: info.color,
        statusText: info.ko,
        disease: worst.s.disease,
        kind: worst.s.disease,
        metric:
          `피부 질환 ${Math.round(cur)}점` +
          (prevRec ? ` · 지난 기록보다 ${signed(Math.round(cur - DISPLAY_SCALE.iga(worstIgaOf(prevRec))))}` : ' · 첫 기록'),
        folderId: worst.s.folderId,
      };
      return;
    }
    if (withRec.length) {
      out[g] = {
        state: 'nograde',
        color: NO_GRADE_COLOR,
        // 등급 대신 질환 이름만 ("팔 건선") — 이름을 모르면 그때만 "등급 없음"
        statusText: withRec[0].s.disease ? '' : '등급 없음',
        disease: withRec[0].s.disease,
        kind: withRec[0].s.disease,
        metric: '등급을 매기지 않는 질환이에요',
        folderId: withRec[0].s.folderId,
      };
      return;
    }
    // 얼굴에 질환 기록이 없으면 피부 장벽 측정으로 상태를 본다 (얼굴 스캔이라)
    const barrier = g === 'head' ? barrierDetail(barrierFolder, dateKey) : null;
    if (barrier) {
      out[g] = barrier;
      return;
    }
    out[g] = { state: 'none', statusText: '기록 없음' };
  });
  return out;
}

const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

/**
 * 기록 탭의 "추이" 칸 — 스크롤 없이 한 화면
 *
 *   전신 지도 : 전신 결과 화면과 같은 계산(그날까지의 마지막 기록)으로 부위를 단계 색으로 칠한다.
 *               아래 슬라이더는 **기록이 있는 날짜만** 짚는다.
 *   2×2 그래프 : 피부 질환 | 피부 장벽
 *                가려움 안정도 | 수면 점수
 *               — 기록된 날짜 전체의 꺾은선, 슬라이더가 고른 날을 점선·큰 점으로 표시하고 그날 점수를 적는다.
 */
export default function TrendTab({ navigation }: { navigation: any }) {
  const folders = useFolders();
  const { healthConnected } = useProfile();
  const itchByDate = useDayItchMap();
  const today = todayKey();

  const sites = useWholeBodySites();
  const barrierFolder = folders.find((f: any) => isBarrierFolder(f));

  // 기록이 있는 날짜 — 촬영 기록(모든 폴더) + 가려움만 적어 둔 날. 오래된 날 → 최근 순
  const recordedDates = useMemo(() => {
    const set = new Set<string>();
    folders.forEach((f: any) => f.records.forEach((r: any) => set.add(r.date)));
    Object.keys(itchByDate).forEach((k) => set.add(k));
    return [...set].filter((k) => daysBetween(k, today) >= 0).sort();
  }, [folders, itchByDate, today]);

  // 처음엔 가장 최근 기록 날짜. 기록이 늘거나 줄어도 범위를 벗어나지 않게 자른다
  const [pick, setPick] = useState<number | null>(null);
  const last = recordedDates.length - 1;
  const idx = Math.max(0, Math.min(last, pick ?? last));
  const dateKey = recordedDates[idx] ?? today;
  const details = useMemo(() => groupDetails(sites, barrierFolder, dateKey), [sites, barrierFolder, dateKey]);
  /*
    얼굴에 질환(아토피 등) 기록도 있고 피부 장벽도 쟀으면 이름표가 둘 — 질환은 오른쪽(기본 이름표),
    장벽은 왼쪽에 하나 더 단다. 얼굴 색은 질환 단계를 따른다. 질환 기록이 없으면 기본 이름표가 장벽이다.
  */
  const extraTags: ExtraTag[] = useMemo(() => {
    if (details.head.disease === '장벽') return [];
    const b = barrierDetail(barrierFolder, dateKey);
    if (!b) return [];
    return [
      {
        key: 'head-barrier',
        group: 'head',
        side: 'left',
        poly: 0,
        yFrac: 0.5,
        status: b,
        onPress: () => navigation.navigate('MonitoringFolder', { folderId: b.folderId }),
      },
    ];
  }, [details, barrierFolder, dateKey, navigation]);

  // 부위·이름표를 누르면 그 자리의 경과 관찰(그래프) 화면으로 바로 간다
  const openGroup = (g: CoarseGroupId | null) => {
    const folderId = g ? details[g].folderId : undefined;
    if (folderId) navigation.navigate('MonitoringFolder', { folderId });
  };

  // ── 네 지표의 날짜별 값 (x축 = 기록된 날짜 전체, 슬라이더와 같은 칸)
  const series = useMemo(() => {
    const recordsOn = (key: string) => folders.flatMap((f: any) => f.records.filter((r: any) => r.date === key));
    const gradable = sites.filter((s) => s.gradable);
    const barrierRecs = (barrierFolder?.records ?? []).filter((r: any) => r.skinScan?.totalScore != null);

    // 피부 질환 — 그날 기준 각 자리의 마지막 기록 중 **가장 나쁜** 값 (지도 색과 같은 규칙)
    const disease = recordedDates.map((key) => {
      const worst = gradable
        .map((s) => s.records.filter((r: any) => daysBetween(r.date, key) >= 0).pop())
        .filter(Boolean)
        .map((r: any) => worstIgaOf(r));
      return worst.length ? DISPLAY_SCALE.iga(Math.max(...worst)) : null;
    });
    // 피부 장벽 — 잰 날에만 점이 있다
    const barrier = recordedDates.map((key) =>
      avg(barrierRecs.filter((r: any) => r.date === key).map((r: any) => r.skinScan.totalScore as number)),
    );
    // 가려움 안정도 — 그날 문진한 값이 우선, 없으면 그날 기록에 들어간 값
    const itch = recordedDates.map((key) => {
      const day = itchByDate[key]?.vas;
      if (typeof day === 'number') return DISPLAY_SCALE.itch(day);
      const v = avg(recordsOn(key).map((r: any) => r.itchVas).filter((x: any) => typeof x === 'number'));
      return v == null ? null : DISPLAY_SCALE.itch(v);
    });
    // 수면 점수 — 스마트워치를 연동했을 때만
    const sleep = recordedDates.map((key) =>
      healthConnected ? avg(recordsOn(key).map((r: any) => r.sleepScore).filter((x: any) => typeof x === 'number')) : null,
    );
    return { disease, barrier, itch, sleep };
  }, [folders, sites, barrierFolder, recordedDates, itchByDate, healthConnected]);

  /** 고른 날의 값 — 그날 값이 없으면 그 전 마지막 값(장벽·질환은 매일 재지 않는다) */
  const upTo = (values: (number | null)[], carry: boolean) => {
    if (!carry) return values[idx];
    for (let i = idx; i >= 0; i--) if (values[i] != null) return values[i];
    return null;
  };

  if (!recordedDates.length) {
    return (
      <View style={styles.empty}>
        <MaterialIcons name="insights" size={36} color={AppColors.sub} />
        <Text style={styles.emptyText}>기록이 쌓이면 추이를 볼 수 있어요</Text>
      </View>
    );
  }

  const [y, m, d] = dateKey.split('-').map(Number);
  const daysAgo = daysBetween(dateKey, today);
  return (
    // 스크롤 없이 한 화면 — 아래 카드들은 높이가 정해져 있고, 전신 지도 카드가 남는 높이를 다 쓴다
    <View style={styles.page}>
      <View style={[cardDecoration(), styles.mapCard]}>
        <LabeledBodyMap status={details} extraTags={extraTags} selected={null} onSelect={openGroup} />
        <LevelDots />

        <Text style={styles.dayLabel}>
          {daysAgo === 0 ? '오늘' : `${daysAgo}일 전`}
          <Text style={styles.dateLabel}>
            {'  '}
            {y}.{m}.{d}
          </Text>
        </Text>
        {/* ‹ 슬라이더 › — 기록된 날짜만 짚는다 */}
        <View style={styles.sliderRow}>
          <StepBtn icon="chevron-left" disabled={idx <= 0} onPress={() => setPick(idx - 1)} />
          <View style={{ flex: 1 }}>
            {last > 0 ? <DaySlider max={last} value={idx} onChange={setPick} /> : <View style={{ height: 30 }} />}
          </View>
          <StepBtn icon="chevron-right" disabled={idx >= last} onPress={() => setPick(idx + 1)} />
        </View>
      </View>

      {/* 2×2 그래프 — 피부 질환 | 피부 장벽 / 가려움 안정도 | 수면 점수 */}
      <View style={styles.gridRow}>
        <MiniTrendCard
          icon={DISEASE_ICON}
          color={CHART_SERIES.skin.color}
          title="피부 질환"
          values={series.disease}
          selIdx={idx}
          current={upTo(series.disease, true)}
        />
        <MiniTrendCard
          icon={BARRIER_ICON}
          color={BARRIER_SERIES.color}
          title="피부 장벽"
          values={series.barrier}
          selIdx={idx}
          current={upTo(series.barrier, true)}
          // 장벽 총점은 50~100 사이에서 움직인다 — 0부터 그리면 변화가 납작해진다
          min={50}
          onPress={barrierFolder ? () => navigation.navigate('MonitoringFolder', { folderId: barrierFolder.id }) : undefined}
        />
      </View>
      <View style={styles.gridRow}>
        <MiniTrendCard
          icon={ITCH_ICON}
          color={CHART_SERIES.itch.color}
          title="가려움 안정도"
          values={series.itch}
          selIdx={idx}
          current={upTo(series.itch, false)}
        />
        <MiniTrendCard
          icon={SLEEP_ICON}
          color={CHART_SERIES.sleep.color}
          title="수면 점수"
          values={series.sleep}
          selIdx={idx}
          current={upTo(series.sleep, false)}
          emptyText={healthConnected ? undefined : '스마트워치 미연동'}
        />
      </View>
    </View>
  );
}

/** 색 범례 — 4단계 + 등급 없음을 점과 이름으로 한 줄에 */
function LevelDots() {
  return (
    <View style={styles.dots}>
      {[...SKIN_SEGMENTS.map((s) => ({ ko: s.ko, color: s.color })), { ko: '등급 없음', color: NO_GRADE_COLOR }].map((d) => (
        <View key={d.ko} style={styles.dotItem}>
          <View style={[styles.dot, { backgroundColor: d.color }]} />
          <Text style={styles.dotText}>{d.ko}</Text>
        </View>
      ))}
    </View>
  );
}

function StepBtn({ icon, disabled, onPress }: { icon: 'chevron-left' | 'chevron-right'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.stepBtn, disabled && { opacity: 0.3 }]} onPress={onPress} disabled={disabled} hitSlop={6}>
      <MaterialIcons name={icon} size={20} color="#555555" />
    </Pressable>
  );
}

/**
 * 2×2 칸 하나 — 제목 · 고른 날 점수 · 기록된 날짜 전체의 작은 꺾은선.
 * 값이 없는 날은 건너뛰고 있는 점끼리 잇는다(장벽은 가끔만 재므로). 고른 날은 세로 점선 + 큰 점.
 */
function MiniTrendCard({
  icon,
  color,
  title,
  values,
  selIdx,
  current,
  min = 0,
  max = 100,
  emptyText,
  onPress,
}: {
  icon: ImageSourcePropType;
  color: string;
  title: string;
  values: (number | null)[];
  selIdx: number;
  current: number | null;
  min?: number;
  max?: number;
  emptyText?: string;
  onPress?: () => void;
}) {
  const [w, setW] = useState(0);
  const n = values.length;
  const padX = 6;
  const padY = 6;
  const x = (i: number) => (n <= 1 ? w / 2 : padX + (i / (n - 1)) * (w - padX * 2));
  const y = (v: number) => padY + (1 - Math.min(1, Math.max(0, (v - min) / (max - min)))) * (MINI_CHART_H - padY * 2);
  const pts = values.map((v, i) => (v == null ? null : { x: x(i), y: y(v), i })).filter(Boolean) as {
    x: number;
    y: number;
    i: number;
  }[];
  const grid = [0.25, 0.5, 0.75].map((t) => min + (max - min) * t);

  return (
    <Pressable
      style={({ pressed }) => [cardDecoration(), styles.miniCard, pressed && onPress && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.headerIcon, { backgroundColor: color }]}>
          <Image source={icon} style={{ width: 13, height: 13 }} resizeMode="contain" />
        </View>
        <Text style={styles.miniTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={styles.miniValue}>
        {current != null ? Math.round(current) : '–'}
        {current != null && <Text style={styles.miniUnit}>점</Text>}
      </Text>
      <View style={{ height: MINI_CHART_H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {emptyText || !pts.length ? (
          <View style={styles.miniEmpty}>
            <Text style={styles.emptyLine}>{emptyText ?? '기록 없음'}</Text>
          </View>
        ) : (
          w > 0 && (
            <Svg width={w} height={MINI_CHART_H}>
              {grid.map((g) => (
                <Line key={g} x1={0} x2={w} y1={y(g)} y2={y(g)} stroke={AppColors.line} strokeWidth={1} />
              ))}
              <Line
                x1={x(selIdx)}
                x2={x(selIdx)}
                y1={0}
                y2={MINI_CHART_H}
                stroke={AppColors.sub}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              {pts.length > 1 && (
                <Polyline
                  points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {pts.map((p) =>
                p.i === selIdx ? (
                  <Circle key={p.i} cx={p.x} cy={p.y} r={4.5} fill="#FFFFFF" stroke={color} strokeWidth={2} />
                ) : n <= 20 ? (
                  <Circle key={p.i} cx={p.x} cy={p.y} r={2.2} fill={color} />
                ) : null,
              )}
            </Svg>
          )
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, gap: 8 },
  // 지도 카드는 여백을 최소로 — 남는 높이를 몸 그림이 최대한 쓴다
  mapCard: { flex: 1, minHeight: 0, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 0 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 2, marginTop: 4 },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotText: { fontSize: 11, color: AppColors.sub, fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stepBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: AppColors.bg,
  },
  dayLabel: { textAlign: 'center', fontSize: 14, fontWeight: '800', color: AppColors.ink, marginTop: 2 },
  dateLabel: { fontSize: 11.5, fontWeight: '500', color: AppColors.sub },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 13.5, color: AppColors.sub },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  gridRow: { flexDirection: 'row', gap: 8 },
  miniCard: { flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  miniTitle: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: AppColors.ink },
  miniValue: { fontSize: 20, fontWeight: '900', color: AppColors.ink, marginTop: 4, marginBottom: 2 },
  miniUnit: { fontSize: 11.5, fontWeight: '700', color: AppColors.sub },
  miniEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyLine: { fontSize: 12, color: AppColors.sub },
});
