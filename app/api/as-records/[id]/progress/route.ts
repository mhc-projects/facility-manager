import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/as-records/[id]/progress
 * 진행 메모 추가 (JSONB 배열에 append)
 * Body: { content: string, author: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { content, author } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ success: false, error: '메모 내용이 필요합니다' }, { status: 400 });
    }

    // 현재 상태 조회
    const currentRecord = await pgQuery(
      `SELECT status, progress_notes FROM as_records WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (currentRecord.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    const newNote = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      author: author || (decoded as { name?: string; username?: string }).name || '담당자',
      content: content.trim(),
      status_at_time: currentRecord.rows[0].status,
    };

    const result = await pgQuery(
      `UPDATE as_records
       SET progress_notes = progress_notes || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND is_deleted = false
       RETURNING id, progress_notes, status`,
      [JSON.stringify(newNote), id]
    );

    return NextResponse.json({
      success: true,
      data: result.rows[0],
      note: newNote,
    });
  } catch (error) {
    console.error('[as-records/[id]/progress] POST error:', error);
    return NextResponse.json({ success: false, error: '진행 메모 추가 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/as-records/[id]/progress
 * 진행 메모 삭제
 * Body: { note_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { note_id } = body;

    if (!note_id) {
      return NextResponse.json({ success: false, error: '메모 ID가 필요합니다' }, { status: 400 });
    }

    // JSONB 배열에서 해당 note_id 제거
    const result = await pgQuery(
      `UPDATE as_records
       SET progress_notes = (
         SELECT jsonb_agg(note)
         FROM jsonb_array_elements(progress_notes) AS note
         WHERE (note->>'id') != $1
       ),
       updated_at = NOW()
       WHERE id = $2 AND is_deleted = false
       RETURNING id, progress_notes`,
      [note_id, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[as-records/[id]/progress] DELETE error:', error);
    return NextResponse.json({ success: false, error: '진행 메모 삭제 실패' }, { status: 500 });
  }
}
