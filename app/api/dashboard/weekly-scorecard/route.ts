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
  id: string;
  business_name: string;
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

// ========================================
// 기간별 집계 공통 유틸
// ========================================

interface BusinessRef {
  id?: string;
  business_name: string;
  amount?: number;
  elapsedDays?: number;
}

interface CountPair {
  current: number;
  previous: number;
  currentBusinesses: BusinessRef[];
  previousBusinesses: BusinessRef[];
}

interface PeriodRange {
  current: { start: string; end: string };
  previous: { start: string; end: string };
}

// entry_date(KST 기준 YYYY-MM-DD 문자열)가 이번주/지난주 범위 중 어디에 속하는지 분류
function splitByPeriod<T extends { entry_date: string }>(rows: T[], period: PeriodRange): { current: T[]; previous: T[] } {
  const current: T[] = [];
  const previous: T[] = [];
  for (const row of rows) {
    if (row.entry_date >= period.current.start && row.entry_date <= period.current.end) {
      current.push(row);
    } else if (row.entry_date >= period.previous.start && row.entry_date <= period.previous.end) {
      previous.push(row);
    }
  }
  return { current, previous };
}

function toCountPair<T extends { entry_date: string }>(
  rows: T[],
  period: PeriodRange,
  mapFn: (row: T) => BusinessRef
): CountPair {
  const { current, previous } = splitByPeriod(rows, period);
  return {
    current: current.length,
    previous: previous.length,
    currentBusinesses: current.map(mapFn),
    previousBusinesses: previous.map(mapFn)
  };
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

    const period: PeriodRange = {
      current: { start: currentMonday, end: currentEnd },
      previous: { start: previousMonday, end: previousSunday }
    };

    // 1. 계약 건수 - 업무관리(facility_tasks)의 실제 업무 단계 진입 시점 기준으로 재정의.
    //    자비/보조금은 업무 흐름 자체가 달라서 "계약"이라는 하나의 개념으로 묶지 않고 단계별로 분리했다.
    //    - 자비: "계약체결"(self_contract) 단계
    //    - 보조금: "신청서접수"(subsidy_approval_pending, 라벨상 신청서접수 "필요"인 subsidy_application_submit이 아니라
    //      그 다음 단계인 "승인대기(접수완료)"가 실제 접수완료 시점이라 이걸 기준으로 함) / "승인" 단계
    //    같은 업무가 칸반에서 뒤로 갔다가 다시 그 단계로 돌아오는 재진입 사례가 실제로 있어서(task_status_history 확인),
    //    task_id별 "최초 진입 시점"만 세도록 DISTINCT ON + MIN(started_at)으로 중복을 제거한다.
    //    "탈락"은 실사용이 거의 없어(활성 업무 1건) 별도 지표로 추가하지 않기로 함.
    async function fetchFirstStatusEntries(statusValues: string[]): Promise<{ business_name: string; entry_date: string }[]> {
      const rows = await queryAll(
        `SELECT business_name, (started_at AT TIME ZONE 'Asia/Seoul')::date::text AS entry_date
         FROM (
           SELECT DISTINCT ON (task_id) task_id, business_name, started_at
           FROM task_status_history
           WHERE status = ANY($1::text[])
           ORDER BY task_id, started_at ASC
         ) first_entry`,
        [statusValues]
      );
      return rows;
    }

    const [selfContractRows, subsidyReceivedRows, subsidyApprovedTaskRows] = await Promise.all([
      fetchFirstStatusEntries(['self_contract']),
      fetchFirstStatusEntries(['subsidy_approval_pending']),
      fetchFirstStatusEntries(['subsidy_approved', 'custom_1777968825327', 'custom_1778198486933'])
    ]);

    const contracts = {
      selfContract: toCountPair(selfContractRows, period, r => ({ business_name: r.business_name })),
      subsidyReceived: toCountPair(subsidyReceivedRows, period, r => ({ business_name: r.business_name })),
      subsidyApproved: toCountPair(subsidyApprovedTaskRows, period, r => ({ business_name: r.business_name }))
    };

    // 2. 설치 수량
    const installRows = await queryAll(
      `SELECT id, business_name, installation_date AS entry_date
       FROM business_info
       WHERE is_active = true AND is_deleted = false
         AND installation_date BETWEEN $1 AND $2`,
      [previousMonday, currentEnd]
    );
    const installations = toCountPair(installRows, period, r => ({ id: r.id, business_name: r.business_name }));

    // 3. 견적실사 / 착공실사 / 준공실사 수량
    // 기존 "보조금 승인일자"(business_info.subsidy_approval_date 기준) 지표는 영업·설치 섹션의
    // 업무단계 기준 "보조금 승인"과 중복되어 제거하고, 그 자리에 견적실사를 추가했다.
    const surveyRows = await queryAll(
      `SELECT survey_type, business_id AS id, business_name, event_date AS entry_date
       FROM survey_events
       WHERE survey_type IN ('estimate_survey', 'pre_construction_survey', 'completion_survey')
         AND event_date BETWEEN $1 AND $2`,
      [previousMonday, currentEnd]
    );
    const estimateRows = surveyRows.filter((r: any) => r.survey_type === 'estimate_survey');
    const preConstructionRows = surveyRows.filter((r: any) => r.survey_type === 'pre_construction_survey');
    const completionRows = surveyRows.filter((r: any) => r.survey_type === 'completion_survey');
    const surveys = {
      estimate: toCountPair(estimateRows, period, r => ({ id: r.id, business_name: r.business_name })),
      preConstruction: toCountPair(preConstructionRows, period, r => ({ id: r.id, business_name: r.business_name })),
      completion: toCountPair(completionRows, period, r => ({ id: r.id, business_name: r.business_name }))
    };

    // 4. 미수금 (자비/보조금) + 상중하 위험도 — 두 시점 모두 실시간 재계산 (별도 이력 저장 불필요)
    const businesses: ReceivableRow[] = await queryAll(
      `SELECT id, business_name, progress_status, installation_date,
        invoice_1st_amount, invoice_1st_date, payment_1st_amount, payment_1st_date,
        invoice_2nd_amount, invoice_2nd_date, payment_2nd_amount, payment_2nd_date,
        additional_cost, invoice_additional_date, payment_additional_amount, payment_additional_date,
        invoice_advance_amount, invoice_advance_date, payment_advance_amount, payment_advance_date,
        invoice_balance_amount, invoice_balance_date, payment_balance_amount, payment_balance_date
       FROM business_info
       WHERE is_active = true AND is_deleted = false AND installation_date IS NOT NULL`
    );

    let selfCurrent = 0, selfPrevious = 0, subsidyCurrent = 0, subsidyPrevious = 0;
    const selfCurrentBiz: BusinessRef[] = [];
    const selfPreviousBiz: BusinessRef[] = [];
    const subsidyCurrentBiz: BusinessRef[] = [];
    const subsidyPreviousBiz: BusinessRef[] = [];
    const riskCurrent: Record<'상' | '중' | '하', BusinessRef[]> = { 상: [], 중: [], 하: [] };
    const riskPrevious: Record<'상' | '중' | '하', BusinessRef[]> = { 상: [], 중: [], 하: [] };
    // 변동액(Delta) 클릭용 - 금액이 0/음수인 사업장도 포함해서 부호와 무관하게 전부 모아둬야
    // "총 변동액"과 사업장별 변동액 합계가 정확히 일치한다 (미수금 목록엔 양수만 보여주는 것과는 별개)
    const selfChange: { id: string; business_name: string; amount: number }[] = [];
    const subsidyChange: { id: string; business_name: string; amount: number }[] = [];

    for (const biz of businesses) {
      const curR = computeReceivableAsOf(biz, currentEnd);
      const prevR = computeReceivableAsOf(biz, previousSunday);
      selfCurrent += curR.self;
      subsidyCurrent += curR.subsidy;
      selfPrevious += prevR.self;
      subsidyPrevious += prevR.subsidy;

      if (curR.self > 0) selfCurrentBiz.push({ id: biz.id, business_name: biz.business_name, amount: curR.self });
      if (prevR.self > 0) selfPreviousBiz.push({ id: biz.id, business_name: biz.business_name, amount: prevR.self });
      if (curR.subsidy > 0) subsidyCurrentBiz.push({ id: biz.id, business_name: biz.business_name, amount: curR.subsidy });
      if (prevR.subsidy > 0) subsidyPreviousBiz.push({ id: biz.id, business_name: biz.business_name, amount: prevR.subsidy });
      if (curR.self !== prevR.self) selfChange.push({ id: biz.id, business_name: biz.business_name, amount: curR.self - prevR.self });
      if (curR.subsidy !== prevR.subsidy) subsidyChange.push({ id: biz.id, business_name: biz.business_name, amount: curR.subsidy - prevR.subsidy });

      if (curR.self + curR.subsidy > 0) {
        const tier = calcRiskTier(biz.installation_date, currentEnd);
        if (tier) riskCurrent[tier].push({ id: biz.id, business_name: biz.business_name, elapsedDays: daysBetween(biz.installation_date!, currentEnd) });
      }
      if (prevR.self + prevR.subsidy > 0) {
        const tier = calcRiskTier(biz.installation_date, previousSunday);
        if (tier) riskPrevious[tier].push({ id: biz.id, business_name: biz.business_name, elapsedDays: daysBetween(biz.installation_date!, previousSunday) });
      }
    }

    const byAmountDesc = (a: BusinessRef, b: BusinessRef) => (b.amount || 0) - (a.amount || 0);
    const byAbsAmountDesc = (a: BusinessRef, b: BusinessRef) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0);
    const byElapsedDesc = (a: BusinessRef, b: BusinessRef) => (b.elapsedDays || 0) - (a.elapsedDays || 0);
    [selfCurrentBiz, selfPreviousBiz, subsidyCurrentBiz, subsidyPreviousBiz].forEach(list => list.sort(byAmountDesc));
    [riskCurrent.상, riskCurrent.중, riskCurrent.하, riskPrevious.상, riskPrevious.중, riskPrevious.하].forEach(list => list.sort(byElapsedDesc));
    [selfChange, subsidyChange].forEach(list => list.sort(byAbsAmountDesc));

    return NextResponse.json({
      success: true,
      period,
      data: {
        contracts,
        installations,
        surveys,
        receivables: {
          self: { current: selfCurrent, previous: selfPrevious, currentBusinesses: selfCurrentBiz, previousBusinesses: selfPreviousBiz, changeBusinesses: selfChange },
          subsidy: { current: subsidyCurrent, previous: subsidyPrevious, currentBusinesses: subsidyCurrentBiz, previousBusinesses: subsidyPreviousBiz, changeBusinesses: subsidyChange },
          riskTiers: {
            high: { current: riskCurrent.상.length, previous: riskPrevious.상.length, currentBusinesses: riskCurrent.상, previousBusinesses: riskPrevious.상 },
            medium: { current: riskCurrent.중.length, previous: riskPrevious.중.length, currentBusinesses: riskCurrent.중, previousBusinesses: riskPrevious.중 },
            low: { current: riskCurrent.하.length, previous: riskPrevious.하.length, currentBusinesses: riskCurrent.하, previousBusinesses: riskPrevious.하 }
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
