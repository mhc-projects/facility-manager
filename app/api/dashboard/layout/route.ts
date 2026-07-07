import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { queryOne, query as pgQuery } from '@/lib/supabase-direct'
import { requireAdmin } from '@/lib/auth/require-admin'

// 기본 레이아웃 설정
const DEFAULT_LAYOUT = {
  widgets: [
    { id: 'weekly-scorecard', visible: true, order: 1 },
    { id: 'organization', visible: true, order: 2 },
    { id: 'revenue', visible: true, order: 3 },
    { id: 'receivable', visible: true, order: 4 },
    { id: 'installation', visible: true, order: 5 }
  ]
};

// GET: 사용자의 레이아웃 설정 조회
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const userId = auth.user.id;

    // 사용자의 레이아웃 설정 조회 - 직접 PostgreSQL 연결 사용
    const data = await queryOne(
      'SELECT * FROM dashboard_layouts WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!data) {
      // 레이아웃이 없으면 기본값 반환
      return NextResponse.json({
        success: true,
        data: DEFAULT_LAYOUT
      });
    }

    return NextResponse.json({
      success: true,
      data: data.layout_config || DEFAULT_LAYOUT
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Layout API GET Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST: 레이아웃 설정 저장
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const userId = auth.user.id;

    const body = await request.json();
    const { layout_config } = body;

    if (!layout_config || !layout_config.widgets) {
      return NextResponse.json(
        { success: false, error: 'layout_config는 필수입니다.' },
        { status: 400 }
      );
    }

    // upsert: 존재하면 업데이트, 없으면 생성 - 직접 PostgreSQL 연결 사용
    const updatedAt = new Date().toISOString();
    const result = await pgQuery(
      `INSERT INTO dashboard_layouts (user_id, layout_config, updated_at, created_at)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET layout_config = $2, updated_at = $3
       RETURNING *`,
      [userId, JSON.stringify(layout_config), updatedAt]
    );

    const data = result.rows[0];

    console.log('✅ [Dashboard Layout API] Layout saved for user:', userId);

    return NextResponse.json({
      success: true,
      data: data.layout_config
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Layout API POST Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE: 레이아웃 설정 초기화 (기본값으로 되돌림)
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const userId = auth.user.id;

    // 레이아웃 삭제 - 직접 PostgreSQL 연결 사용
    await pgQuery(
      'DELETE FROM dashboard_layouts WHERE user_id = $1',
      [userId]
    );

    console.log('✅ [Dashboard Layout API] Layout reset for user:', userId);

    return NextResponse.json({
      success: true,
      message: '레이아웃이 기본값으로 초기화되었습니다.',
      data: DEFAULT_LAYOUT
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Layout API DELETE Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
