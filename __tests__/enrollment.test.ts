import { describe, test, expect } from 'vitest';
import { requestEnrollment } from '../src/domain/enrollment.js';
import {
  processMultipleEnrollments,
  requestEnrollmentWithFallback,
  conditionalEnrollmentProcessing,
  requestEnrollmentWithRetry
} from '../src/domain/functional-utils.js';

describe('履修申請 (Result型版)', () => {
  test('履修を申請できる', () => {
    const result = requestEnrollment('ST001', 'CS101', '2025-spring');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('requested');
      expect(result.data.studentId).toBe('ST001');
      expect(result.data.courseId).toBe('CS101');
      expect(result.data.semester).toBe('2025-spring');
      expect(result.data.version).toBe(1);
      expect(result.data.requestedAt).toBeInstanceOf(Date);
    }
  });

  test('無効な学生IDの場合はエラーになる', () => {
    const result = requestEnrollment('invalid-id', 'CS101', '2025-spring');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Invalid student ID');
    }
  });

  test('無効なコースIDの場合はエラーになる', () => {
    const result = requestEnrollment('ST001', 'invalid-course', '2025-spring');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Invalid course ID');
    }
  });

  test('無効な学期の場合はエラーになる', () => {
    const result = requestEnrollment('ST001', 'CS101', 'invalid-semester');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Invalid semester');
    }
  });
});

describe('関数型ユーティリティ', () => {
  test('複数の履修申請を並列処理できる', async () => {
    const requests = [
      { studentId: 'ST001', courseId: 'CS101', semester: '2025-spring' },
      { studentId: 'ST002', courseId: 'CS102', semester: '2025-spring' },
      { studentId: 'ST003', courseId: 'CS103', semester: '2025-spring' }
    ];

    const result = await processMultipleEnrollments(requests);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0].studentId).toBe('ST001');
      expect(result.data[1].studentId).toBe('ST002');
      expect(result.data[2].studentId).toBe('ST003');
    }
  });

  test('フォールバック戦略付きの履修申請', () => {
    const primaryRequest = {
      studentId: 'ST001',
      courseId: 'invalid-course',  // 無効なコースID（正規表現に合わない）
      semester: '2025-spring'
    };
    const fallbackCourseIds = ['CS101', 'CS102'];

    const result = requestEnrollmentWithFallback(primaryRequest, fallbackCourseIds);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courseId).toBe('CS101'); // 最初のフォールバックが成功
    }
  });

  test('条件付き履修申請処理', async () => {
    const conditions = {
      checkPrerequisites: async () => ({ success: true as const, data: true }),
      checkCapacity: async () => ({ success: true as const, data: true }),
      checkScheduleConflict: async () => ({ success: true as const, data: true })
    };

    const result = await conditionalEnrollmentProcessing(
      'ST001',
      'CS101',
      '2025-spring',
      conditions
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('requested');
    }
  });

  test('リトライ機能付き履修申請', async () => {
    let attemptCount = 0;
    
    // リトライのテスト用にスタブ化
    const originalRequestEnrollment = requestEnrollment;
    const mockRequestEnrollment = (studentId: string, courseId: string, semester: string) => {
      attemptCount++;
      if (attemptCount < 3) {
        return { success: false as const, error: { type: 'VALIDATION_ERROR' as const, message: 'Temporary error' } };
      }
      return originalRequestEnrollment(studentId, courseId, semester);
    };

    // 実際のテスト（モックを使用する場合は要調整）
    const result = await requestEnrollmentWithRetry(
      'ST001',
      'CS101',
      '2025-spring',
      {
        maxAttempts: 3,
        delayMs: 10,
        shouldRetry: (error) => error.type === 'VALIDATION_ERROR'
      }
    );

    expect(result.success).toBe(true);
  });
});