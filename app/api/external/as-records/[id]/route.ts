import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyApiKey } from '@/utils/api-key-auth';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['completed', 'scheduled', 'finished', 'on_hold', 'site_check', 'installation', 'completion_fix', 'modem_check'];

function parseDate(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();
  const match = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return null;
}

/**
 * PATCH /api/external/as-records/[id]
 * 외부 시스템에서 AS 레코드 수정
 * 수정 가능 필드: status, receipt_content, work_content, as_manager_name,
 *               receipt_date, work_date, chimney_number, dispatch_count
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'API 키가 필요합니다. Authorization: Bearer {API_KEY} 헤더를 포함해주세요.' },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);
  const keyInfo = await verifyApiKey(apiKey, '/api/external/as-records');
  if (!keyInfo) {
    return NextResponse.json(
      { success: false, error: '유효하지 않거나 만료된 API 키입니다.' },
      { status: 401 }
    );
  }

  const recordId = params.id;

  try {
    // 레코드 존재 여부 확인
    const existing = await pgQuery(
      `SELECT id, status, business_name_raw, business_id FROM as_records WHERE id = $1`,
      [recordId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '해당 AS 레코드를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const current = existing.rows[0];
    const body = await request.json();

    const {
      status,
      receipt_content,
      work_content,
      as_manager_name,
      receipt_date,
      work_date,
      chimney_number,
      dispatch_count,
    } = body;

    // 상태값 검증
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `유효하지 않은 status 값입니다. 허용값: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // 변경 가능한 필드만 업데이트
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (receipt_content !== undefined) { updates.push(`receipt_content = $${idx++}`); values.push(receipt_content || null); }
    if (work_content !== undefined) { updates.push(`work_content = $${idx++}`); values.push(work_content || null); }
    if (as_manager_name !== undefined) { updates.push(`as_manager_name = $${idx++}`); values.push(as_manager_name || null); }
    if (receipt_date !== undefined) { updates.push(`receipt_date = $${idx++}`); values.push(parseDate(receipt_date)); }
    if (work_date !== undefined) { updates.push(`work_date = $${idx++}`); values.push(parseDate(work_date)); }
    if (chimney_number !== undefined) { updates.push(`chimney_number = $${idx++}`); values.push(chimney_number || null); }
    if (dispatch_count !== undefined) { updates.push(`dispatch_count = $${idx++}`); values.push(Math.max(1, Number(dispatch_count) || 1)); }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: '변경할 필드가 없습니다.' },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    values.push(recordId);

    const result = await pgQuery(
      `UPDATE as_records SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, business_name_raw, status, receipt_date, work_date, updated_at`,
      values
    );

    // 변경 로그 기록
    await pgQuery(
      `INSERT INTO api_access_logs (api_key_id, method, path, record_id, changes, key_name)
       VALUES ($1, 'PATCH', '/api/external/as-records', $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [keyInfo.id, recordId, JSON.stringify({ before: { status: current.status }, after: body }), keyInfo.key_name]
    ).catch(() => {
      // 로그 테이블 없으면 무시
      console.log(`[external/as-records PATCH] key=${keyInfo.key_name} id=${recordId} status=${status ?? '변경없음'}`);
    });

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[external/as-records] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'AS 데이터 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/external/as-records/[id]
 * 외부 시스템에서 AS 레코드 삭제 (소프트 삭제)
 * 삭제 전 로그 기록
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'API 키가 필요합니다. Authorization: Bearer {API_KEY} 헤더를 포함해주세요.' },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);
  const keyInfo = await verifyApiKey(apiKey, '/api/external/as-records');
  if (!keyInfo) {
    return NextResponse.json(
      { success: false, error: '유효하지 않거나 만료된 API 키입니다.' },
      { status: 401 }
    );
  }

  const recordId = params.id;

  try {
    // 레코드 존재 여부 확인
    const existing = await pgQuery(
      `SELECT id, status, business_name_raw, receipt_date, created_at FROM as_records WHERE id = $1`,
      [recordId]
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '해당 AS 레코드를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const record = existing.rows[0];

    // 삭제 로그 먼저 기록
    await pgQuery(
      `INSERT INTO api_access_logs (api_key_id, method, path, record_id, changes, key_name)
       VALUES ($1, 'DELETE', '/api/external/as-records', $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [keyInfo.id, recordId, JSON.stringify({ deleted_record: record }), keyInfo.key_name]
    ).catch(() => {
      console.log(`[external/as-records DELETE] key=${keyInfo.key_name} id=${recordId} business=${record.business_name_raw}`);
    });

    // 실제 삭제
    await pgQuery(
      `DELETE FROM as_records WHERE id = $1`,
      [recordId]
    );

    return NextResponse.json({
      success: true,
      message: 'AS 레코드가 삭제되었습니다.',
      deleted_id: recordId,
    });
  } catch (error) {
    console.error('[external/as-records] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'AS 데이터 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/external/as-records/[id]
 * 특정 AS 레코드 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'API 키가 필요합니다.' },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);
  const keyInfo = await verifyApiKey(apiKey, '/api/external/as-records');
  if (!keyInfo) {
    return NextResponse.json(
      { success: false, error: '유효하지 않거나 만료된 API 키입니다.' },
      { status: 401 }
    );
  }

  const recordId = params.id;

  try {
    const result = await pgQuery(
      `SELECT id, business_id, business_name_raw, site_address, site_manager, site_contact,
              receipt_date, work_date, receipt_content, work_content,
              as_manager_name, chimney_number, dispatch_count, status, created_at, updated_at
       FROM as_records WHERE id = $1`,
      [recordId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '해당 AS 레코드를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[external/as-records] GET error:', error);
    return NextResponse.json(
      { success: false, error: '데이터 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
