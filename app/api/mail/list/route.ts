import { NextRequest, NextResponse } from 'next/server';
import { requireSalesOrAdmin } from '@/lib/auth/require-sales-or-admin';
import { listMailMessages } from '@/lib/services/gmail-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET: INBOX 메일 목록 조회 (페이지네이션은 Gmail API pageToken 사용)
export async function GET(request: NextRequest) {
  const auth = await requireSalesOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const pageToken = request.nextUrl.searchParams.get('pageToken') || undefined;
    const query = request.nextUrl.searchParams.get('q') || undefined;
    const result = await listMailMessages({ pageToken, maxResults: 20, query });

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Gmail 계정이 연결되지 않았습니다.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[API] GET /mail/list error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '메일함 조회 실패' },
      { status: 500 }
    );
  }
}
