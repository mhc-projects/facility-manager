'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TokenManager } from '@/lib/api-client';
import Modal, { ModalActions } from '@/components/ui/Modal';
import AutocompleteSelectInput from '@/components/ui/AutocompleteSelectInput';
import { useAdminData } from '@/contexts/AdminDataContext';
import {
  Percent,
  History,
  Edit,
  Save,
  AlertTriangle,
  Plus,
  Loader2,
  Calendar,
  User,
  Building2,
  Package
} from 'lucide-react';
import type {
  CommissionRate,
  CommissionRateHistory
} from '@/types/commission';

interface CommissionRateManagerProps {
  onClose?: () => void;
}

// 기존 4개사는 영문 코드로 저장되어 있음 (하위 호환용). 신규 제조사는 한글명을 그대로 키로 사용한다.
const LEGACY_MANUFACTURER_CODES: Record<string, string> = {
  '에코센스': 'ecosense',
  '가이아씨앤에스': 'gaia_cns',
  '크린어스': 'cleanearth',
  '이브이에스': 'evs'
};

export function CommissionRateManager({ onClose }: CommissionRateManagerProps) {
  const { manufacturers } = useAdminData();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [salesOffices, setSalesOffices] = useState<string[]>([]);
  const [selectedOffice, setSelectedOffice] = useState('');
  const [rates, setRates] = useState<CommissionRate[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editedRates, setEditedRates] = useState<Record<string, number>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');

  // 히스토리 모달
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState<CommissionRateHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 제조사 목록: 설정(제조사 관리)에 등록된 마스터 목록 기준 → 제조사별 원가 탭에 추가한 제조사도 자동 반영
  const manufacturerOptions = useMemo(
    () => manufacturers
      .filter(m => m.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(m => ({ key: LEGACY_MANUFACTURER_CODES[m.name] || m.name, label: m.name })),
    [manufacturers]
  );

  useEffect(() => {
    loadSalesOffices();
  }, []);

  useEffect(() => {
    if (selectedOffice) {
      loadCommissionRates();
    }
  }, [selectedOffice, manufacturerOptions]);

  const getAuthHeaders = () => {
    const token = TokenManager.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const loadSalesOffices = async () => {
    try {
      const response = await fetch('/api/revenue/sales-office-settings', {
        headers: getAuthHeaders()
      });

      const data = await response.json();
      if (data.success && data.data && data.data.settings) {
        // sales_office_cost_settings에서 영업점 목록 추출 (중복 제거)
        const uniqueOffices = Array.from(
          new Set<string>(data.data.settings.map((s: any) => s.sales_office as string))
        );
        setSalesOffices(uniqueOffices);
        if (uniqueOffices.length > 0) {
          setSelectedOffice(uniqueOffices[0]);
        }
      }
    } catch (error) {
      console.error('영업점 목록 로드 오류:', error);
    }
  };

  const loadCommissionRates = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/revenue/commission-rates?sales_office=${encodeURIComponent(selectedOffice)}`,
        { headers: getAuthHeaders() }
      );

      const data = await response.json();
      if (data.success) {
        const loadedRates: CommissionRate[] = data.data.rates || [];
        setRates(loadedRates);

        // 현재 수수료율을 editedRates에 설정 (제조사 목록 기준으로 초기화)
        const currentRates: Record<string, number> = {};
        manufacturerOptions.forEach(opt => {
          currentRates[opt.key] = 0;
        });
        loadedRates.forEach(rate => {
          currentRates[rate.manufacturer] = rate.commission_rate;
        });

        setEditedRates(currentRates);
      }
    } catch (error) {
      console.error('수수료율 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRates = async () => {
    if (!selectedOffice) {
      alert('영업점을 선택해주세요');
      return;
    }

    if (!effectiveFrom) {
      alert('적용 시작일을 입력해주세요');
      return;
    }

    const ratesArray = manufacturerOptions.map(opt => ({
      manufacturer: opt.key,
      commission_rate: editedRates[opt.key] ?? 0,
      notes
    }));

    setSaving(true);
    try {
      const response = await fetch('/api/revenue/commission-rates', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          sales_office: selectedOffice,
          effective_from: effectiveFrom,
          rates: ratesArray
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('수수료율이 성공적으로 업데이트되었습니다');
        // 새로고침 없이 즉시 반영: 서버가 반환한 새 수수료율로 화면을 바로 갱신
        setRates(data.data.rates || []);
        setEditMode(false);
        setNotes('');
      } else {
        alert(`업데이트 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('수수료율 업데이트 오류:', error);
      alert('수수료율 업데이트 중 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadHistory = async () => {
    if (!selectedOffice) {
      alert('영업점을 선택해주세요');
      return;
    }

    setHistoryLoading(true);
    setShowHistoryModal(true);

    try {
      const response = await fetch(
        `/api/revenue/commission-rates/history?sales_office=${selectedOffice}`,
        { headers: getAuthHeaders() }
      );

      const data = await response.json();
      if (data.success) {
        setHistoryData(data.data.history || []);
      }
    } catch (error) {
      console.error('이력 조회 오류:', error);
      alert('이력 조회 중 오류가 발생했습니다');
    } finally {
      setHistoryLoading(false);
    }
  };

  // 수수료율 이력 등에 남아있는 제조사 키(레거시 코드 포함)를 한글 표시명으로 변환
  const getManufacturerLabel = (key: string): string => {
    const found = manufacturerOptions.find(opt => opt.key === key);
    if (found) return found.label;
    const legacyEntry = Object.entries(LEGACY_MANUFACTURER_CODES).find(([, code]) => code === key);
    return legacyEntry ? legacyEntry[0] : key;
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-green-600" />
            제조사별 수수료율 관리
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            영업점별로 제조사마다 다른 수수료율을 설정할 수 있습니다
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleLoadHistory}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
          >
            <History className="w-4 h-4" />
            변경 이력
          </button>

          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
            >
              <Edit className="w-4 h-4" />
              수정
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setEditMode(false);
                  setNotes('');
                  loadCommissionRates();
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSaveRates}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                저장
              </button>
            </>
          )}
        </div>
      </div>

      {/* 영업점 선택 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Building2 className="w-4 h-4 inline mr-1" />
          영업점 선택
        </label>
        <AutocompleteSelectInput
          value={selectedOffice}
          onChange={(id) => setSelectedOffice(id)}
          options={salesOffices.map(office => ({ id: office, name: office }))}
          placeholder="영업점을 입력해 검색하세요"
          disabled={editMode}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* 수수료율 테이블 */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  제조사
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  수수료율 (%)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  적용일
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {manufacturerOptions.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500">
                    등록된 제조사가 없습니다. 설정에서 제조사를 먼저 추가하세요.
                  </td>
                </tr>
              )}
              {manufacturerOptions.map((opt) => {
                const rate = rates.find(r => r.manufacturer === opt.key);
                return (
                  <tr key={opt.key}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {opt.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editMode ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={editedRates[opt.key] ?? 0}
                          onChange={(e) => setEditedRates({
                            ...editedRates,
                            [opt.key]: parseFloat(e.target.value) || 0
                          })}
                          className="w-24 px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      ) : (
                        <span className="text-sm text-gray-900">
                          {rate ? `${rate.commission_rate}%` : '미설정'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {rate ? new Date(rate.effective_from).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 수정 모드 추가 정보 */}
      {editMode && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              적용 시작일
            </label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              변경 사유 (선택)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="수수료율 변경 사유를 입력하세요..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              rows={3}
            />
          </div>

          <div className="flex items-start gap-2 text-sm text-blue-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              저장하면 이전 수수료율은 자동으로 종료되고 새로운 수수료율이 적용됩니다.
              변경 이력은 모두 보관됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 변경 이력 모달 */}
      {showHistoryModal && (
        <Modal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title={`${selectedOffice} - 수수료율 변경 이력`}
          size="lg"
        >
          <div className="space-y-4">
            {historyLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                변경 이력이 없습니다
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">제조사</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">수수료율</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">적용기간</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">생성자</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {historyData.map((history) => (
                      <tr key={history.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {getManufacturerLabel(history.manufacturer)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {history.commission_rate}%
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(history.effective_from).toLocaleDateString('ko-KR')}
                          {history.effective_to && (
                            <> ~ {new Date(history.effective_to).toLocaleDateString('ko-KR')}</>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {history.created_by_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {history.notes || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {history.is_current ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              현재 적용
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              종료
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
