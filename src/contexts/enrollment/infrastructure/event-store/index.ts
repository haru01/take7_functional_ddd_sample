/**
 * Event Store - 統合エクスポート
 * 
 * イベントソーシング基盤の完全な実装
 * - インターフェース定義
 * - In-Memory実装（開発・テスト用）
 * - ドメイン固有のストリーム操作
 */

// === インターフェース ===
export {
  type IEventStore,
  type ISnapshotStore,
  type AggregateSnapshot,
  type EventStreamMetadata,
  type IEventStreamMetadataStore
} from './interfaces';

// === 実装 ===
export {
  InMemoryEventStore
} from './in-memory-store';

// === ドメイン固有のストリーム操作 ===
export {
  createEnrollmentStreamId,
  parseEnrollmentStreamId,
  EnrollmentEventStream,
  EventStreamFactory
} from './event-stream';