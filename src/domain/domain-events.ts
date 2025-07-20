import { z } from 'zod';
import { StudentIdSchema, CourseIdSchema, SemesterSchema } from './types/index.js';

/**
 * ドメインイベント設計思想
 * 
 * なぜイベントソーシングなのか？
 * 1. 監査証跡: すべての変更履歴が自然に残る
 * 2. 時間軸での分析: 「いつ」「なぜ」その状態になったかがわかる
 * 3. デバッグ容易性: 問題が起きた時の状況を完全に再現可能
 * 4. システム間連携: 他システムへの通知がイベントとして自然に実現
 * 5. 将来への拡張性: 新しい機能がイベントを購読することで追加可能
 */

// === イベントの共通構造 ===
export const DomainEventBaseSchema = z.object({
  // 集約の識別子
  studentId: StudentIdSchema,
  courseId: CourseIdSchema,
  
  // イベントメタデータ
  eventType: z.string(),
  occurredAt: z.date(),
  version: z.number().int().positive(), // 楽観的ロック用
  
  // トレーサビリティ
  correlationId: z.string().uuid().optional(), // 一連の処理を追跡するID
  causationId: z.string().uuid().optional()    // このイベントの原因となったコマンドのID
});

// === 履修申請イベント ===
export const EnrollmentRequestedEventSchema = DomainEventBaseSchema.extend({
  eventType: z.literal('EnrollmentRequested'),
  // 申請時点でのデータ
  data: z.object({
    semester: SemesterSchema,
    requestedAt: z.date(),
    // 申請理由などの追加情報（将来拡張用）
    metadata: z.record(z.unknown()).optional()
  })
});

export type EnrollmentRequestedEvent = z.infer<typeof EnrollmentRequestedEventSchema>;

// === イベント統合型（将来のイベント追加に備えて） ===
export const EnrollmentDomainEventSchema = z.discriminatedUnion('eventType', [
  EnrollmentRequestedEventSchema
  // 将来追加: EnrollmentApprovedEventSchema, EnrollmentCancelledEventSchema など
]);

export type EnrollmentDomainEvent = z.infer<typeof EnrollmentDomainEventSchema>;

// === イベントファクトリ関数 ===
export const createEnrollmentRequestedEvent = (
  studentId: z.infer<typeof StudentIdSchema>,
  courseId: z.infer<typeof CourseIdSchema>,
  semester: z.infer<typeof SemesterSchema>,
  version: number = 1,
  options?: {
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, unknown>;
  }
): EnrollmentRequestedEvent => {
  const now = new Date();
  
  return EnrollmentRequestedEventSchema.parse({
    studentId,
    courseId,
    eventType: 'EnrollmentRequested',
    occurredAt: now,
    version,
    correlationId: options?.correlationId,
    causationId: options?.causationId,
    data: {
      semester,
      requestedAt: now,
      metadata: options?.metadata
    }
  });
};

// === イベント分析ヘルパー ===
export const isEnrollmentRequestedEvent = (
  event: EnrollmentDomainEvent
): event is EnrollmentRequestedEvent =>
  event.eventType === 'EnrollmentRequested';

// === イベントストリーム操作 ===
export const sortEventsByVersion = (events: EnrollmentDomainEvent[]): EnrollmentDomainEvent[] =>
  [...events].sort((a, b) => a.version - b.version);

export const getLatestVersion = (events: EnrollmentDomainEvent[]): number =>
  events.length === 0 ? 0 : Math.max(...events.map(e => e.version));

// === イベント検証 ===
export const validateEventSequence = (events: EnrollmentDomainEvent[]): boolean => {
  if (events.length === 0) return true;
  
  const sorted = sortEventsByVersion(events);
  
  // バージョンが1から連続しているかチェック
  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    if (!event || event.version !== i + 1) {
      return false;
    }
  }
  
  // 最初のイベントはEnrollmentRequestedである必要がある
  return sorted.length > 0 && sorted[0]?.eventType === 'EnrollmentRequested';
};

/**
 * イベント設計上の重要な判断
 * 
 * 1. イベント不変性: 一度作成されたイベントは変更されない
 * 2. イベントの完全性: イベントだけで状態を復元できる情報を含む
 * 3. 時系列性: occurredAt とversionで正確な順序を保証
 * 4. トレーサビリティ: correlationId/causationIdで処理の流れを追跡
 * 5. 拡張性: 新しいイベントタイプを追加しやすい設計
 */