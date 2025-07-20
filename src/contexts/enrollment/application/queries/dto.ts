import { z } from 'zod';

/**
 * Query DTO (Data Transfer Object) 設計思想
 * 
 * CQRS における Query DTO の役割：
 * 1. 読み取り専用: 状態変更を行わない
 * 2. プロジェクション: 必要なデータ形式での返却
 * 3. 最適化: 読み取りパフォーマンスに特化
 * 4. キャッシュ対応: 将来的な読み取り最適化への対応
 * 5. ビューモデル: UIに最適化されたデータ構造
 */

// === Query DTOs (入力用) ===

export const GetEnrollmentQuerySchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  semester: z.string().min(1, 'Semester is required')
});

export type GetEnrollmentQuery = z.infer<typeof GetEnrollmentQuerySchema>;

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
 * Query DTO設計の重要な判断
 * 
 * 1. 読み取り専用: 副作用のない純粋な読み取り操作
 * 2. プロジェクション: UIに最適化されたデータ形式
 * 3. 最適化: 読み取りパフォーマンスに特化した実装
 * 4. キャッシュ対応: 将来的な読み取り最適化への準備
 * 5. ビューモデル: 表示要件に合わせたデータ構造
 * 6. 非正規化: 読み取り効率のためのデータ重複許容
 */