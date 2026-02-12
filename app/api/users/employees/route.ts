// app/api/users/employees/route.ts - 직원 목록 조회 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// Employee 인터페이스 정의 (담당자 선택용)
export interface EmployeeForAssignment {
  id: string;
  name: string;
  email: string;
  employee_id: string;
  department?: string;
  position?: string;
  is_active: boolean;
  permission_level: number;
  last_login_at?: string;
}

// GET: 활성 직원 목록 조회 (담당자 선택용)
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search'); // 검색어
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const department = searchParams.get('department');
    const limit = parseInt(searchParams.get('limit') || '50');

    console.log('👥 [EMPLOYEES-API] 직원 목록 조회:', { search, includeInactive, department, limit });

    // Direct PostgreSQL 쿼리 구성
    let conditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // 활성 직원만 조회 (기본값)
    if (!includeInactive) {
      conditions.push(`is_active = $${paramIndex}`);
      params.push(true);
      paramIndex++;
    }

    // 부서별 필터링
    if (department && department !== 'all') {
      conditions.push(`department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }

    // 검색 기능 (이름, 이메일, 직원번호, 부서, 직급으로 검색)
    if (search && search.trim().length >= 2) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(`(
        name ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex + 1} OR
        employee_id ILIKE $${paramIndex + 2} OR
        department ILIKE $${paramIndex + 3} OR
        position ILIKE $${paramIndex + 4}
      )`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      paramIndex += 5;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = limit > 0 ? `LIMIT $${paramIndex}` : '';
    if (limit > 0) {
      params.push(limit);
    }

    const queryText = `
      SELECT
        id,
        name,
        email,
        employee_id,
        department,
        position,
        is_active,
        permission_level,
        last_login_at,
        created_at
      FROM employees
      ${whereClause}
      ORDER BY name ASC
      ${limitClause}
    `;

    const employees = await queryAll(queryText, params);

    // 담당자 선택용 형태로 변환
    const employeesForAssignment: EmployeeForAssignment[] = (employees || []).map(emp => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      employee_id: emp.employee_id,
      department: emp.department || undefined,
      position: emp.position || undefined,
      is_active: emp.is_active,
      permission_level: emp.permission_level,
      last_login_at: emp.last_login_at || undefined
    }));

    // 통계 정보 추가
    const totalCount = employees?.length || 0;
    const activeCount = employeesForAssignment.filter(emp => emp.is_active).length;
    const departmentStats = employeesForAssignment.reduce((acc, emp) => {
      const dept = emp.department || '미지정';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('✅ [EMPLOYEES-API] 조회 성공:', {
      totalCount,
      activeCount,
      searchTerm: search || 'none',
      departments: Object.keys(departmentStats).length
    });

    return createSuccessResponse({
      employees: employeesForAssignment,
      metadata: {
        totalCount,
        activeCount,
        searchTerm: search || null,
        departmentFilter: department || null,
        departmentStats,
        hasMore: totalCount >= limit
      }
    });

  } catch (error: any) {
    console.error('🔴 [EMPLOYEES-API] GET 오류:', error?.message || error);
    return createErrorResponse('직원 목록 조회 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// POST: 새로운 직원 등록 (관리자 전용)
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const {
      name,
      email,
      employee_id,
      department,
      position,
      permission_level = 1
    } = body;

    console.log('👤 [EMPLOYEES-API] 새 직원 등록:', { name, email, employee_id, department });

    // 필수 필드 검증
    if (!name || !email || !employee_id) {
      return createErrorResponse('이름, 이메일, 직원번호는 필수입니다', 400);
    }

    // 이메일 중복 검사 - Direct PostgreSQL
    const existingEmployee = await queryOne(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existingEmployee) {
      return createErrorResponse('이미 등록된 이메일입니다', 409);
    }

    // 직원번호 중복 검사 - Direct PostgreSQL
    const existingEmployeeId = await queryOne(
      `SELECT id FROM employees WHERE employee_id = $1 LIMIT 1`,
      [employee_id]
    );

    if (existingEmployeeId) {
      return createErrorResponse('이미 등록된 직원번호입니다', 409);
    }

    // 새 직원 등록 - Direct PostgreSQL
    const newEmployee = await queryOne(
      `INSERT INTO employees (
        name, email, employee_id, department, position,
        permission_level, is_active, is_deleted
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        name,
        email,
        employee_id,
        department || null,
        position || null,
        permission_level,
        true,
        false
      ]
    );

    if (!newEmployee) {
      console.error('🔴 [EMPLOYEES-API] 등록 실패');
      throw new Error('직원 등록 실패');
    }

    console.log('✅ [EMPLOYEES-API] 등록 성공:', newEmployee.id);

    return createSuccessResponse({
      employee: newEmployee,
      message: '새 직원이 성공적으로 등록되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [EMPLOYEES-API] POST 오류:', error?.message || error);
    return createErrorResponse('직원 등록 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// PUT: 직원 정보 수정
export const PUT = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const {
      id,
      name,
      email,
      employee_id,
      department,
      position,
      is_active
    } = body;

    console.log('📝 [EMPLOYEES-API] 직원 정보 수정:', { id, name, email });

    if (!id) {
      return createErrorResponse('직원 ID는 필수입니다', 400);
    }

    // 업데이트할 필드 동적 구성 - Direct PostgreSQL
    const updateFields: string[] = ['updated_at = $1'];
    const params: any[] = [new Date().toISOString()];
    let paramIndex = 2;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }
    if (employee_id !== undefined) {
      updateFields.push(`employee_id = $${paramIndex}`);
      params.push(employee_id);
      paramIndex++;
    }
    if (department !== undefined) {
      updateFields.push(`department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }
    if (position !== undefined) {
      updateFields.push(`position = $${paramIndex}`);
      params.push(position);
      paramIndex++;
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }

    // WHERE 조건용 파라미터 추가
    params.push(id);
    params.push(false);

    const updatedEmployee = await queryOne(
      `UPDATE employees
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND is_deleted = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (!updatedEmployee) {
      return createErrorResponse('직원을 찾을 수 없습니다', 404);
    }

    console.log('✅ [EMPLOYEES-API] 수정 성공:', updatedEmployee.id);

    return createSuccessResponse({
      employee: updatedEmployee,
      message: '직원 정보가 성공적으로 수정되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [EMPLOYEES-API] PUT 오류:', error?.message || error);
    return createErrorResponse('직원 정보 수정 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });