// types/order-management.ts
// 발주 관리 시스템 타입 정의

/**
 * 제조사 타입
 */
export type Manufacturer = 'ecosense' | 'gaia_cns' | 'cleanearth' | 'evs' | 'ecoon'

/**
 * VPN 타입
 */
export type VpnType = 'wired' | 'wireless'

/**
 * 발주 상태
 */
export type OrderStatus = 'in_progress' | 'completed'

/**
 * 발주 진행 단계 키
 */
export type OrderStepKey =
  | 'layout'
  | 'order_form'
  | 'ip_request'
  | 'greenlink_ip_setting'
  | 'router_request'

/**
 * 발주 진행 단계 정의
 */
export interface OrderStep {
  key: OrderStepKey
  label: string
  field: keyof Pick<
    OrderManagement,
    | 'layout_date'
    | 'order_form_date'
    | 'ip_request_date'
    | 'greenlink_ip_setting_date'
    | 'router_request_date'
  >
}

/**
 * 제조사별 워크플로우
 */
export interface ManufacturerWorkflow {
  name: string
  manufacturer: Manufacturer
  steps: OrderStep[]
  total_steps: number
}

/**
 * order_management 테이블 기본 구조
 */
export interface OrderManagement {
  id: string
  business_id: string
  task_id: string | null

  // 발주 진행 단계
  layout_date: string | null // DATE
  order_form_date: string | null // DATE
  ip_request_date: string | null // DATE
  greenlink_ip_setting_date: string | null // DATE
  router_request_date: string | null // DATE

  // 상태
  status: OrderStatus
  completed_at: string | null // TIMESTAMPTZ

  // 메타데이터
  created_at: string // TIMESTAMPTZ
  updated_at: string // TIMESTAMPTZ
  created_by: string | null
  updated_by: string | null
}

/**
 * 발주 관리 상세 정보 (뷰에서 조회)
 */
export interface OrderManagementDetail extends OrderManagement {
  // 사업장 정보
  business_name: string
  address: string | null
  manager_name: string | null
  manager_position: string | null
  manager_contact: string | null
  manufacturer: Manufacturer
  vpn: VpnType
  greenlink_id: string | null
  greenlink_pw: string | null
  order_date: string | null // DATE

  // 담당자 정보
  created_by_name: string | null
  updated_by_name: string | null

  // 업무 정보
  task_title: string | null
  task_status: string | null

  // 진행률
  progress_percentage: number
  steps_completed: number
  steps_total: number
}

/**
 * 발주 목록 아이템 (간소화)
 */
export interface OrderListItem {
  id: string
  business_id: string
  business_name: string
  address: string | null
  manufacturer: Manufacturer
  status: OrderStatus
  progress_percentage: number
  last_updated: string // updated_at

  // 진행 단계 요약
  steps_completed: number
  steps_total: number

  // 최근 활동
  latest_step: string | null
  latest_step_date: string | null

  // 담당자 정보
  assignee?: string | null // 단일 담당자
  assignees?: string[] // 다중 담당자 (2단계 확장)
}

/**
 * 발주 목록 필터
 */
export interface OrderListFilter {
  search?: string // 사업장명 검색
  manufacturer?: Manufacturer | 'all' // 제조사 필터
  status?: OrderStatus | 'all' // 진행 상태 필터
  sort?: 'latest' | 'name' | 'updated' // 정렬
  page?: number // 페이지 번호
  limit?: number // 페이지 크기
  assignee?: string | 'all' // 담당자 필터
}

/**
 * 발주 목록 응답
 */
export interface OrderListResponse {
  success: boolean
  data: {
    orders: OrderListItem[]
    pagination: {
      total: number
      page: number
      limit: number
      total_pages: number
    }
    summary: {
      total_orders: number
      in_progress: number
      not_started: number
      completed: number
      by_manufacturer: {
        ecosense: number
        gaia_cns: number
        cleanearth: number
        evs: number
        ecoon: number
      }
    }
  }
  message?: string
}

/**
 * 발주 상세 정보 응답
 */
export interface OrderDetailResponse {
  success: boolean
  data: {
    // 사업장 정보
    business: {
      id: string
      business_name: string
      business_management_code: string | null
      address: string | null
      manager_name: string | null
      manager_position: string | null
      manager_contact: string | null
      manufacturer: Manufacturer
      vpn: VpnType
      greenlink_id: string | null
      greenlink_pw: string | null
      air_permit_id: string | null
    }

    // 발주 진행 정보
    order: {
      id: string
      layout_date: string | null
      order_form_date: string | null
      ip_request_date: string | null
      greenlink_ip_setting_date: string | null
      router_request_date: string | null
      status: OrderStatus
      completed_at: string | null
      created_at: string
      updated_at: string
    }

    // 워크플로우 정보
    workflow: {
      manufacturer: Manufacturer
      manufacturer_name: string
      total_steps: number
      completed_steps: number
      required_steps: OrderStepKey[]
      progress_percentage: number
    }
  }
  message?: string
}

/**
 * 발주 단계 업데이트 요청
 */
export interface OrderUpdateRequest {
  layout_date?: string | null
  order_form_date?: string | null
  ip_request_date?: string | null
  greenlink_ip_setting_date?: string | null
  router_request_date?: string | null
}

/**
 * 발주 완료 응답
 */
export interface OrderCompleteResponse {
  success: boolean
  data: {
    business_id: string
    order_date: string // 발주일
    completed_at: string // 완료 시각
    message: string
  }
  message?: string
}

/**
 * 제조사 정보
 */
export const MANUFACTURERS: Record<
  Manufacturer,
  { name: string; color: string }
> = {
  ecosense: { name: '에코센스', color: 'blue' },
  gaia_cns: { name: '가이아씨앤에스', color: 'green' },
  cleanearth: { name: '크린어스', color: 'purple' },
  evs: { name: 'EVS', color: 'orange' },
  ecoon: { name: '에코온', color: 'teal' }
}

/**
 * 제조사별 워크플로우 정의
 */
export const MANUFACTURER_WORKFLOWS: Record<Manufacturer, ManufacturerWorkflow> =
  {
    ecosense: {
      name: '에코센스',
      manufacturer: 'ecosense',
      total_steps: 2,
      steps: [
        {
          key: 'layout',
          label: '레이아웃 작성',
          field: 'layout_date'
        },
        {
          key: 'order_form',
          label: '발주서 작성',
          field: 'order_form_date'
        }
      ]
    },

    gaia_cns: {
      name: '가이아씨앤에스',
      manufacturer: 'gaia_cns',
      total_steps: 3,
      steps: [
        {
          key: 'layout',
          label: '레이아웃 작성',
          field: 'layout_date'
        },
        {
          key: 'ip_request',
          label: 'IP 요청',
          field: 'ip_request_date'
        },
        {
          key: 'router_request',
          label: '라우터 요청',
          field: 'router_request_date'
        }
      ]
    },

    cleanearth: {
      name: '크린어스',
      manufacturer: 'cleanearth',
      total_steps: 3,
      steps: [
        {
          key: 'layout',
          label: '레이아웃 작성',
          field: 'layout_date'
        },
        {
          key: 'ip_request',
          label: 'IP 요청',
          field: 'ip_request_date'
        },
        {
          key: 'router_request',
          label: '라우터 요청',
          field: 'router_request_date'
        }
      ]
    },

    evs: {
      name: 'EVS',
      manufacturer: 'evs',
      total_steps: 3,
      steps: [
        {
          key: 'layout',
          label: '레이아웃 작성',
          field: 'layout_date'
        },
        {
          key: 'ip_request',
          label: 'IP 요청',
          field: 'ip_request_date'
        },
        {
          key: 'router_request',
          label: '라우터 요청',
          field: 'router_request_date'
        }
      ]
    },

    ecoon: {
      name: '에코온',
      manufacturer: 'ecoon',
      total_steps: 3,
      steps: [
        {
          key: 'layout',
          label: '레이아웃 작성',
          field: 'layout_date'
        },
        {
          key: 'ip_request',
          label: 'IP 요청',
          field: 'ip_request_date'
        },
        {
          key: 'router_request',
          label: '라우터 요청',
          field: 'router_request_date'
        }
      ]
    }
  }

/**
 * 제조사별 필수 단계 가져오기
 */
export function getRequiredSteps(manufacturer: Manufacturer): OrderStepKey[] {
  return MANUFACTURER_WORKFLOWS[manufacturer].steps.map((step) => step.key)
}

/**
 * 진행률 계산
 */
export function calculateProgress(
  manufacturer: Manufacturer,
  order: Partial<OrderManagement>
): number {
  const workflow = MANUFACTURER_WORKFLOWS[manufacturer]
  const completedSteps = workflow.steps.filter(
    (step) => order[step.field] != null
  ).length

  return Math.round((completedSteps / workflow.total_steps) * 100)
}

/**
 * 완료 가능 여부 확인
 */
export function canComplete(
  manufacturer: Manufacturer,
  order: Partial<OrderManagement>
): { canComplete: boolean; missingSteps: string[] } {
  const workflow = MANUFACTURER_WORKFLOWS[manufacturer]
  const missingSteps: string[] = []

  for (const step of workflow.steps) {
    if (order[step.field] == null) {
      missingSteps.push(step.label)
    }
  }

  return {
    canComplete: missingSteps.length === 0,
    missingSteps
  }
}

/**
 * 발주 이력 타입
 */
export type OrderHistoryActionType = 'create' | 'update' | 'delete' | 'complete'

/**
 * 발주 이력 아이템
 */
export interface OrderHistoryItem {
  id: string
  order_id: string
  business_id: string
  business_name: string
  changed_field: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_by_name: string | null
  changed_at: string
  change_reason: string | null
  action_type: OrderHistoryActionType
  step_name: string
  change_summary: string
}

/**
 * 발주 이력 응답
 */
export interface OrderHistoryResponse {
  success: boolean
  data: {
    history: OrderHistoryItem[]
    total: number
  }
  message?: string
}

/**
 * 타임라인 이벤트 (UI용)
 */
export interface TimelineEvent {
  id: string
  date: string // 날짜
  step_name: string // 단계명
  changed_by_name: string | null // 변경자
  action_type: OrderHistoryActionType
  old_value: string | null
  new_value: string | null
  change_summary: string
}

/**
 * 단계별 필드명 매핑
 */
export const STEP_FIELD_MAP: Record<OrderStepKey, string> = {
  layout: 'layout_date',
  order_form: 'order_form_date',
  ip_request: 'ip_request_date',
  greenlink_ip_setting: 'greenlink_ip_setting_date',
  router_request: 'router_request_date'
}
