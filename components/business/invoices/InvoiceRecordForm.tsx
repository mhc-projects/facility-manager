'use client';

import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { formatDate } from '@/utils/formatters';
import type { InvoiceRecord, InvoiceStage, LegacyInvoiceStage } from '@/types/invoice';
import { INVOICE_STAGE_LABELS as STAGE_LABELS } from '@/types/invoice';
import { CacheManager } from '@/utils/cache-manager';
import InvoiceRevisionForm from './InvoiceRevisionForm';

export interface InvoiceRecordFormHandle {
  save: () => Promise<void>;
}

export interface FormState {
  issue_date: string;
  invoice_number: string;
  supply_amount: string;
  tax_amount: string;
  auto_tax: boolean;
  payment_date: string;
  payment_amount: string;
  payment_memo: string;
}

interface InvoiceRecordFormProps {
  businessId: string;
  stage: InvoiceStage;
  stageLabel: string;
  existingRecord?: InvoiceRecord | null;  // 기존 레코드 (없으면 신규 입력)
  legacyData?: LegacyInvoiceStage | null; // business_info 기반 기존 데이터 (폴백)
  onSaved: () => void;                    // 저장 후 부모 새로고침 콜백
  // 탭 전환 시 폼 상태 보존을 위한 controlled 모드 props
  initialForm?: FormState | null;         // 부모가 보관하던 폼 상태 (있으면 우선 적용)
  onFormChange?: (form: FormState) => void; // 폼 변경 시 부모에 상태 전달
}

export const emptyForm = (): FormState => ({
  issue_date: '',
  invoice_number: '',
  supply_amount: '',
  tax_amount: '',
  auto_tax: true,
  payment_date: '',
  payment_amount: '',
  payment_memo: '',
});

// ISO datetime 또는 Date 객체를 type="date" input용 YYYY-MM-DD로 정규화
const toDateString = (value: string | null | undefined): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

const InvoiceRecordForm = forwardRef<InvoiceRecordFormHandle, InvoiceRecordFormProps>(function InvoiceRecordForm({
  businessId,
  stage,
  stageLabel,
  existingRecord,
  legacyData,
  onSaved,
  initialForm,
  onFormChange,
}: InvoiceRecordFormProps, ref) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  // 폼 상태 변경 헬퍼 — 변경 시 부모에도 전달
  const updateForm = useCallback((updater: (prev: FormState) => FormState) => {
    setForm(prev => {
      const next = updater(prev);
      onFormChange?.(next);
      return next;
    });
  }, [onFormChange]);

  // 초기값 설정 우선순위:
  // 1. initialForm (탭 전환 후 복원 — 사용자가 이미 입력한 값)
  // 2. existingRecord (DB 저장된 레코드)
  // 3. legacyData (business_info 컬럼 레거시)
  // 4. 빈 폼
  useEffect(() => {
    if (initialForm) {
      // 부모가 보관하던 상태 복원 (탭 전환 시 입력값 유지)
      setForm(initialForm);
      return;
    }
    if (existingRecord) {
      const restored: FormState = {
        issue_date: toDateString(existingRecord.issue_date),
        invoice_number: existingRecord.invoice_number || '',
        supply_amount: existingRecord.supply_amount > 0 ? existingRecord.supply_amount.toLocaleString() : '',
        tax_amount: existingRecord.tax_amount > 0 ? existingRecord.tax_amount.toLocaleString() : '',
        auto_tax: false,
        payment_date: toDateString(existingRecord.payment_date),
        payment_amount: existingRecord.payment_amount > 0 ? existingRecord.payment_amount.toLocaleString() : '',
        payment_memo: existingRecord.payment_memo || '',
      };
      setForm(restored);
    } else if (legacyData && (legacyData.invoice_date || legacyData.invoice_amount || legacyData.payment_date || legacyData.payment_amount)) {
      const invoiceAmount = legacyData.invoice_amount || 0;
      const supply = Math.round(invoiceAmount / 1.1);
      const tax = invoiceAmount - supply;
      const restored: FormState = {
        issue_date: toDateString(legacyData.invoice_date),
        invoice_number: '',
        supply_amount: supply > 0 ? supply.toLocaleString() : '',
        tax_amount: tax > 0 ? tax.toLocaleString() : '',
        auto_tax: false,
        payment_date: toDateString(legacyData.payment_date),
        payment_amount: legacyData.payment_amount && legacyData.payment_amount > 0 ? legacyData.payment_amount.toLocaleString() : '',
        payment_memo: '',
      };
      setForm(restored);
    } else {
      setForm(emptyForm());
    }
  }, [existingRecord, legacyData, initialForm]);

  // 공급가액 변경 시 세액 자동계산
  const handleSupplyChange = (value: string) => {
    const raw = value.replace(/,/g, '');
    const num = parseInt(raw, 10) || 0;
    const formatted = raw === '' ? '' : (isNaN(parseInt(raw, 10)) ? value : num.toLocaleString());
    updateForm(prev => ({
      ...prev,
      supply_amount: formatted,
      tax_amount: prev.auto_tax ? Math.round(num * 0.1).toLocaleString() : prev.tax_amount,
    }));
  };

  const handleAmountChange = (field: 'tax_amount' | 'payment_amount', value: string) => {
    const raw = value.replace(/,/g, '');
    const num = parseInt(raw, 10);
    const formatted = raw === '' ? '' : (isNaN(num) ? value : num.toLocaleString());
    updateForm(prev => ({ ...prev, [field]: formatted }));
  };

  const calcTotal = () => {
    const supply = parseInt(form.supply_amount.replace(/,/g, ''), 10) || 0;
    const tax = parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0;
    return supply + tax;
  };

  const handleSave = useCallback(async () => {
    setError('');

    const supply = parseInt(form.supply_amount.replace(/,/g, ''), 10) || 0;
    const tax = parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0;

    const payload: Record<string, any> = {
      business_id: businessId,
      invoice_stage: stage,
      record_type: 'original',
      issue_date: form.issue_date || null,
      invoice_number: form.invoice_number || null,
      supply_amount: supply,
      tax_amount: tax,
      payment_date: form.payment_date || null,
      payment_amount: parseInt(form.payment_amount.replace(/,/g, ''), 10) || 0,
      payment_memo: form.payment_memo || null,
    };

    try {
      setSaving(true);

      if (existingRecord) {
        const res = await fetch('/api/invoice-records', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existingRecord.id, ...payload }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);
      } else {
        // 빈 폼이면 저장 생략 — 단, legacyData가 있으면 반드시 저장
        // (레거시 데이터의 입금일/금액을 지우는 동작이므로 빈값도 유효)
        const isBlankForm = !payload.issue_date && supply === 0 && !payload.payment_date && payload.payment_amount === 0;
        if (isBlankForm && !legacyData) {
          return;
        }
        const res = await fetch('/api/invoice-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);
      }

      // 저장 성공 후 revenue 페이지 캐시 즉시 업데이트
      const stageFieldMap: Record<string, Record<string, any>> = {
        subsidy_1st:        { invoice_1st_date: payload.issue_date, invoice_1st_amount: payload.supply_amount + (parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0), payment_1st_date: payload.payment_date, payment_1st_amount: payload.payment_amount },
        subsidy_2nd:        { invoice_2nd_date: payload.issue_date, invoice_2nd_amount: payload.supply_amount + (parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0), payment_2nd_date: payload.payment_date, payment_2nd_amount: payload.payment_amount },
        subsidy_additional: { invoice_additional_date: payload.issue_date, payment_additional_date: payload.payment_date, payment_additional_amount: payload.payment_amount },
        self_advance:       { invoice_advance_date: payload.issue_date, invoice_advance_amount: payload.supply_amount + (parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0), payment_advance_date: payload.payment_date, payment_advance_amount: payload.payment_amount },
        self_balance:       { invoice_balance_date: payload.issue_date, invoice_balance_amount: payload.supply_amount + (parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0), payment_balance_date: payload.payment_date, payment_balance_amount: payload.payment_amount },
      };
      const fieldsToSync = stageFieldMap[stage];
      if (fieldsToSync) {
        CacheManager.updateBusinessFields(businessId, fieldsToSync);
        Object.entries(fieldsToSync).forEach(([field, value]) => {
          CacheManager.broadcastFieldUpdate(businessId, field, value);
        });
      }

      onSaved();
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다');
      throw e; // 전체 저장 흐름에서 에러 감지용
    } finally {
      setSaving(false);
    }
  }, [form, existingRecord, businessId, stage, onSaved]);

  // 부모(InvoiceTabSection)에서 호출할 수 있도록 save 메서드 노출
  useImperativeHandle(ref, () => ({
    save: handleSave,
  }), [handleSave]);

  const total = calcTotal();
  const hasExistingRecord = !!existingRecord;

  return (
    <div className="space-y-3">
      {/* 발행정보 + 입금정보 2컬럼 가로 배치 */}
      <div className="grid grid-cols-2 gap-2">

        {/* 왼쪽: 계산서 발행 정보 */}
        <div className="bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-200 space-y-2">
          <h5 className="text-xs font-semibold text-blue-800">📄 발행 정보</h5>

          {/* 발행일 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">발행일</label>
            <input
              type="date"
              value={form.issue_date}
              onChange={e => updateForm(prev => ({ ...prev, issue_date: e.target.value }))}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 계산서 번호 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">계산서 번호 <span className="text-gray-400">(선택)</span></label>
            <input
              type="text"
              value={form.invoice_number}
              onChange={e => updateForm(prev => ({ ...prev, invoice_number: e.target.value }))}
              placeholder="승인번호/문서번호"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* 공급가액 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">공급가액 <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={form.supply_amount}
                onChange={e => handleSupplyChange(e.target.value)}
                placeholder="0"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
              />
              <span className="text-[11px] text-gray-400">원</span>
            </div>
          </div>

          {/* 세액 */}
          <div>
            <label className="flex items-center text-[11px] text-gray-500 mb-0.5 gap-1">
              세액
              <label className="flex items-center text-[11px] text-blue-600 cursor-pointer font-normal">
                <input
                  type="checkbox"
                  checked={form.auto_tax}
                  onChange={e => {
                    const checked = e.target.checked;
                    updateForm(prev => ({
                      ...prev,
                      auto_tax: checked,
                      tax_amount: checked
                        ? Math.round((parseInt(prev.supply_amount.replace(/,/g, ''), 10) || 0) * 0.1).toLocaleString()
                        : prev.tax_amount,
                    }));
                  }}
                  className="mr-0.5 w-3 h-3"
                />
                자동(10%)
              </label>
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={form.tax_amount}
                onChange={e => handleAmountChange('tax_amount', e.target.value)}
                disabled={form.auto_tax}
                placeholder="0"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-right disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-[11px] text-gray-400">원</span>
            </div>
          </div>

          {/* 합계금액 */}
          <div className="flex justify-between items-center bg-blue-100 rounded px-2 py-1.5 mt-1">
            <span className="text-[11px] font-semibold text-blue-700">합계</span>
            <span className="text-xs font-bold text-blue-800">{total.toLocaleString()}원</span>
          </div>
        </div>

        {/* 오른쪽: 입금 정보 */}
        <div className="bg-green-50 rounded-lg px-3 py-2.5 border border-green-200 space-y-2">
          <h5 className="text-xs font-semibold text-green-800">💰 입금 정보</h5>

          {/* 입금일 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">입금일</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={e => updateForm(prev => ({ ...prev, payment_date: e.target.value }))}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
          </div>

          {/* 입금금액 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">입금금액</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={form.payment_amount}
                onChange={e => handleAmountChange('payment_amount', e.target.value)}
                placeholder="0"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 text-right"
              />
              <span className="text-[11px] text-gray-400">원</span>
            </div>
          </div>

          {/* 입금 메모 */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">메모 <span className="text-gray-400">(선택)</span></label>
            <input
              type="text"
              value={form.payment_memo}
              onChange={e => updateForm(prev => ({ ...prev, payment_memo: e.target.value }))}
              placeholder="분납, 특이사항 등"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
          </div>

          {/* 미수금 표시 (기존 레코드 있을 때) */}
          {hasExistingRecord && (
            <div className={`flex justify-between items-center rounded px-2 py-1.5 mt-1 ${
              (total - (parseInt(form.payment_amount.replace(/,/g, ''), 10) || 0)) > 0
                ? 'bg-red-50 border border-red-200'
                : 'bg-green-100'
            }`}>
              <span className="text-[11px] font-semibold text-gray-600">미수금</span>
              <span className={`text-xs font-bold ${
                (total - (parseInt(form.payment_amount.replace(/,/g, ''), 10) || 0)) > 0
                  ? 'text-red-700'
                  : 'text-green-700'
              }`}>
                {(total - (parseInt(form.payment_amount.replace(/,/g, ''), 10) || 0)).toLocaleString()}원
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          ⚠️ {error}
        </div>
      )}

      {/* 수정발행 버튼 (수정발행 이력 전용 - 저장은 헤더 수정완료 버튼으로 통합) */}
      {hasExistingRecord && existingRecord.record_type !== 'cancelled' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowRevisionForm(!showRevisionForm)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              showRevisionForm
                ? 'bg-orange-100 text-orange-700 border-orange-400'
                : 'text-orange-600 border-orange-300 hover:bg-orange-50'
            }`}
          >
            {showRevisionForm ? '취소' : '수정발행'}
          </button>
        </div>
      )}

      {/* 수정발행 섹션 */}
      {hasExistingRecord && existingRecord.record_type !== 'cancelled' && (
        <div>
          {/* 기존 수정이력 */}
          {existingRecord.revisions && existingRecord.revisions.length > 0 && (
            <div className="space-y-1.5 mb-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">수정발행 이력</p>
              {existingRecord.revisions.map(rev => (
                <div key={rev.id} className="bg-orange-50 border border-orange-200 rounded px-3 py-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-orange-700">수정발행</span>
                      {rev.issue_date && (
                        <span className="text-[11px] text-gray-500">{formatDate(rev.issue_date)}</span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-orange-800">{rev.total_amount.toLocaleString()}원</span>
                  </div>
                  {rev.revised_reason && (
                    <p className="text-[11px] text-gray-500 mt-0.5">사유: {rev.revised_reason}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    원본 {existingRecord.total_amount.toLocaleString()}원 → 수정 {rev.total_amount.toLocaleString()}원
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 수정발행 폼 */}
          {showRevisionForm && (
            <InvoiceRevisionForm
              businessId={businessId}
              stage={stage}
              originalRecord={existingRecord}
              onSaved={() => {
                setShowRevisionForm(false);
                onSaved();
              }}
              onCancel={() => setShowRevisionForm(false)}
            />
          )}
        </div>
      )}
    </div>
  );
});

export default InvoiceRecordForm;
