import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTokenString } from '@/utils/auth';

const storageClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const dynamic = 'force-dynamic';

const BUCKET = 'approval-attachments';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * POST /api/approvals/attachments/signed-url
 * Supabase Storage signed upload URL 발급.
 * 파일 바이너리는 Vercel 함수를 거치지 않고 클라이언트 → Supabase 직접 전송.
 * Body: { filename, contentType, fileSize?, documentId? }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }
    const userId = decoded.userId || decoded.id;

    const { filename, contentType, fileSize, documentId } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ success: false, error: '파일 정보가 없습니다' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ success: false, error: '지원하지 않는 파일 형식입니다 (PDF, 이미지, Office 문서만 가능)' }, { status: 400 });
    }
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: '파일 크기는 20MB 이하여야 합니다' }, { status: 400 });
    }

    const uuid = crypto.randomUUID();
    const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
    const folder = documentId || `temp_${userId}`;
    const storagePath = `${folder}/${uuid}${ext}`;

    const { data, error } = await storageClient.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      console.error('[signed-url] createSignedUploadUrl error:', error);
      return NextResponse.json(
        { success: false, error: '업로드 URL 생성 실패: ' + (error?.message ?? '알 수 없는 오류') },
        { status: 500 }
      );
    }

    const { data: urlData } = storageClient.storage.from(BUCKET).getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl: urlData.publicUrl,
      fileId: uuid,
    });
  } catch (error: any) {
    console.error('[API] POST /approvals/attachments/signed-url error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
