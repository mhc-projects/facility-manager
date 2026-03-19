import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTokenString } from '@/utils/auth';

// Storage 업로드 전용 클라이언트 — global Content-Type 헤더 없이 생성
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
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * POST /api/approvals/attachments
 * 견적서 첨부파일 업로드
 * Body: multipart/form-data { file, document_id? }
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

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentId = formData.get('document_id') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: '파일이 없습니다' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: '파일 크기는 20MB 이하여야 합니다' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: '지원하지 않는 파일 형식입니다' }, { status: 400 });
    }

    const uuid = crypto.randomUUID();
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const folder = documentId || `temp_${userId}`;
    // Storage에는 UUID로만 저장 (한글 인코딩 문제 방지)
    // 원본 파일명은 name 필드로 별도 전달해 프론트엔드 download 속성에서 사용
    const storagePath = `${folder}/${uuid}${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });
    const { error: uploadError } = await storageClient.storage
      .from(BUCKET)
      .upload(storagePath, blob, {
        contentType: file.type,
        duplex: 'half',
        upsert: false,
      } as any);

    if (uploadError) {
      console.error('[attachments] upload error:', uploadError);
      return NextResponse.json({ success: false, error: '파일 업로드 실패: ' + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = storageClient.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      data: {
        id: uuid,
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
        type: file.type,
        path: storagePath,
        uploaded_at: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('[API] POST /approvals/attachments error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/approvals/attachments
 * 첨부파일 삭제
 * Body: { path }
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { path } = await request.json();
    if (!path) {
      return NextResponse.json({ success: false, error: 'path가 필요합니다' }, { status: 400 });
    }

    const { error } = await storageClient.storage.from(BUCKET).remove([path]);
    if (error) {
      console.error('[attachments] delete error:', error);
      return NextResponse.json({ success: false, error: '파일 삭제 실패: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] DELETE /approvals/attachments error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
