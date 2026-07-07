import { NextRequest, NextResponse } from 'next/server';
import { requireSalesOrAdmin } from '@/lib/auth/require-sales-or-admin';
import { getMailMessage } from '@/lib/services/gmail-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: 메일 본문 상세 조회 (HTML은 서버에서 살균 처리된 상태로 반환)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSalesOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const message = await getMailMessage(params.id);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Gmail 계정이 연결되지 않았습니다.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    console.error('[API] GET /mail/[id] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '메일 조회 실패' },
      { status: 500 }
    );
  }
}
