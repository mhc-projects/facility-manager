'use client';

import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import type { InvoiceCategory, InvoiceStage, InvoiceRecord, InvoiceRecordsByStage, BusinessInvoicesResponse, LegacyInvoiceStage } from '@/types/invoice';
import { INVOICE_STAGE_LABELS, getStagesForCategory } from '@/types/invoice';
import { formatDate } from '@/utils/formatters';
import InvoiceRecordForm, { type InvoiceRecordFormHandle, type FormState, emptyForm } from './InvoiceRecordForm';
import ExtraInvoiceList from './ExtraInvoiceList';

export interface InvoiceTabSectionHandle {
  saveAllPendingTabs: () => Promise<void>;
}

interface InvoiceTabSectionProps {
  businessId: string;
  progressStatus: string;  // 진행구분 (보조금/자비 판단용)
  userPermission?: number; // 권한 레벨 (삭제 등 제어용)
  refreshTrigger?: number; // 외부에서 강제 리로드 요청 시 증가
  onRefresh?: () => void;  // 내부 저장 완료 후 외부(ReceivablesBanner 등)에 갱신 요청
}

type TabId = InvoiceStage | 'extra';

const InvoiceTabSection = forwardRef<InvoiceTabSectionHandle, InvoiceTabSectionProps>(function InvoiceTabSection({
  businessId,
  progressStatus,
  userPermission = 0,
  refreshTrigger = 0,
  onRefresh,
}: InvoiceTabSectionProps, ref) {
  const [data, setData] = useState<BusinessInvoicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('subsidy_1st');

  // 탭별 폼 상태 보존 — 탭을 이동해도 입력값 유지
  const [pendingForms, setPendingForms] = useState<Partial<Record<InvoiceStage, FormState>>>({});

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
      const timestamp = Date.now();
      const res = await fetch(`/api/business-invoices?business_id=${businessId}&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        // 새 데이터 로드 시 pendingForms 초기화 (저장 후 새로고침 시)
        setPendingForms({});
      }
    } catch (e) {
      console.error('계산서 데이터 로딩 오류:', e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, refreshTrigger]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 현재 활성 탭의 InvoiceRecordForm ref
  const activeFormRef = useRef<InvoiceRecordFormHandle>(null);

  // 부모(page.tsx)에서 호출 — 변경된 모든 탭의 계산서 폼을 저장
  useImperativeHandle(ref, () => ({
    saveAllPendingTabs: async () => {
      const stagesWithPending = stages.filter(stage => {
        const pending = pendingForms[stage];
        if (!pending) return false;
        // 기존 invoice_records 레코드가 있으면 항상 저장 (빈값도 유효한 수정)
        if (getExistingRecord(stage)) return true;
        // legacyData(business_info 레거시)가 있으면 항상 저장 (레거시 데이터 삭제 의도 반영)
        if (getLegacyData(stage)) return true;
        // 신규 레코드이고 레거시도 없으면 빈 폼만 건너뜀
        const hasData = pending.issue_date || pending.supply_amount || pending.payment_date || pending.payment_amount;
        return !!hasData;
      });

      if (stagesWithPending.length === 0) {
        // pending 없으면 현재 활성 탭만 시도 (기존 동작 호환)
        if (activeTab !== 'extra' && activeFormRef.current) {
          await activeFormRef.current.save();
          await loadData();
          onRefresh?.();
        }
        return;
      }

      // 현재 활성 탭이 pending에 포함되어 있으면 ref로 직접 저장 (최신 상태 반영)
      // 비활성 탭은 pendingForms 상태를 이용해 InvoiceRecordForm을 임시 마운트 없이
      // 직접 API 호출로 저장
      const errors: string[] = [];

      for (const stage of stagesWithPending) {
        if (stage === activeTab && activeFormRef.current) {
          // 현재 탭: ref로 저장
          try {
            await activeFormRef.current.save();
          } catch (e: any) {
            errors.push(`${INVOICE_STAGE_LABELS[stage]}: ${e.message || '저장 실패'}`);
          }
        } else {
          // 비활성 탭: pendingForms에서 직접 API 저장
          const formState = pendingForms[stage]!;
          try {
            await saveFormDirectly(stage, formState);
          } catch (e: any) {
            errors.push(`${INVOICE_STAGE_LABELS[stage]}: ${e.message || '저장 실패'}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`일부 계산서 저장 실패:\n${errors.join('\n')}`);
      }

      // 저장 완료 후 최신 데이터 반영: 폼 상태 초기화 + 외부 배너 갱신
      await loadData();
      onRefresh?.();
    },
  }), [activeTab, pendingForms, stages, loadData, onRefresh, data]);

  // 비활성 탭 폼을 직접 API로 저장
  const saveFormDirectly = async (stage: InvoiceStage, formState: FormState) => {
    const supply = parseInt(formState.supply_amount.replace(/,/g, ''), 10) || 0;
    const tax = parseInt(formState.tax_amount.replace(/,/g, ''), 10) || 0;
    const paymentAmount = parseInt(formState.payment_amount.replace(/,/g, ''), 10) || 0;

    const existingRecord = getExistingRecord(stage);

    const payload: Record<string, any> = {
      business_id: businessId,
      invoice_stage: stage,
      record_type: 'original',
      issue_date: formState.issue_date || null,
      invoice_number: formState.invoice_number || null,
      supply_amount: supply,
      tax_amount: tax,
      payment_date: formState.payment_date || null,
      payment_amount: paymentAmount,
      payment_memo: formState.payment_memo || null,
    };

    if (existingRecord) {
      const res = await fetch('/api/invoice-records', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existingRecord.id, ...payload }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
    } else {
      const res = await fetch('/api/invoice-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
    }
  };

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

  // 탭에 미저장 변경사항이 있는지 확인
  const hasPendingChanges = (stage: InvoiceStage): boolean => {
    const pending = pendingForms[stage];
    if (!pending) return false;
    // 기존 invoice_records 레코드 또는 legacyData가 있으면 빈값도 변경사항
    if (getExistingRecord(stage) || getLegacyData(stage)) return true;
    // 신규이고 레거시도 없으면 실제 입력값이 있을 때만 변경사항
    return !!(pending.issue_date || pending.supply_amount || pending.payment_date || pending.payment_amount);
  };

  // 탭 라벨 (미수금 있으면 표시, 미저장 변경사항 있으면 표시)
  const getTabLabel = (stage: InvoiceStage): React.ReactNode => {
    const label = INVOICE_STAGE_LABELS[stage];
    const record = getExistingRecord(stage);
    const hasReceivable = record && (record.total_amount - record.payment_amount) > 0;
    const isDirty = hasPendingChanges(stage);
    return (
      <span className="flex items-center gap-1">
        {label}
        {hasReceivable && <span className="text-red-400 text-xs">●</span>}
        {isDirty && <span className="text-amber-500 text-xs" title="미저장 변경사항">✎</span>}
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

      {/* 미저장 안내 배너 */}
      {stages.some(hasPendingChanges) && (
        <div className="mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-1.5">
          <span>✎</span>
          <span>입력된 내용이 있습니다. 상단 <strong>수정완료</strong> 버튼을 누르면 모든 탭의 계산서가 함께 저장됩니다.</span>
        </div>
      )}

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
                // 탭 전환 시 보존된 상태 복원
                initialForm={pendingForms[stage] ?? null}
                // 폼 변경 시 pendingForms에 저장
                onFormChange={(formState) => {
                  setPendingForms(prev => ({ ...prev, [stage]: formState }));
                }}
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
