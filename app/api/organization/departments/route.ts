import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenHybrid } from '@/lib/secure-jwt';

// 사용자 권한 확인 헬퍼
async function checkUserPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, user: null };
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const result = await verifyTokenHybrid(token);

    if (!result.user) {
      return { authorized: false, user: null };
    }

    return {
      authorized: true,
      user: result.user
    };
  } catch (error) {
    console.error('❌ [DEPARTMENTS] 권한 확인 오류:', error);
    return { authorized: false, user: null };
  }
}

// GET: 부서 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';

    // 부서 목록 조회 - Direct PostgreSQL
    const departments = await queryAll(
      'SELECT * FROM departments ORDER BY id ASC',
      []
    );

    if (!departments) {
      console.error('부서 조회 오류');
      return NextResponse.json({ error: '부서 목록을 불러올 수 없습니다.' }, { status: 500 });
    }

    // 각 부서에 대한 팀 정보 조회
    const departmentsWithTeams = await Promise.all(
      departments.map(async (dept) => {
        const teams = await queryAll(
          'SELECT id, name, description, department_id FROM teams WHERE department_id = $1 ORDER BY id ASC',
          [dept.id]
        );
        return {
          ...dept,
          teams: teams || []
        };
      })
    );

    return NextResponse.json(
      {
        success: true,
        data: departmentsWithTeams
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );

  } catch (error) {
    console.error('부서 목록 조회 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 부서 생성
export async function POST(request: NextRequest) {
  try {
    // 권한 확인
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user || user.permission_level < 3) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: '부서명은 필수입니다.' }, { status: 400 });
    }

    // 중복 체크 - Direct PostgreSQL
    const existing = await queryOne(
      'SELECT id FROM departments WHERE name = $1 LIMIT 1',
      [name]
    );

    if (existing) {
      return NextResponse.json({ error: '이미 존재하는 부서명입니다.' }, { status: 409 });
    }

    // 부서 생성 - Direct PostgreSQL
    const newDepartment = await queryOne(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING *`,
      [name, description || null]
    );

    if (!newDepartment) {
      console.error('부서 생성 오류');
      return NextResponse.json({ error: '부서를 생성할 수 없습니다.' }, { status: 500 });
    }

    // 변경 히스토리 기록 - Direct PostgreSQL
    try {
      await pgQuery(
        `INSERT INTO organization_changes (change_type, entity_type, entity_id, new_data, changed_by, impact_summary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['create', 'department', newDepartment.id, JSON.stringify(newDepartment), user.id, '새 부서 생성']
      );
    } catch (historyError) {
      console.warn('⚠️ [DEPARTMENTS] 히스토리 기록 실패 (무시):', historyError);
    }

    return NextResponse.json({
      success: true,
      data: newDepartment,
      message: '부서가 성공적으로 생성되었습니다.'
    });

  } catch (error) {
    console.error('부서 생성 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PUT: 부서 수정
export async function PUT(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user || user.permission_level < 3) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, description, is_management_support } = body;

    if (!id || !name) {
      return NextResponse.json({ error: '부서 ID와 부서명은 필수입니다.' }, { status: 400 });
    }

    // is_management_support 설정은 권한 레벨 4만 가능
    if (is_management_support !== undefined && user.permission_level < 4) {
      return NextResponse.json({ error: '경영지원 역할 설정은 시스템 권한(레벨 4)만 가능합니다.' }, { status: 403 });
    }

    // 기존 데이터 조회 (히스토리용) - Direct PostgreSQL
    const oldData = await queryOne(
      'SELECT * FROM departments WHERE id = $1',
      [id]
    );

    if (!oldData) {
      return NextResponse.json({ error: '부서를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 중복 체크 (자기 자신 제외) - Direct PostgreSQL
    const existing = await queryOne(
      'SELECT id FROM departments WHERE name = $1 AND id != $2 LIMIT 1',
      [name, id]
    );

    if (existing) {
      return NextResponse.json({ error: '이미 존재하는 부서명입니다.' }, { status: 409 });
    }

    // is_management_support 변경 시 기존 플래그 부서 해제 (1개만 유지)
    if (is_management_support === true) {
      await queryOne(
        `UPDATE departments SET is_management_support = FALSE WHERE is_management_support = TRUE AND id != $1`,
        [id]
      );
    }

    // 부서 수정 - Direct PostgreSQL
    const mgmtFlag = is_management_support !== undefined ? is_management_support : oldData.is_management_support;
    const updatedDepartment = await queryOne(
      `UPDATE departments
       SET name = $1, description = $2, updated_at = $3, is_management_support = $4
       WHERE id = $5
       RETURNING *`,
      [
        name,
        description || null,
        new Date().toISOString(),
        mgmtFlag ?? false,
        id
      ]
    );

    if (!updatedDepartment) {
      console.error('부서 수정 오류');
      return NextResponse.json({ error: '부서를 수정할 수 없습니다.' }, { status: 500 });
    }

    // 변경 히스토리 기록 - Direct PostgreSQL
    try {
      await pgQuery(
        `INSERT INTO organization_changes (change_type, entity_type, entity_id, old_data, new_data, changed_by, impact_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['update', 'department', id, JSON.stringify(oldData), JSON.stringify(updatedDepartment), user.id, '부서 정보 수정']
      );
    } catch (historyError) {
      console.warn('⚠️ [DEPARTMENTS] 히스토리 기록 실패 (무시):', historyError);
    }

    return NextResponse.json({
      success: true,
      data: updatedDepartment,
      message: '부서가 성공적으로 수정되었습니다.'
    });

  } catch (error) {
    console.error('부서 수정 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 부서 삭제 (영향도 분석 포함)
export async function DELETE(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user || user.permission_level < 3) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const force = searchParams.get('force') === 'true';

    if (!id) {
      return NextResponse.json({ error: '부서 ID가 필요합니다.' }, { status: 400 });
    }

    // 영향도 분석 - Direct PostgreSQL
    const department = await queryOne(
      'SELECT * FROM departments WHERE id = $1',
      [id]
    );

    if (!department) {
      return NextResponse.json({ error: '부서를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 하위 팀 확인 - Direct PostgreSQL
    const teams = await queryAll(
      'SELECT id, name FROM teams WHERE department_id = $1',
      [id]
    );
    const teamCount = teams?.length || 0;

    // 관련 알림 확인 - Direct PostgreSQL
    const notificationCountResult = await queryOne(
      'SELECT COUNT(*) as count FROM notifications WHERE target_department_id = $1',
      [id]
    );
    const notificationCount = parseInt(notificationCountResult?.count || '0');

    const impact = {
      canDelete: teamCount === 0,
      affectedTeams: teamCount || 0,
      affectedNotifications: notificationCount || 0,
      teams: teams || []
    };

    // force가 아닌 경우 영향도만 반환
    if (!force) {
      return NextResponse.json({
        success: true,
        impact,
        message: impact.canDelete ? '삭제 가능합니다.' : '하위 팀이 있어 삭제할 수 없습니다.'
      });
    }

    // 강제 삭제 또는 안전한 삭제
    if (impact.affectedTeams > 0 && !force) {
      return NextResponse.json({
        error: '하위 팀이 있는 부서는 삭제할 수 없습니다.',
        impact
      }, { status: 409 });
    }

    // 트랜잭션으로 안전하게 삭제 - Direct PostgreSQL
    await pgQuery(
      `UPDATE departments
       SET is_active = false, updated_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), id]
    );

    // 하위 팀들도 비활성화 - Direct PostgreSQL
    if (impact.affectedTeams > 0) {
      await pgQuery(
        `UPDATE teams
         SET is_active = false, updated_at = $1
         WHERE department_id = $2`,
        [new Date().toISOString(), id]
      );
    }

    // 관련 알림들 처리 (다른 부서로 재할당 또는 전사 알림으로 변경) - Direct PostgreSQL
    if (impact.affectedNotifications > 0) {
      await pgQuery(
        `UPDATE notifications
         SET target_department_id = NULL,
             notification_tier = 'company',
             metadata = COALESCE(metadata, '{}')::jsonb || '{"migration_note": "부서 삭제로 인한 전사 알림 변경"}'::jsonb
         WHERE target_department_id = $1`,
        [id]
      );
    }

    // 변경 히스토리 기록 - Direct PostgreSQL
    try {
      await pgQuery(
        `INSERT INTO organization_changes (change_type, entity_type, entity_id, old_data, changed_by, impact_summary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'delete',
          'department',
          parseInt(id),
          JSON.stringify(department),
          user.id,
          `부서 삭제 - 팀 ${impact.affectedTeams}개, 알림 ${impact.affectedNotifications}개 영향`
        ]
      );
    } catch (historyError) {
      console.warn('⚠️ [DEPARTMENTS] 히스토리 기록 실패 (무시):', historyError);
    }

    return NextResponse.json({
      success: true,
      impact,
      message: '부서가 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('부서 삭제 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}