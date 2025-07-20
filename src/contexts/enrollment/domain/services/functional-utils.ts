/**
 * 関数型プログラミングユーティリティ
 * 
 * Result型の強化されたモナド合成を活用した実用例
 */

import {
  type Result,
  type StudentId,
  type CourseId,
  type Semester,
  Ok,
  Err,
  map,
  match,
  resultPipe,
  asyncResultPipe,
  parallel,
  sequence,
  retry,
  race
} from '../../../../shared/types/index';
import {
  type RequestedEnrollment
} from '../entities/enrollment-types';

import { requestEnrollment } from '../aggregates/enrollment-aggregate';
import { createBusinessRuleError, type EnrollmentError } from '../errors/errors';

// === 複数の履修申請を処理する実用例 ===

/**
 * 複数の履修申請を並列処理
 */
export async function processMultipleEnrollments(
  enrollmentRequests: Array<{
    studentId: string;
    courseId: string;
    semester: string;
  }>
): Promise<Result<RequestedEnrollment[], EnrollmentError[]>> {
  // 並列処理でのResult型合成
  const enrollmentResults = await parallel(
    enrollmentRequests.map(request => async () => {
      // 各申請を個別に処理
      const result = requestEnrollment(request.studentId, request.courseId, request.semester);
      // ドメインイベントを除いてRequestedEnrollmentのみを返す
      return map(result, ({ domainEvent, ...enrollment }) => enrollment);
    })
  );

  // 成功した申請のみを収集、失敗は別途エラー配列に
  return match(enrollmentResults, {
    success: (enrollments) => Ok(enrollments),
    error: (error) => Err([error])
  });
}

/**
 * フォールバック戦略付きの履修申請
 */
export function requestEnrollmentWithFallback(
  primaryRequest: {
    studentId: string;
    courseId: string;
    semester: string;
  },
  fallbackCourseIds: string[]
): Result<RequestedEnrollment, EnrollmentError[]> {
  // メインの申請を試行
  const primaryResult = requestEnrollment(
    primaryRequest.studentId,
    primaryRequest.courseId,
    primaryRequest.semester
  );

  // ドメインイベントを除いてRequestedEnrollmentのみを扱う
  const primaryResultWithoutEvent = map(primaryResult, ({ domainEvent, ...enrollment }) => enrollment);

  if (primaryResultWithoutEvent.success) {
    return primaryResultWithoutEvent;
  }

  // フォールバック候補で再試行
  const fallbackResults = fallbackCourseIds.map(fallbackCourseId => {
    const result = requestEnrollment(
      primaryRequest.studentId,
      fallbackCourseId,
      primaryRequest.semester
    );
    return map(result, ({ domainEvent, ...enrollment }) => enrollment);
  });

  // 最初に成功したものを返す
  const errors: EnrollmentError[] = [primaryResultWithoutEvent.error];
  for (const result of fallbackResults) {
    if (result.success) {
      return Ok(result.data);
    }
    errors.push(result.error);
  }
  
  return Err(errors);
}

/**
 * 条件付き履修申請処理
 */
export async function conditionalEnrollmentProcessing(
  studentId: string,
  courseId: string,
  semester: string,
  conditions: {
    checkPrerequisites: () => Promise<Result<boolean, EnrollmentError>>;
    checkCapacity: () => Promise<Result<boolean, EnrollmentError>>;
    checkScheduleConflict: () => Promise<Result<boolean, EnrollmentError>>;
  }
): Promise<Result<RequestedEnrollment, EnrollmentError>> {
  // 全ての前提条件を並列チェック
  const conditionsResult = await parallel([
    conditions.checkPrerequisites,
    conditions.checkCapacity,
    conditions.checkScheduleConflict
  ]);

  return match(conditionsResult, {
    success: ([prereqOk, capacityOk, scheduleOk]) => {
      // 全ての条件が満たされているかチェック
      const allConditionsMet = prereqOk && capacityOk && scheduleOk;
      
      if (allConditionsMet) {
        const result = requestEnrollment(studentId, courseId, semester);
        return map(result, ({ domainEvent, ...enrollment }) => enrollment);
      } else {
        return Err(createBusinessRuleError(
          'ENROLLMENT_CONDITIONS_NOT_MET',
          `Enrollment conditions not met: prereq=${prereqOk}, capacity=${capacityOk}, schedule=${scheduleOk}`,
          'ENROLLMENT_CONDITIONS_NOT_MET',
          { prereqOk, capacityOk, scheduleOk }
        ));
      }
    },
    error: (error) => Err(error)
  });
}

/**
 * リトライ機能付き履修申請
 */
export async function requestEnrollmentWithRetry(
  studentId: string,
  courseId: string,
  semester: string,
  retryOptions: {
    maxAttempts: number;
    delayMs: number;
    shouldRetry: (error: EnrollmentError) => boolean;
  }
): Promise<Result<RequestedEnrollment, EnrollmentError>> {
  return retry(
    async () => {
      // 非同期操作として履修申請を実行
      const result = requestEnrollment(studentId, courseId, semester);
      return Promise.resolve(
        map(result, ({ domainEvent, ...enrollment }) => enrollment)
      );
    },
    {
      maxAttempts: retryOptions.maxAttempts,
      delay: () => retryOptions.delayMs,
      shouldRetry: retryOptions.shouldRetry
    }
  );
}

/**
 * バッチ処理での段階的実行
 */
export async function processEnrollmentBatch(
  enrollmentRequests: Array<{
    studentId: string;
    courseId: string;
    semester: string;
    priority: number;
  }>
): Promise<Result<RequestedEnrollment[], EnrollmentError[]>> {
  // 優先度順にソート
  const sortedRequests = [...enrollmentRequests].sort(
    (a, b) => b.priority - a.priority
  );

  // 順次実行（前の結果を次の処理に渡す）
  const processedResults = await sequence(
    sortedRequests.map(request => async (previousResults) => {
      console.log(`Processing enrollment for student ${request.studentId}, course ${request.courseId}`);
      console.log(`Previous results count: ${previousResults?.length || 0}`);
      
      const result = requestEnrollment(request.studentId, request.courseId, request.semester);
      return Promise.resolve(
        map(result, ({ domainEvent, ...enrollment }) => enrollment)
      );
    })
  );

  return match(processedResults, {
    success: (enrollments) => Ok(enrollments),
    error: (error) => Err([error])
  });
}

/**
 * 高度な組み合わせ処理
 */
export async function advancedEnrollmentProcessing(
  studentId: string,
  courseOptions: Array<{
    courseId: string;
    semester: string;
    alternativeSemesters?: string[];
  }>
): Promise<Result<RequestedEnrollment[], EnrollmentError[]>> {
  const allAttempts: Promise<Result<RequestedEnrollment, EnrollmentError>>[] = [];

  // 各コースとその代替学期を全て試行候補に追加
  for (const option of courseOptions) {
    // メインの学期
    allAttempts.push(
      Promise.resolve(
        map(
          requestEnrollment(studentId, option.courseId, option.semester),
          ({ domainEvent, ...enrollment }) => enrollment
        )
      )
    );

    // 代替学期
    if (option.alternativeSemesters) {
      for (const altSemester of option.alternativeSemesters) {
        allAttempts.push(
          Promise.resolve(
            map(
              requestEnrollment(studentId, option.courseId, altSemester),
              ({ domainEvent, ...enrollment }) => enrollment
            )
          )
        );
      }
    }
  }

  // レース実行 - 最初に成功したものを採用
  const raceResult = await race(
    allAttempts.map(promise => () => promise)
  );

  return match(raceResult, {
    success: (enrollment) => Ok([enrollment]),
    error: (errors) => Err(errors)
  });
}

// === エクスポート ===
export {
  map,
  match,
  resultPipe,
  asyncResultPipe,
  parallel,
  sequence,
  retry,
  race
};