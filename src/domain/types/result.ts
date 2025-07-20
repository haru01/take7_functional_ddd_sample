import { z } from 'zod';

/**
 * Result型 - 関数型エラーハンドリングの基盤
 * 
 * 設計思想:
 * - 例外ではなく値としてエラーを扱う
 * - 型システムでエラーハンドリングを強制
 * - 関数合成とチェーン操作をサポート
 */

export type Result<T, E = Error> = 
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// === ファクトリ関数 ===

export const Ok = <T, E = Error>(data: T): Result<T, E> => ({
  success: true,
  data
});

export const Err = <T, E = Error>(error: E): Result<T, E> => ({
  success: false,
  error
});

// === 基本的なResult型操作 ===

/**
 * 成功値を変換する（Functor）
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> => {
  return result.success ? Ok(fn(result.data)) : result;
};

/**
 * Result型を返す関数でチェーン（Monad）
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> => {
  return result.success ? fn(result.data) : result;
};

/**
 * 非同期関数でのチェーン
 */
export const flatMapAsync = async <T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> => {
  return result.success ? await fn(result.data) : result;
};

/**
 * エラーを変換する
 */
export const mapError = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> => {
  return result.success ? result : Err(fn(result.error));
};

/**
 * パターンマッチング
 */
export const match = <T, E, U>(
  result: Result<T, E>,
  matcher: {
    success: (data: T) => U;
    error: (error: E) => U;
  }
): U => {
  return result.success 
    ? matcher.success(result.data)
    : matcher.error(result.error);
};

/**
 * 複数のResult型を全て成功させる
 */
export const all = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const data: T[] = [];
  for (const result of results) {
    if (!result.success) {
      return result;
    }
    data.push(result.data);
  }
  return Ok(data);
};

/**
 * 複数のResult型を全て成功させる（タプル版）
 */
export const allTuple = <T extends readonly [...Result<any, any>[]]>(
  results: T
): Result<
  { [K in keyof T]: T[K] extends Result<infer U, any> ? U : never },
  T[number] extends Result<any, infer E> ? E : never
> => {
  const data: any[] = [];
  for (const result of results) {
    if (!result.success) {
      return result as any;
    }
    data.push(result.data);
  }
  return Ok(data as any);
};

/**
 * Zodスキーマを使った安全なパース
 */
export const parseWith = <T, E = ZodParseError>(
  schema: z.ZodSchema<T>,
  data: unknown,
  mapError?: (zodError: z.ZodError) => E
): Result<T, E> => {
  const parseResult = schema.safeParse(data);
  if (parseResult.success) {
    return Ok(parseResult.data);
  }
  const error = mapError 
    ? mapError(parseResult.error)
    : ({ type: 'VALIDATION_ERROR', zodError: parseResult.error } as any);
  return Err(error);
};

/**
 * 例外を捕捉してResult型に変換
 */
export const from = <T>(fn: () => T): Result<T, Error> => {
  try {
    return Ok(fn());
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * 非同期例外を捕捉してResult型に変換
 */
export const fromAsync = async <T>(fn: () => Promise<T>): Promise<Result<T, Error>> => {
  try {
    const data = await fn();
    return Ok(data);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
};

// === Zodエラー型定義 ===
export interface ZodParseError {
  type: 'VALIDATION_ERROR';
  zodError: z.ZodError;
}