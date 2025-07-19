import {
  type StudentId,
  type CourseId,
  type Semester,
  type RequestedEnrollment,
  type EnrollmentError,
  type Either,
  StudentIdSchema,
  CourseIdSchema,
  SemesterSchema,
  left,
  right
} from './types.js';

export function requestEnrollment(
  studentId: string,
  courseId: string,
  semester: string
): Either<EnrollmentError, RequestedEnrollment> {
  const studentIdResult = StudentIdSchema.safeParse(studentId);
  if (!studentIdResult.success) {
    return left({
      type: 'VALIDATION_ERROR',
      message: `Invalid student ID: ${studentId}`
    });
  }

  const courseIdResult = CourseIdSchema.safeParse(courseId);
  if (!courseIdResult.success) {
    return left({
      type: 'VALIDATION_ERROR',
      message: `Invalid course ID: ${courseId}`
    });
  }

  const semesterResult = SemesterSchema.safeParse(semester);
  if (!semesterResult.success) {
    return left({
      type: 'VALIDATION_ERROR',
      message: `Invalid semester: ${semester}`
    });
  }

  const enrollment: RequestedEnrollment = {
    studentId: studentIdResult.data,
    courseId: courseIdResult.data,
    semester: semesterResult.data,
    status: 'requested',
    requestedAt: new Date(),
    version: 1
  };

  return right(enrollment);
}