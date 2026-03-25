import React from 'react'
import {
  Building2,
  User,
  Phone,
  MapPin,
  Calendar,
  Trash2,
  ChevronRight
} from 'lucide-react'

interface BusinessCardProps {
  business: any
  onBusinessClick: (business: any) => void
  onBusinessDelete?: (business: any) => void
  taskStatus?: {
    statusText: string
    colorClass: string
    taskCount: number
    hasActiveTasks: boolean
    lastUpdated: string
  }
  searchQuery?: string
  highlightSearchTerm?: (text: string, query: string) => React.ReactNode
}

export default function BusinessCard({
  business,
  onBusinessClick,
  onBusinessDelete,
  taskStatus,
  searchQuery,
  highlightSearchTerm
}: BusinessCardProps) {

  // 진행구분별 색상 및 border 설정
  const getProgressStatusStyle = (status: string) => {
    switch(status) {
      case '자비':
        return {
          border: 'border-l-blue-500',
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          badgeBg: 'bg-blue-100',
          badgeText: 'text-blue-800',
          badgeBorder: 'border-blue-200'
        }
      case '보조금':
        return {
          border: 'border-l-green-500',
          bg: 'bg-green-50',
          text: 'text-green-700',
          badgeBg: 'bg-green-100',
          badgeText: 'text-green-800',
          badgeBorder: 'border-green-200'
        }
      case '보조금 동시진행':
        return {
          border: 'border-l-purple-500',
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          badgeBg: 'bg-purple-100',
          badgeText: 'text-purple-800',
          badgeBorder: 'border-purple-200'
        }
      case '대리점':
        return {
          border: 'border-l-cyan-500',
          bg: 'bg-cyan-50',
          text: 'text-cyan-700',
          badgeBg: 'bg-cyan-100',
          badgeText: 'text-cyan-800',
          badgeBorder: 'border-cyan-200'
        }
      case 'AS':
        return {
          border: 'border-l-orange-500',
          bg: 'bg-orange-50',
          text: 'text-orange-700',
          badgeBg: 'bg-orange-100',
          badgeText: 'text-orange-800',
          badgeBorder: 'border-orange-200'
        }
      default:
        return {
          border: 'border-l-gray-400',
          bg: 'bg-gray-50',
          text: 'text-gray-700',
          badgeBg: 'bg-gray-100',
          badgeText: 'text-gray-600',
          badgeBorder: 'border-gray-200'
        }
    }
  }

  // 제조사별 스타일
  const getManufacturerStyle = (name: string) => {
    switch(name) {
      case '에코센스':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case '크린어스':
        return 'bg-sky-50 text-sky-700 border-sky-200'
      case '가이아씨앤에스':
        return 'bg-violet-50 text-violet-700 border-violet-200'
      case '이브이에스':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      default:
        return 'bg-gray-50 text-gray-500 border-gray-200'
    }
  }

  const progressStatus = business.progress_status || business.진행상태 || '미지정'
  // 공백 제거 및 정규화 (띄어쓰기, 앞뒤 공백 제거)
  const normalizedProgressStatus = typeof progressStatus === 'string' ? progressStatus.trim() : progressStatus
  const statusStyle = getProgressStatusStyle(normalizedProgressStatus)
  const manufacturer = business.manufacturer || '-'
  // 공백 제거 및 정규화
  const normalizedManufacturer = typeof manufacturer === 'string' ? manufacturer.trim() : manufacturer
  const projectYear = business.project_year || business.사업진행연도
  const businessName = business.사업장명 || business.business_name || ''
  const adminManagers = business.admin_managers
  const firstAdminManager = Array.isArray(adminManagers) && adminManagers.length > 0 ? adminManagers[0] : null
  const extraAdminCount = firstAdminManager ? adminManagers.length - 1 : 0
  const managerName = business.담당자명 || '-'
  const contact = business.담당자연락처 || '-'
  const address = business.주소 || business.local_government || '-'

  const renderText = (text: string) => {
    if (searchQuery && highlightSearchTerm) {
      return highlightSearchTerm(text, searchQuery)
    }
    return text
  }

  return (
    <div
      onClick={() => onBusinessClick(business)}
      className={`
        bg-white rounded-lg border-l-4 ${statusStyle.border}
        shadow-sm hover:shadow-md transition-all duration-200
        active:scale-[0.98] cursor-pointer
        p-2 sm:p-3
      `}
    >
      {/* 헤더: 진행구분 + 제조사 */}
      <div className="flex items-center justify-between mb-2">
        <span className={`px-1.5 py-0.5 text-xs sm:text-xs font-medium border rounded ${statusStyle.badgeBg} ${statusStyle.badgeText} ${statusStyle.badgeBorder}`}>
          {normalizedProgressStatus}
        </span>
        <span className={`px-1.5 py-0.5 text-xs sm:text-xs font-medium border rounded ${getManufacturerStyle(normalizedManufacturer)}`}>
          {renderText(normalizedManufacturer)}
        </span>
      </div>

      {/* 사업장명 + 관리책임자 */}
      <div className="flex items-start gap-1.5 mb-2 min-w-0">
        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 leading-tight shrink-0">
          {renderText(businessName)}
        </h3>
        {firstAdminManager && (
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
            👤 {firstAdminManager.name}{extraAdminCount > 0 ? ` +${extraAdminCount}` : ''}
          </span>
        )}
      </div>

      {/* 정보 그리드 */}
      <div className="space-y-1.5">
        {/* 담당자 */}
        {managerName !== '-' && (
          <div className="flex items-center gap-1.5 text-xs sm:text-xs text-gray-600">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{renderText(managerName)}</span>
          </div>
        )}

        {/* 연락처 */}
        {contact !== '-' && (
          <div className="flex items-center gap-1.5 text-xs sm:text-xs text-gray-600">
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{renderText(contact)}</span>
          </div>
        )}

        {/* 주소 */}
        <div className="flex items-center gap-1.5 text-xs sm:text-xs text-gray-600">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={address}>{renderText(address)}</span>
        </div>

        {/* 사업진행연도 */}
        {projectYear && (
          <div className="flex items-center gap-1.5 text-xs sm:text-xs text-gray-600">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span className="px-1.5 py-0.5 rounded-md text-xs sm:text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
              {projectYear}년
            </span>
          </div>
        )}
      </div>

      {/* 현재단계 */}
      {taskStatus && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-xs text-gray-500">현재 단계</span>
            <span className={`px-2 py-0.5 rounded-full text-xs sm:text-xs font-medium ${taskStatus.colorClass}`}>
              {taskStatus.statusText}
            </span>
          </div>
          {taskStatus.lastUpdated && (
            <div className="text-xs sm:text-xs text-gray-400 mt-0.5">
              {taskStatus.lastUpdated}
            </div>
          )}
        </div>
      )}

      {/* 액션 버튼 영역 */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onBusinessClick(business)
          }}
          className="flex items-center gap-0.5 text-xs sm:text-xs text-blue-600 font-medium hover:text-blue-700"
        >
          상세보기
          <ChevronRight className="w-3 h-3" />
        </button>

        <div className="flex items-center gap-1.5">
          {onBusinessDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onBusinessDelete(business)
              }}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              aria-label="삭제"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
