'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, TrendingUp, TrendingDown, Trash2, AlertCircle } from 'lucide-react';
import { TokenManager } from '@/lib/api-client';

interface PriceAdjustment {
  id: string;
  adjustment_type: 'revenue' | 'cost';
  amount: number;
  reason: string;
  created_by_name: string | null;
  created_at: string;
}

interface AsPricingAdjustmentTabProps {
  recordId: string;
  // 자동 계산 금액 (자재 + 출동)
  materialCost: number;
  dispatchCost: number;
  materialRevenue: number;
  dispatchRevenue: number;
  currentUserName: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

const parseAmount = (raw: string): number => {
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9]/g, '');
  return cleaned === '' ? 0 : Number(cleaned);
};

export default function AsPricingAdjustmentTab({
  recordId,
  materialCost,
  dispatchCost,
  materialRevenue,
  dispatchRevenue,
  currentUserName,
}: AsPricingAdjustmentTabProps) {
  const authHeader = () => ({ Authorization: `Bearer ${TokenManager.getToken()}` });

  const [adjustments, setAdjustments] = useState<PriceAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  // 새 조정 입력 상태
  const [newType, setNewType] = useState<'revenue' | 'cost'>('revenue');
  const [newSign, setNewSign] = useState<'+' | '-'>('+');
  const [newAmountStr, setNewAmountStr] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState('');

  // 필터
  const [filter, setFilter] = useState<'all' | 'revenue' | 'cost'>('all');

  const fetchAdjustments = useCallback(async () => {
    try {
      const res = await fetch(`/api/as-records/${recordId}/adjustments`, {
        headers: authHeader(),
      });
      const json = await res.json();
      if (json.success) {
        setAdjustments(json.data);
      }
    } catch (e) {
      console.error('조정 이력 로딩 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  const handleAdd = async () => {
    setFormError('');
    const amount = parseAmount(newAmountStr);
    if (amount === 0) {
      setFormError('금액을 입력해주세요');
      return;
    }
    if (!newReason.trim()) {
      setFormError('조정 사유를 입력해주세요');
      return;
    }

    setAdding(true);
    try {
      const signedAmount = newSign === '-' ? -amount : amount;
      const res = await fetch(`/api/as-records/${recordId}/adjustments`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustment_type: newType,
          amount: signedAmount,
          reason: newReason.trim(),
          created_by_name: currentUserName || null,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setFormError(json.error || '추가 실패');
        return;
      }
      // 목록에 즉시 반영
      setAdjustments(prev => [...prev, json.data]);
      // 폼 초기화
      setNewAmountStr('');
      setNewReason('');
      setNewSign('+');
    } catch (e) {
      setFormError('추가 중 오류가 발생했습니다');
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (adj: PriceAdjustment) => {
    if (!confirm(`이 조정 항목을 취소하시겠습니까?\n\n[${adj.adjustment_type === 'revenue' ? '매출' : '매입'} ${adj.amount >= 0 ? '+' : ''}${fmt(adj.amount)}원]\n${adj.reason}`)) {
      return;
    }
    try {
      const res = await fetch(`/api/as-records/${recordId}/adjustments/${adj.id}`, {
        method: 'DELETE',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted_by_name: currentUserName || null }),
      });
      const json = await res.json();
      if (json.success) {
        setAdjustments(prev => prev.filter(a => a.id !== adj.id));
      } else {
        alert(json.error || '취소 실패');
      }
    } catch (e) {
      console.error('조정 취소 실패:', e);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 합계 계산
  const revenueAdj = adjustments
    .filter(a => a.adjustment_type === 'revenue')
    .reduce((s, a) => s + Number(a.amount), 0);
  const costAdj = adjustments
    .filter(a => a.adjustment_type === 'cost')
    .reduce((s, a) => s + Number(a.amount), 0);

  const totalRevenue = dispatchRevenue + materialRevenue + revenueAdj;
  const totalCost = dispatchCost + materialCost + costAdj;

  const filtered = filter === 'all' ? adjustments : adjustments.filter(a => a.adjustment_type === filter);

  const INPUT_CLS = 'px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all placeholder:text-gray-400';

  return (
    <div className="space-y-5">

      {/* 금액 요약 카드 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 매출 */}
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">매출</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>출동 매출</span>
              <span className="tabular-nums font-medium">{fmt(dispatchRevenue)}원</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>자재 매출</span>
              <span className="tabular-nums font-medium">{fmt(materialRevenue)}원</span>
            </div>
            {revenueAdj !== 0 && (
              <div className={`flex justify-between font-medium ${revenueAdj > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                <span>조정 합계</span>
                <span className="tabular-nums">{revenueAdj > 0 ? '+' : ''}{fmt(revenueAdj)}원</span>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-emerald-200 flex justify-between items-baseline">
            <span className="text-xs text-emerald-700 font-semibold">최종 매출</span>
            <span className="text-base font-bold text-emerald-700 tabular-nums">{fmt(totalRevenue)}원</span>
          </div>
        </div>

        {/* 매입 */}
        <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4 space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">매입 (원가)</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>출동 원가</span>
              <span className="tabular-nums font-medium">{fmt(dispatchCost)}원</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>자재 원가</span>
              <span className="tabular-nums font-medium">{fmt(materialCost)}원</span>
            </div>
            {costAdj !== 0 && (
              <div className={`flex justify-between font-medium ${costAdj > 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                <span>조정 합계</span>
                <span className="tabular-nums">{costAdj > 0 ? '+' : ''}{fmt(costAdj)}원</span>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-orange-200 flex justify-between items-baseline">
            <span className="text-xs text-orange-700 font-semibold">최종 원가</span>
            <span className="text-base font-bold text-orange-700 tabular-nums">{fmt(totalCost)}원</span>
          </div>
        </div>
      </div>

      {/* 조정 추가 폼 */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          조정 추가
        </p>

        <div className="flex gap-2">
          {/* 구분 (매출/매입) */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['revenue', 'cost'] as const).map(t => (
              <button
                key={t}
                onClick={() => setNewType(t)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  newType === t
                    ? t === 'revenue'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-orange-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t === 'revenue' ? '매출' : '매입'}
              </button>
            ))}
          </div>

          {/* +/- 선택 */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['+', '-'] as const).map(s => (
              <button
                key={s}
                onClick={() => setNewSign(s)}
                className={`w-10 py-2 text-sm font-bold transition-colors ${
                  newSign === s
                    ? s === '+'
                      ? 'bg-blue-600 text-white'
                      : 'bg-red-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* 금액 입력 */}
          <div className="relative flex-1 max-w-[160px]">
            <input
              type="text"
              inputMode="numeric"
              value={newAmountStr}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
                setNewAmountStr(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'));
              }}
              placeholder="0"
              className={`${INPUT_CLS} w-full pr-6 tabular-nums`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">원</span>
          </div>
        </div>

        {/* 사유 입력 */}
        <textarea
          value={newReason}
          onChange={e => setNewReason(e.target.value)}
          placeholder="조정 사유를 입력해주세요 (필수)"
          rows={2}
          className={`${INPUT_CLS} w-full resize-none`}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd();
          }}
        />

        {formError && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Ctrl+Enter로 추가</p>
          <button
            onClick={handleAdd}
            disabled={adding || !newAmountStr || !newReason.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {adding ? '추가 중...' : '조정 추가'}
          </button>
        </div>
      </div>

      {/* 조정 이력 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            조정 이력 {adjustments.length > 0 && <span className="text-gray-400 normal-case">({adjustments.length}건)</span>}
          </p>
          {adjustments.length > 0 && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['all', 'revenue', 'cost'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {f === 'all' ? '전체' : f === 'revenue' ? '매출' : '매입'}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">조정 이력 없음</p>
            <p className="text-xs text-gray-400 mt-1">위 폼으로 금액 조정을 추가해주세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(adj => {
              const isRevenue = adj.adjustment_type === 'revenue';
              const isPositive = Number(adj.amount) >= 0;
              return (
                <div
                  key={adj.id}
                  className="group flex gap-3 items-start p-3.5 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  {/* 구분 뱃지 */}
                  <div className={`flex-shrink-0 mt-0.5 px-2 py-1 rounded-md text-[10px] font-bold ${
                    isRevenue ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {isRevenue ? '매출' : '매입'}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-sm font-bold tabular-nums ${
                        isPositive ? 'text-emerald-700' : 'text-red-600'
                      }`}>
                        {isPositive ? '+' : ''}{fmt(Number(adj.amount))}원
                      </span>
                      <span className="text-xs text-gray-500">{adj.reason}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                      {adj.created_by_name && <span className="font-medium text-gray-500">{adj.created_by_name}</span>}
                      <span>{formatDate(adj.created_at)}</span>
                    </div>
                  </div>

                  {/* 취소 버튼 */}
                  <button
                    onClick={() => handleDelete(adj)}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="조정 취소"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
