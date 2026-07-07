// app/api/dashboard/weekly-scorecard/route.ts - 주간 회의용 스코어카드 (이번주/지난주 비교) API
import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ========================================
// 날짜 유틸 (KST 기준, DATE 컬럼과의 타임존 오차 방지를 위해 문자열/UTC 연산만 사용)
// ========================================

function getTodayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// 주어진 날짜가 속한 주의 월요일 반환 (월~일 기준)
function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=일 ~ 6=토
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number);
  const [ty, tm, td] = toDateStr.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

// 설치일 기준 경과일로 미수금 위험도 산출 (상: 90일+, 중: 60일+, 하: 30일+)
// revenue 페이지의 calcAutoRisk와 동일한 기준. 순수 날짜 함수라 과거 시점도 그대로 재계산 가능.
function calcRiskTier(installationDate: string | null, asOfDate: string): '상' | '중' | '하' | null {
  if (!installationDate) return null;
  const elapsed = daysBetween(installationDate, asOfDate);
  if (elapsed >= 90) return '상';
  if (elapsed >= 60) return '중';
  if (elapsed >= 30) return '하';
  return null;
}

// 발행일/입금일이 기준일 이후면 그 시점엔 아직 반영되지 않은 것으로 간주 (과거 시점 스냅샷 재구성용)
function amountAsOf(amount: any, dateCol: string | null, asOfDate: string): number {
  if (!dateCol || dateCol > asOfDate) return 0;
  return Number(amount) || 0;
}

interface ReceivableRow {
  progress_status: string | null;
  installation_date: string | null;
  invoice_1st_amount: any; invoice_1st_date: string | null;
  payment_1st_amount: any; payment_1st_date: string | null;
  invoice_2nd_amount: any; invoice_2nd_date: string | null;
  payment_2nd_amount: any; payment_2nd_date: string | null;
  additional_cost: any; invoice_additional_date: string | null;
  payment_additional_amount: any; payment_additional_date: string | null;
  invoice_advance_amount: any; invoice_advance_date: string | null;
  payment_advance_amount: any; payment_advance_date: string | null;
  invoice_balance_amount: any; invoice_balance_date: string | null;
  payment_balance_amount: any; payment_balance_date: string | null;
}

// business_info의 진행구분/계산서·입금 컬럼을 기준으로 특정 시점의 미수금(자비/보조금)을 계산
// app/api/dashboard/receivables/route.ts의 현재 시점 계산 로직을 과거 시점 재구성 가능하도록 확장한 버전
function computeReceivableAsOf(biz: ReceivableRow, asOfDate: string): { self: number; subsidy: number } {
  const status = (biz.progress_status || '').trim();
  let self = 0;
  let subsidy = 0;

  if (status === '보조금' || status === '보조금 동시진행') {
    const receivable1st = amountAsOf(biz.invoice_1st_amount, biz.invoice_1st_date, asOfDate)
      - amountAsOf(biz.payment_1st_amount, biz.payment_1st_date, asOfDate);
    const receivable2nd = amountAsOf(biz.invoice_2nd_amount, biz.invoice_2nd_date, asOfDate)
      - amountAsOf(biz.payment_2nd_amount, biz.payment_2nd_date, asOfDate);
    const receivableAdditional = amountAsOf(biz.additional_cost, biz.invoice_additional_date, asOfDate)
      - amountAsOf(biz.payment_additional_amount, biz.payment_additional_date, asOfDate);
    subsidy = receivable1st + receivable2nd + receivableAdditional;
  } else if (status === '자비' || status === '대리점' || status === 'AS') {
    const receivableAdvance = amountAsOf(biz.invoice_advance_amount, biz.invoice_advance_date, asOfDate)
      - amountAsOf(biz.payment_advance_amount, biz.payment_advance_date, asOfDate);
    const receivableBalance = amountAsOf(biz.invoice_balance_amount, biz.invoice_balance_date, asOfDate)
      - amountAsOf(biz.payment_balance_amount, biz.payment_balance_date, asOfDate);
    self = receivableAdvance + receivableBalance;
  }

  return { self, subsidy };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const todayKST = getTodayKST();
    const referenceDate = searchParams.get('referenceDate') || todayKST;

    const currentMonday = getMondayOfWeek(referenceDate);
    const currentSunday = addDaysUTC(currentMonday, 6);
    // 진행 중인 주는 오늘까지만 집계 (미래 데이터 없음)
    const currentEnd = currentSunday < todayKST ? currentSunday : todayKST;
    const previousMonday = addDaysUTC(currentMonday, -7);
    const previousSunday = addDaysUTC(currentMonday, -1);

    const period = {
      current: { start: currentMonday, end: currentEnd },
      previous: { start: previousMonday, end: previousSunday }
    };

    // 1. 계약 건수 (자비/보조금)
    const contractRows = await queryAll(
      `SELECT contract_type,
        COUNT(*) FILTER (WHERE contract_date BETWEEN $1 AND $2) AS current_count,
        COUNT(*) FILTER (WHERE contract_date BETWEEN $3 AND $4) AS previous_count
       FROM contract_history
       GROUP BY contract_type`,
      [currentMonday, currentEnd, previousMonday, previousSunday]
    );
    const contracts = { self: { current: 0, previous: 0 }, subsidy: { current: 0, previous: 0 } };
    for (const row of contractRows) {
      const bucket = row.contract_type === 'subsidy' ? contracts.subsidy : contracts.self;
      bucket.current = Number(row.current_count) || 0;
      bucket.previous = Number(row.previous_count) || 0;
    }

    // 2. 설치 수량 / 3. 보조금 승인 수량
    const [installRow] = await queryAll(
      `SELECT
        COUNT(*) FILTER (WHERE installation_date BETWEEN $1 AND $2) AS current_count,
        COUNT(*) FILTER (WHERE installation_date BETWEEN $3 AND $4) AS previous_count
       FROM business_info
       WHERE is_active = true AND is_deleted = false`,
      [currentMonday, currentEnd, previousMonday, previousSunday]
    );
    const [approvalRow] = await queryAll(
      `SELECT
        COUNT(*) FILTER (WHERE subsidy_approval_date BETWEEN $1 AND $2) AS current_count,
        COUNT(*) FILTER (WHERE subsidy_approval_date BETWEEN $3 AND $4) AS previous_count
       FROM business_info
       WHERE is_active = true AND is_deleted = false`,
      [currentMonday, currentEnd, previousMonday, previousSunday]
    );

    // 4. 착공실사 / 준공실사 수량
    const surveyRows = await queryAll(
      `SELECT survey_type,
        COUNT(*) FILTER (WHERE event_date BETWEEN $1 AND $2) AS current_count,
        COUNT(*) FILTER (WHERE event_date BETWEEN $3 AND $4) AS previous_count
       FROM survey_events
       WHERE survey_type IN ('pre_construction_survey', 'completion_survey')
       GROUP BY survey_type`,
      [currentMonday, currentEnd, previousMonday, previousSunday]
    );
    const surveys = {
      preConstruction: { current: 0, previous: 0 },
      completion: { current: 0, previous: 0 }
    };
    for (const row of surveyRows) {
      const bucket = row.survey_type === 'pre_construction_survey' ? surveys.preConstruction : surveys.completion;
      bucket.current = Number(row.current_count) || 0;
      bucket.previous = Number(row.previous_count) || 0;
    }

    // 5. 미수금 (자비/보조금) + 상중하 위험도 — 두 시점 모두 실시간 재계산 (별도 이력 저장 불필요)
    const businesses: ReceivableRow[] = await queryAll(
      `SELECT progress_status, installation_date,
        invoice_1st_amount, invoice_1st_date, payment_1st_amount, payment_1st_date,
        invoice_2nd_amount, invoice_2nd_date, payment_2nd_amount, payment_2nd_date,
        additional_cost, invoice_additional_date, payment_additional_amount, payment_additional_date,
        invoice_advance_amount, invoice_advance_date, payment_advance_amount, payment_advance_date,
        invoice_balance_amount, invoice_balance_date, payment_balance_amount, payment_balance_date
       FROM business_info
       WHERE is_active = true AND is_deleted = false AND installation_date IS NOT NULL`
    );

    let selfCurrent = 0, selfPrevious = 0, subsidyCurrent = 0, subsidyPrevious = 0;
    const riskCurrent = { 상: 0, 중: 0, 하: 0 };
    const riskPrevious = { 상: 0, 중: 0, 하: 0 };

    for (const biz of businesses) {
      const curR = computeReceivableAsOf(biz, currentEnd);
      const prevR = computeReceivableAsOf(biz, previousSunday);
      selfCurrent += curR.self;
      subsidyCurrent += curR.subsidy;
      selfPrevious += prevR.self;
      subsidyPrevious += prevR.subsidy;

      if (curR.self + curR.subsidy > 0) {
        const tier = calcRiskTier(biz.installation_date, currentEnd);
        if (tier) riskCurrent[tier]++;
      }
      if (prevR.self + prevR.subsidy > 0) {
        const tier = calcRiskTier(biz.installation_date, previousSunday);
        if (tier) riskPrevious[tier]++;
      }
    }

    return NextResponse.json({
      success: true,
      period,
      data: {
        contracts,
        installations: {
          current: Number(installRow?.current_count) || 0,
          previous: Number(installRow?.previous_count) || 0
        },
        subsidyApprovals: {
          current: Number(approvalRow?.current_count) || 0,
          previous: Number(approvalRow?.previous_count) || 0
        },
        surveys,
        receivables: {
          self: { current: selfCurrent, previous: selfPrevious },
          subsidy: { current: subsidyCurrent, previous: subsidyPrevious },
          riskTiers: {
            high: { current: riskCurrent.상, previous: riskPrevious.상 },
            medium: { current: riskCurrent.중, previous: riskPrevious.중 },
            low: { current: riskCurrent.하, previous: riskPrevious.하 }
          }
        }
      }
    });
  } catch (error: any) {
    console.error('❌ [Weekly Scorecard API Error]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
