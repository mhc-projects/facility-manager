import { NextRequest, NextResponse } from 'next/server';
import { transaction, queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/installation-closing/approval
 * 설치비 마감 결재 문서 자동 생성 + 상신
 *
 * Body: {
 *   closing_type: 'forecast' | 'final',
 *   business_ids: string[],
 *   items: InstallationClosingItem[],
 *   total_amount: number,
 *   closing_month: string,
 *   note?: string,
 *   team_leader_id?: string,
 *   executive_id?: string,
 *   ceo_id: string,
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { closing_type, business_ids, items, total_amount, closing_month, note, team_leader_id, executive_id, ceo_id } = body;

    if (!closing_type || !business_ids?.length || !items?.length || !ceo_id) {
      return NextResponse.json({ success: false, message: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    // 작성자 정보
    const requester = await queryOne(`SELECT id, name, department, role FROM employees WHERE id = $1`, [userId]);
    if (!requester) {
      return NextResponse.json({ success: false, message: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const closingLabel = closing_type === 'forecast' ? '예측마감' : '본마감';
    const title = `설치비 ${closingLabel} 결재 (${items.length}건, ${total_amount.toLocaleString()}원)`;

    const formData = {
      writer: requester.name,
      department: requester.department || '',
      written_date: new Date().toISOString().split('T')[0],
      closing_type,
      closing_month: closing_month || new Date().toISOString().substring(0, 7),
      items,
      total_count: items.length,
      total_amount,
      note: note || '',
      business_ids, // 승인 시 자동 처리용
    };

    const result = await transaction(async (client) => {
      // 1. 문서번호 생성
      const { rows: [{ generate_document_number: docNumber }] } = await client.query(
        `SELECT generate_document_number('installation_closing')`
      );

      // 2. 결재 문서 생성
      const { rows: [doc] } = await client.query(`
        INSERT INTO approval_documents
          (document_number, document_type, title, requester_id, department,
           team_leader_id, executive_id, ceo_id, form_data, status, current_step)
        VALUES ($1, 'installation_closing', $2, $3, $4, $5, $6, $7, $8, 'draft', 0)
        RETURNING *
      `, [
        docNumber, title, userId, requester.department || '',
        team_leader_id || null, executive_id || null, ceo_id,
        JSON.stringify(formData),
      ]);

      // 3. 관련 사업장에 pending 상태로 마감 레코드 생성 (결재 승인 시 paid로 변경)
      for (const item of items) {
        // 기본설치비
        if (item.base_installation_cost > 0) {
          await client.query(`
            INSERT INTO installation_payments
              (business_id, payment_type, payment_category, calculated_amount, actual_amount,
               payment_month, status, notes, created_by)
            VALUES ($1, $2, 'base_installation', $3, $3, $4, 'pending', $5, $6)
            ON CONFLICT DO NOTHING
          `, [
            item.business_id, closing_type, item.base_installation_cost,
            formData.closing_month, `결재문서: ${docNumber}`, userId,
          ]);
        }
        // 추가설치비
        if (item.extra_installation_cost > 0) {
          await client.query(`
            INSERT INTO installation_payments
              (business_id, payment_type, payment_category, calculated_amount, actual_amount,
               payment_month, status, notes, created_by)
            VALUES ($1, $2, 'extra_installation', $3, $3, $4, 'pending', $5, $6)
            ON CONFLICT DO NOTHING
          `, [
            item.business_id, closing_type, item.extra_installation_cost,
            formData.closing_month, `결재문서: ${docNumber}`, userId,
          ]);
        }
      }

      return doc;
    });

    // 4. 자동 상신
    const submitRes = await fetch(new URL(`/api/approvals/${result.id}/submit`, request.url).toString(), {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const submitData = await submitRes.json();

    return NextResponse.json({
      success: true,
      data: {
        document_id: result.id,
        document_number: result.document_number,
        submitted: submitData.success,
      },
      message: `결재 문서가 생성되고 상신되었습니다. (${result.document_number})`,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [CLOSING-APPROVAL] 결재 생성 실패:', error);
    return NextResponse.json({ success: false, message: '결재 문서 생성에 실패했습니다.' }, { status: 500 });
  }
}
