import { z } from 'zod';
import { StudentIdSchema, CourseIdSchema, SemesterSchema, type EnrollmentIdentity } from '../../../../shared/types/index';

/**
 * Enrollment Domain Types
 * 
 * enrollment固有の状態型とスキーマ定義
 * 共有カーネルの基本識別子を組み合わせてenrollmentドメインの概念を表現
 */

// === 共通スキーマ（不変要素 + バージョン） ===
export const EnrollmentBaseSchema = z.object({
  studentId: StudentIdSchema,
  courseId: CourseIdSchema,
  semester: SemesterSchema,
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

// === 型定義 ===
export type RequestedEnrollment = z.infer<typeof RequestedEnrollmentSchema>;
export type ApprovedEnrollment = z.infer<typeof ApprovedEnrollmentSchema>;
export type CancelledEnrollment = z.infer<typeof CancelledEnrollmentSchema>;
export type Enrollment = z.infer<typeof EnrollmentSchema>;