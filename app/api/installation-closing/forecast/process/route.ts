import { NextRequest, NextResponse } from 'next/server';
import { transaction, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EQUIPMENT_FIELDS = [
  'ph_meter', 'differential_pressure_meter', 'temperature_meter',
  'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
  'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
  'explosion_proof_differential_pressure_meter_domestic',
  'explosion_proof_temperature_meter_domestic',
  'expansion_device', 'relay_8ch', 'relay_16ch',
  'main_board_replacement', 'multiple_stack'
];

/**
 * POST /api/installation-closing/forecast/process
 * 선택된 건 일괄 예측마감 처리 (트랜잭션 + FOR UPDATE 락)
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
      return NextResponse.json({ success: false, message: '설치비 마감 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { business_ids } = body;
    // payment_month 없으면 현재 월 자동 적용
    const now = new Date();
    const payment_month = body.payment_month || `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    if (!Array.isArray(business_ids) || business_ids.length === 0) {
      return NextResponse.json({ success: false, message: 'business_ids가 필요합니다.' }, { status: 400 });
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payment_month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다. (YYYY-MM)' }, { status: 400 });
    }

    // 설치비 단가 조회 (트랜잭션 밖에서 - 읽기 전용)
    const installationCosts = await queryAll(
      `SELECT equipment_type, base_installation_cost FROM equipment_installation_cost WHERE is_active = true`
    );
    const installCostMap: Record<string, number> = {};
    installationCosts.forEach((row: any) => {
      installCostMap[row.equipment_type] = Number(row.base_installation_cost) || 0;
    });

    // 트랜잭션으로 일괄 처리 (all-or-nothing)
    const result = await transaction(async (client) => {
      // 1. 대상 사업장 행 락 (FOR UPDATE)
      const equipmentFields = EQUIPMENT_FIELDS.map(f => `b.${f}`).join(', ');
      const { rows: businesses } = await client.query(`
        SELECT b.id, b.business_name, b.order_date, b.additional_cost,
               b.installation_extra_cost, b.multiple_stack_install_extra,
               b.manufacturer, ${equipmentFields}
        FROM business_info b
        WHERE b.id = ANY($1)
        FOR UPDATE OF b
      `, [business_ids]);

      if (businesses.length === 0) {
        throw new Error('대상 사업장을 찾을 수 없습니다.');
      }

      // 2. 이미 처리된 건 확인
      const { rows: existingPayments } = await client.query(`
        SELECT DISTINCT business_id
        FROM installation_payments
        WHERE business_id = ANY($1)
          AND payment_type = 'forecast'
          AND payment_month = $2
          AND status NOT IN ('cancelled', 'deducted')
      `, [business_ids, payment_month]);

      const alreadyProcessed = new Set(existingPayments.map((p: any) => p.business_id));
      const toProcess = businesses.filter((b: any) => !alreadyProcessed.has(b.id));
      const skippedIds = businesses.filter((b: any) => alreadyProcessed.has(b.id)).map((b: any) => b.id);

      if (toProcess.length === 0) {
        return { processed: 0, skipped: skippedIds.length, skipped_ids: skippedIds, payments: [] };
      }

      // 3. 각 사업장별 지급 레코드 생성
      const allPayments: any[] = [];

      for (const biz of toProcess) {
        // 기본설치비 계산
        let baseInstallCost = 0;
        const equipmentBreakdown: Record<string, { qty: number; unit_price: number }> = {};

        EQUIPMENT_FIELDS.forEach(field => {
          const qty = Number(biz[field]) || 0;
          if (qty > 0) {
            const unitPrice = installCostMap[field] || 0;
            baseInstallCost += unitPrice * qty;
            equipmentBreakdown[field] = { qty, unit_price: unitPrice };
          }
        });

        // 복수굴뚝 추가설치
        const multiExtra = Number(biz.multiple_stack_install_extra) || 0;
        if (multiExtra > 0) {
          const unitPrice = installCostMap['multiple_stack'] || 0;
          baseInstallCost += unitPrice * multiExtra;
          equipmentBreakdown['multiple_stack_extra'] = { qty: multiExtra, unit_price: unitPrice };
        }

        const extraInstallCost = Number(biz.installation_extra_cost) || 0;

        const snapshotData = {
          equipment_breakdown: equipmentBreakdown,
          installation_extra_cost: extraInstallCost,
          calculated_at: new Date().toISOString(),
        };

        // 기본설치비 레코드
        if (baseInstallCost > 0) {
          const { rows } = await client.query(`
            INSERT INTO installation_payments
              (business_id, payment_type, payment_category, calculated_amount, actual_amount,
               snapshot_data, payment_month, status, created_by)
            VALUES ($1, 'forecast', 'base_installation', $2, $2, $3, $4, 'paid', $5)
            RETURNING *
          `, [biz.id, baseInstallCost, JSON.stringify(snapshotData), payment_month, userId]);
          allPayments.push(rows[0]);
        }

        // 추가설치비 레코드 (0보다 클 때만)
        if (extraInstallCost > 0) {
          const { rows } = await client.query(`
            INSERT INTO installation_payments
              (business_id, payment_type, payment_category, calculated_amount, actual_amount,
               snapshot_data, payment_month, status, created_by)
            VALUES ($1, 'forecast', 'extra_installation', $2, $2, $3, $4, 'paid', $5)
            RETURNING *
          `, [biz.id, extraInstallCost, JSON.stringify(snapshotData), payment_month, userId]);
          if (rows && rows[0]) allPayments.push(rows[0]);
        }
      }

      return {
        processed: toProcess.length,
        skipped: skippedIds.length,
        skipped_ids: skippedIds,
        payments: allPayments,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.processed}건 예측마감 처리 완료${result.skipped > 0 ? ` (${result.skipped}건 이미 처리됨)` : ''}`,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [FORECAST] 예측마감 처리 실패:', error);

    if (error.code === '23505') {
      return NextResponse.json({
        success: false,
        message: '이미 처리된 건이 포함되어 있습니다.',
        error: { code: 'DUPLICATE_PAYMENT', message: error.detail },
      }, { status: 409 });
    }

    return NextResponse.json({
      success: false,
      message: '예측마감 처리에 실패했습니다.',
      error: { code: 'INTERNAL_ERROR', message: error.message },
    }, { status: 500 });
  }
}
