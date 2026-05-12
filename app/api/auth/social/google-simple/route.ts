import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateToken } from '@/utils/auth';
import crypto from 'crypto';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.NODE_ENV === 'production'
  ? 'https://facility.bluon-iot.com/auth/social/google-simple/callback'
  : 'http://localhost:3000/auth/social/google-simple/callback';

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture?: string;
  locale?: string;
  hd?: string; // 조직 도메인 (G Suite 사용자인 경우)
}

async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const tokenUrl = 'https://oauth2.googleapis.com/token';

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: GOOGLE_CLIENT_ID!,
    client_secret: GOOGLE_CLIENT_SECRET!,
    redirect_uri: GOOGLE_REDIRECT_URI,
    code: code
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('구글 토큰 교환 실패:', response.status, errorData);
    throw new Error(`구글 토큰 교환 실패: ${response.status}`);
  }

  return await response.json();
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';

  const response = await fetch(userInfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('구글 사용자 정보 조회 실패:', response.status, errorData);
    throw new Error(`구글 사용자 정보 조회 실패: ${response.status}`);
  }

  return await response.json();
}

// 간단한 자동 가입 처리
async function createUserDirectly(userInfo: GoogleUserInfo) {
  const email = userInfo.email;
  const name = userInfo.name;
  const googleId = userInfo.id;

  if (!email) {
    throw new Error('구글 계정에서 이메일을 가져올 수 없습니다.');
  }

  if (!name) {
    throw new Error('구글 계정에서 이름을 가져올 수 없습니다.');
  }

  // 기존 소셜 계정 확인
  const { data: existingSocial } = await supabaseAdmin
    .from('social_accounts')
    .select('employee_id, employees(*)')
    .eq('provider', 'google')
    .eq('provider_user_id', googleId)
    .single();

  if (existingSocial) {
    console.log('✅ [GOOGLE-SIMPLE] 기존 구글 계정 로그인:', email);
    return {
      employee: existingSocial.employees,
      isNewUser: false
    };
  }

  // 이메일로 기존 직원 확인
  const { data: existingEmployee } = await supabaseAdmin
    .from('employees')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single();

  if (existingEmployee) {
    // 기존 직원에게 구글 계정 연결
    await supabaseAdmin
      .from('social_accounts')
      .insert({
        employee_id: existingEmployee.id,
        provider: 'google',
        provider_user_id: googleId,
        provider_email: email,
        provider_name: name,
        is_primary: false,
        connected_at: new Date().toISOString()
      });

    console.log('🔗 [GOOGLE-SIMPLE] 기존 직원에게 구글 계정 연결:', email);
    return {
      employee: existingEmployee,
      isNewUser: false
    };
  }

  // 새 사용자 자동 생성 (모든 소셜 가입자는 권한 1)
  const permissionLevel = 1; // 모든 자동 가입자는 일반 사용자 권한

  const employeeId = crypto.randomUUID();

  const { data: newEmployee, error: employeeError } = await supabaseAdmin
    .from('employees')
    .insert({
      id: employeeId,
      employee_id: `GOOGLE_${Date.now()}`,
      name: name,
      email: email,
      permission_level: permissionLevel,
      department: null,
      position: '구글 로그인 사용자',
      is_active: true,
      social_login_enabled: true,
      created_by_social: true
    })
    .select()
    .single();

  if (employeeError) {
    throw employeeError;
  }

  // 소셜 계정 연결
  await supabaseAdmin
    .from('social_accounts')
    .insert({
      employee_id: employeeId,
      provider: 'google',
      provider_user_id: googleId,
      provider_email: email,
      provider_name: name,
      is_primary: true,
      connected_at: new Date().toISOString()
    });

  console.log(`✅ [GOOGLE-SIMPLE] 새 사용자 자동 생성 (권한 ${permissionLevel}):`, email);
  return {
    employee: newEmployee,
    isNewUser: true
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: '구글 설정이 완료되지 않았습니다.' }
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('❌ [GOOGLE-SIMPLE] OAuth 오류:', error);
      return NextResponse.json({
        success: false,
        error: { code: 'OAUTH_ERROR', message: '구글 로그인 중 오류가 발생했습니다.' }
      }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({
        success: false,
        error: { code: 'NO_CODE', message: '인증 코드가 없습니다.' }
      }, { status: 400 });
    }

    console.log('🔄 [GOOGLE-SIMPLE] 토큰 교환 시작');

    // 1. 코드를 토큰으로 교환
    const tokenData = await exchangeCodeForToken(code);
    console.log('✅ [GOOGLE-SIMPLE] 토큰 교환 완료');

    // 2. 사용자 정보 조회
    const userInfo = await getGoogleUserInfo(tokenData.access_token);
    console.log('👤 [GOOGLE-SIMPLE] 사용자 정보 조회 완료:', userInfo.email);

    // 3. 사용자 자동 생성 또는 로그인
    const userResult = await createUserDirectly(userInfo);

    // 4. JWT 토큰 생성
    const jwtToken = generateToken({
      id: userResult.employee.id,
      email: userResult.employee.email,
      name: userResult.employee.name,
      permission_level: userResult.employee.permission_level
    });

    // 5. 로그인 기록
    await supabaseAdmin
      .from('login_attempts')
      .insert({
        email: userResult.employee.email,
        ip_address: request.ip || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        login_method: 'google',
        success: true,
        employee_id: userResult.employee.id
      });

    // 6. 마지막 로그인 시간 업데이트
    await supabaseAdmin
      .from('employees')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userResult.employee.id);

    console.log('🎉 [GOOGLE-SIMPLE] 로그인 성공:', userResult.employee.email);

    // 7. 응답 반환
    const response = NextResponse.json({
      success: true,
      data: {
        message: userResult.isNewUser ? '구글 계정으로 가입되었습니다!' : '구글로 로그인되었습니다!',
        user: {
          id: userResult.employee.id,
          email: userResult.employee.email,
          name: userResult.employee.name,
          permission_level: userResult.employee.permission_level,
          employee_id: userResult.employee.employee_id,
          department: userResult.employee.department,
          position: userResult.employee.position
        },
        isNewUser: userResult.isNewUser,
        provider: 'google',
        token: jwtToken
      }
    });

    // JWT 토큰을 쿠키에 설정
    response.cookies.set('auth-token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30일
    });

    return response;

  } catch (error) {
    console.error('❌ [GOOGLE-SIMPLE] 처리 실패:', error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: error instanceof Error ? error.message : '구글 로그인 처리 중 오류가 발생했습니다.'
      }
    }, { status: 500 });
  }
}