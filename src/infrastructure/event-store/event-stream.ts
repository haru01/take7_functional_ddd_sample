import type { Result } from '../../domain/types/index.js';
import type { EnrollmentDomainEvent } from '../../domain/domain-events.js';
import type { EnrollmentError } from '../../domain/errors.js';
import type { StudentId, CourseId, Semester } from '../../domain/types/index.js';
import type { IEventStore } from './interfaces.js';

/**
 * Event Stream操作のユーティリティ
 * 
 * ドメイン固有のストリーム管理ロジック
 * - ストリームID生成
 * - 集約特化の操作
 */

/**
 * 履修申請のストリームIDを生成
 * 
 * パターン: "enrollment-{studentId}-{courseId}-{semester}"
 */
export function createEnrollmentStreamId(
  studentId: StudentId,
  courseId: CourseId,
  semester: Semester
): string {
  return `enrollment-${studentId}-${courseId}-${semester}`;
}

/**
 * ストリームIDから履修識別子を抽出
 */
export function parseEnrollmentStreamId(streamId: string): {
  studentId: string;
  courseId: string;
  semester: string;
} | null {
  const pattern = /^enrollment-([^-]+)-([^-]+)-(.+)$/;
  const match = streamId.match(pattern);
  
  if (!match) {
    return null;
  }

  return {
    studentId: match[1]!,
    courseId: match[2]!,
    semester: match[3]!
  };
}

/**
 * 履修申請のイベントストリーム操作クラス
 */
export class EnrollmentEventStream {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly studentId: StudentId,
    private readonly courseId: CourseId,
    private readonly semester: Semester
  ) {}

  /**
   * ストリームID取得
   */
  get streamId(): string {
    return createEnrollmentStreamId(this.studentId, this.courseId, this.semester);
  }

  /**
   * イベント追記
   */
  async appendEvents(
    events: EnrollmentDomainEvent[],
    expectedVersion: number
  ): Promise<Result<void, EnrollmentError>> {
    return this.eventStore.append(this.streamId, events, expectedVersion);
  }

  /**
   * 全イベント取得
   */
  async getAllEvents(): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>> {
    return this.eventStore.getEvents(this.streamId);
  }

  /**
   * 指定バージョン以降のイベント取得
   */
  async getEventsFrom(version: number): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>> {
    return this.eventStore.getEvents(this.streamId, version);
  }

  /**
   * 現在のバージョン取得
   */
  async getCurrentVersion(): Promise<Result<number, EnrollmentError>> {
    return this.eventStore.getCurrentVersion(this.streamId);
  }

  /**
   * ストリーム存在確認
   */
  async exists(): Promise<Result<boolean, EnrollmentError>> {
    return this.eventStore.streamExists(this.streamId);
  }
}

/**
 * Event Streamファクトリ
 */
export class EventStreamFactory {
  constructor(private readonly eventStore: IEventStore) {}

  /**
   * 履修申請用のイベントストリームを作成
   */
  createEnrollmentStream(
    studentId: StudentId,
    courseId: CourseId,
    semester: Semester
  ): EnrollmentEventStream {
    return new EnrollmentEventStream(
      this.eventStore,
      studentId,
      courseId,
      semester
    );
  }

  /**
   * ストリームIDから履修申請イベントストリームを復元
   */
  fromStreamId(streamId: string): EnrollmentEventStream | null {
    const parsed = parseEnrollmentStreamId(streamId);
    if (!parsed) {
      return null;
    }

    return new EnrollmentEventStream(
      this.eventStore,
      parsed.studentId as StudentId,
      parsed.courseId as CourseId,
      parsed.semester as Semester
    );
  }
}