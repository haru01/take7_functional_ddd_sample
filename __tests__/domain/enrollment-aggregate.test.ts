import { describe, test, expect } from 'vitest';
import { requestEnrollment, reconstructEnrollmentFromEvents } from '../../src/contexts/enrollment/domain/aggregates/enrollment-aggregate';
import { isValidationError, isBusinessRuleError } from '../../src/contexts/enrollment/domain/errors/errors';
import { createEnrollmentRequestedEvent } from '../../src/contexts/enrollment/domain/events/domain-events';

describe('履修申請集約', () => {
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
        expect(domainEvent.occurredAt).toBeInstanceOf(Date);
      }
    });

    test('メタデータ付きの履修申請', () => {
      const options = {
        correlationId: '123e4567-e89b-12d3-a456-426614174000',
        causationId: '987fcdeb-51a2-43c1-b9e5-123456789abc',
        metadata: { reason: 'graduation requirement' }
      };
      
      const result = requestEnrollment('ST001', 'CS101', '2025-spring', options);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const { domainEvent } = result.data;
        expect(domainEvent.correlationId).toBe(options.correlationId);
        expect(domainEvent.causationId).toBe(options.causationId);
        expect(domainEvent.data.metadata).toEqual(options.metadata);
      }
    });

    describe('入力検証エラー', () => {
      test('無効な学生IDフォーマット', () => {
        const result = requestEnrollment('invalid-id', 'CS101', '2025-spring');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isValidationError(result.error)).toBe(true);
          expect(result.error.code).toBe('INVALID_STUDENT_ID');
          expect(result.error.field).toBe('studentId');
        }
      });

      test('無効な科目IDフォーマット', () => {
        const result = requestEnrollment('ST001', 'invalid-course', '2025-spring');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isValidationError(result.error)).toBe(true);
          expect(result.error.code).toBe('INVALID_COURSE_ID');
          expect(result.error.field).toBe('courseId');
        }
      });

      test('無効な学期フォーマット', () => {
        const result = requestEnrollment('ST001', 'CS101', 'invalid-semester');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isValidationError(result.error)).toBe(true);
          expect(result.error.code).toBe('INVALID_SEMESTER');
          expect(result.error.field).toBe('semester');
        }
      });
    });

    describe('ビジネスルールエラー', () => {
      test('過去すぎる学期は申請できない', () => {
        const currentYear = new Date().getFullYear();
        const tooOldYear = currentYear - 2;
        
        const result = requestEnrollment('ST001', 'CS101', `${tooOldYear}-spring`);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(isBusinessRuleError(result.error)).toBe(true);
          expect(result.error.rule).toBe('INVALID_SEMESTER_RANGE');
          expect(result.error.code).toBe('SEMESTER_OUT_OF_RANGE');
        }
      });

      test('未来すぎる学期は申請できない', () => {
        const currentYear = new Date().getFullYear();
        const tooFutureYear = currentYear + 2;
        
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
      const event2 = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 3); // バージョン2が抜けている
      
      const result = reconstructEnrollmentFromEvents([event1, event2]);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_EVENT_SEQUENCE');
      }
    });

    test('最初のイベントがEnrollmentRequestedでない場合', () => {
      // 通常はあり得ないが、将来の拡張で他のイベントタイプが追加された場合を想定
      const invalidEvent = {
        ...createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1),
        eventType: 'InvalidEventType' as any
      };
      
      const result = reconstructEnrollmentFromEvents([invalidEvent]);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        // validateEventSequence が先にチェックされるため、INVALID_EVENT_SEQUENCE になる
        expect(result.error.code).toBe('INVALID_EVENT_SEQUENCE');
      }
    });
  });

  describe('イミュータビリティテスト', () => {
    test('requestEnrollmentは元のパラメータを変更しない', () => {
      const studentId = 'ST001';
      const courseId = 'CS101';
      const semester = '2025-spring';
      const options = { metadata: { test: 'value' } };
      
      requestEnrollment(studentId, courseId, semester, options);
      
      // 元のパラメータが変更されていないことを確認
      expect(options.metadata).toEqual({ test: 'value' });
    });

    test('reconstructEnrollmentFromEventsは元のイベント配列を変更しない', () => {
      const events = [createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1)];
      const originalLength = events.length;
      
      reconstructEnrollmentFromEvents(events);
      
      expect(events.length).toBe(originalLength);
    });
  });
});