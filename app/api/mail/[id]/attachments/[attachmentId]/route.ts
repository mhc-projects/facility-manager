import { NextRequest, NextResponse } from 'next/server';
import { requireSalesOrAdmin } from '@/lib/auth/require-sales-or-admin';
import { getMailAttachment } from '@/lib/services/gmail-api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIME_TYPE_PATTERN = /^[a-zA-Z0-9!#$&\-^_]+\/[a-zA-Z0-9!#$&\-^_.+]+$/;

function sanitizeFilename(raw: string): string {
  const cleaned = raw.replace(/[\r\n"]/g, '').trim();
  return cleaned || 'attachment';
}

// GET: 메일 첨부파일 다운로드 (파일명/타입은 클라이언트가 이미 받은 메일 상세 정보에서 전달)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const auth = await requireSalesOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await getMailAttachment(params.id, params.attachmentId);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Gmail 계정이 연결되지 않았거나 첨부파일을 찾을 수 없습니다.' },
        { status: 409 }
      );
    }

    const rawFilename = request.nextUrl.searchParams.get('filename') || 'attachment';
    const rawMimeType = request.nextUrl.searchParams.get('mimeType') || '';
    const filename = sanitizeFilename(rawFilename);
    const mimeType = MIME_TYPE_PATTERN.test(rawMimeType) ? rawMimeType : 'application/octet-stream';
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(data.length),
      },
    });
  } catch (error) {
    console.error('[API] GET /mail/[id]/attachments/[attachmentId] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '첨부파일 다운로드 실패' },
      { status: 500 }
    );
  }
}
