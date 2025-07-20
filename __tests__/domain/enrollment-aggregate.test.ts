import { describe, test, expect } from 'vitest';
import { requestEnrollment, reconstructEnrollmentFromEvents } from '../../src/domain/enrollment-aggregate.js';
import { isValidationError, isBusinessRuleError } from '../../src/domain/errors.js';
import { createEnrollmentRequestedEvent } from '../../src/domain/domain-events.js';

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
      
      expect(result.type).toBe('right');
      if (result.type === 'right') {
        const { domainEvent } = result.value;
        expect(domainEvent.correlationId).toBe(options.correlationId);
        expect(domainEvent.causationId).toBe(options.causationId);
        expect(domainEvent.data.metadata).toEqual(options.metadata);
      }
    });

    describe('入力検証エラー', () => {
      test('無効な学生IDフォーマット', () => {
        const result = requestEnrollment('invalid-id', 'CS101', '2025-spring');
        
        expect(result.type).toBe('left');
        if (result.type === 'left') {
          expect(isValidationError(result.value)).toBe(true);
          expect(result.value.code).toBe('INVALID_STUDENT_ID');
          expect(result.value.field).toBe('studentId');
        }
      });

      test('無効な科目IDフォーマット', () => {
        const result = requestEnrollment('ST001', 'invalid-course', '2025-spring');
        
        expect(result.type).toBe('left');
        if (result.type === 'left') {
          expect(isValidationError(result.value)).toBe(true);
          expect(result.value.code).toBe('INVALID_COURSE_ID');
          expect(result.value.field).toBe('courseId');
        }
      });

      test('無効な学期フォーマット', () => {
        const result = requestEnrollment('ST001', 'CS101', 'invalid-semester');
        
        expect(result.type).toBe('left');
        if (result.type === 'left') {
          expect(isValidationError(result.value)).toBe(true);
          expect(result.value.code).toBe('INVALID_SEMESTER');
          expect(result.value.field).toBe('semester');
        }
      });
    });

    describe('ビジネスルールエラー', () => {
      test('過去すぎる学期は申請できない', () => {
        const currentYear = new Date().getFullYear();
        const tooOldYear = currentYear - 2;
        
        const result = requestEnrollment('ST001', 'CS101', `${tooOldYear}-spring`);
        
        expect(result.type).toBe('left');
        if (result.type === 'left') {
          expect(isBusinessRuleError(result.value)).toBe(true);
          expect(result.value.rule).toBe('INVALID_SEMESTER_RANGE');
          expect(result.value.code).toBe('SEMESTER_OUT_OF_RANGE');
        }
      });

      test('未来すぎる学期は申請できない', () => {
        const currentYear = new Date().getFullYear();
        const tooFutureYear = currentYear + 2;
        
        const result = requestEnrollment('ST001', 'CS101', `${tooFutureYear}-spring`);
        
        expect(result.type).toBe('left');
        if (result.type === 'left') {
          expect(isBusinessRuleError(result.value)).toBe(true);
          expect(result.value.rule).toBe('INVALID_SEMESTER_RANGE');
        }
      });
    });
  });

  describe('reconstructEnrollmentFromEvents', () => {
    test('空のイベントストリームからの復元', () => {
      const result = reconstructEnrollmentFromEvents([]);
      
      expect(result.type).toBe('right');
      if (result.type === 'right') {
        expect(result.value).toBeNull();
      }
    });

    test('単一のEnrollmentRequestedEventからの復元', () => {
      const event = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1);
      const result = reconstructEnrollmentFromEvents([event]);
      
      expect(result.type).toBe('right');
      if (result.type === 'right' && result.value) {
        expect(result.value.studentId).toBe('ST001');
        expect(result.value.courseId).toBe('CS101');
        expect(result.value.semester).toBe('2025-spring');
        expect(result.value.status).toBe('requested');
        expect(result.value.version).toBe(1);
      }
    });

    test('無効なイベントシーケンス（バージョン不整合）', () => {
      const event1 = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1);
      const event2 = createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 3); // バージョン2が抜けている
      
      const result = reconstructEnrollmentFromEvents([event1, event2]);
      
      expect(result.type).toBe('left');
      if (result.type === 'left') {
        expect(result.value.code).toBe('INVALID_EVENT_SEQUENCE');
      }
    });

    test('最初のイベントがEnrollmentRequestedでない場合', () => {
      // 通常はあり得ないが、将来の拡張で他のイベントタイプが追加された場合を想定
      const invalidEvent = {
        ...createEnrollmentRequestedEvent('ST001', 'CS101', '2025-spring', 1),
        eventType: 'InvalidEventType' as any
      };
      
      const result = reconstructEnrollmentFromEvents([invalidEvent]);
      
      expect(result.type).toBe('left');
      if (result.type === 'left') {
        // validateEventSequence が先にチェックされるため、INVALID_EVENT_SEQUENCE になる
        expect(result.value.code).toBe('INVALID_EVENT_SEQUENCE');
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