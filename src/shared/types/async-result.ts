import { Result, Ok, Err, all } from './result';

/**
 * 非同期Result型処理のユーティリティ
 * 
 * 複数の非同期操作を安全に組み合わせるためのヘルパー関数群
 */

/**
 * 複数の非同期操作を順次実行（直列）
 */
export const sequence = async <T, E>(
  operations: Array<(prev?: any) => Promise<Result<T, E>>>
): Promise<Result<T[], E>> => {
  const results: T[] = [];
  let previousResult: any = undefined;

  for (const operation of operations) {
    const result = await operation(previousResult);
    if (!result.success) {
      return result;
    }
    results.push(result.data);
    previousResult = result.data;
  }

  return Ok(results);
};

/**
 * 複数の非同期操作を並列実行
 */
export const parallel = async <T, E>(
  operations: Array<() => Promise<Result<T, E>>>
): Promise<Result<T[], E>> => {
  const promises = operations.map(op => op());
  return allAsync(promises);
};

/**
 * レースコンディション - 最初に成功したものを採用
 */
export const race = async <T, E>(
  operations: Array<() => Promise<Result<T, E>>>
): Promise<Result<T, E[]>> => {
  const promises = operations.map(op => op());
  const results = await Promise.allSettled(promises);
  
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      return result.value;
    }
  }

  const errors: E[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (!result.value.success) {
        errors.push(result.value.error);
      }
    } else {
      errors.push(result.reason as E);
    }
  }

  return Err(errors);
};

/**
 * リトライ機能付き非同期実行
 */
export const retry = async <T, E>(
  operation: () => Promise<Result<T, E>>,
  options: {
    maxAttempts: number;
    delay?: (attempt: number) => number;
    shouldRetry?: (error: E) => boolean;
  }
): Promise<Result<T, E>> => {
  const { maxAttempts, delay = () => 1000, shouldRetry = () => true } = options;

  let lastError: E | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await operation();
    
    if (result.success) {
      return result;
    }

    lastError = result.error;
    
    if (attempt === maxAttempts || !shouldRetry(result.error)) {
      return result;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay(attempt)));
    }
  }

  return Err(lastError!);
};

/**
 * 非同期Result型を並列実行
 */
export const allAsync = async <T, E>(
  promises: Promise<Result<T, E>>[]
): Promise<Result<T[], E>> => {
  const results = await Promise.all(promises);
  return all(results);
};

/**
 * 非同期Result型のタプル版
 */
export const allTupleAsync = async <T extends readonly [...Promise<Result<any, any>>[]]>(
  promises: T
): Promise<Result<
  { [K in keyof T]: T[K] extends Promise<Result<infer U, any>> ? U : never },
  T[number] extends Promise<Result<any, infer E>> ? E : never
>> => {
  const results = await Promise.all(promises);
  const data: any[] = [];
  for (const result of results) {
    if (!result.success) {
      return result as any;
    }
    data.push(result.data);
  }
  return Ok(data as any);
};