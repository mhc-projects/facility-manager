import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateToken } from '@/utils/auth';
import { validateInput, ValidationSchemas } from '@/lib/security/input-validation';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 네이버 API 정보
const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 네이버 사용자 정보 인터페이스
interface NaverUserInfo {
  resultcode: string;
  message: string;
  response: {
    id: string;
    nickname?: string;
    name?: string;
    email: string;
    gender?: string;
    age?: string;
    birthday?: string;
    profile_image?: string;
    birthyear?: string;
    mobile?: string;
  };
}

// 네이버 토큰 응답 인터페이스
interface NaverTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

async function exchangeCodeForToken(code: string, state: string): Promise<NaverTokenResponse> {
  const tokenUrl = 'https://nid.naver.com/oauth2.0/token';

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: NAVER_CLIENT_ID!,
    client_secret: NAVER_CLIENT_SECRET!,
    code: code,
    state: state
  });

  const response = await fetch(`${tokenUrl}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [NAVER] 토큰 교환 실패:', errorText);
    throw new Error(`네이버 토큰 교환 실패: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error('❌ [NAVER] 토큰 교환 에러:', data);
    throw new Error(`네이버 토큰 교환 에러: ${data.error_description}`);
  }

  return data;
}

async function getNaverUserInfo(accessToken: string): Promise<NaverUserInfo> {
  const userInfoUrl = 'https://openapi.naver.com/v1/nid/me';

  const response = await fetch(userInfoUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [NAVER] 사용자 정보 조회 실패:', errorText);
    throw new Error(`네이버 사용자 정보 조회 실패: ${response.status}`);
  }

  const data = await response.json();

  if (data.resultcode !== '00') {
    console.error('❌ [NAVER] 사용자 정보 조회 에러:', data);
    throw new Error(`네이버 사용자 정보 조회 에러: ${data.message}`);
  }

  return data;
}

async function getEmailDomainPolicy(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();

  const { data: policy } = await supabaseAdmin
    .from('social_auth_policies')
    .select('*')
    .eq('email_domain', domain)
    .eq('is_active', true)
    .single();

  // 기본 정책 (가장 제한적)
  return policy || {
    auto_approve: false,
    default_permission_level: 1,
    default_department: null,
    require_admin_approval: true
  };
}

export async function POST(request: NextRequest) {
  // 2026-07-25: 소셜 로그인 기능 비활성화 (현재 프론트엔드 어디에서도 사용하지 않음 - 로그인/가입 페이지에 진입 버튼 없음). 아래 원래 로직은 재활성화 시 참고용으로 남겨둔다.
  return NextResponse.json(
    { success: false, error: { code: 'FEATURE_DISABLED', message: '소셜 로그인 기능은 현재 비활성화되어 있습니다.' } },
    { status: 503 }
  );

  try {
    const body = await request.json();
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 입력 검증
    const validation = validateInput(ValidationSchemas.socialToken, body.code);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: validation.errors?.[0] || '유효하지 않은 입력입니다.'
        }
      }, { status: 400 });
    }

    const { code, state } = body;

    if (!state) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'STATE_REQUIRED',
          message: '네이버 로그인에는 state 파라미터가 필요합니다.'
        }
      }, { status: 400 });
    }

    console.log('🔐 [NAVER] 로그인 시작:', {
      code: code.substring(0, 10) + '...',
      state: state.substring(0, 10) + '...'
    });

    // 1. 네이버에서 액세스 토큰 교환
    const tokenData = await exchangeCodeForToken(code, state);
    console.log('✅ [NAVER] 토큰 교환 성공');

    // 2. 네이버 사용자 정보 조회
    const naverUser = await getNaverUserInfo(tokenData.access_token);
    console.log('✅ [NAVER] 사용자 정보 조회 성공:', {
      id: naverUser.response.id,
      name: naverUser.response.name,
      email: naverUser.response.email
    });

    const userInfo = naverUser.response;
    const email = userInfo.email;
    const name = userInfo.name || userInfo.nickname || '네이버 사용자';
    const profileImage = userInfo.profile_image;

    // 3. 이메일 도메인 정책 확인
    const policy = await getEmailDomainPolicy(email);
    console.log('📋 [NAVER] 도메인 정책:', { email, policy });

    // 4. 기존 소셜 계정 확인
    const { data: existingSocialAccount } = await supabaseAdmin
      .from('social_accounts')
      .select(`
        *,
        employees:employee_id (
          id, name, email, permission_level, is_active, is_deleted
        )
      `)
      .eq('provider', 'naver')
      .eq('provider_user_id', userInfo.id)
      .eq('is_active', true)
      .single();

    // 5. 기존 계정이 있는 경우 - 로그인 처리
    if (existingSocialAccount?.employees) {
      const employee = existingSocialAccount.employees as any;

      if (!employee.is_active || employee.is_deleted) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: '비활성화된 계정입니다. 관리자에게 문의하세요.'
          }
        }, { status: 403 });
      }

      // 로그인 시도 기록
      await supabaseAdmin.rpc('record_login_attempt', {
        p_email: email,
        p_provider: 'naver',
        p_ip_address: ip,
        p_user_agent: userAgent,
        p_success: true,
        p_employee_id: employee.id
      });

      // 소셜 계정 정보 업데이트
      await supabaseAdmin
        .from('social_accounts')
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          last_login_at: new Date().toISOString(),
          provider_email: email,
          provider_name: name,
          provider_picture_url: profileImage
        })
        .eq('id', existingSocialAccount.id);

      // JWT 토큰 생성
      const jwtToken = generateToken({
        id: employee.id,
        email: employee.email,
        name: employee.name,
        permission_level: employee.permission_level
      });

      console.log('✅ [NAVER] 기존 사용자 로그인 성공:', employee.email);

      return NextResponse.json({
        success: true,
        data: {
          token: jwtToken,
          user: {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            permission_level: employee.permission_level
          },
          isNewUser: false
        }
      });
    }

    // 6. 신규 사용자 처리
    if (policy.auto_approve) {
      // 자동 승인된 도메인 - 직원 계정 생성
      const employeeId = crypto.randomUUID();

      // 직원 계정 생성
      const { data: newEmployee, error: employeeError } = await supabaseAdmin
        .from('employees')
        .insert({
          id: employeeId,
          employee_id: `NAVER_${Date.now()}`, // 임시 사번
          name: name,
          email: email,
          permission_level: policy.default_permission_level,
          department: policy.default_department,
          position: '소셜 로그인 사용자',
          is_active: true,
          social_login_enabled: true,
          created_by_social: true
        })
        .select()
        .single();

      if (employeeError || !newEmployee) {
        console.error('❌ [NAVER] 직원 계정 생성 실패:', employeeError);
        return NextResponse.json({
          success: false,
          error: {
            code: 'ACCOUNT_CREATION_FAILED',
            message: '계정 생성에 실패했습니다.'
          }
        }, { status: 500 });
      }

      // 소셜 계정 연결
      await supabaseAdmin
        .from('social_accounts')
        .insert({
          employee_id: employeeId,
          provider: 'naver',
          provider_user_id: userInfo.id,
          provider_email: email,
          provider_name: name,
          provider_picture_url: profileImage,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          is_primary: true,
          connected_at: new Date().toISOString(),
          last_login_at: new Date().toISOString()
        });

      // 로그인 시도 기록
      await supabaseAdmin.rpc('record_login_attempt', {
        p_email: email,
        p_provider: 'naver',
        p_ip_address: ip,
        p_user_agent: userAgent,
        p_success: true,
        p_employee_id: employeeId
      });

      // JWT 토큰 생성
      const jwtToken = generateToken({
        id: newEmployee.id,
        email: newEmployee.email,
        name: newEmployee.name,
        permission_level: newEmployee.permission_level
      });

      console.log('✅ [NAVER] 신규 사용자 자동 승인 완료:', email);

      return NextResponse.json({
        success: true,
        data: {
          token: jwtToken,
          user: {
            id: newEmployee.id,
            name: newEmployee.name,
            email: newEmployee.email,
            permission_level: newEmployee.permission_level
          },
          isNewUser: true
        }
      });

    } else {
      // 수동 승인 필요 - 승인 요청 생성
      const { data: approvalRequest, error: approvalError } = await supabaseAdmin
        .from('social_auth_approvals')
        .insert({
          requester_name: name,
          requester_email: email,
          provider: 'naver',
          provider_user_id: userInfo.id,
          requested_permission_level: policy.default_permission_level,
          requested_department: policy.default_department,
          approval_status: 'pending'
        })
        .select()
        .single();

      if (approvalError) {
        console.error('❌ [NAVER] 승인 요청 생성 실패:', approvalError);
        return NextResponse.json({
          success: false,
          error: {
            code: 'APPROVAL_REQUEST_FAILED',
            message: '승인 요청 생성에 실패했습니다.'
          }
        }, { status: 500 });
      }

      // 로그인 시도 기록 (승인 대기)
      await supabaseAdmin.rpc('record_login_attempt', {
        p_email: email,
        p_provider: 'naver',
        p_ip_address: ip,
        p_user_agent: userAgent,
        p_success: false,
        p_failure_reason: 'APPROVAL_PENDING'
      });

      console.log('⏳ [NAVER] 승인 요청 생성 완료:', email);

      return NextResponse.json({
        success: false,
        error: {
          code: 'APPROVAL_PENDING',
          message: '계정 승인이 필요합니다. 관리자 승인 후 다시 로그인해주세요.',
          details: {
            requestId: approvalRequest.id,
            estimatedProcessingTime: '1-2 영업일'
          }
        }
      }, { status: 202 }); // 202 Accepted
    }

  } catch (error) {
    console.error('❌ [NAVER] 로그인 오류:', error);

    // 로그인 시도 기록 (실패)
    try {
      const ip = request.ip || 'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      await supabaseAdmin.rpc('record_login_attempt', {
        p_email: null,
        p_provider: 'naver',
        p_ip_address: ip,
        p_user_agent: userAgent,
        p_success: false,
        p_failure_reason: 'SYSTEM_ERROR'
      });
    } catch (logError) {
      console.error('로그인 시도 기록 실패:', logError);
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'NAVER_LOGIN_ERROR',
        message: '네이버 로그인 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error)
      }
    }, { status: 500 });
  }
}