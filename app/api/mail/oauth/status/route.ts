import { NextRequest, NextResponse } from 'next/server';
import { requireSalesOrAdmin } from '@/lib/auth/require-sales-or-admin';
import { getStoredCredential } from '@/lib/services/gmail-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: Gmail 연결 상태 조회
export async function GET(request: NextRequest) {
  const auth = await requireSalesOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const credential = await getStoredCredential();
    return NextResponse.json({
      success: true,
      data: {
        connected: !!credential,
        email: credential?.email || null,
      },
    });
  } catch (error) {
    console.error('[API] GET /mail/oauth/status error:', error);
    return NextResponse.json({ success: false, error: '연결 상태 조회 실패' }, { status: 500 });
  }
}
