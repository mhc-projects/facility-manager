'use client';

import React from 'react';
import type { EquipmentBreakdownItem } from '@/types';

interface InstallationBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentBreakdown: EquipmentBreakdownItem[];
  installationExtraCost: number;
  totalInstallationCost: number;
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
}: InstallationBreakdownModalProps) {
  if (!isOpen) return null;

  const itemsWithInstall = equipmentBreakdown.filter(
    (item) => item.quantity > 0 && item.unit_installation_cost > 0
  );
  const baseInstallTotal = itemsWithInstall.reduce(
    (sum, item) => sum + item.total_installation,
    0
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
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
          {installationExtraCost > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>추가 설치비</span>
              <span className="text-orange-600">+ {formatCurrency(installationExtraCost)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-800 pt-1.5 border-t border-gray-200">
            <span>총 설치비</span>
            <span className="text-cyan-700">{formatCurrency(totalInstallationCost)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
