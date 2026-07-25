import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTokenHybrid } from '@/lib/secure-jwt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    console.error('❌ [MEMBERS] 권한 확인 오류:', error);
    return { authorized: false, user: null };
  }
}

// 조직 관리 권한 체크
async function canManageOrganization(userId: string, targetType: 'department' | 'team', targetId: string) {
  const { data: user } = await supabase
    .from('v_organization_full')
    .select('permission_level, org_management_scope, primary_department_id, primary_team_id')
    .eq('id', userId)
    .single();

  if (!user) return false;

  // 시스템 관리자는 모든 조직 관리 가능
  if (user.permission_level >= 3) return true;

  // 부서장은 자기 부서 내 팀 관리 가능
  if (targetType === 'team' && user.org_management_scope === 'department') {
    const { data: team } = await supabase
      .from('teams')
      .select('department_id')
      .eq('id', targetId)
      .single();

    return team?.department_id === user.primary_department_id;
  }

  // 팀장은 자기 팀 구성원만 관리 가능
  if (targetType === 'team' && user.org_management_scope === 'team') {
    return targetId === user.primary_team_id;
  }

  return false;
}

// GET: 조직별 구성원 조회
export async function GET(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('department_id');
    const teamId = searchParams.get('team_id');
    const includeAll = searchParams.get('include_all') === 'true';

    let query = supabase
      .from('v_organization_full')
      .select('*')
      .eq('is_active', true)
      .order('position_level', { ascending: false })
      .order('name', { ascending: true });

    if (departmentId && !includeAll) {
      query = query.eq('primary_department_id', departmentId);
    } else if (teamId && !includeAll) {
      query = query.eq('primary_team_id', teamId);
    }

    const { data: members, error } = await query;

    if (error) {
      console.error('구성원 조회 오류:', error);
      return NextResponse.json({ error: '구성원 목록을 불러올 수 없습니다.' }, { status: 500 });
    }

    // 다중 팀 소속자 필터링 (teamId가 있는 경우)
    let filteredMembers = members || [];
    if (teamId && !departmentId) {
      filteredMembers = members?.filter(member => {
        const teamMemberships = Array.isArray(member.team_memberships)
          ? member.team_memberships
          : [];
        return teamMemberships.some((membership: any) => membership.team_id === teamId);
      }) || [];
    }

    return NextResponse.json({
      success: true,
      data: filteredMembers,
      summary: {
        total_members: filteredMembers.length,
        by_position: filteredMembers.reduce((acc: any, member: any) => {
          const level = member.position_level || 1;
          acc[level] = (acc[level] || 0) + 1;
          return acc;
        }, {}),
        leadership_roles: filteredMembers.filter((member: any) => member.leadership_role).length
      }
    });

  } catch (error) {
    console.error('구성원 조회 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 구성원 조직 변경
export async function POST(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, employee_id, team_id, role_in_team, is_primary } = body;

    if (!action || !employee_id) {
      return NextResponse.json({ error: '필수 매개변수가 누락되었습니다.' }, { status: 400 });
    }

    // 권한 체크
    if (team_id && !await canManageOrganization(user.id, 'team', team_id)) {
      return NextResponse.json({ error: '해당 팀을 관리할 권한이 없습니다.' }, { status: 403 });
    }

    // 기존 정보 조회
    const { data: oldEmployeeData } = await supabase
      .from('v_organization_full')
      .select('*')
      .eq('id', employee_id)
      .single();

    let result;
    let changeType;
    let changeData: any = {};

    switch (action) {
      case 'assign_team':
        // 팀 배정
        const { data: newMembership, error: assignError } = await supabase
          .from('employee_team_memberships')
          .insert({
            employee_id,
            team_id,
            role_in_team: role_in_team || '팀원',
            is_primary: is_primary || false,
            created_by: user.id
          })
          .select('*')
          .single();

        if (assignError) {
          console.error('팀 배정 오류:', assignError);
          return NextResponse.json({ error: '팀 배정 중 오류가 발생했습니다.' }, { status: 500 });
        }

        result = newMembership;
        changeType = 'team_join';
        changeData = { to_team_id: team_id, role_in_team };
        break;

      case 'remove_team':
        // 팀 제거
        const { error: removeError } = await supabase
          .from('employee_team_memberships')
          .delete()
          .eq('employee_id', employee_id)
          .eq('team_id', team_id);

        if (removeError) {
          console.error('팀 제거 오류:', removeError);
          return NextResponse.json({ error: '팀 제거 중 오류가 발생했습니다.' }, { status: 500 });
        }

        changeType = 'team_leave';
        changeData = { from_team_id: team_id };
        break;

      case 'transfer_team':
        // 팀 이동
        const { from_team_id, to_team_id } = body;

        if (!from_team_id || !to_team_id) {
          return NextResponse.json({ error: '이동할 팀 정보가 필요합니다.' }, { status: 400 });
        }

        // 기존 팀 소속 제거
        await supabase
          .from('employee_team_memberships')
          .delete()
          .eq('employee_id', employee_id)
          .eq('team_id', from_team_id);

        // 새 팀 소속 추가
        const { data: transferResult, error: transferError } = await supabase
          .from('employee_team_memberships')
          .insert({
            employee_id,
            team_id: to_team_id,
            role_in_team: role_in_team || '팀원',
            is_primary: true,
            created_by: user.id
          })
          .select('*')
          .single();

        if (transferError) {
          console.error('팀 이동 오류:', transferError);
          return NextResponse.json({ error: '팀 이동 중 오류가 발생했습니다.' }, { status: 500 });
        }

        result = transferResult;
        changeType = 'transfer';
        changeData = { from_team_id, to_team_id, role_in_team };
        break;

      case 'promote':
        // 직급 승진
        const { new_position_level } = body;

        if (!new_position_level || new_position_level < 1 || new_position_level > 10) {
          return NextResponse.json({ error: '유효한 직급 레벨이 필요합니다.' }, { status: 400 });
        }

        const { data: promotionResult, error: promotionError } = await supabase
          .from('employees')
          .update({
            position_level: new_position_level,
            org_updated_at: new Date().toISOString()
          })
          .eq('id', employee_id)
          .select('*')
          .single();

        if (promotionError) {
          console.error('승진 처리 오류:', promotionError);
          return NextResponse.json({ error: '승진 처리 중 오류가 발생했습니다.' }, { status: 500 });
        }

        result = promotionResult;
        changeType = 'promotion';
        changeData = {
          old_position_level: oldEmployeeData?.position_level,
          new_position_level
        };
        break;

      default:
        return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
    }

    // 새 정보 조회
    const { data: newEmployeeData } = await supabase
      .from('v_organization_full')
      .select('*')
      .eq('id', employee_id)
      .single();

    // 조직 변경 히스토리 기록
    await supabase.from('organization_changes_detailed').insert({
      employee_id,
      change_type: changeType,
      old_data: oldEmployeeData,
      new_data: newEmployeeData,
      from_team_id: changeData.from_team_id || null,
      to_team_id: changeData.to_team_id || null,
      old_position_level: changeData.old_position_level || null,
      new_position_level: changeData.new_position_level || null,
      changed_by: user.id,
      reason: body.reason || `${action} 작업 수행`
    });

    return NextResponse.json({
      success: true,
      data: result,
      employee_data: newEmployeeData,
      message: '조직 변경이 성공적으로 완료되었습니다.'
    });

  } catch (error) {
    console.error('조직 변경 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PUT: 일괄 조직 변경
export async function PUT(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user || user.permission_level < 3) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { operations } = body; // 배열 형태의 작업들

    if (!Array.isArray(operations) || operations.length === 0) {
      return NextResponse.json({ error: '작업 목록이 필요합니다.' }, { status: 400 });
    }

    const results = [];
    const errors = [];

    for (const operation of operations) {
      try {
        // 각 작업을 순차적으로 처리
        const response = await fetch(request.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('authorization') || ''
          },
          body: JSON.stringify(operation)
        });

        const result = await response.json();

        if (response.ok) {
          results.push({ ...operation, result: result.data });
        } else {
          errors.push({ ...operation, error: result.error });
        }
      } catch (error) {
        errors.push({ ...operation, error: '작업 처리 중 오류 발생' });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      data: {
        successful_operations: results.length,
        failed_operations: errors.length,
        results,
        errors
      },
      message: `${results.length}개 작업 완료, ${errors.length}개 작업 실패`
    });

  } catch (error) {
    console.error('일괄 조직 변경 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}