import { Result, map, flatMap, mapError } from './result.js';
import { flatMapAsync } from './result.js';

/**
 * Result型パイプライン処理
 * 
 * 関数型プログラミングスタイルでのチェーン操作をサポート
 */

/**
 * Result型専用パイプライン - エラーが発生すると途中で停止
 */
export function resultPipe<T, E>(initial: Result<T, E>): {
  map<U>(fn: (data: T) => U): ReturnType<typeof resultPipe<U, E>>;
  flatMap<U>(fn: (data: T) => Result<U, E>): ReturnType<typeof resultPipe<U, E>>;
  mapError<F>(fn: (error: E) => F): ReturnType<typeof resultPipe<T, F>>;
  filter(predicate: (data: T) => boolean, errorOnFalse: E): ReturnType<typeof resultPipe<T, E>>;
  value(): Result<T, E>;
} {
  return {
    map<U>(fn: (data: T) => U) {
      return resultPipe(map(initial, fn));
    },
    flatMap<U>(fn: (data: T) => Result<U, E>) {
      return resultPipe(flatMap(initial, fn));
    },
    mapError<F>(fn: (error: E) => F) {
      return resultPipe(mapError(initial, fn));
    },
    filter(predicate: (data: T) => boolean, errorOnFalse: E) {
      const filtered = initial.success && predicate(initial.data) 
        ? initial 
        : { success: false as const, error: errorOnFalse };
      return resultPipe(filtered);
    },
    value(): Result<T, E> {
      return initial;
    }
  };
}

/**
 * 非同期Result型パイプライン (簡素化版)
 */
export function asyncResultPipe<T, E>(initial: Promise<Result<T, E>>): {
  value(): Promise<Result<T, E>>;
} {
  return {
    async value(): Promise<Result<T, E>> {
      return await initial;
    }
  };
};