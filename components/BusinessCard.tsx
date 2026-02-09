'use client';

import { memo } from 'react';
import { Building2, User, Calendar, Camera } from 'lucide-react';
import ExportButtons from './facility/ExportButtons';

export interface BusinessInfo {
  id: string;
  business_name: string;
  address?: string;

  // 실사자 정보
  presurvey_inspector_name?: string;
  presurvey_inspector_contact?: string;
  presurvey_inspector_date?: string;

  postinstall_installer_name?: string;
  postinstall_installer_contact?: string;
  postinstall_installer_date?: string;

  aftersales_technician_name?: string;
  aftersales_technician_contact?: string;
  aftersales_technician_date?: string;

  // 사진 통계
  photo_count?: number;
  has_photos?: boolean;

  // Phase 진행 상태
  phases?: {
    presurvey: boolean;
    postinstall: boolean;
    aftersales: boolean;
  };
}

interface BusinessCardProps {
  business: BusinessInfo;
  onClick: (businessName: string) => void;
}

export default memo(function BusinessCard({ business, onClick }: BusinessCardProps) {
  // 실사자 정보 우선순위: 설치 전 실사자 > 설치자 > AS 담당자
  const primaryInspector = business.presurvey_inspector_name || business.postinstall_installer_name || business.aftersales_technician_name;
  const primaryDate = business.presurvey_inspector_date || business.postinstall_installer_date || business.aftersales_technician_date;

  // 날짜 포맷팅
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // ExportButtons 영역 클릭 시 이벤트 전파 방지
    if ((e.target as HTMLElement).closest('[data-export-buttons]')) {
      e.stopPropagation();
      return;
    }
    onClick(business.business_name);
  };

  return (
    <div
      onClick={handleCardClick}
      className="w-full px-3 sm:px-6 py-2.5 sm:py-3 text-left transition-all group hover:bg-blue-50 cursor-pointer hover:shadow-sm"
    >
      {/* 모바일: 세로 레이아웃, 데스크톱: 가로 그리드 레이아웃 */}
      <div className="flex flex-col sm:grid sm:grid-cols-[auto_1fr_auto] gap-2 sm:gap-4 sm:items-center">

        {/* 모바일: 아이콘 + 사업장명 행 / 데스크톱: 아이콘만 */}
        <div className="flex items-center gap-2 sm:block">
          <div className="p-2 sm:p-2.5 rounded-lg bg-gray-100 group-hover:bg-blue-100 transition-colors flex-shrink-0">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 group-hover:text-blue-600" />
          </div>

          {/* 모바일에만 표시: 사업장명 */}
          <h3 className="text-sm sm:hidden font-semibold text-gray-900 group-hover:text-blue-600 truncate flex-1">
            {business.business_name}
          </h3>

          {/* 모바일에만 표시: 화살표 */}
          <div className="text-gray-400 group-hover:text-blue-600 transition-colors sm:hidden text-lg">
            →
          </div>
        </div>

        {/* 메인 정보 영역 */}
        <div className="min-w-0 flex flex-col justify-center gap-1.5">

          {/* 데스크톱: 사업장명 + 주소 */}
          <div className="hidden sm:flex items-baseline gap-2">
            <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 truncate">
              {business.business_name}
            </h3>
            {business.address && (
              <span className="text-xs text-gray-500 truncate flex-shrink">
                {business.address}
              </span>
            )}
          </div>

          {/* 모바일: 주소만 (사업장명은 위에 표시됨) */}
          {business.address && (
            <div className="sm:hidden text-xs text-gray-500 truncate">
              {business.address}
            </div>
          )}

          {/* Phase 진행 상태 배지 */}
          {business.phases && (
            <div className="flex flex-wrap gap-1">
              {business.phases.presurvey && (
                <span className="px-1.5 sm:px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap">
                  🔍 설치 전 실사
                </span>
              )}
              {business.phases.postinstall && (
                <span className="px-1.5 sm:px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap">
                  📸 설치 후 사진
                </span>
              )}
              {business.phases.aftersales && (
                <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap">
                  🔧 AS 사진
                </span>
              )}
            </div>
          )}

          {/* 실사자 + 날짜 + 사진 (컴팩트 버전) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-xs">
            {/* 실사자 */}
            <div className="flex items-center gap-1">
              {primaryInspector ? (
                <>
                  <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{primaryInspector}</span>
                </>
              ) : (
                <span className="text-gray-400">실사자 미배정</span>
              )}
            </div>

            {/* 실사일자 */}
            <div className="flex items-center gap-1">
              {primaryDate ? (
                <>
                  <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-600">{formatDate(primaryDate)}</span>
                </>
              ) : (
                <span className="text-gray-400">날짜 미정</span>
              )}
            </div>

            {/* 사진 통계 */}
            <div className="flex items-center gap-1">
              {business.has_photos && business.photo_count ? (
                <>
                  <Camera className="w-3 h-3 text-green-600 flex-shrink-0" />
                  <span className="text-green-700 font-medium">사진 {business.photo_count}장</span>
                </>
              ) : (
                <>
                  <Camera className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">사진 없음</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 데스크톱: 다운로드 버튼 또는 화살표 */}
        <div className="hidden sm:block">
          {business.has_photos && business.photo_count ? (
            <div data-export-buttons onClick={(e) => e.stopPropagation()}>
              <ExportButtons
                businessName={business.business_name}
                businessInfo={{
                  address: business.address
                }}
                photoCount={business.photo_count}
              />
            </div>
          ) : (
            <div className="text-gray-400 group-hover:text-blue-600 transition-colors text-xl">
              →
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
