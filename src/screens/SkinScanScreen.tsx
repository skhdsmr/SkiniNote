import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import MonitorCaptureScreen from './MonitorCaptureScreen';
import type { MonitorTarget } from '../monitoring/types';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { AppColors, cardDecoration } from '../theme';
import { useProfile } from '../context/ProfileContext';
import { analyzeSkin, Band, LevelItem, MetricResult, SkinScanResult, TotalItem, topPctText, totalTopPct } from '../skinScan/api';
import { BARRIER_SERIES } from '../folders/theme';
import { CardIcon, CardIconSpec } from '../components/MetricCard';

const BARRIER_ICON = require('../../assets/icon/barrier_icon_white.png');

/**
 * 피부장벽진단 — 얼굴 정면 사진 한 장으로 주름·모공·수분량을 잰다.
 *
 *   촬영(또는 앨범) → 서버 업로드 → MediaPipe로 7개 부위 crop → QuadTree 모델 3개 → 결과
 *
 * 결과 화면은 원본 사진 위에 모델이 본 crop 박스를 겹쳐 보여주고, 그 아래 지표별 점수를 나열한다.
 * 추론은 서버에서 한다(src/skinScan/api.ts) — 기록으로 남기지 않는 한 번짜리 스캔이다.
 */

type Phase = 'camera' | 'analyzing' | 'result' | 'error';

/** 서버로 보내는 사진의 가로 폭 — 부위 crop은 어차피 224px로 줄어든다 */
const UPLOAD_WIDTH = 1500;

export const BAND_COLORS: Record<Band, string> = {
  good: AppColors.sev0,
  normal: AppColors.sev1,
  caution: '#F2A33C',
  care: AppColors.sev3,
};

/** 사진 위 crop 박스 색 — 부위 구분 없이 하나로 그린다 */
const BOX_COLOR = AppColors.greenTop;

/**
 * 얼굴 사진 한 장 → 피부 장벽 분석 (서버). 바로 스캔과 신규 증상 기록이 같이 쓴다.
 * EXIF 방향을 픽셀에 굽고 크기를 줄여 보낸다 — 서버가 돌려주는 박스 좌표가 이 이미지 기준이다.
 */
export async function analyzeFaceScan(
  rawUri: string,
  age?: number,
): Promise<{ photo: { uri: string; width: number; height: number }; result: SkinScanResult }> {
  const photo = await manipulateAsync(rawUri, [{ resize: { width: UPLOAD_WIDTH } }], {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  return { photo, result: await analyzeSkin(photo.uri, age) };
}

export default function SkinScanScreen({ onExit }: { onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const { body } = useProfile();
  const [phase, setPhase] = useState<Phase>('camera');
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [result, setResult] = useState<SkinScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (rawUri: string) => {
      setPhase('analyzing');
      setError(null);
      try {
        const scanned = await analyzeFaceScan(rawUri, body.age);
        setPhoto(scanned.photo);
        setResult(scanned.result);
        setPhase('result');
      } catch (e: any) {
        setError(e?.message ?? '알 수 없는 오류가 발생했어요');
        setPhase('error');
      }
    },
    [body.age],
  );

  if (phase === 'camera') {
    return (
      <MonitorCaptureScreen
        target={FACE_SCAN_TARGET}
        source="camera"
        measureArea={false}
        initialFacing="front"
        faceGuide
        onCancel={onExit}
        onComplete={(processedUri) => run(processedUri)}
      />
    );
  }

  if (phase === 'result' && photo && result) {
    return <SkinScanResultPage photo={photo} result={result} onClose={onExit} onRetake={() => setPhase('camera')} />;
  }

  return (
    <View style={styles.dark}>
      {phase === 'analyzing' ? (
        <>
          <ActivityIndicator size="large" color={AppColors.greenTop} />
          <View style={{ height: 18 }} />
          <Text style={styles.darkTitle}>피부 상태를 분석하는 중...</Text>
          <View style={{ height: 8 }} />
          <Text style={styles.darkSub}>얼굴 부위를 나누고 주름·모공·수분량을 측정하고 있어요</Text>
        </>
      ) : (
        <>
          <MaterialIcons name="error-outline" size={36} color="#FF6B6B" />
          <View style={{ height: 14 }} />
          <Text style={styles.darkTitle}>분석에 실패했어요</Text>
          <View style={{ height: 8 }} />
          <Text style={styles.darkSub}>{error}</Text>
          <View style={{ height: 18 }} />
          <Pressable style={styles.primaryBtn} onPress={() => setPhase('camera')}>
            <Text style={styles.primaryBtnText}>다시 촬영하기</Text>
          </Pressable>
        </>
      )}
      <Pressable style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={onExit}>
        <MaterialIcons name="chevron-left" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/**
 * 피부장벽측정 촬영 대상 — 피부 질환 촬영과 **같은 촬영 화면**(MonitorCaptureScreen)을 쓰려고 만든
 * 임시 대상이다. 그 화면이 피부·초점·노출 판정, 자동 촬영, 음성 안내, 갤러리 버튼, 확인 화면을 모두
 * 갖고 있어서 두 촬영의 UI가 똑같아진다. 기록으로 남지 않는 한 번짜리 스캔이라 넓이는 재지 않는다.
 */
export const FACE_SCAN_TARGET: MonitorTarget = {
  id: 'tgt_skin_barrier_scan',
  modelId: 'adultMale',
  spotId: 'head:face',
  part: 'head',
  facing: 'front',
  label: '피부장벽측정',
  createdAt: new Date(),
  sessionCount: 0,
};

/** 사진 — 방금 찍은 파일({ uri }) 또는 기록에 남은 사진(덤프는 require 번호) */
type ScanPhoto = { uri: string } | number;

/**
 * 피부장벽진단 결과 페이지 — 홈 "피부 바로 스캔 → 피부 장벽 측정"의 결과 화면.
 * 기록 탭의 피부 장벽 기록 상세 결과도 이 페이지를 그대로 쓴다(그때는 subtitle에 날짜, 다시 촬영 없음).
 */
export function SkinScanResultPage({
  photo,
  result,
  subtitle,
  onClose,
  onRetake,
  action,
  top,
}: {
  photo: ScanPhoto;
  result: SkinScanResult;
  subtitle?: string;
  onClose: () => void;
  /** 없으면 "다시 촬영하기" 버튼을 그리지 않는다 (지난 기록) */
  onRetake?: () => void;
  /** 맨 아래 주 버튼 — 기록 흐름에서 "경과 보기"·"경과 폴더에 저장"처럼 다음 갈 곳 */
  action?: { label: string; onPress: () => void };
  /** 결과 맨 위에 얹는 칸 — 장벽 측정·기록에서 "지난 측정 대비" 변화 카드를 둔다 */
  top?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={onClose} hitSlop={8}>
          <MaterialIcons name="close" size={22} color={AppColors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>피부장벽진단 결과</Text>
          {subtitle != null && <Text style={styles.headerSub}>{subtitle}</Text>}
        </View>
        <View style={styles.headerBtn} />
      </View>
      <ScanResult photo={photo} result={result} onRetake={onRetake} action={action} top={top} />
    </View>
  );
}

function ScanResult({
  photo,
  result,
  onRetake,
  action,
  top,
}: {
  photo: ScanPhoto;
  result: SkinScanResult;
  onRetake?: () => void;
  action?: { label: string; onPress: () => void };
  top?: React.ReactNode;
}) {
  const [cardW, setCardW] = useState(0);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {top}
      <View style={[cardDecoration(), styles.card]} onLayout={(e) => setCardW(e.nativeEvent.layout.width - 32)}>
        <Text style={styles.cardTitle}>측정 부위</Text>
        {cardW > 0 && <PhotoWithBoxes photo={photo} result={result} width={cardW} />}
        <TotalScoreRow result={result} />
      </View>

      <ScanMetricsSection result={result} />

      {action && (
        <Pressable style={[styles.primaryBtn, { alignSelf: 'stretch', alignItems: 'center' }]} onPress={action.onPress}>
          <Text style={styles.primaryBtnText}>{action.label}</Text>
        </Pressable>
      )}
      {/* 다음 갈 곳(action)이 있으면 그게 주 버튼이고, 다시 촬영은 그 아래 보조 버튼으로 둔다 */}
      {onRetake && (
        <Pressable
          style={[action ? styles.secondaryBtn : styles.primaryBtn, { alignSelf: 'stretch', alignItems: 'center', marginTop: action ? 10 : 0 }]}
          onPress={onRetake}
        >
          <Text style={action ? styles.secondaryBtnText : styles.primaryBtnText}>다시 촬영하기</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/**
 * 결과의 지표 부분 — 레벨 상자(주름·모공) 줄, 수분량 상자, "한눈에 보기" 레이더 차트.
 * 스캔 직후 결과 화면과 경과 관찰 폴더 화면(날짜별 피부상태측정 결과)이 같이 쓴다.
 * 사진(PhotoWithBoxes)은 넣지 않는다 — 폴더 화면에는 그 회차의 얼굴 사진이 없다.
 */
export function ScanMetricsSection({ result }: { result: Pick<SkinScanResult, 'metrics' | 'ageGroup'> }) {
  return (
    <>
      <View style={styles.boxRow}>
        {result.metrics.flatMap((m) =>
          m.key === 'moisture' ? [] : (m.items ?? []).map((it) => <LevelBox key={it.key} metric={m.label} item={it} />),
        )}
      </View>
      {result.metrics
        .filter((m) => m.key === 'moisture')
        .map((m) => (
          <MoistureBox key={m.key} metric={m} />
        ))}

      <ScanRadarCard result={result} />
    </>
  );
}

/**
 * "한눈에 보기" 카드 하나 — 경과 관찰 화면은 피부 장벽 결과로 이 카드만 보여주고,
 * 레이더 가운데에 그날의 피부 장벽 총점(centerScore)을 적는다.
 */
export function ScanRadarCard({
  result,
  centerScore,
  title = '한눈에 보기',
  icon,
}: {
  result: Pick<SkinScanResult, 'metrics' | 'ageGroup'>;
  centerScore?: number | null;
  /** 카드 제목 — 경과 관찰 화면은 "피부 장벽" */
  title?: string;
  /** 제목 왼쪽 지표 아이콘 — 경과 관찰 화면은 피부 장벽 아이콘 */
  icon?: CardIconSpec;
}) {
  const [cardW, setCardW] = useState(0);
  return (
    <View style={[cardDecoration(), styles.card]} onLayout={(e) => setCardW(e.nativeEvent.layout.width - 32)}>
      <View style={styles.cardTitleRow}>
        {icon && <CardIcon {...icon} />}
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{title}</Text>
      </View>
      {cardW > 0 && <RadarChart result={result} width={cardW} centerScore={centerScore} />}
    </View>
  );
}

/** 받침이 있으면 a(이·과), 없으면 b(가·와) — 한글이 아니면 받침 없는 쪽 */
const josa = (word: string, a: string, b: string) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (c >= 0 && c <= 11171 && c % 28 !== 0 ? a : b);
};

/** 항목 -> 권하는 관리 (주름 두 항목은 하나로 합친다) */
const CARE_OF: Record<TotalItem['key'], string> = {
  forehead_glabella: '주름 관리',
  perocular: '주름 관리',
  cheek: '모공 관리',
  moisture: '보습',
};

/** 낱말 나열 — 둘이면 "A과 B", 셋 이상이면 "A, B, C" */
const listKo = (words: string[]) =>
  words.length === 2 ? `${josa(words[0], '과', '와')} ${words[1]}` : words.join(', ');

/**
 * 총점 옆 한마디 — 둘 다 서버가 기준 데이터(965명)의 같은 연령대 피험자와 실제로 비교한 값이다.
 *   첫 줄: totalTopPct — 같은 연령대 피험자들의 총점 중 내 총점이 상위 몇 %인지
 *   둘째 줄: totalItems의 z — 이마·미간 주름, 눈가 주름, 볼 모공, 수분량 각각이 연령대 평균
 *     이상(z ≥ 0)인지. 평균 아래 항목이 있으면 전부 알려주고 그 관리를 권한다.
 *     모두 평균 이상이면 넷 중 z가 가장 낮은 항목 하나를 짚는다.
 */
function totalComment(result: SkinScanResult): string[] {
  const lines: string[] = [];
  // 서버 값이 없으면(옛 기록·덤프) 같은 기준 분포로 앱에서 계산한다 — 서버 total_top_pct와 같은 식
  const topPct = result.totalTopPct ?? totalTopPct(result.totalScore, result.ageGroup);
  lines.push(`${result.ageGroup ? `같은 ${result.ageGroup}` : '전체 사용자'} 중 ${topPctText(topPct)}예요.`);
  // 서버가 보내는 순서(이마·미간 주름, 눈가 주름, 볼 모공, 수분량)를 그대로 쓴다
  const items = result.totalItems ?? [];
  if (items.length === 0) return lines;
  const below = items.filter((it) => it.z < 0);
  const lowest = items.reduce((a, b) => (b.z < a.z ? b : a));
  const focus = below.length > 0 ? below : [lowest];
  const subject = listKo(focus.map((it) => it.label));
  const care = listKo([...new Set(focus.map((it) => CARE_OF[it.key]))]);
  lines.push(
    below.length > 0
      ? `${josa(subject, '이', '가')} 또래 평균보다 낮아요. ${care}에 조금 더 신경 써 보세요.`
      : `모든 항목이 또래 평균 이상이에요. 그중 ${josa(subject, '이', '가')} 상대적으로 낮으니 ${care}에 신경 써 보세요.`,
  );
  return lines;
}

/** 사진 아래 — 왼쪽에 피부 장벽 아이콘과 총점, 오른쪽에 한마디 */
function TotalScoreRow({ result }: { result: SkinScanResult }) {
  const comment = totalComment(result);
  return (
    <View style={styles.totalRow}>
      <View style={styles.totalLeft}>
        <View style={[styles.totalIcon, { backgroundColor: BARRIER_SERIES.color }]}>
          <Image source={BARRIER_ICON} style={{ width: 22, height: 22 }} resizeMode="contain" />
        </View>
        <Text style={styles.totalLabel}>피부 장벽</Text>
        <Text style={styles.totalValue}>
          {result.totalScore}
          <Text style={styles.totalUnit}>점</Text>
        </Text>
      </View>
      {comment.length > 0 && (
        <View style={styles.totalCommentBox}>
          {comment.map((line, i) => (
            <Text key={i} style={[styles.totalComment, i === 0 && styles.totalCommentLead]}>
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** 얼굴 윤곽(서버의 face) 둘레에 더하는 여백 — 긴 변 대비 비율 */
const FACE_MARGIN = 0.06;

/** 원본 사진에서 얼굴 부분만 잘라 보여주고, 서버가 잘라 쓴 crop 박스를 겹친다 (좌표 = 업로드한 이미지 기준) */
function PhotoWithBoxes({
  photo,
  result,
  width,
}: {
  photo: ScanPhoto;
  result: SkinScanResult;
  width: number;
}) {
  const source = typeof photo === 'number' ? photo : { uri: photo.uri };
  // 부위 박스가 없는 기록(덤프)은 사진만 정사각형으로 보여준다
  if (!result.boxes?.length || !result.width || !result.height) {
    return (
      <View style={{ width, height: width, borderRadius: 14, overflow: 'hidden' }}>
        <Image source={source} style={{ width, height: width }} resizeMode="cover" />
      </View>
    );
  }
  // 얼굴 윤곽과 crop 박스 7개를 모두 감싼다 — 윤곽만으로는 이마 위쪽·턱 아래쪽 박스가 잘린다
  const rects = [...(result.face ? [result.face] : []), ...result.boxes.map(({ box }) => box)];
  const xs = rects.flatMap((b) => [b[0], b[2]]);
  const ys = rects.flatMap((b) => [b[1], b[3]]);
  const m = FACE_MARGIN * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const fx = Math.max(0, Math.min(...xs) - m);
  const fy = Math.max(0, Math.min(...ys) - m);
  const fw = Math.min(result.width, Math.max(...xs) + m) - fx;
  const fh = Math.min(result.height, Math.max(...ys) + m) - fy;
  const scale = width / fw;
  const height = fh * scale;
  const stroke = fw / 120;
  return (
    <View style={{ width, height, borderRadius: 14, overflow: 'hidden' }}>
      <Image
        source={source}
        style={{ position: 'absolute', left: -fx * scale, top: -fy * scale, width: result.width * scale, height: result.height * scale }}
      />
      <Svg width={width} height={height} viewBox={`${fx} ${fy} ${fw} ${fh}`} style={StyleSheet.absoluteFill}>
        {result.boxes.map(({ part, box: [x1, y1, x2, y2] }) => (
          <Rect
            key={part}
            x={x1}
            y={y1}
            width={x2 - x1}
            height={y2 - y1}
            stroke={BOX_COLOR}
            strokeWidth={stroke}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

interface RadarAxis {
  label: string;
  /** 축 위 위치 — 중심 0, 바깥 테두리 100 */
  pos: number;
  avgPos: number | null;
  text: string;
  avgText: string | null;
}

/** 레벨 항목마다 한 축 — 위치 = Lv / 7 */
function radarAxes(result: Pick<SkinScanResult, 'metrics'>): RadarAxis[] {
  return result.metrics.flatMap((m) =>
    (m.items ?? []).map((it) => ({
      label: m.key === 'moisture' ? m.label : `${it.label} ${m.label}`,
      pos: (it.level / it.levelMax) * 100,
      avgPos: it.ageAvgLevel != null ? (it.ageAvgLevel / it.levelMax) * 100 : null,
      text: `Lv.${it.level}`,
      avgText: it.ageAvgLevel != null ? `평균 Lv.${it.ageAvgLevel.toFixed(1)}` : null,
    })),
  );
}

const RADAR_GREEN = '#5FB86A';
/** 축 이름을 놓는 반지름 (100 = 바깥 테두리) */
const LABEL_AT = 108;

/** 결과 맨 아래 레이더 차트 — 내 레벨(초록 면)과 연령대 평균 레벨(점선) */
function RadarChart({
  result,
  width,
  centerScore,
}: {
  result: Pick<SkinScanResult, 'metrics' | 'ageGroup'>;
  width: number;
  /** 있으면 레이더 한가운데에 총점을 적는다 */
  centerScore?: number | null;
}) {
  const axes = radarAxes(result);
  const pad = 70; // 좌우 축 이름("미간 주름")이 카드 밖으로 나가지 않을 여백
  const r = width / 2 - pad;
  const cx = width / 2;
  // 축 이름은 세 줄(이름 / 레벨 / 평균) — 위 꼭짓점은 이름 묶음 전체가 꼭짓점 위에 오도록 띄운다
  const cy = r * LABEL_AT / 100 + 48;
  // v: 중심 0 ~ 바깥 테두리 100
  const at = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / axes.length;
    return [cx + (r * v * Math.cos(a)) / 100, cy + (r * v * Math.sin(a)) / 100];
  };
  const height = Math.max(...axes.map((_, i) => at(i, LABEL_AT)[1])) + 50;
  const poly = (vals: number[]) => vals.map((v, i) => at(i, v).join(',')).join(' ');
  const hasAvg = axes.every((a) => a.avgPos != null);
  return (
    <View>
      <Svg width={width} height={height}>
        {[25, 50, 75, 100].map((ring) => (
          <Polygon
            key={ring}
            points={poly(axes.map(() => ring))}
            fill={ring === 100 ? '#F4F7F2' : 'none'}
            stroke={AppColors.line}
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = at(i, 100);
          return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={AppColors.line} strokeWidth={1} />;
        })}
        {hasAvg && (
          <Polygon
            points={poly(axes.map((a) => a.avgPos as number))}
            fill="none"
            stroke={AppColors.sub}
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />
        )}
        <Polygon
          points={poly(axes.map((a) => a.pos))}
          fill={RADAR_GREEN}
          fillOpacity={0.35}
          stroke={RADAR_GREEN}
          strokeWidth={2}
        />
        {axes.map((a, i) => {
          const [x, y] = at(i, a.pos);
          return <Circle key={i} cx={x} cy={y} r={3.5} fill={RADAR_GREEN} />;
        })}
        {/* 가운데 총점 — 숫자, 그 밑에 연하고 작게 또래 상위 몇 % */}
        {centerScore != null && (
          <>
            <SvgText x={cx} y={cy + 2} fontSize={24} fontWeight="800" fill={AppColors.ink} textAnchor="middle">
              {Math.round(centerScore)}
            </SvgText>
            <SvgText x={cx} y={cy + 18} fontSize={10.5} fontWeight="600" fill={AppColors.sub} textAnchor="middle">
              {`또래 ${topPctText(totalTopPct(centerScore, result.ageGroup))}`}
            </SvgText>
          </>
        )}
        {axes.map((a, i) => {
          const [x, y] = at(i, LABEL_AT);
          const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
          // 첫 줄 기준선: 위 꼭짓점은 묶음을 위로, 옆은 가운데 맞춤, 아래는 묶음을 아래로
          const top = y < cy - r * 0.9 ? y - 34 : y > cy + r * 0.5 ? y + 10 : y - 10;
          return (
            <React.Fragment key={a.label}>
              <SvgText x={x} y={top} fontSize={12} fontWeight="700" fill={AppColors.ink} textAnchor={anchor}>
                {a.label}
              </SvgText>
              <SvgText x={x} y={top + 16} fontSize={12.5} fontWeight="800" fill={RADAR_GREEN} textAnchor={anchor}>
                {a.text}
              </SvgText>
              {a.avgText != null && (
                <SvgText x={x} y={top + 31} fontSize={11} fontWeight="600" fill={AppColors.sub} textAnchor={anchor}>
                  {a.avgText}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
      {hasAvg && (
        <View style={styles.radarLegend}>
          <View style={[styles.radarSwatch, { backgroundColor: RADAR_GREEN }]} />
          <Text style={styles.radarLegendText}>내 레벨</Text>
          <Svg width={18} height={4} style={{ marginLeft: 8 }}>
            <Line x1={0} y1={2} x2={18} y2={2} stroke={AppColors.sub} strokeWidth={2} strokeDasharray="4,3" />
          </Svg>
          <Text style={styles.radarLegendText}>{result.ageGroup} 평균</Text>
        </View>
      )}
    </View>
  );
}

/**
 * 레벨(Lv.N) 글자 색 — "한눈에 보기" 레이더의 Lv 글자와 같은 초록(RADAR_GREEN) 하나로 통일한다.
 * 예전에는 레벨 구간(6↑ 좋음 · 4↑ 보통 · 2↑ 주의 · 그 아래 관리 필요)마다 색을 바꿨는데, 나이와 무관한
 * 고정 구간이라 또래 비교 배지 색과 어긋나 보였다. 결과 화면 · 홈 카드가 모두 이 함수를 쓴다.
 */
export const levelColor = (_level: number) => RADAR_GREEN;

/** 수분량 막대 양 끝 — 학습 데이터(train 773명)의 사람별 4부위 평균 수분량 최소 32.0 · 최대 93.9 */
const MOISTURE_AXIS: [number, number] = [32, 94];

/**
 * 레벨 경계(전체 기준, 서버 levelEdges)를 눈금으로, 연령대 평균 범위를 띠로, 내 수분량을 점으로.
 * 레벨과 연령대 평균은 기준이 달라서 띠가 레벨 두 칸에 걸칠 수 있다.
 */
function MoistureRange({
  value,
  norm,
  levelEdges,
}: {
  value: number;
  norm: NonNullable<MetricResult['ageNorm']>;
  levelEdges: number[];
}) {
  const [min, max] = MOISTURE_AXIS;
  /*
    레벨 칸은 실측 간격과 상관없이 모두 같은 폭으로 그린다 — 값 그대로 놓으면 양 끝(Lv.1·Lv.7) 칸만
    넓고 가운데 칸은 좁아 보였다. 값은 자기가 속한 레벨 칸 안에서 경계 사이 비율대로 놓는다
    (구간별 선형). 양 끝 칸의 바깥 경계는 MOISTURE_AXIS다.
  */
  const valueBounds = [min, ...levelEdges, max];
  const cells = valueBounds.length - 1;
  const pct = (v: number) => {
    const x = Math.min(Math.max(v, min), max);
    let k = 0;
    while (k < cells - 1 && x >= valueBounds[k + 1]) k++;
    const span = valueBounds[k + 1] - valueBounds[k];
    const t = span > 0 ? (x - valueBounds[k]) / span : 0;
    return ((k + Math.min(Math.max(t, 0), 1)) / cells) * 100;
  };
  const edges = levelEdges.map((_, i) => ((i + 1) / cells) * 100);
  // 레벨 숫자는 각 칸의 가운데에
  const centers = Array.from({ length: cells }, (_, i) => ((i + 0.5) / cells) * 100);
  const where = value < norm.lo ? '평균 범위보다 낮아요' : value >= norm.hi ? '평균 범위보다 높아요' : '평균 범위 안이에요';
  return (
    <View style={styles.rangeBox}>
      <Text style={styles.rangeWhere}>{where}</Text>
      <View style={styles.rangeTrack}>
        <View style={[styles.rangeBand, { left: `${pct(norm.lo)}%`, right: `${100 - pct(norm.hi)}%` }]} />
        {/* 레벨 경계선은 띠 위에 — 띠가 두 칸에 걸쳐도 어디서 레벨이 바뀌는지 보이게 */}
        {edges.map((e, i) => (
          <View key={i} style={[styles.rangeTick, { left: `${e}%` }]} />
        ))}
        <View style={[styles.rangeDot, { left: `${pct(value)}%` }]} />
      </View>
      <View style={styles.rangeLevels}>
        {centers.map((c, i) => (
          <Text key={i} style={[styles.rangeLevel, { left: `${c}%` }]}>
            {i + 1}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** 레벨 항목 하나 — 한 줄에 셋(이마·미간 주름 | 눈가 주름 | 볼 모공)이 들어가는 짧은 상자 */
function LevelBox({ metric, item }: { metric: string; item: LevelItem }) {
  return (
    <View style={[cardDecoration(), styles.card, styles.levelBox]}>
      <Text style={styles.levelMetric}>{metric}</Text>
      <Text style={styles.levelPart} numberOfLines={1}>
        {item.label}
      </Text>
      <Text style={[styles.levelValue, { color: levelColor(item.level) }]}>
        Lv.{item.level}
        <Text style={styles.levelMax}>/{item.levelMax}</Text>
      </Text>
    </View>
  );
}

/** 수분량 — 긴 상자 제목 옆에 회귀 모델 수분량(4부위 평균), 오른쪽에 레벨, 아래에 연령대 범위 */
export function MoistureBox({ metric }: { metric: MetricResult }) {
  const item = metric.items?.[0];
  return (
    <View style={[cardDecoration(), styles.card]}>
      <View style={styles.moistureHead}>
        <Text style={[styles.boxTitle, { flex: 1 }]}>
          {metric.label}
          <Text style={styles.moistureValue}>  {metric.value.toFixed(1)}</Text>
        </Text>
        {item && (
          <Text style={[styles.levelValue, { marginTop: 0, color: levelColor(item.level) }]}>
            Lv.{item.level}
            <Text style={styles.levelMax}>/{item.levelMax}</Text>
          </Text>
        )}
      </View>
      {metric.ageNorm && metric.levelEdges && (
        <MoistureRange value={metric.value} norm={metric.ageNorm} levelEdges={metric.levelEdges} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { textAlign: 'center', fontSize: 17, fontWeight: '800', color: AppColors.ink },
  headerSub: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: AppColors.sub, marginTop: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

  card: { padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: AppColors.ink, marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },


  boxRow: { flexDirection: 'row', gap: 10 },
  levelBox: { flex: 1, paddingHorizontal: 10, alignItems: 'center' },
  boxTitle: { fontSize: 17, fontWeight: '800', color: AppColors.ink, marginBottom: 8 },
  moistureValue: { fontSize: 17, fontWeight: '800', color: AppColors.ink },
  moistureHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  levelMetric: { fontSize: 12, fontWeight: '700', color: AppColors.sub },
  levelPart: { fontSize: 15, fontWeight: '800', color: AppColors.ink, marginTop: 2 },
  levelValue: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  levelMax: { fontSize: 13, fontWeight: '700', color: AppColors.sub },

  rangeBox: { padding: 12, borderRadius: 12, backgroundColor: AppColors.bg },
  rangeWhere: { fontSize: 12, fontWeight: '700', color: AppColors.sub, marginBottom: 10 },
  // 상자 배경(AppColors.bg)과 막대 색(AppColors.line)이 거의 같아 안 보였다 — 막대·띠·눈금을 따로 진하게
  rangeTrack: { height: 8, borderRadius: 4, backgroundColor: '#C5CBD3', justifyContent: 'center' },
  rangeBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#7DB58A' },
  rangeDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#D9822B',
  },
  // 눈금은 막대 높이 안에서만 — 막대 밖으로 튀어나오면 점·숫자와 겹쳐 답답했다
  rangeTick: { position: 'absolute', width: 1, height: 8, marginLeft: -0.5, backgroundColor: '#FFFFFF' },
  rangeLevels: { height: 16, marginTop: 8 },
  rangeLevel: { position: 'absolute', width: 24, marginLeft: -12, textAlign: 'center', fontSize: 11, color: '#6B7079' },

  radarLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  radarSwatch: { width: 14, height: 4, borderRadius: 2, marginLeft: 8 },
  radarLegendText: { fontSize: 12, color: AppColors.sub },

  totalRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 14 },
  totalLeft: { alignItems: 'center', width: 84 },
  totalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  totalLabel: { fontSize: 12, fontWeight: '700', color: AppColors.sub, marginTop: 6 },
  totalValue: { fontSize: 26, fontWeight: '800', color: AppColors.ink, marginTop: 2 },
  totalUnit: { fontSize: 14, fontWeight: '700', color: AppColors.sub },
  totalCommentBox: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: AppColors.bg, gap: 4 },
  totalComment: { fontSize: 13, color: '#4A4F57', lineHeight: 19 },
  totalCommentLead: { fontWeight: '800', color: AppColors.ink },

  dark: {
    flex: 1,
    backgroundColor: '#14171C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  darkTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 23 },
  darkSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  primaryBtn: { backgroundColor: AppColors.greenTop, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#16320A' },
  secondaryBtn: { backgroundColor: '#E4E8EE', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.ink },
  linkText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

});
