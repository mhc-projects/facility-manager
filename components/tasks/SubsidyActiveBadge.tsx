/**
 * 보조금 접수 중 배지 컴포넌트
 *
 * admin/tasks 페이지에서 사업장의 지자체가 현재 보조금 신청을 받고 있으면
 * "보조금 접수 중 (D-day / 예산소진시)" 배지를 표시
 */

import React from 'react'

interface ActiveSubsidy {
  region_name: string
  announcement_count: number
  has_deadline: boolean
  nearest_deadline?: string
  display_text: string
  announcements: Array<{
    id: string
    title: string
    application_period_end?: string
    budget?: string
    source_url: string
  }>
}

interface SubsidyActiveBadgeProps {
  localGovernment?: string
  activeSubsidies: Record<string, ActiveSubsidy>
  taskStatus?: string
  taskType?: string
}

export default function SubsidyActiveBadge({
  localGovernment,
  activeSubsidies,
  taskStatus,
  taskType
}: SubsidyActiveBadgeProps) {
  // 지자체 정보가 없으면 배지 표시 안 함
  if (!localGovernment) return null

  // 보조금 업무가 아니면 배지 표시 안 함
  if (taskType !== 'subsidy') {
    return null
  }

  // 신청서 제출 이후 단계에서는 배지 표시 안 함
  const POST_APPLICATION_STATUSES = [
    'document_supplement',
    'pre_construction_inspection',
    'pre_construction_supplement_1st',
    'pre_construction_supplement_2nd',
    'construction_report_submit',
    'product_order',          // 제품 발주
    'product_shipment',       // 제품 출고
    'installation_schedule',
    'installation',
    'balance_payment',
    'pre_completion_document_submit',
    'completion_inspection',
    'completion_supplement_1st',
    'completion_supplement_2nd',
    'completion_supplement_3rd',
    'final_document_submit',
    'subsidy_payment',
    'document_complete'
  ]

  if (taskStatus && POST_APPLICATION_STATUSES.includes(taskStatus)) {
    return null
  }

  // 해당 지자체의 활성 보조금 공고 확인
  const activeSubsidy = activeSubsidies[localGovernment]

  // 활성 공고가 없으면 배지 표시 안 함
  if (!activeSubsidy) return null

  // 툴팁 메시지 생성
  const tooltipLines = [
    `${activeSubsidy.announcement_count}개 공고 접수 중`,
    activeSubsidy.has_deadline
      ? `마감: ${activeSubsidy.nearest_deadline}`
      : '마감일: 예산소진시까지',
    '',
    '공고 목록:',
    ...activeSubsidy.announcements.map(a =>
      `• ${a.title}${a.application_period_end ? ` (${a.application_period_end})` : ' (예산소진시)'}`
    )
  ]

  const tooltipMessage = tooltipLines.join('\n')

  return (
    <span
      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 border border-orange-300 rounded-full whitespace-nowrap cursor-help"
      title={tooltipMessage}
    >
      {/* 깜빡이는 인디케이터 점 */}
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500"></span>
      </span>

      {/* 텍스트 (반응형) */}
      <span className="hidden sm:inline">보조금 접수 중</span>
      <span className="sm:hidden">보조금</span>

      {/* D-day 또는 예산소진시 */}
      <span>({activeSubsidy.display_text})</span>
    </span>
  )
}
