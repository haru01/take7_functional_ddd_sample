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

describe('履修申請コマンドハンドラー (Result型)', () => {
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
  });

  describe('requestEnrollment', () => {
    test('正常な履修申請処理のフルフロー', async () => {
      // テストデータのセットアップ
      studentRepo.setStudentData('ST001', true, 'active');
      courseRepo.setCourseData('CS101', true, [
        {
          semester: '2025-spring',
          offered: true,
          maxCapacity: 30,
          currentEnrollment: 10
        }
      ]);

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
        const storedEnrollment = await enrollmentRepo.findByStudentCourseAndSemester('ST001', 'CS101', '2025-spring');
        expect(storedEnrollment.success).toBe(true);
        if (storedEnrollment.success) {
          expect(storedEnrollment.data?.status).toBe('requested');
        }

        // イベント発行の確認
        const publishedEvents = eventPublisher.getAllEvents();
        expect(publishedEvents).toHaveLength(1);
        expect(publishedEvents[0].eventType).toBe('EnrollmentRequested');

        // 通知送信の確認
        const sentNotifications = notificationService.getSentNotifications();
        expect(sentNotifications).toHaveLength(1);
        expect(sentNotifications[0].event.eventType).toBe('EnrollmentRequested');
      }
    });

    test('メタデータ付きの履修申請', async () => {
      studentRepo.setStudentData('ST001', true, 'active');
      courseRepo.setCourseData('CS101', true, [
        { semester: '2025-spring', offered: true, maxCapacity: 30, currentEnrollment: 0 }
      ]);

      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring',
        metadata: { source: 'mobile-app', version: '1.2.3' }
      };

      const result = await commandHandler.handle(command);
      
      expect(result.success).toBe(true);
      
      const publishedEvents = eventPublisher.getAllEvents();
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].data.metadata).toEqual({ source: 'mobile-app', version: '1.2.3' });
    });

    describe('入力検証エラー', () => {
      test('無効なコマンドフォーマット', async () => {
        const invalidCommand = {
          studentId: '',  // 空文字
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

    test('存在しない学生', async () => {
      studentRepo.setStudentData('ST001', false); // 存在しない学生
      courseRepo.setCourseData('CS101', true, [
        { semester: '2025-spring', offered: true, maxCapacity: 30, currentEnrollment: 0 }
      ]);

      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring'
      };

      const result = await commandHandler.handle(command);

      expect(result.success).toBe(false); // 存在しない学生のため失敗する
      if (!result.success) {
        expect(result.error.code).toBe('STUDENT_NOT_FOUND');
      }
    });
  });

  describe('getEnrollment', () => {
    test('存在する履修申請の取得', async () => {
      // 事前に履修申請を作成
      studentRepo.setStudentData('ST001', true, 'active');
      courseRepo.setCourseData('CS101', true, [
        { semester: '2025-spring', offered: true, maxCapacity: 30, currentEnrollment: 0 }
      ]);

      const command: RequestEnrollmentCommand = {
        studentId: 'ST001',
        courseId: 'CS101',
        semester: '2025-spring'
      };

      const createResult = await commandHandler.handle(command);
      expect(createResult.success).toBe(true);

      // 取得テスト
      const getQuery: GetEnrollmentQuery = { studentId: 'ST001', courseId: 'CS101', semester: '2025-spring' };
      const result = await queryHandler.handle(getQuery);

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
});