// ============================================
// 회의록 관리 시스템 TypeScript 타입 정의
// ============================================

/**
 * 회의 참석자 정보
 */
export interface MeetingParticipant {
  id: string
  name: string
  role: string
  attended: boolean
  employee_id?: string   // 내부 직원 ID (employees 테이블 참조, 선택)
  is_internal: boolean   // 내부 직원 여부 (true: 내부, false: 외부)
}

/**
 * 회의 안건 항목
 */
export interface AgendaItem {
  id: string
  title: string
  description: string
  deadline?: string      // 데드라인 (ISO 날짜, optional)
  assignee_id?: string   // @deprecated 단일 담당자 ID (하위 호환성, optional)
  assignee_name?: string // @deprecated 단일 담당자명 (하위 호환성, optional)
  assignee_ids?: string[] // 담당자 ID 배열 (다중 담당자, optional)
  assignees?: Array<{ id: string, name: string }> // 담당자 정보 배열 (표시용, optional)
}

/**
 * 회의 논의사항
 * @deprecated 더 이상 사용하지 않음 - 하위 호환성을 위해 유지
 */
export interface Discussion {
  topic: string
  notes: string
  decisions: string[]
}

/**
 * 사업장별 이슈 (구 액션 아이템)
 */
export interface BusinessIssue {
  id: string
  business_id: string         // 사업장 ID (business_info 참조)
  business_name: string        // 사업장명 (자동완성/표시용)
  issue_description: string    // 사업장 이슈 설명
  assignee_id?: string         // @deprecated 단일 담당자 ID (하위 호환성, optional)
  assignee_name?: string       // @deprecated 단일 담당자명 (하위 호환성, optional)
  assignee_ids?: string[]      // 담당자 ID 배열 (다중 담당자, optional)
  assignees?: Array<{ id: string, name: string }> // 담당자 정보 배열 (표시용, optional)
  is_completed: boolean       // 완료 여부
  completed_at?: string       // 완료 날짜 (완료시에만)
}

/**
 * 반복 이슈 (정기회의에서 미해결된 사업장별 이슈)
 */
export interface RecurringIssue extends BusinessIssue {
  original_meeting_id: string    // 원본 회의록 ID
  original_meeting_title: string // 원본 회의록 제목
  original_meeting_date: string  // 원본 회의 날짜 (YYYY-MM-DD)
  days_elapsed: number           // 경과 일수
  is_recurring: true             // 반복 이슈 식별자
}

/**
 * @deprecated ActionItem은 BusinessIssue로 대체되었습니다
 */
export type ActionItemPriority = 'low' | 'medium' | 'high'

/**
 * @deprecated ActionItemStatus는 더 이상 사용되지 않습니다 (is_completed로 대체)
 */
export type ActionItemStatus = 'pending' | 'in_progress' | 'completed'

/**
 * @deprecated ActionItem은 BusinessIssue로 대체되었습니다
 */
export interface ActionItem {
  id: string
  task: string
  assignee_id: string
  assignee_name?: string
  due_date: string
  status: ActionItemStatus
  priority?: ActionItemPriority
}

/**
 * 회의록 내용 (JSONB 구조)
 */
export interface MeetingContent {
  summary: string
  discussions?: Discussion[]         // @deprecated 하위 호환성용 - 빈 배열 유지
  business_issues: BusinessIssue[]  // 사업장별 이슈 (구 action_items)
  action_items?: ActionItem[]        // @deprecated 하위 호환성용
}

/**
 * 첨부파일 정보
 */
export interface Attachment {
  id: string
  name: string
  url: string
  type: string
  size: number
}

/**
 * 회의 유형
 */
export type MeetingType = '정기회의' | '임시회의' | '프로젝트회의' | '고객미팅'

/**
 * 회의 장소 유형
 */
export type LocationType = 'offline' | 'online' | 'hybrid'

/**
 * 회의록 상태
 */
export type MeetingStatus = 'draft' | 'completed' | 'archived'

/**
 * 회의록 공개 범위
 */
export type MeetingVisibility = 'private' | 'team' | 'public'

/**
 * 회의록 메인 인터페이스
 */
export interface MeetingMinute {
  id: string
  title: string
  meeting_date: string
  meeting_type: MeetingType

  organizer_id: string
  organizer_name?: string
  participants: MeetingParticipant[]

  location: string
  location_type: LocationType

  agenda: AgendaItem[]
  content: MeetingContent
  attachments: Attachment[]

  status: MeetingStatus
  visibility: MeetingVisibility

  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

/**
 * 회의록 생성 요청 DTO
 */
export interface CreateMeetingMinuteRequest {
  title: string
  meeting_date: string
  meeting_type: MeetingType
  organizer_id: string
  participants: MeetingParticipant[]
  location: string
  location_type: LocationType
  agenda: AgendaItem[]
  content: MeetingContent
  attachments?: Attachment[]
  status?: MeetingStatus
  visibility?: MeetingVisibility
}

/**
 * 회의록 수정 요청 DTO
 */
export interface UpdateMeetingMinuteRequest {
  title?: string
  meeting_date?: string
  meeting_type?: MeetingType
  organizer_id?: string
  participants?: MeetingParticipant[]
  location?: string
  location_type?: LocationType
  agenda?: AgendaItem[]
  content?: MeetingContent
  attachments?: Attachment[]
  status?: MeetingStatus
  visibility?: MeetingVisibility
}

/**
 * 회의록 필터 옵션
 */
export interface MeetingFilters {
  status?: MeetingStatus | 'all'
  meeting_type?: MeetingType
  date_from?: string
  date_to?: string
  organizer?: string
  search?: string
}

/**
 * 페이지네이션 정보
 */
export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * 회의록 통계 정보
 */
export interface MeetingStatistics {
  total: number
  draft: number
  completed: number
  archived: number
  thisMonth: number
}

/**
 * 회의록 목록 응답
 */
export interface MeetingMinutesListResponse {
  success: boolean
  data: {
    items: MeetingMinute[]
    pagination: Pagination
    statistics: MeetingStatistics
  }
  error?: string
}

/**
 * 회의록 단일 조회 응답
 */
export interface MeetingMinuteResponse {
  success: boolean
  data: MeetingMinute | null
  error?: string
}

/**
 * 템플릿 구조
 */
export interface TemplateStructure {
  agenda: AgendaItem[]
  default_participants: MeetingParticipant[]
  checklist: string[]
}

/**
 * 회의록 템플릿 인터페이스
 */
export interface MeetingTemplate {
  id: string
  name: string
  description: string
  meeting_type: MeetingType
  template_structure: TemplateStructure
  created_by: string
  is_public: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

/**
 * 템플릿 생성 요청 DTO
 */
export interface CreateMeetingTemplateRequest {
  name: string
  description: string
  meeting_type: MeetingType
  template_structure: TemplateStructure
  is_public?: boolean
}

/**
 * 템플릿 목록 응답
 */
export interface MeetingTemplatesResponse {
  success: boolean
  data: MeetingTemplate[]
  error?: string
}

/**
 * 템플릿 단일 조회 응답
 */
export interface MeetingTemplateResponse {
  success: boolean
  data: MeetingTemplate | null
  error?: string
}

/**
 * 파일 업로드 응답
 */
export interface FileUploadResponse {
  success: boolean
  data: {
    id: string
    name: string
    url: string
    type: string
    size: number
  } | null
  error?: string
}

/**
 * API 응답 기본 인터페이스
 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * 회의록 뷰 타입 (UI)
 */
export type MeetingViewType = 'card' | 'table'

/**
 * 회의록 정렬 옵션
 */
export type MeetingSortOption = 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc' | 'status'

/**
 * 회의록 내보내기 포맷
 */
export type ExportFormat = 'pdf' | 'docx'

/**
 * 회의 시간 정보
 */
export interface MeetingTimeInfo {
  start_time: string
  end_time: string
  duration: number // 분 단위
}

/**
 * 회의록 요약 정보 (카드용)
 */
export interface MeetingMinuteSummary {
  id: string
  title: string
  meeting_date: string
  meeting_type: MeetingType
  status: MeetingStatus
  organizer_name: string
  participants_count: number
  action_items_count: number
  location: string
}
