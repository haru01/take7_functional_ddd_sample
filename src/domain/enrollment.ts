import {
  type StudentId,
  type CourseId,
  type Semester,
  type RequestedEnrollment,
  type EnrollmentError,
  type Result,
  StudentIdSchema,
  CourseIdSchema,
  SemesterSchema,
  Ok,
  Err,
  Result as ResultUtils,
  resultPipe
} from './types.js';

/**
 * 履修申請の作成（Result型使用版）
 * 
 * 関数型アプローチ：
 * - 純粋関数として実装
 * - Result型でエラーハンドリング
 * - パイプライン合成を活用
 */
export function requestEnrollment(
  studentId: string,
  courseId: string,
  semester: string
): Result<RequestedEnrollment, EnrollmentError> {
  // Result型パイプラインを使った関数型実装
  return resultPipe(
    // 入力検証のチェーン
    validateEnrollmentInputs({ studentId, courseId, semester })
  )
    .flatMap((validatedInputs: {
      studentId: StudentId;
      courseId: CourseId;
      semester: Semester;
    }) => 
      createEnrollmentFromValidatedInputs(validatedInputs)
    )
    .value();
}

/**
 * 入力検証（Result型パイプライン使用）
 */
function validateEnrollmentInputs(inputs: {
  studentId: string;
  courseId: string;
  semester: string;
}): Result<{
  studentId: StudentId;
  courseId: CourseId;
  semester: Semester;
}, EnrollmentError> {
  // 3つのバリデーションを並列実行
  const validations = [
    ResultUtils.parseWith(
      StudentIdSchema,
      inputs.studentId,
      () => ({
        type: 'VALIDATION_ERROR' as const,
        message: `Invalid student ID: ${inputs.studentId}`
      })
    ),
    ResultUtils.parseWith(
      CourseIdSchema,
      inputs.courseId,
      () => ({
        type: 'VALIDATION_ERROR' as const,
        message: `Invalid course ID: ${inputs.courseId}`
      })
    ),
    ResultUtils.parseWith(
      SemesterSchema,
      inputs.semester,
      () => ({
        type: 'VALIDATION_ERROR' as const,
        message: `Invalid semester: ${inputs.semester}`
      })
    )
  ] as const;

  const allValidations = ResultUtils.allTuple(validations);
  
  return ResultUtils.map(allValidations, ([studentId, courseId, semester]) => ({
    studentId,
    courseId,
    semester
  }));
}

/**
 * 検証済み入力から履修申請を作成
 */
function createEnrollmentFromValidatedInputs(validatedInputs: {
  studentId: StudentId;
  courseId: CourseId;
  semester: Semester;
}): Result<RequestedEnrollment, EnrollmentError> {
  try {
    const enrollment: RequestedEnrollment = {
      studentId: validatedInputs.studentId,
      courseId: validatedInputs.courseId,
      semester: validatedInputs.semester,
      status: 'requested',
      requestedAt: new Date(),
      version: 1
    };

    return Ok(enrollment);
  } catch (error) {
    return Err({
      type: 'VALIDATION_ERROR' as const,
      message: `Failed to create enrollment: ${error}`
    });
  }
}