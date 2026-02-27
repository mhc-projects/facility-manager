/**
 * 미수금 계산 유틸리티
 *
 * 핵심 공식:
 *   미수금 = 전체 매출(부가세 포함) - 총 입금액
 *
 * 규칙:
 *   - 설치일(installation_date)이 없으면 미수금 = 0 (아직 매출 미발생)
 *   - 계산서 발행 여부와 무관하게 전체 매출 기준으로 계산
 *   - 전체 매출 = calculateBusinessRevenue().total_revenue × 1.1 (부가세 포함)
 *   - 총 입금액 = 진행구분에 따라 다른 필드 합산
 */

/**
 * 진행구분에 따른 총 입금액 집계
 *   보조금계열: payment_1st + payment_2nd + payment_additional
 *   자비계열:   payment_advance + payment_balance
 */
export function sumAllPayments(business: Record<string, any>): number {
  const status = (business.progress_status || '').trim();

  if (status.includes('보조금')) {
    return (Number(business.payment_1st_amount) || 0)
         + (Number(business.payment_2nd_amount) || 0)
         + (Number(business.payment_additional_amount) || 0);
  }

  // 자비, 대리점, AS, 외주설치 등
  return (Number(business.payment_advance_amount) || 0)
       + (Number(business.payment_balance_amount) || 0);
}

/**
 * 미수금 계산 (핵심 함수)
 *
 * @param installationDate - 설치일 (없으면 0 반환)
 * @param totalRevenueWithTax - 전체 매출 (부가세 포함)
 * @param totalPayments - 총 입금액 합계
 */
export function calculateReceivables(params: {
  installationDate: string | null | undefined;
  totalRevenueWithTax: number;
  totalPayments: number;
}): number {
  const { installationDate, totalRevenueWithTax, totalPayments } = params;

  // 설치일 없으면 미수금 0 (아직 매출 미발생)
  if (!installationDate) return 0;

  return Math.max(0, totalRevenueWithTax - totalPayments);
}
