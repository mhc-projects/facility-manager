// 대시보드 등 관리자 전용(권한 레벨 3 이상) API에서 공통으로 쓰는 서버측 인증/권한 체크
import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenString } from '@/utils/auth';
import { queryOne } from '@/lib/supabase-direct';

export interface AdminUser {
  id: string;
  name: string;
  permission_level: number;
}

export type RequireAdminResult =
  | { ok: true; user: AdminUser }
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
 * DB에서 현재 permission_level을 다시 조회해 3(관리자) 이상인지 확인한다.
 * JWT는 최대 30일 유효하므로, 토큰에 담긴 값이 아니라 DB의 최신 값을 기준으로 판단한다.
 */
export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
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

  if (!employee || (employee.permission_level ?? 0) < 3) {
    return { ok: false, response: forbidden('관리자 권한이 필요합니다.') };
  }

  return { ok: true, user: employee };
}
