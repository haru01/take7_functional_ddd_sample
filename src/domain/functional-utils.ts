/**
 * 関数型プログラミングユーティリティ
 * 
 * Result型の強化されたモナド合成を活用した実用例
 */

import {
  type Result,
  type EnrollmentError,
  type RequestedEnrollment,
  type StudentId,
  type CourseId,
  type Semester,
  Ok,
  Err,
  Result as ResultUtils,
  resultPipe,
  asyncResultPipe,
  AsyncResult
} from './types.js';

import { requestEnrollment } from './enrollment.js';

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
  const enrollmentResults = await AsyncResult.parallel(
    enrollmentRequests.map(request => async () => {
      // 各申請を個別に処理
      return Promise.resolve(
        requestEnrollment(request.studentId, request.courseId, request.semester)
      );
    })
  );

  // 成功した申請のみを収集、失敗は別途エラー配列に
  return ResultUtils.match(enrollmentResults, {
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

  if (primaryResult.success) {
    return primaryResult;
  }

  // フォールバック候補で再試行
  const fallbackResults = fallbackCourseIds.map(fallbackCourseId =>
    requestEnrollment(
      primaryRequest.studentId,
      fallbackCourseId,
      primaryRequest.semester
    )
  );

  // 最初に成功したものを返す
  const firstSuccess = ResultUtils.firstSuccess(fallbackResults);
  
  return ResultUtils.match(firstSuccess, {
    success: (enrollment) => Ok(enrollment),
    error: (errors) => Err([primaryResult.error, ...errors])
  });
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
  const conditionsResult = await AsyncResult.parallel([
    conditions.checkPrerequisites,
    conditions.checkCapacity,
    conditions.checkScheduleConflict
  ]);

  return ResultUtils.match(conditionsResult, {
    success: ([prereqOk, capacityOk, scheduleOk]) => {
      // 全ての条件が満たされているかチェック
      const allConditionsMet = prereqOk && capacityOk && scheduleOk;
      
      return ResultUtils.when(
        allConditionsMet || false,
        () => requestEnrollment(studentId, courseId, semester),
        () => Err({
          type: 'BUSINESS_RULE_VIOLATION' as const,
          message: `Enrollment conditions not met: prereq=${prereqOk}, capacity=${capacityOk}, schedule=${scheduleOk}`
        })
      );
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
  return AsyncResult.retry(
    async () => {
      // 非同期操作として履修申請を実行
      return Promise.resolve(
        requestEnrollment(studentId, courseId, semester)
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
  const processedResults = await AsyncResult.sequence(
    sortedRequests.map(request => async (previousResults) => {
      console.log(`Processing enrollment for student ${request.studentId}, course ${request.courseId}`);
      console.log(`Previous results count: ${previousResults?.length || 0}`);
      
      return Promise.resolve(
        requestEnrollment(request.studentId, request.courseId, request.semester)
      );
    })
  );

  return ResultUtils.match(processedResults, {
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
        requestEnrollment(studentId, option.courseId, option.semester)
      )
    );

    // 代替学期
    if (option.alternativeSemesters) {
      for (const altSemester of option.alternativeSemesters) {
        allAttempts.push(
          Promise.resolve(
            requestEnrollment(studentId, option.courseId, altSemester)
          )
        );
      }
    }
  }

  // レース実行 - 最初に成功したものを採用
  const raceResult = await AsyncResult.race(
    allAttempts.map(promise => () => promise)
  );

  return ResultUtils.match(raceResult, {
    success: (enrollment) => Ok([enrollment]),
    error: (errors) => Err(errors)
  });
}

// === エクスポート ===
export {
  ResultUtils,
  resultPipe,
  asyncResultPipe,
  AsyncResult
};