'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceDisplay } from './InvoiceDisplay';
import { MemoSection } from './MemoSection';
import { TokenManager } from '@/lib/api-client';
import type { CalculatedData, OperatingCostAdjustment } from '@/types';

interface BusinessRevenueModalProps {
  business: any;
  isOpen: boolean;
  onClose: (dataChanged?: boolean) => void;
  userPermission: number;
}

export default function BusinessRevenueModal({
  business,
  isOpen,
  onClose,
  userPermission
}: BusinessRevenueModalProps) {
  const router = useRouter();
  const [calculatedData, setCalculatedData] = useState<CalculatedData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ 데이터 변경 추적 (영업비용 조정 또는 실사비 저장 시 true)
  const [dataChanged, setDataChanged] = useState(false);

  // 🎯 안정적인 business ID 추출 (의존성 배열용)
  const businessId = business?.id;

  // 🔧 이전 businessId 추적 (불필요한 재조회 방지)
  const prevBusinessIdRef = React.useRef<string | undefined>();
  const prevIsOpenRef = React.useRef<boolean>(false);

  // 영업비용 조정 상태
  const [isEditingAdjustment, setIsEditingAdjustment] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    amount: 0,
    type: 'add' as 'add' | 'subtract',
    reason: ''
  });
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);

  // 실사비 조정 상태
  const [isEditingSurveyFee, setIsEditingSurveyFee] = useState(false);
  const [surveyFeeForm, setSurveyFeeForm] = useState({
    amount: 0
  });
  const [isSavingSurveyFee, setIsSavingSurveyFee] = useState(false);

  // 🔄 모달이 닫힐 때 ref 리셋
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      // businessId는 유지 (다음에 같은 사업장 열면 캐시 사용)
    }
  }, [isOpen]);

  // API에서 최신 계산 결과 가져오기 (Hook은 항상 최상위에서 호출)
  // ⚠️ 중요: isOpen이 true로 변경될 때만 실행 (모달 열릴 때만)
  // ✨ 최적화: SessionStorage 캐싱으로 복귀 시 로딩 시간 단축
  useEffect(() => {
    // 조건 체크는 Hook 내부에서 수행
    if (!isOpen || !businessId) {
      return;
    }

    // 🔒 중복 호출 방지: 이미 열려있는 상태에서 같은 business 재선택 시 스킵
    const wasAlreadyOpen = prevIsOpenRef.current;
    const sameBusinessId = prevBusinessIdRef.current === businessId;

    if (wasAlreadyOpen && sameBusinessId) {
      console.log('⏭️ [SKIP] 모달 이미 열려있음, 같은 사업장 → API 호출 생략:', business?.business_name);
      return;
    }

    // Ref 업데이트
    prevIsOpenRef.current = isOpen;
    prevBusinessIdRef.current = businessId;

    // ✅ 모달 열릴 때 dataChanged 초기화
    setDataChanged(false);

    const fetchLatestCalculation = async () => {
      setIsRefreshing(true);
      setError(null);

      try {
        // 1️⃣ 캐시 확인
        const cacheKey = `revenue_calc_${businessId}`;
        const cached = sessionStorage.getItem(cacheKey);

        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            const TTL = 5 * 60 * 1000; // 5분

            if (age < TTL) {
              console.log('✅ [CACHE-HIT] Revenue 계산 캐시 사용 (모달 열림):', business?.business_name || business?.사업장명);
              setCalculatedData(data);
              setIsRefreshing(false);
              return; // 캐시 사용, API 호출 생략
            } else {
              console.log('⏰ [CACHE-EXPIRED] 캐시 만료, 재계산:', business?.business_name || business?.사업장명);
            }
          } catch (e) {
            console.warn('⚠️ [CACHE-ERROR] 캐시 파싱 실패:', e);
          }
        } else {
          console.log('📭 [NO-CACHE] 캐시 없음, API 호출:', business?.business_name || business?.사업장명);
        }

        // 2️⃣ API 호출 (캐시 없거나 만료된 경우)
        console.log('🔄 [API-CALL] Revenue 계산 API 호출:', business?.business_name || business?.사업장명);
        const token = TokenManager.getToken();
        const response = await fetch('/api/revenue/calculate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            business_id: businessId,
            save_result: false
          })
        });

        const data = await response.json();

        if (data.success && data.data && data.data.calculation) {
          setCalculatedData(data.data.calculation);

          // 3️⃣ 캐시 저장
          sessionStorage.setItem(cacheKey, JSON.stringify({
            data: data.data.calculation,
            timestamp: Date.now()
          }));
          console.log('💾 [CACHE-SET] Revenue 계산 결과 캐시 저장:', business?.business_name || business?.사업장명);
        } else {
          setError(data.message || '계산 결과를 가져올 수 없습니다.');
        }
      } catch (err) {
        console.error('❌ [API-ERROR] 매출 계산 오류:', err);
        setError('계산 중 오류가 발생했습니다.');
      } finally {
        setIsRefreshing(false);
      }
    };

    fetchLatestCalculation();
  }, [isOpen, businessId]); // ✅ 안정화: businessId만 의존성으로 사용

  // 영업비용 조정 값 로드 (기존 조정이 있으면 폼에 채우기)
  useEffect(() => {
    if (calculatedData?.operating_cost_adjustment) {
      const adj = calculatedData.operating_cost_adjustment;
      setAdjustmentForm({
        amount: adj.adjustment_amount,
        type: adj.adjustment_type,
        reason: adj.adjustment_reason || ''
      });
    } else {
      // 조정이 없으면 폼 초기화
      setAdjustmentForm({ amount: 0, type: 'add', reason: '' });
    }
  }, [calculatedData?.operating_cost_adjustment]);

  // 실사비 조정 값 로드
  useEffect(() => {
    if (calculatedData?.survey_fee_adjustment) {
      setSurveyFeeForm({
        amount: calculatedData.survey_fee_adjustment
      });
    } else if (business?.survey_fee_adjustment) {
      setSurveyFeeForm({
        amount: business.survey_fee_adjustment
      });
    } else {
      setSurveyFeeForm({ amount: 0 });
    }
  }, [calculatedData?.survey_fee_adjustment, business?.survey_fee_adjustment]);

  // 🗑️ 캐시 무효화 유틸리티 함수
  const invalidateRevenueCache = (businessId: string) => {
    const cacheKey = `revenue_calc_${businessId}`;
    sessionStorage.removeItem(cacheKey);
    console.log('🗑️ [CACHE-INVALIDATE] Revenue 캐시 삭제:', businessId);
  };

  // 영업비용 조정 저장 핸들러
  const handleSaveAdjustment = async () => {
    if (!business?.id) return;

    // 금액 유효성 검증
    if (adjustmentForm.amount <= 0) {
      alert('조정 금액은 0보다 커야 합니다.');
      return;
    }

    setIsSavingAdjustment(true);
    try {
      const token = TokenManager.getToken();
      const url = '/api/revenue/operating-cost-adjustment';
      const hasExisting = calculatedData?.operating_cost_adjustment;
      const method = hasExisting ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          business_id: business.id,
          adjustment_amount: adjustmentForm.amount,
          adjustment_type: adjustmentForm.type,
          adjustment_reason: adjustmentForm.reason || undefined
        })
      });

      const data = await response.json();

      if (data.success) {
        const calcResponse = await fetch('/api/revenue/calculate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            business_id: business.id,
            save_result: true
          })
        });

        const calcData = await calcResponse.json();

        if (calcData.success && calcData.data && calcData.data.calculation) {
          setCalculatedData(calcData.data.calculation);
          // 캐시 무효화 - 데이터가 변경되었으므로
          invalidateRevenueCache(business.id);
          // ✅ 데이터 변경 플래그 설정
          setDataChanged(true);
        } else {
          alert('조정은 저장되었으나 매출 재계산에 실패했습니다. 페이지를 새로고침해주세요.');
        }

        setIsEditingAdjustment(false);
        alert('영업비용 조정이 저장되었습니다.');
      } else {
        alert(data.message || '조정 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('영업비용 조정 저장 오류:', error);
      alert('조정 저장 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.');
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  // 영업비용 조정 삭제 핸들러
  const handleDeleteAdjustment = async () => {
    if (!business?.id || !calculatedData?.operating_cost_adjustment) {
      return;
    }

    if (!confirm('영업비용 조정을 삭제하시겠습니까?\n\n삭제 후 영업비용은 기본 계산 방식으로 돌아갑니다.')) return;

    setIsSavingAdjustment(true);
    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/revenue/operating-cost-adjustment?business_id=${business.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        const calcResponse = await fetch('/api/revenue/calculate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            business_id: business.id,
            save_result: true
          })
        });

        const calcData = await calcResponse.json();

        if (calcData.success && calcData.data && calcData.data.calculation) {
          setCalculatedData(calcData.data.calculation);
          // ✅ 데이터 변경 플래그 설정
          setDataChanged(true);
        } else {
          alert('조정은 삭제되었으나 매출 재계산에 실패했습니다. 페이지를 새로고침해주세요.');
        }

        setAdjustmentForm({ amount: 0, type: 'add', reason: '' });
        setIsEditingAdjustment(false);
        alert('영업비용 조정이 삭제되었습니다.');
      } else {
        alert(data.message || '조정 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('영업비용 조정 삭제 오류:', error);
      alert('조정 삭제 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.');
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  // 실사비 조정 저장 핸들러
  const handleSaveSurveyFee = async () => {
    if (!business?.id) return;

    setIsSavingSurveyFee(true);
    try {
      const token = TokenManager.getToken();

      // business_info 테이블에 직접 업데이트
      const response = await fetch('/api/business-info-direct', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: business.id,
          survey_fee_adjustment: surveyFeeForm.amount === null || surveyFeeForm.amount === undefined
            ? null
            : surveyFeeForm.amount
        })
      });

      const data = await response.json();

      if (data.success) {
        // 매출 재계산
        const calcResponse = await fetch('/api/revenue/calculate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            business_id: business.id,
            save_result: true
          })
        });

        const calcData = await calcResponse.json();

        if (calcData.success && calcData.data && calcData.data.calculation) {
          setCalculatedData(calcData.data.calculation);
          // 캐시 무효화 - 데이터가 변경되었으므로
          invalidateRevenueCache(business.id);
          // ✅ 데이터 변경 플래그 설정
          setDataChanged(true);
        }

        setIsEditingSurveyFee(false);
        alert('실사비 조정이 저장되었습니다.');
      } else {
        alert(data.message || '실사비 조정 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('실사비 조정 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.');
    } finally {
      setIsSavingSurveyFee(false);
    }
  };

  const formatCurrency = (amount: number | string | undefined) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) || 0 : (amount || 0);
    // 소수점 제거 - 원 단위는 항상 정수로 표시
    const roundedAmount = Math.round(numAmount);
    return `₩${roundedAmount.toLocaleString()}`;
  };

  const isReadOnly = userPermission < 2;
  const canEditAdjustment = userPermission >= 3;

  // 사업장명 클릭 핸들러 - Business 페이지로 이동하여 전체 기능 사용
  const handleBusinessNameClick = () => {
    if (!business?.id) {
      console.error('❌ [Navigation] Business ID가 없습니다.');
      return;
    }

    console.log('🔗 [Navigation] Business 페이지로 이동:', business.business_name || business.사업장명);

    // Business 페이지로 이동하며 모달 자동 오픈 + Revenue로 복귀 경로 설정
    router.push(`/admin/business?openModal=${business.id}&returnTo=/admin/revenue`);
  };

  // 모달이 닫혀있거나 business 데이터가 없으면 null 반환 (JSX 조건부 렌더링)
  if (!isOpen || !business) {
    return null;
  }

  // 표시할 데이터: API 계산 결과 우선, 없으면 기존 business 객체 사용
  const displayData = calculatedData ? {
    ...calculatedData,
    // NULL 값을 0으로 변환 (데이터베이스에서 NULL이 올 수 있음)
    survey_costs: Math.round(Number(calculatedData.survey_costs) || 0),
    installation_costs: Math.round(Number(calculatedData.installation_costs) || 0),
    net_profit: Math.round(Number(calculatedData.net_profit) || 0),
    additional_installation_revenue: Math.round(Number(calculatedData.installation_extra_cost) || 0),
    survey_fee_adjustment: calculatedData.survey_fee_adjustment ?? business.survey_fee_adjustment
  } : {
    total_revenue: Math.round(Number(business.total_revenue) || 0),
    total_cost: Math.round(Number(business.total_cost) || 0),
    gross_profit: Math.round(Number(business.gross_profit) || 0),
    sales_commission: Math.round(Number(business.sales_commission) || 0),
    survey_costs: Math.round(Number(business.survey_costs) || 0),
    installation_costs: Math.round(Number(business.installation_costs) || 0),
    additional_installation_revenue: Math.round(Number(business.installation_extra_cost) || Number(business.additional_installation_revenue) || 0),
    net_profit: Math.round(Number(business.net_profit) || 0),
    has_calculation: false,
    survey_fee_adjustment: Math.round(Number(business.survey_fee_adjustment) || 0),
    operating_cost_adjustment: null,
    adjusted_sales_commission: null,
    equipment_breakdown: undefined
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <button
                onClick={handleBusinessNameClick}
                className="hover:text-blue-600 hover:underline transition-colors cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1"
                title="사업장 상세 정보로 이동 (수정 가능)"
              >
                {business.business_name || business.사업장명}
              </button>
              <span className="text-gray-500">- 기기 상세 정보</span>
            </h3>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>계산 중...</span>
              </div>
            )}
            {calculatedData && (
              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                최신 계산 완료
              </span>
            )}
          </div>
          <button
            onClick={() => onClose(dataChanged)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 두 열 레이아웃: 왼쪽 메인 콘텐츠 + 오른쪽 메모 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 왼쪽: 메인 콘텐츠 (스크롤 가능) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 로딩 중 - 스켈레톤 UI */}
            {isRefreshing && !calculatedData ? (
              <div className="space-y-6 animate-pulse">
                {/* 매출 정보 스켈레톤 */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="h-6 bg-gray-300 rounded w-1/4 mb-4"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-20 bg-gray-200 rounded"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </div>
                </div>

                {/* 기기 목록 스켈레톤 */}
                <div>
                  <div className="h-6 bg-gray-300 rounded w-1/4 mb-4"></div>
                  <div className="space-y-3">
                    <div className="h-16 bg-gray-100 rounded"></div>
                    <div className="h-16 bg-gray-100 rounded"></div>
                    <div className="h-16 bg-gray-100 rounded"></div>
                  </div>
                </div>

                {/* 로딩 메시지 */}
                <div className="text-center text-gray-500 py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-lg font-medium">매출 정보를 불러오는 중...</p>
                  <p className="text-sm text-gray-400 mt-2">잠시만 기다려주세요</p>
                </div>
              </div>
            ) : (
              <>
                {/* 에러 메시지 */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-800">
                      ⚠️ {error}
                      <br />
                      <span className="text-xs text-red-600 mt-1">기존 저장된 데이터를 표시합니다.</span>
                    </p>
                  </div>
                )}

                {/* 사업장 기본 정보 */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-gray-600">영업점:</span>
                <span className="ml-2 text-sm text-gray-900">{business.sales_office || business.영업점 || '미배정'}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">진행 구분:</span>
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  business.category === '보조금' || business.category === '보조금 동시진행'
                    ? 'bg-purple-100 text-purple-800' :
                  business.category === '자비' ? 'bg-green-100 text-green-800' :
                  business.category === 'AS' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {business.category || business.진행구분 || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600">제조사:</span>
                <span className="ml-2 text-sm text-gray-900">{business.manufacturer || business.제조사 || '미지정'}</span>
              </div>
            </div>
            {(business.address || business.주소) && (
              <div>
                <span className="text-sm font-medium text-gray-600">주소:</span>
                <span className="ml-2 text-sm text-gray-900">{business.address || business.주소}</span>
              </div>
            )}
          </div>

          {/* 설치 기기 목록 */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">설치 기기 목록</h4>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left">기기명</th>
                    <th className="border border-gray-300 px-4 py-2 text-center">수량</th>
                    <th className="border border-gray-300 px-4 py-2 text-right">매출단가</th>
                    <th className="border border-gray-300 px-4 py-2 text-right">매입단가</th>
                    <th className="border border-gray-300 px-4 py-2 text-right">매출합계</th>
                    <th className="border border-gray-300 px-4 py-2 text-right">매입합계</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // API에서 받은 equipment_breakdown 사용
                    const equipmentBreakdown = displayData.equipment_breakdown || [];

                    if (equipmentBreakdown.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="border border-gray-300 px-4 py-6 text-center text-gray-500">
                            등록된 기기 정보가 없습니다.
                          </td>
                        </tr>
                      );
                    }

                    const totalRevenue = equipmentBreakdown.reduce((sum, item) => sum + (item.total_revenue || 0), 0);
                    const totalCost = equipmentBreakdown.reduce((sum, item) => sum + (item.total_cost || 0), 0);

                    return (
                      <>
                        {equipmentBreakdown.map((item: any) => (
                          <tr key={item.equipment_type} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-4 py-2">{item.equipment_name}</td>
                            <td className="border border-gray-300 px-4 py-2 text-center font-medium">{item.quantity}대</td>
                            <td className="border border-gray-300 px-4 py-2 text-right font-mono">
                              {Math.round(item.unit_official_price).toLocaleString()}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right font-mono text-red-600">
                              {Math.round(item.unit_manufacturer_price).toLocaleString()}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right font-mono font-medium">
                              {item.total_revenue.toLocaleString()}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right font-mono font-medium text-red-600">
                              {item.total_cost.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-blue-50 font-bold">
                          <td className="border border-gray-300 px-4 py-2" colSpan={4}>합계</td>
                          <td className="border border-gray-300 px-4 py-2 text-right font-mono text-blue-600">
                            {totalRevenue.toLocaleString()}원
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-right font-mono text-red-600">
                            {totalCost.toLocaleString()}원
                          </td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              * 매출단가는 환경부 고시가, 매입단가는 제조사별 원가가 적용됩니다. {calculatedData ? '최신 DB 가격이 적용되었습니다.' : '저장된 계산 결과입니다.'}
            </p>
          </div>

          {/* 추가 비용 정보 */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">추가 비용 정보</h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">추가공사비</span>
                <span className="text-base font-semibold text-green-700">
                  {(() => {
                    const value = Number(business.additional_cost || 0);
                    console.log('💰 추가공사비:', { raw: business.additional_cost, parsed: value });
                    return value > 0 ? `+${formatCurrency(value)}` : '₩0';
                  })()}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-700">협의사항 (할인 금액)</span>
                <span className="text-base font-semibold text-red-700">
                  {(() => {
                    const value = Number(business.negotiation || 0);
                    console.log('📋 협의사항:', { raw: business.negotiation, parsed: value });
                    return value > 0 ? `-${formatCurrency(value)}` : '₩0';
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* 매출/매입/이익 정보 */}
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-xs font-medium text-green-600 mb-1">매출금액</p>
                <p className="text-lg font-bold text-green-700">
                  {formatCurrency(Number(displayData.total_revenue))}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-xs font-medium text-red-600 mb-1">매입금액</p>
                <p className="text-lg font-bold text-red-700">
                  {formatCurrency(Number(displayData.total_cost))}
                </p>
              </div>
              <div className={`rounded-lg p-4 ${Number(displayData.net_profit) >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <p className={`text-xs font-medium mb-1 ${Number(displayData.net_profit) >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>순이익</p>
                <p className={`text-lg font-bold ${Number(displayData.net_profit) >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  {formatCurrency(Number(displayData.net_profit))}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-xs font-medium text-purple-600 mb-1">이익률</p>
                <p className="text-lg font-bold text-purple-700">
                  {displayData.total_revenue > 0
                    ? ((displayData.net_profit / displayData.total_revenue) * 100).toFixed(1)
                    : '0'}%
                </p>
              </div>
            </div>

            {/* 추가공사비 및 협의사항 */}
            {(business.additional_cost || business.negotiation) ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h5 className="text-sm font-semibold text-gray-800 mb-3">매출 조정 내역</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Number(business.additional_cost || 0) > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">추가공사비 (+):</span>
                      <span className="text-sm font-semibold text-green-700">
                        +{formatCurrency(business.additional_cost)}
                      </span>
                    </div>
                  ) : null}
                  {Number(business.negotiation || 0) > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">협의사항/네고 (-):</span>
                      <span className="text-sm font-semibold text-red-700">
                        -{formatCurrency(business.negotiation)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* 매출 계산식 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-gray-800 mb-3">💰 최종 매출금액 계산식</h5>
              <div className="text-sm text-gray-700 space-y-1">
                <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                  <span>기본 매출 (기기 합계)</span>
                  <span className="font-mono">{formatCurrency(
                    Number(displayData.total_revenue) -
                    Number(business.additional_cost || 0) +
                    Number(business.negotiation || 0)
                  )}</span>
                </div>
                {Number(business.additional_cost || 0) > 0 ? (
                  <div className="flex items-center justify-between text-green-700">
                    <span>+ 추가공사비</span>
                    <span className="font-mono">+{formatCurrency(Number(business.additional_cost))}</span>
                  </div>
                ) : null}
                {Number(business.negotiation || 0) > 0 ? (
                  <div className="flex items-center justify-between text-red-700">
                    <span>- 협의사항/네고</span>
                    <span className="font-mono">-{formatCurrency(Number(business.negotiation))}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t-2 border-blue-300 pt-2 font-bold text-blue-900">
                  <span>= 최종 매출금액</span>
                  <span className="font-mono text-lg">{formatCurrency(Number(displayData.total_revenue))}</span>
                </div>
              </div>
            </div>
          </>

          {/* 비용 상세 내역 */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">💰 비용 상세 내역</h4>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 영업비용 */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">💼 영업비용</span>
                    <div className="flex items-center gap-2">
                      {displayData.operating_cost_adjustment && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                          조정됨
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {business.sales_office || '미배정'} 영업점
                      </span>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-orange-700">
                    {formatCurrency(displayData.adjusted_sales_commission || displayData.sales_commission)}
                  </p>
                  {displayData.operating_cost_adjustment ? (
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      <div>기본: {formatCurrency(displayData.sales_commission)}</div>
                      <div className={displayData.operating_cost_adjustment.adjustment_type === 'add' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {displayData.operating_cost_adjustment.adjustment_type === 'add' ? '+ ' : '- '}
                        {formatCurrency(displayData.operating_cost_adjustment.adjustment_amount)}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      {calculatedData ? '최신 계산 적용' : '저장된 값'}
                    </p>
                  )}
                </div>

                {/* 영업비용 조정 카드 */}
                <div className="bg-yellow-50 rounded-lg p-4 shadow-sm border-2 border-yellow-300">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">⚙️ 영업비용 조정</span>
                    {!isEditingAdjustment && canEditAdjustment && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsEditingAdjustment(true)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {displayData.operating_cost_adjustment ? '수정' : '추가'}
                        </button>
                        {displayData.operating_cost_adjustment && (
                          <button
                            onClick={handleDeleteAdjustment}
                            disabled={isSavingAdjustment}
                            className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditingAdjustment && canEditAdjustment ? (
                    <div className="space-y-2">
                      <input
                        type="number"
                        placeholder="조정 금액"
                        value={adjustmentForm.amount || ''}
                        onChange={(e) => setAdjustmentForm({...adjustmentForm, amount: Number(e.target.value)})}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        min="0"
                      />
                      <select
                        value={adjustmentForm.type}
                        onChange={(e) => setAdjustmentForm({...adjustmentForm, type: e.target.value as 'add' | 'subtract'})}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                        <option value="add">추가 (+)</option>
                        <option value="subtract">차감 (-)</option>
                      </select>
                      <textarea
                        placeholder="조정 사유 (선택)"
                        value={adjustmentForm.reason}
                        onChange={(e) => setAdjustmentForm({...adjustmentForm, reason: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveAdjustment}
                          disabled={isSavingAdjustment || adjustmentForm.amount <= 0}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {isSavingAdjustment ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingAdjustment(false);
                            // 기존 값으로 복원
                            if (displayData.operating_cost_adjustment) {
                              setAdjustmentForm({
                                amount: displayData.operating_cost_adjustment.adjustment_amount,
                                type: displayData.operating_cost_adjustment.adjustment_type,
                                reason: displayData.operating_cost_adjustment.adjustment_reason || ''
                              });
                            } else {
                              setAdjustmentForm({ amount: 0, type: 'add', reason: '' });
                            }
                          }}
                          disabled={isSavingAdjustment}
                          className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50 font-medium"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {displayData.operating_cost_adjustment ? (
                        <>
                          <p className="text-xl font-bold text-yellow-700">
                            {displayData.operating_cost_adjustment.adjustment_type === 'add' ? '+' : '-'}
                            {formatCurrency(displayData.operating_cost_adjustment.adjustment_amount)}
                          </p>
                          {displayData.operating_cost_adjustment.adjustment_reason && (
                            <p className="text-xs text-gray-600 mt-1 italic">
                              사유: {displayData.operating_cost_adjustment.adjustment_reason}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">조정 없음</p>
                      )}
                      {!canEditAdjustment && (
                        <p className="text-xs text-gray-400 mt-2">
                          ℹ️ 권한 레벨 3 이상만 수정 가능합니다
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* 실사비용 */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">📋 실사비용</span>
                    <div className="flex items-center gap-2">
                      {displayData.survey_fee_adjustment && displayData.survey_fee_adjustment !== 0 ? (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                          조정됨
                        </span>
                      ) : null}
                      <span className="text-xs text-gray-500">실사일 기반 계산</span>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-purple-700">
                    {formatCurrency(displayData.survey_costs)}
                  </p>
                  {displayData.survey_fee_adjustment && displayData.survey_fee_adjustment !== 0 ? (
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      <div>기본: {formatCurrency((displayData.survey_costs || 0) - (displayData.survey_fee_adjustment || 0))}</div>
                      <div className={displayData.survey_fee_adjustment > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        조정: {displayData.survey_fee_adjustment > 0 ? '+' : ''}{formatCurrency(displayData.survey_fee_adjustment)}
                      </div>
                    </div>
                  ) : null}

                  {/* 실사 일정 표시 (YY-MM-DD 형식) */}
                  {(() => {
                    const formatCompactDate = (dateString: string | null): string => {
                      if (!dateString) return '';
                      const date = new Date(dateString);
                      const year = String(date.getFullYear()).slice(-2);
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    };

                    const surveys = [
                      { label: '견적', date: business.estimate_survey_date },
                      { label: '착공', date: business.pre_construction_survey_date },
                      { label: '준공', date: business.completion_survey_date }
                    ].filter(s => s.date);

                    if (surveys.length === 0) {
                      return (
                        <p className="text-xs text-gray-500 mt-1 italic">
                          실사 일정 미등록
                        </p>
                      );
                    }

                    return (
                      <p className="text-xs text-gray-500 mt-1">
                        {surveys.map((survey, idx) => (
                          <span key={idx}>
                            {idx > 0 && ', '}
                            {survey.label}|{formatCompactDate(survey.date)}
                          </span>
                        ))}
                      </p>
                    );
                  })()}
                </div>

                {/* 실사비용 조정 카드 */}
                <div className="bg-purple-50 rounded-lg p-4 shadow-sm border-2 border-purple-300">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">⚙️ 실사비용 조정</span>
                    {!isEditingSurveyFee && userPermission >= 2 && (
                      <button
                        onClick={() => setIsEditingSurveyFee(true)}
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                      >
                        {displayData.survey_fee_adjustment && displayData.survey_fee_adjustment !== 0 ? '수정' : '추가'}
                      </button>
                    )}
                  </div>

                  {isEditingSurveyFee ? (
                    <div className="space-y-2">
                      <input
                        type="number"
                        placeholder="조정 금액 (양수=증가, 음수=감소, 빈칸=제거)"
                        value={surveyFeeForm.amount || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            setSurveyFeeForm({amount: null as any});
                          } else {
                            const numValue = Number(value);
                            setSurveyFeeForm({amount: isNaN(numValue) ? null as any : numValue});
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-xs text-gray-500">
                        💡 기본 실사비 100,000원 기준, 양수는 증가/음수는 감소
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveSurveyFee}
                          disabled={isSavingSurveyFee}
                          className="flex-1 px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {isSavingSurveyFee ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingSurveyFee(false);
                            // 기존 값으로 복원
                            const currentValue = calculatedData?.survey_fee_adjustment ?? business?.survey_fee_adjustment;
                            if (currentValue !== null && currentValue !== undefined) {
                              setSurveyFeeForm({amount: currentValue});
                            } else {
                              setSurveyFeeForm({amount: null as any});
                            }
                          }}
                          disabled={isSavingSurveyFee}
                          className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50 font-medium"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {displayData.survey_fee_adjustment && displayData.survey_fee_adjustment !== 0 ? (
                        <p className="text-xl font-bold text-purple-700">
                          {displayData.survey_fee_adjustment > 0 ? '+' : ''}
                          {formatCurrency(displayData.survey_fee_adjustment)}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">조정 없음</p>
                      )}
                      {!userPermission || userPermission < 2 ? (
                        <p className="text-xs text-gray-400 mt-2">
                          ℹ️ 권한 레벨 2 이상만 수정 가능합니다
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* 설치비 */}
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">🔧 총 설치비</span>
                  </div>
                  <p className="text-xl font-bold text-cyan-700">
                    {(() => {
                      const total = Number(displayData.installation_costs || 0) + Number(displayData.additional_installation_revenue || 0);
                      console.log('🔧 총 설치비 계산:', {
                        installation_costs: displayData.installation_costs,
                        additional_installation_revenue: displayData.additional_installation_revenue,
                        total: total
                      });
                      return formatCurrency(total);
                    })()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    기본 설치비 + 추가설치비
                  </p>
                </div>

                {/* 총 비용 */}
                <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg p-4 shadow-md text-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">📊 총 비용 합계</span>
                  </div>
                  <p className="text-xl font-bold">
                    {(() => {
                      const total = Number(displayData.adjusted_sales_commission || displayData.sales_commission || 0) +
                        Number(displayData.survey_costs || 0) +
                        Number(displayData.installation_costs || 0) +
                        Number(displayData.additional_installation_revenue || 0);
                      console.log('📊 총 비용 합계 계산:', {
                        sales_commission: displayData.adjusted_sales_commission || displayData.sales_commission,
                        survey_costs: displayData.survey_costs,
                        installation_costs: displayData.installation_costs,
                        additional_installation_revenue: displayData.additional_installation_revenue,
                        total: total
                      });
                      return formatCurrency(total);
                    })()}
                  </p>
                  <p className="text-xs opacity-80 mt-1">
                    {displayData.operating_cost_adjustment ? '조정된 영업비용' : '영업비용'} + 실사비용 + 총설치비
                  </p>
                </div>
              </div>

              {/* 최종 이익 계산 공식 */}
              <div className="mt-4 bg-white rounded-lg p-4 border-2 border-blue-300">
                <h5 className="text-sm font-semibold text-gray-800 mb-3">📐 순이익 계산 공식</h5>
                <div className="text-sm text-gray-700 space-y-2 font-mono">
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span>매출금액</span>
                    <span className="font-bold text-green-700">{formatCurrency(Number(displayData.total_revenue))}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span>- 매입금액</span>
                    <span className="font-bold text-red-700">-{formatCurrency(Number(displayData.total_cost))}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span>= 총 이익</span>
                    <span className="font-bold text-gray-700">{formatCurrency(Number(displayData.gross_profit))}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span>- 영업비용</span>
                    <span className="font-bold text-orange-700">
                      -{formatCurrency(Number(displayData.adjusted_sales_commission || displayData.sales_commission))}
                    </span>
                  </div>
                  {displayData.operating_cost_adjustment && (
                    <div className="text-xs text-yellow-600 pl-4 -mt-1 mb-2">
                      (기본 {formatCurrency(Number(displayData.sales_commission))}
                      {displayData.operating_cost_adjustment.adjustment_type === 'add' ? ' + ' : ' - '}
                      {formatCurrency(Number(displayData.operating_cost_adjustment.adjustment_amount))})
                    </div>
                  )}
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span>- 실사비용</span>
                    <span className="font-bold text-purple-700">-{formatCurrency(Number(displayData.survey_costs))}</span>
                  </div>
                  {(displayData.survey_fee_adjustment && displayData.survey_fee_adjustment !== 0) ? (
                    <div className="text-xs text-purple-600 pl-4 -mt-1 mb-2">
                      (기본 {formatCurrency(Number(displayData.survey_costs || 0) - Number(displayData.survey_fee_adjustment || 0))}
                      {displayData.survey_fee_adjustment > 0 ? ' + ' : ' - '}
                      {formatCurrency(Math.abs(Number(displayData.survey_fee_adjustment)))} 조정)
                    </div>
                  ) : null}
                  <div className="flex justify-between border-b border-gray-200 pb-2">
                    <span>- 기본설치비</span>
                    <span className="font-bold text-cyan-700">-{formatCurrency(Number(displayData.installation_costs))}</span>
                  </div>
                  {Math.round(Number(displayData.additional_installation_revenue || 0)) > 0 ? (
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                      <span>- 추가설치비</span>
                      <span className="font-bold text-orange-700">-{formatCurrency(Number(displayData.additional_installation_revenue))}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t-2 border-blue-400 pt-3">
                    <span className="font-bold text-lg">= 순이익</span>
                    <span className={`font-bold text-lg ${Number(displayData.net_profit) >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {formatCurrency(Number(displayData.net_profit))}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  ℹ️ 매출관리 페이지와 동일한 계산 방식 적용
                </p>
              </div>
            </div>
          </div>

          {/* 계산서 및 입금 현황 */}
          {business.id && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-4 md:p-6 border border-purple-200">
              <div className="flex items-center mb-4">
                <div className="p-2 bg-purple-600 rounded-lg mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-base md:text-lg font-semibold text-slate-800">계산서 및 입금 현황 (미수금 관리)</h3>
              </div>
              <InvoiceDisplay
                businessId={business.id}
                businessCategory={business.category || business.business_category || business.progress_status}
                additionalCost={business.additional_cost}
              />
            </div>
          )}

            {/* 읽기 전용 안내 (권한 0-1) */}
            {isReadOnly && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  ℹ️ 현재 읽기 전용 모드입니다. 정보 수정은 권한 레벨 2 이상이 필요합니다.
                </p>
              </div>
            )}
              </>
            )}
          </div>

          {/* 오른쪽: 메모 사이드바 */}
          <div className="w-80 border-l border-indigo-200 flex flex-col overflow-hidden bg-gradient-to-b from-indigo-50/30 to-white">
            <MemoSection
              businessId={business.id}
              businessName={business.business_name || business.사업장명 || ''}
              userPermission={userPermission}
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onClose(dataChanged)}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
