import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, cardDecoration } from '../theme';
import { plainSiteLabel } from '../models';
import { useFolders, folderHasSeverity, isBarrierFolder } from '../folders/store';
import { CHART_SERIES, DISPLAY_SCALE, NO_GRADE_COLOR, skinConditionInfo } from '../folders/theme';
import LesionThumb from '../folders/components/LesionThumb';
import { useMonitoring } from '../context/MonitoringContext';
import { DeltaText, shortMd } from '../components/TrendDelta';

const ATOPY_COLOR = CHART_SERIES.skin.color;

/**
 * 아토피 기록 — 자리(부위)별 IGA 변화 목록.
 *
 *   홈 아토피 카드 "기록" ─▶ 이 화면 ─▶ 줄을 누르면 아토피 결과 상세(MonitoringDetail)
 *
 * 아토피 등급은 하루이틀 사이에 크게 움직이지 않아서 그래프보다 **회차별 목록**이 맞다 — 등급이
 * 바뀐 회차가 어디인지, 지난번보다 나아졌는지만 한눈에 보이면 된다. 미세한 변화는 피부장벽
 * 기록(점수 추이 그래프)이 맡는다.
 */
export default function AtopyHistoryScreen({ navigation, route }: { navigation: any; route?: any }) {
  const folders = useFolders();
  const { findTarget } = useMonitoring();

  // 아토피 갈래의 폴더 = 피부 장벽 폴더를 뺀 나머지. 최근에 기록한 자리가 앞으로 온다.
  const sites = useMemo(
    () =>
      folders
        .filter((f: any) => !isBarrierFolder(f) && f.records.length > 0)
        .map((f: any) => {
          const target = f.targetId ? findTarget(f.targetId) : undefined;
          const name = target
            ? [plainSiteLabel(target.label), target.diagnosis?.disease].filter(Boolean).join(' ')
            : plainSiteLabel(f.name);
          return { folder: f, name, lastTs: f.records[f.records.length - 1]?.ts ?? 0 };
        })
        .sort((a: any, b: any) => b.lastTs - a.lastTs),
    [folders, findTarget],
  );

  const [pickedId, setPickedId] = useState<string | null>(route?.params?.folderId ?? null);
  const site = sites.find((s: any) => s.folder.id === pickedId) ?? sites[0];
  const folder = site?.folder;
  const graded = folder ? folderHasSeverity(folder) : false;

  // 최신 회차가 위로. 변화량은 "바로 앞(더 오래된) 회차" 대비
  const rows = useMemo(() => {
    if (!folder) return [];
    const recs = folder.records;
    return recs
      .map((r: any, i: number) => {
        const score = DISPLAY_SCALE.iga(r.iga);
        const prev = i > 0 ? DISPLAY_SCALE.iga(recs[i - 1].iga) : null;
        return { record: r, score, delta: prev != null ? score - prev : null };
      })
      .reverse();
  }, [folder]);

  const latest = rows[0];
  const first = rows[rows.length - 1];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <MaterialIcons name="chevron-left" size={26} color={AppColors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>아토피 기록</Text>
          <Text style={styles.topSub}>IGA 변화 목록</Text>
        </View>
        <Pressable
          style={[styles.measureBtn, { backgroundColor: ATOPY_COLOR }]}
          onPress={() => navigation.navigate('Tabs', { screen: 'Camera', params: { mode: 'atopy' } })}
        >
          <MaterialIcons name="photo-camera" size={15} color="#FFFFFF" />
          <Text style={styles.measureBtnText}>측정하기</Text>
        </Pressable>
      </View>

      {sites.length === 0 ? (
        <View style={[cardDecoration(), styles.empty]}>
          <MaterialIcons name="healing" size={30} color={AppColors.sub} />
          <Text style={styles.emptyTitle}>아직 아토피 기록이 없어요</Text>
          <Text style={styles.emptyHint}>측정하기로 첫 기록을 남기면 IGA 변화가 여기에 쌓여요</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* 자리 고르기 — 하나뿐이면 칩 대신 이름만 */}
          {sites.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {sites.map((s: any) => {
                const on = s.folder.id === folder?.id;
                return (
                  <Pressable
                    key={s.folder.id}
                    style={[styles.chip, on && { backgroundColor: ATOPY_COLOR, borderColor: ATOPY_COLOR }]}
                    onPress={() => setPickedId(s.folder.id)}
                  >
                    <Text style={[styles.chipText, on && { color: '#FFFFFF' }]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.siteName}>{site?.name}</Text>
          )}

          {/* 요약 — 지금 등급과 첫 기록 대비 변화 */}
          {latest && (
            <View style={[cardDecoration(), styles.summary]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>현재 피부 질환</Text>
                <View style={styles.summaryValueRow}>
                  <Text style={styles.summaryValue}>{latest.score}</Text>
                  <Text style={styles.summaryUnit}>/100</Text>
                  {graded && <GradeBadge score={latest.score} />}
                </View>
                <Text style={styles.summaryMeta}>
                  IGA {Number(latest.record.iga).toFixed(1)} · {shortMd(latest.record.date)} 측정
                </Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryLabel}>첫 기록 대비</Text>
                <DeltaText delta={rows.length > 1 ? latest.score - first.score : null} size={15} withWord />
                <Text style={styles.summaryMeta}>{rows.length}회 측정</Text>
              </View>
            </View>
          )}

          {!graded && (
            <Text style={styles.note}>이 자리는 아토피피부염이 아니라 IGA 등급을 매기지 않아요</Text>
          )}

          <Text style={styles.sectionLabel}>회차별 기록</Text>
          <View style={[cardDecoration(), { paddingHorizontal: 14 }]}>
            {rows.map(({ record, score, delta }: any, i: number) => (
              <Pressable
                key={record.id}
                style={({ pressed }) => [
                  styles.row,
                  i !== rows.length - 1 && styles.rowLine,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => navigation.navigate('MonitoringDetail', { folderId: folder.id, recordId: record.id })}
              >
                <LesionThumb photo={record.photo} size={46} style={undefined} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowDate}>{record.date.split('-').join('.')}</Text>
                  <View style={styles.rowGradeLine}>
                    {graded ? <GradeBadge score={score} small /> : <Text style={styles.rowNoGrade}>등급 없음</Text>}
                    <Text style={styles.rowIga}>IGA {Number(record.iga).toFixed(1)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={styles.rowScore}>{score}</Text>
                  <DeltaText delta={delta} size={11.5} />
                </View>
                <MaterialIcons name="chevron-right" size={20} color={AppColors.sub} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function GradeBadge({ score, small }: { score: number; small?: boolean }) {
  const info = skinConditionInfo(score);
  const color = info?.color ?? NO_GRADE_COLOR;
  return (
    <View style={[styles.badge, small && styles.badgeSmall, { backgroundColor: color + '22' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, small && { fontSize: 11 }, { color: AppColors.ink }]}>{info?.ko ?? '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: AppColors.card,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.line,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: AppColors.ink },
  topSub: { fontSize: 11.5, fontWeight: '600', color: AppColors.sub, marginTop: 1 },
  measureBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  measureBtnText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },

  body: { padding: 16, paddingBottom: 32 },
  chips: { gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppColors.line,
    backgroundColor: AppColors.card,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: AppColors.ink },
  siteName: { fontSize: 15, fontWeight: '800', color: AppColors.ink, marginBottom: 10, paddingLeft: 2 },

  summary: { flexDirection: 'row', padding: 16, gap: 12 },
  summaryLabel: { fontSize: 12, fontWeight: '700', color: AppColors.sub },
  summaryValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 2 },
  summaryValue: { fontSize: 30, fontWeight: '800', color: AppColors.ink },
  summaryUnit: { fontSize: 13, fontWeight: '700', color: AppColors.sub, marginRight: 8, marginTop: 8 },
  summaryMeta: { fontSize: 11.5, color: AppColors.sub, marginTop: 4 },
  summaryRight: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  note: { fontSize: 12, color: AppColors.sub, marginTop: 10, paddingLeft: 2 },

  sectionLabel: { fontSize: 13, fontWeight: '800', color: AppColors.sub, marginTop: 20, marginBottom: 8, paddingLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: AppColors.line },
  rowDate: { fontSize: 14, fontWeight: '800', color: AppColors.ink },
  rowGradeLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  rowIga: { fontSize: 11.5, fontWeight: '600', color: AppColors.sub },
  rowNoGrade: { fontSize: 11.5, fontWeight: '700', color: NO_GRADE_COLOR },
  rowScore: { fontSize: 17, fontWeight: '800', color: AppColors.ink },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeSmall: { paddingHorizontal: 7, paddingVertical: 2 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },

  empty: { margin: 16, padding: 28, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: AppColors.ink },
  emptyHint: { fontSize: 12, color: AppColors.sub, textAlign: 'center' },
});
