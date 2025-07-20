import { describe, test, expect } from 'vitest';
import { requestEnrollment, reconstructEnrollmentFromEvents } from '../../src/contexts/enrollment/domain/aggregates/enrollment-aggregate';
import { isValidationError, isBusinessRuleError } from '../../src/contexts/enrollment/domain/errors/errors';
import { createEnrollmentRequestedEvent } from '../../src/contexts/enrollment/domain/events/domain-events';

describe('履修申請集約 (Result型)', () => {
  describe('requestEnrollment', () => {
    test('正常な履修申請でイベントも生成される', () => {
      const result = requestEnrollment('ST001', 'CS101', '2025-spring');
      
      expect(result.success).toBe(true);
      if (result.success) {
        const { domainEvent, ...enrollment } = result.data;
        
        // 履修申請の検証
        expect(enrollment.status).toBe('requested');
        expect(enrollment.studentId).toBe('ST001');
        expect(enrollment.courseId).toBe('CS101');
        expect(enrollment.semester).toBe('2025-spring');
        expect(enrollment.version).toBe(1);
        expect(enrollment.requestedAt).toBeInstanceOf(Date);
        
        // ドメインイベントの検証
        expect(domainEvent.eventType).toBe('EnrollmentRequested');
        expect(domainEvent.studentId).toBe('ST001');
        expect(domainEvent.courseId).toBe('CS101');
        expect(domainEvent.version).toBe(1);
        expect(domainEvent.data.semester).toBe('2025-spring');
        expect(domainEvent.data.requestedAt).toBeInstanceOf(Date);
      }
    });

    test('メタデータ付きの履修申請', () => {
      const options = {
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        causationId: '550e8400-e29b-41d4-a716-446655440001',
        metadata: { source: 'web-ui', userAgent: 'test-browser' }
      };
      
      const result = requestEnrollment('ST001', 'CS101', '2025-spring', options);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const { domainEvent } = result.data;
        
        expect(domainEvent.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(domainEvent.causationId).toBe('550e8400-e29b-41d4-a716-446655440001');
        expect(domainEvent.data.metadata).toEqual({ source: 'web-ui', userAgent: 'test-browser' });
      }
    });

    describe('入力検証エラー', () => {
      test('無効な学生IDフォーマット', () => {
        const result = requestEnrollment('invalid-id', 'CS101', '2025-spring');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isValidationError(result.error)).toBe(true);
          expect(result.error.message).toContain('Invalid student ID format');
        }
      });

      test('無効な科目IDフォーマット', () => {
        const result = requestEnrollment('ST001', 'invalid-course', '2025-spring');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isValidationError(result.error)).toBe(true);
          expect(result.error.message).toContain('Invalid course ID format');
        }
      });

      test('無効な学期フォーマット', () => {
        const result = requestEnrollment('ST001', 'CS101', 'invalid-semester');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isValidationError(result.error)).toBe(true);
          expect(result.error.message).toContain('Invalid semester format');
        }
      });
    });

    describe('ビジネスルールエラー', () => {
      test('過去すぎる学期は申請できない', () => {
        const tooOldYear = new Date().getFullYear() - 2;
        const result = requestEnrollment('ST001', 'CS101', `${tooOldYear}-spring`);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isBusinessRuleError(result.error)).toBe(true);
          expect(result.error.rule).toBe('INVALID_SEMESTER_RANGE');
        }
      });

      test('未来すぎる学期は申請できない', () => {
        const tooFutureYear = new Date().getFullYear() + 2;
        const result = requestEnrollment('ST001', 'CS101', `${tooFutureYear}-spring`);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isBusinessRuleError(result.error)).toBe(true);
          expect(result.error.rule).toBe('INVALID_SEMESTER_RANGE');
        }
      });
    });
  });

  describe('reconstructEnrollmentFromEvents', () => {
    test('空のイベントストリームからの復元', () => {
      const result = reconstructEnrollmentFromEvents([]);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    test('単一のEnrollmentRequestedEventからの復元', () => {
      const event = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1);
      const result = reconstructEnrollmentFromEvents([event]);
      
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.studentId).toBe('ST001');
        expect(result.data.courseId).toBe('CS101');
        expect(result.data.semester).toBe('2025-spring');
        expect(result.data.status).toBe('requested');
        expect(result.data.version).toBe(1);
      }
    });

    test('無効なイベントシーケンス（バージョン不整合）', () => {
      const event1 = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1);
      const event2 = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1); // 同じバージョン
      
      const result = reconstructEnrollmentFromEvents([event1, event2]);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_EVENT_SEQUENCE');
      }
    });

    test('最初のイベントがEnrollmentRequestedでない場合', () => {
      // 無効なイベントタイプを模擬
      const invalidEvent = {
        ...createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1),
        eventType: 'InvalidEvent' as any
      };
      
      const result = reconstructEnrollmentFromEvents([invalidEvent]);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        // validateEventSequence が先にチェックされるため、INVALID_EVENT_SEQUENCE になる可能性
        expect(result.error.code).toMatch(/INVALID_EVENT_SEQUENCE|INVALID_FIRST_EVENT/);
      }
    });
  });
});