import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { monitoringColors as mc, monitoringCard } from '../folders/theme';
import { Badge } from './MetricCard';
import {
  groupLevel,
  levelInfo,
  SYMPTOM_GROUPS,
  SYMPTOM_LAYERS,
  type InsightKind,
  type SymptomKey,
} from '../symptoms/groups';

/**
 * 단계 막대 — 3칸. 없음 = 전부 꺼짐, 미미함 = 1칸, 두드러짐 = 2칸, 뚜렷함 = 3칸이 켜진다.
 *
 * 4단계(없음·미미함·두드러짐·뚜렷함)를 "칸 수"로 읽게 해서, 같은 칸 4개 중 하나만 칠하던
 * ScaleBar보다 "얼마나 심한가"가 길이로 바로 읽힌다. 색은 같은 4단계 색(단계별 하나)이다.
 */
export function LevelBar({ level, compact = true }: { level: number; compact?: boolean }) {
  const { color } = levelInfo(level);
  return (
    <View style={styles.barRow}>
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          style={[styles.pill, compact && styles.pillCompact, { backgroundColor: n <= level ? color : mc.line }]}
        />
      ))}
    </View>
  );
}

/**
 * 증상 요약 카드 — 4가지 증상을 사용자 언어 3묶음(염증 반응 · 긁은 흔적 · 만성 흔적)으로 보여준다.
 *
 * 줄 모양은 MetricRow와 같다(이름 · 단계 배지 · 막대). 의학 용어는 이름 아래 작은 회색 태그로만 둔다.
 * 단계와 상관없이 "자세히 보기" 버튼이 항상 붙는다(증상이 없는 날에도 추이·패턴은 볼 수 있어야 한다) — onOpenInsight를 안 넘기면(이 자리의
 * 기록이 아직 폴더에 없을 때 등) 버튼 없이 요약만 보인다.
 */
export default function SymptomGroupCard({
  values,
  onOpenInsight,
}: {
  /** 기록의 세부 증상 값(redness·bumps·scratch·thickening, 0~10 스케일) */
  values: Partial<Record<SymptomKey, number>>;
  onOpenInsight?: (kind: InsightKind) => void;
}) {
  return (
    <View style={[monitoringCard(), styles.card]}>
      <Text style={styles.cardLabel}>증상 요약</Text>
      {SYMPTOM_GROUPS.map((group, i) => {
        const level = groupLevel(values, group);
        const info = levelInfo(level);
        return (
          <View key={group.key} style={[styles.row, i === 0 ? styles.rowFirst : styles.rowDivided]}>
            <View style={styles.headRow}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {group.label}
              </Text>
              <View style={{ flex: 1 }} />
              <Badge text={info.ko} color={info.color} small />
            </View>
            <LevelBar level={level} />
            <Text style={styles.message}>{level > 0 ? group.message : group.clearMessage}</Text>
            <View style={styles.footRow}>
              <View style={styles.termTag}>
                <Text style={styles.termText}>{group.members.map((m) => SYMPTOM_LAYERS[m].label).join(' · ')}</Text>
              </View>
              <View style={{ flex: 1 }} />
              {onOpenInsight && (
                <Pressable style={styles.insightBtn} onPress={() => onOpenInsight(group.insight)} hitSlop={6}>
                  <Text style={styles.insightText}>{group.insightLabel}</Text>
                  <MaterialIcons name="chevron-right" size={16} color={mc.greenMuted} />
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  cardLabel: { fontSize: 16, fontWeight: '800', color: mc.ink, marginBottom: 12 },
  row: { paddingTop: 14 },
  rowFirst: { paddingTop: 0 },
  rowDivided: { borderTopWidth: 1, borderTopColor: mc.line, marginTop: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rowLabel: { fontSize: 14, fontWeight: '800', color: mc.ink, flexShrink: 1 },

  barRow: { flexDirection: 'row', gap: 5 },
  pill: { flex: 1, height: 10, borderRadius: 5 },
  pillCompact: { height: 7, borderRadius: 4 },

  message: { fontSize: 12.5, color: mc.sub, marginTop: 10, lineHeight: 18 },
  footRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  termTag: { backgroundColor: '#F1F3F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  termText: { fontSize: 10.5, color: mc.sub },
  insightBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF5E4',
    borderRadius: 12, paddingLeft: 10, paddingRight: 4, paddingVertical: 5,
  },
  insightText: { fontSize: 11.5, fontWeight: '800', color: mc.greenMuted },
});
