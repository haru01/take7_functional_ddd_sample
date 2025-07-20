import type { Result } from '../../domain/types/index.js';
import type { EnrollmentError } from '../../domain/errors.js';
import type { EnrollmentDomainEvent } from '../../domain/domain-events.js';
import { Ok } from '../../domain/types/index.js';

import type { 
  INotificationService,
  IEventPublisher 
} from '../../application/ports.js';

/**
 * モック通知サービス実装
 * 
 * テスト・開発用の実装。
 * 本番では実際のメール送信やプッシュ通知サービスに置き換え。
 */
export class MockNotificationService implements INotificationService {
  private sentNotifications: Array<{
    event: EnrollmentDomainEvent;
    timestamp: Date;
  }> = [];

  async notifyEnrollmentRequested(
    event: EnrollmentDomainEvent
  ): Promise<Result<void, EnrollmentError>> {
    // 通知の記録（テスト検証用）
    this.sentNotifications.push({
      event,
      timestamp: new Date()
    });

    // 実際の実装では：
    // - メール送信
    // - プッシュ通知
    // - SMS送信
    // など

    return Ok(undefined);
  }

  // === テスト用ヘルパーメソッド ===

  /**
   * 送信された通知の履歴を取得
   */
  getSentNotifications(): Array<{
    event: EnrollmentDomainEvent;
    timestamp: Date;
  }> {
    return [...this.sentNotifications];
  }

  /**
   * 通知履歴のクリア
   */
  clear(): void {
    this.sentNotifications = [];
  }

  /**
   * 最後に送信された通知の取得
   */
  getLastNotification(): {
    event: EnrollmentDomainEvent;
    timestamp: Date;
  } | null {
    return this.sentNotifications[this.sentNotifications.length - 1] || null;
  }
}

/**
 * モックイベント発行者実装
 * 
 * テスト・開発用の実装。
 * 本番では実際のメッセージングシステム（Kafka、RabbitMQ等）に置き換え。
 */
export class MockEventPublisher implements IEventPublisher {
  private publishedEvents: Array<{
    events: EnrollmentDomainEvent[];
    timestamp: Date;
  }> = [];

  async publish(
    events: EnrollmentDomainEvent[]
  ): Promise<Result<void, EnrollmentError>> {
    // イベントの記録（テスト検証用）
    this.publishedEvents.push({
      events: [...events], // コピーを保存
      timestamp: new Date()
    });

    // 実際の実装では：
    // - Kafkaトピックへの発行
    // - RabbitMQキューへの送信
    // - AWS EventBridgeへの送信
    // - 他のマイクロサービスへのHTTP通知
    // など

    return Ok(undefined);
  }

  // === テスト用ヘルパーメソッド ===

  /**
   * 発行されたイベントの履歴を取得
   */
  getPublishedEvents(): Array<{
    events: EnrollmentDomainEvent[];
    timestamp: Date;
  }> {
    return [...this.publishedEvents];
  }

  /**
   * 発行されたすべてのイベントをフラットなリストで取得
   */
  getAllEvents(): EnrollmentDomainEvent[] {
    return this.publishedEvents.flatMap(batch => batch.events);
  }

  /**
   * イベント履歴のクリア
   */
  clear(): void {
    this.publishedEvents = [];
  }

  /**
   * 最後に発行されたイベントバッチの取得
   */
  getLastEventBatch(): {
    events: EnrollmentDomainEvent[];
    timestamp: Date;
  } | null {
    return this.publishedEvents[this.publishedEvents.length - 1] || null;
  }

  /**
   * 特定タイプのイベントのみを取得
   */
  getEventsByType(eventType: string): EnrollmentDomainEvent[] {
    return this.getAllEvents().filter(event => event.eventType === eventType);
  }
}

/**
 * モックサービスファクトリ
 * 
 * テスト用のモック実装を一括で作成・設定するヘルパー
 */
export class MockServiceFactory {
  static createTestServices() {
    return {
      notificationService: new MockNotificationService(),
      eventPublisher: new MockEventPublisher()
    };
  }

  static clearAllServices(services: {
    notificationService: MockNotificationService;
    eventPublisher: MockEventPublisher;
  }): void {
    services.notificationService.clear();
    services.eventPublisher.clear();
  }
}

/**
 * モックサービス設計の原則
 * 
 * 1. 実インターフェース実装: 本番実装と同じインターフェースを実装
 * 2. テスト支援: テスト検証用のヘルパーメソッドを提供
 * 3. 状態保持: 呼び出し履歴を保持してテストで検証可能
 * 4. 簡素な実装: 複雑なロジックは含めず、記録のみに集中
 * 5. クリア機能: テスト間での状態リセット機能
 * 6. 不変性保証: 返すデータはコピーして外部からの変更を防ぐ
 */