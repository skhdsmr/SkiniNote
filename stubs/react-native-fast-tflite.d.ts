// 스텁(stubs/react-native-fast-tflite.js)이 흉내 내는 범위만큼의 타입.
// 패키지를 설치하지 않으므로 src/ai의 `import type { TensorflowModel }`이 여기서 풀린다.
declare module 'react-native-fast-tflite' {
  export type TypedArray = Float32Array | Int32Array | Uint8Array | Int8Array | Float64Array;
  export interface TensorflowModel {
    run(input: ArrayBuffer[]): Promise<ArrayBuffer[]>;
    runSync(input: ArrayBuffer[]): ArrayBuffer[];
    inputs: unknown[];
    outputs: unknown[];
  }
  export function loadTensorflowModel(source: unknown, delegates?: string[]): Promise<TensorflowModel>;
}
