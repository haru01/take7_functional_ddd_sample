import { describe, test, expect, beforeEach } from 'vitest';
import {
  InMemoryEnrollmentRepository,
  MockStudentRepository,
  MockCourseRepository
} from '../../src/infrastructure/repositories/enrollment-repository.js';
import { createEnrollmentRequestedEvent } from '../../src/domain/domain-events.js';
import { requestEnrollment } from '../../src/domain/enrollment-aggregate.js';

describe('InMemoryEnrollmentRepository', () => {
  let repository: InMemoryEnrollmentRepository;

  beforeEach(() => {
    repository = new InMemoryEnrollmentRepository();
  });

  describe('save', () => {
    test('新しい履修申請の保存', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      expect(domainResult.type).toBe('right');
      
      if (domainResult.type === 'right') {
        const { domainEvent, ...enrollment } = domainResult.value;
        
        const result = await repository.save(enrollment, domainEvent);
        
        expect(result.type).toBe('right');
        expect(repository.getEnrollmentCount()).toBe(1);
        expect(repository.getEventCount()).toBe(1);
      }
    });

    test('楽観的ロック：バージョン不一致でエラー', async () => {
      // 最初の保存
      const firstResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (firstResult.type === 'right') {
        const { domainEvent, ...enrollment } = firstResult.value;
        await repository.save(enrollment, domainEvent);
      }

      // 同じバージョンで再保存を試行
      const secondResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (secondResult.type === 'right') {
        const { domainEvent, ...enrollment } = secondResult.value;
        const result = await repository.save(enrollment, domainEvent);
        
        expect(result.type).toBe('left');
        if (result.type === 'left') {
          expect(result.value.type).toBe('ConcurrencyError');
          expect(result.value.expectedVersion).toBe(1);
          expect(result.value.actualVersion).toBe(1);
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

      expect(result.type).toBe('right');
      if (result.type === 'right' && result.value) {
        expect(result.value.studentId).toBe('ST001');
        expect(result.value.courseId).toBe('CS101');
        expect(result.value.semester).toBe('2025-spring');
        expect(result.value.status).toBe('requested');
      }
    });

    test('存在しない履修申請の検索', async () => {
      const result = await repository.findByStudentCourseAndSemester('ST999', 'CS999', '2025-spring');

      expect(result.type).toBe('right');
      if (result.type === 'right') {
        expect(result.value).toBeNull();
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

      expect(result.type).toBe('right');
      if (result.type === 'right' && result.value) {
        expect(result.value.studentId).toBe('ST001');
        expect(result.value.courseId).toBe('CS101');
        // どちらかの学期が返される（実装では最初に見つかったもの）
        expect(['2025-spring', '2025-fall']).toContain(result.value.semester);
      }
    });
  });

  describe('getEventStream', () => {
    test('イベントストリームの取得', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.type === 'right') {
        const { domainEvent, ...enrollment } = domainResult.value;
        await repository.save(enrollment, domainEvent);
      }

      const result = await repository.getEventStream('ST001', 'CS101', '2025-spring');

      expect(result.type).toBe('right');
      if (result.type === 'right') {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].eventType).toBe('EnrollmentRequested');
        expect(result.value[0].studentId).toBe('ST001');
        expect(result.value[0].courseId).toBe('CS101');
      }
    });

    test('存在しない集約のイベントストリーム', async () => {
      const result = await repository.getEventStream('ST999', 'CS999', '2025-spring');

      expect(result.type).toBe('right');
      if (result.type === 'right') {
        expect(result.value).toHaveLength(0);
      }
    });

    test('イベントストリームの不変性', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.type === 'right') {
        const { domainEvent, ...enrollment } = domainResult.value;
        await repository.save(enrollment, domainEvent);
      }

      const result1 = await repository.getEventStream('ST001', 'CS101', '2025-spring');
      const result2 = await repository.getEventStream('ST001', 'CS101', '2025-spring');

      expect(result1.type).toBe('right');
      expect(result2.type).toBe('right');
      
      if (result1.type === 'right' && result2.type === 'right') {
        // 同じ内容だが異なるインスタンス（コピーが返される）
        expect(result1.value).toEqual(result2.value);
        expect(result1.value).not.toBe(result2.value);
      }
    });
  });

  describe('テスト用ヘルパーメソッド', () => {
    test('clear機能', async () => {
      const domainResult = requestEnrollment('ST001', 'CS101', '2025-spring');
      if (domainResult.type === 'right') {
        const { domainEvent, ...enrollment } = domainResult.value;
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
        if (result.type === 'right') {
          const { domainEvent, ...enrollment } = result.value;
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

    expect(existsResult.type).toBe('right');
    if (existsResult.type === 'right') {
      expect(existsResult.value).toBe(true);
    }

    expect(statusResult.type).toBe('right');
    if (statusResult.type === 'right') {
      expect(statusResult.value).toBe('active');
    }
  });

  test('存在しない学生', async () => {
    const existsResult = await repository.exists('ST999');
    const statusResult = await repository.getEnrollmentStatus('ST999');

    expect(existsResult.type).toBe('right');
    if (existsResult.type === 'right') {
      expect(existsResult.value).toBe(false);
    }

    expect(statusResult.type).toBe('left');
    if (statusResult.type === 'left') {
      expect(statusResult.value.type).toBe('NotFoundError');
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

    expect(existsResult.type).toBe('right');
    if (existsResult.type === 'right') {
      expect(existsResult.value).toBe(true);
    }

    expect(offeredResult.type).toBe('right');
    if (offeredResult.type === 'right') {
      expect(offeredResult.value).toBe(true);
    }

    expect(capacityResult.type).toBe('right');
    if (capacityResult.type === 'right') {
      expect(capacityResult.value.max).toBe(30);
      expect(capacityResult.value.current).toBe(10);
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

    expect(offeredResult.type).toBe('right');
    if (offeredResult.type === 'right') {
      expect(offeredResult.value).toBe(false);
    }

    expect(capacityResult.type).toBe('left');
    if (capacityResult.type === 'left') {
      expect(capacityResult.value.type).toBe('NotFoundError');
    }
  });
});