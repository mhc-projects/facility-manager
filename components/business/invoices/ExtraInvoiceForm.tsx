'use client';

import React, { useState, useEffect } from 'react';
import type { InvoiceRecord } from '@/types/invoice';

interface ExtraInvoiceFormProps {
  businessId: string;
  existingRecord?: InvoiceRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

const toDateString = (value: string | null | undefined): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
};

export default function ExtraInvoiceForm({
  businessId,
  existingRecord,
  onSaved,
  onCancel,
}: ExtraInvoiceFormProps) {
  const [form, setForm] = useState({
    extra_title: '',
    issue_date: '',
    invoice_number: '',
    supply_amount: '',
    tax_amount: '',
    auto_tax: true,
    payment_date: '',
    payment_amount: '',
    payment_memo: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existingRecord) {
      setForm({
        extra_title: existingRecord.extra_title || '',
        issue_date: toDateString(existingRecord.issue_date),
        invoice_number: existingRecord.invoice_number || '',
        supply_amount: existingRecord.supply_amount > 0 ? existingRecord.supply_amount.toLocaleString() : '',
        tax_amount: existingRecord.tax_amount > 0 ? existingRecord.tax_amount.toLocaleString() : '',
        auto_tax: false,
        payment_date: toDateString(existingRecord.payment_date),
        payment_amount: existingRecord.payment_amount > 0 ? existingRecord.payment_amount.toLocaleString() : '',
        payment_memo: existingRecord.payment_memo || '',
      });
    }
  }, [existingRecord]);

  const handleSupplyChange = (value: string) => {
    const raw = value.replace(/,/g, '');
    const num = parseInt(raw, 10) || 0;
    const formatted = raw === '' ? '' : (isNaN(parseInt(raw, 10)) ? value : num.toLocaleString());
    setForm(prev => ({
      ...prev,
      supply_amount: formatted,
      tax_amount: prev.auto_tax ? Math.round(num * 0.1).toLocaleString() : prev.tax_amount,
    }));
  };

  const handleAmountChange = (field: 'tax_amount' | 'payment_amount', value: string) => {
    const raw = value.replace(/,/g, '');
    const num = parseInt(raw, 10);
    const formatted = raw === '' ? '' : (isNaN(num) ? value : num.toLocaleString());
    setForm(prev => ({ ...prev, [field]: formatted }));
  };

  const calcTotal = () => {
    const supply = parseInt(form.supply_amount.replace(/,/g, ''), 10) || 0;
    const tax = parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0;
    return supply + tax;
  };

  const handleSave = async () => {
    if (!form.extra_title.trim()) {
      setError('계산서 제목을 입력해주세요');
      return;
    }
    setError('');
    setSaving(true);

    const supply = parseInt(form.supply_amount.replace(/,/g, ''), 10) || 0;
    const tax = parseInt(form.tax_amount.replace(/,/g, ''), 10) || 0;

    try {
      if (existingRecord) {
        const res = await fetch('/api/invoice-records', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingRecord.id,
            extra_title: form.extra_title,
            issue_date: form.issue_date || null,
            invoice_number: form.invoice_number || null,
            supply_amount: supply,
            tax_amount: tax,
            payment_date: form.payment_date || null,
            payment_amount: parseInt(form.payment_amount.replace(/,/g, ''), 10) || 0,
            payment_memo: form.payment_memo || null,
          }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);
      } else {
        const res = await fetch('/api/invoice-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            invoice_stage: 'extra',
            extra_title: form.extra_title,
            record_type: 'original',
            issue_date: form.issue_date || null,
            invoice_number: form.invoice_number || null,
            supply_amount: supply,
            tax_amount: tax,
            payment_date: form.payment_date || null,
            payment_amount: parseInt(form.payment_amount.replace(/,/g, ''), 10) || 0,
            payment_memo: form.payment_memo || null,
          }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const total = calcTotal();

  return (
    <div className="space-y-3">
      {/* 계산서 제목 */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">계산서 제목 <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={form.extra_title}
          onChange={e => setForm(prev => ({ ...prev, extra_title: e.target.value }))}
          placeholder="예: 3차 계산서, AS 비용, 자재비"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* 발행 정보 */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 space-y-3">
        <h6 className="text-xs font-semibold text-blue-800">📄 발행 정보</h6>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">발행일</label>
            <input
              type="date"
              value={form.issue_date}
              onChange={e => setForm(prev => ({ ...prev, issue_date: e.target.value }))}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">계산서 번호 <span className="text-gray-400">(선택)</span></label>
            <input
              type="text"
              value={form.invoice_number}
              onChange={e => setForm(prev => ({ ...prev, invoice_number: e.target.value }))}
              placeholder="문서번호"
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">공급가액</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={form.supply_amount}
                onChange={e => handleSupplyChange(e.target.value)}
                placeholder="0"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <span className="text-xs text-gray-500">원</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              세액
              <label className="ml-2 text-xs text-blue-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_tax}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(prev => ({
                      ...prev,
                      auto_tax: checked,
                      tax_amount: checked
                        ? Math.round((parseInt(prev.supply_amount.replace(/,/g, ''), 10) || 0) * 0.1).toLocaleString()
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
                onChange={e => handleAmountChange('tax_amount', e.target.value)}
                disabled={form.auto_tax}
                placeholder="0"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100"
              />
              <span className="text-xs text-gray-500">원</span>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center bg-blue-100 rounded px-3 py-2">
          <span className="text-xs font-semibold text-blue-700">합계금액</span>
          <span className="text-sm font-bold text-blue-800">{total.toLocaleString()}원</span>
        </div>
      </div>

      {/* 입금 정보 */}
      <div className="bg-green-50 rounded-lg p-3 border border-green-200 space-y-3">
        <h6 className="text-xs font-semibold text-green-800">💰 입금 정보</h6>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">입금일</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={e => setForm(prev => ({ ...prev, payment_date: e.target.value }))}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">입금금액</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={form.payment_amount}
                onChange={e => handleAmountChange('payment_amount', e.target.value)}
                placeholder="0"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-green-400"
              />
              <span className="text-xs text-gray-500">원</span>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">입금 메모 <span className="text-gray-400">(선택)</span></label>
          <input
            type="text"
            value={form.payment_memo}
            onChange={e => setForm(prev => ({ ...prev, payment_memo: e.target.value }))}
            placeholder="분납, 특이사항 등"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
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
          className="flex-1 bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중...' : (existingRecord ? '수정 저장' : '추가 계산서 저장')}
        </button>
      </div>
    </div>
  );
}
