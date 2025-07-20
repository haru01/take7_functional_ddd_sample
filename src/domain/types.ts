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