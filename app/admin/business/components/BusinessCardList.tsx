import React from 'react'
import BusinessCard from './BusinessCard'
import { Building2 } from 'lucide-react'

interface BusinessCardListProps {
  businesses: any[]
  onBusinessClick: (business: any) => void
  onBusinessDelete?: (business: any) => void
  taskStatuses?: Record<string, {
    statusText: string
    rawStatus?: string
    colorClass: string
    taskCount: number
    hasActiveTasks: boolean
    lastUpdated: string
  }>
  isLoading?: boolean
  searchQuery?: string
  highlightSearchTerm?: (text: string, query: string) => React.ReactNode
}

export default function BusinessCardList({
  businesses,
  onBusinessClick,
  onBusinessDelete,
  taskStatuses,
  isLoading,
  searchQuery,
  highlightSearchTerm
}: BusinessCardListProps) {

  // 로딩 스켈레톤
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border-l-4 border-gray-200 p-3 animate-pulse"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="h-5 bg-gray-200 rounded w-16"></div>
              <div className="h-5 bg-gray-200 rounded w-20"></div>
            </div>
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="space-y-1.5">
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/5"></div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 빈 상태
  if (businesses.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-gray-400 mb-3">
          <Building2 className="w-16 h-16 sm:w-20 sm:h-20 mx-auto" />
        </div>
        <p className="text-gray-600 font-medium text-sm sm:text-base">
          등록된 사업장이 없습니다
        </p>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          새로운 사업장을 등록해보세요
        </p>
      </div>
    )
  }

  // 사업장 카드 리스트
  return (
    <div className="space-y-3">
      {businesses.map((business) => {
        const businessName = business.사업장명 || business.business_name || ''
        const taskStatus = taskStatuses?.[businessName]

        return (
          <BusinessCard
            key={business.id}
            business={business}
            onBusinessClick={onBusinessClick}
            onBusinessDelete={onBusinessDelete}
            taskStatus={taskStatus}
            searchQuery={searchQuery}
            highlightSearchTerm={highlightSearchTerm}
          />
        )
      })}
    </div>
  )
}
