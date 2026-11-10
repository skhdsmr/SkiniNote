import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppColors } from '../theme';
import { analyzeLocal, normalSkinResult, unsupportedDiseaseResult, LocalAnalysisResult } from '../ai/analyzeLocal';
import { classifyDisease, preloadDiseaseModel } from '../ai/diseaseModel';
import { preloadModels } from '../ai/tfliteService';
import { endProfile, note, span, spanAsync, startProfile } from '../ai/profile';
import { GRADE_NAMES_KO, SEVERITY_SUPPORTED_DISEASE } from '../ai/labels';
import { DUMP_ANALYSIS, makeDumpDiseases, makeDumpLocalResult } from '../exam/dumpAnalysis';
import { useRecords } from '../context/RecordsContext';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { useMonitoring } from '../context/MonitoringContext';
import { PART_TO_REGION } from '../monitoring/bodyParts';
import { MonitorTarget } from '../monitoring/types';
import {
  ensureBarrierFolder, ensureFolder, getFolder, isBarrierFolder, recordBarrier, recordExam, removeRecord, todayKey,
} from '../folders/store';
import { getDayItch } from '../records/itchStore';
import { folderNameOf } from '../folders/targets';
import { ExamAnalysis, ExamCapture, ExamKind } from '../exam/examTypes';
import { toFolderMetrics } from '../exam/examMetrics';
import ExamStartScreen from './ExamStartScreen';
import SkinScanScreen, { analyzeFaceScan, FACE_SCAN_TARGET, SkinScanResultPage } from './SkinScanScreen';
import MonitorCaptureScreen from './MonitorCaptureScreen';
import { useProfile } from '../context/ProfileContext';
import type { SkinScanResult } from '../skinScan/api';
import ExamFlow from './ExamFlow';
import ExamResultScreen from './ExamResultScreen';

/**
 * 피부 촬영 탭 — 아토피와 피부장벽을 **따로따로** 재는 두 갈래. 탭을 누르면 시작 화면(이어서 기록 /
 * 신규 증상)이 뜨고, 홈·기록 화면의 버튼은 mode를 들고 바로 그 갈래로 들어온다.
 *
 *   mode='atopy'   아토피 측정
 *     시작(이어서 기록 / 신규 증상) → ExamFlow(부위 → 가이드 촬영) → 온디바이스 분석
 *     → 아토피 결과 상세(ExamResultScreen: IGA · 증상별 중증도 · 병변)
 *
 *   mode='barrier' 피부장벽 측정
 *     얼굴 촬영 → 서버 분석 → 피부 장벽 폴더에 오늘 기록으로 자동 저장
 *     → 피부장벽 결과 상세(SkinScanResultPage: 주름 · 모공 · 수분량 · 장벽 점수)
 *
 *   mode='quick' / 'quickBarrier'  홈 "피부 바로 스캔" — 기록으로 남기지 않는 한 번짜리 스캔
 *     quick: 피부 질환 촬영 → 결과(닫기만) / quickBarrier: 얼굴 스캔 → 결과(SkinScanScreen)
 *
 * 예전(통합판)에는 "신규 증상 기록" 안의 측정 선택 화면(hub)에서 두 측정을 한 기록으로 묶었다.
 * 분리판에서는 두 측정이 서로의 기록에 붙지 않는다 — 아토피 기록에는 피부장벽 값이 없고,
 * 피부장벽 기록은 하나뿐인 피부 장벽 폴더에만 쌓인다.
 *
 * 질환 분류 모델은 이미 지켜보는 자리를 다시 찍을 때(이어서 기록)와 사용자가 진단명을 직접
 * 넣어 둔 자리에서는 돌리지 않는다. 1순위가 "정상"이면 세그멘테이션·중증도 모델은 건너뛰고
 * normalSkinResult로 "이상 없음"을 바로 확정한다.
 */
export type MeasureMode = 'atopy' | 'barrier' | 'quick' | 'quickBarrier';

const parseMode = (m: any): MeasureMode =>
  m === 'barrier' || m === 'quick' || m === 'quickBarrier' ? m : 'atopy';
const firstStage = (m: MeasureMode): Stage =>
  m === 'barrier' ? 'barrierCapture' : m === 'quick' ? 'flow' : m === 'quickBarrier' ? 'skinScan' : 'start';

type Stage = 'start' | 'flow' | 'barrierCapture' | 'skinScan' | 'analyzing' | 'result' | 'error';

/** 피부장벽 측정 결과 — 얼굴 사진과 서버 응답 */
export type BarrierScan = { photoUri: string; result: SkinScanResult };

/** 경과 기록(record.skinScan)에 넣는 모양 — 서버 응답에 얼굴 사진을 붙인다 */
const toRecordSkinScan = (b: BarrierScan) => ({ ...b.result, photo: { uri: b.photoUri } });

export default function CameraScreen({ navigation, route }: { navigation: any; route?: any }) {
  const initialMode = parseMode(route?.params?.mode);
  const [mode, setMode] = useState<MeasureMode>(initialMode);
  const [stage, setStage] = useState<Stage>(firstStage(initialMode));
  const [kind, setKind] = useState<ExamKind>(initialMode === 'quick' ? 'quick' : 'new');
  /** 홈 루틴 "피부 상태 기록하기"로 들어오면 "이어서 기록하기"를 미리 골라 둔다 */
  const [startPick, setStartPick] = useState<'new' | 'followUp' | null>(
    route?.params?.pick === 'followUp' ? 'followUp' : null,
  );
  /** ExamStartScreen의 고른 상태를 씻기 위한 key — 포커스될 때마다 올린다 */
  const [resetToken, setResetToken] = useState(0);
  const [followUp, setFollowUp] = useState<{ folderId: string; target: MonitorTarget } | null>(null);
  const [capture, setCapture] = useState<ExamCapture | null>(null);
  const [analysis, setAnalysis] = useState<ExamAnalysis | null>(null);
  const [linkedFolder, setLinkedFolder] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barrierScan, setBarrierScan] = useState<BarrierScan | null>(null);
  /** 실패 화면의 "다시 촬영하기"가 어느 촬영으로 돌아갈지 */
  const [retryStage, setRetryStage] = useState<'flow' | 'barrierCapture'>('flow');
  const { body } = useProfile();
  /** 이번 회차에 남긴 기록 — 다시 촬영하면 앞 기록을 지우고 새 것으로 바꾼다 (두 줄로 남지 않게) */
  const followUpRecordRef = React.useRef<{ folderId: string; recordId: string } | null>(null);
  const barrierRecordRef = React.useRef<{ folderId: string; recordId: string } | null>(null);

  const { addRecord } = useRecords();
  const { setGuarded, guardedAction } = useLeaveGuard();
  const { findTarget, setDiagnosis } = useMonitoring();

  // dump 모드에서는 모델을 쓰지 않으므로 불러오지도 않는다
  React.useEffect(() => {
    if (DUMP_ANALYSIS || (mode !== 'atopy' && mode !== 'quick')) return;
    preloadModels();
    preloadDiseaseModel();
  }, [mode]);

  const routeRef = React.useRef(route);
  routeRef.current = route;

  /** 상태를 비우고 params가 가리키는 첫 단계로 — 아무것도 없으면 "피부 촬영" 시작 화면 */
  const resetTo = useCallback((params: any = {}) => {
    const next = parseMode(params.mode);
    setMode(next);
    setStage(firstStage(next));
    setStartPick(params.pick === 'followUp' ? 'followUp' : null);
    setKind(next === 'quick' ? 'quick' : 'new');
    setFollowUp(null);
    setCapture(null);
    setAnalysis(null);
    setLinkedFolder(null);
    setError(null);
    setBarrierScan(null);
    followUpRecordRef.current = null;
    barrierRecordRef.current = null;
    setResetToken((t) => t + 1);
    setGuarded(false);
  }, [setGuarded]);

  /** 촬영을 그만두고 이 탭의 시작 화면으로 */
  const exit = useCallback(() => resetTo({}), [resetTo]);

  /** 결과를 닫고 홈으로 (탭은 시작 화면으로 되돌려 둔다) */
  const closeToHome = useCallback(() => {
    resetTo({});
    navigation.navigate('Home');
  }, [navigation, resetTo]);

  /*
    탭이 (다시) 열릴 때마다 초기화한다. 홈·기록 화면의 버튼은 mode를 들고 이 탭으로 넘어온다
    (atopy / barrier / quick / quickBarrier). 파라미터는 **읽자마자 지운다** — 안 지우면 하단 바로
    이 탭을 다시 눌러도 지난번 갈래로 계속 들어간다.
  */
  useFocusEffect(
    useCallback(() => {
      const params = routeRef.current?.params ?? {};
      if (params.mode || params.pick) navigation.setParams({ mode: undefined, pick: undefined });
      resetTo(params);
    }, [navigation, resetTo]),
  );

  // 신규 아토피 결과는 "경과 폴더 생성"을 누르지 않고 나가면 폴더가 만들어지지 않는다 — 그때만 확인창
  React.useEffect(() => {
    setGuarded(stage === 'result' && mode === 'atopy' && kind === 'new' && !!capture && !linkedFolder);
  }, [stage, mode, kind, capture, linkedFolder, setGuarded]);

  /** 이번 분석을 기록으로 남긴다 (대상의 진단명은 다음 렌더에야 보이므로 predicted를 인자로 받는다) */
  const saveExamRecord = useCallback(
    (cap: ExamCapture, local: LocalAnalysisResult, predicted?: string) => {
      const igaName = GRADE_NAMES_KO[local.igaGradeName] ?? local.igaGradeName;
      addRecord({
        date: new Date(),
        disease: cap.target.diagnosis?.disease ?? predicted ?? igaName,
        sev: local.severity,
        itch: cap.itchVas != null ? `${cap.itchVas} / 10` : '등록 안함',
        region: PART_TO_REGION[cap.target.part],
        photoUri: cap.photoUri,
        siteLabel: cap.target.label,
        confidence: cap.session.confidence.score,
      });
    },
    [addRecord],
  );

  /** 촬영이 끝나면 온디바이스 분석을 돌리고 결과 화면으로 넘어간다 */
  const runAnalysis = useCallback(
    async (cap: ExamCapture) => {
      setCapture(cap);
      setRetryStage('flow');
      setStage('analyzing');
      /*
        "계속"을 누른 순간부터 결과창이 뜰 때까지 — 사용자가 로딩 스피너를 보는 두 번째 기다림.
        기능 이름을 라벨에 박아 둔다: 바로 스캔과 기록하기는 같은 코드를 지나가지만 도는 모델
        개수가 다르다(바로 스캔은 자가 없어 관심영역 대신 사진 전체를 보고, 이어서 기록하기는
        질환 분류를 통째로 건너뛴다). 라벨이 없으면 나중에 두 수치를 구분할 수 없다.
      */
      const kindLabel =
        cap.kind === 'quick' ? '피부 바로 스캔' : cap.kind === 'followUp' ? '이어서 기록하기' : '신규 증상 기록하기';
      startProfile(`분석 (${kindLabel})`);
      note(cap.session.scale ? `자=${cap.session.scale.kind}(관심영역 분석)` : '자 없음(사진 전체 분석)');
      try {
        // 촬영 후처리가 계산해 둔 조명 보정 게인 — 사진은 그대로 두고 모델 입력에만 적용한다.
        // 기준 세션이거나 조명을 추정하지 못한 촬영에서는 [1,1,1]이라 아무 효과가 없다.
        const colorGain = cap.session.colorNorm?.gain;

        // 진단명을 직접 넣어 둔 자리이거나 이어서 기록이면 질환 분류 모델은 건너뛴다
        const skipDisease = cap.kind === 'followUp' || !!cap.target.diagnosis?.diagnosed;
        if (skipDisease) note('질환 분류 건너뜀');
        let diseases: ExamAnalysis['diseases'] = null;
        let predictedDisease: string | undefined;
        // 이 촬영에서 최종적으로 쓰는 진단명 — 새로 분류했으면 그 이름, 건너뛰었으면 이미 알던 이름
        let diseaseName: string | undefined = cap.target.diagnosis?.disease;
        // 질환 분류 1순위가 "정상"이면 세그멘테이션·중증도 모델(analyzeLocal)은 돌리지 않고
        // 바로 "이상 없음"으로 확정한다 — 그래서 질환 분류를 먼저 끝내 둔다.
        let isNormalSkin = false;
        if (!skipDisease) {
          /*
            촬영 때 찾아 둔 자를 함께 넘긴다. 있으면 분류 모델도 그 관심영역을 기울기까지
            되돌려 보고(고개가 기운 사진이 반듯하게 선다), 없으면 모델 쪽이 알아서 피부가
            모여 있는 자리로 좁힌다 — 피부가 적게 담긴 사진에서 배경을 보고 판단하지 않도록.
          */
          const predictions = DUMP_ANALYSIS
            ? makeDumpDiseases(cap.session.id)
            : await spanAsync('질환 분류 전체', () => classifyDisease(cap.photoUri, colorGain, cap.session.scale));
          diseases = predictions.slice(0, 3);
          // 추정한 이름을 대상에 붙여 둔다 — 폴더 이름과 기록의 질환명이 여기서 나온다
          const top = predictions[0];
          if (top) {
            predictedDisease = top.label;
            diseaseName = top.label;
            isNormalSkin = top.key === '정상';
            setDiagnosis(cap.target.id, {
              diagnosed: false,
              disease: top.label,
              source: 'model',
              score: top.score,
              photoUri: cap.photoUri,
            });
          }
        }

        // 4가지 증상·IGA 모델(Stage2)은 아토피피부염 채점 기준으로 학습돼 있어서, 다른 질환에는
        // 근거가 없다 — "정상"은 예외로, 병변이 없다는 뜻이라 어떤 질환이든 항상 유효하다.
        const isAtopic = diseaseName === SEVERITY_SUPPORTED_DISEASE;
        const severitySupported = isNormalSkin || isAtopic;

        // dump 모드에서는 모델을 부르지 않고 지어낸 값으로 결과 화면을 채운다.
        // 세션 id를 씨앗으로 써서 같은 촬영이면 항상 같은 숫자가 나온다.
        // 세 갈래의 비용이 완전히 다르다: 정상은 모델을 아예 안 돌리고, 아토피는 Stage1+Stage2를
        // 다 돌리며, 그 밖의 질환은 Stage1만 돌린다. 어느 갈래였는지를 남겨야 수치가 읽힌다.
        note(isNormalSkin ? '정상 판정 → 세그·중증도 생략' : isAtopic ? 'Stage1+Stage2' : 'Stage1만(등급 생략)');
        const local = await spanAsync('병변 분석 전체', async () =>
          DUMP_ANALYSIS
            ? makeDumpLocalResult(cap.session.id)
            : isNormalSkin
              ? await normalSkinResult(cap.photoUri)
              : isAtopic
                /*
                  촬영 때 찾아 둔 자를 함께 넘긴다. 이게 있으면 분할이 **관심영역만** 보고(사진
                  전체를 512로 누르지 않는다) 병변 넓이를 부위 크기로 나눈 지수까지 나온다 —
                  회차 간 비교가 되는 유일한 넓이다. 없으면 예전과 똑같이 사진 전체를 분석한다.
                */
                ? await analyzeLocal(cap.photoUri, { colorGain, scale: cap.session.scale })
                /*
                  아토피가 아닌 질환 — **부위 표시와 넓이는 그대로 하고 등급만 비운다.**
                  자(scale)도 함께 넘겨야 관심영역을 크롭하고 넓이 지수가 나온다: 넓이 추이는
                  질환 이름과 무관하게 성립하고, 사용자는 앱이 무엇을 보고 판단했는지 볼 수 있어야 한다.
                */
                : await unsupportedDiseaseResult(cap.photoUri, colorGain, cap.session.scale),
        );

        // 경과 이어서 기록은 이미 이어붙일 폴더가 정해져 있으므로 바로 오늘 기록으로 남긴다
        if (cap.kind === 'followUp' && cap.folderId) {
          // 같은 회차에서 "다시 촬영"했으면 앞서 남긴 기록을 이번 것으로 바꾼다 (두 줄로 남지 않게)
          const prev = followUpRecordRef.current;
          if (prev && prev.folderId === cap.folderId) removeRecord(prev.folderId, prev.recordId);
          const saved = recordExam({
            folderId: cap.folderId,
            // 가이드와 어긋나게 찍혔으면 넓이만 빼고 나머지는 그대로 남긴다
            ...toFolderMetrics(local, cap.session.areaEligible),
            itchVas: cap.itchVas,
            photoUri: cap.photoUri,
            // 분석이 합성해 둔 병변 오버레이 — 폴더에서도 결과 화면과 같은 그림을 보여준다
            maskUri: local.maskUri ?? undefined,
          });
          followUpRecordRef.current = saved ? { folderId: cap.folderId, recordId: saved.record.id } : null;
          const folder = getFolder(cap.folderId);
          if (folder) setLinkedFolder({ id: folder.id, name: folder.name });
        }

        // 분석이 끝나는 순간 결과를 남긴다 — 예전에는 결과 화면의 "결과 저장하고 기록 보기"를
        // 눌러야 저장됐는데, 그 버튼을 못 누르고 나가면 방금 찍은 것이 통째로 사라졌다.
        // 저장은 앱이 알아서 하고, 버튼은 어디로 갈지만 고르게 한다.
        if (cap.kind !== 'quick') span('기록 저장', () => saveExamRecord(cap, local, predictedDisease));

        setAnalysis({ local, diseases, severitySupported });
        // 아토피 측정은 잴 것이 하나라 측정 선택 화면 없이 바로 결과(아토피 결과 상세)로 간다
        setStage('result');
        /*
          여기서 닫는 값은 **결과 화면이 그려지기 직전**까지다. setStage 뒤의 렌더(오버레이
          data URI를 <Image>가 디코딩하는 비용 포함)는 React가 이 함수 밖에서 하므로 잡히지 않는다 —
          "기타(미계측)"에도 들어오지 않는 시간이라, 체감과 수치가 어긋나면 그 자리를 의심할 것.
        */
        endProfile({
          병변수: local.regions.length,
          마스크면적: `${local.maskAreaPct}%`,
          질환: predictedDisease ?? diseaseName ?? '-',
        });
      } catch (e: any) {
        endProfile({ 실패: e?.message ?? 'unknown' });
        setError(e?.message ?? '알 수 없는 오류가 발생했어요');
        setStage('error');
      }
    },
    [setDiagnosis, saveExamRecord],
  );

  /**
   * 신규 아토피 측정 결과로 **새 경과 관찰 폴더를 만들고** 오늘 기록을 넣는다. 결과 화면의
   * "경과 폴더 생성" 버튼이 그 자리에서 바로 아토피 기록으로 넘어가야 해서 폴더 id를 돌려준다.
   */
  const linkToFolder = useCallback((): string => {
    if (!capture || !analysis) return '';
    const target = findTarget(capture.target.id) ?? capture.target;
    const id = ensureFolder({
      targetId: target.id,
      name: folderNameOf(target.label, target.diagnosis?.disease),
      disease: target.diagnosis?.disease,
    });
    recordExam({
      folderId: id,
      ...toFolderMetrics(analysis.local, capture.session.areaEligible),
      itchVas: capture.itchVas,
      photoUri: capture.photoUri,
      maskUri: analysis.local.maskUri ?? undefined,
      skinScan: null,
    });
    const folder = getFolder(id);
    if (folder) setLinkedFolder({ id: folder.id, name: folder.name });
    return id;
  }, [capture, analysis, findTarget]);

  /** 아토피 결과 → 아토피 기록(IGA 변화 목록). 이 측정 화면은 스택에서 내리고 그 자리에 연다 */
  const openAtopyHistory = useCallback(
    (folderId?: string) => {
      setGuarded(false);
      resetTo({});
      navigation.navigate('AtopyHistory', folderId ? { folderId } : undefined);
    },
    [navigation, setGuarded, resetTo],
  );

  /** 피부장벽 측정 — 얼굴 사진을 서버로 보내 분석하고, 피부 장벽 폴더에 오늘 기록으로 바로 남긴다 */
  const runBarrier = async (rawUri: string) => {
    setRetryStage('barrierCapture');
    setStage('analyzing');
    try {
      const { photo, result } = await analyzeFaceScan(rawUri, body.age);
      const scan = { photoUri: photo.uri, result };
      const folderId = ensureBarrierFolder();
      // 같은 회차에서 다시 쟀으면 앞서 남긴 기록을 이번 것으로 바꾼다
      const prevRec = barrierRecordRef.current;
      if (prevRec) removeRecord(prevRec.folderId, prevRec.recordId);
      const saved = recordBarrier({ folderId, skinScan: toRecordSkinScan(scan), itchVas: getDayItch(todayKey()) });
      barrierRecordRef.current = saved ? { folderId, recordId: saved.record.id } : null;
      const folder = getFolder(folderId);
      if (folder) setLinkedFolder({ id: folder.id, name: folder.name });
      setBarrierScan(scan);
      setStage('result');
    } catch (e: any) {
      setError(e?.message ?? '알 수 없는 오류가 발생했어요');
      setStage('error');
    }
  };

  // ───────────── 피부장벽 갈래 ─────────────
  if (stage === 'barrierCapture') {
    return (
      <MonitorCaptureScreen
        target={FACE_SCAN_TARGET}
        source="camera"
        measureArea={false}
        initialFacing="front"
        faceGuide
        onCancel={exit}
        onComplete={(processedUri) => runBarrier(processedUri)}
      />
    );
  }

  if (stage === 'result' && mode === 'barrier' && barrierScan) {
    return (
      <SkinScanResultPage
        photo={{ uri: barrierScan.photoUri }}
        result={barrierScan.result}
        onClose={closeToHome}
        onRetake={() => setStage('barrierCapture')}
        action={{
          label: '장벽 기록 보기',
          onPress: () => {
            setGuarded(false);
            resetTo({});
            navigation.navigate('BarrierHistory');
          },
        }}
      />
    );
  }

  // ───────────── 홈 "피부 바로 스캔 → 피부 장벽 측정" (저장 안 함) ─────────────
  if (stage === 'skinScan') {
    return <SkinScanScreen onExit={exit} />;
  }

  // ───────────── 아토피 갈래 (+ 피부 바로 스캔 → 피부 질환 측정) ─────────────
  if (stage === 'start') {
    return (
      <ExamStartScreen
        key={resetToken}
        initialPick={startPick}
        onNewExam={(measure) => {
          // 신규 증상 → 피부 장벽 측정: 얼굴 촬영 → 장벽 기록에 저장 (장벽 폴더는 하나뿐이라 이어 쌓인다)
          if (measure === 'barrier') {
            setMode('barrier');
            setStage('barrierCapture');
            return;
          }
          // 신규 증상 → 피부 질환 측정: 부위 선택 → 촬영 → 아토피 결과
          setKind('new');
          setFollowUp(null);
          setStage('flow');
        }}
        onFollowUp={(folderId, target) => {
          // 피부 장벽 폴더를 이어서 기록 — 장벽 측정 갈래로 (얼굴 촬영 → 장벽 기록에 저장)
          if (isBarrierFolder(getFolder(folderId))) {
            setMode('barrier');
            setStage('barrierCapture');
            return;
          }
          setKind('followUp');
          setFollowUp({ folderId, target });
          setStage('flow');
        }}
      />
    );
  }

  if (stage === 'flow') {
    return (
      <ExamFlow
        kind={kind}
        target={followUp?.target}
        folderId={followUp?.folderId}
        onExit={mode === 'quick' ? exit : () => setStage('start')}
        onCaptured={runAnalysis}
      />
    );
  }

  if (stage === 'result' && (mode === 'atopy' || mode === 'quick') && capture && analysis) {
    return (
      <ExamResultScreen
        capture={capture}
        analysis={analysis}
        barrier={null}
        linkedFolder={linkedFolder}
        onLink={linkToFolder}
        onOpenFolder={openAtopyHistory}
        onOpenRecords={() => openAtopyHistory()}
        onClose={() => guardedAction(closeToHome)}
      />
    );
  }

  return (
    <View style={styles.container}>
      {stage === 'analyzing' ? (
        <>
          <ActivityIndicator size="large" color={AppColors.greenTop} />
          <View style={{ height: 18 }} />
          <Text style={styles.title}>피부를 분석하는 중...</Text>
          <View style={{ height: 8 }} />
          <Text style={styles.sub}>
            {mode === 'barrier'
              ? '얼굴 부위를 나누고 주름·모공·수분량을 측정하고 있어요'
              : 'AI가 병변과 증상별 중증도를 분석하고 있어요'}
          </Text>
        </>
      ) : (
        <>
          <MaterialIcons name="error-outline" size={36} color="#FF6B6B" />
          <View style={{ height: 14 }} />
          <Text style={styles.title}>분석에 실패했어요</Text>
          <View style={{ height: 8 }} />
          <Text style={styles.sub}>{error ?? '기기에서 분석을 완료하지 못했어요'}</Text>
          <View style={{ height: 18 }} />
          <Pressable style={styles.retryBtn} onPress={() => setStage(retryStage)}>
            <Text style={styles.retryBtnText}>다시 촬영하기</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={mode === 'atopy' ? () => setStage('start') : mode === 'quick' ? () => setStage('flow') : exit}>
            <MaterialIcons name="chevron-left" size={24} color="#FFFFFF" />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14171C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: AppColors.greenTop, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: '#16320A' },
  closeBtn: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
