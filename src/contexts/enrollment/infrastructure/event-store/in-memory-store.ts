import { Ok, Err, type Result } from '../../../../shared/types/index';
import type { EnrollmentDomainEvent } from '../../domain/events/domain-events';
import type { EnrollmentError } from '../../domain/errors/errors';
import { createConcurrencyError, createNotFoundError } from '../../domain/errors/errors';
import { getCurrentConfig } from '../../../../shared/config/index';
import type { 
  IEventStore, 
  ISnapshotStore, 
  AggregateSnapshot,
  EventStreamMetadata,
  IEventStreamMetadataStore
} from './interfaces';

/**
 * In-Memory Event Store実装
 * 
 * 開発・テスト用の軽量実装
 * - メモリ内でのイベント管理
 * - 楽観的ロック対応
 * - スナップショット機能
 */

interface StoredEvent {
  streamId: string;
  version: number;
  event: EnrollmentDomainEvent;
  timestamp: Date;
}

export class InMemoryEventStore implements IEventStore, ISnapshotStore, IEventStreamMetadataStore {
  private events: Map<string, StoredEvent[]> = new Map();
  private snapshots: Map<string, AggregateSnapshot> = new Map();
  private metadata: Map<string, EventStreamMetadata> = new Map();

  /**
   * 設定を取得する
   */
  private getConfig() {
    return getCurrentConfig();
  }

  // === IEventStore Implementation ===

  async append(
    streamId: string,
    events: EnrollmentDomainEvent[],
    expectedVersion: number
  ): Promise<Result<void, EnrollmentError>> {
    // 現在のバージョンチェック（楽観的ロック）
    const currentVersionResult = await this.getCurrentVersion(streamId);
    if (!currentVersionResult.success) {
      return currentVersionResult;
    }

    const currentVersion = currentVersionResult.data;
    if (currentVersion !== expectedVersion) {
      return Err(createConcurrencyError(
        expectedVersion,
        currentVersion,
        streamId
      ));
    }

    // イベントの追記
    const streamEvents = this.events.get(streamId) || [];
    const now = new Date();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      
      const storedEvent: StoredEvent = {
        streamId,
        version: expectedVersion + i + 1,
        event: {
          ...event,
          version: expectedVersion + i + 1 // バージョンを更新
        },
        timestamp: now
      };
      streamEvents.push(storedEvent);
    }

    this.events.set(streamId, streamEvents);

    // メタデータの更新
    await this.updateStreamMetadata(streamId, streamEvents);

    // 設定に基づくスナップショット作成
    await this.createSnapshotIfNeeded(streamId, streamEvents);

    return Ok(undefined);
  }

  async getEvents(
    streamId: string,
    fromVersion: number = 1
  ): Promise<Result<EnrollmentDomainEvent[], EnrollmentError>> {
    const streamEvents = this.events.get(streamId) || [];
    
    const filteredEvents = streamEvents
      .filter(stored => stored.version >= fromVersion)
      .sort((a, b) => a.version - b.version)
      .map(stored => stored.event);

    return Ok(filteredEvents);
  }

  async getCurrentVersion(streamId: string): Promise<Result<number, EnrollmentError>> {
    const streamEvents = this.events.get(streamId) || [];
    const maxVersion = streamEvents.length === 0 
      ? 0 
      : Math.max(...streamEvents.map(e => e.version));
    
    return Ok(maxVersion);
  }

  async streamExists(streamId: string): Promise<Result<boolean, EnrollmentError>> {
    const exists = this.events.has(streamId) && this.events.get(streamId)!.length > 0;
    return Ok(exists);
  }

  // === ISnapshotStore Implementation ===

  async saveSnapshot(
    snapshot: AggregateSnapshot
  ): Promise<Result<void, EnrollmentError>> {
    const key = `${snapshot.aggregateType}-${snapshot.aggregateId}`;
    this.snapshots.set(key, {
      ...snapshot,
      timestamp: new Date()
    });
    return Ok(undefined);
  }

  async getSnapshot(
    aggregateId: string,
    aggregateType: string
  ): Promise<Result<AggregateSnapshot | null, EnrollmentError>> {
    const key = `${aggregateType}-${aggregateId}`;
    const snapshot = this.snapshots.get(key) || null;
    return Ok(snapshot);
  }

  // === IEventStreamMetadataStore Implementation ===

  async getMetadata(
    streamId: string
  ): Promise<Result<EventStreamMetadata | null, EnrollmentError>> {
    const metadata = this.metadata.get(streamId) || null;
    return Ok(metadata);
  }

  async updateMetadata(
    metadata: EventStreamMetadata
  ): Promise<Result<void, EnrollmentError>> {
    this.metadata.set(metadata.streamId, {
      ...metadata,
      lastModifiedAt: new Date()
    });
    return Ok(undefined);
  }

  // === Private Helper Methods ===

  private async updateStreamMetadata(
    streamId: string,
    events: StoredEvent[]
  ): Promise<void> {
    if (events.length === 0) return;

    const existingMetadata = this.metadata.get(streamId);
    const now = new Date();
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    if (!firstEvent || !lastEvent) return;

    const metadata: EventStreamMetadata = {
      streamId,
      eventCount: events.length,
      firstEventVersion: firstEvent.version,
      lastEventVersion: lastEvent.version,
      createdAt: existingMetadata?.createdAt || now,
      lastModifiedAt: now
    };

    this.metadata.set(streamId, metadata);
  }

  /**
   * 設定に基づいてスナップショットを作成
   */
  private async createSnapshotIfNeeded(
    streamId: string,
    events: StoredEvent[]
  ): Promise<void> {
    const config = this.getConfig();
    
    if (!config.eventStore.snapshot.enabled) {
      return;
    }

    if (events.length === 0) {
      return;
    }

    const lastEvent = events[events.length - 1];
    if (!lastEvent) {
      return;
    }

    const interval = config.eventStore.snapshot.interval;
    
    // スナップショット間隔に達した場合にスナップショットを作成
    if (lastEvent.version % interval === 0) {
      // 簡略化実装: 実際にはイベントから集約を復元してスナップショットを作成
      const snapshot: AggregateSnapshot = {
        aggregateId: streamId,
        aggregateType: 'Enrollment',
        version: lastEvent.version,
        data: {
          // 簡略化: 実際には集約の状態データ
          lastEventType: lastEvent.event.eventType,
          streamId: streamId
        },
        timestamp: new Date()
      };

      await this.saveSnapshot(snapshot);
    }
  }

  // === Development/Testing Utilities ===

  /**
   * 全イベント削除（テスト用）
   */
  async clear(): Promise<void> {
    this.events.clear();
    this.snapshots.clear();
    this.metadata.clear();
  }

  /**
   * 統計情報取得（開発用）
   */
  async getStatistics(): Promise<{
    totalStreams: number;
    totalEvents: number;
    totalSnapshots: number;
  }> {
    const totalStreams = this.events.size;
    const totalEvents = Array.from(this.events.values())
      .reduce((sum, events) => sum + events.length, 0);
    const totalSnapshots = this.snapshots.size;

    return {
      totalStreams,
      totalEvents,
      totalSnapshots
    };
  }

  /**
   * 全ストリーム一覧取得（デバッグ用）
   */
  async getAllStreamIds(): Promise<string[]> {
    return Array.from(this.events.keys());
  }
}