// components/sections/EquipmentFieldCheckSection.tsx
// 측정기기 현장 확인 섹션 컴포넌트

'use client';

import { useState, useEffect } from 'react';
import { ClipboardCheck, Building, FileText, AlertTriangle, Info, Clock, Check } from 'lucide-react';
import { EquipmentFieldCheck } from '@/types';

interface Props {
  businessId: string;
  businessName: string;
  businessInfo?: {
    discharge_flowmeter?: number;
    supply_flowmeter?: number;
  };
  facilityNumbering?: {
    dischargeCount: number;
    preventionCount: number;
  };
}

export default function EquipmentFieldCheckSection({
  businessId,
  businessName,
  businessInfo,
  facilityNumbering
}: Props) {
  const [fieldCheck, setFieldCheck] = useState({
    discharge_flowmeter: 0,
    supply_flowmeter: 0,
    checked_by: '',
    notes: ''
  });

  const [saving, setSaving] = useState(false);
  const [latestCheck, setLatestCheck] = useState<EquipmentFieldCheck | null>(null);
  const [loading, setLoading] = useState(true);

  // 불일치 여부 계산
  const hasDiscrepancy =
    businessInfo &&
    (fieldCheck.discharge_flowmeter !== (businessInfo.discharge_flowmeter || 0) ||
      fieldCheck.supply_flowmeter !== (businessInfo.supply_flowmeter || 0));

  // 최근 체크 데이터 로드
  useEffect(() => {
    const loadLatestCheck = async () => {
      if (!businessId) return;

      try {
        const response = await fetch(`/api/equipment-field-checks?businessId=${businessId}&limit=1`);
        const result = await response.json();

        if (result.success && result.data.latest_check) {
          setLatestCheck(result.data.latest_check);
        }
      } catch (error) {
        console.error('최근 체크 데이터 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLatestCheck();
  }, [businessId]);

  // 현장 확인 저장
  const handleSaveFieldCheck = async () => {
    if (!businessId) {
      alert('사업장 ID가 없습니다.');
      return;
    }

    if (!fieldCheck.checked_by.trim()) {
      alert('확인자 이름을 입력해주세요.');
      return;
    }

    if (hasDiscrepancy && !fieldCheck.notes.trim()) {
      if (!confirm('입력한 값이 사무실 데이터와 다릅니다. 특이사항을 입력하지 않고 저장하시겠습니까?')) {
        return;
      }
    }

    setSaving(true);

    try {
      const response = await fetch('/api/equipment-field-checks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          businessId,
          discharge_flowmeter: fieldCheck.discharge_flowmeter,
          supply_flowmeter: fieldCheck.supply_flowmeter,
          checked_by: fieldCheck.checked_by,
          notes: fieldCheck.notes || null
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('현장 확인 데이터가 저장되었습니다.\nAdmin 페이지에서 확인 후 사업장 정보에 반영할 수 있습니다.');
        setLatestCheck(result.data.check);

        // 폼 초기화 (확인자 이름은 유지)
        setFieldCheck(prev => ({
          discharge_flowmeter: 0,
          supply_flowmeter: 0,
          checked_by: prev.checked_by,
          notes: ''
        }));
      } else {
        alert(`저장 실패: ${result.message}`);
      }
    } catch (error) {
      console.error('현장 확인 저장 오류:', error);
      alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="bg-purple-50 rounded-lg p-4 sm:p-5 md:p-6 border-2 border-purple-300">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-purple-900 flex items-center gap-2 text-base sm:text-lg">
          <ClipboardCheck className="w-5 h-5" />
          측정기기 현장 확인
        </h3>
        <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded-full">
          현장용
        </span>
      </div>

      {/* 입력 필드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            배출전류계 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            value={fieldCheck.discharge_flowmeter}
            onChange={(e) => setFieldCheck({
              ...fieldCheck,
              discharge_flowmeter: parseInt(e.target.value) || 0
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            송풍전류계 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            value={fieldCheck.supply_flowmeter}
            onChange={(e) => setFieldCheck({
              ...fieldCheck,
              supply_flowmeter: parseInt(e.target.value) || 0
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
          />
        </div>
      </div>

      {/* 확인자 정보 */}
      <div className="mb-3 sm:mb-4">
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          확인자 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={fieldCheck.checked_by}
          onChange={(e) => setFieldCheck({
            ...fieldCheck,
            checked_by: e.target.value
          })}
          placeholder="이름 입력"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
        />
      </div>

      {/* 메모 */}
      <div className="mb-3 sm:mb-4">
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          특이사항 (선택)
        </label>
        <textarea
          value={fieldCheck.notes}
          onChange={(e) => setFieldCheck({
            ...fieldCheck,
            notes: e.target.value
          })}
          placeholder="현장 확인 시 특이사항을 입력하세요"
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
        />
      </div>

      {/* 대기필증 비교 정보 */}
      {facilityNumbering && (
        <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
            <FileText className="w-4 h-4" />
            대기필증 기준 시설 정보
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
            <div>배출시설: <span className="font-bold">{facilityNumbering.dischargeCount}개</span></div>
            <div>방지시설: <span className="font-bold">{facilityNumbering.preventionCount}개</span></div>
          </div>
        </div>
      )}

      {/* 사무실 데이터 비교 */}
      {businessInfo && (
        <div className="mb-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1">
            <Building className="w-4 h-4" />
            사무실 등록 데이터
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-amber-700">
            <div>배출전류계: <span className="font-bold">{businessInfo.discharge_flowmeter || 0}개</span></div>
            <div>송풍전류계: <span className="font-bold">{businessInfo.supply_flowmeter || 0}개</span></div>
          </div>
        </div>
      )}

      {/* 불일치 경고 */}
      {hasDiscrepancy && (
        <div className="mb-3 p-2 bg-red-50 border border-red-300 rounded-lg">
          <p className="text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            입력한 값이 사무실 데이터와 다릅니다. 특이사항에 사유를 기록해주세요.
          </p>
        </div>
      )}

      {/* 저장 버튼 */}
      <button
        onClick={handleSaveFieldCheck}
        disabled={saving || !fieldCheck.checked_by.trim()}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 sm:py-3 rounded-lg font-medium
                   disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
      >
        {saving ? '저장 중...' : '현장 확인 저장'}
      </button>

      {/* 안내 메시지 */}
      <p className="text-xs text-gray-600 mt-3 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        현장 확인 데이터는 별도로 저장됩니다. Admin 페이지에서 확인 후 사업장 정보에 반영할 수 있습니다.
      </p>

      {/* 최근 체크 이력 */}
      {!loading && latestCheck && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">최근 확인:</p>
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(latestCheck.checked_at)} by {latestCheck.checked_by}
            </div>
            <div>배출: {latestCheck.discharge_flowmeter}개, 송풍: {latestCheck.supply_flowmeter}개</div>
            {latestCheck.is_synced && (
              <div className="text-green-600 font-medium flex items-center gap-1 mt-1">
                <Check className="w-4 h-4" />
                반영 완료
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
