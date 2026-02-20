// utils/AuditLogger.ts - 감사 로그 시스템
// 목적: 중요 비즈니스 작업(비용 변경, 메모 삭제 등)에 대한 감사 추적

export type AuditAction =
  | 'cost_change_log_created'
  | 'cost_change_log_failed'
  | 'auto_memo_deleted'
  | 'auto_memo_delete_attempted'
  | 'permission_denied';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditLogEntry {
  timestamp: string;
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  userName?: string;
  userPermission?: number;
  businessId?: string;
  businessName?: string;
  details?: Record<string, any>;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
  };
}

/**
 * 감사 로그 시스템
 *
 * 주요 기능:
 * 1. 중요 비즈니스 작업 기록
 * 2. 권한 위반 시도 추적
 * 3. 자동 메모 삭제 감사
 * 4. 비용 변경 실패 추적
 *
 * 사용 예시:
 * ```typescript
 * AuditLogger.log({
 *   action: 'auto_memo_deleted',
 *   severity: 'warning',
 *   userName: '홍길동',
 *   userPermission: 4,
 *   businessId: '123',
 *   details: { memoId: 'abc', memoTitle: '[자동] 영업비용 조정 추가' }
 * });
 * ```
 */
export class AuditLogger {
  /**
   * 감사 로그 기록
   */
  static log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };

    const logMessage = this.formatLogMessage(logEntry);

    // 심각도에 따라 적절한 로그 레벨 사용
    switch (entry.severity) {
      case 'critical':
      case 'error':
        console.error(logMessage, logEntry);
        break;
      case 'warning':
        console.warn(logMessage, logEntry);
        break;
      case 'info':
      default:
        console.log(logMessage, logEntry);
        break;
    }

    // 프로덕션 환경에서는 외부 로그 수집 시스템에 전송 가능
    // 예: Sentry, DataDog, CloudWatch 등
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalLogger(logEntry);
    }
  }

  /**
   * 비용 변경 로그 생성 성공
   */
  static logCostChangeCreated(params: {
    userName: string;
    businessId: string;
    businessName?: string;
    costType: string;
    action: string;
  }): void {
    this.log({
      action: 'cost_change_log_created',
      severity: 'info',
      userName: params.userName,
      businessId: params.businessId,
      businessName: params.businessName,
      details: {
        costType: params.costType,
        changeAction: params.action
      }
    });
  }

  /**
   * 비용 변경 로그 생성 실패
   */
  static logCostChangeFailed(params: {
    userName: string;
    businessId: string;
    costType: string;
    error: string;
  }): void {
    this.log({
      action: 'cost_change_log_failed',
      severity: 'error',
      userName: params.userName,
      businessId: params.businessId,
      details: {
        costType: params.costType,
        errorMessage: params.error
      }
    });
  }

  /**
   * 자동 메모 삭제 (권한 4만 가능)
   */
  static logAutoMemoDeleted(params: {
    userName: string;
    userPermission: number;
    businessId: string;
    memoId: string;
    memoTitle: string;
    memoContent: string;
  }): void {
    this.log({
      action: 'auto_memo_deleted',
      severity: 'warning',
      userName: params.userName,
      userPermission: params.userPermission,
      businessId: params.businessId,
      details: {
        memoId: params.memoId,
        memoTitle: params.memoTitle,
        memoContent: params.memoContent
      }
    });
  }

  /**
   * 자동 메모 삭제 시도 (권한 부족)
   */
  static logAutoMemoDeleteAttempted(params: {
    userName: string;
    userPermission: number;
    businessId: string;
    memoId: string;
    memoTitle: string;
  }): void {
    this.log({
      action: 'auto_memo_delete_attempted',
      severity: 'warning',
      userName: params.userName,
      userPermission: params.userPermission,
      businessId: params.businessId,
      details: {
        memoId: params.memoId,
        memoTitle: params.memoTitle,
        reason: 'Insufficient permission (required: 4)'
      }
    });
  }

  /**
   * 권한 거부
   */
  static logPermissionDenied(params: {
    userName: string;
    userPermission: number;
    requiredPermission: number;
    action: string;
    resourceId?: string;
  }): void {
    this.log({
      action: 'permission_denied',
      severity: 'warning',
      userName: params.userName,
      userPermission: params.userPermission,
      details: {
        attemptedAction: params.action,
        requiredPermission: params.requiredPermission,
        resourceId: params.resourceId
      }
    });
  }

  /**
   * 로그 메시지 포맷팅
   */
  private static formatLogMessage(entry: AuditLogEntry): string {
    const severityEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };

    const emoji = severityEmoji[entry.severity];
    const timestamp = new Date(entry.timestamp).toLocaleString('ko-KR');
    const user = entry.userName || 'Unknown';
    const action = entry.action.replace(/_/g, ' ').toUpperCase();

    return `${emoji} [AUDIT] ${timestamp} - ${user} - ${action}`;
  }

  /**
   * 외부 로그 수집 시스템에 전송
   * (프로덕션 환경에서 사용)
   */
  private static sendToExternalLogger(entry: AuditLogEntry): void {
    // TODO: 실제 환경에서는 Sentry, DataDog, CloudWatch 등에 전송
    // 예시:
    // if (process.env.SENTRY_DSN) {
    //   Sentry.captureMessage(`Audit Log: ${entry.action}`, {
    //     level: entry.severity,
    //     extra: entry
    //   });
    // }
  }
}

/**
 * 감사 로그 조회 헬퍼
 * (향후 확장 가능)
 */
export class AuditLogQuery {
  /**
   * 특정 사용자의 감사 로그 조회
   * TODO: 데이터베이스에 감사 로그 테이블 추가 시 구현
   */
  static async getByUser(userName: string): Promise<AuditLogEntry[]> {
    // 향후 구현
    return [];
  }

  /**
   * 특정 사업장의 감사 로그 조회
   * TODO: 데이터베이스에 감사 로그 테이블 추가 시 구현
   */
  static async getByBusiness(businessId: string): Promise<AuditLogEntry[]> {
    // 향후 구현
    return [];
  }

  /**
   * 특정 기간의 감사 로그 조회
   * TODO: 데이터베이스에 감사 로그 테이블 추가 시 구현
   */
  static async getByDateRange(startDate: Date, endDate: Date): Promise<AuditLogEntry[]> {
    // 향후 구현
    return [];
  }
}
