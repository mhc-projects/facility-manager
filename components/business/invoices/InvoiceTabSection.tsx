'use client';

import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import type { InvoiceCategory, InvoiceStage, InvoiceRecord, InvoiceRecordsByStage, BusinessInvoicesResponse, LegacyInvoiceStage } from '@/types/invoice';
import { INVOICE_STAGE_LABELS, getStagesForCategory } from '@/types/invoice';
import { formatDate } from '@/utils/formatters';
import InvoiceRecordForm, { type InvoiceRecordFormHandle } from './InvoiceRecordForm';
import ExtraInvoiceList from './ExtraInvoiceList';

export interface InvoiceTabSectionHandle {
  saveActiveTab: () => Promise<void>;
}

interface InvoiceTabSectionProps {
  businessId: string;
  progressStatus: string;  // 진행구분 (보조금/자비 판단용)
  userPermission?: number; // 권한 레벨 (삭제 등 제어용)
}

type TabId = InvoiceStage | 'extra';

const InvoiceTabSection = forwardRef<InvoiceTabSectionHandle, InvoiceTabSectionProps>(function InvoiceTabSection({
  businessId,
  progressStatus,
  userPermission = 0,
}: InvoiceTabSectionProps, ref) {
  const [data, setData] = useState<BusinessInvoicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('subsidy_1st');

  // 진행구분 → 카테고리 매핑
  const category: InvoiceCategory = (['보조금', '보조금 동시진행', '보조금 추가승인'].includes(progressStatus?.trim()))
    ? '보조금'
    : '자비';

  const stages = getStagesForCategory(category);

  // 초기 탭 설정
  useEffect(() => {
    setActiveTab(stages[0]);
  }, [category]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/business-invoices?business_id=${businessId}`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (e) {
      console.error('계산서 데이터 로딩 오류:', e);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 현재 활성 탭의 InvoiceRecordForm ref — hooks는 early return 전에 선언해야 함
  const activeFormRef = useRef<InvoiceRecordFormHandle>(null);

  // 부모(page.tsx)에서 호출 — 현재 활성 탭의 계산서 폼을 저장
  useImperativeHandle(ref, () => ({
    saveActiveTab: async () => {
      if (activeTab !== 'extra' && activeFormRef.current) {
        await activeFormRef.current.save();
      }
      // 'extra' 탭은 ExtraInvoiceList 내부에서 각자 저장하므로 별도 처리 불필요
    },
  }), [activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-xs text-gray-500">로딩 중...</span>
      </div>
    );
  }

  // 각 탭에서 사용할 기존 레코드 찾기
  const getExistingRecord = (stage: InvoiceStage): InvoiceRecord | null => {
    if (!data?.invoice_records) return null;
    const stageRecords = data.invoice_records[stage as keyof InvoiceRecordsByStage] || [];
    // 원본 발행 중 첫 번째 (is_active인 것)
    return stageRecords.find(r => r.record_type === 'original') || null;
  };

  // stage → business_info 기반 legacy 데이터 매핑
  const getLegacyData = (stage: InvoiceStage): LegacyInvoiceStage | null => {
    if (!data?.invoices) return null;
    const map: Record<InvoiceStage, LegacyInvoiceStage | undefined> = {
      subsidy_1st:        data.invoices.first,
      subsidy_2nd:        data.invoices.second,
      subsidy_additional: data.invoices.additional,
      self_advance:       data.invoices.advance,
      self_balance:       data.invoices.balance,
      extra:              undefined,
    };
    return map[stage] || null;
  };

  const getExtraRecords = (): InvoiceRecord[] => {
    return data?.invoice_records?.extra || [];
  };

  // 탭 라벨 (미수금 있으면 표시)
  const getTabLabel = (stage: InvoiceStage): React.ReactNode => {
    const label = INVOICE_STAGE_LABELS[stage];
    const record = getExistingRecord(stage);
    const hasReceivable = record && (record.total_amount - record.payment_amount) > 0;
    return (
      <span className="flex items-center gap-1">
        {label}
        {hasReceivable && <span className="text-red-400 text-xs">●</span>}
      </span>
    );
  };

  const extraRecords = getExtraRecords();
  const extraReceivable = data?.extra_receivables || 0;

  return (
    <div className="space-y-0">
      {/* 탭 헤더 */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {stages.map(stage => (
          <button
            key={stage}
            type="button"
            onClick={() => setActiveTab(stage)}
            className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === stage
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {getTabLabel(stage)}
          </button>
        ))}
        {/* 추가 계산서 탭 */}
        <button
          type="button"
          onClick={() => setActiveTab('extra')}
          className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === 'extra'
              ? 'border-purple-500 text-purple-600 bg-purple-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="flex items-center gap-1">
            + 추가 계산서
            {extraRecords.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                extraReceivable > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
              }`}>
                {extraRecords.length}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="pt-4">
        {/* 기존 단계 탭 */}
        {stages.map(stage => (
          activeTab === stage && (
            <div key={stage}>
              {/* 기존 발행 현황 요약 (읽기전용) */}
              {(() => {
                const record = getExistingRecord(stage);
                const legacy = getLegacyData(stage);

                if (record && (record.issue_date || record.total_amount > 0)) {
                  // invoice_records 테이블 데이터
                  const receivable = record.total_amount - record.payment_amount;
                  return (
                    <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">현재 저장된 발행 정보</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">발행일</span>
                          <span>{record.issue_date ? formatDate(record.issue_date) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">합계금액</span>
                          <span className="text-blue-700 font-medium">{record.total_amount.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">입금일</span>
                          <span>{record.payment_date ? formatDate(record.payment_date) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">미수금</span>
                          <span className={receivable > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                            {receivable.toLocaleString()}원 {receivable > 0 ? '⚠️' : '✅'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                } else if (legacy && (legacy.invoice_date || legacy.invoice_amount)) {
                  // business_info 직접 컬럼 데이터 (레거시)
                  const receivable = legacy.receivable;
                  return (
                    <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-yellow-800 mb-2">기존 등록 데이터 (하단 폼에서 상세 저장 가능)</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">발행일</span>
                          <span>{legacy.invoice_date || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">금액</span>
                          <span className="text-blue-700 font-medium">{(legacy.invoice_amount || 0).toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">입금일</span>
                          <span>{legacy.payment_date || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">미수금</span>
                          <span className={receivable > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                            {receivable.toLocaleString()}원 {receivable > 0 ? '⚠️' : '✅'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <InvoiceRecordForm
                ref={activeFormRef}
                businessId={businessId}
                stage={stage}
                stageLabel={INVOICE_STAGE_LABELS[stage]}
                existingRecord={getExistingRecord(stage)}
                legacyData={!getExistingRecord(stage) ? getLegacyData(stage) : null}
                onSaved={loadData}
              />
            </div>
          )
        ))}

        {/* 추가 계산서 탭 */}
        {activeTab === 'extra' && (
          <div>
            {/* 추가 계산서 미수금 요약 */}
            {extraRecords.length > 0 && (
              <div className={`mb-4 rounded-lg p-3 border ${
                extraReceivable > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-700">추가 계산서 미수금 합계</span>
                  <span className={`font-bold ${extraReceivable > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {extraReceivable.toLocaleString()}원 {extraReceivable > 0 ? '⚠️' : '✅'}
                  </span>
                </div>
              </div>
            )}

            <ExtraInvoiceList
              businessId={businessId}
              records={extraRecords}
              onRefresh={loadData}
              userPermission={userPermission}
            />
          </div>
        )}
      </div>

      {/* 전체 미수금 요약 */}
      {data && (
        <div className={`mt-4 pt-4 border-t border-gray-200`}>
          <div className={`rounded-lg p-3 border-2 ${
            (data.grand_total_receivables || 0) > 0
              ? 'bg-red-50 border-red-300'
              : 'bg-green-50 border-green-300'
          }`}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700">📊 전체 미수금</span>
              <span className={`text-base font-bold ${
                (data.grand_total_receivables || 0) > 0 ? 'text-red-700' : 'text-green-700'
              }`}>
                {(data.grand_total_receivables || 0).toLocaleString()}원
                {(data.grand_total_receivables || 0) > 0 ? ' ⚠️' : ' ✅'}
              </span>
            </div>
            {(data.grand_total_receivables || 0) !== (data.total_receivables || 0) && (
              <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                <div className="flex justify-between">
                  <span>기본 계산서</span>
                  <span>{(data.total_receivables || 0).toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span>추가 계산서</span>
                  <span>{(data.extra_receivables || 0).toLocaleString()}원</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default InvoiceTabSection;
