import { z } from 'zod';

/**
 * Domain層エラー設計思想
 * 
 * なぜ例外ではなくResult型でエラーハンドリングするのか？
 * 1. 型安全性: エラーが型システムで追跡される
 * 2. 明示性: 関数のシグネチャを見るだけでエラーの可能性がわかる
 * 3. 強制的な処理: エラーを無視できない設計
 * 4. 関数型プログラミング: 副作用のない純粋な関数を保つ
 * 5. 可読性: success/errorで成功・失敗が直感的
 * 6. 関数合成: flatMapによるエラー伝播の自動化
 */

// === 基底エラースキーマ ===
export const DomainErrorBaseSchema = z.object({
  type: z.string(),
  message: z.string(),
  code: z.string(),
  timestamp: z.date().default(() => new Date()),
  details: z.record(z.unknown()).optional()
});

// === 検証エラー（入力値の問題） ===
export const ValidationErrorSchema = DomainErrorBaseSchema.extend({
  type: z.literal('ValidationError'),
  field: z.string().optional(), // どのフィールドでエラーが発生したか
  value: z.unknown().optional()  // 問題のある値（デバッグ用）
});

// === ビジネスルールエラー（ドメインロジックの制約違反） ===
export const BusinessRuleErrorSchema = DomainErrorBaseSchema.extend({
  type: z.literal('BusinessRuleError'),
  rule: z.string(), // 違反したビジネスルール名
  context: z.record(z.unknown()).optional() // ルール評価時のコンテキスト
});

// === 存在しないエンティティエラー ===
export const NotFoundErrorSchema = DomainErrorBaseSchema.extend({
  type: z.literal('NotFoundError'),
  entity: z.string(),
  id: z.string()
});

// === 並行性制御エラー（楽観的ロック） ===
export const ConcurrencyErrorSchema = DomainErrorBaseSchema.extend({
  type: z.literal('ConcurrencyError'),
  expectedVersion: z.number(),
  actualVersion: z.number(),
  entityId: z.string()
});

// === 統合エラー型（Discriminated Union） ===
export const EnrollmentErrorSchema = z.discriminatedUnion('type', [
  ValidationErrorSchema,
  BusinessRuleErrorSchema,
  NotFoundErrorSchema,
  ConcurrencyErrorSchema
]);

export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type BusinessRuleError = z.infer<typeof BusinessRuleErrorSchema>;
export type NotFoundError = z.infer<typeof NotFoundErrorSchema>;
export type ConcurrencyError = z.infer<typeof ConcurrencyErrorSchema>;
export type EnrollmentError = z.infer<typeof EnrollmentErrorSchema>;

// === エラーファクトリ関数（使いやすさのため） ===
export const createValidationError = (
  message: string,
  code: string = 'VALIDATION_FAILED',
  field?: string,
  value?: unknown
): ValidationError => ({
  type: 'ValidationError',
  message,
  code,
  timestamp: new Date(),
  field,
  value
});

export const createBusinessRuleError = (
  rule: string,
  message: string,
  code: string,
  context?: Record<string, unknown>
): BusinessRuleError => ({
  type: 'BusinessRuleError',
  message,
  code,
  rule,
  context,
  timestamp: new Date()
});

export const createNotFoundError = (
  entity: string,
  id: string
): NotFoundError => ({
  type: 'NotFoundError',
  message: `${entity} with id ${id} not found`,
  code: 'NOT_FOUND',
  entity,
  id,
  timestamp: new Date()
});

export const createConcurrencyError = (
  expectedVersion: number,
  actualVersion: number,
  entityId: string
): ConcurrencyError => ({
  type: 'ConcurrencyError',
  message: `Optimistic lock failure. Expected version ${expectedVersion}, but was ${actualVersion}`,
  code: 'CONCURRENCY_ERROR',
  expectedVersion,
  actualVersion,
  entityId,
  timestamp: new Date()
});

// === エラー分析ヘルパー ===
export const isValidationError = (error: EnrollmentError): error is ValidationError =>
  error.type === 'ValidationError';

export const isBusinessRuleError = (error: EnrollmentError): error is BusinessRuleError =>
  error.type === 'BusinessRuleError';

export const isNotFoundError = (error: EnrollmentError): error is NotFoundError =>
  error.type === 'NotFoundError';

export const isConcurrencyError = (error: EnrollmentError): error is ConcurrencyError =>
  error.type === 'ConcurrencyError';

// === Result型用のエラーファクトリ関数 ===
import type { Result } from '../../../../shared/types/index';
import { Err } from '../../../../shared/types/index';

/**
 * ValidationErrorを含むResult型を生成
 */
export const validationFailure = <T>(
  message: string,
  code: string = 'VALIDATION_FAILED',
  field?: string,
  value?: unknown
): Result<T, EnrollmentError> => {
  return Err(createValidationError(message, code, field, value));
};

/**
 * BusinessRuleErrorを含むResult型を生成
 */
export const businessRuleFailure = <T>(
  rule: string,
  message: string,
  code: string,
  context?: Record<string, unknown>
): Result<T, EnrollmentError> => {
  return Err(createBusinessRuleError(rule, message, code, context));
};

/**
 * NotFoundErrorを含むResult型を生成
 */
export const notFoundFailure = <T>(
  entity: string,
  id: string
): Result<T, EnrollmentError> => {
  return Err(createNotFoundError(entity, id));
};

/**
 * ConcurrencyErrorを含むResult型を生成
 */
export const concurrencyFailure = <T>(
  expectedVersion: number,
  actualVersion: number,
  entityId: string
): Result<T, EnrollmentError> => {
  return Err(createConcurrencyError(expectedVersion, actualVersion, entityId));
};