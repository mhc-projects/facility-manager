/**
 * 미수금 계산 유틸리티
 *
 * 핵심 공식:
 *   미수금 = 전체 매출(부가세 포함) - 총 입금액
 *
 * 규칙:
 *   - 설치일(installation_date)이 없고 입금도 없으면 미수금 = 0 (아직 매출 미발생)
 *   - 설치일 없어도 입금이 있으면 실제 거래 발생으로 간주하여 미수금 계산
 *   - 계산서 발행 여부와 무관하게 전체 매출 기준으로 계산
 *   - 전체 매출 = calculateBusinessRevenue().total_revenue × 1.1 (부가세 포함)
 *   - 총 입금액 = 진행구분에 따라 다른 필드 합산
 *   - 10원 이하 미수금은 부가세 반올림 오차로 간주하여 0 처리
 */

// 부가세 반올림 오차 허용 범위 (원)
const RECEIVABLES_TOLERANCE = 10;

/**
 * 진행구분에 따른 총 입금액 집계
 *   보조금계열: payment_1st + payment_2nd + payment_additional
 *   자비계열:   payment_advance + payment_balance
 */
export function sumAllPayments(business: Record<string, any>): number {
  const status = (business.progress_status || '').trim();
  // 추가 계산서(extra) 입금 합계 - API에서 집계된 값
  const extraPayment = Number(business.ir_extra_payment_total) || 0;

  if (status.includes('보조금')) {
    return (Number(business.payment_1st_amount) || 0)
         + (Number(business.payment_2nd_amount) || 0)
         + (Number(business.payment_additional_amount) || 0)
         + extraPayment;
  }

  // 자비, 대리점, AS, 외주설치 등
  return (Number(business.payment_advance_amount) || 0)
       + (Number(business.payment_balance_amount) || 0)
       + extraPayment;
}

/**
 * 미수금 계산 (핵심 함수)
 *
 * @param installationDate - 설치일 (없으면 0 반환)
 * @param totalRevenueWithTax - 전체 매출 (부가세 포함)
 * @param totalPayments - 총 입금액 합계
 * @param revenueAdjustments - 매출비용 조정 합계 (부가세 포함, 양수/음수 가능)
 */
export function calculateReceivables(params: {
  installationDate: string | null | undefined;
  totalRevenueWithTax: number;
  totalPayments: number;
  revenueAdjustments?: number;
}): number {
  const { installationDate, totalRevenueWithTax, totalPayments, revenueAdjustments = 0 } = params;

  // 설치일 없고 입금도 없고 매출 기준도 없으면 미수금 0 (아직 매출 미발생)
  // 단, 설치일 없어도 입금이 있거나 계산서가 발행된 경우(totalRevenueWithTax > 0)는 미수금 계산
  if (!installationDate && totalPayments === 0 && totalRevenueWithTax <= 0) return 0;

  const raw = totalRevenueWithTax + revenueAdjustments - totalPayments;
  // 10원 이하 양수는 부가세 반올림 오차로 간주하여 0 처리
  // 음수(초과 입금)는 그대로 반환
  if (raw > 0 && raw <= RECEIVABLES_TOLERANCE) return 0;
  return raw;
}
