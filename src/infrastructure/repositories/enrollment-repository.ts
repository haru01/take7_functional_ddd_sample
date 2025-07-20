import type { Result } from '../../domain/types/index.js';
import type { 
  StudentId, 
  CourseId, 
  Semester,
  Enrollment 
} from '../../domain/types/index.js';
import type { EnrollmentError } from '../../domain/errors.js';
import type { EnrollmentDomainEvent } from '../../domain/domain-events.js';
import { 
  createNotFoundError, 
  createConcurrencyError,
  createValidationError 
} from '../../domain/errors.js';
import { Ok, Err } from '../../domain/types/index.js';

import type { 
  IEnrollmentRepository,
  IStudentRepository,
  ICourseRepository 
} from '../../application/ports.js';

import { 
  InMemoryEventStore,
  EventStreamFactory,
  type IEventStore
} from '../event-store/index.js';


/**
 * インメモリリポジトリ実装
 * 
 * なぜインメモリから始めるのか？
 * 1. 開発速度: データベース設定なしに開発開始
 * 2. テスト容易性: 外部依存なしでテスト実行
 * 3. プロトタイピング: アーキテクチャ検証に集中
 * 4. 教育目的: ドメインロジックの理解に集中
 * 
 * 本番環境では：
 * - PostgreSQL + Prismaリポジトリに置き換え
 * - 同じインターフェースなので変更は最小限
 */

export class InMemoryEnrollmentRepository implements IEnrollmentRepository {
  private enrollments = new Map<string, Enrollment>();
  private events = new Map<string, EnrollmentDomainEvent[]>();
  
  // Event Store機能（オプショナル）
  private eventStore?: IEventStore;
  private eventStreamFactory?: EventStreamFactory;

  constructor(useEventStore: boolean = false) {
    if (useEventStore) {
      this.eventStore = new InMemoryEventStore();
      this.eventStreamFactory = new EventStreamFactory(this.eventStore);
    }
  }

  /**
   * 集約IDの生成
   */
  private generateAggregateId(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): string {
    return `${studentId}-${courseId}-${semester}`;
  }

  /**
   * 学生と科目による履修申請検索
   */
  async findByStudentAndCourse(
    studentId: StudentId,
    courseId: CourseId
  ): Promise<Result<Enrollment | null, EnrollmentError>> {
    try {
      // 全ての履修申請から該当するものを検索
      for (const enrollment of this.enrollments.values()) {
        if (enrollment.studentId === studentId && enrollment.courseId === courseId) {
          return Ok(enrollment);
        }
      }
      return Ok(null);
    } catch (error) {
      return Err(createValidationError(
        'Failed to search enrollments',
        'REPOSITORY_ERROR',
        undefined,
        { error: String(error) }
      ));
    }
  }

  /**
   * 学生・科目・学期による履修申請検索
   */
  async findByStudentCourseAndSemester(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<Enrollment | null, EnrollmentError>> {
    try {
      const aggregateId = this.generateAggregateId(studentId, courseId, semester);
      const enrollment = this.enrollments.get(aggregateId);
      return Ok(enrollment || null);
    } catch (error) {
      return Err(createValidationError(
        'Failed to find enrollment',
        'REPOSITORY_ERROR',
        undefined,
        { error: String(error) }
      ));
    }
  }

  /**
   * 履修申請の保存
   * 
   * イベントソーシングパターン：
   * 1. 既存のイベントストリーム取得
   * 2. 楽観的ロックチェック
   * 3. 新しいイベント追加
   * 4. 集約状態の更新
   */
  async save(
    enrollment: Enrollment,
    domainEvent: EnrollmentDomainEvent
  ): Promise<Result<void, EnrollmentError>> {
    try {
      const aggregateId = this.generateAggregateId(
        enrollment.studentId,
        enrollment.courseId,
        enrollment.semester
      );

      // Event Store使用時の処理
      if (this.eventStore && this.eventStreamFactory) {
        return await this.saveWithEventStore(enrollment, domainEvent);
      }

      // 従来のメモリ方式での処理
      return await this.saveInMemory(enrollment, domainEvent, aggregateId);
    } catch (error) {
      return Err(createValidationError(
        'Failed to save enrollment',
        'REPOSITORY_ERROR',
        undefined,
        { error: String(error) }
      ));
    }
  }

  /**
   * Event Store使用時の保存処理
   */
  private async saveWithEventStore(
    enrollment: Enrollment,
    domainEvent: EnrollmentDomainEvent
  ): Promise<Result<void, EnrollmentError>> {
    if (!this.eventStore || !this.eventStreamFactory) {
      return Err(createValidationError('Event store not initialized', 'INTERNAL_ERROR'));
    }

    const stream = this.eventStreamFactory.createEnrollmentStream(
      enrollment.studentId,
      enrollment.courseId,
      enrollment.semester
    );

    // 楽観的ロック用の期待バージョン
    const expectedVersion = enrollment.version - 1;

    // Event Storeへの保存
    const appendResult = await stream.appendEvents([domainEvent], expectedVersion);
    if (!appendResult.success) {
      return appendResult;
    }

    // メモリキャッシュも更新
    const aggregateId = this.generateAggregateId(
      enrollment.studentId,
      enrollment.courseId,
      enrollment.semester
    );
    this.enrollments.set(aggregateId, enrollment);

    return Ok(undefined);
  }

  /**
   * 従来のメモリ方式での保存処理
   */
  private async saveInMemory(
    enrollment: Enrollment,
    domainEvent: EnrollmentDomainEvent,
    aggregateId: string
  ): Promise<Result<void, EnrollmentError>> {
    // 楽観的ロックチェック
    const existingEnrollment = this.enrollments.get(aggregateId);
    if (existingEnrollment && existingEnrollment.version >= enrollment.version) {
      return Err(createConcurrencyError(
        enrollment.version,
        existingEnrollment.version,
        aggregateId
      ));
    }

    // イベントストリームの更新
    const existingEvents = this.events.get(aggregateId) || [];
    const updatedEvents = [...existingEvents, domainEvent];
    this.events.set(aggregateId, updatedEvents);

    // 集約状態の更新
    this.enrollments.set(aggregateId, enrollment);

    return Ok(undefined);
  }

  /**
   * イベントストリームの取得
   */
  async getEventStream(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>> {
    try {
      // Event Store使用時の処理
      if (this.eventStore && this.eventStreamFactory) {
        const stream = this.eventStreamFactory.createEnrollmentStream(
          studentId,
          courseId,
          semester
        );
        return stream.getAllEvents();
      }

      // 従来のメモリ方式での処理
      const aggregateId = this.generateAggregateId(studentId, courseId, semester);
      const events = this.events.get(aggregateId) || [];
      return Ok([...events]); // コピーを返す（不変性保証）
    } catch (error) {
      return Err(createValidationError(
        'Failed to get event stream',
        'REPOSITORY_ERROR',
        undefined,
        { error: String(error) }
      ));
    }
  }

  // === テスト用ヘルパーメソッド ===

  /**
   * 全データのクリア（テスト用）
   */
  clear(): void {
    this.enrollments.clear();
    this.events.clear();
  }

  /**
   * 格納されている履修申請数の取得（テスト用）
   */
  getEnrollmentCount(): number {
    return this.enrollments.size;
  }

  /**
   * 格納されているイベント総数の取得（テスト用）
   */
  getEventCount(): number {
    return Array.from(this.events.values()).reduce((total, events) => total + events.length, 0);
  }
}

/**
 * モック用の学生リポジトリ実装
 */
export class MockStudentRepository implements IStudentRepository {
  private students = new Map<StudentId, {
    exists: boolean;
    status: 'active' | 'inactive' | 'graduated' | 'withdrawn';
  }>();

  /**
   * テスト用データの設定
   */
  setStudentData(
    studentId: StudentId, 
    exists: boolean, 
    status: 'active' | 'inactive' | 'graduated' | 'withdrawn' = 'active'
  ): void {
    this.students.set(studentId, { exists, status });
  }

  async exists(studentId: StudentId): Promise<Result<boolean, EnrollmentError>> {
    const student = this.students.get(studentId);
    return Ok(student?.exists || false);
  }

  async getEnrollmentStatus(
    studentId: StudentId
  ): Promise<Result<'active' | 'inactive' | 'graduated' | 'withdrawn', EnrollmentError>> {
    const student = this.students.get(studentId);
    if (!student?.exists) {
      return Err(createNotFoundError('Student', studentId));
    }
    return Ok(student.status);
  }

  clear(): void {
    this.students.clear();
  }
}

/**
 * モック用の科目リポジトリ実装
 */
export class MockCourseRepository implements ICourseRepository {
  private courses = new Map<CourseId, {
    exists: boolean;
    offerings: Map<Semester, { offered: boolean; maxCapacity: number; currentEnrollment: number }>;
  }>();

  /**
   * テスト用データの設定
   */
  setCourseData(
    courseId: CourseId,
    exists: boolean,
    offerings: Array<{
      semester: Semester;
      offered: boolean;
      maxCapacity: number;
      currentEnrollment: number;
    }> = []
  ): void {
    const offeringsMap = new Map();
    offerings.forEach(offering => {
      offeringsMap.set(offering.semester, {
        offered: offering.offered,
        maxCapacity: offering.maxCapacity,
        currentEnrollment: offering.currentEnrollment
      });
    });
    
    this.courses.set(courseId, { exists, offerings: offeringsMap });
  }

  async exists(courseId: CourseId): Promise<Result<boolean, EnrollmentError>> {
    const course = this.courses.get(courseId);
    return Ok(course?.exists || false);
  }

  async isOfferedInSemester(
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<boolean, EnrollmentError>> {
    const course = this.courses.get(courseId);
    if (!course?.exists) {
      return Ok(false);
    }
    
    const offering = course.offerings.get(semester);
    return Ok(offering?.offered || false);
  }

  async getCapacity(
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<{ max: number; current: number }, EnrollmentError>> {
    const course = this.courses.get(courseId);
    if (!course?.exists) {
      return Err(createNotFoundError('Course', courseId));
    }

    const offering = course.offerings.get(semester);
    if (!offering) {
      return Err(createNotFoundError('CourseOffering', `${courseId}-${semester}`));
    }

    return Ok({
      max: offering.maxCapacity,
      current: offering.currentEnrollment
    });
  }

  clear(): void {
    this.courses.clear();
  }
}

/**
 * インメモリリポジトリ設計の重要な判断
 * 
 * 1. 同期的操作: Promiseでラップしているが内部は同期処理
 * 2. 不変性: 返すデータはコピーを作成して不変性を保証
 * 3. エラーハンドリング: try-catchで予期しないエラーをキャッチ
 * 4. 楽観的ロック: バージョン番号による並行制御をシミュレート
 * 5. テスト支援: クリアメソッドなどテスト用の機能を提供
 * 6. モック実装: 依存するリポジトリのモック実装も同時提供
 */