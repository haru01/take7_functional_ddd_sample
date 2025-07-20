import { z } from 'zod';

/**
 * Command DTO (Data Transfer Object) 設計思想
 * 
 * CQRS における Command DTO の役割：
 * 1. 意図の明確化: 何をしたいかを明示する
 * 2. 不変性: コマンドは一度作成されたら変更されない
 * 3. 検証: コマンドレベルでの入力検証
 * 4. メタデータ: トレーサビリティや監査情報の含有
 * 5. シリアライゼーション: ネットワーク経由での転送対応
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

// === DTO Mappers ===

import type { 
  StudentId,
  CourseId,
  Semester
} from '../../../../shared/types/index';
import type { 
  Enrollment
} from '../../domain/entities/enrollment-types';
import type { EnrollmentError } from '../../domain/errors/errors';
import type { EnrollmentDomainEvent } from '../../domain/events/domain-events';

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
  eventType: event.eventType as string,
  studentId: event.studentId as string,
  courseId: event.courseId as string,
  occurredAt: (event.occurredAt as Date).toISOString(),
  version: event.version as number,
  data: 'data' in event ? (event.data as Record<string, unknown>) : {}
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

import { StudentIdSchema, CourseIdSchema, SemesterSchema } from '../../../../shared/types/index';
import { Result, Ok, Err } from '../../../../shared/types/index';

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
 * Command DTO設計の重要な判断
 * 
 * 1. 意図の表現: コマンド名で何をするかを明確に表現
 * 2. 検証責任: コマンドレベルでの基本的な検証
 * 3. 不変性: 一度作成されたコマンドは変更しない
 * 4. メタデータ: トレーサビリティ情報の含有
 * 5. 変換責任: ドメインオブジェクトとの変換ロジック
 * 6. エラーマッピング: ドメインエラーとDTOエラーの変換
 */