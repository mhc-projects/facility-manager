// API endpoint for RLS debugging
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 인증 및 관리자 권한 확인
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
  }
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) {
    return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다.' }, { status: 401 });
  }
  const permissionLevel = decoded.permissionLevel || decoded.permission_level || 0;
  if (permissionLevel < 3) {
    return NextResponse.json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  try {
    const { table } = await request.json();

    if (table !== 'task_notifications') {
      return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    }

    console.log(`🔍 [DEBUG] RLS status check for: ${table}`);

    // RLS 상태 확인
    const { data: rlsStatus, error: rlsError } = await supabaseAdmin
      .rpc('check_rls_status', { table_name: table });

    if (rlsError) {
      console.warn('⚠️ [DEBUG] RLS RPC function not available, using direct query');

      // 직접 시스템 테이블 쿼리
      try {
        const { data: tableInfo, error: tableError } = await supabaseAdmin
          .from('pg_class')
          .select('relname, relrowsecurity')
          .eq('relname', table)
          .single();

        if (tableError) {
          return NextResponse.json({
            error: 'Cannot access system tables',
            table_error: tableError.message,
            suggestion: 'RLS status cannot be determined'
          });
        }

        // 정책 확인
        const { data: policies, error: policiesError } = await supabaseAdmin
          .from('pg_policies')
          .select('*')
          .eq('tablename', table);

        return NextResponse.json({
          table_exists: true,
          rls_enabled: tableInfo?.relrowsecurity || false,
          policies: policies || [],
          policies_count: policies?.length || 0,
          method: 'direct_query'
        });

      } catch (directError: any) {
        // 마지막 시도: 단순 데이터 접근 테스트
        const { data: testData, error: testError } = await supabaseAdmin
          .from(table)
          .select('count(*)')
          .single();

        return NextResponse.json({
          table_accessible: !testError,
          access_method: 'service_role',
          test_error: testError?.message || null,
          rls_likely_blocking: testError?.message?.includes('policy') || false
        });
      }
    }

    return NextResponse.json({
      rls_status: rlsStatus,
      method: 'rpc_function'
    });

  } catch (error: any) {
    console.error('❌ [DEBUG] RLS status error:', error);

    // 최종 시도: 직접 데이터 조회로 접근성 테스트
    try {
      const { data: directTest, error: directError } = await supabaseAdmin
        .from('task_notifications')
        .select('id')
        .limit(1);

      return NextResponse.json({
        error: error.message,
        direct_access_test: {
          success: !directError,
          error: directError?.message || null,
          data_count: directTest?.length || 0
        },
        service_role_access: 'tested'
      }, { status: 200 }); // 200으로 반환해서 결과를 볼 수 있도록

    } catch (finalError: any) {
      return NextResponse.json({
        error: error.message,
        final_error: finalError.message,
        status: 'complete_failure'
      }, { status: 500 });
    }
  }
}
