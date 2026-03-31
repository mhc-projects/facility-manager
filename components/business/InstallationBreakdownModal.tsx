'use client';

import React, { useState, useEffect } from 'react';
import { TokenManager } from '@/lib/api-client';
import type { EquipmentBreakdownItem } from '@/types';

interface InstallationBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentBreakdown: EquipmentBreakdownItem[];
  installationExtraCost: number;
  totalInstallationCost: number;
  businessId: string;
  multipleStackInstallExtra: number;        // 현재 저장된 추가 수량
  multipleStackUnitInstallCost: number;     // 복수굴뚝 설치비 단가
  userPermission: number;
  onSaved: (savedQty: number) => void;      // 저장 후 재계산 트리거 (저장된 수량 전달)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value);
}

export default function InstallationBreakdownModal({
  isOpen,
  onClose,
  equipmentBreakdown,
  installationExtraCost,
  totalInstallationCost,
  businessId,
  multipleStackInstallExtra,
  multipleStackUnitInstallCost,
  userPermission,
  onSaved,
}: InstallationBreakdownModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [extraQty, setExtraQty] = useState(multipleStackInstallExtra);
  const [isSaving, setIsSaving] = useState(false);

  // prop이 바뀌면 (저장 후 부모에서 갱신) 로컬 상태 동기화
  useEffect(() => {
    setExtraQty(multipleStackInstallExtra);
  }, [multipleStackInstallExtra]);

  if (!isOpen) return null;

  // 기기별 설치비 — multiple_stack_install_extra는 별도 섹션에서 처리하므로 제외
  const itemsWithInstall = equipmentBreakdown.filter(
    (item) => item.quantity > 0 && item.unit_installation_cost > 0
      && item.equipment_type !== 'multiple_stack_install_extra'
  );
  const baseInstallTotal = itemsWithInstall.reduce(
    (sum, item) => sum + item.total_installation,
    0
  );

  // 복수굴뚝 기기가 존재하는지 여부
  const hasMultipleStack = equipmentBreakdown.some(
    (item) => item.equipment_type === 'multiple_stack' && item.quantity > 0
  );
  // 복수굴뚝 섹션 표시: 기기가 있거나, 이미 추가 수량이 저장되어 있거나, 단가가 설정된 경우
  const showMultipleStackSection = hasMultipleStack
    || multipleStackInstallExtra > 0
    || multipleStackUnitInstallCost > 0;

  const extraInstallCost = extraQty * multipleStackUnitInstallCost;
  const computedTotal = baseInstallTotal + extraInstallCost + installationExtraCost;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = TokenManager.getToken();
      const res = await fetch('/api/business-info-direct', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: businessId,
          multiple_stack_install_extra: extraQty,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEditing(false);
        // sessionStorage businesses 캐시 무효화 (새로고침 후에도 최신값 반영)
        Object.keys(sessionStorage)
          .filter(k => k.startsWith('revenue_businesses_cache'))
          .forEach(k => sessionStorage.removeItem(k));
        onSaved(extraQty);
      } else {
        alert(data.message || '저장에 실패했습니다.');
      }
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔧</span>
            <h2 className="text-base font-semibold text-gray-800">총 설치비 산출 근거</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 기기별 기본 설치비 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              기기별 기본 설치비
            </p>
            {itemsWithInstall.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">기본 설치비 항목이 없습니다.</p>
            ) : (
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left px-3 py-2 font-medium">기기명</th>
                      <th className="text-center px-2 py-2 font-medium">수량</th>
                      <th className="text-right px-3 py-2 font-medium">단가</th>
                      <th className="text-right px-3 py-2 font-medium">소계</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {itemsWithInstall.map((item) => (
                      <tr key={item.equipment_type} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{item.equipment_name}</td>
                        <td className="px-2 py-2 text-center text-gray-600">×{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatCurrency(item.unit_installation_cost)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800">
                          {formatCurrency(item.total_installation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-600">
                        기본 설치비 합계
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-cyan-700">
                        {formatCurrency(baseInstallTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* 복수굴뚝 추가 설치 수량 */}
          {showMultipleStackSection && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  복수굴뚝 추가 설치 수량
                </p>
                {!isEditing && userPermission >= 2 && (
                  <button
                    onClick={() => { setExtraQty(multipleStackInstallExtra); setIsEditing(true); }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {multipleStackInstallExtra > 0 ? '수정' : '추가'}
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 space-y-2">
                <p className="text-xs text-blue-600">
                  ℹ️ 채널 수 기준 추가분 — 매출에 영향 없음
                </p>
                {!hasMultipleStack && (
                  <p className="text-xs text-amber-600">
                    ⚠️ 현재 측정기기에 복수굴뚝이 없지만, 추가 설치 비용을 입력할 수 있습니다.
                  </p>
                )}
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-12">단가</span>
                      <span className="text-xs font-medium text-gray-800">
                        {formatCurrency(multipleStackUnitInstallCost)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-12">추가 수량</span>
                      <input
                        type="number"
                        min={0}
                        value={extraQty}
                        onChange={(e) => setExtraQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500">개</span>
                    </div>
                    {extraQty > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-12">소계</span>
                        <span className="text-xs font-bold text-blue-700">
                          {formatCurrency(extraQty * multipleStackUnitInstallCost)}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 font-medium"
                      >
                        {isSaving ? '저장 중...' : '저장'}
                      </button>
                      <button
                        onClick={() => { setIsEditing(false); setExtraQty(multipleStackInstallExtra); }}
                        disabled={isSaving}
                        className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 disabled:opacity-50 font-medium"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {multipleStackInstallExtra > 0
                        ? `단가 ${formatCurrency(multipleStackUnitInstallCost)} × 추가 ${multipleStackInstallExtra}개`
                        : '추가 수량 없음'}
                    </span>
                    <span className="text-sm font-bold text-blue-700">
                      {multipleStackInstallExtra > 0
                        ? formatCurrency(multipleStackInstallExtra * multipleStackUnitInstallCost)
                        : '₩0'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 추가 설치비 */}
          {installationExtraCost > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                추가 설치비
              </p>
              <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-600">설치팀 요청 추가비용</span>
                <span className="text-sm font-bold text-orange-600">
                  {formatCurrency(installationExtraCost)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 합계 푸터 */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-1.5 bg-gray-50 rounded-b-xl">
          <div className="flex justify-between text-sm text-gray-600">
            <span>기본 설치비</span>
            <span>{formatCurrency(baseInstallTotal)}</span>
          </div>
          {(multipleStackInstallExtra > 0 || (isEditing && extraQty > 0)) && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>복수굴뚝 추가 ({isEditing ? extraQty : multipleStackInstallExtra}개)</span>
              <span className="text-blue-600">
                + {formatCurrency((isEditing ? extraQty : multipleStackInstallExtra) * multipleStackUnitInstallCost)}
              </span>
            </div>
          )}
          {installationExtraCost > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>추가 설치비</span>
              <span className="text-orange-600">+ {formatCurrency(installationExtraCost)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-800 pt-1.5 border-t border-gray-200">
            <span>총 설치비</span>
            <span className="text-cyan-700">
              {isEditing
                ? formatCurrency(computedTotal)
                : formatCurrency(totalInstallationCost)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
