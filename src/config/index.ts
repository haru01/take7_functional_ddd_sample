/**
 * 設定管理モジュール
 * 
 * 一元的な設定管理システム
 * - 型安全な設定定義
 * - 環境変数からの読み込み
 * - デフォルト値管理
 * - 環境別プリセット
 */

// 設定スキーマとバリデーション
export {
  type EnrollmentConfig,
  type ValidationConfig,
  type ProcessingConfig,
  type EventStoreConfig,
  type BusinessRulesConfig,
  type ObservabilityConfig,
  EnrollmentConfigSchema,
  ValidationConfigSchema,
  ProcessingConfigSchema,
  EventStoreConfigSchema,
  BusinessRulesConfigSchema,
  ObservabilityConfigSchema,
  validateConfig,
  DEVELOPMENT_CONFIG,
  TEST_CONFIG,
  PRODUCTION_CONFIG
} from './enrollment-config.js';

// デフォルト設定値
export {
  DEFAULT_ENROLLMENT_CONFIG,
  MINIMAL_CONFIG
} from './default-config.js';

// 設定ローダー
export {
  ConfigLoader,
  loadConfig,
  getCurrentConfig,
  reloadConfig,
  setConfigForTesting
} from './config-loader.js';