import type { EnrollmentConfig } from './enrollment-config';

/**
 * デフォルト設定値
 * 
 * 全ての設定項目にデフォルト値を提供
 * 環境変数や設定ファイルが不完全でも動作する
 */
export const DEFAULT_ENROLLMENT_CONFIG: EnrollmentConfig = {
  environment: 'development',

  validation: {
    allowedSemesterRange: {
      pastYears: 1,
      futureYears: 1
    },
    studentIdPattern: '/^[A-Z0-9]{1,20}$/',
    courseIdPattern: '/^[A-Z0-9]{1,20}$/',
    semesterPattern: '/^\\d{4}-(spring|summer|fall)$/'
  },

  processing: {
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBackoff: true
    },
    timeout: {
      defaultMs: 30000,
      databaseMs: 10000,
      notificationMs: 5000
    },
    concurrency: {
      maxParallelRequests: 100,
      batchSize: 10
    }
  },

  eventStore: {
    snapshot: {
      enabled: false,
      interval: 10,
      retentionDays: 365
    },
    retention: {
      enabled: false,
      maxEvents: 100000,
      maxAgeDays: 365
    }
  },

  businessRules: {
    enrollment: {
      maxCoursesPerSemester: 8,
      minCoursesPerSemester: 0,
      allowDuplicateEnrollment: false,
      requirePrerequisites: true
    },
    deadlines: {
      enrollmentDeadlineDays: 30,
      cancellationDeadlineDays: 14,
      gracePeriodHours: 24
    }
  },

  observability: {
    logging: {
      level: 'info',
      enableAuditLog: true,
      enablePerformanceLog: false
    },
    metrics: {
      enabled: false,
      intervalMs: 60000
    }
  }
};

/**
 * 最小限の設定（テスト用）
 */
export const MINIMAL_CONFIG: EnrollmentConfig = {
  environment: 'test',

  validation: {
    allowedSemesterRange: { pastYears: 0, futureYears: 1 },
    studentIdPattern: '/^[A-Z0-9]+$/',
    courseIdPattern: '/^[A-Z0-9]+$/',
    semesterPattern: '/^\\d{4}-(spring|summer|fall)$/'
  },

  processing: {
    retry: {
      maxAttempts: 1,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      exponentialBackoff: false
    },
    timeout: {
      defaultMs: 5000,
      databaseMs: 2000,
      notificationMs: 1000
    },
    concurrency: {
      maxParallelRequests: 5,
      batchSize: 2
    }
  },

  eventStore: {
    snapshot: {
      enabled: false,
      interval: 1000,
      retentionDays: 1
    },
    retention: {
      enabled: false,
      maxEvents: 1000,
      maxAgeDays: 1
    }
  },

  businessRules: {
    enrollment: {
      maxCoursesPerSemester: 10,
      minCoursesPerSemester: 0,
      allowDuplicateEnrollment: true,
      requirePrerequisites: false
    },
    deadlines: {
      enrollmentDeadlineDays: 365,
      cancellationDeadlineDays: 365,
      gracePeriodHours: 0
    }
  },

  observability: {
    logging: {
      level: 'error',
      enableAuditLog: false,
      enablePerformanceLog: false
    },
    metrics: {
      enabled: false,
      intervalMs: 300000
    }
  }
};