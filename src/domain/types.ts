import { z } from 'zod';

export type Either<L, R> =
  | { type: 'left'; value: L }
  | { type: 'right'; value: R };

export const left = <L, R>(value: L): Either<L, R> => ({ type: 'left', value });
export const right = <L, R>(value: R): Either<L, R> => ({ type: 'right', value });

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