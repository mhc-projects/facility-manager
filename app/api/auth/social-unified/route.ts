// app/api/auth/social-unified/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createToken } from '@/utils/auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


interface SocialUserInfo {
  provider: 'google' | 'kakao' | 'naver';
  social_id: string;
  email: string;
  name: string;
  profile_image?: string;
  verified_email?: boolean;
}

export async function POST(request: NextRequest) {
  // 2026-07-16 임시 차단: 이 라우트는 OAuth 토큰 검증 없이 클라이언트가 보낸 email만으로
  // 기존 계정(관리자 포함)의 정상 JWT를 발급해줘서 완전한 인증 우회가 가능했다
  // (claudedocs/api-auth-gap-critical-findings.md 참고). 실제 소셜 로그인은 별도의
  // /api/auth/social/{provider}(+/callback) 경로가 client_secret 기반 OAuth 코드교환으로
  // 정상 처리하며, 이 라우트를 호출하는 프론트엔드 코드는 현재 없음(확인됨) — 지금 막아도
  // 사용자에게 영향 없음. 나중에 재사용하려면 실제 OAuth 액세스 토큰을 provider에 검증받는
  // 로직을 추가한 뒤에만 이 차단을 해제할 것.
  return NextResponse.json(
    { success: false, error: '현재 사용할 수 없는 로그인 방식입니다.' },
    { status: 503 }
  );

  // eslint-disable-next-line no-unreachable
  try {
    const socialUser: SocialUserInfo = await request.json();

    console.log('🔐 [SOCIAL_AUTH] 소셜 로그인 시도:', {
      provider: socialUser.provider,
      email: socialUser.email,
      name: socialUser.name
    });

    // 입력 검증
    if (!socialUser.provider || !socialUser.social_id || !socialUser.email || !socialUser.name) {
      return NextResponse.json(
        { success: false, error: '필수 소셜 로그인 정보가 부족합니다.' },
        { status: 400 }
      );
    }

    // 기존 사용자 찾기 (소셜 ID 또는 이메일로)
    const { data: existingUser, error: findError } = await supabaseAdmin
      .from('employees')
      .select(`
        *,
        department:departments(id, name)
      `)
      .or(`and(social_provider.eq.${socialUser.provider},social_id.eq.${socialUser.social_id}),email.eq.${socialUser.email}`)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .single();

    let user;

    if (existingUser) {
      // 기존 사용자 - 소셜 정보 업데이트
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('employees')
        .update({
          social_provider: socialUser.provider,
          social_id: socialUser.social_id,
          social_email: socialUser.email,
          profile_image_url: socialUser.profile_image,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUser.id)
        .select(`
          *,
          department:departments(id, name)
        `)
        .single();

      if (updateError) throw updateError;
      user = updatedUser;

      console.log('✅ [SOCIAL_AUTH] 기존 사용자 로그인:', {
        id: user.id,
        name: user.name,
        email: user.email,
        provider: socialUser.provider
      });

    } else {
      // 신규 사용자 - 승인 대기 상태로 생성
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('employees')
        .insert({
          name: socialUser.name,
          email: socialUser.email,
          social_provider: socialUser.provider,
          social_id: socialUser.social_id,
          social_email: socialUser.email,
          profile_image_url: socialUser.profile_image,
          permission_level: 1, // 기본 권한
          role: 'staff',
          is_active: false, // 관리자 승인 필요
          created_at: new Date().toISOString()
        })
        .select(`
          *,
          department:departments(id, name)
        `)
        .single();

      if (createError) {
        console.error('❌ [SOCIAL_AUTH] 신규 사용자 생성 실패:', createError);
        throw createError;
      }

      console.log('👤 [SOCIAL_AUTH] 신규 사용자 생성 - 승인 대기:', {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        provider: socialUser.provider
      });

      // 관리자에게 승인 알림 발송
      await sendAdminApprovalNotification(newUser);

      return NextResponse.json({
        success: false,
        pending_approval: true,
        message: '계정 승인을 기다리고 있습니다. 관리자에게 문의해주세요.',
        user_info: {
          name: newUser.name,
          email: newUser.email,
          provider: socialUser.provider
        }
      });
    }

    // JWT 토큰 생성
    const token = createToken({
      userId: user.id,
      email: user.email,
      permissionLevel: user.permission_level,
      name: user.name,
      role: user.role,
      department: user.department?.name,
      departmentId: user.department_id
    });

    // 안전한 사용자 정보 반환 (민감한 정보 제외)
    const { password_hash, social_id, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: safeUser,
        permissions: {
          canViewAllTasks: user.permission_level >= 1,
          canCreateTasks: true,
          canEditTasks: true,
          canDeleteTasks: user.permission_level >= 1,
          canViewReports: true,
          canApproveReports: user.permission_level >= 1,
          canAccessAdminPages: user.permission_level >= 3,
          canManageDepartments: user.permission_level >= 3,
          canViewSensitiveData: user.permission_level >= 3
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [SOCIAL_AUTH] 로그인 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: '소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}

// 관리자 승인 알림 발송 함수
async function sendAdminApprovalNotification(newUser: any) {
  try {
    // 관리자들 조회
    const { data: admins } = await supabaseAdmin
      .from('employees')
      .select('id, name, email')
      .eq('permission_level', 3)
      .eq('is_active', true);

    if (admins && admins.length > 0) {
      // 향후 Phase 3에서 구현될 알림 시스템을 위한 준비
      console.log('📧 [SOCIAL_AUTH] 관리자 승인 알림 필요:', {
        newUser: {
          name: newUser.name,
          email: newUser.email,
          provider: newUser.social_provider
        },
        admins: admins.map(admin => ({ name: admin.name, email: admin.email }))
      });

      // 임시로 콘솔에 출력 (Phase 3에서 실제 알림 시스템으로 교체)
      console.log(`🔔 신규 사용자 승인 요청: ${newUser.name}(${newUser.email}) - ${newUser.social_provider} 로그인`);
    }
  } catch (error) {
    console.error('❌ [SOCIAL_AUTH] 승인 알림 발송 실패:', error);
    // 알림 실패가 로그인을 막지 않도록 에러를 던지지 않음
  }
}