/**
 * 질환 경과 관찰 화면(DiseaseFolderScreen)의 카드들 — 디자인 시안 그대로.
 *
 *   SkinStatusCard  : 피부 종합 상태 꺾은선. 배경에 4단계 띠(좋음·주의·나쁨·매우 나쁨), 첫·마지막 값 표시
 *   AreaChangeCard  : 병변 넓이 변화 — 첫 촬영(기준일) 대비 %. 0 기준선 · 오차 범위 띠 · 마지막 값 표시
 *   PhotoStrip      : 회차 사진 줄. 비교 모드면 두 장(A·B)을 고른다
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { monitoringColors as mc, monitoringCard, DISPLAY_SCALE, SKIN_SEGMENTS, CHART_SERIES, BARRIER_SERIES } from '../theme';
import { areaTrendOf, fmtPct } from '../areaTrend';
import LesionThumb from './LesionThumb';

const DISEASE_ICON = require('../../../assets/icon/disease_icon_white.png');
const BARRIER_ICON = require('../../../assets/icon/barrier_icon_white.png');

const md = (dateKey) => {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}/${d}`;
};

/** 고른 두 회차 중 이른 쪽 A, 늦은 쪽 B */
export function pickLetters(records, picks) {
  const sorted = [...picks].sort(
    (a, b) => records.findIndex((r) => r.id === a) - records.findIndex((r) => r.id === b),
  );
  return (id) => (sorted[0] === id ? 'A' : sorted[1] === id ? 'B' : null);
}

/** 카드 머리줄 — 제목 + 오른쪽 자리(버튼이나 보조 글씨) */
export function CardHead({ title, right, icon, iconColor }) {
  return (
    <View style={styles.head}>
      <View style={styles.headLeft}>
        {icon && (
          <View style={[styles.headIcon, { backgroundColor: iconColor }]}>
            <Image source={icon} style={{ width: 14, height: 14 }} resizeMode="contain" />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/* ───────────────────────── 공통: 가로 스크롤 그래프 ───────────────────────── */

/** 회차 하나가 차지하는 최소 폭 — 날짜·사진이 겹치지 않는 폭. 다 안 들어가면 가로 스크롤 */
const MIN_STEP = 54;
/** 왼쪽 고정 칸(세로축 글씨) — 두 그래프가 같은 값을 써야 회차 칸이 위아래로 맞는다 */
const AXIS_W = 34;
const PAD_X = 16;
const DATE_ROW_H = 18;

/**
 * 두 그래프(피부 질환 · 병변 넓이)의 가로 스크롤을 함께 움직인다. 한쪽을 밀면 다른 쪽도 같은 자리로.
 * 각 스크롤의 마지막 위치를 기억해 두고, 다른 값일 때만 옮겨서 서로 되부르는 고리를 막는다.
 */
export function useScrollSync() {
  const refs = useRef({});
  const xs = useRef({});
  return (key) => ({
    ref: (r) => {
      refs.current[key] = r;
    },
    scrollEventThrottle: 16,
    onScroll: (e) => {
      const x = e.nativeEvent.contentOffset.x;
      xs.current[key] = x;
      Object.keys(refs.current).forEach((k) => {
        if (k === key || !refs.current[k]) return;
        if (Math.abs((xs.current[k] ?? -1) - x) > 1) {
          xs.current[k] = x;
          refs.current[k].scrollTo({ x, animated: false });
        }
      });
    },
  });
}

/**
 * 회차 칸 배치 — 두 그래프와 사진 줄이 **같은 식**을 써야 같은 회차가 위아래로 한 줄에 선다.
 * viewW는 왼쪽 축 칸을 뺀 스크롤 영역 폭(세 카드가 같은 폭·같은 여백이라 값도 같다).
 */
function columnsOf(n, viewW) {
  const step = n > 1 ? Math.max(MIN_STEP, (viewW - PAD_X * 2) / (n - 1)) : 0;
  return {
    step,
    contentW: n > 1 ? PAD_X * 2 + step * (n - 1) : viewW,
    x: (i) => (n > 1 ? PAD_X + i * step : viewW / 2),
  };
}

/** 가로 스크롤 하나 — 처음 열면 가장 최근(오른쪽 끝)이 보이게, 다른 스크롤들과 함께 움직인다 */
/**
 * showBar: 스크롤바를 보일지. 함께 움직이는 스크롤이 여럿이면 바는 **하나만**(맨 아래 사진 줄) 보인다 —
 * 어느 것을 밀어도 다 같이 움직이므로 바가 여러 개일 이유가 없다. 혼자 쓰는 그래프(피부 장벽)는 보인다.
 */
function SyncedScroll({ sync, children, showBar = !sync }) {
  const scrolled = useRef(false);
  const own = useRef(null);
  const syncProps = sync ?? {};
  return (
    <ScrollView
      horizontal
      // 웹(PC 브라우저)에서는 마우스로 끌어 넘길 수 없어서 스크롤바를 보여 줘야 옆으로 옮길 수 있다
      showsHorizontalScrollIndicator={showBar}
      contentContainerStyle={showBar ? { paddingBottom: 10 } : undefined}
      {...syncProps}
      ref={(r) => {
        own.current = r;
        syncProps.ref?.(r);
      }}
      onContentSizeChange={() => {
        if (scrolled.current) return;
        scrolled.current = true;
        own.current?.scrollToEnd({ animated: false });
      }}
    >
      {children}
    </ScrollView>
  );
}

/**
 * 가로 스크롤 그래프 틀 — 왼쪽 고정 축 칸 + 스크롤되는 그림(모든 날짜 포함).
 * 처음 열면 가장 최근(오른쪽 끝)이 보이게 한다. 비교 중에는 회차 칸을 눌러 고른다.
 */
function ScrollChart({ records, height, axis, plot, compare, picks = [], onTogglePick, sync, selectedId, onSelect }) {
  const [viewW, setViewW] = useState(0);
  const { step, contentW, x } = columnsOf(records.length, viewW);
  const colW = Math.max(16, Math.min(34, (step || MIN_STEP) * 0.7));
  const letterOf = pickLetters(records, picks);

  return (
    <View style={{ flexDirection: 'row', marginTop: 8 }}>
      <View style={{ width: AXIS_W, height }}>{axis}</View>
      <View style={{ flex: 1 }} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
        {viewW > 0 && (
          <SyncedScroll sync={sync}>
            <View style={{ width: contentW }}>
              <Svg width={contentW} height={height}>
                {/* 비교로 고른 날짜 — 그 칸을 위아래로 초록 띠로 칠한다 */}
                {/* 비교가 아닐 때 고른 날짜 하나(onSelect를 쓰는 화면 — 피부 장벽)도 같은 띠로 */}
                {records.map((r, i) =>
                    (compare ? letterOf(r.id) : onSelect && r.id === selectedId) ? (
                      <Rect key={`sel-${r.id}`} x={x(i) - colW / 2} y={2} width={colW} height={height - 4} rx={6} fill={mc.greenTop} opacity={0.35} />
                    ) : null,
                  )}
                {plot({ x, width: contentW, letterOf })}
              </Svg>
              {/* 모든 날짜 */}
              <View style={{ height: DATE_ROW_H, marginTop: 4 }}>
                {records.map((r, i) => {
                  const on = compare ? letterOf(r.id) : onSelect && r.id === selectedId;
                  return (
                    <Text key={r.id} style={[styles.axisDate, { left: x(i) - 22 }, on && styles.axisDateOn]}>
                      {md(r.date)}
                    </Text>
                  );
                })}
              </View>
              {/* 비교 중 — 회차 칸 전체(날짜 포함)를 눌러 고른다 */}
              {(compare || onSelect) &&
                records.map((r, i) => (
                  <TouchableOpacity
                    key={`tap-${r.id}`}
                    activeOpacity={0.6}
                    onPress={() => (compare ? onTogglePick?.(r.id) : onSelect(r))}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: x(i) - step / 2, width: step || MIN_STEP }}
                  />
                ))}
            </View>
          </SyncedScroll>
        )}
      </View>
    </View>
  );
}

/**
 * 두 그래프(피부 질환 · 병변 넓이)의 그림 높이 — **같은 크기**로 고정한다. 비교를 켜도(안내 띠·아래 바)
 * 한 페이지 안에 들어오는 높이다.
 */
const GRAPH_H = 104;

/** 고른 점 — 검정 원 + A/B */
function PickDot({ cx, cy, letter }) {
  return (
    <>
      <Circle cx={cx} cy={cy} r={8.5} fill={mc.ink} />
      <SvgText x={cx} y={cy + 3.8} fontSize={10.5} fontWeight="900" fill="#FFFFFF" textAnchor="middle">
        {letter}
      </SvgText>
    </>
  );
}

/* ───────────────────────── 피부 질환 ───────────────────────── */

const SKIN_PAD_T = 18;
const SKIN_PAD_B = 6;
/** 띠 왼쪽 단계 이름 — "매우 나쁨"은 칸이 좁아 시안처럼 "매우"로 줄인다 */
const SHORT_LEVEL = { '매우 나쁨': '매우', 나쁨: '나쁨', 주의: '주의', 좋음: '좋음' };

/**
 * 단계 띠 위의 꺾은선 카드 — 피부 질환과 피부 장벽이 **같은 모양**을 쓴다.
 * bands: [{ from, to, ko, color }] (값 범위·단계 이름·색), values: 회차별 값(없으면 null — 점 없이 건너뜀).
 */
function LevelTrendCard({
  title, icon, color, records, values, bands = [], ticks, yMin = 0, yMax = 100, right, style,
  compare = false, picks = [], onTogglePick, sync, selectedId, onSelect,
}) {
  const H = GRAPH_H;
  const y = (v) => SKIN_PAD_T + (1 - Math.min(1, Math.max(0, (v - yMin) / (yMax - yMin)))) * (H - SKIN_PAD_T - SKIN_PAD_B);
  const idx = values.map((v, i) => (v == null ? null : i)).filter((i) => i != null);
  const first = idx[0];
  const last = idx[idx.length - 1];

  return (
    <View style={[monitoringCard(), styles.card, style]}>
      <CardHead title={title} icon={icon} iconColor={color} right={right} />
      <ScrollChart
        records={records}
        height={H}
        compare={compare}
        picks={picks}
        onTogglePick={onTogglePick}
        sync={sync}
        selectedId={selectedId}
        onSelect={onSelect}
        axis={
          ticks
            ? // 단계가 없는 지표(피부 장벽)는 왼쪽에 숫자 눈금만
              ticks.map((t) => (
                <Text key={t} style={[styles.levelLabel, styles.axisNum, { top: y(t) - 7 }]}>
                  {t}
                </Text>
              ))
            : bands.map((b) => (
                <Text key={b.ko} style={[styles.levelLabel, { top: (y(b.to) + y(b.from)) / 2 - 7 }]}>
                  {SHORT_LEVEL[b.ko] ?? b.ko}
                </Text>
              ))
        }
        plot={({ x, width, letterOf }) => (
          <>
            {ticks?.map((t) => (
              <Line key={`g${t}`} x1={0} x2={width} y1={y(t)} y2={y(t)} stroke={mc.line} strokeWidth={1} />
            ))}
            {/* 단계 띠 — 0.16이면 나쁨(주황)과 매우 나쁨(빨강)이 같은 분홍으로 보여서 0.3 */}
            {bands.map((b) => (
              <Rect key={b.ko} x={0} y={y(b.to)} width={width} height={y(b.from) - y(b.to)} fill={b.color} opacity={0.3} />
            ))}
            {idx.length > 1 && (
              <Polyline
                points={idx.map((i) => `${x(i)},${y(values[i])}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinejoin="round"
              />
            )}
            {idx.map((i) => {
              const v = values[i];
              const letter = compare ? letterOf(records[i].id) : null;
              if (letter) return <PickDot key={records[i].id} cx={x(i)} cy={y(v)} letter={letter} />;
              const sel = !compare && onSelect && records[i].id === selectedId;
              // 고른 날짜가 있으면 그 점, 없으면(질환 화면 — 누르면 상세로 넘어간다) 가장 최근 점을 채운다
              const end = !compare && (selectedId != null ? sel : i === last);
              return (
                <Circle key={records[i].id} cx={x(i)} cy={y(v)} r={end ? 5 : 4} fill={end ? color : '#FFFFFF'} stroke={color} strokeWidth={2} />
              );
            })}
            {/* 첫 값과 마지막 값만 숫자로 (비교 중엔 A/B가 대신한다) */}
            {!compare &&
              [first, last]
                .filter((i, k, a) => i != null && a.indexOf(i) === k)
                .map((i) => (
                  <SvgText
                    key={`v${i}`}
                    x={x(i)}
                    y={y(values[i]) - 9}
                    fontSize={12}
                    fontWeight={i === last ? '800' : '600'}
                    fill={i === last ? mc.ink : mc.sub}
                    textAnchor="middle"
                  >
                    {Math.round(values[i])}
                  </SvgText>
                ))}
          </>
        )}
      />
    </View>
  );
}

/** SKIN_SEGMENTS(나쁜 쪽부터, 위 경계 to만 있음) → 띠 목록 */
const SKIN_BANDS = SKIN_SEGMENTS.map((s, i) => ({ ...s, from: i === 0 ? 0 : SKIN_SEGMENTS[i - 1].to }));

export function SkinStatusCard({ records, ...rest }) {
  return (
    <LevelTrendCard
      title="피부 질환"
      icon={DISEASE_ICON}
      color={CHART_SERIES.skin.color}
      records={records}
      values={records.map((r) => DISPLAY_SCALE.iga(r.iga))}
      bands={SKIN_BANDS}
      {...rest}
    />
  );
}

/** 피부 장벽 총점(50~100) 눈금 — 장벽은 좋음/나쁨 단계가 없어 색 띠 없이 숫자만 */
const BARRIER_TICKS = [50, 60, 70, 80, 90, 100];

export function BarrierScoreCard({ records, ...rest }) {
  return (
    <LevelTrendCard
      title="피부 장벽"
      icon={BARRIER_ICON}
      color={BARRIER_SERIES.color}
      records={records}
      values={records.map((r) => (r.skinScan?.totalScore != null ? r.skinScan.totalScore : null))}
      ticks={BARRIER_TICKS}
      yMin={50}
      yMax={100}
      {...rest}
    />
  );
}

/* ───────────────────────── 병변 넓이 변화 ───────────────────────── */

const AREA_PAD = 12;
const AREA_LINE = '#3A3F47';

/**
 * 첫 촬영(기준일) 대비 넓이 %. 회차 칸은 위 피부 질환 그래프와 **같은 자리**에 둔다 —
 * 넓이를 못 잰 회차는 칸만 있고 점이 없다. 잰 회차가 2회 미만이면 null.
 */
export function AreaChangeCard({ records, compare = false, picks = [], onTogglePick, sync, style, selectedId, onSelect }) {
  const AREA_H = GRAPH_H;
  const series = areaTrendOf(records || []);
  if (!series || series.points.length < 2) return null;
  const { points } = series;
  const idxOf = (p) => records.indexOf(p.record);
  const deltas = points.map((p) => p.delta);
  /*
    세로 범위 — 0(기준일)을 **가운데** 두고 ±10% 고정, 눈금은 5% 간격(±5 · ±10).
    범위를 넘는 값은 끝선에 붙여 그린다(그림 밖으로 나가지 않게).
  */
  const top = 0.1;
  const bottom = -0.1;
  const ticks = [0.1, 0.05, 0, -0.05, -0.1];
  const pctLabel = (v) => (v === 0 ? '0' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`);
  const y = (v) =>
    AREA_PAD + ((top - Math.min(top, Math.max(bottom, v))) / (top - bottom)) * (AREA_H - AREA_PAD * 2);
  const lastP = points[points.length - 1];

  return (
    <View style={[monitoringCard(), styles.card, style]}>
      <CardHead title="병변 넓이 변화" right={<Text style={styles.headSub}>기준일 대비 %</Text>} />
      <ScrollChart
        records={records}
        height={AREA_H}
        compare={compare}
        picks={picks}
        onTogglePick={onTogglePick}
        sync={sync}
        selectedId={selectedId}
        onSelect={onSelect}
        axis={
          <>
            {ticks.map((t) => (
              <Text key={t} style={[styles.levelLabel, styles.axisNum, { top: y(t) - 7 }]}>
                {pctLabel(t)}
              </Text>
            ))}
          </>
        }
        plot={({ x, width, letterOf }) => (
          <>
            {/* 눈금선 — 0은 진하게, 나머지 네 줄은 옅게 */}
            {ticks.map((t) => (
              <Line key={t} x1={0} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? mc.sub : mc.line} strokeWidth={1} opacity={t === 0 ? 0.6 : 1} />
            ))}
            <Polyline
              points={points.map((p) => `${x(idxOf(p))},${y(p.delta)}`).join(' ')}
              fill="none"
              stroke={AREA_LINE}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {points.map((p) => {
              const letter = compare ? letterOf(p.record.id) : null;
              const cx = x(idxOf(p));
              const cy = y(p.delta);
              if (letter) return <PickDot key={p.record.id} cx={cx} cy={cy} letter={letter} />;
              return p === lastP && !compare ? <Circle key={p.record.id} cx={cx} cy={cy} r={4.5} fill={AREA_LINE} /> : null;
            })}
            {!compare && (
              <SvgText
                x={x(idxOf(lastP))}
                y={y(lastP.delta) + (y(lastP.delta) > AREA_H - 24 ? -10 : 18)}
                fontSize={12}
                fontWeight="800"
                fill={mc.ink}
                textAnchor="end"
              >
                {fmtPct(lastP.delta)}
              </SvgText>
            )}
          </>
        )}
      />
    </View>
  );
}

/* ───────────────────────── 사진 줄 ───────────────────────── */

/**
 * 회차 사진 줄 — 위 그래프들과 **같은 회차 칸**에 사진을 하나씩 세우고, 가로 스크롤도 함께 움직인다.
 * compare가 꺼져 있으면 사진을 누르면 확대(onOpen), 켜져 있으면 두 장을 고른다 — A(이른 날)·B(늦은 날).
 */
export function PhotoStrip({ records, compare, picks, onTogglePick, onOpen, right, sync, selectedId }) {
  const [viewW, setViewW] = useState(0);
  const { step, contentW, x } = columnsOf(records.length, viewW);
  const thumb = Math.round(Math.min(56, (step || MIN_STEP) - 8));
  const letterOf = pickLetters(records, picks);

  return (
    <View style={[monitoringCard(), styles.card]}>
      <CardHead title="촬영 사진" right={right} />
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        {/* 그래프의 왼쪽 축 칸만큼 비워 두어 회차 칸을 맞춘다 */}
        <View style={{ width: AXIS_W }} />
        <View style={{ flex: 1 }} onLayout={(e) => setViewW(e.nativeEvent.layout.width)}>
          {viewW > 0 && (
            <SyncedScroll sync={sync} showBar>
              <View style={{ width: contentW, height: thumb + 30 }}>
                {records.map((r, i) => {
                  const letter = compare ? letterOf(r.id) : null;
                  // 상세를 보고 있는 날짜 — 비교가 아닐 때 초록 테두리
                  const sel = !compare && r.id === selectedId;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      activeOpacity={0.8}
                      onPress={() => (compare ? onTogglePick(r.id) : onOpen(r))}
                      style={[styles.thumbCol, { left: x(i) - thumb / 2, width: thumb, top: 6 }]}
                    >
                      <View style={[styles.thumbWrap, letter && styles.thumbPicked, sel && styles.thumbSelected]}>
                        <LesionThumb photo={r.photo} mode="photo" size={thumb - 4} />
                      </View>
                      {compare && (
                        <View style={[styles.pick, letter && styles.pickOn]}>
                          {letter && <Text style={styles.pickText}>{letter}</Text>}
                        </View>
                      )}
                      <Text style={[styles.thumbDate, (letter || sel) && styles.thumbDateOn]}>{md(r.date)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SyncedScroll>
          )}
        </View>
      </View>
    </View>
  );
}

/** 비교 모드 아래 바 — 고른 두 날짜 + 비교하기 */
export function CompareBar({ records, picks, onCompare, bottomInset = 0 }) {
  const sorted = records.filter((r) => picks.includes(r.id));
  const ready = sorted.length === 2;
  return (
    <View style={[styles.bar, { paddingBottom: 10 + bottomInset }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.barLabel}>A · B</Text>
        <Text style={styles.barDates}>
          {ready ? `${md(sorted[0].date)} ↔ ${md(sorted[1].date)}` : '사진 두 장을 골라 주세요'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.barBtn, !ready && { opacity: 0.4 }]}
        disabled={!ready}
        onPress={onCompare}
        activeOpacity={0.85}
      >
        <Text style={styles.barBtnText}>비교하기</Text>
      </TouchableOpacity>
    </View>
  );
}

/** 비교 모드 맨 위 안내 띠 — 몇 개 골랐는지 + 취소 */
export function CompareBanner({ count, onCancel }) {
  return (
    <View style={styles.banner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle}>비교할 날짜 2개를 고르세요</Text>
        <Text style={styles.bannerSub}>그래프 점이나 사진을 누르세요 · {count}/2 선택됨</Text>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={8}>
        <Text style={styles.bannerCancel}>취소</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, backgroundColor: mc.ink,
  },
  bannerTitle: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
  bannerSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bannerCancel: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  card: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 },
  title: { fontSize: 16, fontWeight: '800', color: mc.ink },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headSub: { fontSize: 12, color: mc.sub },
  axisDate: { position: 'absolute', width: 44, textAlign: 'center', fontSize: 10.5, color: mc.sub },
  axisDateOn: { color: mc.ink, fontWeight: '800' },
  levelLabel: { position: 'absolute', left: 0, fontSize: 10.5, fontWeight: '600', color: mc.sub },
  axisNum: { right: 4, left: undefined, textAlign: 'right', fontSize: 9.5 },

  thumbCol: { position: 'absolute', alignItems: 'center' },
  thumbWrap: { borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbPicked: { borderColor: mc.ink },
  thumbSelected: { borderColor: mc.greenTop },
  pick: {
    position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#C9CDD3', alignItems: 'center', justifyContent: 'center',
  },
  pickOn: { backgroundColor: mc.ink, borderColor: mc.ink },
  pickText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  thumbDate: { fontSize: 11, color: mc.sub, marginTop: 4 },
  thumbDateOn: { color: mc.ink, fontWeight: '800' },

  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 10, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: -2 }, elevation: 8,
  },
  barLabel: { fontSize: 11.5, color: mc.sub, fontWeight: '600' },
  barDates: { fontSize: 16, fontWeight: '800', color: mc.ink, marginTop: 2 },
  barBtn: { paddingHorizontal: 22, height: 44, borderRadius: 14, backgroundColor: mc.greenTop, alignItems: 'center', justifyContent: 'center' },
  barBtnText: { fontSize: 15, fontWeight: '800', color: '#143006' },
});
