import { z } from 'zod';

/**
 * Result型 - Either型の改善版
 * 
 * より直感的で関数型プログラミングに優しい設計
 * - success/errorで成功・失敗が明確
 * - data/errorで値・エラーが明確
 * - チェーンメソッドで関数合成をサポート
 */
export type Result<T, E = Error> = 
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// Result型にメソッドチェーンを追加するための拡張
declare module './types.js' {
  namespace Result {
    interface ResultMethods<T, E> {
      map<U>(fn: (data: T) => U): Result<U, E>;
      flatMap<U>(fn: (data: T) => Result<U, E>): Result<U, E>;
      mapError<F>(fn: (error: E) => F): Result<T, F>;
    }
  }
}

// メソッドチェーンのためのResult型拡張
export function extendResult<T, E>(result: Result<T, E>): Result<T, E> & {
  map<U>(fn: (data: T) => U): Result<U, E>;
  flatMap<U>(fn: (data: T) => Result<U, E>): Result<U, E>;
  mapError<F>(fn: (error: E) => F): Result<T, F>;
} {
  return Object.assign(result, {
    map: <U>(fn: (data: T) => U): Result<U, E> => Result.map(result, fn),
    flatMap: <U>(fn: (data: T) => Result<U, E>): Result<U, E> => Result.flatMap(result, fn),
    mapError: <F>(fn: (error: E) => F): Result<T, F> => Result.mapError(result, fn)
  });
}

// === Result型ファクトリ関数 ===
export const Ok = <T, E = Error>(data: T): Result<T, E> => ({
  success: true,
  data
});

export const Err = <T, E = Error>(error: E): Result<T, E> => ({
  success: false,
  error
});

// === Result型ユーティリティ関数 ===
export namespace Result {
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
   * 失敗時の代替値を提供
   */
  export const orElse = <T, E>(
    result: Result<T, E>,
    alternative: T
  ): T => {
    return result.success ? result.data : alternative;
  };

  /**
   * 失敗時の代替Result型を提供
   */
  export const orElseGet = <T, E>(
    result: Result<T, E>,
    getAlternative: (error: E) => Result<T, E>
  ): Result<T, E> => {
    return result.success ? result : getAlternative(result.error);
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

  /**
   * Predicateによる検証
   */
  export const filter = <T, E>(
    result: Result<T, E>,
    predicate: (data: T) => boolean,
    errorOnFalse: E
  ): Result<T, E> => {
    if (!result.success) return result;
    return predicate(result.data) ? result : Err(errorOnFalse);
  };

  /**
   * 複数のResult型を並列処理し、全て成功した場合のみ成功
   * タプル版 - 異なる型を組み合わせ可能
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
    return allTuple(results) as Result<
      { [K in keyof T]: T[K] extends Promise<Result<infer U, any>> ? U : never },
      T[number] extends Promise<Result<any, infer E>> ? E : never
    >;
  };

  /**
   * 最初に成功したResult型を返す（Alternativeパターン）
   */
  export const firstSuccess = <T, E>(
    results: Result<T, E>[]
  ): Result<T, E[]> => {
    const errors: E[] = [];
    for (const result of results) {
      if (result.success) {
        return result;
      }
      errors.push(result.error);
    }
    return Err(errors);
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
   * 条件に応じてResult型を返す
   */
  export const when = <T, E>(
    condition: boolean,
    onTrue: () => Result<T, E>,
    onFalse: () => Result<T, E>
  ): Result<T, E> => {
    return condition ? onTrue() : onFalse();
  };

  /**
   * 非同期版の条件分岐
   */
  export const whenAsync = async <T, E>(
    condition: boolean,
    onTrue: () => Promise<Result<T, E>>,
    onFalse: () => Promise<Result<T, E>>
  ): Promise<Result<T, E>> => {
    return condition ? await onTrue() : await onFalse();
  };
}

// === パイプライン合成ユーティリティ ===

/**
 * 関数型パイプライン - 値を順次変換
 */
export function pipe<T>(initial: T): {
  pipe<U>(fn: (value: T) => U): ReturnType<typeof pipe<U>>;
  value(): T;
} {
  return {
    pipe<U>(fn: (value: T) => U) {
      return pipe(fn(initial));
    },
    value(): T {
      return initial;
    }
  };
}

/**
 * Result型専用パイプライン
 */
export function resultPipe<T, E>(initial: Result<T, E>) {
  return {
    map<U>(fn: (data: T) => U) {
      return resultPipe(Result.map(initial, fn));
    },
    flatMap<U>(fn: (data: T) => Result<U, E>) {
      return resultPipe(Result.flatMap(initial, fn));
    },
    mapError<F>(fn: (error: E) => F) {
      return resultPipe(Result.mapError(initial, fn));
    },
    filter(predicate: (data: T) => boolean, errorOnFalse: E) {
      return resultPipe(Result.filter(initial, predicate, errorOnFalse));
    },
    value(): Result<T, E> {
      return initial;
    }
  };
}

/**
 * 非同期Result型パイプライン
 */
export const asyncResultPipe = <T, E>(initial: Promise<Result<T, E>>) => {
  return {
    async map<U>(fn: (data: T) => U) {
      const result = await initial;
      return asyncResultPipe(Promise.resolve(Result.map(result, fn)));
    },
    async flatMap<U>(fn: (data: T) => Result<U, E>) {
      const result = await initial;
      return asyncResultPipe(Promise.resolve(Result.flatMap(result, fn)));
    },
    async flatMapAsync<U>(fn: (data: T) => Promise<Result<U, E>>) {
      const result = await initial;
      return asyncResultPipe(Result.flatMapAsync(result, fn));
    },
    async mapError<F>(fn: (error: E) => F) {
      const result = await initial;
      return asyncResultPipe(Promise.resolve(Result.mapError(result, fn)));
    },
    async value(): Promise<Result<T, E>> {
      return await initial;
    }
  };
};

// === 高度な合成パターン ===

export namespace AsyncResult {
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
    return Result.allAsync(promises);
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
}

// === Zodエラー型定義 ===
export interface ZodParseError {
  type: 'VALIDATION_ERROR';
  zodError: z.ZodError;
}

// === 後方互換性のためのEither型サポート（段階的移行用） ===
export type Either<L, R> =
  | { type: 'left'; value: L }
  | { type: 'right'; value: R };

export const left = <L, R>(value: L): Either<L, R> => ({ type: 'left', value });
export const right = <L, R>(value: R): Either<L, R> => ({ type: 'right', value });

// === Either型 <-> Result型 変換関数 ===
export const eitherToResult = <T, E>(either: Either<E, T>): Result<T, E> => {
  return either.type === 'right' ? Ok(either.value) : Err(either.value);
};

export const resultToEither = <T, E>(result: Result<T, E>): Either<E, T> => {
  return result.success ? right(result.data) : left(result.error);
};

export const StudentIdSchema = z.string()
  .regex(/^[A-Z0-9]{1,20}$/)
  .brand<'StudentId'>();

export const CourseIdSchema = z.string()
  .regex(/^[A-Z0-9]{1,20}$/)
  .brand<'CourseId'>();

export const SemesterSchema = z.string()
  .regex(/^\d{4}-(spring|summer|fall)$/)
  .brand<'Semester'>();

export type StudentId = z.infer<typeof StudentIdSchema>;
export type CourseId = z.infer<typeof CourseIdSchema>;
export type Semester = z.infer<typeof SemesterSchema>;

// === 不変要素（履修の本質的識別子） ===
export const EnrollmentIdentitySchema = z.object({
  studentId: StudentIdSchema,
  courseId: CourseIdSchema,
  semester: SemesterSchema
});

export type EnrollmentIdentity = z.infer<typeof EnrollmentIdentitySchema>;

// === 共通スキーマ（不変要素 + バージョン） ===
export const EnrollmentBaseSchema = EnrollmentIdentitySchema.extend({
  version: z.number().min(1)
});

export type EnrollmentBase = z.infer<typeof EnrollmentBaseSchema>;

// === 各状態のスキーマ（共通スキーマを拡張） ===
export const RequestedEnrollmentSchema = EnrollmentBaseSchema.extend({
  status: z.literal('requested'),
  requestedAt: z.date()
});

export const ApprovedEnrollmentSchema = EnrollmentBaseSchema.extend({
  status: z.literal('approved'),
  requestedAt: z.date(),
  approvedAt: z.date(),
  approvedBy: z.string()
});

export const CancelledEnrollmentSchema = EnrollmentBaseSchema.extend({
  status: z.literal('cancelled'),
  requestedAt: z.date(),
  cancelledAt: z.date(),
  cancelReason: z.string().optional()
});

export const EnrollmentSchema = z.discriminatedUnion('status', [
  RequestedEnrollmentSchema,
  ApprovedEnrollmentSchema,
  CancelledEnrollmentSchema
]);

export type RequestedEnrollment = z.infer<typeof RequestedEnrollmentSchema>;
export type ApprovedEnrollment = z.infer<typeof ApprovedEnrollmentSchema>;
export type CancelledEnrollment = z.infer<typeof CancelledEnrollmentSchema>;
export type Enrollment = z.infer<typeof EnrollmentSchema>;

export type EnrollmentError =
  | { type: 'ALREADY_ENROLLED'; message: string }
  | { type: 'COURSE_NOT_FOUND'; message: string }
  | { type: 'STUDENT_NOT_FOUND'; message: string }
  | { type: 'INVALID_SEMESTER'; message: string }
  | { type: 'VALIDATION_ERROR'; message: string };