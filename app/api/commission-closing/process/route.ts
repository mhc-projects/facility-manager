import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authGuard(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) return null;
  const level = decoded.permissionLevel ?? decoded.permission_level;
  if (!level || level < 3) return null;
  return decoded;
}

/**
 * POST /api/commission-closing/process
 * 선택한 사업장에 대해 commission_payments 레코드 생성/갱신
 * Body: { businesses: Array<{ business_id, calculated_amount, actual_amount, trigger_type, progress_type, receivable_amount, snapshot_data }>, payment_month }
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const userId = decoded.userId ?? decoded.id;
    const body = await request.json();
    const { businesses, payment_month } = body;

    if (!businesses?.length || !payment_month) {
      return NextResponse.json({ success: false, message: '필수 파라미터 누락' }, { status: 400 });
    }

    const results: any[] = [];
    const errors: string[] = [];

    for (const biz of businesses) {
      try {
        const {
          business_id,
          calculated_amount,
          actual_amount,
          trigger_type,
          progress_type,
          receivable_amount,
          snapshot_data,
          sales_office,
        } = biz;

        // 사업장 유효성 확인
        const bizInfo = await queryOne(
          'SELECT id, sales_office FROM business_info WHERE id = $1 AND is_active = true AND is_deleted = false',
          [business_id]
        );
        if (!bizInfo) {
          errors.push(`${business_id}: 사업장 없음`);
          continue;
        }

        const isOnHold = (receivable_amount ?? 0) > 0;
        const finalSalesOffice = sales_office ?? bizInfo.sales_office;

        // UPSERT (같은 사업장의 active 레코드 업데이트 or 신규 생성)
        const existing = await queryOne(
          `SELECT id FROM commission_payments WHERE business_id = $1 AND status NOT IN ('cancelled') LIMIT 1`,
          [business_id]
        );

        let result;
        if (existing) {
          result = await queryOne(
            `UPDATE commission_payments SET
               sales_office      = $2,
               payment_month     = $3,
               progress_type     = $4,
               calculated_amount = $5,
               actual_amount     = $6,
               status            = $7,
               hold_reason       = $8,
               receivable_amount = $9,
               trigger_type      = $10,
               triggered_at      = NOW(),
               snapshot_data     = $11,
               updated_at        = NOW()
             WHERE id = $1
             RETURNING *`,
            [
              existing.id,
              finalSalesOffice,
              payment_month,
              progress_type ?? 'etc',
              calculated_amount ?? 0,
              actual_amount ?? calculated_amount ?? 0,
              isOnHold ? 'on_hold' : 'eligible',
              isOnHold ? 'receivable' : null,
              receivable_amount ?? 0,
              trigger_type ?? 'manual',
              JSON.stringify(snapshot_data ?? {}),
            ]
          );
        } else {
          result = await queryOne(
            `INSERT INTO commission_payments (
               business_id, sales_office, payment_month, progress_type,
               calculated_amount, actual_amount, status, hold_reason,
               receivable_amount, trigger_type, triggered_at, snapshot_data, created_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12)
             RETURNING *`,
            [
              business_id,
              finalSalesOffice,
              payment_month,
              progress_type ?? 'etc',
              calculated_amount ?? 0,
              actual_amount ?? calculated_amount ?? 0,
              isOnHold ? 'on_hold' : 'eligible',
              isOnHold ? 'receivable' : null,
              receivable_amount ?? 0,
              trigger_type ?? 'manual',
              JSON.stringify(snapshot_data ?? {}),
              userId,
            ]
          );
        }

        results.push(result);
      } catch (err) {
        console.error('❌ [COMMISSION-PROCESS] 건별 오류:', err);
        errors.push(`${biz.business_id}: 처리 실패`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { processed: results.length, errors },
      message: `${results.length}건 처리 완료`,
    });
  } catch (error) {
    console.error('❌ [COMMISSION-PROCESS] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
