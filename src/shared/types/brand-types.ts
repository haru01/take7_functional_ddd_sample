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