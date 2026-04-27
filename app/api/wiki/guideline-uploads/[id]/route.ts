import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  }

  let decoded: { permission_level?: number };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { permission_level?: number };
  } catch {
    return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });
  }

  if ((decoded.permission_level ?? 0) < 4) {
    return NextResponse.json({ error: '권한이 없습니다 (레벨 4 필요)' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('guideline_uploads')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
