import type { Result } from '../../../../shared/types/index';
import type { EnrollmentError } from '../../domain/errors/errors';
import { Ok, Err } from '../../../../shared/types/index';

import type {
  IEnrollmentRepository
} from '../ports/ports';

import type {
  GetEnrollmentQuery,
  EnrollmentResponse,
  ErrorResponse
} from './dto';

import {
  GetEnrollmentQuerySchema,
  mapEnrollmentToResponse,
  mapErrorToResponse,
  parseIdentifiers
} from './dto';

// === Query Handler ===

/**
 * 履修情報取得クエリハンドラー
 * 
 * CQRS設計思想における Query の役割：
 * - 読み取り専用：状態を変更しない
 * - 最適化：読み取りに特化した実装
 * - プロジェクション：必要なデータ形式での返却
 * - キャッシュ対応：将来的なパフォーマンス最適化への対応
 * - 結果指向：必要なデータのみを効率的に取得
 */
export class GetEnrollmentQueryHandler {
  constructor(
    private readonly enrollmentRepository: IEnrollmentRepository
  ) {}

  /**
   * 履修情報取得クエリの実行
   */
  async handle(
    query: GetEnrollmentQuery
  ): Promise<Result<EnrollmentResponse | null, ErrorResponse>> {
    // 入力検証
    const validationResult = GetEnrollmentQuerySchema.safeParse(query);
    if (!validationResult.success) {
      const error: EnrollmentError = {
        type: 'ValidationError',
        message: 'Invalid query format',
        code: 'INVALID_QUERY_FORMAT',
        timestamp: new Date(),
        details: { validationErrors: validationResult.error.issues }
      };
      return Err(mapErrorToResponse(error));
    }

    const { studentId, courseId, semester } = validationResult.data;

    // 型安全な変換を行う
    const identifiersResult = parseIdentifiers({ studentId, courseId, semester });
    if (!identifiersResult.success) {
      return Err(mapErrorToResponse(identifiersResult.error));
    }

    const { studentId: validStudentId, courseId: validCourseId, semester: validSemester } = identifiersResult.data;

    // データ取得
    const enrollmentResult = await this.enrollmentRepository.findByStudentCourseAndSemester(
      validStudentId,
      validCourseId,
      validSemester
    );

    if (!enrollmentResult.success) {
      return Err(mapErrorToResponse(enrollmentResult.error));
    }

    const enrollment = enrollmentResult.data;
    if (!enrollment) {
      return Ok(null);
    }

    return Ok(mapEnrollmentToResponse(enrollment));
  }
}

/**
 * CQRS Query Handler設計の重要な判断
 * 
 * 1. 読み取り専用: 副作用のない純粋な読み取り操作
 * 2. 最適化優先: 読み取りパフォーマンスを最重視
 * 3. プロジェクション: 必要なデータ形式での結果返却
 * 4. 検証最小: 必要最小限の入力検証のみ
 * 5. キャッシュ対応: 将来的な読み取り最適化への対応
 * 6. エラーハンドリング: 読み取り固有のエラー処理
 */