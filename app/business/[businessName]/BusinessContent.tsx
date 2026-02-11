'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FacilitiesData, BusinessInfo, SystemType, SystemPhase } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ArrowLeft, Factory, Shield, Zap, Router, Camera, FileText, AlertTriangle, Building2, User, Save, ChevronDown, Wifi, WifiOff } from 'lucide-react';

// Import new section components
import BusinessInfoSection from '@/components/sections/BusinessInfoSection';
import SupabaseFacilitiesSection from '@/components/sections/SupabaseFacilitiesSection';
import ImprovedFacilityPhotoSection from '@/components/ImprovedFacilityPhotoSection';
import InspectorInfoSection from '@/components/sections/InspectorInfoSection';
import SpecialNotesSection from '@/components/sections/SpecialNotesSection';
import EnhancedFacilityInfoSection from '@/components/sections/EnhancedFacilityInfoSection';
import BusinessProgressSection from '@/components/sections/BusinessProgressSection';
// Import original components  
import FileUploadSection from '@/components/FileUploadSection';
import { FileProvider } from '@/contexts/FileContext';
import { ToastProvider } from '@/contexts/ToastContext';

// Hydration-safe hook
function useIsHydrated() {
  const [isHydrated, setIsHydrated] = useState(false);
  
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  
  return isHydrated;
}

export default function BusinessContent() {
  const params = useParams();
  const router = useRouter();
  const businessName = useMemo(() => decodeURIComponent(params?.businessName as string), [params?.businessName]);
  const [systemType, setSystemType] = useState<SystemType>('presurvey');
  const [currentPhase, setCurrentPhase] = useState<SystemPhase>('presurvey');
  const isHydrated = useIsHydrated();

  
  const [facilities, setFacilities] = useState<FacilitiesData | null>(null);
  const [facilityNumbering, setFacilityNumbering] = useState<any>(null); // 대기필증 관리 시설번호
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // All original state from page-old.tsx
  const [syncData, setSyncData] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState({
    inspector: false,
    notes: false
  });
  const [showSystemTypeDropdown, setShowSystemTypeDropdown] = useState(false);

  // 시설 상세 데이터 상태
  const [facilityDetails, setFacilityDetails] = useState<{[facilityId: string]: {[key: string]: string}}>({});

  // IoT 게이트웨이 정보 상태
  const [gatewayInfo, setGatewayInfo] = useState<{[outlet: number]: {gateway: string, vpn: '유선' | '무선'}}>({});

  // 보조CT 열 표시 여부 상태
  const [showAssistCT, setShowAssistCT] = useState(false);

  // 배출시설 추가 열 표시 여부 상태
  const [showNonPowered, setShowNonPowered] = useState(false);
  const [showIntegratedPower, setShowIntegratedPower] = useState(false);
  const [showContinuousProcess, setShowContinuousProcess] = useState(false);

  // 업데이트 타이머 참조
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Phase별 독립적인 상태 관리
  const [phaseData, setPhaseData] = useState({
    presurvey: {
      inspectorInfo: { name: '', contact: '', date: '' },
      specialNotes: ''
    },
    postinstall: {
      inspectorInfo: { name: '', contact: '', date: '' },
      specialNotes: ''
    },
    aftersales: {
      inspectorInfo: { name: '', contact: '', date: '' },
      specialNotes: ''
    }
  });

  // 현재 phase의 데이터를 반환하는 헬퍼 함수
  const getCurrentPhaseData = useCallback(() => {
    return phaseData[currentPhase];
  }, [phaseData, currentPhase]);

  // 현재 phase의 inspectorInfo와 specialNotes (호환성용)
  const inspectorInfo = getCurrentPhaseData().inspectorInfo;
  const specialNotes = getCurrentPhaseData().specialNotes;

  // Set default date after hydration with Korean formatting
  useEffect(() => {
    if (isHydrated && typeof window !== 'undefined') {
      setPhaseData(prev => {
        const defaultDate = new Date().toLocaleDateString('ko-KR', {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\./g, '-').replace(/ /g, '').slice(0, -1);

        // 각 phase의 date가 비어있으면 기본값 설정
        const updated = { ...prev };
        (['presurvey', 'postinstall', 'aftersales'] as const).forEach(phase => {
          if (!updated[phase].inspectorInfo.date) {
            updated[phase] = {
              ...updated[phase],
              inspectorInfo: {
                ...updated[phase].inspectorInfo,
                date: defaultDate
              }
            };
          }
        });
        return updated;
      });
    }
  }, [isHydrated]);

  // All facility management functions from original page


  // Gateway info update with auto-save
  const updateGatewayInfo = useCallback((outlet: number, field: 'gateway' | 'vpn', value: string) => {
    const newGatewayInfo = {
      ...gatewayInfo,
      [outlet]: {
        ...gatewayInfo[outlet],
        [field]: value
      }
    };
    setGatewayInfo(newGatewayInfo);
    
    // Local state update only
  }, [gatewayInfo, facilityDetails]);

  // Facility ID generation
  const getFacilityId = (facility: any) => `${facility.outlet}-${facility.number}-${facility.name}`;

  // Update facility details with auto-save
  const updateFacilityDetail = useCallback((facilityId: string, field: string, value: string) => {
    const newDetails = {
      ...facilityDetails,
      [facilityId]: {
        ...facilityDetails[facilityId],
        [field]: value
      }
    };
    setFacilityDetails(newDetails);
    
    // Local state update only
  }, [facilityDetails]);

  // Calculate totals for all facility data
  const calculateTotals = useCallback(() => {
    const totals = {
      ph: 0, pressure: 0, temperature: 0, dischargeCT: 0, assistCT: 0,
      pump: 0, fan: 0, nonPowered: 0, integratedPower: 0, continuousProcess: 0,
      wired: 0, wireless: 0
    };

    if (facilities) {
      facilities.prevention.forEach((facility) => {
        const facilityId = getFacilityId(facility);
        const details = facilityDetails[facilityId] || {};
        
        if (details.ph === 'true') totals.ph++;
        if (details.pressure === 'true') totals.pressure++;
        if (details.temperature === 'true') totals.temperature++;
        if (details.pump === 'true') totals.pump++;
        if (details.fan === 'true') totals.fan++;
      });

      facilities.discharge.forEach((facility) => {
        const facilityId = getFacilityId(facility);
        const details = facilityDetails[facilityId] || {};
        
        if (details.dischargeCT === 'true') totals.dischargeCT++;
        if (details.assistCT === 'true') totals.assistCT++;
        if (details.nonPowered === 'true') totals.nonPowered++;
        if (details.integratedPower === 'true') totals.integratedPower++;
        if (details.continuousProcess === 'true') totals.continuousProcess++;
      });
    }

    // VPN data with duplicate removal by gateway number
    const wiredGateways = new Set<string>();
    const wirelessGateways = new Set<string>();
    
    Object.values(gatewayInfo).forEach(info => {
      if (info.gateway && info.gateway.trim()) {
        if (info.vpn === '유선') {
          wiredGateways.add(info.gateway.trim());
        } else if (info.vpn === '무선') {
          wirelessGateways.add(info.gateway.trim());
        }
      }
    });
    
    totals.wired = wiredGateways.size;
    totals.wireless = wirelessGateways.size;

    return totals;
  }, [facilityDetails, gatewayInfo, facilities]);

  // Phone number formatting
  const formatPhoneNumber = useCallback((value: string) => {
    const numbers = value.replace(/[^0-9]/g, '');
    
    if (numbers.length >= 3 && numbers.startsWith('010')) {
      if (numbers.length <= 3) {
        return numbers;
      } else if (numbers.length <= 7) {
        return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
      } else if (numbers.length <= 11) {
        return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
      } else {
        return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
      }
    }
    
    return value;
  }, []);


  // Main data loading function
  const loadData = useCallback(async () => {
    if (!businessName) return;
    
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);
    
    try {
      setLoading(true);
      setError(null);
      
      const [facilitiesRes] = await Promise.allSettled([
        fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}`, {
          cache: 'no-store', // 🔄 브라우저 캐시 비활성화 - 측정기기 수정 즉시 반영
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
          signal: abortController.signal
        })
      ]);

      clearTimeout(timeoutId);

      const processResponse = async (result: PromiseSettledResult<Response>, type: string) => {
        if (result.status === 'fulfilled') {
          if (result.value.ok) {
            return await result.value.json();
          }
          // 상세한 에러 로깅
          const status = result.value.status;
          const statusText = result.value.statusText;
          let errorBody = '';
          try {
            errorBody = await result.value.text();
          } catch (e) {
            errorBody = 'Unable to read response body';
          }
          console.error(`❌ ${type} API 실패:`, {
            status,
            statusText,
            url: result.value.url,
            errorBody
          });
        } else {
          console.error(`❌ ${type} API 요청 실패:`, result.reason);
        }
        return null;
      };

      const [facilitiesData] = await Promise.all([
        processResponse(facilitiesRes, '시설')
      ]);


      if (facilitiesData?.success) {
        setFacilities(facilitiesData.data.facilities);
        setFacilityNumbering(facilitiesData.data.facilityNumbering); // 🎯 대기필증 관리 시설번호 저장

        // API에서 받은 실제 사업장 정보 설정
        if (facilitiesData.data.businessInfo) {
          setBusinessInfo({
            ...facilitiesData.data.businessInfo,
            found: true
          });

          // 실사자 정보 및 특이사항 로드
          const businessId = facilitiesData.data.businessInfo?.id;

          // businessId가 없으면 businessName으로 조회
          const queryParam = businessId
            ? `businessId=${businessId}`
            : `businessName=${encodeURIComponent(businessName)}`;

          try {
            // ✅ 브라우저 캐시 무효화: timestamp + cache headers
            const timestamp = `&_t=${Date.now()}${Math.random()}`;  // 🔧 더 강력한 캐시 무효화
            const mgmtResponse = await fetch(
              `/api/facility-management?${queryParam}${timestamp}`,
              {
                cache: 'no-store',  // Next.js 캐시 비활성화
                headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate',  // 프록시 캐시도 비활성화
                  'Pragma': 'no-cache',
                  'Expires': '0'
                },
                next: { revalidate: 0 }  // Next.js 14+ 추가 캐시 비활성화
              }
            );
            const mgmtData = await mgmtResponse.json();

            if (mgmtData.success && mgmtData.data.business) {
              const business = mgmtData.data.business;

                // Phase별 데이터 로드 (날짜 필드는 null이면 빈 문자열로 유지)
                setPhaseData({
                  presurvey: {
                    inspectorInfo: {
                      name: business.presurvey_inspector_name || '',
                      contact: business.presurvey_inspector_contact || '',
                      date: business.presurvey_inspector_date || ''
                    },
                    specialNotes: business.presurvey_special_notes || ''
                  },
                  postinstall: {
                    inspectorInfo: {
                      name: business.postinstall_installer_name || '',
                      contact: business.postinstall_installer_contact || '',
                      date: business.postinstall_installer_date || ''
                    },
                    specialNotes: business.postinstall_special_notes || ''
                  },
                  aftersales: {
                    inspectorInfo: {
                      name: business.aftersales_technician_name || '',
                      contact: business.aftersales_technician_contact || '',
                      date: business.aftersales_technician_date || ''
                    },
                    specialNotes: business.aftersales_special_notes || ''
                  }
                });
              }
            } catch (error) {
              console.error('❌ [FRONTEND] 시설 관리 정보 로드 실패:', error);
            }
        } else {
          // 기본 사업장 정보 설정 (fallback)
          setBusinessInfo({
            businessName: businessName,
            사업장명: businessName,
            주소: '정보 없음',
            사업장연락처: '정보 없음',
            담당자명: '정보 없음',
            담당자연락처: '정보 없음',
            담당자직급: '정보 없음',
            대표자: '정보 없음',
            사업자등록번호: '정보 없음',
            업종: '정보 없음',
            found: false
          });
        }
      }

      // 대기필증 데이터 로딩 완료

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('요청 시간이 초과되었습니다. 네트워크를 확인해주세요.');
      } else {
        setError('데이터 로드 중 오류가 발생했습니다.');
      }
      console.error('데이터 로딩 오류:', err);
    } finally {
      setLoading(false);
      clearTimeout(timeoutId);
    }
  }, [businessName]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  // Reload data when system type changes
  useEffect(() => {
    if (businessName) {
      loadData();
    }
  }, [systemType, businessName]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSystemTypeDropdown) {
        const target = event.target as Element;
        if (!target.closest('.system-type-dropdown')) {
          setShowSystemTypeDropdown(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSystemTypeDropdown]);

  // Phase별 업데이트 핸들러
  const handleInspectorUpdate = useCallback((info: typeof inspectorInfo) => {
    setPhaseData(prev => ({
      ...prev,
      [currentPhase]: {
        ...prev[currentPhase],
        inspectorInfo: info
      }
    }));
  }, [currentPhase]);

  const handleNotesUpdate = useCallback((notes: string) => {
    setPhaseData(prev => ({
      ...prev,
      [currentPhase]: {
        ...prev[currentPhase],
        specialNotes: notes
      }
    }));
  }, [currentPhase]);

  // 기존 호환성 핸들러 (deprecated)
  const handleInspectorInfoChange = useCallback((field: string, value: string) => {
    let processedValue = value;

    if (field === 'contact') {
      processedValue = formatPhoneNumber(value);
    }

    setPhaseData(prev => ({
      ...prev,
      [currentPhase]: {
        ...prev[currentPhase],
        inspectorInfo: {
          ...prev[currentPhase].inspectorInfo,
          [field]: processedValue
        }
      }
    }));
  }, [formatPhoneNumber, currentPhase]);

  const handleSpecialNotesChange = useCallback((value: string) => {
    setPhaseData(prev => ({
      ...prev,
      [currentPhase]: {
        ...prev[currentPhase],
        specialNotes: value
      }
    }));
  }, [currentPhase]);

  // Save inspector info using facility-management API (phase별 저장)
  const saveInspectorInfo = useCallback(async (infoToSave?: typeof inspectorInfo) => {
    if (saveStates.inspector || !businessInfo?.id) return;

    const info = infoToSave || inspectorInfo;

    try {
      setSaveStates(prev => ({ ...prev, inspector: true }));

      // Phase별 필드명 매핑
      const fieldMap = {
        presurvey: {
          name: 'presurvey_inspector_name',
          contact: 'presurvey_inspector_contact',
          date: 'presurvey_inspector_date'
        },
        postinstall: {
          name: 'postinstall_installer_name',
          contact: 'postinstall_installer_contact',
          date: 'postinstall_installer_date'
        },
        aftersales: {
          name: 'aftersales_technician_name',
          contact: 'aftersales_technician_contact',
          date: 'aftersales_technician_date'
        }
      };

      const fields = fieldMap[currentPhase];

      const response = await fetch('/api/facility-management', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessInfo.id,
          phase: currentPhase,
          [fields.name]: info.name,
          [fields.contact]: info.contact,
          [fields.date]: info.date
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const phaseNames = {
          presurvey: '실사자',
          postinstall: '설치자',
          aftersales: 'AS 담당자'
        };
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-3 py-2 rounded-lg z-50 animate-fade-in text-sm';
        toast.textContent = `${phaseNames[currentPhase]} 정보가 저장되었습니다.`;
        document.body.appendChild(toast);

        setTimeout(() => {
          toast.remove();
        }, 3000);
      } else {
        throw new Error(result.message || '저장 실패');
      }
    } catch (error) {
      console.error(`${currentPhase} 담당자 정보 저장 오류:`, error);
      const errorMessage = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';

      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-3 py-2 rounded-lg z-50 animate-fade-in text-sm';
      toast.textContent = errorMessage;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 3000);
    } finally {
      setSaveStates(prev => ({ ...prev, inspector: false }));
    }
  }, [saveStates.inspector, businessInfo?.id, inspectorInfo, currentPhase]);

  // Save special notes using facility-management API (phase별 저장)
  const saveSpecialNotes = useCallback(async (notesToSave?: string) => {
    if (saveStates.notes || !businessInfo?.id) return;

    const notes = notesToSave !== undefined ? notesToSave : specialNotes;

    try {
      setSaveStates(prev => ({ ...prev, notes: true }));

      // Phase별 필드명 매핑
      const fieldMap = {
        presurvey: 'presurvey_special_notes',
        postinstall: 'postinstall_special_notes',
        aftersales: 'aftersales_special_notes'
      };

      const response = await fetch('/api/facility-management', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: businessInfo.id,
          phase: currentPhase,
          [fieldMap[currentPhase]]: notes
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-3 py-2 rounded-lg z-50 animate-fade-in text-sm';
        toast.textContent = '특이사항이 저장되었습니다.';
        document.body.appendChild(toast);

        setTimeout(() => {
          toast.remove();
        }, 3000);

        // 저장 성공 - 페이지 새로고침 없이 상태만 업데이트
        console.log('✅ [SPECIAL-NOTES-SAVED] 특이사항 저장 완료');
      } else {
        throw new Error(result.message || '저장 실패');
      }
    } catch (error) {
      console.error('특이사항 저장 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';

      const toast = document.createElement('div');
      toast.className = 'fixed top-4 right-4 bg-red-500 text-white px-3 py-2 rounded-lg z-50 animate-fade-in text-sm';
      toast.textContent = errorMessage;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 3000);
    } finally {
      setSaveStates(prev => ({ ...prev, notes: false }));
    }
  }, [saveStates.notes, businessInfo?.id, specialNotes, currentPhase]);

  // Memoized facility stats
  const facilityStats = useMemo(() => {
    if (!facilities) return { hasDischarge: false, hasPrevention: false, hasFacilities: false };
    
    const hasDischarge = facilities.discharge.length > 0;
    const hasPrevention = facilities.prevention.length > 0;
    const hasFacilities = hasDischarge || hasPrevention;
    
    return { hasDischarge, hasPrevention, hasFacilities };
  }, [facilities]);

  if (loading) {
    return (
      <LoadingSpinner 
        type="business" 
        message={`${businessName} 사업장의 시설 정보를 불러오고 있습니다`}
        size="lg"
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-red-600 mb-2">데이터 로드 실패</h1>
          <p className="text-red-500 mb-3 text-sm">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (!facilities || !businessInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-5xl mb-3">📭</div>
          <h1 className="text-xl font-bold text-gray-600 mb-2">데이터 없음</h1>
          <p className="text-gray-500 mb-3 text-sm">사업장 데이터를 찾을 수 없습니다</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <FileProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
        {/* Header with system type dropdown */}
        <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100/50">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
            <div className="text-center text-gray-800">
              <h1 className="text-lg sm:text-xl md:text-xl lg:text-2xl font-bold mb-1 sm:mb-2 flex items-center justify-center gap-1 sm:gap-2">
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5" />
                {businessName}
              </h1>
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <p className="text-gray-600 text-[10px] sm:text-xs md:text-sm font-medium">
                  시설 관리 및 보고서 작성
                </p>
                
                {/* System Phase selection dropdown */}
                <div className="relative system-type-dropdown">
                  <button
                    onClick={() => setShowSystemTypeDropdown(!showSystemTypeDropdown)}
                    className="bg-gray-700 hover:bg-gray-800 text-white px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-xs md:text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    {currentPhase === 'presurvey' && '🔍 설치 전 실사'}
                    {currentPhase === 'postinstall' && '📸 설치 후 사진'}
                    {currentPhase === 'aftersales' && '🔧 AS 사진'}
                    <ChevronDown className={`w-3 h-3 md:w-4 md:h-4 transition-transform ${showSystemTypeDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showSystemTypeDropdown && (
                    <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-10 min-w-[140px] md:min-w-[160px]">
                      <button
                        onClick={() => {
                          setCurrentPhase('presurvey');
                          setSystemType('presurvey');
                          setShowSystemTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 md:px-3 md:py-2 text-left hover:bg-gray-50 transition-colors text-xs md:text-sm ${
                          currentPhase === 'presurvey' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        🔍 설치 전 실사
                      </button>
                      <button
                        onClick={() => {
                          setCurrentPhase('postinstall');
                          setSystemType('completion');
                          setShowSystemTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 md:px-3 md:py-2 text-left hover:bg-gray-50 transition-colors text-xs md:text-sm ${
                          currentPhase === 'postinstall' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        📸 설치 후 사진
                      </button>
                      <button
                        onClick={() => {
                          setCurrentPhase('aftersales');
                          setSystemType('completion');
                          setShowSystemTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 md:px-3 md:py-2 text-left hover:bg-gray-50 transition-colors text-xs md:text-sm ${
                          currentPhase === 'aftersales' ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        🔧 AS 사진
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <div className="max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-6xl mx-auto space-y-3 sm:space-y-4 md:space-y-4">

            {/* ========== PRESURVEY MODE SECTIONS ========== */}
            {systemType === 'presurvey' && (
              <>
                {/* 1. 사업장 정보 */}
                {businessInfo && (
                  <BusinessInfoSection businessInfo={businessInfo} />
                )}


                {/* 2-1. Supabase 시설 정보 */}
                {/* <SupabaseFacilitiesSection businessName={businessName} /> */}

                {/* 2-2. 강화된 시설 정보 섹션 (사전조사용) */}
                {facilities && (
                  <EnhancedFacilityInfoSection
                    businessName={businessName}
                    businessId={businessInfo?.id}
                    facilities={facilities}
                    facilityNumbering={facilityNumbering}
                    systemType={systemType}
                    onFacilitiesUpdate={setFacilities}
                  />
                )}





                {/* 6. 실사자 정보 */}
                <InspectorInfoSection
                  inspectorInfo={inspectorInfo}
                  onUpdate={handleInspectorUpdate}
                  onSave={saveInspectorInfo}
                  isSaving={saveStates.inspector}
                />

                {/* 7. 특이사항 */}
                <SpecialNotesSection
                  notes={specialNotes}
                  onUpdate={handleNotesUpdate}
                  onSave={saveSpecialNotes}
                  isSaving={saveStates.notes}
                />
              </>
            )}

            {/* 시설별 사진 업로드 섹션 */}
            {systemType === 'presurvey' && (
              <ImprovedFacilityPhotoSection
                businessName={businessName}
                facilities={facilities}
                facilityNumbering={facilityNumbering}
                currentPhase={currentPhase}
              />
            )}

            {/* ========== COMPLETION MODE SECTIONS ========== */}
            {systemType === 'completion' && (
              <>
                {/* 1. 사업장 정보 - for completion type or always show */}
                {businessInfo && (
                  <BusinessInfoSection businessInfo={businessInfo} />
                )}

                {/* 2. 강화된 시설 정보 섹션 */}
                {facilities && (
                  <EnhancedFacilityInfoSection
                    businessName={businessName}
                    businessId={businessInfo?.id}
                    facilities={facilities}
                    facilityNumbering={facilityNumbering}
                    systemType={systemType}
                    onFacilitiesUpdate={setFacilities}
                  />
                )}


                {/* 3. 담당자 정보 (Phase별) */}
                <InspectorInfoSection
                  inspectorInfo={inspectorInfo}
                  onUpdate={handleInspectorUpdate}
                  onSave={saveInspectorInfo}
                  isSaving={saveStates.inspector}
                  title={
                    currentPhase === 'postinstall' ? '설치자 정보' :
                    currentPhase === 'aftersales' ? 'AS 담당자 정보' :
                    '실사자 정보'
                  }
                />

                {/* 4. 특이사항 */}
                <SpecialNotesSection
                  notes={specialNotes}
                  onUpdate={handleNotesUpdate}
                  onSave={saveSpecialNotes}
                  isSaving={saveStates.notes}
                />

                {/* 5. 시설별 사진 업로드 섹션 (completion mode) */}
                <ImprovedFacilityPhotoSection
                  businessName={businessName}
                  facilities={facilities}
                  facilityNumbering={facilityNumbering}
                  currentPhase={currentPhase}
                />
              </>
            )}
          </div>
        </div>

        {/* Global styles for animations */}
        <style jsx>{`
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fade-in 0.3s ease-out;
          }
        `}</style>
        </div>
      </FileProvider>
    </ToastProvider>
  );
}