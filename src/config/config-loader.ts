import { z } from 'zod';
import type { EnrollmentConfig } from './enrollment-config.js';
import { 
  EnrollmentConfigSchema,
  validateConfig,
  DEVELOPMENT_CONFIG,
  TEST_CONFIG,
  PRODUCTION_CONFIG
} from './enrollment-config.js';
import { DEFAULT_ENROLLMENT_CONFIG } from './default-config.js';

/**
 * 設定読み込み・管理クラス
 * 
 * 設計思想:
 * - 環境変数からの設定読み込み
 * - デフォルト値との合成
 * - 型安全性の保証
 * - 設定の検証とエラーハンドリング
 */

/**
 * 環境変数プレフィックス
 */
const ENV_PREFIX = 'ENROLLMENT_';

/**
 * 環境変数から設定を読み込む
 */
function loadFromEnvironment(): Partial<EnrollmentConfig> {
  const env = process.env;
  
  // 基本設定
  const config: any = {};
  
  if (env[`${ENV_PREFIX}ENVIRONMENT`]) {
    config.environment = env[`${ENV_PREFIX}ENVIRONMENT`];
  }
  
  // バリデーション設定
  if (env[`${ENV_PREFIX}STUDENT_ID_PATTERN`]) {
    config.validation = config.validation || {};
    config.validation.studentIdPattern = env[`${ENV_PREFIX}STUDENT_ID_PATTERN`];
  }
  
  if (env[`${ENV_PREFIX}COURSE_ID_PATTERN`]) {
    config.validation = config.validation || {};
    config.validation.courseIdPattern = env[`${ENV_PREFIX}COURSE_ID_PATTERN`];
  }
  
  // 処理設定
  if (env[`${ENV_PREFIX}MAX_RETRY_ATTEMPTS`]) {
    config.processing = config.processing || {};
    config.processing.retry = config.processing.retry || {};
    config.processing.retry.maxAttempts = parseInt(env[`${ENV_PREFIX}MAX_RETRY_ATTEMPTS`]!, 10);
  }
  
  if (env[`${ENV_PREFIX}DEFAULT_TIMEOUT_MS`]) {
    config.processing = config.processing || {};
    config.processing.timeout = config.processing.timeout || {};
    config.processing.timeout.defaultMs = parseInt(env[`${ENV_PREFIX}DEFAULT_TIMEOUT_MS`]!, 10);
  }
  
  // ビジネスルール設定
  if (env[`${ENV_PREFIX}MAX_COURSES_PER_SEMESTER`]) {
    config.businessRules = config.businessRules || {};
    config.businessRules.enrollment = config.businessRules.enrollment || {};
    config.businessRules.enrollment.maxCoursesPerSemester = parseInt(env[`${ENV_PREFIX}MAX_COURSES_PER_SEMESTER`]!, 10);
  }
  
  // Event Store設定
  if (env[`${ENV_PREFIX}SNAPSHOT_ENABLED`]) {
    config.eventStore = config.eventStore || {};
    config.eventStore.snapshot = config.eventStore.snapshot || {};
    config.eventStore.snapshot.enabled = env[`${ENV_PREFIX}SNAPSHOT_ENABLED`] === 'true';
  }
  
  // ログ設定
  if (env[`${ENV_PREFIX}LOG_LEVEL`]) {
    config.observability = config.observability || {};
    config.observability.logging = config.observability.logging || {};
    config.observability.logging.level = env[`${ENV_PREFIX}LOG_LEVEL`];
  }
  
  return config;
}

/**
 * 環境別プリセット設定を取得
 */
function getEnvironmentPreset(environment: string): Partial<EnrollmentConfig> {
  switch (environment) {
    case 'development':
      return DEVELOPMENT_CONFIG;
    case 'test':
      return TEST_CONFIG;
    case 'production':
      return PRODUCTION_CONFIG;
    default:
      return {};
  }
}

/**
 * 深いマージ（オブジェクトの入れ子をマージ）
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (sourceValue !== undefined) {
      if (
        typeof sourceValue === 'object' && 
        sourceValue !== null && 
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' && 
        targetValue !== null && 
        !Array.isArray(targetValue)
      ) {
        (result as any)[key] = deepMerge(targetValue, sourceValue);
      } else {
        (result as any)[key] = sourceValue;
      }
    }
  }
  
  return result;
}

/**
 * 設定ローダークラス
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private cachedConfig: EnrollmentConfig | null = null;

  private constructor() {}

  /**
   * シングルトンインスタンス取得
   */
  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * 設定を読み込み・検証
   * 
   * 優先順位:
   * 1. 環境変数
   * 2. 環境別プリセット
   * 3. デフォルト設定
   */
  load(overrides?: Partial<EnrollmentConfig>): {
    success: true;
    config: EnrollmentConfig;
  } | {
    success: false;
    error: z.ZodError;
    partialConfig?: Partial<EnrollmentConfig>;
  } {
    try {
      // 1. デフォルト設定から開始
      let config = { ...DEFAULT_ENROLLMENT_CONFIG };
      
      // 2. 環境変数を読み込み
      const envConfig = loadFromEnvironment();
      config = deepMerge(config, envConfig);
      
      // 3. 環境別プリセットを適用
      const environmentPreset = getEnvironmentPreset(config.environment);
      config = deepMerge(config, environmentPreset);
      
      // 4. オーバーライド設定を適用
      if (overrides) {
        config = deepMerge(config, overrides);
      }
      
      // 5. 設定の検証
      const validationResult = validateConfig(config);
      if (!validationResult.success) {
        return {
          success: false,
          error: validationResult.error,
          partialConfig: config
        };
      }
      
      this.cachedConfig = validationResult.data;
      
      return {
        success: true,
        config: validationResult.data
      };
      
    } catch (error) {
      // 予期しないエラーの場合は ZodError として扱う
      const zodError = new z.ZodError([{
        code: 'custom',
        message: error instanceof Error ? error.message : 'Unknown configuration error',
        path: []
      }]);
      
      return {
        success: false,
        error: zodError
      };
    }
  }

  /**
   * キャッシュされた設定を取得
   */
  getCached(): EnrollmentConfig | null {
    return this.cachedConfig;
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * 設定をリロード
   */
  reload(overrides?: Partial<EnrollmentConfig>): {
    success: true;
    config: EnrollmentConfig;
  } | {
    success: false;
    error: z.ZodError;
    partialConfig?: Partial<EnrollmentConfig>;
  } {
    this.clearCache();
    return this.load(overrides);
  }
}

/**
 * グローバル設定インスタンス
 */
const configLoader = ConfigLoader.getInstance();

/**
 * 設定を読み込む便利関数
 */
export function loadConfig(overrides?: Partial<EnrollmentConfig>): {
  success: true;
  config: EnrollmentConfig;
} | {
  success: false;
  error: z.ZodError;
  partialConfig?: Partial<EnrollmentConfig>;
} {
  return configLoader.load(overrides);
}

/**
 * 現在の設定を取得する便利関数
 */
export function getCurrentConfig(): EnrollmentConfig {
  const cached = configLoader.getCached();
  if (cached) {
    return cached;
  }
  
  const result = configLoader.load();
  if (result.success) {
    return result.config;
  }
  
  // フォールバック: デフォルト設定を返す（検証なし）
  console.warn('Failed to load configuration, using defaults:', result.error.message);
  return DEFAULT_ENROLLMENT_CONFIG;
}

/**
 * 設定をリロードする便利関数
 */
export function reloadConfig(overrides?: Partial<EnrollmentConfig>): {
  success: true;
  config: EnrollmentConfig;
} | {
  success: false;
  error: z.ZodError;
  partialConfig?: Partial<EnrollmentConfig>;
} {
  return configLoader.reload(overrides);
}

/**
 * テスト用: 設定を強制的にセット
 */
export function setConfigForTesting(config: EnrollmentConfig): void {
  ConfigLoader.getInstance().clearCache();
  ConfigLoader.getInstance()['cachedConfig'] = config;
}