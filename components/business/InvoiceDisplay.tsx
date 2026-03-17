'use client';

import React, { useState, useEffect } from 'react';
import { InvoiceDisplayCard } from './InvoiceDisplayCard';
import { formatDate } from '@/utils/formatters';
import type { InvoiceRecord } from '@/types/invoice';

interface InvoiceDisplayProps {
  businessId: string;
  businessCategory: string;  // 모든 진행구분 허용
  additionalCost?: number;
  totalRevenueOverride?: number; // 모달 상위에서 계산된 최종 매출금액 (부가세 포함)
  onReceivablesLoaded?: (receivables: number) => void;
}

// 진행구분을 보조금/자비로 매핑하는 헬퍼 함수
const mapCategoryToInvoiceType = (category: string): '보조금' | '자비' => {
  const normalized = category?.trim() || '';
  if (normalized === '보조금' || normalized === '보조금 동시진행' || normalized === '보조금 추가승인') {
    return '보조금';
  }
  if (normalized === '자비' || normalized === '대리점' || normalized === 'AS' || normalized === '외주설치') {
    return '자비';
  }
  return '자비';
};

export const InvoiceDisplay: React.FC<InvoiceDisplayProps> = ({
  businessId,
  businessCategory,
  additionalCost = 0,
  totalRevenueOverride,
  onReceivablesLoaded,
}) => {
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoiceData();
  }, [businessId, businessCategory, additionalCost]);

  const loadInvoiceData = async () => {
    try {
      setLoading(true);
      console.log('📊 [InvoiceDisplay] 계산서 데이터 로딩 시작:', businessId);
      const response = await fetch(`/api/business-invoices?business_id=${businessId}&_t=${Date.now()}`, { cache: 'no-store' });
      const result = await response.json();

      console.log('📊 [InvoiceDisplay] API 응답:', {
        success: result.success,
        hasData: !!result.data,
        invoices: result.data?.invoices,
        additional_invoice_date: result.data?.invoices?.additional?.invoice_date,
        total_receivables: result.data?.total_receivables,
        grand_total_receivables: result.data?.grand_total_receivables,
        extra_count: result.data?.invoice_records?.extra?.length,
      });

      if (result.success) {
        setInvoiceData(result.data);
        const receivables = result.data?.grand_total_receivables ?? result.data?.total_receivables ?? 0;
        onReceivablesLoaded?.(receivables);
      }
    } catch (error) {
      console.error('❌ [InvoiceDisplay] Error loading invoice data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!invoiceData) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">계산서 정보를 불러올 수 없습니다</p>
      </div>
    );
  }

  const grandTotalReceivables = invoiceData.grand_total_receivables ?? invoiceData.total_receivables ?? 0;
  // totalRevenueOverride: 모달 상위의 최종 매출금액(부가세 포함) 우선 사용, 없으면 API의 계산서 기반 금액
  const totalRevenue = totalRevenueOverride != null ? totalRevenueOverride : (invoiceData.total_revenue ?? 0);
  const totalPaymentAmount = invoiceData.total_payment_amount ?? 0;
  const extraReceivables = invoiceData.extra_receivables || 0;

  // 진행구분을 보조금/자비로 매핑
  const mappedCategory = mapCategoryToInvoiceType(businessCategory);

  // 미수금 발생 내역 계산
  const receivableDetails: { title: string; amount: number }[] = [];

  if (mappedCategory === '보조금' && invoiceData.invoices) {
    // API에서 이미 정확히 계산된 차수별 receivable 값을 직접 사용
    // (프론트에서 재계산하면 2차 입금 상쇄 등이 반영되지 않아 총 미수금과 불일치)
    const receivable1st = invoiceData.invoices.first?.receivable ?? 0;
    const receivable2nd = invoiceData.invoices.second?.receivable ?? 0;
    const receivableAdditional = invoiceData.invoices.additional?.receivable ?? 0;

    // 2차 입금이 1차 미수금을 상쇄한 경우 (2차 계산서 미발행 + 2차 입금으로 1차 미수금 처리)
    // 1차와 2차 미수금의 합산이 0 이하면 1차 항목은 실질적으로 정리된 것으로 간주하여 숨김
    const net1stAnd2nd = receivable1st + receivable2nd;
    const effective1st = receivable2nd < 0 ? Math.max(0, net1stAnd2nd) : receivable1st;
    if (effective1st > 0) receivableDetails.push({ title: '1차', amount: effective1st });
    if (receivable2nd > 0) receivableDetails.push({ title: '2차', amount: receivable2nd });
    if (receivableAdditional > 0) receivableDetails.push({ title: '추가공사비', amount: receivableAdditional });
  } else if (mappedCategory === '자비' && invoiceData.invoices) {
    const receivableAdvance = invoiceData.invoices.advance?.receivable ?? 0;
    const receivableBalance = invoiceData.invoices.balance?.receivable ?? 0;

    if (receivableAdvance > 0) receivableDetails.push({ title: '선금', amount: receivableAdvance });
    if (receivableBalance > 0) receivableDetails.push({ title: '잔금', amount: receivableBalance });
  }

  // 추가 계산서 미수금
  const extraRecords: InvoiceRecord[] = invoiceData.invoice_records?.extra || [];
  extraRecords.forEach(record => {
    const r = record.total_amount - record.payment_amount;
    if (r > 0 && record.record_type !== 'cancelled') {
      receivableDetails.push({ title: record.extra_title || '추가 계산서', amount: r });
    }
  });

  // invoice_records에서 단계별 원본 레코드 조회
  const getStageRecord = (stage: string): InvoiceRecord | null => {
    const records: InvoiceRecord[] = invoiceData.invoice_records?.[stage] || [];
    return records.find((r: InvoiceRecord) => r.record_type === 'original') || null;
  };

  return (
    <div className="space-y-3">
      {/* 총 미수금 요약 */}
      <div className={`rounded-lg p-3 border-2 ${
        grandTotalReceivables > 0
          ? 'bg-red-50 border-red-300'
          : 'bg-green-50 border-green-300'
      }`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-gray-700">📊 총 미수금</span>
          <span className={`text-base font-bold ${
            grandTotalReceivables > 0 ? 'text-red-700' : 'text-green-700'
          }`}>
            {grandTotalReceivables.toLocaleString()}원
            {grandTotalReceivables > 0 ? ' ⚠️' : ' ✅'}
          </span>
        </div>

        {/* 미수금 계산 근거 */}
        {totalRevenue > 0 && (
          <div className="text-xs text-gray-500 space-y-0.5 mb-2 pt-1 border-t border-gray-200">
            <div className="flex justify-between">
              <span>전체 매출 (부가세 포함)</span>
              <span>{totalRevenue.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span>총 입금</span>
              <span>- {totalPaymentAmount.toLocaleString()}원</span>
            </div>
          </div>
        )}

        {/* 추가 계산서 미수금 */}
        {extraReceivables > 0 && (
          <div className="text-xs text-gray-500 space-y-0.5 mb-2">
            <div className="flex justify-between">
              <span>추가 계산서 미수금</span>
              <span>{extraReceivables.toLocaleString()}원</span>
            </div>
          </div>
        )}
      </div>

      {/* 보조금 사업장 */}
      {mappedCategory === '보조금' && invoiceData.invoices && (
        <>
          <InvoiceDisplayCard
            title="1차 계산서"
            invoiceDate={invoiceData.invoices.first?.invoice_date}
            invoiceAmount={invoiceData.invoices.first?.invoice_amount}
            paymentDate={invoiceData.invoices.first?.payment_date}
            paymentAmount={invoiceData.invoices.first?.payment_amount}
            invoiceRecord={getStageRecord('subsidy_1st')}
          />

          <InvoiceDisplayCard
            title="2차 계산서"
            invoiceDate={invoiceData.invoices.second?.invoice_date}
            invoiceAmount={invoiceData.invoices.second?.invoice_amount}
            paymentDate={invoiceData.invoices.second?.payment_date}
            paymentAmount={invoiceData.invoices.second?.payment_amount}
            invoiceRecord={getStageRecord('subsidy_2nd')}
          />

          {additionalCost > 0 &&
           (invoiceData.invoices.additional?.invoice_date ||
            getStageRecord('subsidy_additional')?.issue_date) && (
            <InvoiceDisplayCard
              title="추가공사비"
              invoiceDate={invoiceData.invoices.additional?.invoice_date}
              invoiceAmount={invoiceData.invoices.additional?.invoice_amount || Math.round(additionalCost * 1.1)}
              paymentDate={invoiceData.invoices.additional?.payment_date}
              paymentAmount={invoiceData.invoices.additional?.payment_amount}
              invoiceRecord={getStageRecord('subsidy_additional')}
            />
          )}
        </>
      )}

      {/* 자비 사업장 */}
      {mappedCategory === '자비' && invoiceData.invoices && (
        <>
          <InvoiceDisplayCard
            title="선금 (기본 50%)"
            invoiceDate={invoiceData.invoices.advance?.invoice_date}
            invoiceAmount={invoiceData.invoices.advance?.invoice_amount}
            paymentDate={invoiceData.invoices.advance?.payment_date}
            paymentAmount={invoiceData.invoices.advance?.payment_amount}
            invoiceRecord={getStageRecord('self_advance')}
          />

          <InvoiceDisplayCard
            title="잔금 (기본 50%)"
            invoiceDate={invoiceData.invoices.balance?.invoice_date}
            invoiceAmount={invoiceData.invoices.balance?.invoice_amount}
            paymentDate={invoiceData.invoices.balance?.payment_date}
            paymentAmount={invoiceData.invoices.balance?.payment_amount}
            invoiceRecord={getStageRecord('self_balance')}
          />
        </>
      )}

      {/* 추가 계산서 목록 (상세 모달 읽기전용) */}
      {extraRecords.length > 0 && (
        <div className="border border-purple-200 rounded-lg p-3 bg-purple-50">
          <h4 className="text-xs font-semibold text-purple-800 mb-2">➕ 추가 계산서</h4>
          <div className="space-y-2">
            {extraRecords.map(record => {
              const receivable = record.total_amount - record.payment_amount;
              const isPaid = receivable === 0 && record.total_amount > 0;
              return (
                <div key={record.id} className="bg-white border border-purple-200 rounded p-2 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-800">{record.extra_title || '추가 계산서'}</span>
                    <span className={`font-bold ${isPaid ? 'text-green-600' : receivable > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      미수금: {receivable.toLocaleString()}원 {isPaid ? '✅' : receivable > 0 ? '⚠️' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                    <div className="flex justify-between">
                      <span>발행일</span>
                      <span>{record.issue_date ? formatDate(record.issue_date) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>합계</span>
                      <span className="text-blue-700 font-medium">{record.total_amount.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span>입금일</span>
                      <span>{record.payment_date ? formatDate(record.payment_date) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>입금</span>
                      <span className="text-green-700 font-medium">{record.payment_amount.toLocaleString()}원</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
