'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/ui/AdminLayout';
import StatsCard from '@/components/ui/StatsCard';
import { withAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import { MonthlyClosing, MiscellaneousCost } from '@/types';
import {
  DollarSign,
  Users,
  Building2,
  FileText,
  TrendingUp,
  Loader2,
  Plus,
  Trash2,
  X,
  RefreshCw,
  ClipboardCheck
} from 'lucide-react';

function MonthlyClosingPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [closings, setClosings] = useState<MonthlyClosing[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [autoCalculating, setAutoCalculating] = useState(false);
  const [calculationProgress, setCalculationProgress] = useState({
    current: 0,
    total: 0,
    message: ''
  });
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    totalCost: 0,
    totalSalesCommission: 0,
    totalSurveyCosts: 0,
    totalInstallationCosts: 0,
    totalMiscCosts: 0,
    totalProfit: 0
  });
  const [unclassified, setUnclassified] = useState({
    count: 0,
    totalRevenue: 0,
    totalCost: 0,
    salesCommissionCosts: 0,
    surveyCosts: 0,
    installationCosts: 0,
    netProfit: 0
  });

  // 기타 비용 모달
  const [showMiscCostModal, setShowMiscCostModal] = useState(false);
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(null);
  const [selectedClosingYearMonth, setSelectedClosingYearMonth] = useState<string>('');
  const [miscCosts, setMiscCosts] = useState<MiscellaneousCost[]>([]);
  const [loadingMiscCosts, setLoadingMiscCosts] = useState(false);
  const [newMiscCost, setNewMiscCost] = useState({
    itemName: '',
    amount: 0,
    description: ''
  });

  // 월별 상세 내역 모달
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailClosing, setDetailClosing] = useState<MonthlyClosing | null>(null);
  const [detailBusinesses, setDetailBusinesses] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // 페이지 로드 시 데이터 로드
  useEffect(() => {
    loadClosings();
  }, [selectedYear, selectedMonth]);

  // 현재 월 자동 계산
  useEffect(() => {
    autoCalculateCurrentMonth();
  }, []);

  const getAuthHeaders = () => {
    const token = TokenManager.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const loadClosings = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append('year', String(selectedYear));
      if (selectedMonth) {
        params.append('month', String(selectedMonth));
      }

      const response = await fetch(`/api/admin/monthly-closing?${params.toString()}`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setClosings(data.data.closings || []);
          setSummary(data.data.summary || {
            totalRevenue: 0,
            totalCost: 0,
            totalSalesCommission: 0,
            totalSurveyCosts: 0,
            totalInstallationCosts: 0,
            totalMiscCosts: 0,
            totalProfit: 0
          });
          setUnclassified(data.data.unclassified || {
            count: 0,
            totalRevenue: 0,
            totalCost: 0,
            salesCommissionCosts: 0,
            surveyCosts: 0,
            installationCosts: 0,
            netProfit: 0
          });
        }
      }
    } catch (error) {
      console.error('월별 마감 데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const autoCalculateCurrentMonth = async () => {
    try {
      setCalculating(true);
      await calculateMonthly(currentYear, currentMonth);
    } catch (error) {
      console.error('자동 계산 오류:', error);
    } finally {
      setCalculating(false);
    }
  };

  const calculateMonthly = async (year: number, month: number) => {
    try {
      const response = await fetch('/api/admin/monthly-closing', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ year, month })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await loadClosings();
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('월별 계산 오류:', error);
      return false;
    }
  };

  // 자동 매출 계산 + 월 마감 집계
  const handleAutoCalculate = async (year: number, month: number, force: boolean = false) => {
    try {
      setAutoCalculating(true);
      setCalculationProgress({
        current: 0,
        total: 0,
        message: '계산 준비 중...'
      });

      const response = await fetch('/api/admin/monthly-closing/auto-calculate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ year, month, force })
      });

      if (!response.ok) {
        throw new Error('자동 계산 요청 실패');
      }

      const data = await response.json();

      if (data.success) {
        const results = data.data;
        setCalculationProgress({
          current: results.calculatedBusinesses,
          total: results.totalBusinesses,
          message: `${results.calculatedBusinesses}개 사업장 계산 완료`
        });

        // 데이터 새로고침
        await loadClosings();

        let message =
          `✅ 자동 계산 완료\n\n` +
          `총 사업장: ${results.totalBusinesses}개\n` +
          `계산 완료: ${results.calculatedBusinesses}개\n` +
          `실패: ${results.failedBusinesses}개`;

        if (data.warning) {
          message += `\n\n⚠️ ${data.warning}`;
        }

        alert(message);
      } else {
        alert(`❌ 자동 계산 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('자동 계산 오류:', error);
      alert('자동 계산 중 오류가 발생했습니다.');
    } finally {
      setAutoCalculating(false);
      setCalculationProgress({ current: 0, total: 0, message: '' });
    }
  };

  const openMiscCostModal = async (closingId: string, year: number, month: number) => {
    setSelectedClosingId(closingId);
    setSelectedClosingYearMonth(`${year}년 ${month}월`);
    setShowMiscCostModal(true);
    await loadMiscCosts(closingId);
  };

  const closeMiscCostModal = () => {
    setShowMiscCostModal(false);
    setSelectedClosingId(null);
    setSelectedClosingYearMonth('');
    setMiscCosts([]);
    setNewMiscCost({ itemName: '', amount: 0, description: '' });
  };

  const loadMiscCosts = async (closingId: string) => {
    try {
      setLoadingMiscCosts(true);

      const response = await fetch(`/api/admin/monthly-closing/${closingId}/misc-costs`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMiscCosts(data.data.miscCosts || []);
        }
      }
    } catch (error) {
      console.error('기타 비용 로드 오류:', error);
    } finally {
      setLoadingMiscCosts(false);
    }
  };

  const handleAddMiscCost = async () => {
    if (!selectedClosingId || !newMiscCost.itemName || newMiscCost.amount <= 0) {
      alert('항목명과 유효한 금액을 입력해주세요.');
      return;
    }

    try {
      const response = await fetch(`/api/admin/monthly-closing/${selectedClosingId}/misc-costs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newMiscCost)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await loadMiscCosts(selectedClosingId);
          await loadClosings();
          setNewMiscCost({ itemName: '', amount: 0, description: '' });
        }
      } else {
        alert('기타 비용 추가 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('기타 비용 추가 오류:', error);
      alert('기타 비용 추가 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteMiscCost = async (miscCostId: string) => {
    if (!confirm('이 기타 비용 항목을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/monthly-closing/misc-costs/${miscCostId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && selectedClosingId) {
          await loadMiscCosts(selectedClosingId);
          await loadClosings();
        }
      } else {
        alert('기타 비용 삭제 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('기타 비용 삭제 오류:', error);
      alert('기타 비용 삭제 중 오류가 발생했습니다.');
    }
  };

  // 월별 상세 내역 모달 관련 함수
  const openDetailModal = async (closing: MonthlyClosing) => {
    setDetailClosing(closing);
    setShowDetailModal(true);
    await loadDetailData(closing.id);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setDetailClosing(null);
    setDetailBusinesses([]);
  };

  const loadDetailData = async (closingId: string) => {
    try {
      setLoadingDetails(true);

      const response = await fetch(`/api/admin/monthly-closing/${closingId}/details`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDetailBusinesses(data.data.businesses || []);
        }
      }
    } catch (error) {
      console.error('상세 데이터 로드 오류:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const openUnclassifiedModal = async () => {
    setDetailClosing(null);
    setShowDetailModal(true);
    await loadUnclassifiedData();
  };

  const loadUnclassifiedData = async () => {
    try {
      setLoadingDetails(true);

      const response = await fetch(`/api/admin/monthly-closing/unclassified`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDetailBusinesses(data.data.businesses || []);
        }
      }
    } catch (error) {
      console.error('미분류 데이터 로드 오류:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(value);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <AdminLayout
      title="월 마감"
      description="월별 재무 마감 및 수익 관리"
    >
      <div className="space-y-4 sm:space-y-5 md:space-y-6">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3 md:gap-4">
          <StatsCard
            title="총 매출"
            value={formatCurrency(summary.totalRevenue)}
            icon={DollarSign}
            color="blue"
          />
          <StatsCard
            title="매입금액"
            value={formatCurrency(summary.totalCost)}
            icon={FileText}
            color="gray"
          />
          <StatsCard
            title="영업비"
            value={formatCurrency(summary.totalSalesCommission)}
            icon={Users}
            color="purple"
          />
          <StatsCard
            title="실사비"
            value={formatCurrency(summary.totalSurveyCosts || 0)}
            icon={ClipboardCheck}
            color="cyan"
          />
          <StatsCard
            title="설치비"
            value={formatCurrency(summary.totalInstallationCosts)}
            icon={Building2}
            color="indigo"
          />
          <StatsCard
            title="기타 비용"
            value={formatCurrency(summary.totalMiscCosts)}
            icon={FileText}
            color="orange"
          />
          <StatsCard
            title="순이익"
            value={formatCurrency(summary.totalProfit)}
            icon={TrendingUp}
            color="green"
          />
        </div>

        {/* 필터 섹션 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial">
                <label className="text-[10px] sm:text-xs md:text-sm font-medium mb-1 block">연도</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded"
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}년</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 sm:flex-initial">
                <label className="text-[10px] sm:text-xs md:text-sm font-medium mb-1 block">월</label>
                <select
                  value={selectedMonth || ''}
                  onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 text-xs sm:text-sm border border-gray-300 rounded"
                >
                  <option value="">전체</option>
                  {months.map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  if (selectedMonth) {
                    handleAutoCalculate(selectedYear, selectedMonth, false);
                  } else {
                    alert('월을 선택해주세요.');
                  }
                }}
                disabled={autoCalculating || !selectedMonth}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs sm:text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {autoCalculating ? (
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                )}
                <span>자동 계산</span>
              </button>
              <button
                onClick={loadClosings}
                disabled={loading}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white text-xs sm:text-sm rounded hover:bg-gray-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">새로고침</span>
              </button>
            </div>
          </div>
        </div>

        {/* 자동 계산 진행 상황 */}
        {autoCalculating && calculationProgress.total > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-md md:rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-sm font-medium text-blue-900">
                {calculationProgress.message}
              </span>
              <span className="text-xs sm:text-sm text-blue-700">
                {calculationProgress.current} / {calculationProgress.total}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${calculationProgress.total > 0 ? (calculationProgress.current / calculationProgress.total) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* 데이터 테이블 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {calculating && (
            <div className="bg-blue-50 border-b border-blue-200 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 flex items-center gap-2 text-[10px] sm:text-xs text-blue-700">
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
              <span>현재 월 데이터 자동 계산 중...</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[10px] sm:text-xs md:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-700">월</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700">매출</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 hidden md:table-cell">매입</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 hidden sm:table-cell">영업비</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 hidden lg:table-cell">실사비</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 hidden sm:table-cell">설치비</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700">기타</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700">이익</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-700">작업</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-8 text-center text-gray-500">
                      <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mx-auto mb-2" />
                      <p className="text-xs sm:text-sm">데이터를 불러오는 중...</p>
                    </td>
                  </tr>
                ) : closings.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-8 text-center text-gray-500">
                      <FileText className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-xs sm:text-sm font-medium mb-2">마감 데이터가 없습니다</p>
                      {selectedMonth && (
                        <div className="text-[10px] sm:text-xs text-gray-600 space-y-1">
                          <p>📊 "{selectedYear}년 {selectedMonth}월" 데이터를 생성하려면:</p>
                          <p className="font-medium text-blue-600">위 "자동 계산" 버튼을 클릭하세요</p>
                          <p className="text-gray-500">해당 월의 사업장 매출이 자동으로 계산됩니다</p>
                        </div>
                      )}
                      {!selectedMonth && (
                        <p className="text-[10px] sm:text-xs text-gray-600">
                          월을 선택하고 "자동 계산"을 실행하세요
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  closings.map(closing => (
                    <tr
                      key={closing.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => openDetailModal(closing)}
                    >
                      <td className="px-2 py-2">
                        <span className="font-medium">{closing.month}월</span>
                        <span className="text-[8px] sm:text-[9px] text-gray-500 ml-1">
                          ({closing.businessCount}개)
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-blue-600">
                        {formatCurrency(closing.totalRevenue)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600 hidden md:table-cell">
                        {formatCurrency(closing.totalCost)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {formatCurrency(closing.salesCommissionCosts)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600 hidden lg:table-cell">
                        {formatCurrency(closing.surveyCosts || 0)}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600 hidden sm:table-cell">
                        {formatCurrency(closing.installationCosts)}
                      </td>
                      <td className="px-2 py-2 text-right text-orange-600">
                        {formatCurrency(closing.miscellaneousCosts)}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-green-600">
                        {formatCurrency(closing.netProfit)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openMiscCostModal(closing.id, closing.year, closing.month);
                          }}
                          className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-[9px] sm:text-[10px] whitespace-nowrap"
                        >
                          기타 비용
                        </button>
                      </td>
                    </tr>
                  ))
                )}

                {/* 미분류 섹션 */}
                {!loading && unclassified.count > 0 && (
                  <tr className="bg-yellow-50 border-t-2 border-yellow-200">
                    <td colSpan={9} className="px-0 py-0">
                      <div
                        className="cursor-pointer hover:bg-yellow-100 transition-colors"
                        onClick={openUnclassifiedModal}
                      >
                        <div className="px-2 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-yellow-600" />
                              <span className="font-medium text-yellow-800">미분류 (설치일 없음)</span>
                              <span className="text-[8px] sm:text-[9px] text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-full">
                                {unclassified.count}개
                              </span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4 text-xs">
                              <div className="text-right">
                                <div className="text-yellow-700">매출</div>
                                <div className="font-medium text-blue-600">{formatCurrency(unclassified.totalRevenue)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-yellow-700">이익</div>
                                <div className="font-semibold text-green-600">{formatCurrency(unclassified.netProfit)}</div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-yellow-700 flex items-center gap-1">
                            <span>⚠️</span>
                            <span>설치일 정보가 없는 사업장입니다. 클릭하여 상세 내역을 확인하세요.</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 기타 비용 모달 */}
      {showMiscCostModal && selectedClosingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-sm sm:text-base font-semibold">
                기타 비용 상세 - {selectedClosingYearMonth}
              </h3>
              <button onClick={closeMiscCostModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-4">
              {/* 기존 항목 리스트 */}
              <div className="space-y-2 mb-4">
                {loadingMiscCosts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : miscCosts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs sm:text-sm">등록된 기타 비용이 없습니다</p>
                  </div>
                ) : (
                  miscCosts.map(cost => (
                    <div key={cost.id} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs sm:text-sm truncate">{cost.itemName}</div>
                        {cost.description && (
                          <div className="text-[10px] sm:text-xs text-gray-600 truncate">{cost.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="font-semibold text-xs sm:text-sm whitespace-nowrap">
                          {formatCurrency(cost.amount)}
                        </span>
                        <button
                          onClick={() => handleDeleteMiscCost(cost.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 새 항목 추가 폼 */}
              <div className="border-t pt-4">
                <h4 className="text-xs sm:text-sm font-medium mb-2">새 항목 추가</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="항목명"
                    value={newMiscCost.itemName}
                    onChange={(e) => setNewMiscCost({...newMiscCost, itemName: e.target.value})}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded text-xs sm:text-sm"
                  />
                  <input
                    type="number"
                    placeholder="금액"
                    value={newMiscCost.amount || ''}
                    onChange={(e) => setNewMiscCost({...newMiscCost, amount: Number(e.target.value)})}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded text-xs sm:text-sm"
                  />
                  <textarea
                    placeholder="설명 (선택)"
                    value={newMiscCost.description}
                    onChange={(e) => setNewMiscCost({...newMiscCost, description: e.target.value})}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border rounded text-xs sm:text-sm"
                    rows={2}
                  />
                  <button
                    onClick={handleAddMiscCost}
                    className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs sm:text-sm"
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                    추가
                  </button>
                </div>
              </div>

              {/* 합계 */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center font-semibold text-sm sm:text-base">
                  <span>합계</span>
                  <span className="text-base sm:text-lg">
                    {formatCurrency(miscCosts.reduce((sum, c) => sum + c.amount, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 월별 상세 내역 모달 */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-3 sm:p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-sm sm:text-base font-semibold">
                  {detailClosing ? (
                    `${detailClosing.year}년 ${detailClosing.month}월 상세 내역`
                  ) : (
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-yellow-600" />
                      미분류 사업장 상세 내역
                    </span>
                  )}
                </h3>
                <p className="text-[10px] sm:text-xs text-gray-600 mt-1">
                  {detailClosing ? (
                    `총 ${detailClosing.businessCount}개 사업장`
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-700">
                      <span>⚠️</span>
                      <span>설치일 정보가 없는 사업장 ({detailBusinesses.length}개)</span>
                    </span>
                  )}
                </p>
              </div>
              <button onClick={closeDetailModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-4">
              {/* 요약 통계 */}
              {detailClosing && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 mb-4">
                <div className="bg-blue-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">총 매출</p>
                  <p className="text-xs sm:text-sm font-semibold text-blue-600">
                    {formatCurrency(detailClosing.totalRevenue)}
                  </p>
                </div>
                <div className="bg-gray-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">매입금액</p>
                  <p className="text-xs sm:text-sm font-semibold text-gray-600">
                    {formatCurrency(detailClosing.totalCost)}
                  </p>
                </div>
                <div className="bg-purple-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">영업비</p>
                  <p className="text-xs sm:text-sm font-semibold text-purple-600">
                    {formatCurrency(detailClosing.salesCommissionCosts)}
                  </p>
                </div>
                <div className="bg-cyan-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">실사비</p>
                  <p className="text-xs sm:text-sm font-semibold text-cyan-600">
                    {formatCurrency(detailClosing.surveyCosts || 0)}
                  </p>
                </div>
                <div className="bg-indigo-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">설치비</p>
                  <p className="text-xs sm:text-sm font-semibold text-indigo-600">
                    {formatCurrency(detailClosing.installationCosts)}
                  </p>
                </div>
                <div className="bg-orange-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">기타 비용</p>
                  <p className="text-xs sm:text-sm font-semibold text-orange-600">
                    {formatCurrency(detailClosing.miscellaneousCosts)}
                  </p>
                </div>
                <div className="bg-green-50 p-2 sm:p-3 rounded">
                  <p className="text-[10px] sm:text-xs text-gray-600">순이익</p>
                  <p className="text-xs sm:text-sm font-semibold text-green-600">
                    {formatCurrency(detailClosing.netProfit)}
                  </p>
                </div>
              </div>
              )}

              {/* 사업장별 상세 테이블 */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] sm:text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-700">사업장명</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-700 hidden sm:table-cell">계산일</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-700">매출</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-700 hidden md:table-cell">매입</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-700 hidden lg:table-cell">영업비</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-700 hidden xl:table-cell">실사비</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-700 hidden lg:table-cell">설치비</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-700">이익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingDetails ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-8 text-center text-gray-500">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                          <p className="text-xs">데이터를 불러오는 중...</p>
                        </td>
                      </tr>
                    ) : detailBusinesses.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-8 text-center text-gray-500">
                          <FileText className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                          <p className="text-xs">데이터가 없습니다</p>
                        </td>
                      </tr>
                    ) : (
                      detailBusinesses.map((business, idx) => (
                        <tr key={business.id} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <a
                                href={`/admin/business?search=${encodeURIComponent(business.businessName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              >
                                {business.businessName}
                              </a>
                              {!business.installationDate && !business.completionDate && (
                                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                  설치일 없음
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center text-gray-600 hidden sm:table-cell">
                            {new Date(business.calculationDate).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-2 py-2 text-right font-medium text-blue-600">
                            {formatCurrency(business.totalRevenue)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-600 hidden md:table-cell">
                            {formatCurrency(business.totalCost)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-600 hidden lg:table-cell">
                            {formatCurrency(business.salesCommission)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-600 hidden xl:table-cell">
                            {formatCurrency(business.surveyCosts || 0)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-600 hidden lg:table-cell">
                            {formatCurrency(business.installationCosts)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-green-600">
                            {formatCurrency(business.netProfit)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default withAuth(MonthlyClosingPage, 'canAccessAdminPages' as any);
