// 메일함 계정 연결/재연결 등 시스템관리자(레벨4) 전용 API에서 쓰는 서버측 인증/권한 체크
import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenString } from '@/utils/auth';
import { queryOne } from '@/lib/supabase-direct';

export interface SystemAdminUser {
  id: string;
  name: string;
  permission_level: number;
}

export type RequireSystemAdminResult =
  | { ok: true; user: SystemAdminUser }
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
 * DB 최신 permission_level이 4(시스템관리자) 이상인지 확인한다.
 */
export async function requireSystemAdmin(request: NextRequest): Promise<RequireSystemAdminResult> {
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
    'SELECT id, name, permission_level FROM employees WHERE id = $1 AND is_active = true',
    [userId]
  );

  if (!employee || (employee.permission_level ?? 0) < 4) {
    return { ok: false, response: forbidden('시스템 관리자만 이용할 수 있습니다.') };
  }

  return { ok: true, user: employee };
}
