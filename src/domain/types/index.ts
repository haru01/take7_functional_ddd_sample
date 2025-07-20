/**
 * Domain Types - 統合エクスポート
 * 
 * 型システムの中核部分を整理してエクスポート
 * - Result型とその操作
 * - 非同期処理ユーティリティ
 * - パイプライン処理
 * - ドメイン固有のブランド型
 */

// === Result型とその基本操作 ===
export {
  type Result,
  Ok,
  Err,
  map,
  flatMap,
  flatMapAsync,
  mapError,
  match,
  all,
  allTuple,
  parseWith,
  from,
  fromAsync,
  type ZodParseError
} from './result.js';

// === 非同期Result型処理 ===
export {
  sequence,
  parallel,
  race,
  retry,
  allAsync,
  allTupleAsync
} from './async-result.js';

// === パイプライン処理 ===
export {
  resultPipe,
  asyncResultPipe
} from './pipeline.js';

// === ドメイン固有のブランド型 ===
export {
  type StudentId,
  type CourseId,
  type Semester,
  type EnrollmentIdentity,
  type EnrollmentBase,
  type RequestedEnrollment,
  type ApprovedEnrollment,
  type CancelledEnrollment,
  type Enrollment,
  StudentIdSchema,
  CourseIdSchema,
  SemesterSchema,
  EnrollmentIdentitySchema,
  EnrollmentBaseSchema,
  RequestedEnrollmentSchema,
  ApprovedEnrollmentSchema,
  CancelledEnrollmentSchema,
  EnrollmentSchema
} from './brand-types.js';

// === 後方互換性のためのネームスペース ===
import * as ResultNamespace from './result.js';
import * as AsyncResultNamespace from './async-result.js';

// Resultという名前の競合を避けるため、エイリアスを使用
export { ResultNamespace as ResultUtils };
export { AsyncResultNamespace as AsyncResult };