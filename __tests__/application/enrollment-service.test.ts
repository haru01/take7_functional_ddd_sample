import { describe, test, expect, beforeEach } from 'vitest';
import { RequestEnrollmentCommandHandler } from '../../src/contexts/enrollment/application/commands/index';
import { GetEnrollmentQueryHandler } from '../../src/contexts/enrollment/application/queries/index';
import type { RequestEnrollmentCommand } from '../../src/contexts/enrollment/application/commands/index';
import type { GetEnrollmentQuery } from '../../src/contexts/enrollment/application/queries/index';
import {
  InMemoryEnrollmentRepository,
  MockStudentRepository,
  MockCourseRepository
} from '../../src/contexts/enrollment/infrastructure/repositories/enrollment-repository';
import {
  MockNotificationService,
  MockEventPublisher
} from '../../src/contexts/enrollment/infrastructure/adapters/services/mock-services';

describe('履修申請CQRS Handler', () => {
  let commandHandler: RequestEnrollmentCommandHandler;
  let queryHandler: GetEnrollmentQueryHandler;
  let enrollmentRepo: InMemoryEnrollmentRepository;
  let studentRepo: MockStudentRepository;
  let courseRepo: MockCourseRepository;
  let notificationService: MockNotificationService;
  let eventPublisher: MockEventPublisher;

  beforeEach(() => {
    enrollmentRepo = new InMemoryEnrollmentRepository();
    studentRepo = new MockStudentRepository();
    courseRepo = new MockCourseRepository();
    notificationService = new MockNotificationService();
    eventPublisher = new MockEventPublisher();

    commandHandler = new RequestEnrollmentCommandHandler(
      enrollmentRepo,
      studentRepo,
      courseRepo,
      notificationService,
      eventPublisher
    );

    queryHandler = new GetEnrollmentQueryHandler(
      enrollmentRepo
    );

    // デフォルトのテストデータ設定
    studentRepo.setStudentData('ST001', true, 'active');
    courseRepo.setCourseData('CS101', true, [
      {
        semester: '2025-spring',
        offered: true,
        maxCapacity: 30,
        currentEnrollment: 10
      }
    ]);
  });

  describe('requestEnrollment', () => {
    test('正常な履修申請処理のフルフロー', async () => {
      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring'
      };

      const result = await commandHandler.handle(command);

      expect(result.success).toBe(true);
      if (result.success) {
        // レスポンスの検証
        expect(result.data.studentId).toBe('ST001');
        expect(result.data.courseId).toBe('CS101');
        expect(result.data.semester).toBe('2025-spring');
        expect(result.data.status).toBe('requested');
        expect(result.data.version).toBe(1);

        // 永続化の確認
        expect(enrollmentRepo.getEnrollmentCount()).toBe(1);
        expect(enrollmentRepo.getEventCount()).toBe(1);

        // イベント発行の確認
        const publishedEvents = eventPublisher.getAllEvents();
        expect(publishedEvents).toHaveLength(1);
        expect(publishedEvents[0].eventType).toBe('EnrollmentRequested');

        // 通知送信の確認
        const notifications = notificationService.getSentNotifications();
        expect(notifications).toHaveLength(1);
        expect(notifications[0].event.eventType).toBe('EnrollmentRequested');
      }
    });

    test('メタデータ付きの履修申請', async () => {
      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring',
        metadata: { reason: 'graduation requirement' },
        correlationId: '123e4567-e89b-12d3-a456-426614174000'
      };

      const result = await commandHandler.handle(command);

      expect(result.success).toBe(true);
      
      const publishedEvents = eventPublisher.getAllEvents();
      expect(publishedEvents[0].correlationId).toBe(command.correlationId);
      expect(publishedEvents[0].data.metadata).toEqual(command.metadata);
    });

    describe('入力検証エラー', () => {
      test('無効なコマンドフォーマット', async () => {
        const invalidCommand = {
          studentId: '', // 空文字は無効
          courseId: 'CS101',
          semester: '2025-spring'
        } as RequestEnrollmentCommand;

        const result = await commandHandler.handle(invalidCommand);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_COMMAND_FORMAT');
        }
      });
    });

    describe('前提条件エラー', () => {
      test('存在しない学生', async () => {
        studentRepo.setStudentData('ST999', false); // 存在しない学生

        const command: RequestEnrollmentCommand = {
          studentId: 'ST999',
          courseId: 'CS101',
          semester: '2025-spring'
        };

        const result = await commandHandler.handle(command);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('STUDENT_NOT_FOUND');
        }
      });

      test('非アクティブな学生', async () => {
        studentRepo.setStudentData('ST002', true, 'withdrawn'); // 退学済み

        const command: RequestEnrollmentCommand = {
          studentId: 'ST002',
          courseId: 'CS101',
          semester: '2025-spring'
        };

        const result = await commandHandler.handle(command);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('STUDENT_NOT_ACTIVE');
        }
      });

      test('存在しない科目', async () => {
        courseRepo.setCourseData('CS999', false); // 存在しない科目

        const command: RequestEnrollmentCommand = {
          studentId: 'ST001',
          courseId: 'CS999',
          semester: '2025-spring'
        };

        const result = await commandHandler.handle(command);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('COURSE_NOT_FOUND');
        }
      });

      test('開講されていない科目', async () => {
        courseRepo.setCourseData('CS102', true, [
          {
            semester: '2025-fall', // spring には開講されていない
            offered: true,
            maxCapacity: 20,
            currentEnrollment: 5
          }
        ]);

        const command: RequestEnrollmentCommand = {
          studentId: 'ST001',
          courseId: 'CS102',
          semester: '2025-spring'
        };

        const result = await commandHandler.handle(command);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('COURSE_NOT_OFFERED');
        }
      });

      test('定員オーバー', async () => {
        courseRepo.setCourseData('CS103', true, [
          {
            semester: '2025-spring',
            offered: true,
            maxCapacity: 20,
            currentEnrollment: 20 // 満員
          }
        ]);

        const command: RequestEnrollmentCommand = {
          studentId: 'ST001',
          courseId: 'CS103',
          semester: '2025-spring'
        };

        const result = await commandHandler.handle(command);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('COURSE_CAPACITY_EXCEEDED');
        }
      });
    });

    describe('重複チェック', () => {
      test('既に同じ履修申請が存在する場合', async () => {
        // 最初の申請
        const command: RequestEnrollmentCommand = {
          studentId: 'ST001',
          courseId: 'CS101',
          semester: '2025-spring'
        };

        const firstResult = await commandHandler.handle(command);
        expect(firstResult.success).toBe(true);

        // 同じ申請を再実行
        const secondResult = await commandHandler.handle(command);
        expect(secondResult.success).toBe(false);
        if (!secondResult.success) {
          expect(secondResult.error.code).toBe('DUPLICATE_ENROLLMENT');
        }
      });
    });
  });

  describe('getEnrollment', () => {
    test('存在する履修申請の取得', async () => {
      // 先に履修申請を作成
      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring'
      };
      await commandHandler.handle(command);

      const query: GetEnrollmentQuery = { studentId: 'ST001', courseId: 'CS101', semester: '2025-spring' };
      const result = await queryHandler.handle(query);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.studentId).toBe('ST001');
        expect(result.data.courseId).toBe('CS101');
        expect(result.data.semester).toBe('2025-spring');
        expect(result.data.status).toBe('requested');
      }
    });

    test('存在しない履修申請の取得', async () => {
      const query: GetEnrollmentQuery = { studentId: 'ST999', courseId: 'CS999', semester: '2025-spring' };
      const result = await queryHandler.handle(query);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('サイドエフェクトのテスト', () => {
    test('履修申請成功時にイベントが発行される', async () => {
      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring'
      };

      await commandHandler.handle(command);

      const events = eventPublisher.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('EnrollmentRequested');
      expect(events[0].studentId).toBe('ST001');
      expect(events[0].courseId).toBe('CS101');
    });

    test('履修申請成功時に通知が送信される', async () => {
      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring'
      };

      await commandHandler.handle(command);

      const notifications = notificationService.getSentNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].event.eventType).toBe('EnrollmentRequested');
    });

    test('履修申請失敗時はイベントもデータも作成されない', async () => {
      studentRepo.setStudentData('ST999', false); // 存在しない学生

      const command: RequestEnrollmentCommand = {
        studentId: 'ST999',
        courseId: 'CS101',
        semester: '2025-spring'
      };

      await commandHandler.handle(command);

      expect(enrollmentRepo.getEnrollmentCount()).toBe(0);
      expect(eventPublisher.getAllEvents()).toHaveLength(0);
      expect(notificationService.getSentNotifications()).toHaveLength(0);
    });
  });
});