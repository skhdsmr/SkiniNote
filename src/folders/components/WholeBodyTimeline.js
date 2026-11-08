/**
 * 전신 경과 — 사람 단위 화면. 부위 판정은 개수로만 요약하고(평균 점수를 만들지 않는다), 부위별 주간
 * 타임라인 아래에 가려움(0~10 설문 → 100점 환산)·수면(0~100)·루틴 이행을 **같은 주 칸(같은 날짜축)** 위에 놓는다.
 *
 * 부위 그래프와 겹치지 않으니 잘못된 인과를 암시하지 않으면서도 시기는 한눈에 비교된다.
 * 칸 값은 그 주의 마지막 유효 촬영 판정이고, 촬영이 없으면 점선 빈 칸이다.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { monitoringColors as mc, monitoringCard } from '../theme';
import { baseIndexOf, folderVerdict, recordVerdict, TONE, DAY_MS, md } from '../progress';
import { overallOfFolders } from '../easi';
import { DISPLAY_SCALE } from '../theme';
import { useProfile } from '../../context/ProfileContext';
import { useRoutines } from '../../context/RoutineContext';

const WEEKS = 8;
const LABEL_W = 62;
const ROUTINE_NAMES = ['BT4 Complex', '음압 패치'];
const CHART_H = 64;

function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 칸 하나의 모양 — 판정 색 / 기준일(테두리만) / 기록 없음(점선) */
function Cell({ kind, size }) {
  const base = { width: size, height: 22, borderRadius: 5, borderWidth: 1 };
  if (kind === 'none') return <View style={[base, { borderStyle: 'dashed', borderColor: '#DADDE2' }]} />;
  if (kind === 'base') return <View style={[base, { backgroundColor: '#fff', borderColor: '#9AA0A8' }]} />;
  if (kind === 'pending') return <View style={[base, { backgroundColor: '#fff', borderColor: '#DADDE2' }]} />;
  const t = TONE[kind];
  return <View style={[base, { backgroundColor: t.bg, borderColor: t.border }]} />;
}

export default function WholeBodyTimeline({ sites, onOpenSite }) {
  const { healthConnected } = useProfile();
  const { adherenceRate } = useRoutines();
  const [w, setW] = useState(0);
  const colW = w > 0 ? (w - LABEL_W) / WEEKS : 0;
  const cellW = Math.max(8, colW - 4);

  const weeks = useMemo(() => {
    const end = startOfDay(Date.now()) + DAY_MS; // 오늘 끝(배타)
    return Array.from({ length: WEEKS }, (_, i) => {
      const to = end - (WEEKS - 1 - i) * 7 * DAY_MS;
      return { from: to - 7 * DAY_MS, to };
    });
  }, []);

  const rows = useMemo(
    () =>
      sites.map((site) => {
        const folder = site.folder;
        const baseIdx = baseIndexOf(folder);
        const cells = weeks.map((wk) => {
          let idx = -1;
          folder.records.forEach((r, i) => { if (i >= baseIdx && r.ts >= wk.from && r.ts < wk.to) idx = i; });
          if (idx < 0) return 'none';
          if (!site.gradable) return 'pending';
          if (idx === baseIdx) return 'base';
          const v = recordVerdict(folder.records, baseIdx, idx);
          return v ?? 'pending';
        });
        return { site, cells };
      }),
    [sites, weeks],
  );

  const counts = useMemo(() => {
    const c = { better: 0, same: 0, worse: 0, n: 0 };
    sites.forEach((s) => {
      if (!s.gradable) return;
      const v = folderVerdict(s.folder);
      if (!v) return;
      c.n += 1;
      c[v] += 1;
    });
    return c;
  }, [sites]);

  // 피부 종합 점수 — 부위 점수를 가중 합산한 값(easi.ts). 면적 점수 같은 내부 값은 화면에 내지 않는다
  const overall = useMemo(() => {
    const groupByFolder = new Map(sites.map((x) => [x.folderId, x.group]));
    const r = overallOfFolders(sites.map((x) => x.folder), (f) => groupByFolder.get(f.id));
    return r;
  }, [sites]);

  // 주별 가려움(0~10, 높을수록 가려움)·수면 평균 — 사람 단위라 모든 부위의 기록을 한데 모은다
  const weekly = useMemo(() => {
    const all = sites.flatMap((s) => s.folder.records);
    return weeks.map((wk) => {
      const rs = all.filter((r) => r.ts >= wk.from && r.ts < wk.to);
      const avg = (key) => {
        const vals = rs.map((r) => r[key]).filter((v) => typeof v === 'number');
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      const itchVas = avg('itchVas');
      return { itch: itchVas == null ? null : DISPLAY_SCALE.itch(itchVas), sleep: avg('sleepScore') };
    });
  }, [sites, weeks]);

  const routineRows = useMemo(
    () =>
      ROUTINE_NAMES.map((name) => ({
        name,
        rates: weeks.map((wk) => adherenceRate(name, new Date(wk.from), new Date(wk.to - DAY_MS))),
      })).filter((r) => r.rates.some((v) => v != null)),
    [weeks, adherenceRate],
  );

  const xAt = (i) => LABEL_W + (i + 0.5) * colW;
  const line = (key, max, color) => {
    // 값이 없는 주에서 선을 끊는다 — 없는 값을 이어 그리지 않는다
    const segs = [];
    let cur = [];
    weekly.forEach((wk, i) => {
      const v = wk[key];
      if (v == null) { if (cur.length) segs.push(cur); cur = []; return; }
      cur.push([xAt(i), 6 + (1 - Math.min(1, v / max)) * (CHART_H - 12)]);
    });
    if (cur.length) segs.push(cur);
    return segs.map((pts, i) => (
      <React.Fragment key={i}>
        {pts.length > 1 && <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
        {pts.map((p, j) => <Circle key={j} cx={p[0]} cy={p[1]} r={3} fill={color} stroke="#fff" strokeWidth={1} />)}
      </React.Fragment>
    ));
  };

  return (
    <View style={[monitoringCard(), styles.card]} onLayout={(e) => setW(e.nativeEvent.layout.width - 32)}>
      <Text style={styles.eyebrow}>전신 경과 (사람 단위)</Text>
      <Text style={styles.summary}>
        부위 {counts.n}곳{counts.n > 0 && (
          <>  <Text style={{ color: TONE.better.dot }}>개선 {counts.better}</Text>
            {' · '}비슷 {counts.same}{' · '}
            <Text style={{ color: TONE.worse.dot }}>악화 {counts.worse}</Text></>
        )}
      </Text>

      <View style={styles.overallBox}>
        <Text style={styles.overallLabel}>피부 종합 점수</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Text style={styles.overallValue}>
            {overall.value == null ? '-' : overall.value}<Text style={styles.overallUnit}> /100</Text>
          </Text>
        </View>
      </View>

      {w > 0 && (
        <>
          <View style={styles.weekHead}>
            <View style={{ width: LABEL_W }} />
            {weeks.map((wk, i) => (
              <Text key={i} style={[styles.weekText, { width: colW }]} numberOfLines={1}>{md(wk.from)}</Text>
            ))}
          </View>

          {rows.map(({ site, cells }) => (
            <TouchableOpacity key={site.folderId} style={styles.row} activeOpacity={0.7} onPress={() => onOpenSite(site.folderId)}>
              <Text style={[styles.rowLabel, { width: LABEL_W }]} numberOfLines={1}>{site.label}</Text>
              {cells.map((k, i) => (
                <View key={i} style={{ width: colW, alignItems: 'center' }}><Cell kind={k} size={cellW} /></View>
              ))}
            </TouchableOpacity>
          ))}

          <Text style={styles.blockTitle}>가려움 안정도 <Text style={styles.blockSub}>0~100 · 높을수록 안정</Text></Text>
          <View style={{ width: w, height: CHART_H }}>
            <Svg width={w} height={CHART_H}>
              <Line x1={LABEL_W} y1={CHART_H - 1} x2={w} y2={CHART_H - 1} stroke={mc.line} />
              {line('itch', 100, '#D9694F')}
            </Svg>
          </View>

          {healthConnected && (
            <>
              <Text style={styles.blockTitle}>수면 <Text style={styles.blockSub}>점수</Text></Text>
              <View style={{ width: w, height: CHART_H }}>
                <Svg width={w} height={CHART_H}>
                  <Line x1={LABEL_W} y1={CHART_H - 1} x2={w} y2={CHART_H - 1} stroke={mc.line} />
                  {line('sleep', 100, '#3F7BE0')}
                </Svg>
              </View>
            </>
          )}

          {routineRows.length > 0 && <Text style={styles.blockTitle}>루틴 이행</Text>}
          {routineRows.map((r) => (
            <View key={r.name} style={styles.row}>
              <Text style={[styles.rowLabel, { width: LABEL_W }]} numberOfLines={1}>{r.name.split(' ')[0]}</Text>
              {r.rates.map((v, i) => (
                <View key={i} style={{ width: colW, alignItems: 'center' }}>
                  {v == null
                    ? <Cell kind="none" size={cellW} />
                    : <View style={{ width: cellW, height: 22, borderRadius: 5, backgroundColor: mc.greenTop, opacity: 0.25 + 0.75 * v }} />}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.legend}>
            {[['better', '개선'], ['same', '비슷'], ['worse', '악화']].map(([k, t]) => (
              <View key={k} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: TONE[k].bg, borderColor: TONE[k].border }]} /><Text style={styles.legendText}>{t}</Text></View>
            ))}
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#fff', borderColor: '#9AA0A8' }]} /><Text style={styles.legendText}>기준일</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { borderStyle: 'dashed', borderColor: '#DADDE2' }]} /><Text style={styles.legendText}>기록 없음</Text></View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  eyebrow: { fontSize: 11.5, color: mc.sub, fontWeight: '600' },
  summary: { fontSize: 17, fontWeight: '800', color: mc.ink, marginTop: 2, marginBottom: 12 },
  overallBox: { backgroundColor: '#F6F8FA', borderRadius: 12, padding: 12, marginBottom: 14 },
  overallLabel: { fontSize: 11.5, color: mc.sub, fontWeight: '700' },
  overallValue: { fontSize: 28, fontWeight: '800', color: mc.greenMuted, marginTop: 2 },
  overallUnit: { fontSize: 12, color: mc.sub, fontWeight: '600' },
  weekHead: { flexDirection: 'row', marginBottom: 6 },
  weekText: { fontSize: 10, color: mc.sub, textAlign: 'center', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  rowLabel: { fontSize: 12, fontWeight: '700', color: mc.ink },
  blockTitle: { fontSize: 13, fontWeight: '800', color: mc.ink, marginTop: 16, marginBottom: 4 },
  blockSub: { fontSize: 10.5, fontWeight: '600', color: mc.sub },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendText: { fontSize: 10.5, color: mc.sub },
});
