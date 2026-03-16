'use client';

import React, { useState } from 'react';
import { formatDate } from '@/utils/formatters';
import type { InvoiceRecord } from '@/types/invoice';

interface InvoiceDisplayCardProps {
  title: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  paymentDate?: string;
  paymentAmount?: number;
  // 신규: invoice_records 데이터 (있을 경우 상세 표시)
  invoiceRecord?: InvoiceRecord | null;
}

export const InvoiceDisplayCard: React.FC<InvoiceDisplayCardProps> = ({
  title,
  invoiceDate,
  invoiceAmount,
  paymentDate,
  paymentAmount,
  invoiceRecord,
}) => {
  const [showRevisions, setShowRevisions] = useState(false);

  // invoice_records 데이터가 있으면 그것을 우선 사용
  const displayDate = invoiceRecord?.issue_date || invoiceDate;
  const displayAmount = (invoiceRecord && invoiceRecord.total_amount > 0) ? invoiceRecord.total_amount : invoiceAmount;
  const displaySupply = invoiceRecord?.supply_amount;
  const displayTax = invoiceRecord?.tax_amount;
  const displayInvoiceNumber = invoiceRecord?.invoice_number;
  const displayPaymentDate = invoiceRecord?.payment_date || paymentDate;
  const displayPaymentAmount = invoiceRecord?.payment_amount ?? paymentAmount;
  const displayPaymentMemo = invoiceRecord?.payment_memo;
  const revisions = invoiceRecord?.revisions || [];

  const receivable = (displayAmount || 0) - (displayPaymentAmount || 0);
  const hasInvoice = !!(displayAmount && displayAmount > 0);  // 날짜 없이 금액만 있어도 표시
  const hasPayment = !!(displayPaymentDate && displayPaymentAmount && displayPaymentAmount > 0);
  const hasAnyData = hasInvoice || hasPayment;
  const isFullyPaid = receivable === 0 && hasInvoice;

  const getReceivableReason = () => {
    if (!hasInvoice) return null;
    if (isFullyPaid) return null;
    if (receivable <= 0) return null;
    if (!hasPayment) return displayDate ? '계산서 발행 후 미입금' : '계산서 금액 등록 (발행일 미입력)';
    if (displayPaymentAmount && displayPaymentAmount < (displayAmount || 0)) {
      return `일부 입금 (${((displayPaymentAmount / (displayAmount || 1)) * 100).toFixed(0)}%)`;
    }
    return null;
  };

  const receivableReason = getReceivableReason();

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2 border-b border-gray-200 pb-1.5">
        <h4 className="font-semibold text-gray-800 text-xs">{title}</h4>
        {revisions.length > 0 && (
          <button
            onClick={() => setShowRevisions(!showRevisions)}
            className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
          >
            ⚠️ 수정이력 {revisions.length}건 {showRevisions ? '▴' : '▾'}
          </button>
        )}
      </div>

      {hasAnyData ? (
        <div className="space-y-1.5 text-xs">
          {/* 발행 정보 */}
          {hasInvoice && (
            <div className="bg-blue-50 rounded p-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">📄 발행일</span>
                <span className={`font-medium ${displayDate ? 'text-gray-900' : 'text-gray-400'}`}>
                  {displayDate ? formatDate(displayDate) : '미발행'}
                </span>
              </div>
              {displayInvoiceNumber && (
                <div className="flex justify-between">
                  <span className="text-gray-600">🔢 계산서번호</span>
                  <span className="font-medium text-gray-700 text-xs">{displayInvoiceNumber}</span>
                </div>
              )}
              {displaySupply !== undefined && displaySupply > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">💵 공급가액</span>
                  <span className="font-medium text-gray-700">{displaySupply.toLocaleString()}원</span>
                </div>
              )}
              {displayTax !== undefined && displayTax > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">🧾 세액</span>
                  <span className="font-medium text-gray-700">{displayTax.toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">💵 발행금액</span>
                <span className="font-semibold text-blue-700">
                  {(displayAmount || 0).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* 계산서 없이 입금만 있을 때 안내 */}
          {!hasInvoice && hasPayment && (
            <div className="bg-yellow-50 rounded p-2 border border-yellow-200">
              <p className="text-xs text-yellow-800">ℹ️ 계산서 미발행 (입금만 처리됨)</p>
            </div>
          )}

          {/* 입금 정보 */}
          <div className="bg-green-50 rounded p-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">📅 입금일</span>
              <span className="font-medium text-gray-900">
                {displayPaymentDate ? formatDate(displayPaymentDate) : <span className="text-gray-400">미입금</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">💰 입금금액</span>
              <span className="font-semibold text-green-700">
                {(displayPaymentAmount || 0).toLocaleString()}원
              </span>
            </div>
            {displayPaymentMemo && (
              <div className="flex justify-between">
                <span className="text-gray-600">📝 메모</span>
                <span className="text-gray-600 text-xs">{displayPaymentMemo}</span>
              </div>
            )}
          </div>

          {/* 미수금 */}
          <div className={`rounded p-2 ${
            isFullyPaid ? 'bg-green-100 border border-green-300' :
            receivable > 0 ? 'bg-red-50 border border-red-300' :
            'bg-gray-50 border border-gray-200'
          }`}>
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-bold">⚖️ 미수금</span>
              <span className={`text-sm font-bold ${
                isFullyPaid ? 'text-green-700' :
                receivable > 0 ? 'text-red-700' :
                'text-gray-700'
              }`}>
                {receivable.toLocaleString()}원
                {isFullyPaid && ' ✅'}
                {receivable > 0 && ' ⚠️'}
              </span>
            </div>
            {receivableReason && (
              <div className="mt-1.5 pt-1.5 border-t border-red-200">
                <p className="text-xs text-red-600">📌 {receivableReason}</p>
              </div>
            )}
          </div>

          {/* 수정발행 이력 아코디언 */}
          {revisions.length > 0 && showRevisions && (
            <div className="border border-orange-200 rounded p-2 bg-orange-50 space-y-2">
              <p className="text-xs font-semibold text-orange-700">수정발행 이력</p>
              {revisions.map((rev, idx) => (
                <div key={rev.id} className="bg-white rounded border border-orange-200 p-2 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-orange-700">수정 {idx + 1}회</span>
                      {rev.issue_date && (
                        <span className="text-gray-500 ml-2">{formatDate(rev.issue_date)}</span>
                      )}
                    </div>
                    <span className="font-bold text-orange-800">{rev.total_amount.toLocaleString()}원</span>
                  </div>
                  {rev.revised_reason && (
                    <p className="text-gray-600 mt-1">사유: {rev.revised_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-400">
          <p className="text-xs">미발행</p>
        </div>
      )}
    </div>
  );
};
