'use client';

import React, { useState } from 'react';
import { formatDate } from '@/utils/formatters';
import type { InvoiceRecord } from '@/types/invoice';
import ExtraInvoiceForm from './ExtraInvoiceForm';

interface ExtraInvoiceListProps {
  businessId: string;
  records: InvoiceRecord[];
  onRefresh: () => void;
  userPermission?: number;  // 삭제 권한 제어 (3 이상만 삭제 가능)
}

export default function ExtraInvoiceList({
  businessId,
  records,
  onRefresh,
  userPermission = 0,
}: ExtraInvoiceListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('이 추가 계산서를 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/invoice-records?id=${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
      onRefresh();
    } catch (e: any) {
      alert('삭제 중 오류: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* 기존 추가 계산서 목록 */}
      {records.length > 0 && (
        <div className="space-y-2">
          {records.map(record => {
            const receivable = record.total_amount - record.payment_amount;
            const isFullyPaid = receivable === 0 && record.total_amount > 0;
            const isEditing = editingId === record.id;

            return (
              <div key={record.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* 카드 헤더 */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">
                      {record.extra_title || '추가 계산서'}
                    </span>
                    {record.record_type === 'cancelled' && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">취소</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isFullyPaid ? 'text-green-600' : receivable > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      미수금: {receivable.toLocaleString()}원 {isFullyPaid ? '✅' : receivable > 0 ? '⚠️' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingId(isEditing ? null : record.id)}
                      className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50"
                    >
                      {isEditing ? '접기' : '편집'}
                    </button>
                    {userPermission >= 3 && (
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        disabled={deletingId === record.id}
                        className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === record.id ? '삭제 중...' : '삭제'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 카드 요약 (편집 중이 아닐 때) */}
                {!isEditing && (
                  <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">발행일</span>
                      <span className="font-medium">{record.issue_date ? formatDate(record.issue_date) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">합계금액</span>
                      <span className="font-medium text-blue-700">{record.total_amount.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">입금일</span>
                      <span className="font-medium">{record.payment_date ? formatDate(record.payment_date) : '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">입금금액</span>
                      <span className="font-medium text-green-700">{record.payment_amount.toLocaleString()}원</span>
                    </div>
                  </div>
                )}

                {/* 편집 폼 */}
                {isEditing && (
                  <div className="p-3">
                    <ExtraInvoiceForm
                      businessId={businessId}
                      existingRecord={record}
                      onSaved={() => {
                        setEditingId(null);
                        onRefresh();
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {records.length === 0 && !showNewForm && (
        <p className="text-xs text-gray-400 text-center py-4">등록된 추가 계산서가 없습니다</p>
      )}

      {/* 새 추가 계산서 등록 버튼 */}
      {!showNewForm && (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="w-full text-xs border-2 border-dashed border-gray-300 text-gray-500 rounded-lg py-3 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + 추가 계산서 등록
        </button>
      )}

      {/* 새 추가 계산서 폼 */}
      {showNewForm && (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
          <div className="flex justify-between items-center mb-3">
            <h6 className="text-xs font-semibold text-blue-800">새 추가 계산서</h6>
          </div>
          <ExtraInvoiceForm
            businessId={businessId}
            onSaved={() => {
              setShowNewForm(false);
              onRefresh();
            }}
            onCancel={() => setShowNewForm(false)}
          />
        </div>
      )}
    </div>
  );
}
