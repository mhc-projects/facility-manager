import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 매출관리 batch API와 동일한 장비 필드 목록
const EQUIPMENT_FIELDS = [
  'ph_meter', 'differential_pressure_meter', 'temperature_meter',
  'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
  'gateway', 'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
  'explosion_proof_differential_pressure_meter_domestic',
  'explosion_proof_temperature_meter_domestic', 'expansion_device',
  'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack',
];

// 매출관리 batch API의 calculateServerContractAmount와 동일한 로직
function calculateContractAmount(row: any, officialPrices: Record<string, number>): number {
  let revenue = 0;
  for (const field of EQUIPMENT_FIELDS) {
    const qty = Number(row[field]) || 0;
    if (qty > 0) revenue += (officialPrices[field] || 0) * qty;
  }
  revenue += Number(row.additional_cost) || 0;
  revenue -= Number(row.negotiation) || 0;
  try {
    const raw = row.revenue_adjustments;
    if (raw) {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) {
        revenue += arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
      }
    }
  } catch { /* ignore */ }
  return Math.round(revenue * 1.1);
}

// 매출관리 receivables-calculator.ts의 calculateReceivables + sumAllPayments와 동일한 로직
function computeReceivable(row: any, officialPrices: Record<string, number>): number {
  const status = (row.progress_status || '').trim();
  const extraPayment = Number(row.extra_payment_total) || 0;

  let totalPayments: number;
  if (status.includes('보조금')) {
    totalPayments = (Number(row.payment_1st_amount) || 0)
      + (Number(row.payment_2nd_amount) || 0)
      + (Number(row.payment_additional_amount) || 0)
      + extraPayment;
  } else {
    totalPayments = (Number(row.payment_advance_amount) || 0)
      + (Number(row.payment_balance_amount) || 0)
      + extraPayment;
  }

  const contractAmount = calculateContractAmount(row, officialPrices);

  // 설치일 없고 입금도 없고 계약금도 없으면 미수금 0
  if (!row.installation_date && totalPayments === 0 && contractAmount <= 0) return 0;

  const raw = contractAmount - totalPayments;
  // 10원 이하 양수는 부가세 반올림 오차로 간주
  if (raw > 0 && raw <= 10) return 0;
  return Math.max(0, raw); // on_hold 판단용이므로 음수(초과입금)는 0으로
}

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
 * GET /api/commission-closing/eligible
 * 영업비 지급 대상 목록 조회
 * - 미수금 계산: 매출관리와 동일한 공식 (고시가 기반 계약금 - 실입금액)
 */
export async function GET(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    // 트리거 설정 조회
    const config = await queryOne('SELECT * FROM commission_closing_config LIMIT 1');
    const selfTrigger = config?.self_trigger ?? 'installation_complete';
    const subsidyTrigger = config?.subsidy_trigger ?? 'subsidy_fully_paid';
    const subsidyPaidBasis = config?.subsidy_paid_basis ?? 'last_invoice_paid';

    // 영업점별 수수료 설정 조회 (fallback용)
    const costSettings = await queryAll(
      `SELECT sales_office, commission_type, commission_percentage, commission_per_unit
       FROM sales_office_cost_settings
       WHERE is_active = true`
    );
    const costMap: Record<string, any> = {};
    costSettings.forEach((s: any) => { costMap[s.sales_office] = s; });

    // 정부 고시가 조회 (매출관리와 동일한 미수금 계산에 필요)
    const pricingRows = await queryAll(
      `SELECT equipment_type, official_price FROM government_pricing WHERE is_active = true`
    );
    const officialPrices: Record<string, number> = {};
    pricingRows.forEach((r: any) => { officialPrices[r.equipment_type] = Number(r.official_price) || 0; });

    const equipmentSelect = EQUIPMENT_FIELDS.map(f => `bi.${f}`).join(', ');

    // 전체 대상 뷰 조회
    // + 매출관리 계산값 JOIN (영업비 산정용)
    // + business_info 결제/장비 필드 JOIN (미수금 계산용 — 매출관리와 동일한 공식 적용)
    // + 추가계산서 입금 합계 JOIN
    const rows = await queryAll(
      `SELECT v.*,
              COALESCE(rc.adjusted_sales_commission, rc.sales_commission) AS precomputed_commission,
              ${equipmentSelect},
              bi.additional_cost,
              bi.negotiation,
              bi.revenue_adjustments,
              bi.payment_1st_amount,
              bi.payment_2nd_amount,
              bi.payment_additional_amount,
              bi.payment_advance_amount,
              bi.payment_balance_amount,
              COALESCE(extra_inv.extra_payment_total, 0) AS extra_payment_total
       FROM v_commission_eligible v
       JOIN business_info bi ON bi.id = v.business_id
       LEFT JOIN (
         SELECT DISTINCT ON (business_id)
           business_id,
           sales_commission,
           adjusted_sales_commission
         FROM revenue_calculations
         ORDER BY business_id, calculation_date DESC
       ) rc ON rc.business_id = v.business_id
       LEFT JOIN (
         SELECT business_id, SUM(COALESCE(payment_amount, 0)) AS extra_payment_total
         FROM invoice_records
         WHERE invoice_stage = 'extra' AND record_type = 'original' AND is_active = true
         GROUP BY business_id
       ) extra_inv ON extra_inv.business_id = v.business_id
       WHERE v.sales_office != '블루온'
       ORDER BY v.business_name ASC`
    );

    // v_commission_eligible의 commission_payments LEFT JOIN 중복 처리
    // (non-cancelled 레코드가 여러 개인 경우 on_hold > eligible 우선으로 대표 행 선택)
    const STATUS_PRIORITY: Record<string, number> = { on_hold: 2, eligible: 1 };
    const bestRowMap = new Map<string, any>();
    for (const row of rows) {
      const existing = bestRowMap.get(row.business_id);
      if (!existing) {
        bestRowMap.set(row.business_id, row);
      } else {
        const existingP = STATUS_PRIORITY[existing.commission_status] ?? 0;
        const newP = STATUS_PRIORITY[row.commission_status] ?? 0;
        if (newP > existingP) bestRowMap.set(row.business_id, row);
      }
    }
    const dedupedRows = Array.from(bestRowMap.values());

    const eligible: any[] = [];
    const onHold: any[] = [];
    const pending: any[] = [];  // commission_payments 레코드 없는 신규 대상
    const autoReleaseIds: string[] = [];  // 미수금 해소된 on_hold 자동 해제 대상

    for (const row of dedupedRows) {
      const progressType = deriveProgressType(row.progress_status);

      // 트리거 조건 충족 여부 판단
      let triggerMet = false;
      let triggerType = 'manual';

      if (progressType === 'self') {
        if (selfTrigger === 'installation_complete') {
          triggerMet = !!row.installation_date;
          triggerType = 'installation_complete';
        }
      } else if (['subsidy', 'subsidy_parallel', 'subsidy_extra'].includes(progressType)) {
        if (subsidyTrigger === 'subsidy_fully_paid') {
          if (subsidyPaidBasis === 'last_invoice_paid') {
            triggerMet = !!row.subsidy_last_payment_date && row.subsidy_fully_paid;
          } else if (subsidyPaidBasis === 'all_invoices_paid') {
            triggerMet = row.subsidy_fully_paid;
          }
          triggerType = 'subsidy_fully_paid';
        } else if (subsidyTrigger === 'subsidy_1st_payment') {
          triggerMet = row.subsidy_1st_paid;
          triggerType = 'subsidy_1st_payment';
        }
      }

      // 미수금 계산 — 매출관리와 동일한 공식 (고시가 기반 계약금 - 실입금액)
      const receivableAmount = computeReceivable(row, officialPrices);

      // 영업비 산정: 매출관리 계산값 우선, 없으면 sales_office_cost_settings fallback
      let calculatedAmount = 0;
      let commissionSnapshot: any = null;

      if (row.precomputed_commission != null) {
        calculatedAmount = Math.round(Number(row.precomputed_commission));
        commissionSnapshot = { type: 'precomputed', source: 'revenue_calculations' };
      } else {
        const cost = costMap[row.sales_office];
        if (cost) {
          if (cost.commission_type === 'percentage') {
            const base = ['subsidy', 'subsidy_parallel', 'subsidy_extra'].includes(progressType)
              ? Number(row.subsidy_billed_total ?? 0)
              : Number(row.self_billed_total ?? 0);
            const rate = Number(cost.commission_percentage ?? 0);
            calculatedAmount = Math.round(base * rate / 100);
            commissionSnapshot = { type: 'percentage', rate, base };
          } else if (cost.commission_type === 'per_unit') {
            const units = Number(row.total_unit_count ?? 0);
            const ratePerUnit = Number(cost.commission_per_unit ?? 0);
            calculatedAmount = units * ratePerUnit;
            commissionSnapshot = { type: 'per_unit', rate: ratePerUnit, units };
          }
        }
      }

      const item = {
        business_id: row.business_id,
        business_name: row.business_name,
        sales_office: row.sales_office,
        progress_status: row.progress_status,
        progress_type: progressType,
        installation_date: row.installation_date,
        subsidy_billed_total: row.subsidy_billed_total ?? 0,
        subsidy_paid_total: row.subsidy_paid_total ?? 0,
        subsidy_last_payment_date: row.subsidy_last_payment_date,
        subsidy_fully_paid: row.subsidy_fully_paid,
        self_billed_total: row.self_billed_total ?? 0,
        self_paid_total: row.self_paid_total ?? 0,
        receivable_amount: receivableAmount,
        calculated_amount: calculatedAmount,
        actual_amount: row.actual_amount ?? calculatedAmount,
        commission_payment_id: row.commission_payment_id,
        commission_status: row.commission_status,
        trigger_met: triggerMet,
        trigger_type: triggerType,
        triggered_at: row.triggered_at,
        payment_month: row.payment_month,
        approved_at: row.approved_at,
        payment_date: row.payment_date,
        hold_reason: row.hold_reason,
        hold_note: row.hold_note,
        commission_snapshot: commissionSnapshot,
      };

      if (row.commission_payment_id) {
        if (row.commission_status === 'on_hold') {
          if (receivableAmount === 0) {
            // 미수금 해소 → eligible 자동 전환
            autoReleaseIds.push(row.commission_payment_id);
            item.commission_status = 'eligible';
            eligible.push(item);
          } else {
            onHold.push(item);
          }
        } else if (row.commission_status === 'eligible') {
          eligible.push(item);
        }
        // approved/paid는 이 탭에서 제외
      } else if (triggerMet) {
        if (receivableAmount > 0) {
          item.commission_status = 'on_hold';
          onHold.push(item);
        } else {
          item.commission_status = 'eligible_new';
          pending.push(item);
        }
      }
    }

    // 미수금 해소된 on_hold 건 자동 eligible 전환
    if (autoReleaseIds.length > 0) {
      await pgQuery(
        `UPDATE commission_payments
         SET status = 'eligible', updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND status = 'on_hold'`,
        [autoReleaseIds]
      );
      console.log(`✅ [COMMISSION-ELIGIBLE] 미수금 해소 자동 해제 ${autoReleaseIds.length}건`);
    }

    return NextResponse.json({
      success: true,
      data: {
        eligible: [...pending, ...eligible],
        on_hold: onHold,
        config,
        stats: {
          eligible_count: pending.length + eligible.length,
          on_hold_count: onHold.length,
          eligible_total: [...pending, ...eligible].reduce((s, r) => s + Number(r.actual_amount ?? 0), 0),
        },
      },
    });
  } catch (error) {
    console.error('❌ [COMMISSION-ELIGIBLE] 조회 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}

function deriveProgressType(progressStatus: string | null): string {
  if (!progressStatus) return 'etc';
  const s = progressStatus.toLowerCase();
  if (s.includes('자비')) return 'self';
  if (s.includes('동시') || s.includes('parallel')) return 'subsidy_parallel';
  if (s.includes('추가승인') || s.includes('extra')) return 'subsidy_extra';
  if (s.includes('보조금') || s.includes('subsidy')) return 'subsidy';
  if (s.includes('대리점') || s.includes('dealer')) return 'dealer';
  if (s.includes('외주') || s.includes('outsourcing')) return 'outsourcing';
  return 'etc';
}
