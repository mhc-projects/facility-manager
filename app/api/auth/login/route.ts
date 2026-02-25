import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { queryOne, query as pgQuery } from '@/lib/supabase-direct';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export async function POST(request: NextRequest) {
  try {
    // CORS 헤더 설정 (포용적 접근)
    const origin = request.headers.get('origin');
    const allowedOrigins = [
      'https://facility.blueon-iot.com',
      'https://www.facility.blueon-iot.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:3006',
      'http://localhost:3007',
      'http://localhost:3008',
      'http://localhost:3009',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:3004',
      'http://127.0.0.1:3005',
      'http://127.0.0.1:3006',
      'http://127.0.0.1:3007',
      'http://127.0.0.1:3008',
      'http://127.0.0.1:3009'
    ];

    // Vercel 자동 배포 도메인 동적 허용 (프로덕션 환경에서)
    const allowedDomainPatterns = [
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/facility\.blueon-iot\.com$/,
      /^https:\/\/.*\.facility\.blueon-iot\.com$/
    ];

    console.log('🔍 [LOGIN] 요청 헤더 정보:', {
      origin,
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent')
    });

    // Origin 검증 (포용적 접근)
    let isOriginAllowed = false;

    if (!origin) {
      isOriginAllowed = true;
    } else if (allowedOrigins.includes(origin)) {
      isOriginAllowed = true;
    } else {
      isOriginAllowed = allowedDomainPatterns.some(pattern => pattern.test(origin));
    }

    if (!isOriginAllowed) {
      console.error('❌ [LOGIN] 허용되지 않은 Origin:', {
        origin,
        allowedOrigins,
        allowedPatterns: allowedDomainPatterns.map(p => p.toString())
      });
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN_ORIGIN', message: `허용되지 않은 도메인입니다. Origin: ${origin}` } },
        { status: 403 }
      );
    }

    const { email, password } = await request.json();

    // 입력 검증
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: '이메일과 비밀번호를 입력해주세요.' } },
        { status: 400 }
      );
    }

    // 먼저 이메일로 사용자 조회 (활성 상태 무관) - 직접 PostgreSQL 연결 사용
    console.log('🔍 [DEBUG] PostgreSQL 직접 연결로 쿼리 실행:', {
      table: 'employees',
      email,
      method: 'direct-pg'
    });

    const employeeCheck = await queryOne(
      'SELECT * FROM employees WHERE email = $1 AND is_deleted = false LIMIT 1',
      [email]
    );

    if (!employeeCheck) {
      console.log('❌ [AUTH] 사용자 조회 실패: 존재하지 않는 사용자');
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: '존재하지 않는 사용자입니다.' } },
        { status: 401 }
      );
    }

    // 활성 상태 확인
    if (!employeeCheck.is_active) {
      console.log('❌ [AUTH] 승인 대기 중인 사용자:', email);
      return NextResponse.json(
        { success: false, error: { code: 'ACCOUNT_PENDING', message: '계정 승인 대기 중입니다. 관리자에게 문의하세요.' } },
        { status: 403 }
      );
    }

    const employee = employeeCheck;

    // 소셜 로그인 사용자 확인
    if (!employee.password_hash && employee.signup_method && employee.signup_method !== 'direct') {
      console.log('❌ [AUTH] 소셜 로그인 사용자 일반 로그인 시도');
      return NextResponse.json(
        { success: false, error: { code: 'SOCIAL_LOGIN_USER', message: '소셜 로그인 사용자입니다. 카카오 로그인을 이용해주세요.' } },
        { status: 400 }
      );
    }

    // 비밀번호 검증
    if (!employee.password_hash) {
      console.log('❌ [AUTH] 비밀번호 해시 없음');
      return NextResponse.json(
        { success: false, error: { code: 'NO_PASSWORD', message: '비밀번호가 설정되지 않은 계정입니다.' } },
        { status: 400 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, employee.password_hash);
    if (!isValidPassword) {
      console.log('❌ [AUTH] 비밀번호 불일치');
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_PASSWORD', message: '비밀번호가 틀렸습니다.' } },
        { status: 401 }
      );
    }

    // 마지막 로그인 시간 업데이트 - 직접 PostgreSQL 연결 사용
    await pgQuery(
      'UPDATE employees SET last_login_at = $1 WHERE id = $2',
      [new Date().toISOString(), employee.id]
    );

    // JWT 토큰 생성 (verify API와 동일한 구조)
    const token = jwt.sign(
      {
        id: employee.id,          // verify API 호환성
        userId: employee.id,      // 기존 호환성 유지
        email: employee.email,
        permission_level: employee.permission_level, // ✅ 필드명 통일
        name: employee.name
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ [AUTH] 로그인 성공:', { email: employee.email, name: employee.name });

    // 응답 데이터 (password_hash 제외)
    const { password_hash, ...safeEmployee } = employee;

    // 쿠키 기반 토큰 관리 - httpOnly 쿠키 설정
    const response = NextResponse.json({
      success: true,
      data: {
        token, // 클라이언트 호환성을 위해 유지
        user: safeEmployee,
        permissions: {
          canViewAllTasks: employee.permission_level >= 1,
          canCreateTasks: true,
          canEditTasks: true,
          canDeleteTasks: employee.permission_level >= 1,
          canViewReports: true,
          canApproveReports: employee.permission_level >= 1,
          canAccessAdminPages: employee.permission_level >= 3,
          canViewSensitiveData: employee.permission_level >= 3
        }
      },
      timestamp: new Date().toISOString()
    });

    // ✅ httpOnly 쿠키 설정 - Next.js cookies.set() API 사용 (권장 방식)
    const isProduction = process.env.NODE_ENV === 'production';
    const maxAge = 24 * 60 * 60; // 24시간

    // session_token 쿠키 (httpOnly - 보안)
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    // auth_ready 쿠키 (JavaScript 접근 가능 - 인증 상태 확인용)
    response.cookies.set('auth_ready', 'true', {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    console.log('🍪 [AUTH] 쿠키 설정 완료 (cookies.set API):', {
      session_token: 'httpOnly=true',
      auth_ready: 'httpOnly=false',
      isProduction,
    });

    return response;

  } catch (error) {
    console.error('❌ [AUTH] 로그인 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        }
      },
      { status: 500 }
    );
  }
}