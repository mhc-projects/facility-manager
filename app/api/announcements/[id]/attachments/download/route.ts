import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET_NAME = 'announcement-attachments';

/**
 * GET /api/announcements/[id]/attachments/download?attachmentId=xxx
 * 첨부파일 다운로드 URL 생성
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json(
        { error: '첨부파일 ID가 필요합니다.' },
        { status: 400 }
      );
    }

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

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(attachment.file_path, 60); // 60초 유효

    if (error) {
      console.error('[다운로드 URL 생성 실패]', error);
      return NextResponse.json(
        { error: '다운로드 URL 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: data.signedUrl,
      fileName: attachment.original_name
    });
  } catch (error) {
    console.error('[다운로드 URL 생성 오류]', error);
    return NextResponse.json(
      { error: '다운로드 URL 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
