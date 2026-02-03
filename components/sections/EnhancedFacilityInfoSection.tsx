'use client';

import { useState, useEffect, useCallback } from 'react';
import { Factory, Shield, Router, Thermometer, Droplets, Zap, Gauge, AlertTriangle, Save, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Facility, FacilitiesData } from '@/types';
import FacilityEditModal from '@/components/modals/FacilityEditModal';

interface EnhancedFacilityInfoSectionProps {
  businessName: string;
  businessId?: string;
  facilities: FacilitiesData;
  facilityNumbering?: any; // 대기필증 관리 시설번호 매핑
  systemType: 'completion' | 'presurvey';
  onFacilitiesUpdate: (facilities: FacilitiesData) => void;
}

// 배출시설 면제사유 옵션
const exemptionReasons = [
  { value: 'none', label: '해당없음' },
  { value: '무동력', label: '무동력' },
  { value: '통합전원', label: '통합전원' },
  { value: '연속공정', label: '연속공정' },
  { value: '연간 30일 미만 가동', label: '연간 30일 미만 가동' },
  { value: '물리적으로 부착 불가능', label: '물리적으로 부착 불가능' }
];

// 방지시설 타입별 디폴트 측정기기 설정
const preventionFacilityDefaults = {
  '여과집진시설': { pressure: '1', temperature: '1', fan: '1' },
  '흡착에의한시설': { pressure: '1', temperature: '1', fan: '1' },
  '여과및흡착에의한시설': { pressure: '1', temperature: '1', fan: '1' },
  '흡수에의한시설': { ph: '1', pump: '1' },
  '원심력집진시설': { fan: '1' }
};

export default function EnhancedFacilityInfoSection({
  businessName,
  businessId,
  facilities,
  facilityNumbering,
  systemType,
  onFacilitiesUpdate
}: EnhancedFacilityInfoSectionProps) {
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [facilityType, setFacilityType] = useState<'discharge' | 'prevention'>('discharge');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ✅ 로컬 facilityNumbering 상태 관리 (게이트웨이 업데이트 즉시 반영용)
  const [localFacilityNumbering, setLocalFacilityNumbering] = useState(facilityNumbering);

  // props 변경 시 로컬 상태 동기화
  useEffect(() => {
    setLocalFacilityNumbering(facilityNumbering);
  }, [facilityNumbering]);

  const [equipmentCounts, setEquipmentCounts] = useState({
    phSensor: 0,
    differentialPressureMeter: 0,
    temperatureMeter: 0,
    dischargeCT: 0,
    fanCT: 0,
    pumpCT: 0,
    gateway: 0,
    totalDevices: 0
  });

  // 🎯 facilityNumbering을 직접 사용하므로 별도 매핑 불필요
  // 대기필증 관리 데이터에 이미 quantity별 개별 번호가 할당되어 있음

  // 측정기기 수량 계산
  const calculateEquipmentCounts = useCallback(() => {
    let counts = {
      phSensor: 0,
      differentialPressureMeter: 0,
      temperatureMeter: 0,
      dischargeCT: 0,
      fanCT: 0,
      pumpCT: 0,
      gateway: 0,
      totalDevices: 0
    };

    // 배출시설에서 배출CT 카운트
    facilities.discharge?.forEach(facility => {
      if (facility.dischargeCT && facility.dischargeCT !== '0') {
        counts.dischargeCT += parseInt(facility.dischargeCT) || 0;
      }
    });

    // 방지시설에서 측정기기 카운트
    facilities.prevention?.forEach(facility => {
      if (facility.ph && facility.ph !== '0') {
        counts.phSensor += parseInt(facility.ph) || 0;
      }
      if (facility.pressure && facility.pressure !== '0') {
        counts.differentialPressureMeter += parseInt(facility.pressure) || 0;
      }
      if (facility.temperature && facility.temperature !== '0') {
        counts.temperatureMeter += parseInt(facility.temperature) || 0;
      }
      if (facility.fan && facility.fan !== '0') {
        counts.fanCT += parseInt(facility.fan) || 0;
      }
      if (facility.pump && facility.pump !== '0') {
        counts.pumpCT += parseInt(facility.pump) || 0;
      }
    });

    // 게이트웨이 수량 계산 (배출구 + 방지시설에서 고유한 게이트웨이 번호 개수)
    const gatewaySet = new Set<string>();

    // 배출구에서 게이트웨이 수집
    facilityNumbering?.outlets?.forEach((outlet: any) => {
      if (outlet.gateway_number && outlet.gateway_number.trim()) {
        gatewaySet.add(outlet.gateway_number.trim());
      }
    });

    // 방지시설에서 게이트웨이 수집
    facilities.prevention?.forEach(facility => {
      if (facility.gatewayInfo?.id && facility.gatewayInfo.id !== '0' && facility.gatewayInfo.id.trim()) {
        gatewaySet.add(facility.gatewayInfo.id.trim());
      }
    });

    counts.gateway = gatewaySet.size;

    counts.totalDevices = counts.phSensor + counts.differentialPressureMeter +
                         counts.temperatureMeter + counts.dischargeCT +
                         counts.fanCT + counts.pumpCT + counts.gateway;

    setEquipmentCounts(counts);
    return counts;
  }, [facilities, facilityNumbering]);

  useEffect(() => {
    const counts = calculateEquipmentCounts();

    // 🔄 자동 저장: 측정기기 수량이 변경되면 데이터베이스에 저장
    if (businessId && counts.totalDevices > 0) {
      const timer = setTimeout(() => {
        saveEquipmentCounts(counts);
      }, 1000); // 1초 디바운스

      return () => clearTimeout(timer);
    }
  }, [calculateEquipmentCounts, businessId]);

  // 방지시설 디폴트 값 적용
  const applyPreventionDefaults = (facilityName: string) => {
    const defaults = Object.entries(preventionFacilityDefaults).find(([key]) => 
      facilityName.includes(key)
    )?.[1];
    
    return defaults || {};
  };

  const handleEditFacility = (facility: Facility, type: 'discharge' | 'prevention') => {
    // 모달 방식 사용
    setSelectedFacility(facility);
    setFacilityType(type);
    setIsModalOpen(true);
  };

  // 모달 닫기
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedFacility(null);
  };

  // 시설 정보 저장 후 처리
  const handleFacilitySave = (updatedFacility: Facility) => {
    const updatedFacilities: FacilitiesData = {
      // facilityType에 따라 해당 배열만 업데이트
      discharge: facilityType === 'discharge'
        ? facilities.discharge.map(f =>
            (f.outlet === updatedFacility.outlet && f.number === updatedFacility.number)
              ? updatedFacility
              : f
          )
        : facilities.discharge, // 방지시설 수정 시 배출시설은 그대로 유지
      prevention: facilityType === 'prevention'
        ? facilities.prevention.map(f =>
            (f.outlet === updatedFacility.outlet && f.number === updatedFacility.number)
              ? updatedFacility
              : f
          )
        : facilities.prevention // 배출시설 수정 시 방지시설은 그대로 유지
    };

    onFacilitiesUpdate(updatedFacilities);
  };

  // 배출구 게이트웨이 정보 변경 핸들러
  const handleOutletGatewayChange = async (outletId: string, field: 'gateway_number' | 'vpn_type', value: string) => {
    // ✅ 유효성 검사
    if (!outletId || outletId === 'undefined') {
      console.error('❌ 배출구 ID가 유효하지 않습니다:', outletId);
      alert('배출구 정보를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
      return;
    }

    try {
      const response = await fetch(`/api/air-permits/outlets/${outletId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [field]: value || null
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');

        // ✅ 로컬 상태 즉시 업데이트
        setLocalFacilityNumbering((prev: any) => {
          if (!prev?.outlets) return prev;

          return {
            ...prev,
            outlets: prev.outlets.map((outlet: any) =>
              outlet.id === outletId
                ? { ...outlet, [field]: value || null }
                : outlet
            )
          };
        });
      } else {
        console.error('❌ 배출구 게이트웨이 정보 업데이트 실패:', result.message);
        alert(`업데이트 실패: ${result.message}`);
      }
    } catch (error) {
      console.error('❌ 배출구 게이트웨이 정보 업데이트 오류:', error);
      alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleSaveFacility = async () => {
    if (!editingFacility) return;

    try {
      const updatedFacilities = { ...facilities };
      const facilityArray = facilityType === 'discharge' ? updatedFacilities.discharge : updatedFacilities.prevention;
      
      const index = facilityArray?.findIndex(f => 
        f.outlet === editingFacility.outlet && f.number === editingFacility.number
      );
      
      if (index !== -1 && facilityArray) {
        facilityArray[index] = editingFacility;
        onFacilitiesUpdate(updatedFacilities);
        
        // 수량 재계산 및 Supabase 저장
        const newCounts = calculateEquipmentCounts();
        await saveEquipmentCounts(newCounts);
      }

      setShowAddForm(false);
      setEditingFacility(null);
    } catch (error) {
      console.error('시설 정보 저장 실패:', error);
    }
  };

  // 측정기기 수량을 Supabase에 저장
  const saveEquipmentCounts = async (counts: typeof equipmentCounts) => {
    if (!businessId) {
      console.log('⏭️ businessId가 없어 측정기기 수량 저장을 건너뜁니다.');
      return;
    }

    try {
      const response = await fetch('/api/business-equipment-counts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          equipmentCounts: counts
        })
      });

      if (!response.ok) {
        console.warn('⚠️ 측정기기 수량 저장 실패 (계속 진행):', await response.text());
        return; // 오류를 throw하지 않고 조용히 실패
      }

      console.log('✅ 측정기기 수량 저장 완료:', counts);
    } catch (error) {
      console.warn('⚠️ 측정기기 수량 저장 오류 (계속 진행):', error);
      // 오류를 throw하지 않고 조용히 실패
    }
  };


  const renderEditForm = () => {
    if (!editingFacility || !showAddForm) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {facilityType === 'discharge' ? '배출시설' : '방지시설'} 정보 수정
              </h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    시설명
                  </label>
                  <input
                    type="text"
                    value={editingFacility.name}
                    onChange={(e) => setEditingFacility({ ...editingFacility, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    용량
                  </label>
                  <input
                    type="text"
                    value={editingFacility.capacity}
                    onChange={(e) => setEditingFacility({ ...editingFacility, capacity: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 배출시설 전용 필드 */}
              {facilityType === 'discharge' && (
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <h3 className="font-semibold text-orange-800 mb-4 flex items-center gap-2">
                    <Factory className="w-5 h-5" />
                    배출시설 정보
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        배출CT 개수
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={editingFacility.dischargeCT || '0'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, dischargeCT: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        면제사유
                      </label>
                      <select
                        value={editingFacility.exemptionReason || 'none'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, exemptionReason: e.target.value as any })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {exemptionReasons.map(reason => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      비고 (특이사항)
                    </label>
                    <textarea
                      value={editingFacility.remarks || ''}
                      onChange={(e) => setEditingFacility({ ...editingFacility, remarks: e.target.value })}
                      rows={3}
                      placeholder="특이사항이나 추가 설명을 입력하세요..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* 방지시설 전용 필드 */}
              {facilityType === 'prevention' && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    방지시설 측정기기
                  </h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Droplets className="w-4 h-4 text-cyan-500" />
                        pH계
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={editingFacility.ph || '0'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, ph: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Gauge className="w-4 h-4 text-purple-500" />
                        차압계
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={editingFacility.pressure || '0'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, pressure: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Thermometer className="w-4 h-4 text-red-500" />
                        온도계
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={editingFacility.temperature || '0'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, temperature: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Zap className="w-4 h-4 text-green-500" />
                        송풍CT
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={editingFacility.fan || '0'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, fan: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Zap className="w-4 h-4 text-blue-500" />
                        펌프CT
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={editingFacility.pump || '0'}
                        onChange={(e) => setEditingFacility({ ...editingFacility, pump: e.target.value })}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      비고 (특이사항)
                    </label>
                    <textarea
                      value={editingFacility.remarks || ''}
                      onChange={(e) => setEditingFacility({ ...editingFacility, remarks: e.target.value })}
                      rows={3}
                      placeholder="특이사항이나 추가 설명을 입력하세요..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 디폴트 적용 버튼 */}
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        const defaults = applyPreventionDefaults(editingFacility.name);
                        setEditingFacility({ 
                          ...editingFacility, 
                          ...defaults 
                        });
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      시설 타입에 따른 디폴트 값 적용
                    </button>
                  </div>
                </div>
              )}

              {/* 방지시설에만 게이트웨이 번호 입력 */}
              {facilityType === 'prevention' && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Router className="w-5 h-5" />
                    게이트웨이 정보
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      게이트웨이 번호
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={editingFacility.gatewayInfo?.id || '0'}
                      onChange={(e) => setEditingFacility({ 
                        ...editingFacility, 
                        gatewayInfo: { ...editingFacility.gatewayInfo, id: e.target.value }
                      })}
                      placeholder="게이트웨이 번호를 입력하세요"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSaveFacility}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 시설 정보 (대기필증 관리) - 접기/펼치기 */}
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Factory className="w-6 h-6 text-blue-600" />
            측정기기 수량 체크
          </h2>
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          )}
        </button>
        
        {!isCollapsed && (
          <div className="px-6 pb-6 space-y-6">
            {/* 측정기기 수량 요약 */}
            <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" />
                측정기기 수량 현황
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-cyan-600">{equipmentCounts.phSensor}</div>
                  <div className="text-xs text-gray-600">pH계</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{equipmentCounts.differentialPressureMeter}</div>
                  <div className="text-xs text-gray-600">차압계</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{equipmentCounts.temperatureMeter}</div>
                  <div className="text-xs text-gray-600">온도계</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{equipmentCounts.dischargeCT}</div>
                  <div className="text-xs text-gray-600">배출CT</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{equipmentCounts.fanCT}</div>
                  <div className="text-xs text-gray-600">송풍CT</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{equipmentCounts.pumpCT}</div>
                  <div className="text-xs text-gray-600">펌프CT</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600">{equipmentCounts.gateway}</div>
                  <div className="text-xs text-gray-600">게이트웨이</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">{equipmentCounts.totalDevices}</div>
                  <div className="text-xs text-gray-600">총 기기</div>
                </div>
              </div>
            </div>

            {/* 🏭 배출구별 시설 및 게이트웨이 정보 */}
            {localFacilityNumbering?.outlets && localFacilityNumbering.outlets.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Factory className="w-5 h-5 text-red-600" />
                  배출구별 시설 및 게이트웨이 정보 ({localFacilityNumbering.outlets.length}개 배출구)
                </h3>

                {localFacilityNumbering.outlets.map((outlet: any) => {
                  const totalFacilities = (outlet.dischargeFacilities?.length || 0) + (outlet.preventionFacilities?.length || 0);

                  return (
                    <div
                      key={outlet.id || outlet.outletNumber}
                      className="bg-white rounded-lg border-4 border-red-500 p-6"
                    >
                      {/* 배출구 헤더 with 게이트웨이 정보 */}
                      <div className="mb-4 pb-4 border-b-2 border-red-200">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          {/* 배출구 제목 */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                              <Factory className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                              <h4 className="text-xl font-bold text-gray-900">
                                배출구 {outlet.outletNumber}번
                              </h4>
                              <p className="text-sm text-gray-600">
                                총 {totalFacilities}개 시설 (배출: {outlet.dischargeFacilities?.length || 0}, 방지: {outlet.preventionFacilities?.length || 0})
                              </p>
                            </div>
                          </div>

                          {/* 게이트웨이 정보 및 설정 */}
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 rounded-lg border border-teal-200">
                            {/* 게이트웨이 번호 선택 */}
                            <div className="flex items-center gap-2">
                              <Router className="w-5 h-5 text-teal-600" />
                              <select
                                value={outlet.gateway_number || ''}
                                onChange={(e) => handleOutletGatewayChange(outlet.id, 'gateway_number', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm font-medium"
                              >
                                <option value="">게이트웨이 선택</option>
                                {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                                  <option key={num} value={`gateway${num}`}>
                                    gateway{num}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* VPN 타입 버튼 */}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleOutletGatewayChange(outlet.id, 'vpn_type', '유선')}
                                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                                  outlet.vpn_type === '유선'
                                    ? 'bg-teal-600 text-white shadow-md'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                유선
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOutletGatewayChange(outlet.id, 'vpn_type', '무선')}
                                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                                  outlet.vpn_type === '무선'
                                    ? 'bg-cyan-600 text-white shadow-md'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                무선
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 배출시설 목록 */}
                      {outlet.dischargeFacilities && outlet.dischargeFacilities.length > 0 && (
                        <div className="mb-4">
                          <h5 className="text-md font-semibold text-orange-600 mb-3 flex items-center gap-2">
                            <Factory className="w-4 h-4" />
                            배출시설 ({outlet.dischargeFacilities.length}개)
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {outlet.dischargeFacilities.map((facilityInfo: any) => {
                              const originalFacility = facilities.discharge.find(f =>
                                f.id === facilityInfo.facilityId
                              );

                              return (
                                <div
                                  key={`discharge-${facilityInfo.facilityId}-${facilityInfo.facilityNumber}`}
                                  onClick={() => originalFacility && handleEditFacility(originalFacility, 'discharge')}
                                  className="bg-orange-50/50 rounded-lg border border-orange-200 p-3 cursor-pointer hover:shadow-lg hover:border-orange-400 hover:bg-orange-50 transition-all duration-200"
                                >
                                  <div className="flex items-start gap-2 mb-2">
                                    <Factory className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <h6 className="font-semibold text-gray-900 text-sm">
                                        배출시설{facilityInfo.facilityNumber}
                                      </h6>
                                      <p className="text-xs text-gray-600 truncate">
                                        {facilityInfo.displayNumber}
                                      </p>
                                      <p className="text-xs text-gray-500 truncate">
                                        {facilityInfo.facilityName} ({facilityInfo.capacity})
                                      </p>
                                    </div>
                                  </div>

                                  {/* 배출시설 정보 */}
                                  <div className="space-y-1 text-xs">
                                    {originalFacility?.dischargeCT && String(originalFacility.dischargeCT) !== '0' && (
                                      <div className="flex items-center gap-1.5">
                                        <Zap className="w-3.5 h-3.5 text-orange-500" />
                                        <span>배출CT: {String(originalFacility.dischargeCT)}개</span>
                                      </div>
                                    )}
                                    {originalFacility?.exemptionReason && String(originalFacility.exemptionReason) !== 'none' && (
                                      <div className="flex items-center gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                                        <span className="truncate">면제: {String(originalFacility.exemptionReason)}</span>
                                      </div>
                                    )}
                                    {originalFacility?.remarks && (
                                      <div className="text-gray-600 truncate">
                                        <span className="font-medium">비고:</span> {String(originalFacility.remarks)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 방지시설 목록 */}
                      {outlet.preventionFacilities && outlet.preventionFacilities.length > 0 && (
                        <div>
                          <h5 className="text-md font-semibold text-blue-600 mb-3 flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            방지시설 ({outlet.preventionFacilities.length}개)
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {outlet.preventionFacilities.map((facilityInfo: any) => {
                              const originalFacility = facilities.prevention.find(f =>
                                f.id === facilityInfo.facilityId
                              );

                              return (
                                <div
                                  key={`prevention-${facilityInfo.facilityId}-${facilityInfo.facilityNumber}`}
                                  onClick={() => originalFacility && handleEditFacility(originalFacility, 'prevention')}
                                  className="bg-blue-50/50 rounded-lg border border-blue-200 p-3 cursor-pointer hover:shadow-lg hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
                                >
                                  <div className="flex items-start gap-2 mb-2">
                                    <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <h6 className="font-semibold text-gray-900 text-sm">
                                        방지시설{facilityInfo.facilityNumber}
                                      </h6>
                                      <p className="text-xs text-gray-600 truncate">
                                        {facilityInfo.displayNumber}
                                      </p>
                                      <p className="text-xs text-gray-500 truncate">
                                        {facilityInfo.facilityName} ({facilityInfo.capacity})
                                      </p>
                                    </div>
                                  </div>

                                  {/* 방지시설 정보 */}
                                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                                    {originalFacility?.ph && String(originalFacility.ph) !== '0' && (
                                      <div className="flex items-center gap-1">
                                        <Droplets className="w-3 h-3 text-cyan-500" />
                                        <span>pH: {String(originalFacility.ph)}</span>
                                      </div>
                                    )}
                                    {originalFacility?.pressure && String(originalFacility.pressure) !== '0' && (
                                      <div className="flex items-center gap-1">
                                        <Gauge className="w-3 h-3 text-purple-500" />
                                        <span>차압: {String(originalFacility.pressure)}</span>
                                      </div>
                                    )}
                                    {originalFacility?.temperature && String(originalFacility.temperature) !== '0' && (
                                      <div className="flex items-center gap-1">
                                        <Thermometer className="w-3 h-3 text-red-500" />
                                        <span>온도: {String(originalFacility.temperature)}</span>
                                      </div>
                                    )}
                                    {originalFacility?.fan && String(originalFacility.fan) !== '0' && (
                                      <div className="flex items-center gap-1">
                                        <Zap className="w-3 h-3 text-green-500" />
                                        <span>송풍: {String(originalFacility.fan)}</span>
                                      </div>
                                    )}
                                    {originalFacility?.pump && String(originalFacility.pump) !== '0' && (
                                      <div className="flex items-center gap-1">
                                        <Zap className="w-3 h-3 text-blue-500" />
                                        <span>펌프: {String(originalFacility.pump)}</span>
                                      </div>
                                    )}
                                    {originalFacility?.remarks && (
                                      <div className="col-span-2 text-gray-600 truncate">
                                        <span className="font-medium">비고:</span> {String(originalFacility.remarks)}
                                      </div>
                                    )}
                                  </div>

                                  {/* 방지시설 게이트웨이 정보 */}
                                  {originalFacility?.gatewayInfo && (
                                    <div className="mt-2 pt-2 border-t border-blue-200">
                                      <div className="flex items-center gap-2 text-xs">
                                        <Router className="w-3.5 h-3.5 text-blue-500" />
                                        <span className="truncate">게이트웨이: {originalFacility.gatewayInfo.ip || 'IP 미설정'}</span>
                                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                                          originalFacility.gatewayInfo.status === 'connected' ? 'bg-green-100 text-green-800' :
                                          originalFacility.gatewayInfo.status === 'error' ? 'bg-red-100 text-red-800' :
                                          'bg-gray-100 text-gray-800'
                                        }`}>
                                          {originalFacility.gatewayInfo.status === 'connected' ? '연결' :
                                           originalFacility.gatewayInfo.status === 'error' ? '오류' : '미연결'}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 시설 없는 경우 */}
                      {totalFacilities === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          이 배출구에 등록된 시설이 없습니다.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddForm && renderEditForm()}

      {/* 시설 편집 모달 */}
      {selectedFacility && (
        <FacilityEditModal
          facility={selectedFacility}
          facilityType={facilityType}
          businessName={businessName}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSave={handleFacilitySave}
        />
      )}
    </div>
  );
}