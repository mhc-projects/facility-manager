import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { UserService } from '@/lib/user-service';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';


export async function GET() {
  try {
    console.log('🔍 [TEST-DB] 데이터베이스 연결 테스트 시작');

    // Supabase 연결 테스트
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 기본 연결 테스트
    const { data: connectionTest, error: connectionError } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (connectionError) {
      console.error('❌ [TEST-DB] Supabase 연결 실패:', connectionError);
      return NextResponse.json({
        success: false,
        error: 'Supabase 연결 실패',
        details: connectionError.message
      });
    }

    console.log('✅ [TEST-DB] Supabase 연결 성공');

    // 관리자 사용자 존재 확인
    const adminUser = await UserService.findByEmail('admin@facility.blueon-iot.com');

    // 전체 사용자 수 확인
    const allUsers = await UserService.getAllUsers();

    console.log('📊 [TEST-DB] 데이터베이스 상태:', {
      adminExists: !!adminUser,
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.is_active).length
    });

    return NextResponse.json({
      success: true,
      connection: true,
      admin_user_exists: !!adminUser,
      admin_user_details: adminUser ? {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
        is_active: adminUser.is_active
      } : null,
      total_users: allUsers.length,
      active_users: allUsers.filter(u => u.is_active).length,
      users_summary: allUsers.map(u => ({
        email: u.email,
        name: u.name,
        role: u.role,
        is_active: u.is_active
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [TEST-DB] 데이터베이스 테스트 오류:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
      timestamp: new Date().toISOString()
    });
  }
}