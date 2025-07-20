/**
 * Application Layer Index - Pure CQRS パターンのエクスポート
 * 
 * このファイルの目的：
 * 1. Command Handler の統一エクスポート
 * 2. Query Handler の統一エクスポート
 * 3. Application Layer 全体のファサード
 * 4. Pure CQRS アーキテクチャの実現
 */

// === Command Side (状態変更) ===
export {
  RequestEnrollmentCommandHandler,
  type RequestEnrollmentCommand,
  RequestEnrollmentCommandSchema,
  type EnrollmentResponse as CommandEnrollmentResponse,
  type ErrorResponse as CommandErrorResponse,
  type DomainEventResponse,
  mapEnrollmentToResponse as mapEnrollmentToCommandResponse,
  mapErrorToResponse as mapErrorToCommandResponse,
  mapDomainEventToResponse,
  extractDomainInputs,
  parseIdentifiers as parseCommandIdentifiers
} from './commands/index';

// === Query Side (読み取り専用) ===
export {
  GetEnrollmentQueryHandler,
  type GetEnrollmentQuery,
  GetEnrollmentQuerySchema,
  type EnrollmentResponse as QueryEnrollmentResponse,
  type ErrorResponse as QueryErrorResponse,
  type EnrollmentListResponse,
  mapEnrollmentToResponse as mapEnrollmentToQueryResponse,
  mapErrorToResponse as mapErrorToQueryResponse,
  parseIdentifiers as parseQueryIdentifiers
} from './queries/index';

// === Ports (依存性逆転) ===
export type {
  IEnrollmentRepository,
  IStudentRepository,
  ICourseRepository,
  INotificationService,
  IEventPublisher
} from './ports/ports';

/**
 * Pure CQRS アーキテクチャの設計判断
 * 
 * 1. 明確な分離: Command と Query を物理的に分離
 * 2. 単一責任: 各 Handler は一つのコマンド/クエリのみ処理
 * 3. 直接依存: Application Service を介さない直接的な Handler 呼び出し
 * 4. 型安全性: TypeScript による厳密な型チェック
 * 5. 拡張性: 新しい Command/Query の追加が容易
 * 6. テスタビリティ: Handler 単位での独立したテスト実行
 * 
 * 利点:
 * - 責任の明確化
 * - パフォーマンスの最適化
 * - 並行開発の容易さ
 * - スケーラビリティの向上
 * 
 * トレードオフ:
 * - 初期の学習コスト
 * - 少し多めのボイラープレート
 * - 一貫性の管理責任の増加
 */