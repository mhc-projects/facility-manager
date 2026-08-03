// app/api/admin/menu-required-level/route.ts - 메뉴별 필요 권한 레벨 전역 재정의 관리 (시스템관리자 전용)
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { requireSystemAdmin } from '@/lib/auth/require-system-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 전체 재정의 목록
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const rows = await queryAll(
      `SELECT menu_href, required_level, updated_at FROM menu_required_level_overrides ORDER BY menu_href ASC`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('❌ [MENU-REQUIRED-LEVEL] GET 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 재정의 생성/수정
export async function POST(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { menu_href, required_level } = body ?? {};

    if (!menu_href || typeof menu_href !== 'string') {
      return NextResponse.json({ success: false, error: 'menu_href가 필요합니다.' }, { status: 400 });
    }
    if (typeof required_level !== 'number' || !Number.isInteger(required_level) || required_level < 0 || required_level > 4) {
      return NextResponse.json({ success: false, error: 'required_level은 0~4 사이의 정수여야 합니다.' }, { status: 400 });
    }

    const result = await queryOne(
      `INSERT INTO menu_required_level_overrides (menu_href, required_level, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (menu_href)
       DO UPDATE SET required_level = $2, updated_by = $3, updated_at = NOW()
       RETURNING *`,
      [menu_href, required_level, auth.user.id]
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('❌ [MENU-REQUIRED-LEVEL] POST 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 재정의 삭제 (기본값으로 복귀)
export async function DELETE(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const menuHref = request.nextUrl.searchParams.get('menu_href');
    if (!menuHref) {
      return NextResponse.json({ success: false, error: 'menu_href가 필요합니다.' }, { status: 400 });
    }
    await pgQuery('DELETE FROM menu_required_level_overrides WHERE menu_href = $1', [menuHref]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [MENU-REQUIRED-LEVEL] DELETE 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
