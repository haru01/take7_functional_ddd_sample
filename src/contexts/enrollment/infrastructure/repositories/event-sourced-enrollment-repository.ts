import type { Result } from '../../../../shared/types/index';
import type { 
  StudentId, 
  CourseId, 
  Semester
} from '../../../../shared/types/index';
import type { 
  Enrollment 
} from '../../domain/entities/enrollment-types';
import type { EnrollmentError } from '../../domain/errors/errors';
import type { EnrollmentDomainEvent } from '../../domain/events/domain-events';
import { Ok } from '../../../../shared/types/index';

import type { IEnrollmentRepository } from '../../application/ports/ports';
import type { IEventStore } from '../event-store/interfaces';
import { EventStreamFactory } from '../event-store/event-stream';
import { reconstructEnrollmentFromEvents } from '../../domain/aggregates/enrollment-aggregate';

/**
 * Event Store専用の履修申請リポジトリ
 * 
 * Event Storeを使用した完全なイベントソーシング実装
 * - 集約の永続化はイベントストリームのみ
 * - 状態は常にイベントから復元
 * - 楽観的ロック対応
 */
export class EventSourcedEnrollmentRepository implements IEnrollmentRepository {
  private eventStreamFactory: EventStreamFactory;

  constructor(private readonly eventStore: IEventStore) {
    this.eventStreamFactory = new EventStreamFactory(eventStore);
  }

  /**
   * 学生と科目による履修申請検索
   * 
   * 注意: Event Storeでは学期が必要なため、この検索は制限付き実装
   * 本来であれば学期を超えた検索インデックスが必要
   */
  async findByStudentAndCourse(
    _studentId: StudentId,
    _courseId: CourseId
  ): Promise<Result<Enrollment | null, EnrollmentError>> {
    // TODO: 学期を超えた検索の実装
    // 現状では実装困難なため、nullを返す
    return Ok(null);
  }

  /**
   * 学生・科目・学期による履修申請検索
   * 
   * Event Storeからイベントを取得して集約を復元
   */
  async findByStudentCourseAndSemester(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<Enrollment | null, EnrollmentError>> {
    const stream = this.eventStreamFactory.createEnrollmentStream(
      studentId,
      courseId,
      semester
    );

    // ストリーム存在確認
    const existsResult = await stream.exists();
    if (!existsResult.success) {
      return existsResult;
    }

    if (!existsResult.data) {
      return Ok(null);
    }

    // イベントから集約を復元
    const eventsResult = await stream.getAllEvents();
    if (!eventsResult.success) {
      return eventsResult;
    }

    return reconstructEnrollmentFromEvents(eventsResult.data);
  }

  /**
   * 履修申請の保存
   * 
   * Event Storeにイベントを追記するのみ
   * 集約の状態は永続化しない（イベントから復元）
   */
  async save(
    enrollment: Enrollment,
    domainEvent: EnrollmentDomainEvent
  ): Promise<Result<void, EnrollmentError>> {
    const stream = this.eventStreamFactory.createEnrollmentStream(
      enrollment.studentId,
      enrollment.courseId,
      enrollment.semester
    );

    // 楽観的ロック用の期待バージョン
    const expectedVersion = enrollment.version - 1;

    return stream.appendEvents([domainEvent], expectedVersion);
  }

  /**
   * イベントストリームの取得
   * 
   * 監査ログやデバッグ目的でイベント履歴を取得
   */
  async getEventStream(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>> {
    const stream = this.eventStreamFactory.createEnrollmentStream(
      studentId,
      courseId,
      semester
    );

    return stream.getAllEvents();
  }

  // === Event Store固有のメソッド ===

  /**
   * 指定バージョン以降のイベントを取得
   * 
   * スナップショット機能で使用
   */
  async getEventsFromVersion(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester,
    fromVersion: number
  ): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>> {
    const stream = this.eventStreamFactory.createEnrollmentStream(
      studentId,
      courseId,
      semester
    );

    return stream.getEventsFrom(fromVersion);
  }

  /**
   * 現在のストリームバージョン取得
   */
  async getCurrentVersion(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<number, EnrollmentError>> {
    const stream = this.eventStreamFactory.createEnrollmentStream(
      studentId,
      courseId,
      semester
    );

    return stream.getCurrentVersion();
  }

  /**
   * ストリーム存在確認
   */
  async streamExists(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): Promise<Result<boolean, EnrollmentError>> {
    const stream = this.eventStreamFactory.createEnrollmentStream(
      studentId,
      courseId,
      semester
    );

    return stream.exists();
  }
}