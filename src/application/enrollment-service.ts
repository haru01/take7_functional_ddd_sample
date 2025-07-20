import type { Either } from '../domain/types.js';
import type { EnrollmentError } from '../domain/errors.js';
import { createBusinessRuleError } from '../domain/errors.js';
import { requestEnrollment } from '../domain/enrollment-aggregate.js';
import { left, right } from '../domain/types.js';

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
  ): Promise<Either<ErrorResponse, EnrollmentResponse>> {
    // Step 1: 入力検証
    const validationResult = RequestEnrollmentCommandSchema.safeParse(command);
    if (!validationResult.success) {
      const error = createBusinessRuleError(
        'INPUT_VALIDATION',
        'Invalid input format',
        'INVALID_COMMAND_FORMAT',
        { validationErrors: validationResult.error.issues }
      );
      return left(mapErrorToResponse(error));
    }

    const validatedCommand = validationResult.data;
    const domainInputs = extractDomainInputs(validatedCommand);

    // Step 2: ビジネス前提条件の確認
    const prerequisiteCheck = await this.checkPrerequisites(
      domainInputs.studentId,
      domainInputs.courseId,
      domainInputs.semester
    );
    if (prerequisiteCheck.type === 'left') {
      return left(mapErrorToResponse(prerequisiteCheck.value));
    }

    // Step 3: 重複チェック
    const duplicateCheck = await this.checkForDuplicateEnrollment(
      domainInputs.studentId,
      domainInputs.courseId,
      domainInputs.semester
    );
    if (duplicateCheck.type === 'left') {
      return left(mapErrorToResponse(duplicateCheck.value));
    }

    // Step 4: ドメイン操作の実行
    const domainResult = requestEnrollment(
      domainInputs.studentId,
      domainInputs.courseId,
      domainInputs.semester,
      domainInputs.options
    );

    if (domainResult.type === 'left') {
      return left(mapErrorToResponse(domainResult.value));
    }

    const { domainEvent, ...enrollment } = domainResult.value;

    // Step 5: 永続化（トランザクション）
    const saveResult = await this.enrollmentRepository.save(enrollment, domainEvent);
    if (saveResult.type === 'left') {
      return left(mapErrorToResponse(saveResult.value));
    }

    // Step 6: イベント発行（永続化成功後）
    await this.eventPublisher.publish([domainEvent]);

    // Step 7: 通知送信（ベストエフォート）
    await this.notificationService.notifyEnrollmentRequested(domainEvent);

    // Step 8: レスポンス変換
    return right(mapEnrollmentToResponse(enrollment));
  }

  /**
   * 履修申請取得ユースケース
   */
  async getEnrollment(
    studentId: string,
    courseId: string,
    semester: string
  ): Promise<Either<ErrorResponse, EnrollmentResponse | null>> {
    const enrollmentResult = await this.enrollmentRepository.findByStudentCourseAndSemester(
      studentId as any, // TODO: 型変換の改善
      courseId as any,
      semester as any
    );

    if (enrollmentResult.type === 'left') {
      return left(mapErrorToResponse(enrollmentResult.value));
    }

    const enrollment = enrollmentResult.value;
    if (!enrollment) {
      return right(null);
    }

    return right(mapEnrollmentToResponse(enrollment));
  }

  // === プライベートヘルパーメソッド ===

  /**
   * ビジネス前提条件の確認
   */
  private async checkPrerequisites(
    studentId: string,
    courseId: string,
    semester: string
  ): Promise<Either<EnrollmentError, void>> {
    // 学生の存在・在籍確認
    const studentExistsResult = await this.studentRepository.exists(studentId as any);
    if (studentExistsResult.type === 'left') {
      return studentExistsResult;
    }
    if (!studentExistsResult.value) {
      return left(createBusinessRuleError(
        'STUDENT_NOT_FOUND',
        `Student with ID ${studentId} not found`,
        'STUDENT_NOT_FOUND'
      ));
    }

    const studentStatusResult = await this.studentRepository.getEnrollmentStatus(studentId as any);
    if (studentStatusResult.type === 'left') {
      return studentStatusResult;
    }
    if (studentStatusResult.value !== 'active') {
      return left(createBusinessRuleError(
        'STUDENT_NOT_ACTIVE',
        `Student ${studentId} is not active (status: ${studentStatusResult.value})`,
        'STUDENT_NOT_ACTIVE',
        { studentStatus: studentStatusResult.value }
      ));
    }

    // 科目の存在・開講確認
    const courseExistsResult = await this.courseRepository.exists(courseId as any);
    if (courseExistsResult.type === 'left') {
      return courseExistsResult;
    }
    if (!courseExistsResult.value) {
      return left(createBusinessRuleError(
        'COURSE_NOT_FOUND',
        `Course with ID ${courseId} not found`,
        'COURSE_NOT_FOUND'
      ));
    }

    const courseOfferedResult = await this.courseRepository.isOfferedInSemester(
      courseId as any,
      semester as any
    );
    if (courseOfferedResult.type === 'left') {
      return courseOfferedResult;
    }
    if (!courseOfferedResult.value) {
      return left(createBusinessRuleError(
        'COURSE_NOT_OFFERED',
        `Course ${courseId} is not offered in semester ${semester}`,
        'COURSE_NOT_OFFERED'
      ));
    }

    // 定員確認
    const capacityResult = await this.courseRepository.getCapacity(
      courseId as any,
      semester as any
    );
    if (capacityResult.type === 'left') {
      return capacityResult;
    }
    if (capacityResult.value.current >= capacityResult.value.max) {
      return left(createBusinessRuleError(
        'COURSE_CAPACITY_EXCEEDED',
        `Course ${courseId} has reached its capacity (${capacityResult.value.max})`,
        'COURSE_CAPACITY_EXCEEDED',
        { 
          maxCapacity: capacityResult.value.max,
          currentEnrollment: capacityResult.value.current
        }
      ));
    }

    return right(undefined);
  }

  /**
   * 重複履修申請のチェック
   */
  private async checkForDuplicateEnrollment(
    studentId: string,
    courseId: string,
    semester: string
  ): Promise<Either<EnrollmentError, void>> {
    const existingEnrollmentResult = await this.enrollmentRepository.findByStudentCourseAndSemester(
      studentId as any,
      courseId as any,
      semester as any
    );

    if (existingEnrollmentResult.type === 'left') {
      return existingEnrollmentResult;
    }

    if (existingEnrollmentResult.value) {
      return left(createBusinessRuleError(
        'DUPLICATE_ENROLLMENT',
        `Enrollment already exists for student ${studentId}, course ${courseId}, semester ${semester}`,
        'DUPLICATE_ENROLLMENT',
        {
          existingStatus: existingEnrollmentResult.value.status,
          existingVersion: existingEnrollmentResult.value.version
        }
      ));
    }

    return right(undefined);
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