import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { monitoringColors as mc } from '../theme';
import { useFolder, folderHasSeverity, isBarrierFolder } from '../store';
import { SkinScanResultPage } from '../../screens/SkinScanScreen';
import PhotoZoomModal from '../components/PhotoZoomModal';
import { useProfile } from '../../context/ProfileContext';
import { plainSiteLabel } from '../../models';
import { ExamRecordResultScreen } from '../../screens/ExamResultScreen';
import { useMonitoring } from '../../context/MonitoringContext';

function shortDate(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${y}.${parseInt(m)}.${parseInt(d)}`;
}

/**
 * 경과 관찰 상세 결과 — 하루치 기록 하나를 자세히 본다.
 *
 * 촬영 직후 결과 화면과 **똑같은 화면**으로 그린다 — 같은 결과를 두 모양으로 보여주면 어느 쪽이
 * 맞는지 헷갈린다. 피부 장벽 기록은 SkinScanResultPage, 아토피(피부 질환) 기록은
 * ExamRecordResultScreen(ExamResultScreen과 같은 부품).
 */
export default function MonitoringDetailScreen({ navigation, route }) {
  const { folderId, recordId } = route.params || {};
  const folder = useFolder(folderId);
  const [zoomRecord, setZoomRecord] = useState(null);
  const [zoomPage, setZoomPage] = useState(0);
  // 수면 점수는 스마트워치(Samsung Health) 연동으로 들어오는 값이라, 미연동이면 "미기재"로 둔다
  const { healthConnected } = useProfile();
  const { findTarget } = useMonitoring();
  if (!folder) {
    return <SafeAreaView style={styles.container}><Text style={{ padding: 20, color: mc.sub }}>폴더를 찾을 수 없습니다.</Text></SafeAreaView>;
  }

  const record = folder.records.find((r) => r.id === recordId) || folder.records[folder.records.length - 1];
  // 4가지 증상·IGA 모델은 아토피피부염 채점 기준이라, 이 폴더의 진단명이 그게 아니면 두 카드 다 숨긴다
  const hasSeverity = folderHasSeverity(folder);

  const openZoom = (page) => { setZoomPage(page); setZoomRecord(record); };

  /*
    피부 장벽만 잰 날(피부 장벽 폴더의 기록) — 홈 "피부 바로 스캔 → 피부 장벽 측정"의 결과 화면과
    같은 페이지를 그날 기록으로 그린다(제목 아래 날짜, 지난 기록이라 다시 촬영은 없다).
  */
  if (isBarrierFolder(folder) && record.skinScan) {
    // 피부 바로 스캔 결과와 같은 페이지 그대로 (덧붙이는 카드 없음 — 제목 아래 날짜만)
    return (
      <SkinScanResultPage
        photo={record.skinScan.photo ?? record.photo}
        result={record.skinScan}
        subtitle={`${shortDate(record.date)} 기록`}
        onClose={() => navigation.goBack()}
      />
    );
  }

  /*
    아토피(피부 질환) 기록 — 촬영 직후 결과 화면(ExamResultScreen)과 같은 모양으로 그린다.
    홈 "최근 ○○ 상태"·기록 탭·아토피 기록 어디서 들어와도 이 화면이다.
  */
  const target = folder.targetId ? findTarget(folder.targetId) : undefined;
  return (
    <>
      <ExamRecordResultScreen
        record={record}
        site={target ? plainSiteLabel(target.label) : plainSiteLabel(folder.name)}
        disease={target?.diagnosis?.disease ?? folder.disease}
        selfEntered={target?.diagnosis?.source === 'self'}
        hasSeverity={hasSeverity}
        healthConnected={healthConnected}
        onClose={() => navigation.goBack()}
        onPhotoPress={openZoom}
      />
      <PhotoZoomModal visible={!!zoomRecord} record={zoomRecord} initialPage={zoomPage} onClose={() => setZoomRecord(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mc.bg },
});
