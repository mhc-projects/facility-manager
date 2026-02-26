'use client';

import React, { useState } from 'react';
import type { InvoiceRecord, InvoiceStage } from '@/types/invoice';

interface InvoiceRevisionFormProps {
  businessId: string;
  stage: InvoiceStage;
  originalRecord: InvoiceRecord;
  onSaved: () => void;
  onCancel: () => void;
}

export default function InvoiceRevisionForm({
  businessId,
  stage,
  originalRecord,
  onSaved,
  onCancel,
}: InvoiceRevisionFormProps) {
  const [form, setForm] = useState({
    issue_date: '',
    revised_reason: '',
    supply_amount: '',
    tax_amount: '',
    auto_tax: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSupplyChange = (value: string) => {
    const num = parseInt(value.replace(/,/g, ''), 10) || 0;
    setForm(prev => ({
      ...prev,
      supply_amount: value,
      tax_amount: prev.auto_tax ? String(Math.round(num * 0.1)) : prev.tax_amount,
    }));
  };

  const calcTotal = () => {
    const supply = parseInt(form.supply_amount.replace(/,/g, ''), 10) || 0;
    const tax = parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0;
    return supply + tax;
  };

  const handleSave = async () => {
    if (!form.revised_reason.trim()) {
      setError('수정 사유를 입력해주세요');
      return;
    }
    const supply = parseInt(form.supply_amount.replace(/,/g, ''), 10) || 0;
    if (supply <= 0) {
      setError('수정 공급가액을 입력해주세요');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const tax = parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0;

      const res = await fetch('/api/invoice-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          invoice_stage: stage,
          record_type: 'revised',
          parent_record_id: originalRecord.id,
          revised_reason: form.revised_reason,
          issue_date: form.issue_date || null,
          supply_amount: supply,
          tax_amount: tax,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      onSaved();
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const total = calcTotal();

  return (
    <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h6 className="text-xs font-semibold text-orange-800">⚠️ 수정발행 등록</h6>
        <span className="text-xs text-gray-500">
          원본: {originalRecord.total_amount.toLocaleString()}원
        </span>
      </div>

      {/* 수정발행일 */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">수정발행일</label>
        <input
          type="date"
          value={form.issue_date}
          onChange={e => setForm(prev => ({ ...prev, issue_date: e.target.value }))}
          className="w-full text-xs border border-orange-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
      </div>

      {/* 수정 사유 */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">수정 사유 <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={form.revised_reason}
          onChange={e => setForm(prev => ({ ...prev, revised_reason: e.target.value }))}
          placeholder="예: 공급가액 오기, 거래처 정보 변경"
          className="w-full text-xs border border-orange-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
      </div>

      {/* 수정 금액 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">수정 공급가액 <span className="text-red-400">*</span></label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={form.supply_amount}
              onChange={e => handleSupplyChange(e.target.value)}
              placeholder="0"
              className="flex-1 text-xs border border-orange-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 text-right"
            />
            <span className="text-xs text-gray-500">원</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">
            세액
            <label className="ml-2 text-xs text-orange-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_tax}
                onChange={e => {
                  const checked = e.target.checked;
                  setForm(prev => ({
                    ...prev,
                    auto_tax: checked,
                    tax_amount: checked
                      ? String(Math.round((parseInt(prev.supply_amount.replace(/,/g, ''), 10) || 0) * 0.1))
                      : prev.tax_amount,
                  }));
                }}
                className="mr-1"
              />
              자동(10%)
            </label>
          </label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={form.tax_amount}
              onChange={e => setForm(prev => ({ ...prev, tax_amount: e.target.value }))}
              disabled={form.auto_tax}
              placeholder="0"
              className="flex-1 text-xs border border-orange-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 text-right disabled:bg-gray-100"
            />
            <span className="text-xs text-gray-500">원</span>
          </div>
        </div>
      </div>

      {/* 합계 */}
      <div className="flex justify-between items-center bg-orange-100 rounded px-3 py-2">
        <span className="text-xs font-semibold text-orange-700">수정 합계</span>
        <div className="text-right">
          <span className="text-xs text-gray-500 line-through mr-2">{originalRecord.total_amount.toLocaleString()}원</span>
          <span className="text-sm font-bold text-orange-800">{total.toLocaleString()}원</span>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          ⚠️ {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-orange-500 text-white text-xs font-semibold px-3 py-2 rounded hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중...' : '수정발행 저장'}
        </button>
      </div>
    </div>
  );
}
