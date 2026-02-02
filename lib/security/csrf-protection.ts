import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// CSRF 토큰 관리 클래스
export class CSRFProtection {
  private static tokens = new Map<string, { token: string; expires: number }>();

  // CSRF 토큰 생성
  static generateToken(sessionId?: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (15 * 60 * 1000); // 15분

    if (sessionId) {
      this.tokens.set(sessionId, { token, expires });
    }

    return token;
  }

  // CSRF 토큰 검증
  static validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);
    if (!stored || stored.expires < Date.now()) {
      this.tokens.delete(sessionId);
      return false;
    }
    return stored.token === token;
  }

  // NextResponse에 CSRF 토큰 설정
  static setCSRFToken(response: NextResponse, sessionId?: string): string {
    const token = this.generateToken(sessionId);

    response.cookies.set('csrf-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 900, // 15분
      path: '/'
    });

    return token;
  }

  // NextRequest에서 CSRF 토큰 검증
  static validateCSRFToken(request: NextRequest): boolean {
    const cookieToken = request.cookies.get('csrf-token')?.value;
    const headerToken = request.headers.get('x-csrf-token') ||
                       request.headers.get('X-CSRF-Token');

    if (!cookieToken || !headerToken) {
      return false;
    }

    return cookieToken === headerToken;
  }

  // 만료된 토큰 정리 (주기적 실행 권장)
  static cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [sessionId, tokenData] of this.tokens.entries()) {
      if (tokenData.expires < now) {
        this.tokens.delete(sessionId);
      }
    }
  }
}

// 미들웨어에서 사용할 CSRF 보호 함수
export function protectCSRF(request: NextRequest): { valid: boolean; error?: string } {
  // GET, HEAD, OPTIONS 요청은 CSRF 보호 제외
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(request.method)) {
    return { valid: true };
  }

  // API 경로만 CSRF 보호 적용
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return { valid: true };
  }

  // 로그인/회원가입 API와 설정 API는 CSRF 보호 제외 (초기 토큰 발급 전)
  const excludePaths = [
    '/api/auth/login',
    '/api/auth/logout',  // 로그아웃 API 추가
    '/api/auth/signup',  // 회원가입 API 추가
    '/api/auth/set-password',  // 비밀번호 설정 API 추가
    '/api/auth/change-password',  // 비밀번호 변경 API 추가
    '/api/auth/verify',
    '/api/health',
    '/api/setup-social-schema',
    '/api/sync',  // 동기화 API 예외 추가
    '/api/profile/update',  // 프로필 업데이트 (JWT 인증 사용)
    '/api/profile/change-password',  // 비밀번호 변경 (JWT 인증 사용)
    '/api/tasks',  // 업무 관리 API (JWT 인증 사용)
    '/api/tasks/metadata',  // 업무 메타데이터 API (JWT 인증 사용)
    '/api/work-tasks',  // 업무 API (JWT 인증 사용)
    '/api/facility-tasks',  // 시설 업무 관리 API (JWT 인증 사용)
    '/api/business-progress',  // 사업장 진행 현황 API (withApiHandler 보안 사용)
    '/api/business-memos',  // 사업장 메모 관리 API (withApiHandler 보안 사용)
    '/api/business-list',  // 사업장 목록 API (JWT 인증 사용)
    '/api/business-info',  // 사업장 정보 API (JWT 인증 사용)
    '/api/business-info-direct',  // 사업장 정보 직접 API (JWT 인증 사용)
    '/api/business-management',  // 사업장 관리 API (JWT 인증 사용)
    '/api/facility-management',  // 시설 관리 정보 API (공개 사용)
    '/api/router-inventory',  // 라우터 재고 관리 메인 API (JWT 인증 사용)
    '/api/order-management',  // 발주 관리 메인 API (JWT 인증 사용)
    '/api/delivery-addresses',  // 택배 주소 관리 API (JWT 인증 사용)
    '/api/air-permit-pdf',  // 대기필증 PDF 생성 API (JWT 인증 사용)
    '/api/air-permit',  // 대기필증 관리 API (JWT 인증 사용)
    '/api/outlet-facility',  // 배출구/시설 관리 API (JWT 인증 사용)
    '/api/upload-supabase',  // 파일 업로드 API (공개 사용)
    '/api/upload-metadata',  // 파일 메타데이터 저장 API (Supabase Direct Upload용)
    '/api/facility-photos',  // 시설별 사진 업로드 API (공개 사용)
    '/api/uploaded-files-supabase',  // 업로드 파일 조회 API (공개 사용)
    '/api/uploaded-files',  // 업로드 파일 관리 API (공개 사용)
    '/api/facilities-supabase',  // 시설 정보 API (공개 사용)
    '/api/facility-measurement'  // 시설 측정기기 정보 API (공개 사용)
  ];
  const excludePatterns = [
    '/api/auth/social/',
    '/api/auth/social/*/callback',
    '/api/tasks/*',
    '/api/work-tasks/*',
    '/api/facility-tasks/*',  // 시설 업무 관리 API 전체 제외 (JWT 인증 사용)
    '/api/revenue/*',  // 매출 관리 API 전체 제외 (JWT 인증 사용)
    '/api/admin/employees/*',  // 사용자 관리 API 제외 (JWT 인증 사용)
    '/api/revenue/recalculate',  // 매출 재계산 API (JWT 인증 + 권한 레벨 4)
    '/api/weekly-reports/*',  // 주간 리포트 API 전체 제외 (JWT 인증 사용)
    '/api/organization/*',  // 조직 관리 API 전체 제외 (JWT 인증 사용)
    '/api/notifications/*',  // 알림 API 전체 제외 (JWT 인증 사용)
    '/api/router-inventory/*',  // 라우터 재고 관리 API 전체 제외 (JWT 인증 사용)
    '/api/order-management/*',  // 발주 관리 API 전체 제외 (JWT 인증 사용)
    '/api/document-automation/*',  // 문서 자동화 API 전체 제외 (JWT 인증 사용)
    '/api/construction-reports',  // 착공신고서 관리 API (JWT 인증 사용)
    '/api/construction-reports/*',  // 착공신고서 관리 API 전체 제외 (JWT 인증 사용)
    '/api/estimates/*',  // 견적서 관리 API 전체 제외 (JWT 인증 사용)
    '/api/air-permit-pdf',  // 대기필증 PDF 생성 API (JWT 인증 사용)
    '/api/air-permit',  // 대기필증 관리 API (JWT 인증 사용)
    '/api/outlet-facility',  // 배출구/시설 관리 API (JWT 인증 사용)
    '/api/facility-photos/*',  // 시설 사진 관리 API 전체 제외 (공개 사용)
    '/api/uploaded-files-supabase/*',  // 업로드 파일 관리 API 전체 제외 (공개 사용)
    '/api/announcements',  // 공지사항 목록 API (Supabase Admin 인증 사용)
    '/api/announcements/*',  // 공지사항 개별 API (Supabase Admin 인증 사용)
    '/api/messages',  // 전달사항 목록 API (Supabase Admin 인증 사용)
    '/api/messages/*',  // 전달사항 개별 API (Supabase Admin 인증 사용)
    '/api/calendar',  // 캘린더 이벤트 목록 API (Supabase Admin 인증 사용)
    '/api/calendar/*',  // 캘린더 이벤트 개별 API (Supabase Admin 인증 사용)
    '/api/subsidy-announcements',  // 보조금 공고 목록 API (Supabase Admin 인증 사용)
    '/api/subsidy-announcements/*',  // 보조금 공고 개별 API (Supabase Admin 인증 사용)
    '/api/admin/monthly-closing',  // 월 마감 관리 API (JWT 인증 사용)
    '/api/admin/monthly-closing/*',  // 월 마감 관리 API 전체 제외 (JWT 인증 사용)
    '/api/businesses/*/memos',  // 사업장별 메모 관리 API (JWT 인증 사용)
    '/api/businesses/*/memos/*',  // 사업장별 메모 개별 API 전체 제외 (JWT 인증 사용)
    '/api/meeting-minutes',  // 회의록 관리 API (JWT 인증 사용)
    '/api/meeting-minutes/*',  // 회의록 관리 API 전체 제외 (JWT 인증 사용)
    '/api/meeting-templates',  // 회의록 템플릿 API (JWT 인증 사용)
    '/api/meeting-templates/*'  // 회의록 템플릿 API 전체 제외 (JWT 인증 사용)
  ];

  if (excludePaths.includes(request.nextUrl.pathname)) {
    return { valid: true };
  }

  // 패턴 기반 경로 제외
  if (excludePatterns.some(pattern => {
    if (pattern.includes('*')) {
      // * 를 정규식으로 변환: /api/tasks/* → /api/tasks/.*
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(request.nextUrl.pathname);
    } else {
      return request.nextUrl.pathname.startsWith(pattern);
    }
  })) {
    return { valid: true };
  }

  const isValid = CSRFProtection.validateCSRFToken(request);

  return {
    valid: isValid,
    error: isValid ? undefined : 'CSRF token validation failed'
  };
}