'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, Check, X, ChevronLeft, Tag } from 'lucide-react';
import Link from 'next/link';

import { TokenManager } from '@/lib/api-client';
import AdminLayout from '@/components/ui/AdminLayout';

type PriceType = 'cost' | 'revenue' | 'dispatch_cost' | 'dispatch_revenue';

interface PriceItem {
  id: string;
  category: string | null;
  item_name: string;
  unit_price: number;
  unit: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  price_type: PriceType;
  created_at: string;
  updated_at: string;
}

interface EditRow {
  id: string | null;
  category: string;
  item_name: string;
  unit_price: string;
  unit: string;
  description: string;
  sort_order: number;
  price_type: PriceType;
}

const PRICE_TYPE_TABS: { key: PriceType; label: string; description: string; activeClass: string }[] = [
  { key: 'cost',             label: '자재 원가단가',   description: '자재 매입 원가 — AS 자재 원가 계산에 사용',        activeClass: 'text-blue-600 border-blue-500' },
  { key: 'revenue',          label: '자재 매출단가',   description: '자재 고객 청구가 — AS 매출 계산에 사용',           activeClass: 'text-emerald-600 border-emerald-500' },
  { key: 'dispatch_cost',    label: '출동 원가단가',   description: '기사 출동 매입가 — 출동 원가 계산에 사용',          activeClass: 'text-amber-600 border-amber-500' },
  { key: 'dispatch_revenue', label: '출동 매출단가',   description: '고객 출동비 청구가 — 출동 매출 계산에 사용',        activeClass: 'text-purple-600 border-purple-500' },
];

const UNIT_DEFAULTS: Record<PriceType, string> = {
  cost: '개', revenue: '개', dispatch_cost: '건', dispatch_revenue: '건',
};

const emptyEditRow = (priceType: PriceType): EditRow => ({
  id: null, category: '', item_name: '', unit_price: '',
  unit: UNIT_DEFAULTS[priceType], description: '', sort_order: 0, price_type: priceType,
});

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all placeholder:text-gray-400';
const LABEL_CLS = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

export default function PriceListPage() {
  const [activeTab, setActiveTab] = useState<PriceType>('cost');
  const [itemsByType, setItemsByType] = useState<Record<PriceType, PriceItem[]>>({
    cost: [], revenue: [], dispatch_cost: [], dispatch_revenue: [],
  });
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const qs = showInactive ? '?include_inactive=true' : '';
      const res = await fetch(`/api/as-price-list${qs}`, {
        headers: { 'Authorization': `Bearer ${TokenManager.getToken()}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) {
        const grouped: Record<PriceType, PriceItem[]> = {
          cost: [], revenue: [], dispatch_cost: [], dispatch_revenue: [],
        };
        for (const item of json.data as PriceItem[]) {
          const t = (item.price_type || 'cost') as PriceType;
          if (grouped[t]) grouped[t].push(item);
        }
        setItemsByType(grouped);
      }
    } catch (e) {
      console.error('단가표 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const currentItems = itemsByType[activeTab];
  const activeTabInfo = PRICE_TYPE_TABS.find(t => t.key === activeTab)!;

  const startNew = () => setEditRow(emptyEditRow(activeTab));
  const startEdit = (item: PriceItem) => setEditRow({
    id: item.id, category: item.category || '', item_name: item.item_name,
    unit_price: Math.round(Number(item.unit_price)).toLocaleString(), unit: item.unit,
    description: item.description || '', sort_order: item.sort_order, price_type: item.price_type,
  });
  const cancelEdit = () => setEditRow(null);

  const saveEdit = async () => {
    if (!editRow) return;
    if (!editRow.item_name.trim()) { alert('항목명을 입력해주세요.'); return; }
    const rawPrice = Number(editRow.unit_price.replace(/,/g, ''));
    if (!editRow.unit_price || isNaN(rawPrice)) { alert('단가를 올바르게 입력해주세요.'); return; }

    setSaving(true);
    try {
      const payload = {
        category: editRow.category || null,
        item_name: editRow.item_name.trim(),
        unit_price: rawPrice,
        unit: editRow.unit || UNIT_DEFAULTS[editRow.price_type],
        description: editRow.description || null,
        sort_order: editRow.sort_order,
        price_type: editRow.price_type,
      };

      const isNew = !editRow.id;
      const url = isNew ? '/api/as-price-list' : `/api/as-price-list/${editRow.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${TokenManager.getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) { setEditRow(null); await fetchItems(); }
      else alert(json.error || '저장 실패');
    } catch (e) {
      console.error('저장 실패:', e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: PriceItem) => {
    if (!confirm(`"${item.item_name}" 항목을 삭제하시겠습니까?`)) return;
    // 낙관적 업데이트: UI에서 즉시 제거
    setItemsByType(prev => ({
      ...prev,
      [item.price_type]: prev[item.price_type as PriceType].filter(i => i.id !== item.id),
    }));
    try {
      const res = await fetch(`/api/as-price-list/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${TokenManager.getToken()}` },
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '삭제 실패');
        await fetchItems(); // 실패 시 원복
      }
    } catch (e) {
      console.error('삭제 실패:', e);
      await fetchItems(); // 에러 시 원복
    }
  };

  const grouped = currentItems.reduce<Record<string, PriceItem[]>>((acc, item) => {
    const cat = item.category || '기타';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const editModal = editRow && mounted ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) cancelEdit(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{editRow.id ? '항목 수정' : '새 항목 추가'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{activeTabInfo.label}</p>
          </div>
          <button onClick={cancelEdit} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>분류</label>
              <input type="text" value={editRow.category}
                onChange={e => setEditRow({ ...editRow, category: e.target.value })}
                placeholder="PH계, 온도계, 출동비..."
                className={INPUT_CLS} autoFocus />
            </div>
            <div>
              <label className={LABEL_CLS}>항목명 <span className="text-red-500 normal-case">*</span></label>
              <input type="text" value={editRow.item_name}
                onChange={e => setEditRow({ ...editRow, item_name: e.target.value })}
                placeholder="항목명" className={INPUT_CLS}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>단가 <span className="text-red-500 normal-case">*</span></label>
              <input type="text" inputMode="numeric" value={editRow.unit_price}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
                  const formatted = raw === '' ? '' : Number(raw).toLocaleString();
                  setEditRow({ ...editRow, unit_price: formatted });
                }}
                placeholder="0" className={`${INPUT_CLS} tabular-nums`} />
            </div>
            <div>
              <label className={LABEL_CLS}>단위</label>
              <input type="text" value={editRow.unit}
                onChange={e => setEditRow({ ...editRow, unit: e.target.value })}
                placeholder={UNIT_DEFAULTS[editRow.price_type]} className={INPUT_CLS} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>비고</label>
            <input type="text" value={editRow.description}
              onChange={e => setEditRow({ ...editRow, description: e.target.value })}
              placeholder="추가 설명 (선택)" className={INPUT_CLS} />
          </div>

          <div>
            <label className={LABEL_CLS}>정렬 순서</label>
            <input type="number" value={editRow.sort_order}
              onChange={e => setEditRow({ ...editRow, sort_order: Number(e.target.value) })}
              placeholder="0" className={`${INPUT_CLS} tabular-nums`} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={cancelEdit}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 text-sm font-medium transition-colors">
            취소
          </button>
          <button onClick={saveEdit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold transition-colors shadow-sm">
            <Check className="w-4 h-4" />
            {saving ? '저장 중...' : editRow.id ? '수정 저장' : '추가'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <AdminLayout
      title="AS 단가표"
      description="자재 원가·매출단가 및 출동 원가·매출단가 관리"
      actions={
        <button onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium">
          <Plus className="w-4 h-4" />
          항목 추가
        </button>
      }
    >
      {editModal}
      <div className="max-w-5xl mx-auto">

        {/* 뒤로가기 + 비활성 토글 */}
        <div className="flex items-center justify-between mb-5">
          <Link href="/admin/as-management"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            AS 건 목록으로
          </Link>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            비활성 항목 포함
          </label>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-200 mb-1">
          {PRICE_TYPE_TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                activeTab === tab.key
                  ? `${tab.activeClass} bg-transparent`
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {tab.label}
              {itemsByType[tab.key].length > 0 && (
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {itemsByType[tab.key].length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 탭 설명 */}
        <p className="text-xs text-gray-400 mb-5 mt-3">{activeTabInfo.description}</p>

        {/* 단가표 테이블 */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">로딩 중...</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Tag className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1">단가표 항목 없음</p>
            <p className="text-sm text-gray-400 mb-5">{activeTabInfo.label} 항목을 추가해주세요</p>
            <button onClick={startNew}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm">
              <Plus className="w-4 h-4" />
              첫 항목 추가
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([category, catItems]) => (
              <div key={category} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <div className="w-2 h-2 bg-blue-400 rounded-full" />
                  <span className="text-sm font-semibold text-gray-700">{category}</span>
                  <span className="text-xs text-gray-400 font-normal ml-0.5">({catItems.length}개)</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-1/3">항목명</th>
                      <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-1/6">단가</th>
                      <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-16">단위</th>
                      <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">비고</th>
                      <th className="text-center px-5 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">상태</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map(item => (
                      <tr key={item.id}
                        className={`group border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${!item.is_active ? 'opacity-40' : ''}`}>
                        <td className="px-5 py-3 font-medium text-gray-900">{item.item_name}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-800">
                          {Math.round(Number(item.unit_price)).toLocaleString()}원
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{item.unit}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs">{item.description || '—'}</td>
                        <td className="px-5 py-3 text-center whitespace-nowrap">
                          {item.is_active ? (
                            <span className="inline-block text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200 font-medium whitespace-nowrap">활성</span>
                          ) : (
                            <span className="inline-block text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md border border-gray-200 font-medium whitespace-nowrap">비활성</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(item)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="수정">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteItem(item)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
