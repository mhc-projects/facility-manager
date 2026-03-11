'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Send, Clock, FileText, Wrench, MessageSquare, ChevronRight } from 'lucide-react';
import { AsRecord, ProgressNote } from '../page';
import { STATUS_CONFIG } from './AsStatusBadge';
import { TokenManager } from '@/lib/api-client';

interface PriceItem {
  id: string;
  category: string | null;
  item_name: string;
  unit_price: number;
  unit: string;
}

interface MaterialRow {
  id?: string;
  device_label: string;
  price_list_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  notes: string;
  isNew?: boolean;
}

interface BusinessSuggestion {
  id: string;
  business_name: string;
  business_management_code: number | null;
  delivery_date: string | null;
  address: string | null;
  manager_name: string | null;
  manager_contact: string | null;
}

interface AsRecordModalProps {
  record: AsRecord | null;
  onClose: () => void;
  onSave: () => void;
  currentUser: { name?: string } | null;
}

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

const EMPTY_MATERIAL: MaterialRow = {
  device_label: '',
  price_list_id: '',
  material_name: '',
  quantity: 1,
  unit: '개',
  unit_price: 0,
  notes: '',
  isNew: true,
};

const INPUT_CLS = 'w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all placeholder:text-gray-400';
const LABEL_CLS = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

export default function AsRecordModal({
  record,
  onClose,
  onSave,
  currentUser,
}: AsRecordModalProps) {
  const authHeader = () => ({ 'Authorization': `Bearer ${TokenManager.getToken()}` });
  const isEdit = !!record;
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // 폼 상태
  const [businessId, setBusinessId] = useState(record?.business_id || '');
  const [businessName, setBusinessName] = useState(record?.business_name || '');
  // 미등록 사업장 직접 입력 모드
  const [unregisteredMode, setUnregisteredMode] = useState(
    !!record && !record.business_id && !!record.business_name_raw
  );
  const [businessSuggestions, setBusinessSuggestions] = useState<BusinessSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessSuggestion | null>(null);

  const [receiptDate, setReceiptDate] = useState(record?.receipt_date?.slice(0, 10) || '');
  const [workDate, setWorkDate] = useState(record?.work_date?.slice(0, 10) || '');
  const [receiptContent, setReceiptContent] = useState(record?.receipt_content || '');
  const [workContent, setWorkContent] = useState(record?.work_content || '');
  const [outletDescription, setOutletDescription] = useState(record?.outlet_description || '');
  const [asManagerName, setAsManagerName] = useState(record?.as_manager_name || '');
  const [asManagerContact, setAsManagerContact] = useState(record?.as_manager_contact || '');
  const [asManagerAffiliation, setAsManagerAffiliation] = useState(record?.as_manager_affiliation || '');
  const [isPaidOverride, setIsPaidOverride] = useState<string>(
    record?.is_paid_override === true ? 'paid'
    : record?.is_paid_override === false ? 'free'
    : 'auto'
  );
  const [status, setStatus] = useState(record?.status || 'received');
  // 타업체 사업장 직접 입력 필드
  const [siteAddress, setSiteAddress] = useState(record?.site_address || '');
  const [siteManager, setSiteManager] = useState(record?.site_manager || '');
  const [siteContact, setSiteContact] = useState(record?.site_contact || '');
  // 출동 정보
  const [dispatchCount, setDispatchCount] = useState(record?.dispatch_count ?? 1);
  const [dispatchCostPriceId, setDispatchCostPriceId] = useState(record?.dispatch_cost_price_id || '');
  const [dispatchRevenuePriceId, setDispatchRevenuePriceId] = useState(record?.dispatch_revenue_price_id || '');

  // 자재 상태
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [priceList, setPriceList] = useState<PriceItem[]>([]);
  const [dispatchCostList, setDispatchCostList] = useState<PriceItem[]>([]);
  const [dispatchRevenueList, setDispatchRevenueList] = useState<PriceItem[]>([]);

  // 진행 메모 상태
  const [progressNotes, setProgressNotes] = useState<ProgressNote[]>(record?.progress_notes || []);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'materials' | 'progress'>('basic');

  const suggestRef = useRef<HTMLDivElement>(null);

  // 단가표 로딩
  useEffect(() => {
    const fetchPriceLists = async () => {
      try {
        const [costRes, dispCostRes, dispRevRes] = await Promise.all([
          fetch('/api/as-price-list?price_type=cost', { headers: authHeader() }),
          fetch('/api/as-price-list?price_type=dispatch_cost', { headers: authHeader() }),
          fetch('/api/as-price-list?price_type=dispatch_revenue', { headers: authHeader() }),
        ]);
        const [costJson, dispCostJson, dispRevJson] = await Promise.all([
          costRes.json(), dispCostRes.json(), dispRevRes.json(),
        ]);
        if (costJson.success) setPriceList(costJson.data);
        if (dispCostJson.success) setDispatchCostList(dispCostJson.data);
        if (dispRevJson.success) {
          setDispatchRevenueList(dispRevJson.data);
          // 기본 출동 매출단가 자동 선택 (신규 등록 시)
          if (!record && dispRevJson.data.length > 0 && !dispatchRevenuePriceId) {
            setDispatchRevenuePriceId(dispRevJson.data[0].id);
          }
        }
        if (dispCostJson.success && dispCostJson.data.length > 0 && !record && !dispatchCostPriceId) {
          setDispatchCostPriceId(dispCostJson.data[0].id);
        }
      } catch (e) {
        console.error('단가표 로딩 실패:', e);
      }
    };
    fetchPriceLists();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 수정 시 자재 로딩
  useEffect(() => {
    if (!record?.id) return;
    const fetchMaterials = async () => {
      try {
        const res = await fetch(`/api/as-records/${record.id}`, { headers: authHeader() });
        const json = await res.json();
        if (json.success && json.data.materials) {
          setMaterials(json.data.materials.map((m: any) => ({
            id: m.id,
            device_label: m.device_label || '',
            price_list_id: m.price_list_id || '',
            material_name: m.material_name,
            quantity: m.quantity,
            unit: m.unit,
            unit_price: m.unit_price,
            notes: m.notes || '',
          })));
        }
      } catch (e) {
        console.error('자재 로딩 실패:', e);
      }
    };
    fetchMaterials();
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 사업장 검색
  const searchBusiness = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setBusinessSuggestions([]);
      return;
    }
    try {
      const res2 = await fetch(
        `/api/businesses?search=${encodeURIComponent(query)}&limit=10`,
        { headers: authHeader() }
      );
      const json2 = await res2.json();
      if (json2.success) {
        setBusinessSuggestions(json2.data || []);
      }
    } catch (e) {
      console.error('사업장 검색 실패:', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      if (businessName && !businessId) {
        searchBusiness(businessName);
        setShowSuggestions(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [businessName, businessId, searchBusiness]);

  const selectBusiness = (biz: BusinessSuggestion) => {
    setBusinessId(biz.id);
    setBusinessName(biz.business_name);
    setSelectedBusiness(biz);
    setShowSuggestions(false);
    setBusinessSuggestions([]);
    // 블루온 사업장 선택 시 타업체 입력 필드 초기화
    setSiteAddress('');
    setSiteManager('');
    setSiteContact('');
  };

  // 유상/무상 자동 계산
  const calcPaidStatus = () => {
    const deliveryDate = selectedBusiness?.delivery_date || record?.delivery_date;
    if (!deliveryDate) return null;
    const warrantyEnd = new Date(deliveryDate);
    warrantyEnd.setMonth(warrantyEnd.getMonth() + 26);
    return new Date() > warrantyEnd;
  };

  const displayedPaidStatus = isPaidOverride !== 'auto'
    ? isPaidOverride === 'paid'
    : calcPaidStatus();

  // 자재 추가/수정
  const addMaterialRow = () => {
    setMaterials(prev => [...prev, { ...EMPTY_MATERIAL }]);
  };

  const updateMaterial = (idx: number, field: keyof MaterialRow, value: string | number) => {
    setMaterials(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'price_list_id' && value) {
        const priceItem = priceList.find(p => p.id === value);
        if (priceItem) {
          updated[idx].material_name = priceItem.item_name;
          updated[idx].unit_price = priceItem.unit_price;
          updated[idx].unit = priceItem.unit;
        }
      }
      return updated;
    });
  };

  const removeMaterial = (idx: number) => {
    setMaterials(prev => prev.filter((_, i) => i !== idx));
  };

  const totalMaterialCost = materials.reduce(
    (sum, m) => sum + (Number(m.quantity) * Number(m.unit_price)),
    0
  );

  // 진행 메모 추가
  const addProgressNote = async () => {
    if (!newNoteContent.trim() || !record?.id) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/as-records/${record.id}/progress`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newNoteContent.trim(),
          author: currentUser?.name || '담당자',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProgressNotes(json.data.progress_notes || []);
        setNewNoteContent('');
      } else {
        alert(json.error || '메모 추가 실패');
      }
    } catch (e) {
      console.error('메모 추가 실패:', e);
    } finally {
      setAddingNote(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!record?.id) return;
    try {
      const res = await fetch(`/api/as-records/${record.id}/progress`, {
        method: 'DELETE',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      });
      const json = await res.json();
      if (json.success) {
        setProgressNotes(json.data.progress_notes || []);
      }
    } catch (e) {
      console.error('메모 삭제 실패:', e);
    }
  };

  // 저장
  const handleSave = async () => {
    if (!isEdit && !unregisteredMode && !businessId) {
      alert('사업장을 선택하거나 직접 입력하세요.');
      return;
    }
    if (!isEdit && unregisteredMode && !businessName.trim()) {
      alert('사업장명을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        business_id: unregisteredMode ? null : (businessId || null),
        business_name_raw: unregisteredMode ? businessName.trim() : null,
        receipt_date: receiptDate || null,
        work_date: workDate || null,
        receipt_content: receiptContent || null,
        work_content: workContent || null,
        outlet_description: outletDescription || null,
        as_manager_name: asManagerName || null,
        as_manager_contact: asManagerContact || null,
        as_manager_affiliation: asManagerAffiliation || null,
        site_address: unregisteredMode ? (siteAddress || null) : null,
        site_manager: unregisteredMode ? (siteManager || null) : null,
        site_contact: unregisteredMode ? (siteContact || null) : null,
        is_paid_override: isPaidOverride === 'paid' ? true : isPaidOverride === 'free' ? false : null,
        status,
        dispatch_count: dispatchCount,
        dispatch_cost_price_id: dispatchCostPriceId || null,
        dispatch_revenue_price_id: dispatchRevenuePriceId || null,
      };

      const url = isEdit ? `/api/as-records/${record!.id}` : '/api/as-records';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.success) {
        alert(json.error || '저장 실패');
        return;
      }

      const recordId = isEdit ? record!.id : json.data.id;

      for (const mat of materials) {
        if (!mat.material_name.trim()) continue;
        if (mat.isNew || !mat.id) {
          await fetch(`/api/as-records/${recordId}/materials`, {
            method: 'POST',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_label: mat.device_label || null,
              price_list_id: mat.price_list_id || null,
              material_name: mat.material_name,
              quantity: mat.quantity,
              unit: mat.unit,
              unit_price: mat.unit_price,
              notes: mat.notes || null,
            }),
          });
        } else {
          await fetch(`/api/as-materials/${mat.id}`, {
            method: 'PATCH',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_label: mat.device_label || null,
              price_list_id: mat.price_list_id || null,
              material_name: mat.material_name,
              quantity: mat.quantity,
              unit: mat.unit,
              unit_price: mat.unit_price,
              notes: mat.notes || null,
            }),
          });
        }
      }

      onSave();
    } catch (e) {
      console.error('저장 실패:', e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const TABS = [
    { key: 'basic' as const, label: '기본 정보', icon: FileText },
    { key: 'materials' as const, label: '사용자재', badge: materials.length > 0 ? materials.length : undefined, icon: Wrench },
    { key: 'progress' as const, label: '진행 메모', badge: progressNotes.length > 0 ? progressNotes.length : undefined, icon: MessageSquare },
  ];

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'AS 건 수정' : 'AS 건 등록'}
            </h2>
            {isEdit && record?.business_name && (
              <p className="text-sm text-gray-500 mt-0.5">{record.business_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 탭 */}
        <div className="px-6 pt-3 border-b border-gray-100">
          <div className="flex gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.badge !== undefined && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full ${
                      isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── 기본 정보 탭 ── */}
          {activeTab === 'basic' && (
            <div className="space-y-5">

              {/* 사업장 선택 */}
              <div className="relative" ref={suggestRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    사업장 <span className="text-red-500 normal-case">*</span>
                  </label>
                  {!isEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnregisteredMode(!unregisteredMode);
                        setBusinessId('');
                        setBusinessName('');
                        setSelectedBusiness(null);
                        setShowSuggestions(false);
                      }}
                      className="text-[11px] text-blue-500 hover:text-blue-700 underline underline-offset-2"
                    >
                      {unregisteredMode ? '시스템 사업장 검색' : '미등록 사업장 직접 입력'}
                    </button>
                  )}
                </div>
                {unregisteredMode ? (
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="사업장명 직접 입력..."
                    className={INPUT_CLS}
                  />
                ) : (
                <input
                  type="text"
                  value={businessName}
                  onChange={e => {
                    setBusinessName(e.target.value);
                    setBusinessId('');
                    setSelectedBusiness(null);
                  }}
                  placeholder="사업장명 검색..."
                  className={INPUT_CLS}
                  disabled={isEdit}
                />
                )}
                {showSuggestions && businessSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 max-h-52 overflow-y-auto">
                    {businessSuggestions.map(biz => (
                      <button
                        key={biz.id}
                        onClick={() => selectBusiness(biz)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between group first:rounded-t-xl last:rounded-b-xl"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            {biz.business_management_code && (
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded tabular-nums">
                                {biz.business_management_code}
                              </span>
                            )}
                            <span className="text-sm font-medium text-gray-900">{biz.business_name}</span>
                          </div>
                          {biz.address && <div className="text-xs text-gray-500 mt-0.5">{biz.address}</div>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 유상/무상 표시 */}
              {(selectedBusiness || record) && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                  {(selectedBusiness?.business_management_code || (record as any)?.business_management_code) && (
                    <>
                      <div className="text-xs text-gray-500">
                        <span className="text-gray-400">관리코드</span>
                        <span className="ml-1.5 font-bold text-blue-600">
                          {selectedBusiness?.business_management_code || (record as any)?.business_management_code}
                        </span>
                      </div>
                      <div className="w-px h-3 bg-gray-200" />
                    </>
                  )}
                  <div className="text-xs text-gray-500">
                    <span className="text-gray-400">출고일</span>
                    <span className="ml-1.5 font-medium text-gray-700">
                      {(selectedBusiness?.delivery_date || record?.delivery_date)?.slice(0, 10) || '미등록'}
                    </span>
                  </div>
                  <div className="w-px h-3 bg-gray-200" />
                  <div className="text-xs text-gray-500">
                    <span className="text-gray-400">보증기간(2년 2개월)</span>
                    <span className="ml-1.5">
                      {displayedPaidStatus === null
                        ? <span className="text-gray-400">출고일 미등록</span>
                        : displayedPaidStatus
                        ? <span className="font-semibold text-red-600">유상</span>
                        : <span className="font-semibold text-emerald-600">무상</span>
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* 사업장 주소/담당자/연락처 */}
              {unregisteredMode ? (
                /* 타업체: 직접 입력 */
                <div className="space-y-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">사업장 정보 (직접 입력)</p>
                  <div>
                    <label className={LABEL_CLS}>주소</label>
                    <input
                      type="text"
                      value={siteAddress}
                      onChange={e => setSiteAddress(e.target.value)}
                      placeholder="사업장 주소 입력"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLS}>담당자</label>
                      <input
                        type="text"
                        value={siteManager}
                        onChange={e => setSiteManager(e.target.value)}
                        placeholder="담당자 이름"
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>연락처</label>
                      <input
                        type="text"
                        value={siteContact}
                        onChange={e => setSiteContact(e.target.value)}
                        placeholder="연락처"
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>
                </div>
              ) : (businessId || record?.business_id) ? (
                /* 블루온 사업장: 자동 표시 (읽기 전용) */
                (() => {
                  const addr = selectedBusiness?.address ?? record?.address;
                  const mgr = selectedBusiness?.manager_name ?? record?.manager_name;
                  const contact = selectedBusiness?.manager_contact ?? record?.manager_contact;
                  if (!addr && !mgr && !contact) return null;
                  return (
                    <div className="space-y-1 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">사업장 정보</p>
                      {addr && (
                        <div className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-0.5">주소</span>
                          <span>{addr}</span>
                        </div>
                      )}
                      {(mgr || contact) && (
                        <div className="flex items-center gap-6 text-sm text-gray-700">
                          {mgr && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">담당자</span>
                              <span className="font-medium">{mgr}</span>
                            </div>
                          )}
                          {contact && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">연락처</span>
                              <span className="font-medium">{contact}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : null}

              {/* 날짜 행 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>접수일</label>
                  <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>AS 작업일</label>
                  <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} className={INPUT_CLS} />
                </div>
              </div>

              {/* AS 담당자 행 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={LABEL_CLS}>AS 담당자</label>
                  <input type="text" value={asManagerName} onChange={e => setAsManagerName(e.target.value)} placeholder="이름" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>연락처</label>
                  <input type="text" value={asManagerContact} onChange={e => setAsManagerContact(e.target.value)} placeholder="연락처" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>소속/회사</label>
                  <input type="text" value={asManagerAffiliation} onChange={e => setAsManagerAffiliation(e.target.value)} placeholder="소속/회사" className={INPUT_CLS} />
                </div>
              </div>

              {/* 배출구 정보 */}
              <div>
                <label className={LABEL_CLS}>배출구 정보</label>
                <input
                  type="text"
                  value={outletDescription}
                  onChange={e => setOutletDescription(e.target.value)}
                  placeholder="배출구 번호/명 자유 입력 (예: 1번 배출구, 굴뚝 A)"
                  className={INPUT_CLS}
                />
              </div>

              {/* 접수내용 */}
              <div>
                <label className={LABEL_CLS}>접수내용</label>
                <textarea
                  value={receiptContent}
                  onChange={e => setReceiptContent(e.target.value)}
                  rows={3}
                  placeholder="접수된 AS 내용을 입력해주세요"
                  className={`${INPUT_CLS} resize-none`}
                />
              </div>

              {/* 작업내용 */}
              <div>
                <label className={LABEL_CLS}>작업내용</label>
                <textarea
                  value={workContent}
                  onChange={e => setWorkContent(e.target.value)}
                  rows={3}
                  placeholder="수행한 AS 작업 내용을 입력해주세요"
                  className={`${INPUT_CLS} resize-none`}
                />
              </div>

              {/* 상태 & 유상/무상 설정 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>상태</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className={`${INPUT_CLS} appearance-none`}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>유상/무상 설정</label>
                  <select
                    value={isPaidOverride}
                    onChange={e => setIsPaidOverride(e.target.value)}
                    className={`${INPUT_CLS} appearance-none`}
                  >
                    <option value="auto">자동 (출고일 기준)</option>
                    <option value="free">무상 (수동)</option>
                    <option value="paid">유상 (수동)</option>
                  </select>
                </div>
              </div>

              {/* 출동 정보 */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">출동 정보</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL_CLS}>출동 횟수</label>
                    <input
                      type="number"
                      min={1}
                      value={dispatchCount}
                      onChange={e => setDispatchCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`${INPUT_CLS} tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>출동 원가단가</label>
                    <select
                      value={dispatchCostPriceId}
                      onChange={e => setDispatchCostPriceId(e.target.value)}
                      className={`${INPUT_CLS} appearance-none`}
                    >
                      <option value="">— 선택 안함 —</option>
                      {dispatchCostList.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.item_name} ({Math.round(Number(p.unit_price)).toLocaleString()}원/{p.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>출동 매출단가</label>
                    <select
                      value={dispatchRevenuePriceId}
                      onChange={e => setDispatchRevenuePriceId(e.target.value)}
                      className={`${INPUT_CLS} appearance-none`}
                    >
                      <option value="">— 선택 안함 —</option>
                      {dispatchRevenueList.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.item_name} ({Math.round(Number(p.unit_price)).toLocaleString()}원/{p.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* 계산 미리보기 */}
                {(dispatchCostPriceId || dispatchRevenuePriceId) && (
                  <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t border-gray-200">
                    {dispatchCostPriceId && (() => {
                      const item = dispatchCostList.find(p => p.id === dispatchCostPriceId);
                      return item ? (
                        <span>원가: {Math.round(Number(item.unit_price)).toLocaleString()}원 × {dispatchCount}회 = <strong className="text-gray-700">{(Math.round(Number(item.unit_price)) * dispatchCount).toLocaleString()}원</strong></span>
                      ) : null;
                    })()}
                    {dispatchRevenuePriceId && (() => {
                      const item = dispatchRevenueList.find(p => p.id === dispatchRevenuePriceId);
                      return item ? (
                        <span>매출: {Math.round(Number(item.unit_price)).toLocaleString()}원 × {dispatchCount}회 = <strong className="text-emerald-700">{(Math.round(Number(item.unit_price)) * dispatchCount).toLocaleString()}원</strong></span>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 사용자재 탭 ── */}
          {activeTab === 'materials' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                {materials.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">합계</span>
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {totalMaterialCost.toLocaleString()}원
                    </span>
                  </div>
                ) : <div />}
                <button
                  onClick={addMaterialRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  자재 추가
                </button>
              </div>

              {materials.length === 0 ? (
                <div className="text-center py-14 text-gray-400">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Wrench className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">사용 자재 없음</p>
                  <p className="text-xs text-gray-400 mt-1">아래 버튼으로 자재를 추가해주세요</p>
                  <button onClick={addMaterialRow} className="mt-3 text-sm text-blue-600 hover:underline font-medium">
                    + 자재 추가하기
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* 헤더 */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">
                    <div className="col-span-2">기기종류</div>
                    <div className="col-span-3">자재명</div>
                    <div className="col-span-2">수량 / 단위</div>
                    <div className="col-span-2">단가</div>
                    <div className="col-span-2 text-right">금액</div>
                    <div className="col-span-1" />
                  </div>
                  {materials.map((mat, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                      <div className="col-span-2">
                        <input
                          type="text"
                          value={mat.device_label}
                          onChange={e => updateMaterial(idx, 'device_label', e.target.value)}
                          placeholder="PH계..."
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <select
                          value={mat.price_list_id}
                          onChange={e => updateMaterial(idx, 'price_list_id', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        >
                          <option value="">단가표에서 선택...</option>
                          {priceList.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.category ? `[${p.category}] ` : ''}{p.item_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={mat.material_name}
                          onChange={e => updateMaterial(idx, 'material_name', e.target.value)}
                          placeholder="또는 직접 입력"
                          className="w-full px-2 py-1 border border-gray-100 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                      <div className="col-span-2 flex gap-1">
                        <input
                          type="number"
                          value={mat.quantity}
                          onChange={e => updateMaterial(idx, 'quantity', Number(e.target.value))}
                          min="0"
                          step="0.1"
                          className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all tabular-nums"
                        />
                        <input
                          type="text"
                          value={mat.unit}
                          onChange={e => updateMaterial(idx, 'unit', e.target.value)}
                          className="w-10 px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={mat.unit_price === 0 ? '' : Math.round(mat.unit_price).toLocaleString()}
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
                            updateMaterial(idx, 'unit_price', raw === '' ? 0 : Number(raw));
                          }}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all tabular-nums"
                        />
                      </div>
                      <div className="col-span-2 text-xs font-semibold tabular-nums text-right text-gray-700 pr-1">
                        {(Number(mat.quantity) * Number(mat.unit_price)).toLocaleString()}원
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeMaterial(idx)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {materials.length > 0 && (
                    <div className="flex justify-end mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">합계</span>
                        <span className="text-base font-bold text-gray-900 tabular-nums">
                          {totalMaterialCost.toLocaleString()}원
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 진행 메모 탭 ── */}
          {activeTab === 'progress' && (
            <div>
              {!isEdit && (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">아직 저장되지 않았습니다</p>
                  <p className="text-xs text-gray-400 mt-1">AS 건을 먼저 저장한 후 진행 메모를 추가할 수 있습니다</p>
                </div>
              )}
              {isEdit && (
                <div>
                  {/* 메모 타임라인 */}
                  <div className="space-y-2 mb-5">
                    {progressNotes.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm">진행 메모가 없습니다</p>
                      </div>
                    ) : (
                      progressNotes.map((note, idx) => (
                        <div
                          key={note.id}
                          className="group flex gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
                        >
                          <div className="flex-shrink-0">
                            <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                              <span className="text-[10px] font-bold text-blue-600">
                                {progressNotes.length - idx}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-semibold text-gray-700">{note.author}</span>
                              <span className="text-xs text-gray-400">{formatDateTime(note.timestamp)}</span>
                              {note.status_at_time && (
                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md border border-blue-100 font-medium">
                                  {STATUS_CONFIG[note.status_at_time]?.label || note.status_at_time}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                          </div>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 새 메모 추가 */}
                  <div className="border-t border-gray-100 pt-4">
                    <label className={LABEL_CLS}>새 메모 추가</label>
                    <div className="flex gap-2">
                      <textarea
                        value={newNoteContent}
                        onChange={e => setNewNoteContent(e.target.value)}
                        rows={2}
                        placeholder="진행 상황, 메모 등을 입력해주세요..."
                        className={`${INPUT_CLS} flex-1 resize-none`}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addProgressNote();
                        }}
                      />
                      <button
                        onClick={addProgressNote}
                        disabled={!newNoteContent.trim() || addingNote}
                        className="flex items-center justify-center w-10 h-10 mt-auto bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-sm"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Ctrl+Enter로 바로 추가</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 text-sm font-medium transition-colors"
          >
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!businessId && !businessName.trim())}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold transition-colors shadow-sm"
          >
            {saving ? '저장 중...' : isEdit ? '수정 저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
