import { z } from 'zod';

/**
 * DTO (Data Transfer Object) 設計思想
 * 
 * なぜDTOが必要なのか？
 * 1. 境界の明確化: アプリケーション層とプレゼンテーション層の境界
 * 2. バージョニング: APIの後方互換性を保つ
 * 3. セキュリティ: 内部のドメインオブジェクトを直接公開しない
 * 4. 変換の責任: ドメインオブジェクト ↔ 外部表現の変換
 * 5. 検証: 外部からの入力の検証
 */

// === Command DTOs (入力用) ===

export const RequestEnrollmentCommandSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  semester: z.string().min(1, 'Semester is required'),
  
  // オプショナルなメタデータ
  metadata: z.record(z.unknown()).optional(),
  
  // トレーサビリティ用（通常はミドルウェアで設定）
  correlationId: z.string().uuid().optional(),
  causationId: z.string().uuid().optional()
});

export type RequestEnrollmentCommand = z.infer<typeof RequestEnrollmentCommandSchema>;

// === Response DTOs (出力用) ===

export const EnrollmentResponseSchema = z.object({
  id: z.string(), // 複合キー: studentId-courseId-semester
  studentId: z.string(),
  courseId: z.string(),
  semester: z.string(),
  status: z.enum(['requested', 'approved', 'cancelled', 'completed', 'failed']),
  requestedAt: z.string().datetime(), // ISO 8601 文字列
  version: z.number().int().positive(),
  
  // 状態ごとの追加フィールド（オプショナル）
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.string().optional(),
  cancelledAt: z.string().datetime().optional(),
  cancelReason: z.string().optional(),
  completedAt: z.string().datetime().optional(),
  grade: z.string().optional(),
  failedAt: z.string().datetime().optional(),
  failureReason: z.string().optional()
});

export type EnrollmentResponse = z.infer<typeof EnrollmentResponseSchema>;

export const DomainEventResponseSchema = z.object({
  eventType: z.string(),
  studentId: z.string(),
  courseId: z.string(),
  occurredAt: z.string().datetime(),
  version: z.number().int().positive(),
  data: z.record(z.unknown())
});

export type DomainEventResponse = z.infer<typeof DomainEventResponseSchema>;

// === Error DTOs ===

export const ErrorResponseSchema = z.object({
  type: z.enum(['ValidationError', 'BusinessRuleError', 'NotFoundError', 'ConcurrencyError']),
  message: z.string(),
  code: z.string(),
  timestamp: z.string().datetime(),
  
  // エラータイプ固有のフィールド
  field: z.string().optional(),        // ValidationError用
  rule: z.string().optional(),         // BusinessRuleError用
  entity: z.string().optional(),       // NotFoundError用
  expectedVersion: z.number().optional(), // ConcurrencyError用
  actualVersion: z.number().optional(),   // ConcurrencyError用
  
  details: z.record(z.unknown()).optional()
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// === Collection DTOs ===

export const EnrollmentListResponseSchema = z.object({
  enrollments: z.array(EnrollmentResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional()
});

export type EnrollmentListResponse = z.infer<typeof EnrollmentListResponseSchema>;

export const EventStreamResponseSchema = z.object({
  events: z.array(DomainEventResponseSchema),
  aggregateId: z.string(),
  version: z.number().int().nonnegative()
});

export type EventStreamResponse = z.infer<typeof EventStreamResponseSchema>;

// === DTO Mappers ===

import type { 
  Enrollment, 
  RequestedEnrollment,
  StudentId,
  CourseId,
  Semester
} from '../domain/types.js';
import type { EnrollmentError } from '../domain/errors.js';
import type { EnrollmentDomainEvent } from '../domain/domain-events.js';

/**
 * ドメインオブジェクトからDTOへの変換
 */
export const mapEnrollmentToResponse = (enrollment: Enrollment): EnrollmentResponse => {
  const base = {
    id: `${enrollment.studentId}-${enrollment.courseId}-${enrollment.semester}`,
    studentId: enrollment.studentId,
    courseId: enrollment.courseId,
    semester: enrollment.semester,
    status: enrollment.status,
    requestedAt: enrollment.requestedAt.toISOString(),
    version: enrollment.version
  };

  // 状態ごとの追加フィールド
  switch (enrollment.status) {
    case 'requested':
      return base;
    
    // 将来の拡張用 - 現在はRequestedのみ対応
    default:
      return base;
  }
};

/**
 * ドメインエラーからエラーDTOへの変換
 */
export const mapErrorToResponse = (error: EnrollmentError): ErrorResponse => ({
  type: error.type,
  message: error.message,
  code: error.code,
  timestamp: error.timestamp.toISOString(),
  field: 'field' in error ? error.field : undefined,
  rule: 'rule' in error ? error.rule : undefined,
  entity: 'entity' in error ? error.entity : undefined,
  expectedVersion: 'expectedVersion' in error ? error.expectedVersion : undefined,
  actualVersion: 'actualVersion' in error ? error.actualVersion : undefined,
  details: error.details
});

/**
 * ドメインイベントからイベントDTOへの変換
 */
export const mapDomainEventToResponse = (event: EnrollmentDomainEvent): DomainEventResponse => ({
  eventType: event.eventType,
  studentId: event.studentId,
  courseId: event.courseId,
  occurredAt: event.occurredAt.toISOString(),
  version: event.version,
  data: 'data' in event ? event.data : {}
});

/**
 * コマンドDTOからドメイン値オブジェクトへの変換準備
 * （実際の変換はバリデーション後にドメイン層で実行）
 */
export const extractDomainInputs = (command: RequestEnrollmentCommand) => ({
  studentId: command.studentId,
  courseId: command.courseId,
  semester: command.semester,
  options: {
    ...(command.correlationId && { correlationId: command.correlationId }),
    ...(command.causationId && { causationId: command.causationId }),
    ...(command.metadata && { metadata: command.metadata })
  }
});

import { StudentIdSchema, CourseIdSchema, SemesterSchema } from '../domain/types.js';
import { Result, Ok, Err } from '../domain/types.js';

/**
 * 型安全な識別子変換ヘルパー関数
 * as any キャストを避けるための安全な変換
 */
export const parseIdentifiers = (input: {
  studentId: string;
  courseId: string;
  semester: string;
}): Result<{
  studentId: StudentId;
  courseId: CourseId;
  semester: Semester;
}, EnrollmentError> => {
  // 並列バリデーション
  const studentIdResult = StudentIdSchema.safeParse(input.studentId);
  const courseIdResult = CourseIdSchema.safeParse(input.courseId);
  const semesterResult = SemesterSchema.safeParse(input.semester);

  // エラーハンドリング
  if (!studentIdResult.success) {
    return Err({
      type: 'ValidationError' as const,
      message: `Invalid student ID format: ${input.studentId}`,
      code: 'INVALID_STUDENT_ID',
      timestamp: new Date(),
      field: 'studentId',
      value: input.studentId
    });
  }

  if (!courseIdResult.success) {
    return Err({
      type: 'ValidationError' as const,
      message: `Invalid course ID format: ${input.courseId}`,
      code: 'INVALID_COURSE_ID',
      timestamp: new Date(),
      field: 'courseId',
      value: input.courseId
    });
  }

  if (!semesterResult.success) {
    return Err({
      type: 'ValidationError' as const,
      message: `Invalid semester format: ${input.semester}`,
      code: 'INVALID_SEMESTER',
      timestamp: new Date(),
      field: 'semester',
      value: input.semester
    });
  }

  // 成功ケース
  return Ok({
    studentId: studentIdResult.data,
    courseId: courseIdResult.data,
    semester: semesterResult.data
  });
};

/**
 * DTO設計の重要な判断
 * 
 * 1. 文字列ベース: 外部システムとの互換性重視
 * 2. フラット構造: JSONシリアライゼーションの簡素化
 * 3. オプショナルフィールド: 段階的な機能拡張対応
 * 4. ISO 8601: 日時の国際標準フォーマット
 * 5. バリデーション: Zodによる実行時検証
 * 6. 不変性: DTOも読み取り専用として扱う
 */