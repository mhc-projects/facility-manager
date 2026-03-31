import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query } from '@/lib/supabase-direct';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET_NAME = 'announcement-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

let bucketEnsured = false;

async function ensureBucket() {
  if (bucketEnsured) return;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage.getBucket(BUCKET_NAME);
  if (!data) {
    await supabase.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: MAX_FILE_SIZE
    });
  }
  bucketEnsured = true;
}
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'application/zip',
  'application/x-hwp',
  'application/haansofthwp',
];

/**
 * GET /api/announcements/[id]/attachments
 * 특정 공지사항의 첨부파일 목록 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const attachments = await queryAll(
      `SELECT id, file_name, original_name, file_path, file_size, mime_type, created_at
       FROM announcement_attachments
       WHERE announcement_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: attachments || []
    });
  } catch (error) {
    console.error('[첨부파일 조회 오류]', error);
    return NextResponse.json(
      { error: '첨부파일 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/announcements/[id]/attachments
 * 첨부파일 업로드
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 공지사항 존재 확인
    const announcement = await queryOne(
      'SELECT id FROM announcements WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (!announcement) {
      return NextResponse.json(
        { error: '공지사항을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: '업로드할 파일이 없습니다.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    await ensureBucket();
    const uploadedFiles = [];

    for (const file of files) {
      // 파일 크기 검증
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `파일 "${file.name}"이(가) 10MB를 초과합니다.` },
          { status: 400 }
        );
      }

      // 파일 타입 검증
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `파일 "${file.name}"은(는) 허용되지 않는 파일 형식입니다.` },
          { status: 400 }
        );
      }

      // 파일명 생성 (충돌 방지)
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || '';
      const safeName = `${id}/${timestamp}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      // Supabase Storage에 업로드
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(safeName, buffer, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('[Storage 업로드 실패]', uploadError);
        return NextResponse.json(
          { error: `파일 "${file.name}" 업로드에 실패했습니다.` },
          { status: 500 }
        );
      }

      // DB에 메타데이터 저장
      const attachment = await queryOne(
        `INSERT INTO announcement_attachments (announcement_id, file_name, original_name, file_path, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, safeName, file.name, safeName, file.size, file.type]
      );

      uploadedFiles.push(attachment);
    }

    return NextResponse.json({
      success: true,
      data: uploadedFiles
    }, { status: 201 });
  } catch (error) {
    console.error('[첨부파일 업로드 오류]', error);
    return NextResponse.json(
      { error: '첨부파일 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/announcements/[id]/attachments
 * 첨부파일 삭제 (attachment_id를 query param으로 받음)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json(
        { error: '삭제할 첨부파일 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 첨부파일 정보 조회
    const attachment = await queryOne(
      'SELECT * FROM announcement_attachments WHERE id = $1 AND announcement_id = $2',
      [attachmentId, params.id]
    );

    if (!attachment) {
      return NextResponse.json(
        { error: '첨부파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // Supabase Storage에서 삭제
    const supabase = getSupabaseAdmin();
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([attachment.file_path]);

    if (deleteError) {
      console.error('[Storage 삭제 실패]', deleteError);
    }

    // DB에서 삭제
    await query(
      'DELETE FROM announcement_attachments WHERE id = $1',
      [attachmentId]
    );

    return NextResponse.json({
      success: true,
      message: '첨부파일이 삭제되었습니다.'
    });
  } catch (error) {
    console.error('[첨부파일 삭제 오류]', error);
    return NextResponse.json(
      { error: '첨부파일 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
