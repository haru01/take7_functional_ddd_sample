import type { Result } from '../../../../shared/types/index';
import type { EnrollmentError } from '../../domain/errors/errors';
import type { 
  StudentId, 
  CourseId, 
  Semester
} from '../../../../shared/types/index';
import type { 
  Enrollment 
} from '../../domain/entities/enrollment-types';
import type { EnrollmentDomainEvent } from '../../domain/events/domain-events';

/**
 * ポート＆アダプタパターン（ヘキサゴナルアーキテクチャ）
 * 
 * なぜインターフェースを定義するのか？
 * 1. 依存性逆転: ドメイン層がインフラ層に依存しない
 * 2. テスタビリティ: モック実装で単体テスト可能
 * 3. 技術選択の柔軟性: 実装詳細を後から変更可能
 * 4. 境界の明確化: 何ができて何ができないかが明確
 */

// === プライマリポート（ドメインサービスが提供する機能） ===

export interface IEnrollmentDomainService {
  /**
   * 履修申請の作成
   * 
   * @param studentId 学生ID
   * @param courseId 科目ID
   * @param semester 学期
   * @param options オプション（トレーサビリティ用）
   * @returns 作成された履修申請またはエラー
   */
  requestEnrollment(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester,
    options?: {
      correlationId?: string;
      causationId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Result<Enrollment & { domainEvent: EnrollmentDomainEvent }, EnrollmentError>;

  /**
   * イベントストリームからの状態復元
   * 
   * @param events ドメインイベントの配列
   * @returns 復元された履修申請またはエラー
   */
  reconstructFromEvents(
    events: EnrollmentDomainEvent[]
  ): Result<Enrollment | null, EnrollmentError>;
}

// === セカンダリポート（外部システムとの連携） ===

export interface IEnrollmentRepository {
  /**
   * 履修申請の検索（学生と科目の組み合わせ）
   * 
   * @param studentId 学生ID
   * @param courseId 科目ID
   * @returns 見つかった履修申請またはnull、もしくはエラー
   */
  findByStudentAndCourse(
    studentId: StudentId,
    courseId: CourseId
  ): Promise<Result<Enrollment | null, EnrollmentError>>;

  /**
   * 履修申請の検索（学生と科目と学期の組み合わせ）
   * 
   * @param studentId 学生ID
   * @param courseId 科目ID
   * @param semester 学期
   * @returns 見つかった履修申請またはnull、もしくはエラー
   */
  findByStudentCourseAndSemester(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<Enrollment | null, EnrollmentError>>;

  /**
   * 履修申請の保存（新規作成・更新）
   * 
   * @param enrollment 履修申請
   * @param domainEvent 関連するドメインイベント
   * @returns 成功またはエラー
   */
  save(
    enrollment: Enrollment,
    domainEvent: EnrollmentDomainEvent
  ): Promise<Result<void, EnrollmentError>>;

  /**
   * イベントストリームの取得
   * 
   * @param studentId 学生ID
   * @param courseId 科目ID
   * @param semester 学期
   * @returns イベントストリームまたはエラー
   */
  getEventStream(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>>;
}

export interface IStudentRepository {
  /**
   * 学生の存在確認
   * 
   * @param studentId 学生ID
   * @returns 学生が存在するかどうか、またはエラー
   */
  exists(studentId: StudentId): Promise<Result<boolean, EnrollmentError>>;

  /**
   * 学生の在籍状況確認
   * 
   * @param studentId 学生ID
   * @returns 在籍状況（active/inactive/graduated/withdrawn）またはエラー
   */
  getEnrollmentStatus(
    studentId: StudentId
  ): Promise<Result<'active' | 'inactive' | 'graduated' | 'withdrawn', EnrollmentError>>;
}

export interface ICourseRepository {
  /**
   * 科目の存在確認
   * 
   * @param courseId 科目ID
   * @returns 科目が存在するかどうか、またはエラー
   */
  exists(courseId: CourseId): Promise<Result<boolean, EnrollmentError>>;

  /**
   * 科目の開講状況確認
   * 
   * @param courseId 科目ID
   * @param semester 学期
   * @returns 開講されているかどうか、またはエラー
   */
  isOfferedInSemester(
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<boolean, EnrollmentError>>;

  /**
   * 科目の定員確認
   * 
   * @param courseId 科目ID
   * @param semester 学期
   * @returns 定員情報またはエラー
   */
  getCapacity(
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<{ max: number; current: number }, EnrollmentError>>;
}

// === 外部システム連携ポート ===

export interface INotificationService {
  /**
   * 履修申請通知の送信
   * 
   * @param event ドメインイベント
   * @returns 送信結果またはエラー
   */
  notifyEnrollmentRequested(
    event: EnrollmentDomainEvent
  ): Promise<Result<void, EnrollmentError>>;
}

export interface IEventPublisher {
  /**
   * ドメインイベントの公開
   * 
   * @param events 公開するイベント配列
   * @returns 公開結果またはエラー
   */
  publish(
    events: EnrollmentDomainEvent[]
  ): Promise<Result<void, EnrollmentError>>;
}

/**
 * ポート設計の重要な原則
 * 
 * 1. 単一責任: 各インターフェースは一つの責任のみ
 * 2. 依存性逆転: 詳細が抽象に依存する
 * 3. インターフェース分離: 使わないメソッドに依存しない
 * 4. 非同期対応: 外部システムとの通信はPromiseベース
 * 5. エラーハンドリング: Either型で一貫したエラー処理
 * 6. 将来拡張: 新しい要件に対応しやすい設計
 */