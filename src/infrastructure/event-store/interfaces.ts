import type { Result } from '../../domain/types/index.js';
import type { EnrollmentDomainEvent } from '../../domain/domain-events.js';
import type { EnrollmentError } from '../../domain/errors.js';

/**
 * Event Store インターフェース
 * 
 * イベントソーシングの核となるストレージ抽象化
 * - 楽観的ロック対応
 * - ストリーム単位でのイベント管理
 * - 型安全なエラーハンドリング
 */

// === Event Store Core Interface ===

export interface IEventStore {
  /**
   * イベントストリームへの追記
   * 
   * @param streamId ストリーム識別子 (例: "enrollment-ST001-CS101-2025-spring")
   * @param events 追記するイベント配列
   * @param expectedVersion 楽観的ロック用の期待バージョン
   * @returns 成功またはエラー
   */
  append(
    streamId: string,
    events: EnrollmentDomainEvent[],
    expectedVersion: number
  ): Promise<Result<void, EnrollmentError>>;

  /**
   * イベントストリームの取得
   * 
   * @param streamId ストリーム識別子
   * @param fromVersion 取得開始バージョン（省略時は全て）
   * @returns イベント配列またはエラー
   */
  getEvents(
    streamId: string,
    fromVersion?: number
  ): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>>;

  /**
   * ストリームの現在バージョン取得
   * 
   * @param streamId ストリーム識別子
   * @returns 現在のバージョン番号またはエラー
   */
  getCurrentVersion(
    streamId: string
  ): Promise<Result<number, EnrollmentError>>;

  /**
   * ストリームの存在確認
   * 
   * @param streamId ストリーム識別子
   * @returns 存在するかどうかまたはエラー
   */
  streamExists(
    streamId: string
  ): Promise<Result<boolean, EnrollmentError>>;
}

// === Aggregate Snapshot Support ===

export interface AggregateSnapshot {
  aggregateId: string;
  aggregateType: string;
  version: number;
  data: unknown;
  timestamp: Date;
}

export interface ISnapshotStore {
  /**
   * スナップショットの保存
   */
  saveSnapshot(
    snapshot: AggregateSnapshot
  ): Promise<Result<void, EnrollmentError>>;

  /**
   * スナップショットの取得
   */
  getSnapshot(
    aggregateId: string,
    aggregateType: string
  ): Promise<Result<AggregateSnapshot | null, EnrollmentError>>;
}

// === Event Stream Metadata ===

export interface EventStreamMetadata {
  streamId: string;
  eventCount: number;
  firstEventVersion: number;
  lastEventVersion: number;
  createdAt: Date;
  lastModifiedAt: Date;
}

export interface IEventStreamMetadataStore {
  /**
   * ストリームメタデータの取得
   */
  getMetadata(
    streamId: string
  ): Promise<Result<EventStreamMetadata | null, EnrollmentError>>;

  /**
   * ストリームメタデータの更新
   */
  updateMetadata(
    metadata: EventStreamMetadata
  ): Promise<Result<void, EnrollmentError>>;
}