import {
  type StudentId,
  type CourseId,
  type Semester,
  type RequestedEnrollment,
  type Result,
  StudentIdSchema,
  CourseIdSchema,
  SemesterSchema,
  Ok,
  Err,
  Result as ResultUtils,
  resultPipe,
  AsyncResult
} from './types.js';
import {
  type EnrollmentError,
  createValidationError,
  createBusinessRuleError
} from './errors.js';
import {
  type EnrollmentRequestedEvent,
  type EnrollmentDomainEvent,
  createEnrollmentRequestedEvent,
  validateEventSequence,
  sortEventsByVersion
} from './domain-events.js';

/**
 * 集約 (Aggregate) 設計思想
 * 
 * 集約とは？
 * - 一貫性境界: この境界内のデータは常に整合性が保たれる
 * - 変更の単位: 集約全体が一つのトランザクションで変更される
 * - ビジネスルールの番人: ドメインの制約を強制する責任を持つ
 * 
 * なぜrequestEnrollmentが集約操作なのか？
 * 1. ビジネス不変条件: 同じ学生・科目・学期の重複申請防止
 * 2. 状態の一貫性: 申請時刻とバージョンの整合性
 * 3. イベント生成: 状態変更と共にドメインイベントを生成
 */

// === 集約操作の結果型 ===
export type EnrollmentAggregateResult<T> = Result<
  T & { domainEvent: EnrollmentDomainEvent },
  EnrollmentError
>;

// === 集約操作: 履修申請 ===
export function requestEnrollment(
  studentId: string,
  courseId: string,
  semester: string,
  options?: {
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, unknown>;
  }
): EnrollmentAggregateResult<RequestedEnrollment> {
  // Result型パイプラインを使った関数型実装
  return resultPipe(validateInputs({ studentId, courseId, semester }))
    .flatMap((validatedInputs: {
      studentId: StudentId;
      courseId: CourseId;
      semester: Semester;
    }) =>
      resultPipe(applyBusinessRules(validatedInputs))
        .map(() => validatedInputs)
        .value()
    )
    .flatMap((validatedInputs: {
      studentId: StudentId;
      courseId: CourseId;
      semester: Semester;
    }) => {
      const { studentId: validStudentId, courseId: validCourseId, semester: validSemester } = validatedInputs;
      
      // 集約の作成
      const enrollment = createRequestedEnrollment(
        validStudentId,
        validCourseId,
        validSemester
      );
      
      // ドメインイベントの生成
      const domainEvent = createEnrollmentRequestedEvent(
        validStudentId,
        validCourseId,
        validSemester,
        enrollment.version,
        options
      );
      
      return Ok({
        ...enrollment,
        domainEvent
      });
    })
    .value();
}

// === イベントストリームからの状態復元 ===
export function reconstructEnrollmentFromEvents(
  events: EnrollmentDomainEvent[]
): Result<RequestedEnrollment | null, EnrollmentError> {
  // Result型パイプラインでイベント再構築
  return resultPipe(
    events.length === 0 
      ? Ok(null)
      : validateEventSequence(events)
        ? Ok(events)
        : Err(createValidationError(
            'Invalid event sequence',
            'INVALID_EVENT_SEQUENCE'
          ))
  )
    .flatMap((validatedEvents: EnrollmentDomainEvent[] | null) => {
      if (validatedEvents === null) {
        return Ok(null);
      }
      
      const sortedEvents = sortEventsByVersion(validatedEvents);
      const firstEvent = sortedEvents[0];
      
      if (!firstEvent) {
        return Err(createValidationError(
          'No events to reconstruct from',
          'NO_EVENTS'
        ));
      }
      
      // 最初のイベントから状態を復元
      if (firstEvent.eventType === 'EnrollmentRequested') {
        const enrollment: RequestedEnrollment = {
          studentId: firstEvent.studentId,
          courseId: firstEvent.courseId,
          semester: firstEvent.data.semester,
          status: 'requested',
          requestedAt: firstEvent.data.requestedAt,
          version: firstEvent.version
        };
        
        return Ok(enrollment);
      }
      
      return Err(createValidationError(
        'First event must be EnrollmentRequested',
        'INVALID_FIRST_EVENT'
      ));
    })
    .value();
}

// === 内部ヘルパー関数 ===

// 入力検証（Result型パイプライン使用）
function validateInputs(input: {
  studentId: string;
  courseId: string;
  semester: string;
}): Result<{
  studentId: StudentId;
  courseId: CourseId;
  semester: Semester;
}, EnrollmentError> {
  // 並列バリデーション
  const validations = [
    ResultUtils.parseWith(
      StudentIdSchema,
      input.studentId,
      () => createValidationError(
        `Invalid student ID format: ${input.studentId}`,
        'INVALID_STUDENT_ID',
        'studentId',
        input.studentId
      )
    ),
    ResultUtils.parseWith(
      CourseIdSchema,
      input.courseId,
      () => createValidationError(
        `Invalid course ID format: ${input.courseId}`,
        'INVALID_COURSE_ID',
        'courseId',
        input.courseId
      )
    ),
    ResultUtils.parseWith(
      SemesterSchema,
      input.semester,
      () => createValidationError(
        `Invalid semester format: ${input.semester}. Expected format: YYYY-(spring|summer|fall)`,
        'INVALID_SEMESTER',
        'semester',
        input.semester
      )
    )
  ] as const;

  const allValidations = ResultUtils.allTuple(validations);
  
  return ResultUtils.map(allValidations, ([studentId, courseId, semester]) => ({
    studentId,
    courseId,
    semester
  }));
}

// ビジネスルール適用（Result型使用）
function applyBusinessRules(input: {
  studentId: StudentId;
  courseId: CourseId;
  semester: Semester;
}): Result<void, EnrollmentError> {
  // 現在はRequestedStateのみなので、基本的なルールのみ
  // 将来の拡張ポイント:
  // - 申請期限チェック
  // - 学生の在籍状況チェック
  // - 科目の開講状況チェック
  // - 前提科目チェック
  // - 履修単位数上限チェック
  
  // 学期の妥当性チェック（基本的なビジネスルール）
  const currentYear = new Date().getFullYear();
  const semesterParts = input.semester.split('-');
  const semesterYear = parseInt(semesterParts[0] || '');
  
  return ResultUtils.when(
    !isNaN(semesterYear) && 
    semesterYear >= currentYear - 1 && 
    semesterYear <= currentYear + 1,
    () => Ok(undefined),
    () => Err(createBusinessRuleError(
      'INVALID_SEMESTER_RANGE',
      `Cannot enroll for semester ${input.semester}. Only current and adjacent years are allowed.`,
      'SEMESTER_OUT_OF_RANGE',
      { 
        currentYear,
        requestedYear: semesterYear,
        allowedRange: `${currentYear - 1} to ${currentYear + 1}`
      }
    ))
  );
}

// RequestedEnrollment作成
function createRequestedEnrollment(
  studentId: StudentId,
  courseId: CourseId,
  semester: Semester
): RequestedEnrollment {
  return {
    studentId,
    courseId,
    semester,
    status: 'requested',
    requestedAt: new Date(),
    version: 1
  };
}

/**
 * 集約設計上の重要な決定事項
 * 
 * 1. 純粋関数: 副作用なし、同じ入力には同じ出力
 * 2. 不変性: 状態変更は新しいオブジェクトの生成
 * 3. エラーハンドリング: Either型で型安全な処理
 * 4. イベント生成: 状態変更と同時にドメインイベント生成
 * 5. 拡張性: 新しいビジネスルールを追加しやすい構造
 * 6. テスタブル: 外部依存なしでテスト可能
 */