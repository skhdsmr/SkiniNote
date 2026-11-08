import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppColors } from '../theme';
import BottomNav from './BottomNav';
import HomeScreen from '../screens/HomeScreen';
import RecordsScreen from '../screens/RecordsScreen';
import CameraScreen from '../screens/CameraScreen';
import MonitoringMapScreen from '../screens/MonitoringMapScreen';
import TriggerDetectiveScreen from '../insights/TriggerDetectiveScreen';
import ScratchReportScreen from '../insights/ScratchReportScreen';
import RecoveryTrackerScreen from '../insights/RecoveryTrackerScreen';
import DataExportScreen from '../screens/DataExportScreen';
import RoutineScreen from '../screens/RoutineScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MonitoringFolderScreen from '../folders/screens/MonitoringFolderScreen';
import MonitoringDetailScreen from '../folders/screens/MonitoringDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** 카메라를 제외한 화면은 상단 세이프 에어리어 패딩을 준다 (카메라는 전체 화면을 써야 한다) */
function withTopInset<P extends object>(Component: React.ComponentType<P>) {
  return function Wrapped(props: P) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: AppColors.bg }} edges={['top']}>
        <Component {...props} />
      </SafeAreaView>
    );
  };
}

const HomeWrapped = withTopInset(HomeScreen);
const RecordsWrapped = withTopInset(RecordsScreen);
const RoutineWrapped = withTopInset(RoutineScreen);
const ProfileWrapped = withTopInset(ProfileScreen);

/**
 * 하단 바가 붙어 있는 5개 탭 — 앱의 기본 화면.
 * 홈 · 피부 촬영 · 기록 · 루틴 · 내 정보. 경과 관찰(전신 지도)은 기록 탭 안에서 스택 화면으로 열린다.
 */
function Tabs() {
  return (
    <Tab.Navigator
      // 모든 탭을 처음부터 마운트 (Flutter IndexedStack 동작과 동일하게 상태 보존)
      backBehavior="none"
      screenOptions={{ headerShown: false, lazy: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      {/* 탭 순서 = 하단 바 순서 */}
      <Tab.Screen name="Home" component={HomeWrapped} />
      <Tab.Screen name="Camera" component={CameraScreen} />
      <Tab.Screen name="Records" component={RecordsWrapped} />
      <Tab.Screen name="Routine" component={RoutineWrapped} />
      <Tab.Screen name="Profile" component={ProfileWrapped} />
    </Tab.Navigator>
  );
}

/**
 * 탭 위에 스택을 한 겹 얹는다 — 경과 관찰 화면들과 증상별 특화 화면이 여기
 * 올라탄다. 탭 화면 안에서 navigate('Monitoring') 같이 탭에 없는 이름을 부르면 이 부모 스택으로
 * 올라와 처리된다(navigate('Camera')처럼 탭 안에 있는 이름은 그대로 탭에서 해결되므로 기존
 * 코드에 영향이 없다).
 */
export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: AppColors.bg } }}
    >
      <Stack.Screen name="Tabs" component={Tabs} />
      {/* 경과 관찰 — 지켜보는 자리를 몸 그림으로 보여주고, 자리를 눌러 그 자리의 기록으로 들어간다.
          자체 상단 바(TopBar)를 그리므로 네이티브 헤더는 끈다(headerShown: false 규칙). */}
      <Stack.Screen name="Monitoring" component={MonitoringMapScreen} />
      <Stack.Screen name="MonitoringFolder" component={MonitoringFolderScreen} />
      <Stack.Screen name="MonitoringDetail" component={MonitoringDetailScreen} />
      {/* 증상 묶음별 특화 화면 — 모두 { folderId }를 받는다 */}
      <Stack.Screen name="TriggerDetective" component={TriggerDetectiveScreen} />
      <Stack.Screen name="ScratchReport" component={ScratchReportScreen} />
      <Stack.Screen name="RecoveryTracker" component={RecoveryTrackerScreen} />
      <Stack.Screen
        name="DataExport"
        component={DataExportScreen}
        options={{ headerShown: true, title: '데이터 다운로드', headerTintColor: AppColors.ink }}
      />
    </Stack.Navigator>
  );
}
