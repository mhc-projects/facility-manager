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
  ? 'https://facility.bluon-iot.com/api/auth/social/google'
  : 'http://localhost:3000/api/auth/social/google';

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
    console.error('Google 토큰 교환 실패:', response.status, errorData);
    throw new Error(`Google 토큰 교환 실패: ${response.status}`);
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
    console.error('Google 사용자 정보 조회 실패:', response.status, errorData);
    throw new Error(`Google 사용자 정보 조회 실패: ${response.status}`);
  }

  return await response.json();
}

async function findOrCreateEmployee(userInfo: GoogleUserInfo) {
  const email = userInfo.email;
  const name = userInfo.name;
  const emailDomain = email.split('@')[1];

  // 기존 소셜 계정 확인
  const { data: existingSocial } = await supabaseAdmin
    .from('social_accounts')
    .select('employee_id, employees(*)')
    .eq('provider', 'google')
    .eq('provider_user_id', userInfo.id)
    .single();

  if (existingSocial) {
    console.log('✅ [GOOGLE-LOGIN] 기존 Google 계정 로그인:', email);
    return {
      employee: existingSocial.employees,
      isNewUser: false,
      requiresApproval: false
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
    // 기존 직원에게 Google 계정 연결
    await supabaseAdmin
      .from('social_accounts')
      .insert({
        employee_id: existingEmployee.id,
        provider: 'google',
        provider_user_id: userInfo.id,
        provider_email: email,
        provider_name: name,
        is_primary: false,
        connected_at: new Date().toISOString()
      });

    console.log('🔗 [GOOGLE-LOGIN] 기존 직원에게 Google 계정 연결:', email);
    return {
      employee: existingEmployee,
      isNewUser: false,
      requiresApproval: false
    };
  }

  // 도메인 정책 확인
  const { data: policy } = await supabaseAdmin
    .from('social_auth_policies')
    .select('*')
    .eq('email_domain', emailDomain)
    .eq('is_active', true)
    .single();

  if (policy && policy.auto_approve) {
    // 자동 승인 정책이 있는 경우 즉시 계정 생성
    const employeeId = crypto.randomUUID();

    const { data: newEmployee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert({
        id: employeeId,
        employee_id: `GOOGLE_${Date.now()}`,
        name: name,
        email: email,
        permission_level: policy.default_permission_level,
        department: policy.default_department,
        position: 'Google 로그인 사용자',
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
        provider_user_id: userInfo.id,
        provider_email: email,
        provider_name: name,
        is_primary: true,
        connected_at: new Date().toISOString()
      });

    console.log('✅ [GOOGLE-LOGIN] 자동 승인으로 계정 생성:', email);
    return {
      employee: newEmployee,
      isNewUser: true,
      requiresApproval: false
    };
  } else {
    // 수동 승인이 필요한 경우
    const { data: existingApproval } = await supabaseAdmin
      .from('social_auth_approvals')
      .select('*')
      .eq('provider', 'google')
      .eq('provider_user_id', userInfo.id)
      .single();

    if (!existingApproval) {
      // 새로운 승인 요청 생성
      await supabaseAdmin
        .from('social_auth_approvals')
        .insert({
          provider: 'google',
          provider_user_id: userInfo.id,
          requester_email: email,
          requester_name: name,
          email_domain: emailDomain,
          requested_permission_level: 1,
          requested_department: policy?.default_department || null,
          approval_status: 'pending',
          request_data: JSON.stringify({
            picture: userInfo.picture,
            locale: userInfo.locale,
            hd: userInfo.hd,
            verified_email: userInfo.verified_email
          })
        });

      console.log('📋 [GOOGLE-LOGIN] 수동 승인 요청 생성:', email);
    }

    return {
      employee: null,
      isNewUser: true,
      requiresApproval: true,
      approvalStatus: existingApproval?.approval_status || 'pending'
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Google 설정이 완료되지 않았습니다.' }
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('❌ [GOOGLE-LOGIN] OAuth 오류:', error);
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

    // State 검증 (선택사항, 보안 강화를 위해 구현 권장)
    if (state) {
      // 실제 구현에서는 세션에 저장된 state와 비교
      console.log('🔐 [GOOGLE-LOGIN] State 파라미터:', state);
    }

    console.log('🔄 [GOOGLE-LOGIN] 토큰 교환 시작');

    // 1. 코드를 토큰으로 교환
    const tokenData = await exchangeCodeForToken(code);

    console.log('✅ [GOOGLE-LOGIN] 토큰 교환 완료');

    // 2. 사용자 정보 조회
    const userInfo = await getGoogleUserInfo(tokenData.access_token);

    console.log('👤 [GOOGLE-LOGIN] 사용자 정보 조회 완료:', userInfo.email);

    // 3. 사용자 계정 처리
    const userResult = await findOrCreateEmployee(userInfo);

    if (userResult.requiresApproval) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'APPROVAL_REQUIRED',
          message: '관리자 승인이 필요합니다. 승인 완료 후 다시 로그인해주세요.'
        },
        data: {
          email: userInfo.email,
          status: userResult.approvalStatus
        }
      }, { status: 202 }); // 202 Accepted
    }

    // 4. JWT 토큰 생성
    const jwtToken = generateToken({
      id: userResult.employee!.id,
      email: userResult.employee!.email,
      name: userResult.employee!.name,
      permission_level: userResult.employee!.permission_level
    });

    // 5. 로그인 기록
    await supabaseAdmin
      .from('login_attempts')
      .insert({
        email: userInfo.email,
        ip_address: request.ip || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        login_method: 'google',
        success: true,
        employee_id: userResult.employee!.id
      });

    // 6. 마지막 로그인 시간 업데이트
    await supabaseAdmin
      .from('employees')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userResult.employee!.id);

    console.log('🎉 [GOOGLE-LOGIN] 로그인 성공:', userInfo.email);

    // 7. 응답 반환
    const response = NextResponse.json({
      success: true,
      data: {
        message: userResult.isNewUser ? '계정이 생성되고 로그인되었습니다.' : '로그인되었습니다.',
        user: {
          id: userResult.employee!.id,
          email: userResult.employee!.email,
          name: userResult.employee!.name,
          permission_level: userResult.employee!.permission_level,
          employee_id: userResult.employee!.employee_id,
          department: userResult.employee!.department,
          position: userResult.employee!.position
        },
        isNewUser: userResult.isNewUser,
        provider: 'google'
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
    console.error('❌ [GOOGLE-LOGIN] 처리 실패:', error);

    // 실패 기록
    const email = 'unknown';
    await supabaseAdmin
      .from('login_attempts')
      .insert({
        email,
        ip_address: request.ip || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown',
        login_method: 'google',
        success: false,
        failure_reason: error instanceof Error ? error.message : 'Unknown error'
      });

    return NextResponse.json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'Google 로그인 처리 중 오류가 발생했습니다.'
      }
    }, { status: 500 });
  }
}