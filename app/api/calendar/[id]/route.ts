// app/api/calendar/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query as pgQuery } from '@/lib/supabase-direct';

// Next.js 캐싱 완전 비활성화 - 실시간 이벤트 업데이트를 위해 필수
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/calendar/[id]
 * 특정 캘린더 이벤트 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const data = await queryOne(
      `SELECT * FROM calendar_events
       WHERE id = $1 AND is_deleted = $2
       LIMIT 1`,
      [id, false]
    );

    if (!data) {
      console.error('[캘린더 이벤트 조회 실패] ID:', id);
      return NextResponse.json(
        { error: '캘린더 이벤트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[캘린더 조회 API 오류]', error);
    return NextResponse.json(
      { error: '캘린더 조회 API 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/calendar/[id]
 * 캘린더 이벤트 수정
 * - Level 1+ (AUTHENTICATED) 수정 가능
 */
export async function PUT(
  request: NextRequest,
  { params: routeParams }: { params: { id: string } }
) {
  try {
    const { id } = routeParams;
    const body = await request.json();

    const { title, description, event_date, end_date, start_time, end_time, event_type, is_completed, attached_files, labels, business_id, business_name } = body;

    // 종료일 유효성 검증 (event_date와 end_date가 모두 있는 경우)
    const finalEventDate = event_date !== undefined ? event_date : null;
    const finalEndDate = end_date !== undefined ? end_date : null;

    if (finalEndDate && finalEventDate && finalEndDate < finalEventDate) {
      return NextResponse.json(
        { error: '종료일은 시작일보다 이전일 수 없습니다.' },
        { status: 400 }
      );
    }

    // 이벤트 타입 검증
    if (event_type !== undefined && event_type !== 'todo' && event_type !== 'schedule') {
      return NextResponse.json(
        { error: '이벤트 타입은 todo 또는 schedule이어야 합니다.' },
        { status: 400 }
      );
    }

    // 동적 UPDATE 필드 구성 - Direct PostgreSQL
    const updateFields: string[] = ['updated_at = $1'];
    const params: any[] = [new Date().toISOString()];
    let paramIndex = 2;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (event_date !== undefined) {
      updateFields.push(`event_date = $${paramIndex}`);
      params.push(event_date);
      paramIndex++;
    }
    if (end_date !== undefined) {
      updateFields.push(`end_date = $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    }
    if (start_time !== undefined) {
      updateFields.push(`start_time = $${paramIndex}`);
      params.push(start_time);
      paramIndex++;
    }
    if (end_time !== undefined) {
      updateFields.push(`end_time = $${paramIndex}`);
      params.push(end_time);
      paramIndex++;
    }
    if (event_type !== undefined) {
      updateFields.push(`event_type = $${paramIndex}`);
      params.push(event_type);
      paramIndex++;
    }
    if (is_completed !== undefined) {
      updateFields.push(`is_completed = $${paramIndex}`);
      params.push(is_completed);
      paramIndex++;
    }
    if (attached_files !== undefined) {
      updateFields.push(`attached_files = $${paramIndex}::jsonb`);
      params.push(JSON.stringify(attached_files));
      paramIndex++;
    }
    if (labels !== undefined) {
      updateFields.push(`labels = $${paramIndex}`);
      params.push(labels);  // JavaScript 배열 그대로 전달
      paramIndex++;
    }
    if (business_id !== undefined) {
      updateFields.push(`business_id = $${paramIndex}`);
      params.push(business_id);
      paramIndex++;
    }
    if (business_name !== undefined) {
      updateFields.push(`business_name = $${paramIndex}`);
      params.push(business_name);
      paramIndex++;
    }

    if (updateFields.length === 1) {
      return NextResponse.json(
        { error: '수정할 내용이 없습니다.' },
        { status: 400 }
      );
    }

    // WHERE 조건용 파라미터 추가
    params.push(id);
    params.push(false);

    const data = await queryOne(
      `UPDATE calendar_events
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND is_deleted = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (!data) {
      console.error('[캘린더 이벤트 수정 실패] ID:', id);
      return NextResponse.json(
        { error: '캘린더 이벤트 수정에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[캘린더 수정 API 오류]', error);
    return NextResponse.json(
      { error: '캘린더 수정 API 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar/[id]
 * 캘린더 이벤트 삭제 (Soft Delete)
 * - Level 1+ (AUTHENTICATED) 삭제 가능
 * - 실사 이벤트(survey)는 /api/survey-events로 리다이렉트
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 실사 이벤트 감지 → survey-events API로 리다이렉트
    const isSurveyEvent =
      id.startsWith('estimate-survey-') ||
      id.startsWith('pre-construction-survey-') ||
      id.startsWith('completion-survey-');

    if (isSurveyEvent) {
      return NextResponse.json(
        {
          success: false,
          error: '실사 이벤트는 /api/survey-events API를 사용해주세요.',
          redirect: `/api/survey-events?id=${id}`
        },
        { status: 400 }
      );
    }

    // Soft delete (일반 캘린더 이벤트) - Direct PostgreSQL
    const result = await pgQuery(
      `UPDATE calendar_events
       SET is_deleted = $1
       WHERE id = $2 AND is_deleted = $3
       RETURNING *`,
      [true, id, false]
    );

    if (!result || result.rowCount === 0) {
      console.error('[캘린더 이벤트 삭제 실패] ID:', id);
      return NextResponse.json(
        { error: '이미 삭제되었거나 존재하지 않는 캘린더 이벤트입니다.' },
        { status: 404 }
      );
    }

    const data = result.rows[0];

    return NextResponse.json({
      success: true,
      message: '캘린더 이벤트가 삭제되었습니다.',
      data
    });
  } catch (error) {
    console.error('[캘린더 삭제 API 오류]', error);
    return NextResponse.json(
      { error: '캘린더 삭제 API 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
