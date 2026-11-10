import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * 앱 진입점 — 웹에서는 Skia(CanvasKit wasm)를 **먼저** 불러온 뒤에 앱 코드를 불러온다.
 *
 * 순서가 중요하다: @shopify/react-native-skia의 `Skia` 객체는 import되는 순간 전역 CanvasKit으로
 * 만들어진다. 앱 코드(품질 판정·자 검출·마스크)를 먼저 import하면 CanvasKit이 아직 없어
 * `Skia.Image`가 undefined가 된다. 그래서 앱 본체(AppRoot.tsx)는 로딩이 끝난 뒤 require한다.
 * wasm은 public/canvaskit.wasm에서 받는다 (node_modules/canvaskit-wasm 사본).
 * 네이티브에서는 Skia가 이미 들어 있어 바로 그린다.
 */
const loadRoot = (): React.ComponentType => require('./AppRoot').default;

export default function App() {
  const [Root, setRoot] = useState<React.ComponentType | null>(() => (Platform.OS === 'web' ? null : loadRoot()));
  useEffect(() => {
    if (Root) return;
    const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web/LoadSkiaWeb');
    LoadSkiaWeb({ locateFile: (file: string) => `/${file}` })
      .then(() => setRoot(() => loadRoot()))
      .catch((e: any) => console.error('[skia] CanvasKit을 불러오지 못했어요', e));
  }, [Root]);
  return Root ? <Root /> : null;
}
