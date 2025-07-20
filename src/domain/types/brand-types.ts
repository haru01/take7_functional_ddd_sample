import { z } from 'zod';

/**
 * ブランド型定義
 * 
 * ドメインの意味を持つ型安全な識別子
 * 単なる文字列ではなく、ビジネス上の意味を型システムで表現
 */

// === 基本識別子 ===

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