# 履修管理システム実装計画 - Requested状態まで

## 現状分析

### 既存実装
```
src/
├── domain/
│   ├── types.ts      # 基本型定義とEither型（完成）
│   └── enrollment.ts # requestEnrollment関数のみ（完成）
__tests__/
└── enrollment.test.ts # domain層の基本テスト（完成）
```

### 設定状況
- **package.json**: Vitest, TypeScript, Zodが設定済み
- **tsconfig.json**: 厳密な型チェック設定済み
- **vitest.config.ts**: テスト環境設定済み

## 実装方針

### フェーズ1: Requested状態の完全実装

#### 1. Domain層の拡充

**1.1 errors.ts - エラー型の体系化**
```typescript
// 現在のtypes.tsの単純なエラー定義を拡張
export const DomainErrorSchema = z.object({
  type: z.string(),
  message: z.string(),
  code: z.string(),
  details: z.record(z.unknown()).optional()
});

export const ValidationErrorSchema = DomainErrorSchema.extend({
  type: z.literal('ValidationError'),
  field: z.string().optional()
});

export const BusinessRuleErrorSchema = DomainErrorSchema.extend({
  type: z.literal('BusinessRuleError'),
  rule: z.string()
});

export const EnrollmentErrorSchema = z.discriminatedUnion('type', [
  ValidationErrorSchema,
  BusinessRuleErrorSchema
]);
```

**1.2 domain-events.ts - ドメインイベント**
```typescript
export const EnrollmentRequestedEventSchema = z.object({
  studentId: StudentIdSchema,
  courseId: CourseIdSchema,
  eventType: z.literal('EnrollmentRequested'),
  semester: SemesterSchema,
  requestedAt: z.date(),
  occurredAt: z.date(),
  version: z.number().int().positive()
});

export type EnrollmentRequestedEvent = z.infer<typeof EnrollmentRequestedEventSchema>;
```

**1.3 enrollment-aggregate.ts - 集約操作の拡張**
```typescript
// 現在のrequestEnrollment関数を改良し、イベント生成も含める
export const requestEnrollment = (
  studentId: StudentId,
  courseId: CourseId,
  semester: Semester
): Either<EnrollmentError, RequestedEnrollment & { domainEvent: EnrollmentRequestedEvent }> => {
  // 入力検証とビジネスルール適用
  // イベント生成
  // 集約更新
};
```

#### 2. Application層の実装

**2.1 ports.ts - 依存性逆転のインターフェース**
```typescript
export interface IEnrollmentRepository {
  findByStudentAndCourse(
    studentId: StudentId,
    courseId: CourseId
  ): Promise<Either<EnrollmentError, Enrollment | null>>;

  save(
    enrollment: Enrollment,
    event: EnrollmentDomainEvent
  ): Promise<Either<EnrollmentError, void>>;
}
```

**2.2 dtos.ts - DTOとマッパー**
```typescript
export interface RequestEnrollmentCommand {
  readonly studentId: string;
  readonly courseId: string;
  readonly semester: string;
}

export interface EnrollmentDto {
  readonly studentId: string;
  readonly courseId: string;
  readonly semester: string;
  readonly status: string;
  readonly version: number;
  readonly requestedAt: string;
}
```

**2.3 enrollment-service.ts - アプリケーションサービス**
```typescript
export class EnrollmentApplicationService {
  constructor(
    private readonly enrollmentRepo: IEnrollmentRepository
  ) {}

  async requestEnrollment(
    command: RequestEnrollmentCommand
  ): Promise<Either<EnrollmentError, EnrollmentDto>> {
    // 1. 入力検証
    // 2. 既存履修チェック
    // 3. 集約操作実行
    // 4. 永続化
    // 5. DTOマッピング
  }
}
```

#### 3. Infrastructure層の基本実装

**3.1 repositories/enrollment-repository.ts - インメモリ実装**
```typescript
// PostgreSQL/Prismaではなく、まずはインメモリ実装で開始
export class InMemoryEnrollmentRepository implements IEnrollmentRepository {
  private enrollments = new Map<string, Enrollment>();
  private events = new Map<string, EnrollmentDomainEvent[]>();

  async findByStudentAndCourse(
    studentId: StudentId,
    courseId: CourseId
  ): Promise<Either<EnrollmentError, Enrollment | null>> {
    // インメモリ検索実装
  }

  async save(
    enrollment: Enrollment,
    event: EnrollmentDomainEvent
  ): Promise<Either<EnrollmentError, void>> {
    // インメモリ保存実装
  }
}
```

#### 4. テスト層の拡充

**4.1 Domain層テスト**
```
tests/
├── domain/
│   ├── types.test.ts           # Zodスキーマテスト
│   ├── errors.test.ts          # エラー型テスト
│   ├── domain-events.test.ts   # イベントテスト
│   └── enrollment-aggregate.test.ts # 集約テスト（拡張）
```

**4.2 Application層テスト**
```
tests/
├── application/
│   ├── enrollment-service.test.ts # サービステスト
│   └── dtos.test.ts               # DTOマッピングテスト
```

**4.3 Infrastructure層テスト**
```
tests/
├── infrastructure/
│   └── repositories/
│       └── enrollment-repository.test.ts # リポジトリテスト
```

**4.4 統合テスト**
```
tests/
├── integration/
│   └── enrollment-flow.test.ts # エンドツーエンドテスト
```

## 実装順序（段階的なアプローチ）

### Step 1: Domain層の完成
1. **errors.ts** - エラー型の体系化
2. **domain-events.ts** - RequestedEvent定義
3. **enrollment-aggregate.ts** - requestEnrollment改良
4. **tests/domain/** - 全ドメインテスト

### Step 2: Application層の基本実装
1. **ports.ts** - 最小限のインターフェース
2. **dtos.ts** - RequestEnrollment関連のみ
3. **enrollment-service.ts** - requestEnrollmentメソッドのみ
4. **tests/application/** - サービステスト

### Step 3: Infrastructure層の基本実装
1. **InMemoryEnrollmentRepository** - テスト用実装
2. **tests/infrastructure/** - リポジトリテスト

### Step 4: 統合とリファクタリング
1. **統合テスト** - 全体の動作確認
2. **リファクタリング** - コード品質向上
3. **パフォーマンステスト** - 基本的な性能確認

## 実装時の重要な判断

### TDDアプローチ
1. **Red**: 失敗するテストを先に書く
2. **Green**: 最小限の実装でテスト通過
3. **Refactor**: コード品質向上

### 関数型DDDの原則
1. **イミュータブル**: 全ての状態変更は新オブジェクト生成
2. **Either型**: 例外ではなく型安全なエラーハンドリング
3. **純粋関数**: 副作用のないドメインロジック

### 段階的な品質向上
1. **Phase 1**: 動作する最小実装
2. **Phase 2**: エラーハンドリング強化
3. **Phase 3**: パフォーマンス最適化

## 技術的な制約と対処

### 制約
- **スコープ**: Requested状態のみ（承認・キャンセルは未実装）
- **永続化**: インメモリ実装（DB実装は後回し）
- **外部連携**: なし（学生・科目システム連携は後回し）

### 将来拡張への準備
- **インターフェース駆動**: 実装詳細に依存しない設計
- **イベントソーシング準備**: ドメインイベントの記録
- **CQRS準備**: コマンドとクエリの分離意識

## 期待される成果物

### 実装完了時の状態
```
src/
├── domain/
│   ├── types.ts
│   ├── errors.ts
│   ├── domain-events.ts
│   └── enrollment-aggregate.ts
├── application/
│   ├── ports.ts
│   ├── dtos.ts
│   └── enrollment-service.ts
└── infrastructure/
    └── repositories/
        └── enrollment-repository.ts

__tests__/
├── domain/
├── application/
├── infrastructure/
└── integration/
```

### 実現できる機能
1. **履修申請作成**: 型安全な入力検証付き
2. **重複チェック**: 同じ学生・科目・学期の重複防止
3. **イベント記録**: 履修申請イベントの生成・保存
4. **エラーハンドリング**: 構造化されたエラー情報
5. **テストカバレッジ**: 全コードパスのテスト

### 品質保証
- **型安全性**: TypeScript + Zodによる実行時検証
- **テスト網羅性**: 単体・統合・エンドツーエンドテスト
- **保守性**: ヘキサゴナルアーキテクチャによる疎結合

この計画により、CLAUDE.mdとsample.mdで示された設計思想に基づいた、実用的かつ拡張可能な履修管理システムの基盤を構築できます。