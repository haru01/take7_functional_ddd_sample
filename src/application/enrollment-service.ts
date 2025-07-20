import type { Result } from '../domain/types.js';
import type { EnrollmentError } from '../domain/errors.js';
import { createBusinessRuleError, createNotFoundError } from '../domain/errors.js';
import { requestEnrollment } from '../domain/enrollment-aggregate.js';
import { Ok, Err, Result as ResultUtils, resultToEither } from '../domain/types.js';

import type {
  IEnrollmentRepository,
  IStudentRepository,
  ICourseRepository,
  INotificationService,
  IEventPublisher
} from './ports.js';

import type {
  RequestEnrollmentCommand,
  EnrollmentResponse,
  ErrorResponse
} from './dtos.js';

import {
  RequestEnrollmentCommandSchema,
  mapEnrollmentToResponse,
  mapErrorToResponse,
  extractDomainInputs
} from './dtos.js';

/**
 * アプリケーションサービス設計思想
 * 
 * アプリケーションサービスの責任：
 * 1. ユースケースの調整: 複数のドメインオブジェクトや外部サービスを組み合わせ
 * 2. トランザクション境界: データベースのトランザクション管理
 * 3. 認可: ユーザーが操作を実行する権限があるかチェック
 * 4. DTOの変換: 外部からの入力をドメインオブジェクトに変換
 * 5. イベントの発行: ドメインイベントを外部システムに通知
 * 6. エラーハンドリング: ドメインエラーを適切にアプリケーション層でハンドリング
 * 
 * アプリケーションサービスがやらないこと：
 * - ビジネスロジック（それはドメイン層の責任）
 * - データアクセスの詳細（それはインフラ層の責任）
 * - プレゼンテーション（それはプレゼンテーション層の責任）
 */

export class EnrollmentApplicationService {
  constructor(
    private readonly enrollmentRepository: IEnrollmentRepository,
    private readonly studentRepository: IStudentRepository,
    private readonly courseRepository: ICourseRepository,
    private readonly notificationService: INotificationService,
    private readonly eventPublisher: IEventPublisher
  ) {}

  /**
   * 履修申請ユースケース
   * 
   * フロー:
   * 1. 入力検証
   * 2. ビジネス前提条件の確認
   * 3. 重複チェック
   * 4. ドメイン操作の実行
   * 5. 永続化
   * 6. イベント発行
   * 7. 通知送信
   * 8. レスポンス変換
   */
  async requestEnrollment(
    command: RequestEnrollmentCommand
  ): Promise<Result<EnrollmentResponse, ErrorResponse>> {
    // Step 1: 入力検証
    const validationResult = RequestEnrollmentCommandSchema.safeParse(command);
    if (!validationResult.success) {
      const error = createBusinessRuleError(
        'INPUT_VALIDATION',
        'Invalid input format',
        'INVALID_COMMAND_FORMAT',
        { validationErrors: validationResult.error.issues }
      );
      return Err(mapErrorToResponse(error));
    }

    const validatedCommand = validationResult.data;
    const domainInputs = extractDomainInputs(validatedCommand);

    // Step 2: ビジネス前提条件の確認
    const prerequisiteCheck = await this.checkPrerequisites(
      domainInputs.studentId,
      domainInputs.courseId,
      domainInputs.semester
    );
    if (!prerequisiteCheck.success) {
      return Err(mapErrorToResponse(prerequisiteCheck.error));
    }

    // Step 3: 重複チェック
    const duplicateCheck = await this.checkForDuplicateEnrollment(
      domainInputs.studentId,
      domainInputs.courseId,
      domainInputs.semester
    );
    if (!duplicateCheck.success) {
      return Err(mapErrorToResponse(duplicateCheck.error));
    }

    // Step 4: ドメイン操作の実行
    const domainResult = requestEnrollment(
      domainInputs.studentId,
      domainInputs.courseId,
      domainInputs.semester,
      domainInputs.options
    );

    if (!domainResult.success) {
      return Err(mapErrorToResponse(domainResult.error));
    }

    const { domainEvent, ...enrollment } = domainResult.data;

    // Step 5: 永続化（トランザクション）
    const saveResult = await this.enrollmentRepository.save(enrollment, domainEvent);
    if (!saveResult.success) {
      return Err(mapErrorToResponse(saveResult.error));
    }

    // Step 6: イベント発行（永続化成功後）
    await this.eventPublisher.publish([domainEvent]);

    // Step 7: 通知送信（ベストエフォート）
    await this.notificationService.notifyEnrollmentRequested(domainEvent);

    // Step 8: レスポンス変換
    return Ok(mapEnrollmentToResponse(enrollment));
  }

  /**
   * 履修申請取得ユースケース
   */
  async getEnrollment(
    studentId: string,
    courseId: string,
    semester: string
  ): Promise<Result<EnrollmentResponse | null, ErrorResponse>> {
    const enrollmentResult = await this.enrollmentRepository.findByStudentCourseAndSemester(
      studentId as any, // TODO: 型変換の改善
      courseId as any,
      semester as any
    );

    if (!enrollmentResult.success) {
      return Err(mapErrorToResponse(enrollmentResult.error));
    }

    const enrollment = enrollmentResult.data;
    if (!enrollment) {
      return Ok(null);
    }

    return Ok(mapEnrollmentToResponse(enrollment));
  }

  // === プライベートヘルパーメソッド ===

  /**
   * ビジネス前提条件の確認
   */
  private async checkPrerequisites(
    studentId: string,
    courseId: string,
    semester: string
  ): Promise<Result<void, EnrollmentError>> {
    // 学生の存在確認
    const studentExistsResult = await this.studentRepository.exists(studentId as any);
    if (!studentExistsResult.success) {
      return studentExistsResult;
    }
    if (!studentExistsResult.data) {
      return Err(createBusinessRuleError(
        'STUDENT_NOT_FOUND',
        `Student ${studentId} not found`,
        'STUDENT_NOT_FOUND',
        { studentId }
      ));
    }

    // 学生の在籍状況確認
    const studentStatusResult = await this.studentRepository.getEnrollmentStatus(studentId as any);
    if (!studentStatusResult.success) {
      return studentStatusResult;
    }
    if (studentStatusResult.data !== 'active') {
      return Err(createBusinessRuleError(
        'STUDENT_NOT_ACTIVE',
        `Student ${studentId} is not active (status: ${studentStatusResult.data})`,
        'STUDENT_NOT_ACTIVE',
        { studentId, status: studentStatusResult.data }
      ));
    }

    // 科目の存在確認
    const courseExistsResult = await this.courseRepository.exists(courseId as any);
    if (!courseExistsResult.success) {
      return courseExistsResult;
    }
    if (!courseExistsResult.data) {
      return Err(createBusinessRuleError(
        'COURSE_NOT_FOUND',
        `Course ${courseId} not found`,
        'COURSE_NOT_FOUND',
        { courseId }
      ));
    }

    // 科目の開講状況確認
    const courseOfferedResult = await this.courseRepository.isOfferedInSemester(courseId as any, semester as any);
    if (!courseOfferedResult.success) {
      return courseOfferedResult;
    }
    if (!courseOfferedResult.data) {
      return Err(createBusinessRuleError(
        'COURSE_NOT_OFFERED',
        `Course ${courseId} is not offered in semester ${semester}`,
        'COURSE_NOT_OFFERED',
        { courseId, semester }
      ));
    }

    // 定員確認
    const capacityResult = await this.courseRepository.getCapacity(courseId as any, semester as any);
    if (!capacityResult.success) {
      return capacityResult;
    }
    if (capacityResult.data.current >= capacityResult.data.max) {
      return Err(createBusinessRuleError(
        'COURSE_CAPACITY_EXCEEDED',
        `Course ${courseId} has reached maximum capacity (${capacityResult.data.max})`,
        'COURSE_CAPACITY_EXCEEDED',
        { courseId, semester, capacity: capacityResult.data }
      ));
    }

    return Ok(undefined);
  }

  /**
   * 重複履修申請のチェック
   */
  private async checkForDuplicateEnrollment(
    studentId: string,
    courseId: string,
    semester: string
  ): Promise<Result<void, EnrollmentError>> {
    const existingEnrollmentResult = await this.enrollmentRepository.findByStudentCourseAndSemester(
      studentId as any,
      courseId as any,
      semester as any
    );

    if (!existingEnrollmentResult.success) {
      return existingEnrollmentResult;
    }

    if (existingEnrollmentResult.data) {
      return Err(createBusinessRuleError(
        'DUPLICATE_ENROLLMENT',
        `Enrollment already exists for student ${studentId}, course ${courseId}, semester ${semester}`,
        'DUPLICATE_ENROLLMENT',
        {
          existingStatus: existingEnrollmentResult.data.status,
          existingVersion: existingEnrollmentResult.data.version
        }
      ));
    }

    return Ok(undefined);
  }
}

/**
 * アプリケーションサービス設計の重要な判断
 * 
 * 1. 薄い層: ビジネスロジックはドメイン層に委譲
 * 2. 調整役: 複数のサービスやリポジトリを組み合わせ
 * 3. トランザクション: データベースの一貫性を保証
 * 4. エラー変換: ドメインエラーをアプリケーション層のエラーに変換
 * 5. ベストエフォート: 通知などの非重要な処理は失敗しても続行
 * 6. ログ記録: 操作の追跡とデバッグ用（実装は省略）
 */