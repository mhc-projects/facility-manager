// app/api/admin/menu-visibility/route.ts - 팀별/사용자별 메뉴 노출 규칙 관리 (시스템관리자 전용)
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { requireSystemAdmin } from '@/lib/auth/require-system-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 전체 규칙 목록 (대상 라벨 포함)
export async function GET(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const rows = await queryAll(
      `SELECT
         o.id, o.menu_href, o.scope_type, o.scope_value, o.visible, o.created_at,
         CASE WHEN o.scope_type = 'user' THEN e.name ELSE o.scope_value END AS scope_label,
         CASE WHEN o.scope_type = 'user' THEN e.email ELSE NULL END AS scope_email
       FROM menu_visibility_overrides o
       LEFT JOIN employees e ON o.scope_type = 'user' AND e.id::text = o.scope_value
       ORDER BY o.menu_href ASC, o.scope_type ASC, o.created_at ASC`
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('❌ [MENU-VISIBILITY] GET 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 규칙 생성/수정 (동일 메뉴+대상 조합이면 덮어씀)
export async function POST(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { menu_href, scope_type, scope_value, visible } = body ?? {};

    if (!menu_href || typeof menu_href !== 'string') {
      return NextResponse.json({ success: false, error: 'menu_href가 필요합니다.' }, { status: 400 });
    }
    if (scope_type !== 'team' && scope_type !== 'user') {
      return NextResponse.json({ success: false, error: "scope_type은 'team' 또는 'user'여야 합니다." }, { status: 400 });
    }
    if (!scope_value || typeof scope_value !== 'string') {
      return NextResponse.json({ success: false, error: 'scope_value가 필요합니다.' }, { status: 400 });
    }
    if (typeof visible !== 'boolean') {
      return NextResponse.json({ success: false, error: 'visible은 boolean이어야 합니다.' }, { status: 400 });
    }

    const result = await queryOne(
      `INSERT INTO menu_visibility_overrides (menu_href, scope_type, scope_value, visible, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (menu_href, scope_type, scope_value)
       DO UPDATE SET visible = $4, updated_at = NOW()
       RETURNING *`,
      [menu_href, scope_type, scope_value, visible, auth.user.id]
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('❌ [MENU-VISIBILITY] POST 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 규칙 삭제
export async function DELETE(request: NextRequest) {
  const auth = await requireSystemAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id가 필요합니다.' }, { status: 400 });
    }

    await pgQuery('DELETE FROM menu_visibility_overrides WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [MENU-VISIBILITY] DELETE 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
