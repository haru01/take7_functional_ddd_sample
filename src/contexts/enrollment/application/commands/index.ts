/**
 * Commands Index - CQRS Command パターンのエクスポート
 * 
 * このファイルの目的：
 * 1. Command Handler の統一エクスポート
 * 2. Command DTO の統一エクスポート  
 * 3. CQRS における Command 側のファサード
 * 4. 将来的な Command 拡張への対応
 */

// === Command Handlers ===
export { 
  RequestEnrollmentCommandHandler
} from './request-enrollment-command';

// === Command DTOs ===
export type {
  RequestEnrollmentCommand,
  EnrollmentResponse,
  ErrorResponse,
  DomainEventResponse
} from './dto';

export {
  RequestEnrollmentCommandSchema,
  EnrollmentResponseSchema,
  ErrorResponseSchema,
  DomainEventResponseSchema,
  mapEnrollmentToResponse,
  mapErrorToResponse,
  mapDomainEventToResponse,
  extractDomainInputs,
  parseIdentifiers
} from './dto';

/**
 * 将来的な Command 拡張例：
 * 
 * - ApproveEnrollmentCommandHandler
 * - CancelEnrollmentCommandHandler
 * - CompleteEnrollmentCommandHandler
 * - FailEnrollmentCommandHandler
 * - BulkEnrollmentCommandHandler
 * 
 * 各 Command Handler は以下の規約に従う：
 * 1. 単一責任：一つのコマンドタイプのみ処理
 * 2. 不変性：コマンドオブジェクトの変更禁止
 * 3. 型安全性：Result型による明示的なエラーハンドリング
 * 4. トランザクション：データ一貫性の保証
 * 5. イベント発行：適切なタイミングでのドメインイベント発行
 */