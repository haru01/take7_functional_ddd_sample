import { describe, test, expect, beforeEach } from 'vitest';
import {
  InMemoryEnrollmentRepository,
  MockStudentRepository,
  MockCourseRepository
} from '../../src/contexts/enrollment/infrastructure/repositories/enrollment-repository';
import { createEnrollmentRequestedEvent } from '../../src/contexts/enrollment/domain/events/domain-events';
import { requestEnrollment } from '../../src/contexts/enrollment/domain/aggregates/enrollment-aggregate';

describe('InMemoryEnrollmentRepository', () => {
  let repository: InMemoryEnrollmentRepository;

  beforeEach(() => {
    repository = new InMemoryEnrollmentRepository();
  });

  describe('save', () => {
    test('新しい履修申請の保存', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      expect(domainResult.success).toBe(true);
      
      if (domainResult.success) {
        const { domainEvent, ...enrollment } = domainResult.data;
        
        const result = await repository.save(enrollment, domainEvent);
        
        expect(result.success).toBe(true);
        expect(repository.getEnrollmentCount()).toBe(1);
        expect(repository.getEventCount()).toBe(1);
      }
    });

    test('楽観的ロック：バージョン不一致でエラー', async () => {
      // 最初の保存
      const firstResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (firstResult.success) {
        const { domainEvent, ...enrollment } = firstResult.data;
        await repository.save(enrollment, domainEvent);
      }

      // 同じバージョンで再保存を試行
      const secondResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (secondResult.success) {
        const { domainEvent, ...enrollment } = secondResult.data;
        const result = await repository.save(enrollment, domainEvent);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('ConcurrencyError');
          expect(result.error.expectedVersion).toBe(1);
          expect(result.error.actualVersion).toBe(1);
        }
      }
    });
  });

  describe('findByStudentCourseAndSemester', () => {
    test('存在する履修申請の検索', async () => {
      // テストデータの準備
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.type === 'right') {
        const { domainEvent, ...enrollment } = domainResult.value;
        await repository.save(enrollment, domainEvent);
      }

      const result = await repository.findByStudentCourseAndSemester('ST001', 'CS101', '2025-spring');

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.studentId).toBe('ST001');
        expect(result.data.courseId).toBe('CS101');
        expect(result.data.semester).toBe('2025-spring');
        expect(result.data.status).toBe('requested');
      }
    });

    test('存在しない履修申請の検索', async () => {
      const result = await repository.findByStudentCourseAndSemester('ST999', 'CS999', '2025-spring');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('findByStudentAndCourse', () => {
    test('学期を問わない履修申請の検索', async () => {
      // 複数学期のデータを準備
      const spring = requestEnrollment('ST001', 'CS101', '2025-spring');
      const fall = requestEnrollment('ST001', 'CS101', '2025-fall');
      
      if (spring.type === 'right') {
        const { domainEvent, ...enrollment } = spring.value;
        await repository.save(enrollment, domainEvent);
      }
      
      if (fall.type === 'right') {
        const { domainEvent, ...enrollment } = fall.value;
        await repository.save(enrollment, domainEvent);
      }

      const result = await repository.findByStudentAndCourse('ST001', 'CS101');

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.studentId).toBe('ST001');
        expect(result.data.courseId).toBe('CS101');
        // どちらかの学期が返される（実装では最初に見つかったもの）
        expect(['2025-spring', '2025-fall']).toContain(result.data.semester);
      }
    });
  });

  describe('getEventStream', () => {
    test('イベントストリームの取得', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.success) {
        const { domainEvent, ...enrollment } = domainResult.data;
        await repository.save(enrollment, domainEvent);
      }

      const result = await repository.getEventStream('ST001', 'CS101', '2025-spring');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].eventType).toBe('EnrollmentRequested');
        expect(result.data[0].studentId).toBe('ST001');
        expect(result.data[0].courseId).toBe('CS101');
      }
    });

    test('存在しない集約のイベントストリーム', async () => {
      const result = await repository.getEventStream('ST999', 'CS999', '2025-spring');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    test('イベントストリームの不変性', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.success) {
        const { domainEvent, ...enrollment } = domainResult.data;
        await repository.save(enrollment, domainEvent);
      }

      const result1 = await repository.getEventStream('ST001', 'CS101', '2025-spring');
      const result2 = await repository.getEventStream('ST001', 'CS101', '2025-spring');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      if (result1.success && result2.success) {
        // 同じ内容だが異なるインスタンス（コピーが返される）
        expect(result1.data).toEqual(result2.data);
        expect(result1.data).not.toBe(result2.data);
      }
    });
  });

  describe('テスト用ヘルパーメソッド', () => {
    test('clear機能', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.success) {
        const { domainEvent, ...enrollment } = domainResult.data;
        await repository.save(enrollment, domainEvent);
      }

      expect(repository.getEnrollmentCount()).toBe(1);
      expect(repository.getEventCount()).toBe(1);

      repository.clear();

      expect(repository.getEnrollmentCount()).toBe(0);
      expect(repository.getEventCount()).toBe(0);
    });

    test('カウント機能', async () => {
      expect(repository.getEnrollmentCount()).toBe(0);
      expect(repository.getEventCount()).toBe(0);

      // 複数の履修申請を保存
      const enrollments = [
        requestEnrollment('ST001', 'CS101', '2025-spring'),
        requestEnrollment('ST001', 'CS102', '2025-spring'),
        requestEnrollment('ST002', 'CS101', '2025-spring')
      ];

      for (const result of enrollments) {
        if (result.success) {
          const { domainEvent, ...enrollment } = result.data;
          await repository.save(enrollment, domainEvent);
        }
      }

      expect(repository.getEnrollmentCount()).toBe(3);
      expect(repository.getEventCount()).toBe(3);
    });
  });
});

describe('MockStudentRepository', () => {
  let repository: MockStudentRepository;

  beforeEach(() => {
    repository = new MockStudentRepository();
  });

  test('学生データの設定と取得', async () => {
    repository.setStudentData('ST001', true, 'active');

    const existsResult = await repository.exists('ST001');
    const statusResult = await repository.getEnrollmentStatus('ST001');

    expect(existsResult.success).toBe(true);
    if (existsResult.success) {
      expect(existsResult.data).toBe(true);
    }

    expect(statusResult.success).toBe(true);
    if (statusResult.success) {
      expect(statusResult.data).toBe('active');
    }
  });

  test('存在しない学生', async () => {
    const existsResult = await repository.exists('ST999');
    const statusResult = await repository.getEnrollmentStatus('ST999');

    expect(existsResult.success).toBe(true);
    if (existsResult.success) {
      expect(existsResult.data).toBe(false);
    }

    expect(statusResult.success).toBe(false);
    if (!statusResult.success) {
      expect(statusResult.error.type).toBe('NotFoundError');
    }
  });
});

describe('MockCourseRepository', () => {
  let repository: MockCourseRepository;

  beforeEach(() => {
    repository = new MockCourseRepository();
  });

  test('科目データの設定と取得', async () => {
    repository.setCourseData('CS101', true, [
      {
        semester: '2025-spring',
        offered: true,
        maxCapacity: 30,
        currentEnrollment: 10
      }
    ]);

    const existsResult = await repository.exists('CS101');
    const offeredResult = await repository.isOfferedInSemester('CS101', '2025-spring');
    const capacityResult = await repository.getCapacity('CS101', '2025-spring');

    expect(existsResult.success).toBe(true);
    if (existsResult.success) {
      expect(existsResult.data).toBe(true);
    }

    expect(offeredResult.success).toBe(true);
    if (offeredResult.success) {
      expect(offeredResult.data).toBe(true);
    }

    expect(capacityResult.success).toBe(true);
    if (capacityResult.success) {
      expect(capacityResult.data.max).toBe(30);
      expect(capacityResult.data.current).toBe(10);
    }
  });

  test('開講されていない学期', async () => {
    repository.setCourseData('CS101', true, [
      {
        semester: '2025-fall',
        offered: true,
        maxCapacity: 30,
        currentEnrollment: 10
      }
    ]);

    const offeredResult = await repository.isOfferedInSemester('CS101', '2025-spring');
    const capacityResult = await repository.getCapacity('CS101', '2025-spring');

    expect(offeredResult.success).toBe(true);
    if (offeredResult.success) {
      expect(offeredResult.data).toBe(false);
    }

    expect(capacityResult.success).toBe(false);
    if (!capacityResult.success) {
      expect(capacityResult.error.type).toBe('NotFoundError');
    }
  });
});