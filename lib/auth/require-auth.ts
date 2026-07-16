// 로그인한 일반 직원(권한 레벨 1 이상)이면 통과하는 서버측 인증 체크 - require-admin.ts와 동일 패턴
import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenString } from '@/utils/auth';
import { queryOne } from '@/lib/supabase-direct';

export interface AuthedUser {
  id: string;
  name: string;
  permission_level: number;
}

export type RequireAuthResult =
  | { ok: true; user: AuthedUser }
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
 * DB에서 현재 permission_level을 다시 조회해 minLevel 이상인지 확인한다.
 * JWT는 최대 30일 유효하므로, 토큰에 담긴 값이 아니라 DB의 최신 값을 기준으로 판단한다.
 */
export async function requireAuth(
  request: NextRequest,
  minLevel: number = 1,
): Promise<RequireAuthResult> {
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

  if (!employee || (employee.permission_level ?? 0) < minLevel) {
    return { ok: false, response: forbidden('권한이 없습니다.') };
  }

  return { ok: true, user: employee };
}
