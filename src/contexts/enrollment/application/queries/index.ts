/**
 * Queries Index - CQRS Query パターンのエクスポート
 * 
 * このファイルの目的：
 * 1. Query Handler の統一エクスポート
 * 2. Query DTO の統一エクスポート  
 * 3. CQRS における Query 側のファサード
 * 4. 将来的な Query 拡張への対応
 */

// === Query Handlers ===
export {
  GetEnrollmentQueryHandler
} from './get-enrollment-query';

// === Query DTOs ===
export type {
  GetEnrollmentQuery,
  EnrollmentResponse,
  ErrorResponse,
  EnrollmentListResponse
} from './dto';

export {
  GetEnrollmentQuerySchema,
  EnrollmentResponseSchema,
  ErrorResponseSchema,
  EnrollmentListResponseSchema,
  mapEnrollmentToResponse,
  mapErrorToResponse,
  parseIdentifiers
} from './dto';

/**
 * 将来的な Query 拡張例：
 * 
 * - ListEnrollmentsByStudentQueryHandler
 * - ListEnrollmentsByCourseQueryHandler
 * - ListEnrollmentsBySemesterQueryHandler
 * - GetEnrollmentStatisticsQueryHandler
 * - SearchEnrollmentsQueryHandler
 * 
 * 各 Query Handler は以下の規約に従う：
 * 1. 読み取り専用：状態変更を行わない
 * 2. 最適化：読み取りパフォーマンスに特化
 * 3. プロジェクション：UIに最適化されたデータ形式
 * 4. キャッシュ対応：将来的な読み取り最適化への対応
 * 5. 非正規化：読み取り効率のためのデータ重複許容
 */