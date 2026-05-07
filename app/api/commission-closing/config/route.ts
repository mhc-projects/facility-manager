import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authGuard(request: NextRequest, minLevel = 3) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) return null;
  const level = decoded.permissionLevel ?? decoded.permission_level;
  if (!level || level < minLevel) return null;
  return decoded;
}

// GET /api/commission-closing/config
export async function GET(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const config = await queryOne('SELECT * FROM commission_closing_config LIMIT 1');
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('❌ [COMMISSION-CONFIG] GET 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/commission-closing/config
export async function PUT(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json();
    const { self_trigger, subsidy_trigger, subsidy_paid_basis } = body;

    const updated = await queryOne(
      `UPDATE commission_closing_config
       SET self_trigger        = COALESCE($1, self_trigger),
           subsidy_trigger     = COALESCE($2, subsidy_trigger),
           subsidy_paid_basis  = COALESCE($3, subsidy_paid_basis),
           updated_by          = $4,
           updated_at          = NOW()
       RETURNING *`,
      [self_trigger ?? null, subsidy_trigger ?? null, subsidy_paid_basis ?? null, decoded.userId ?? decoded.id]
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('❌ [COMMISSION-CONFIG] PUT 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
