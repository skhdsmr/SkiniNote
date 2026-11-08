import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { monitoringColors as mc, monitoringCard, DISPLAY_SCALE, SKIN_SEGMENTS } from '../theme';
import { useFolder, folderHasSeverity, setFolderBaseline } from '../store';
import { useMonitoring } from '../../context/MonitoringContext';
import { MetricCard } from '../../components/MetricCard';
import SymptomGroupCard from '../../components/SymptomGroupCard';
import SymptomLayerPhoto from '../../components/SymptomLayerPhoto';
import { SYMPTOM_GROUPS, INSIGHT_ROUTE } from '../../symptoms/groups';
import AreaTrendCard from '../components/AreaTrendCard';
import { supportsAreaTracking } from '../../monitoring/bodyParts';
import PhotoZoomModal from '../components/PhotoZoomModal';
import ProgressGraphs from '../components/ProgressGraphs';
import { AXES, axisPoints, axisVerdict, baseIndexOf, toneOf, VERDICTS } from '../progress';

const PHOTO_SIZE = 110;

/**
 * 폴더 화면에 병변 넓이 카드를 보여줄지.
 *
 * false로 두면 **화면에서만 사라진다** — 넓이 측정과 기록 저장, 전신 지도의 점선 원은 그대로
 * 동작한다. 지금 끈 이유는 값이 틀려서가 아니라 **아직 흔들리기 때문**이다: 자·게이트·문턱의
 * 임계값이 전부 실기기 캘리브레이션 전이라 회차마다 값이 튀는데, 이 카드는 "얼굴의 12%,
 * 첫 촬영 대비 −18%"처럼 숫자를 정면으로 말해서 사용자가 그 흔들림을 병변의 변화로 읽는다.
 *
 * 그렇다고 계산을 멈추면 안 된다 — 임계값을 잡으려면 실제 기록이 쌓여야 하고, 그건 계속 재야만
 * 생긴다. 그래서 "재되 말하지 않는" 상태로 둔다.
 */
const SHOW_AREA_CARD = false;
/** 부위별 증상 카드 — 증상 요약·증상 레이어가 같은 정보를 보여줘서 일단 화면에서만 내려 둔다(ExamResultScreen과 같은 이름). */
const SHOW_REGION_SYMPTOMS = false;

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d, weekday: WEEKDAY_KO[new Date(y, m - 1, d).getDay()] };
}

function fmtFull(dateKey) {
  const { y, m, d } = parseDateKey(dateKey);
  return `${y}.${m}.${d}`;
}

const REGION_CROP_SIZE = 60;

/**
 * 부위별 증상 카드 — 병변이 여러 곳으로 떨어져 있어(seg가 판정 단위를 2개 이상으로 나눴을 때)
 * 그 부위를 하나씩 잘라 보여주며 4가지 증상 중 "있음/없음"만 알려준다. 촬영 직후 결과 화면
 * (ExamResultScreen의 RegionSymptomsCard)과 같은 목적·같은 규칙(등급은 안 보여준다)이고, 여기서는
 * 그 기록이 지나간 뒤에도 경과 관찰 폴더에서 다시 확인할 수 있게 한다.
 *
 * ⚠️ record.regions는 지금은 데모 예시(folders/store.js의 DEMO_REGIONS)에만 붙어 있다 — 실제
 * 촬영이 regions를 기록에 남기려면 CameraScreen.saveExamRecord가 analyzeLocal의 regions를 함께
 * 저장하도록 손대야 한다(지금은 대표값만 남긴다).
 */
function RegionSymptomsCard({ photo, regions }) {
  return (
    <View style={[monitoringCard(), styles.metricCard]}>
      <Text style={styles.metricCardLabel}>부위별 증상</Text>
      {regions.map((region, i) => (
        <View key={i} style={[styles.regionRow, i > 0 && styles.regionRowDivider]}>
          <View style={styles.regionCropCol}>
            <RegionCrop photo={photo} bbox={region.bbox} />
            <Text style={styles.regionCropCaption}>부위 {i + 1}</Text>
          </View>
          <View style={styles.regionChips}>
            <View style={styles.symptomChipRow}>
              {SYMPTOM_GROUPS.map((group) => {
                // 묶음에 속한 증상 중 하나라도 이 부위에서 나타났으면 "있음"
                const present = group.members.some((m) => !!region.symptoms?.[m]);
                return (
                  <View key={group.key} style={[styles.symptomChip, present && styles.symptomChipOn]}>
                    <MaterialIcons
                      name={present ? 'check-circle' : 'radio-button-unchecked'}
                      size={13}
                      color={present ? mc.greenDeep : mc.sub}
                    />
                    <Text style={[styles.symptomChipText, present && styles.symptomChipTextOn]}>{group.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * 크롭 한 장 — bbox 사각형을 정사각형 썸네일에 그대로 눌러 넣는다(종횡비 유지 안 함).
 * 중증도 모델이 실제로 보는 입력과 같은 규칙이라, 화면에 보이는 크롭이 곧 "모델이 본 바로 그
 * 사진"이다(ExamResultScreen의 RegionCrop과 같은 규칙 — 자세한 이유는 그쪽 주석 참고).
 */
function RegionCrop({ photo, bbox }) {
  const scaleX = REGION_CROP_SIZE / bbox.width;
  const scaleY = REGION_CROP_SIZE / bbox.height;
  return (
    <View style={styles.regionCrop}>
      <Image
        source={photo}
        style={{
          position: 'absolute',
          width: bbox.imageWidth * scaleX,
          height: bbox.imageHeight * scaleY,
          left: -bbox.x * scaleX,
          top: -bbox.y * scaleY,
        }}
      />
    </View>
  );
}


/** 판정 칩 — 축 이름 + 기준일 대비 판정 */
function VerdictChip({ label, verdict }) {
  const tone = toneOf(verdict);
  const pending = verdict === 'pending';
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }, pending && styles.chipPending]}>
      <Text style={[styles.chipText, { color: tone.text }]} numberOfLines={1}>
        {label} <Text style={styles.chipVerdict}>{VERDICTS[verdict].ko}</Text>
      </Text>
    </View>
  );
}

/** 기준일 사진 ↔ 고른 날 사진을 나란히 */
function PhotoCompare({ base, record }) {
  const same = base.id === record.id;
  return (
    <View style={[monitoringCard(), styles.photoCard]}>
      <Text style={styles.cardTitle}>{same ? '기준일 사진' : '사진 비교'}</Text>
      <View style={styles.compareRow}>
        <View style={styles.compareCol}>
          <View style={styles.compareFrame}>{base.photo && <Image source={base.photo} style={styles.fill} resizeMode="cover" />}</View>
          <Text style={styles.caption}>기준일 {fmtFull(base.date)}</Text>
        </View>
        {!same && (
          <View style={styles.compareCol}>
            <View style={styles.compareFrame}>{record.photo && <Image source={record.photo} style={styles.fill} resizeMode="cover" />}</View>
            <Text style={styles.caption}>{fmtFull(record.date)}</Text>
          </View>
        )}
      </View>
      {same && <Text style={styles.hint}>위 그래프의 점을 누르면 그날 사진과 비교해요</Text>}
    </View>
  );
}

/**
 * 부위 상세 — 이 부위(폴더) 단위 데이터만 보여준다.
 *
 * 가려움·수면·루틴 이행은 사람 단위라 전신 경과(MonitoringMapScreen)로 옮겼다. 두 화면은 같은
 * 날짜축으로만 연결한다. 맨 위는 절대 등급이 아니라 **기준일 대비 판정**이다(progress.js).
 */
export default function MonitoringFolderScreen({ navigation, route }) {
  const { folderId } = route.params || {};
  const folder = useFolder(folderId);
  const [zoomRecord, setZoomRecord] = useState(null);
  const [zoomPage, setZoomPage] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pickingBase, setPickingBase] = useState(false);
  // 이 폴더가 지켜보는 자리가 넓이를 잴 수 있는 곳인지 — 촬영 화면과 **같은 판단**을 쓴다.
  const { findTarget } = useMonitoring();
  const areaPart = findTarget(folder?.targetId)?.part;
  const areaTrackable = areaPart ? supportsAreaTracking(areaPart) : false;
  const [areaCardW, setAreaCardW] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  if (!folder || folder.records.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ padding: 20, color: mc.sub }}>폴더를 찾을 수 없습니다.</Text>
      </SafeAreaView>
    );
  }

  const records = folder.records;
  const baseIdx = baseIndexOf(folder);
  const base = records[baseIdx];
  const selectedRecord = records.find((r) => r.id === selectedId) || records[records.length - 1];
  // 4가지 증상·IGA 모델은 아토피피부염 채점 기준이라, 이 폴더의 진단명이 그게 아니면 판정·상세를 숨긴다.
  const hasSeverity = folderHasSeverity(folder);
  const overlay = selectedRecord.overlay;
  const skinDisplay = DISPLAY_SCALE.iga(selectedRecord.iga);
  const verdicts = AXES.map((axis) => ({ axis, verdict: axisVerdict(axisPoints(records, baseIdx, axis)) }));
  const afterBase = records.slice(baseIdx);

  const openZoom = (page) => { setZoomPage(page); setZoomRecord(selectedRecord); };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Text style={{ fontSize: 20, color: mc.ink }}>‹</Text>
          <Text style={styles.topBarTitle} numberOfLines={1}>{folder.name}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        {hasSeverity ? (
          <View style={[monitoringCard(), styles.card]}>
            <View style={styles.headRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>부위 상세 (부위 단위)</Text>
                <Text style={styles.siteName}>{folder.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setPickingBase((v) => !v)} activeOpacity={0.7}>
                <Text style={styles.baseText}>
                  기준일 {fmtShort(base.date)} · <Text style={styles.baseChange}>변경</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {pickingBase && (
              <View style={styles.basePicker}>
                {records.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.baseOption, r.id === base.id && styles.baseOptionOn]}
                    onPress={() => { setFolderBaseline(folder.id, r.id); setSelectedId(null); setPickingBase(false); }}
                  >
                    <Text style={[styles.baseOptionText, r.id === base.id && { color: mc.greenDeep }]}>{fmtShort(r.date)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.chipRow}>
              {verdicts.map(({ axis, verdict }) => <VerdictChip key={axis.key} label={axis.label} verdict={verdict} />)}
            </View>

            {afterBase.length < 2 ? (
              <Text style={styles.hint}>기준일 한 장뿐이라 아직 비교할 수 없어요. 다시 촬영하면 변화를 알려드려요.</Text>
            ) : (
              <ProgressGraphs records={records} baseIdx={baseIdx} selectedId={selectedRecord.id} onSelect={(r) => setSelectedId(r.id)} />
            )}
          </View>
        ) : (
          <View style={[monitoringCard(), styles.card]}>
            <Text style={styles.siteName}>{folder.name}</Text>
            <Text style={styles.hint}>이 질환은 증상 변화 판정을 지원하지 않아요. 사진으로 경과를 확인해 주세요.</Text>
          </View>
        )}

        {/* 병변 넓이 추이 — 임계값 캘리브레이션 전이라 SHOW_AREA_CARD로 화면에서만 내려 둔다 */}
        {SHOW_AREA_CARD && areaTrackable && (
          <View onLayout={(e) => setAreaCardW(e.nativeEvent.layout.width)}>
            <AreaTrendCard records={folder.records} width={areaCardW} selectedId={selectedRecord.id} />
          </View>
        )}

        {/* 그래프에서 고른 날의 사진을 기준일 사진과 비교 */}
        <PhotoCompare base={base} record={selectedRecord} />

        {/* 고른 날의 촬영 이미지 — 원본/증상 부위 표시, 증상 레이어 칩 */}
        <SymptomLayerPhoto
          title={`${fmtFull(selectedRecord.date)} 촬영`}
          photo={selectedRecord.photo}
          overlay={overlay}
          layers={selectedRecord.symptomOverlays}
          values={selectedRecord}
          size={PHOTO_SIZE}
          onZoom={openZoom}
        />

        {/* 이번 촬영 상세 — 절대 등급과 증상별 강도는 접어 둔다 */}
        {hasSeverity && (
          <View style={[monitoringCard(), styles.card]}>
            <TouchableOpacity style={styles.detailHead} activeOpacity={0.7} onPress={() => setDetailOpen((v) => !v)}>
              <Text style={styles.cardTitle}>이번 촬영 상세 ({fmtShort(selectedRecord.date)})</Text>
              <MaterialIcons name={detailOpen ? 'expand-less' : 'expand-more'} size={22} color={mc.sub} />
            </TouchableOpacity>
            {detailOpen && (
              <View style={{ gap: 12, marginTop: 12 }}>
                <MetricCard label="피부 종합 상태" value={skinDisplay} unit="/100" segments={SKIN_SEGMENTS} />
                <SymptomGroupCard
                  values={selectedRecord}
                  onOpenInsight={(kind) => navigation.navigate(INSIGHT_ROUTE[kind], { folderId: folder.id })}
                />
                {SHOW_REGION_SYMPTOMS && selectedRecord.regions && selectedRecord.regions.length > 1 && (
                  <RegionSymptomsCard photo={selectedRecord.photo} regions={selectedRecord.regions} />
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <PhotoZoomModal
        visible={!!zoomRecord}
        record={zoomRecord}
        overlay={overlay}
        initialPage={zoomPage}
        onClose={() => setZoomRecord(null)}
      />
    </SafeAreaView>
  );
}

const fmtShort = (dateKey) => {
  const { m, d } = parseDateKey(dateKey);
  return `${m}/${d}`;
};


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mc.bg },
  topBar: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, gap: 8,
    backgroundColor: mc.card, borderBottomWidth: 1, borderBottomColor: mc.line,
  },
  topBarTitle: { fontSize: 15, fontWeight: '700', color: mc.ink, flexShrink: 1 },
  card: { paddingVertical: 16, paddingHorizontal: 10 },
  metricCard: { padding: 16 },
  metricCardLabel: { fontSize: 16, fontWeight: '800', color: mc.ink, marginBottom: 12 },
  regionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  regionRowDivider: { borderTopWidth: 1, borderTopColor: mc.line },
  regionCropCol: { alignItems: 'center' },
  regionCrop: {
    width: REGION_CROP_SIZE, height: REGION_CROP_SIZE, borderRadius: 10, overflow: 'hidden', backgroundColor: mc.bg,
  },
  regionCropCaption: { fontSize: 10, color: mc.sub, marginTop: 4 },
  regionChips: { flex: 1, gap: 6 },
  symptomChipRow: { flexDirection: 'row', gap: 6 },
  symptomChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: mc.bg,
    flexShrink: 1,
  },
  symptomChipOn: { backgroundColor: '#EDF7E1' },
  symptomChipText: { fontSize: 11.5, fontWeight: '700', color: mc.sub },
  symptomChipTextOn: { color: mc.greenDeep },

  // 경과추적 카드 — 왼쪽 이행률 열 / 오른쪽 개선·악화 열을 나란히 둔다
  photoCard: { padding: 14 },
  body: { padding: 12, gap: 12, paddingBottom: 24 },
  fill: { width: '100%', height: '100%' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: mc.ink },
  hint: { fontSize: 11.5, color: mc.sub, marginTop: 10 },
  eyebrow: { fontSize: 11.5, color: mc.sub, fontWeight: '600' },
  siteName: { fontSize: 20, fontWeight: '800', color: mc.ink, marginTop: 2 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  baseText: { fontSize: 11.5, color: mc.sub, fontWeight: '600' },
  baseChange: { color: mc.greenMuted, fontWeight: '800', textDecorationLine: 'underline' },
  basePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  baseOption: { borderRadius: 10, borderWidth: 1, borderColor: '#E7E9EC', paddingHorizontal: 10, paddingVertical: 5 },
  baseOptionOn: { backgroundColor: '#EDF7E1', borderColor: mc.greenTop },
  baseOptionText: { fontSize: 12, fontWeight: '700', color: mc.sub },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipPending: { borderStyle: 'dashed' },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipVerdict: { fontWeight: '800' },
  compareRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  compareCol: { alignItems: 'center' },
  compareFrame: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 12, overflow: 'hidden', backgroundColor: mc.bg },
  caption: { fontSize: 10.5, color: mc.sub, marginTop: 6 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

