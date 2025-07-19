import { describe, test, expect } from 'vitest';
import { requestEnrollment } from '../src/domain/enrollment.js';

describe('履修申請', () => {
  test('履修を申請できる', () => {
    const result = requestEnrollment('ST001', 'CS101', '2025-spring');
    
    expect(result.type).toBe('right');
    if (result.type === 'right') {
      expect(result.value.status).toBe('requested');
      expect(result.value.studentId).toBe('ST001');
      expect(result.value.courseId).toBe('CS101');
      expect(result.value.semester).toBe('2025-spring');
      expect(result.value.version).toBe(1);
      expect(result.value.requestedAt).toBeInstanceOf(Date);
    }
  });

  test('無効な学生IDの場合はエラーになる', () => {
    const result = requestEnrollment('invalid-id', 'CS101', '2025-spring');
    
    expect(result.type).toBe('left');
    if (result.type === 'left') {
      expect(result.value.type).toBe('VALIDATION_ERROR');
      expect(result.value.message).toContain('Invalid student ID');
    }
  });

  test('無効なコースIDの場合はエラーになる', () => {
    const result = requestEnrollment('ST001', 'invalid-course', '2025-spring');
    
    expect(result.type).toBe('left');
    if (result.type === 'left') {
      expect(result.value.type).toBe('VALIDATION_ERROR');
      expect(result.value.message).toContain('Invalid course ID');
    }
  });

  test('無効な学期の場合はエラーになる', () => {
    const result = requestEnrollment('ST001', 'CS101', 'invalid-semester');
    
    expect(result.type).toBe('left');
    if (result.type === 'left') {
      expect(result.value.type).toBe('VALIDATION_ERROR');
      expect(result.value.message).toContain('Invalid semester');
    }
  });
});