import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/utils/auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// GET /api/employees - 직원 목록 조회
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다' }, { status: 401 });
    }

    const authResult = verifyToken(token);
    if (!authResult) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const department = searchParams.get('department') || '';
    const permissionLevel = searchParams.get('permissionLevel') || '';

    const offset = (page - 1) * limit;

    // 기본 쿼리
    let query = supabaseAdmin
      .from('employees')
      .select('id, employee_id, name, email, permission_level, department, team, position, phone, mobile, is_active, created_at', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    // 필터 적용
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,employee_id.ilike.%${search}%`);
    }

    if (department) {
      query = query.eq('department', department);
    }

    if (permissionLevel) {
      query = query.eq('permission_level', parseInt(permissionLevel));
    }

    // 페이지네이션 적용
    query = query.range(offset, offset + limit - 1);

    const { data: employees, error, count } = await query;

    if (error) {
      console.error('❌ [EMPLOYEES] 조회 오류:', error);
      return NextResponse.json(
        { success: false, error: { code: 'FETCH_ERROR', message: '직원 목록 조회 중 오류가 발생했습니다.' } },
        { status: 500 }
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);

    console.log(`✅ [EMPLOYEES] 조회 성공: ${employees?.length}명 (${page}/${totalPages})`);

    return NextResponse.json({
      success: true,
      data: employees,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count || 0,
        itemsPerPage: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [EMPLOYEES] GET 오류:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    );
  }
}

// POST /api/employees - 새 직원 등록
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('cookie')?.match(/auth-token=([^;]+)/)?.[1];

    if (!token) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다' }, { status: 401 });
    }

    const authResult = await verifyToken(token);
    if (!authResult.success) {
      return NextResponse.json(authResult, { status: 401 });
    }

    // 관리자 권한 확인
    if (authResult.data?.user.permission_level < 3) {
      return NextResponse.json(
        { success: false, error: { code: 'INSUFFICIENT_PERMISSION', message: '직원 등록 권한이 없습니다.' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      employeeId,
      name,
      email,
      password,
      permissionLevel,
      department,
      team,
      position,
      phone,
      mobile
    } = body;

    // 필수 필드 검증
    if (!employeeId || !name || !email || !password || !permissionLevel) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: '필수 필드를 모두 입력해주세요.' } },
        { status: 400 }
      );
    }

    // 이메일 중복 확인
    const { data: existingEmail } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('email', email)
      .single();

    if (existingEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_EXISTS', message: '이미 사용 중인 이메일입니다.' } },
        { status: 400 }
      );
    }

    // 사번 중복 확인
    const { data: existingEmployeeId } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('employee_id', employeeId)
      .single();

    if (existingEmployeeId) {
      return NextResponse.json(
        { success: false, error: { code: 'EMPLOYEE_ID_EXISTS', message: '이미 사용 중인 사번입니다.' } },
        { status: 400 }
      );
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(password, 10);

    // 직원 등록
    const { data: newEmployee, error: insertError } = await supabaseAdmin
      .from('employees')
      .insert({
        employee_id: employeeId,
        name,
        email,
        password_hash: passwordHash,
        permission_level: permissionLevel,
        department,
        team,
        position,
        phone,
        mobile
      })
      .select('id, employee_id, name, email, permission_level, department, team, position, phone, mobile, is_active, created_at')
      .single();

    if (insertError) {
      console.error('❌ [EMPLOYEES] 등록 오류:', insertError);
      return NextResponse.json(
        { success: false, error: { code: 'INSERT_ERROR', message: '직원 등록 중 오류가 발생했습니다.' } },
        { status: 500 }
      );
    }

    console.log('✅ [EMPLOYEES] 등록 성공:', { name, email, employeeId });

    return NextResponse.json({
      success: true,
      data: newEmployee,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [EMPLOYEES] POST 오류:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' } },
      { status: 500 }
    );
  }
}