'use client'

import { useState, useEffect } from 'react'
import { DashboardFilters } from '@/types/dashboard'
import { Filter, X } from 'lucide-react'
import { TokenManager } from '@/lib/api-client'

interface FilterPanelProps {
  onFilterChange: (filters: DashboardFilters) => void;
}

export default function FilterPanel({ onFilterChange }: FilterPanelProps) {
  const [filters, setFilters] = useState<DashboardFilters>({ periodMode: 'recent', months: 12 });
  const [regions, setRegions] = useState<string[]>([]); // 지역 (주소에서 추출)
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [progressStatuses, setProgressStatuses] = useState<string[]>([]); // 진행구분
  const [salesOffices, setSalesOffices] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      // 사업장 목록에서 필터 옵션 추출
      const response = await fetch('/api/business-list', {
        headers: { Authorization: `Bearer ${TokenManager.getToken()}` }
      });
      const result = await response.json();

      if (result.success && result.data?.businesses) {
        const businesses = result.data.businesses;

        // 지역 추출 (주소에서 시/도/군 추출 - 사업장 관리와 동일)
        const uniqueRegions = Array.from(new Set(
          businesses.map((b: any) => {
            const address = b.address || b.주소 || '';
            if (!address) return '';

            // 주소에서 지역 추출 (예: "서울시", "경기도 수원시" -> "경기도")
            const regionMatch = address.match(/^(.*?시|.*?도|.*?군)/);
            return regionMatch ? regionMatch[1] : '';
          }).filter(Boolean)
        )).sort();

        const uniqueManufacturers = Array.from(new Set(
          businesses.map((b: any) => b.manufacturer).filter(Boolean)
        )).sort();

        // 진행구분 추출 (progress_status 사용 - 사업장 관리와 동일)
        const uniqueProgressStatuses = Array.from(new Set(
          businesses.map((b: any) => b.progress_status).filter(Boolean)
        )).sort();

        const uniqueSalesOffices = Array.from(new Set(
          businesses.map((b: any) => b.sales_office).filter(Boolean)
        )).sort();

        setRegions(uniqueRegions as string[]);
        setManufacturers(uniqueManufacturers as string[]);
        setProgressStatuses(uniqueProgressStatuses as string[]);
        setSalesOffices(uniqueSalesOffices as string[]);
      }
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  const handleFilterChange = (key: keyof DashboardFilters, value: string | number) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const resetFilters = () => {
    const resetFilters = { periodMode: 'recent' as const, months: 12 };
    setFilters(resetFilters);
    setActiveQuickFilter(null);
    onFilterChange(resetFilters);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '');

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-800">필터</h3>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
              활성
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              초기화
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            {isExpanded ? '접기' : '펼치기'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-3 border-t border-gray-200">
          {/* 기간 필터 섹션 */}
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
            <label className="block text-sm font-medium text-indigo-900 mb-3">
              📅 조회 기간 설정
            </label>

            {/* 빠른 필터 버튼 (항상 표시) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
              <button
                onClick={() => {
                  const today = new Date();
                  const todayStr = today.toISOString().split('T')[0];
                  const newFilters = { ...filters, periodMode: 'recent' as const, startDate: todayStr, endDate: todayStr };
                  setFilters(newFilters);
                  setActiveQuickFilter('today');
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 text-xs font-medium border rounded hover:bg-indigo-50 transition-colors ${
                  activeQuickFilter === 'today'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                오늘
              </button>
              <button
                onClick={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  const yesterdayStr = yesterday.toISOString().split('T')[0];
                  const newFilters = { ...filters, periodMode: 'recent' as const, startDate: yesterdayStr, endDate: yesterdayStr };
                  setFilters(newFilters);
                  setActiveQuickFilter('yesterday');
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 text-xs font-medium border rounded hover:bg-indigo-50 transition-colors ${
                  activeQuickFilter === 'yesterday'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                어제
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const startOfWeek = new Date(today);
                  startOfWeek.setDate(today.getDate() - today.getDay()); // 일요일
                  const endOfWeek = new Date(startOfWeek);
                  endOfWeek.setDate(startOfWeek.getDate() + 6); // 토요일
                  const newFilters = {
                    ...filters,
                    periodMode: 'recent' as const,
                    startDate: startOfWeek.toISOString().split('T')[0],
                    endDate: endOfWeek.toISOString().split('T')[0]
                  };
                  setFilters(newFilters);
                  setActiveQuickFilter('thisWeek');
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 text-xs font-medium border rounded hover:bg-indigo-50 transition-colors ${
                  activeQuickFilter === 'thisWeek'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                이번주
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                  const newFilters = {
                    ...filters,
                    periodMode: 'recent' as const,
                    startDate: startOfMonth.toISOString().split('T')[0],
                    endDate: endOfMonth.toISOString().split('T')[0]
                  };
                  setFilters(newFilters);
                  setActiveQuickFilter('thisMonth');
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 text-xs font-medium border rounded hover:bg-indigo-50 transition-colors ${
                  activeQuickFilter === 'thisMonth'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                이번달
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                  const newFilters = {
                    ...filters,
                    periodMode: 'recent' as const,
                    startDate: startOfLastMonth.toISOString().split('T')[0],
                    endDate: endOfLastMonth.toISOString().split('T')[0]
                  };
                  setFilters(newFilters);
                  setActiveQuickFilter('lastMonth');
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 text-xs font-medium border rounded hover:bg-indigo-50 transition-colors ${
                  activeQuickFilter === 'lastMonth'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-600 border-indigo-300'
                }`}
              >
                지난달
              </button>
            </div>

            {/* 모드 선택 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => {
                  const newFilters = { ...filters, periodMode: 'recent' as const, months: 12, startDate: undefined, endDate: undefined };
                  setFilters(newFilters);
                  setActiveQuickFilter(null);
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  filters.periodMode === 'recent' || !filters.periodMode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-indigo-600 hover:bg-indigo-100'
                }`}
              >
                최근 기간
              </button>
              <button
                onClick={() => {
                  const newFilters = { ...filters, periodMode: 'custom' as const, months: undefined };
                  setFilters(newFilters);
                  setActiveQuickFilter(null);
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  filters.periodMode === 'custom'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-indigo-600 hover:bg-indigo-100'
                }`}
              >
                기간 지정
              </button>
              <button
                onClick={() => {
                  const currentYear = new Date().getFullYear();
                  const newFilters = { ...filters, periodMode: 'yearly' as const, year: currentYear, months: undefined, startDate: undefined, endDate: undefined };
                  setFilters(newFilters);
                  setActiveQuickFilter(null);
                  onFilterChange(newFilters);
                }}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  filters.periodMode === 'yearly'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-indigo-600 hover:bg-indigo-100'
                }`}
              >
                연도별
              </button>
            </div>

            {/* 최근 기간 모드 */}
            {(!filters.periodMode || filters.periodMode === 'recent') && (
              <div>
                {/* 월단위 선택 (빠른 필터로 startDate가 설정된 경우 숨김) */}
                {!filters.startDate && (
                  <select
                    value={filters.months || 12}
                    onChange={(e) => handleFilterChange('months', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value={3}>최근 3개월</option>
                    <option value={6}>최근 6개월</option>
                    <option value={12}>최근 12개월</option>
                    <option value={24}>최근 24개월</option>
                    <option value={36}>최근 36개월</option>
                  </select>
                )}
                {/* 빠른 필터 선택된 기간 표시 */}
                {filters.startDate && filters.endDate && (
                  <div className="px-3 py-2 bg-indigo-100 border border-indigo-300 rounded text-sm text-indigo-700 text-center">
                    📅 {filters.startDate} ~ {filters.endDate}
                  </div>
                )}
              </div>
            )}

            {/* 기간 지정 모드 */}
            {filters.periodMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-indigo-700 mb-1">시작일</label>
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-indigo-700 mb-1">종료일</label>
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="w-full px-3 py-2 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* 연도별 모드 */}
            {filters.periodMode === 'yearly' && (
              <div>
                <select
                  value={filters.year || new Date().getFullYear()}
                  onChange={(e) => handleFilterChange('year', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 9 + i).map(year => (
                    <option key={year} value={year}>{year}년</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 기타 필터 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* 지사별 필터 (지역으로 필터링 - 사업장 관리와 동일) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              지사
            </label>
            <select
              value={filters.office || ''}
              onChange={(e) => handleFilterChange('office', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">전체</option>
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          {/* 제조사별 필터 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              제조사
            </label>
            <select
              value={filters.manufacturer || ''}
              onChange={(e) => handleFilterChange('manufacturer', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">전체</option>
              {manufacturers.map(manufacturer => (
                <option key={manufacturer} value={manufacturer}>{manufacturer}</option>
              ))}
            </select>
          </div>

          {/* 진행구분 필터 (progress_status 사용 - 사업장 관리와 동일) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              진행구분
            </label>
            <select
              value={filters.progressStatus || ''}
              onChange={(e) => handleFilterChange('progressStatus', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">전체</option>
              {progressStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* 영업점 필터 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              영업점
            </label>
            <select
              value={filters.salesOffice || ''}
              onChange={(e) => handleFilterChange('salesOffice', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">전체</option>
              {salesOffices.map(salesOffice => (
                <option key={salesOffice} value={salesOffice}>{salesOffice}</option>
              ))}
            </select>
          </div>
        </div>
        </div>
      )}

      {!isExpanded && hasActiveFilters && (
        <div className="pt-3 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            {/* 기간 필터 배지 */}
            {filters.periodMode === 'recent' && filters.months && filters.months !== 12 && (
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                📅 최근 {filters.months}개월
              </span>
            )}
            {filters.periodMode === 'custom' && (filters.startDate || filters.endDate) && (
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                📅 {filters.startDate || '?'} ~ {filters.endDate || '?'}
              </span>
            )}
            {filters.periodMode === 'yearly' && filters.year && (
              <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded">
                📅 {filters.year}년
              </span>
            )}

            {filters.office && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                지사: {filters.office}
              </span>
            )}
            {filters.manufacturer && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                제조사: {filters.manufacturer}
              </span>
            )}
            {filters.progressStatus && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                진행: {filters.progressStatus}
              </span>
            )}
            {filters.salesOffice && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                영업점: {filters.salesOffice}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
