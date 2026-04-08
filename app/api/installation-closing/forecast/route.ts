import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 예측마감 대상 업무 단계
const FORECAST_TARGET_STATUSES = [
  // 자비
  'self_product_order',           // 제품 발주
  'self_installation_schedule',   // 설치예정
  // 보조금
  'subsidy_product_order',        // 제품 발주
  'subsidy_installation_schedule',// 설치예정
  // 외주설치
  'outsourcing_order',            // 외주 발주
  'outsourcing_schedule',         // 일정 조율
  'outsourcing_in_progress',      // 설치 진행 중
];

/**
 * GET /api/installation-closing/forecast
 * 예측마감 대상 목록 조회 (업무 단계 기반, 월 구분 없음)
 *
 * 대상: facility_tasks에서 '제품 발주' 또는 '설치예정' 단계인 사업장
 * - 아직 설치 완료되지 않은 건 (installation_date IS NULL)
 * - 아직 예측마감 처리되지 않은 건
 * + 이미 예측마감 처리된 건 (이력 표시)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '설치비 마감 권한이 필요합니다. (권한 레벨 3 이상)' }, { status: 403 });
    }

    // 미처리 예측마감 대상: 업무 단계가 대상이고 + 설치 미완료 + 예측마감 미처리
    const pendingBusinesses = await queryAll(`
      SELECT DISTINCT
        b.id,
        b.business_name,
        b.sales_office,
        b.order_date,
        b.installation_date,
        b.additional_cost,
        b.installation_extra_cost,
        b.manufacturer,
        b.local_government,
        ft.status AS task_status,
        ft.task_type
      FROM business_info b
      INNER JOIN facility_tasks ft ON ft.business_id = b.id AND ft.is_deleted = false
      WHERE ft.status = ANY($1)
        AND b.installation_date IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM installation_payments ip
          WHERE ip.business_id = b.id AND ip.payment_type = 'forecast'
            AND ip.status NOT IN ('cancelled', 'deducted')
        )
      ORDER BY b.business_name ASC
    `, [FORECAST_TARGET_STATUSES]);

    // 이미 예측마감 처리된 건 (최근 이력)
    const paidBusinesses = await queryAll(`
      SELECT DISTINCT
        b.id,
        b.business_name,
        b.sales_office,
        b.order_date,
        b.installation_date,
        b.additional_cost,
        b.installation_extra_cost,
        b.manufacturer,
        b.local_government,
        ft.status AS task_status,
        ft.task_type
      FROM business_info b
      INNER JOIN installation_payments ip ON ip.business_id = b.id
        AND ip.payment_type = 'forecast' AND ip.status = 'paid'
      LEFT JOIN facility_tasks ft ON ft.business_id = b.id AND ft.is_deleted = false
      WHERE b.installation_date IS NULL
      ORDER BY b.business_name ASC
    `);

    const allBusinessIds = [
      ...pendingBusinesses.map((b: any) => b.id),
      ...paidBusinesses.map((b: any) => b.id),
    ].filter((v, i, a) => a.indexOf(v) === i);

    // 설치비 단가 조회
    const installationCosts = await queryAll(
      `SELECT equipment_type, base_installation_cost FROM equipment_installation_cost WHERE is_active = true`
    );
    const installCostMap: Record<string, number> = {};
    installationCosts.forEach((row: any) => {
      installCostMap[row.equipment_type] = Number(row.base_installation_cost) || 0;
    });

    const EQUIPMENT_FIELDS = [
      'ph_meter', 'differential_pressure_meter', 'temperature_meter',
      'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
      'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
      'explosion_proof_differential_pressure_meter_domestic',
      'explosion_proof_temperature_meter_domestic',
      'expansion_device', 'relay_8ch', 'relay_16ch',
      'main_board_replacement', 'multiple_stack'
    ];

    // 사업장별 기기 정보 조회
    let businessEquipmentMap: Record<string, any> = {};
    if (allBusinessIds.length > 0) {
      const equipmentFields = EQUIPMENT_FIELDS.map(f => `b.${f}`).join(', ');
      const businessDetails = await queryAll(`
        SELECT b.id, b.multiple_stack_install_extra, ${equipmentFields}
        FROM business_info b
        WHERE b.id = ANY($1)
      `, [allBusinessIds]);
      businessDetails.forEach((bd: any) => {
        businessEquipmentMap[bd.id] = bd;
      });
    }

    // 기존 예측마감 지급 기록
    const existingPayments = await queryAll(`
      SELECT business_id, payment_type, payment_category, status, actual_amount, calculated_amount, payment_month
      FROM installation_payments
      WHERE business_id = ANY($1)
        AND payment_type = 'forecast'
        AND status NOT IN ('cancelled', 'deducted')
      ORDER BY business_id, payment_category
    `, [allBusinessIds]);

    const paymentMap: Record<string, any[]> = {};
    existingPayments.forEach((p: any) => {
      if (!paymentMap[p.business_id]) paymentMap[p.business_id] = [];
      paymentMap[p.business_id].push(p);
    });

    // 업무 단계 라벨 맵
    const STATUS_LABELS: Record<string, string> = {
      self_product_order: '제품 발주',
      self_installation_schedule: '설치예정',
      subsidy_product_order: '제품 발주',
      subsidy_installation_schedule: '설치예정',
      outsourcing_order: '외주 발주',
      outsourcing_schedule: '일정 조율',
      outsourcing_in_progress: '설치 진행 중',
    };

    // task_type이 부정확할 수 있으므로 status prefix로 실제 유형 판별
    function resolveTaskType(taskStatus: string, taskType: string): string {
      if (taskStatus?.startsWith('self_')) return '자비';
      if (taskStatus?.startsWith('subsidy_')) return '보조금';
      if (taskStatus?.startsWith('outsourcing_')) return '외주설치';
      // fallback: task_type 기반
      const map: Record<string, string> = { self: '자비', subsidy: '보조금', outsourcing: '외주설치', dealer: '대리점', as: 'AS', etc: '기타' };
      return map[taskType] || taskType || '';
    }

    const TYPE_LABELS: Record<string, string> = {
      self: '자비', subsidy: '보조금', outsourcing: '외주설치',
    };

    // 결과 조합 (pending + paid, 중복 제거)
    const seenIds = new Set<string>();
    const allBiz = [...pendingBusinesses, ...paidBusinesses].filter((b: any) => {
      if (seenIds.has(b.id)) return false;
      seenIds.add(b.id);
      return true;
    });

    const result = allBiz.map((b: any) => {
      const equip = businessEquipmentMap[b.id] || {};
      let baseInstallCost = 0;

      EQUIPMENT_FIELDS.forEach(field => {
        const qty = Number(equip[field]) || 0;
        if (qty > 0) {
          baseInstallCost += (installCostMap[field] || 0) * qty;
        }
      });

      const multiExtra = Number(equip.multiple_stack_install_extra) || 0;
      if (multiExtra > 0) {
        baseInstallCost += (installCostMap['multiple_stack'] || 0) * multiExtra;
      }

      const extraInstallCost = Number(b.installation_extra_cost) || 0;
      const totalForecast = baseInstallCost + extraInstallCost;

      const payments = paymentMap[b.id] || [];
      const isPaid = payments.length > 0 && payments.every((p: any) => p.status === 'paid');
      const paidAmount = payments.reduce((sum: number, p: any) => sum + (Number(p.actual_amount) || 0), 0);

      return {
        id: b.id,
        business_name: b.business_name,
        sales_office: b.sales_office,
        order_date: b.order_date,
        installation_date: b.installation_date,
        local_government: b.local_government,
        task_status: b.task_status,
        task_status_label: STATUS_LABELS[b.task_status] || b.task_status,
        task_type: b.task_type,
        task_type_label: resolveTaskType(b.task_status, b.task_type),
        base_installation_cost: baseInstallCost,
        additional_construction_cost: 0,
        extra_installation_cost: extraInstallCost,
        total_forecast_amount: totalForecast,
        is_paid: isPaid,
        paid_amount: paidAmount,
        paid_month: payments[0]?.payment_month || null,
        forecast_payments: payments,
      };
    });

    const stats = {
      total_count: result.length,
      paid_count: result.filter((r: any) => r.is_paid).length,
      pending_count: result.filter((r: any) => !r.is_paid).length,
      total_amount: result.reduce((sum: number, r: any) => sum + r.total_forecast_amount, 0),
      paid_total: result.reduce((sum: number, r: any) => sum + r.paid_amount, 0),
    };

    return NextResponse.json({
      success: true,
      data: { businesses: result, stats },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [FORECAST] 예측마감 대상 조회 실패:', error);
    return NextResponse.json({
      success: false,
      message: '예측마감 대상 조회에 실패했습니다.',
      error: error.message,
    }, { status: 500 });
  }
}
