import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// 업무 관리에 필요한 메타데이터 조회 (카테고리, 상태, 직원 목록)
export async function GET(request: NextRequest) {
  try {
    console.log('🟡 [TASK-METADATA] API 시작');

    // JWT 토큰 검증
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('auth-token')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json(
        { success: false, message: '인증 토큰이 필요합니다.' },
        { status: 401 }
      );
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET) as any;
    } catch (jwtError) {
      return NextResponse.json(
        { success: false, message: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    // ✅ FIX: JWT 토큰의 permission_level 필드명 통일 (스네이크 케이스)
    const userPermissionLevel = decodedToken.permission_level || decodedToken.permissionLevel || 1;

    // 병렬로 모든 메타데이터 조회
    const [
      categoriesResult,
      statusesResult,
      employeesResult
    ] = await Promise.all([
      // 업무 카테고리 조회
      supabaseAdmin
        .from('task_categories')
        .select('id, name, description, color, icon, min_permission_level')
        .eq('is_active', true)
        .lte('min_permission_level', userPermissionLevel)
        .order('sort_order'),

      // 업무 상태 조회
      supabaseAdmin
        .from('task_statuses')
        .select('id, name, description, color, icon, status_type, required_permission_level, is_final')
        .eq('is_active', true)
        .order('sort_order'),

      // 직원 목록 조회 (담당자 지정용)
      supabaseAdmin
        .from('employees')
        .select('id, name, email, department, position, permission_level')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name')
    ]);

    // 에러 처리
    if (categoriesResult.error) {
      console.error('카테고리 조회 오류:', categoriesResult.error);
      return NextResponse.json(
        { success: false, message: '카테고리 정보를 가져올 수 없습니다.' },
        { status: 500 }
      );
    }

    if (statusesResult.error) {
      console.error('상태 조회 오류:', statusesResult.error);
      return NextResponse.json(
        { success: false, message: '상태 정보를 가져올 수 없습니다.' },
        { status: 500 }
      );
    }

    if (employeesResult.error) {
      console.error('직원 조회 오류:', employeesResult.error);
      return NextResponse.json(
        { success: false, message: '직원 정보를 가져올 수 없습니다.' },
        { status: 500 }
      );
    }

    // 권한에 따른 직원 목록 필터링
    let availableEmployees = employeesResult.data || [];

    if (userPermissionLevel === 1 || userPermissionLevel === 2) {
      // 일반 사용자 및 매니저: 현재는 모든 직원 (추후 팀/부서별 필터링 가능)
      // 필요시 부서별 필터링 로직 추가
    }
    // 관리자(레벨 3)는 모든 직원에게 할당 가능

    // 상태별 분류
    const statusesByType = {
      pending: statusesResult.data?.filter(s => s.status_type === 'pending') || [],
      active: statusesResult.data?.filter(s => s.status_type === 'active') || [],
      completed: statusesResult.data?.filter(s => s.status_type === 'completed') || [],
      cancelled: statusesResult.data?.filter(s => s.status_type === 'cancelled') || [],
      on_hold: statusesResult.data?.filter(s => s.status_type === 'on_hold') || []
    };

    // 우선순위 정보
    const priorities = [
      { value: 1, label: '낮음', color: '#10B981', icon: 'arrow-down' },
      { value: 2, label: '보통', color: '#3B82F6', icon: 'minus' },
      { value: 3, label: '높음', color: '#F59E0B', icon: 'arrow-up' },
      { value: 4, label: '긴급', color: '#EF4444', icon: 'alert-triangle' }
    ];

    console.log('✅ [TASK-METADATA] 조회 성공:', {
      categories: categoriesResult.data?.length || 0,
      statuses: statusesResult.data?.length || 0,
      employees: availableEmployees.length,
      userPermissionLevel
    });

    return NextResponse.json({
      success: true,
      data: {
        categories: categoriesResult.data || [],
        statuses: statusesResult.data || [],
        statusesByType,
        employees: availableEmployees,
        priorities,
        userInfo: {
          id: decodedToken.userId || decodedToken.id,
          email: decodedToken.email,
          name: decodedToken.name,
          permissionLevel: userPermissionLevel
        }
      }
    });

  } catch (error) {
    console.error('업무 메타데이터 API 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}