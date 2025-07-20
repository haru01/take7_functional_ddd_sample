import { z } from 'zod';

/**
 * 履修管理システム設定定義
 * 
 * 設計思想:
 * - 型安全性: Zodによる実行時検証
 * - 環境別設定: 開発・テスト・本番での違い
 * - デフォルト値: 合理的なデフォルト設定
 * - 拡張性: 新しい設定項目の追加容易性
 */

// === バリデーション設定 ===
export const ValidationConfigSchema = z.object({
  /** 履修申請可能な学期の範囲（現在年度からの相対年数） */
  allowedSemesterRange: z.object({
    pastYears: z.number().min(0).max(5).default(1),
    futureYears: z.number().min(0).max(5).default(1)
  }).default({ pastYears: 1, futureYears: 1 }),

  /** 学生ID検証パターン */
  studentIdPattern: z.string().regex(/^\/.*\/$/).default('/^[A-Z0-9]{1,20}$/'),

  /** 科目ID検証パターン */
  courseIdPattern: z.string().regex(/^\/.*\/$/).default('/^[A-Z0-9]{1,20}$/'),

  /** 学期検証パターン */
  semesterPattern: z.string().regex(/^\/.*\/$/).default('/^\\d{4}-(spring|summer|fall)$/')
});

// === 処理性能設定 ===
export const ProcessingConfigSchema = z.object({
  /** リトライ設定 */
  retry: z.object({
    maxAttempts: z.number().min(1).max(10).default(3),
    baseDelayMs: z.number().min(100).max(10000).default(1000),
    maxDelayMs: z.number().min(1000).max(60000).default(30000),
    exponentialBackoff: z.boolean().default(true)
  }).default({}),

  /** タイムアウト設定 */
  timeout: z.object({
    defaultMs: z.number().min(1000).max(300000).default(30000),
    databaseMs: z.number().min(1000).max(60000).default(10000),
    notificationMs: z.number().min(1000).max(30000).default(5000)
  }).default({}),

  /** 並列処理設定 */
  concurrency: z.object({
    maxParallelRequests: z.number().min(1).max(1000).default(100),
    batchSize: z.number().min(1).max(100).default(10)
  }).default({})
});

// === Event Store設定 ===
export const EventStoreConfigSchema = z.object({
  /** スナップショット設定 */
  snapshot: z.object({
    enabled: z.boolean().default(false),
    interval: z.number().min(1).max(1000).default(10), // N回のイベントごと
    retentionDays: z.number().min(1).max(3650).default(365)
  }).default({}),

  /** イベント保持設定 */
  retention: z.object({
    enabled: z.boolean().default(false),
    maxEvents: z.number().min(1000).max(1000000).default(100000),
    maxAgeDays: z.number().min(30).max(3650).default(365)
  }).default({})
});

// === ビジネスルール設定 ===
export const BusinessRulesConfigSchema = z.object({
  /** 履修制限 */
  enrollment: z.object({
    maxCoursesPerSemester: z.number().min(1).max(50).default(8),
    minCoursesPerSemester: z.number().min(0).max(10).default(0),
    allowDuplicateEnrollment: z.boolean().default(false),
    requirePrerequisites: z.boolean().default(true)
  }).default({}),

  /** 申請期限 */
  deadlines: z.object({
    enrollmentDeadlineDays: z.number().min(1).max(365).default(30),
    cancellationDeadlineDays: z.number().min(1).max(90).default(14),
    gracePeriodHours: z.number().min(0).max(168).default(24)
  }).default({})
});

// === ログ・監視設定 ===
export const ObservabilityConfigSchema = z.object({
  /** ログレベル */
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    enableAuditLog: z.boolean().default(true),
    enablePerformanceLog: z.boolean().default(false)
  }).default({}),

  /** メトリクス設定 */
  metrics: z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().url().optional(),
    intervalMs: z.number().min(1000).max(300000).default(60000)
  }).default({})
});

// === 統合設定スキーマ ===
export const EnrollmentConfigSchema = z.object({
  /** 設定環境 */
  environment: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  /** 各種設定 */
  validation: ValidationConfigSchema.default({}),
  processing: ProcessingConfigSchema.default({}),
  eventStore: EventStoreConfigSchema.default({}),
  businessRules: BusinessRulesConfigSchema.default({}),
  observability: ObservabilityConfigSchema.default({})
});

// === 型定義 ===
export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;
export type ProcessingConfig = z.infer<typeof ProcessingConfigSchema>;
export type EventStoreConfig = z.infer<typeof EventStoreConfigSchema>;
export type BusinessRulesConfig = z.infer<typeof BusinessRulesConfigSchema>;
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;
export type EnrollmentConfig = z.infer<typeof EnrollmentConfigSchema>;

// === 設定検証ヘルパー ===
export function validateConfig(input: unknown): {
  success: true;
  data: EnrollmentConfig;
} | {
  success: false;
  error: z.ZodError;
} {
  const result = EnrollmentConfigSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

// === 環境別設定プリセット ===
export const DEVELOPMENT_CONFIG: Partial<EnrollmentConfig> = {
  environment: 'development',
  processing: {
    retry: { 
      maxAttempts: 2, 
      baseDelayMs: 500,
      maxDelayMs: 30000,
      exponentialBackoff: true
    },
    timeout: { 
      defaultMs: 10000,
      databaseMs: 5000,
      notificationMs: 3000
    },
    concurrency: { 
      maxParallelRequests: 10,
      batchSize: 5
    }
  },
  observability: {
    logging: { 
      level: 'debug',
      enableAuditLog: true,
      enablePerformanceLog: true
    },
    metrics: {
      enabled: false,
      intervalMs: 60000
    }
  }
};

export const TEST_CONFIG: Partial<EnrollmentConfig> = {
  environment: 'test',
  processing: {
    retry: { 
      maxAttempts: 1, 
      baseDelayMs: 100,
      maxDelayMs: 1000,
      exponentialBackoff: false
    },
    timeout: { 
      defaultMs: 5000,
      databaseMs: 2000,
      notificationMs: 1000
    },
    concurrency: { 
      maxParallelRequests: 5,
      batchSize: 2
    }
  },
  observability: {
    logging: { 
      level: 'warn',
      enableAuditLog: false,
      enablePerformanceLog: false
    },
    metrics: {
      enabled: false,
      intervalMs: 300000
    }
  }
};

export const PRODUCTION_CONFIG: Partial<EnrollmentConfig> = {
  environment: 'production',
  processing: {
    retry: { 
      maxAttempts: 5, 
      baseDelayMs: 2000,
      maxDelayMs: 60000,
      exponentialBackoff: true
    },
    timeout: { 
      defaultMs: 60000,
      databaseMs: 30000,
      notificationMs: 10000
    },
    concurrency: { 
      maxParallelRequests: 200,
      batchSize: 20
    }
  },
  eventStore: {
    snapshot: { 
      enabled: true, 
      interval: 50,
      retentionDays: 365
    },
    retention: { 
      enabled: true, 
      maxEvents: 1000000,
      maxAgeDays: 365
    }
  },
  observability: {
    logging: { 
      level: 'info', 
      enableAuditLog: true,
      enablePerformanceLog: false
    },
    metrics: { 
      enabled: true, 
      intervalMs: 30000
    }
  }
};