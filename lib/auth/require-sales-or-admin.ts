// 메일함 등 영업팀 전용(또는 시스템관리자 레벨 4) API에서 공통으로 쓰는 서버측 인증/권한 체크
import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenString } from '@/utils/auth';
import { queryOne } from '@/lib/supabase-direct';
import { hasMenuAccessOverride } from '@/lib/auth/menu-access-override';

export interface SalesOrAdminUser {
  id: string;
  name: string;
  permission_level: number;
  department: string | null;
  team: string | null;
}

export type RequireSalesOrAdminResult =
  | { ok: true; user: SalesOrAdminUser }
  | { ok: false; response: NextResponse };

function unauthorized(code: 'UNAUTHORIZED' | 'INVALID_TOKEN', message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status: 401 }
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message } },
    { status: 403 }
  );
}

/**
 * Authorization 헤더(Bearer) 우선, 없으면 session_token 쿠키로 폴백해 토큰을 검증하고
 * DB의 최신 team/permission_level을 조회해 영업팀 소속이거나 permission_level 4(시스템관리자)
 * 이상인지 확인한다.
 * team이 아닌 department로 비교하면 실패한다 - 실제 영업팀 직원은 department='영업관리부',
 * team='영업팀'으로 저장돼 있어 department 문자열에는 '영업팀'이 나타나지 않는다.
 */
export async function requireSalesOrAdmin(request: NextRequest): Promise<RequireSalesOrAdminResult> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : request.cookies.get('session_token')?.value;

  if (!token) {
    return { ok: false, response: unauthorized('UNAUTHORIZED', '인증이 필요합니다.') };
  }

  const decoded = verifyTokenString(token);
  if (!decoded) {
    return { ok: false, response: unauthorized('INVALID_TOKEN', '유효하지 않은 토큰입니다.') };
  }

  const userId = decoded.id || decoded.userId;
  const employee = await queryOne(
    'SELECT id, name, permission_level, department, team FROM employees WHERE id = $1 AND is_active = true',
    [userId]
  );

  const isSales = !!employee?.team?.includes('영업팀');
  const isSystemAdmin = (employee?.permission_level ?? 0) >= 4;

  if (!employee) {
    return { ok: false, response: forbidden('영업팀 또는 시스템 관리자만 접근할 수 있습니다.') };
  }

  // 관리자설정 "메뉴 노출 설정"에서 이 사용자/팀에게 메일함을 명시적으로 허용해뒀으면 통과시킨다
  const hasOverride = !isSales && !isSystemAdmin
    ? await hasMenuAccessOverride('/admin/mail', employee.id, employee.team)
    : false;

  if (!isSales && !isSystemAdmin && !hasOverride) {
    return { ok: false, response: forbidden('영업팀 또는 시스템 관리자만 접근할 수 있습니다.') };
  }

  return { ok: true, user: employee };
}
