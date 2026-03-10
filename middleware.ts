import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/security/rate-limiter';
import { protectCSRF } from '@/lib/security/csrf-protection';
import { validateRequestSize } from '@/lib/security/input-validation';

// 보안 헤더 설정
function setSecurityHeaders(response: NextResponse): void {
  // XSS 보호
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // 클릭재킹 방지 (SAMEORIGIN으로 변경 - 캘린더 파일 미리보기 iframe 허용)
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // MIME 타입 스니핑 방지
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // 리퍼러 정책
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // DNS 프리페치 제어
  response.headers.set('X-DNS-Prefetch-Control', 'on');

  // 권한 정책 (카메라, 마이크 등 제한)
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=()'
  );

  // Content Security Policy (CSP)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://t1.kakaocdn.net", // Next.js + Kakao SDK
    "style-src 'self' 'unsafe-inline'", // TailwindCSS 지원
    "img-src 'self' data: blob: https:", // 이미지 업로드 지원
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://dapi.kakao.com", // Supabase 연결 + 카카오 지오코딩 API
    "font-src 'self' data:",
    "frame-src 'self' https://*.supabase.co", // Supabase Storage iframe 허용 (캘린더 파일 미리보기)
    "object-src 'self' https://*.supabase.co", // PDF embed 태그 허용 (캘린더 파일 미리보기)
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // HTTPS 강제 (프로덕션 환경)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
}

// 인증 면제 경로 확인 (로그인 없이 접근 가능한 페이지)
function isAuthExemptRoute(pathname: string): boolean {
  const exemptRoutes = [
    '/login',
    '/signup',
    '/forgot-password',
    '/set-password',
    '/change-password',
    '/reset-password',
    '/terms',
    '/privacy',
    '/business/', // 카카오톡 링크 미리보기용 (Open Graph 크롤링)
    '/api/health',
    '/api/supabase-test',
    '/_next',
    '/favicon.ico'
  ];

  return exemptRoutes.some(route => pathname.startsWith(route));
}

// 정적 파일 확인
function isStaticFile(pathname: string): boolean {
  return pathname.startsWith('/_next/static/') ||
         pathname.startsWith('/img/') ||
         pathname.includes('.');
}

// CSRF 검증 제외 API 경로 (외부 호출용 - Bearer 토큰 인증)
function isCSRFExemptAPI(pathname: string): boolean {
  const exemptPaths = [
    '/api/auth/login',         // 로그인 API (CSRF 토큰 없이 호출 가능)
    '/api/subsidy-crawler',    // GitHub Actions 크롤러
    '/api/webhooks/',          // 외부 웹훅
    '/api/order-management',   // 발주 관리 API (Bearer 토큰 or 쿠키 인증)
    '/api/migrate-business-id', // 마이그레이션 API (관리자 전용)
    '/api/test-caption',       // Caption 테스트 API (개발용)
    '/api/businesses',         // 사업장 관리 API (Bearer 토큰 인증)
    '/api/invoice-records',    // 계산서 레코드 CRUD API (쿠키 인증)
    '/api/business-invoices',  // 계산서 조회 API (쿠키 인증)
    '/api/migrations/',        // 마이그레이션 API (관리자 전용)
    '/api/business-collection-manager', // 수금 담당자 업데이트 API (Bearer 토큰 인증)
    '/api/collection-managers-candidates', // 수금 담당자 후보 조회 API (Bearer 토큰 인증)
    '/api/as-records',       // AS 건 관리 API (Bearer 토큰 인증)
    '/api/as-price-list',    // AS 단가표 API (Bearer 토큰 인증)
    '/api/as-materials',     // AS 자재 API (Bearer 토큰 인증)
  ];
  return exemptPaths.some(path => pathname.startsWith(path));
}

// API 경로 보호
async function protectAPIRoute(request: NextRequest): Promise<NextResponse | null> {
  // Rate Limiting 체크
  const rateLimitResult = await RateLimiter.check(request);

  if (!rateLimitResult.success) {
    console.warn(`[SECURITY] Rate limit exceeded for ${request.ip} on ${request.nextUrl.pathname}`);

    const response = new NextResponse(
      JSON.stringify({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
        }
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '900' // 15분 후 재시도
        }
      }
    );

    // Rate Limit 헤더 추가
    if (rateLimitResult.limit) {
      response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    }
    if (rateLimitResult.remaining !== undefined) {
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    }
    if (rateLimitResult.resetTime) {
      response.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000).toString());
    }

    return response;
  }

  // 요청 크기 검증
  const contentLength = request.headers.get('content-length');
  if (!validateRequestSize(contentLength)) {
    console.warn(`[SECURITY] Request size too large for ${request.ip} on ${request.nextUrl.pathname}`);

    return new NextResponse(
      JSON.stringify({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: '요청 크기가 너무 큽니다.'
        }
      }),
      {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // CSRF 보호 (외부 API 호출은 제외 - Bearer 토큰으로 인증)
  if (!isCSRFExemptAPI(request.nextUrl.pathname)) {
    const csrfResult = protectCSRF(request);
    if (!csrfResult.valid) {
      console.warn(`[SECURITY] CSRF validation failed for ${request.ip} on ${request.nextUrl.pathname}`);

      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'CSRF_TOKEN_INVALID',
            message: 'CSRF 토큰이 유효하지 않습니다.'
          }
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  return null; // 모든 보안 검사 통과
}

// 페이지 인증 및 권한 확인
async function checkPageAuthentication(request: NextRequest): Promise<NextResponse | null> {
  // 1. httpOnly 쿠키에서 session_token 확인 (주요 인증)
  const token = request.cookies.get('session_token')?.value;
  // 2. auth_ready 쿠키 확인 (session_token이 없을 때 보조 신호)
  //    동일한 로그인 API에서 함께 설정되므로 신뢰 가능
  const authReady = request.cookies.get('auth_ready')?.value;

  // 🔍 디버깅: 쿠키 정보 로깅
  console.log(`🔍 [MIDDLEWARE] 페이지 인증 체크 - Path: ${request.nextUrl.pathname}`, {
    hasSessionToken: !!token,
    hasAuthReady: !!authReady,
    cookieNames: Array.from(request.cookies.getAll().map(c => c.name)),
    userAgent: request.headers.get('user-agent')?.substring(0, 50)
  });

  if (!token && !authReady) {
    // 두 쿠키 모두 없을 때만 로그인 페이지로 리다이렉트
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname);

    console.warn(`[SECURITY] Unauthenticated access attempt to ${request.nextUrl.pathname} from ${request.ip}`);

    return NextResponse.redirect(loginUrl);
  }

  // auth_ready는 있지만 session_token이 없는 경우: 통과시킴
  // 클라이언트 측 AuthContext가 localStorage 토큰으로 인증 처리
  if (!token && authReady) {
    console.log(`✅ [MIDDLEWARE] auth_ready 쿠키로 통과 허용 - Path: ${request.nextUrl.pathname}`);
    return null;
  }

  // ✅ Edge Runtime 호환: JWT 검증을 간소화
  // Edge Runtime에서는 Node.js crypto 모듈을 사용할 수 없으므로
  // 쿠키 존재 여부만 확인하고, 실제 검증은 페이지/API 레벨에서 수행

  // JWT 토큰 기본 구조 확인 (형식만 체크, 서명 검증 안 함)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT structure');
    }

    // JWT payload 디코딩 (검증 없이)
    const payload = JSON.parse(atob(parts[1]));

    // 만료 시간 체크
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new Error('Token expired');
    }

    console.log('✅ [MIDDLEWARE] JWT 구조 확인 완료:', {
      path: request.nextUrl.pathname,
      userId: payload.id || payload.userId,
      permissionLevel: payload.permission_level
    });

    // 토큰이 유효한 형식이면 계속 진행
    // 실제 서명 검증은 페이지/API에서 수행됨
    return null;

  } catch (error) {
    // JWT 구조가 잘못되었거나 만료됨
    console.error('❌ [MIDDLEWARE] JWT 기본 검증 실패:', {
      path: request.nextUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
      tokenPreview: token.substring(0, 20) + '...'
    });

    // 토큰이 유효하지 않으면 로그인 페이지로 리다이렉트
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname);

    console.warn(`[SECURITY] Invalid token structure for ${request.nextUrl.pathname} from ${request.ip}`);

    // 유효하지 않은 쿠키 제거
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('session_token');

    return response;
  }
}

// 메인 미들웨어 함수
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 파일은 보안 헤더만 설정하고 통과
  if (isStaticFile(pathname)) {
    const response = NextResponse.next();
    setSecurityHeaders(response);
    return response;
  }

  // API 경로 보호
  if (pathname.startsWith('/api/')) {
    // 파일 프록시 API는 자체 CSP 헤더 사용 (iframe 허용)
    if (pathname.startsWith('/api/calendar/file-proxy')) {
      return NextResponse.next(); // 헤더를 추가하지 않고 그대로 통과
    }

    const protectionResult = await protectAPIRoute(request);
    if (protectionResult) {
      setSecurityHeaders(protectionResult);
      return protectionResult;
    }

    // ✅ API 보호 통과 시 여기서 종료 (페이지 인증 체크 건너뛰기)
    const response = NextResponse.next();
    setSecurityHeaders(response);
    return response;
  }

  // 일반 페이지 처리 - 인증 면제 페이지가 아니면 인증 확인
  if (!isAuthExemptRoute(pathname)) {
    const authResult = await checkPageAuthentication(request);
    if (authResult) {
      setSecurityHeaders(authResult);
      return authResult;
    }
  }

  const response = NextResponse.next();

  // 보안 헤더 설정
  setSecurityHeaders(response);

  // 개발 환경에서만 보안 로그 출력
  if (process.env.NODE_ENV === 'development') {
    console.log(`[MIDDLEWARE] ${request.method} ${pathname} - ${request.ip || 'unknown'}`);
  }

  return response;
}

// 미들웨어 적용 경로 설정
export const config = {
  matcher: [
    /*
     * 다음 경로들을 제외한 모든 경로에 미들웨어 적용:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};