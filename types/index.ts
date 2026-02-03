// types/index.ts

// ============================================================
// Subsidy Crawler Monitoring Types
// ============================================================

export interface CrawlRun {
  id: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  trigger_type: 'scheduled' | 'manual' | 'retry';
  github_run_id: string | null;
  total_batches: number;
  completed_batches: number;
  total_urls_crawled: number;
  successful_urls: number;
  failed_urls: number;
  total_announcements: number;
  new_announcements: number;
  relevant_announcements: number;
  ai_verified_announcements: number;
  avg_response_time_ms: number | null;
  total_processing_time_seconds: number | null;
  status: 'running' | 'completed' | 'failed' | 'partial';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawlBatchResult {
  id: string;
  run_id: string;
  batch_number: number;
  url_ids: string[];
  urls_in_batch: number;
  started_at: string;
  completed_at: string | null;
  processing_time_seconds: number | null;
  successful_urls: number;
  failed_urls: number;
  total_announcements: number;
  new_announcements: number;
  relevant_announcements: number;
  ai_verified_announcements: number;
  avg_response_time_ms: number | null;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  raw_results: any | null;
  created_at: string;
  updated_at: string;
}

export interface AiVerificationLog {
  id: string;
  run_id: string;
  batch_number: number | null;
  announcement_url: string;
  announcement_title: string;
  announcement_content: string | null;
  source_url: string;
  keyword_matched: boolean;
  matched_keywords: string[] | null;
  keyword_score: number | null;
  ai_verified: boolean;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  gemini_model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  api_cost_usd: number | null;
  disagreement: boolean;
  verified_at: string;
  response_time_ms: number | null;
  created_at: string;
}

export interface UrlHealthMetric {
  id: string;
  url_id: string;
  source_url: string;
  period_start: string;
  period_end: string;
  total_attempts: number;
  successful_crawls: number;
  failed_crawls: number;
  success_rate: number;
  avg_response_time_ms: number | null;
  max_response_time_ms: number | null;
  min_response_time_ms: number | null;
  total_announcements_found: number;
  relevant_announcements_found: number;
  ai_verified_announcements_found: number;
  relevance_rate: number;
  last_error_message: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
  is_healthy: boolean;
  created_at: string;
  updated_at: string;
}

// View types
export interface RecentCrawlRunView {
  id: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  trigger_type: 'scheduled' | 'manual' | 'retry';
  status: 'running' | 'completed' | 'failed' | 'partial';
  total_urls_crawled: number;
  successful_urls: number;
  failed_urls: number;
  total_announcements: number;
  new_announcements: number;
  relevant_announcements: number;
  ai_verified_announcements: number;
  relevance_rate: number | null;
  ai_verification_rate: number | null;
  success_rate: number | null;
  total_processing_time_seconds: number | null;
  completed_batches: number;
  total_batches: number;
}

export interface UrlHealthSummaryView {
  url_id: string;
  source_url: string;
  success_rate: number;
  relevance_rate: number;
  consecutive_failures: number;
  is_healthy: boolean;
  total_attempts: number;
  successful_crawls: number;
  failed_crawls: number;
  total_announcements_found: number;
  relevant_announcements_found: number;
  ai_verified_announcements_found: number;
  avg_response_time_ms: number | null;
  last_error_message: string | null;
  last_error_at: string | null;
  period_start: string;
  period_end: string;
}

export interface AiDisagreementView {
  id: string;
  run_id: string;
  announcement_title: string;
  announcement_url: string;
  source_url: string;
  keyword_matched: boolean;
  matched_keywords: string[] | null;
  keyword_score: number | null;
  ai_verified: boolean;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  verified_at: string;
  disagreement_type: 'keyword_only' | 'ai_only' | 'agreement';
}

// ============================================================
// Existing Facility Types
// ============================================================

export interface Facility {
  outlet: number;
  number: number; // Per-outlet facility number (existing)
  sequentialNumber?: number; // NEW: Sequential across all outlets (배1,배2,배3... or 방1,방2,방3...)
  name: string;
  capacity: string;
  quantity: number;
  displayName: string;
  notes?: string;

  // 배출시설 추가 데이터
  dischargeCT?: string;
  exemptionReason?: 'none' | '무동력' | '통합전원' | '연속공정' | '연간 30일 미만 가동' | '물리적으로 부착 불가능';
  remarks?: string; // 비고

  // 측정기기 관리 정보
  measurement_device_count?: number; // 측정기기 수량
  exemption_reason?: string; // 측정기기 면제사유 (텍스트)
  last_updated_at?: string; // 최종 수정 시각
  last_updated_by?: string; // 최종 수정자

  // DB 식별자 (API 연동용)
  id?: string; // Supabase facility ID
  
  // 방지시설 추가 데이터
  ph?: string;
  pressure?: string; // 차압계
  temperature?: string; // 온도계
  pump?: string; // 펌프CT
  fan?: string; // 송풍CT
  
  // 게이트웨이 정보 (방지시설 전용)
  gatewayInfo?: {
    id?: string; // 방지시설용: gateway1, gateway2, ...
    ip?: string;
    mac?: string;
    firmware?: string;
    status?: 'connected' | 'disconnected' | 'error';
  };
}

export interface FacilitiesData {
  discharge: Facility[];
  prevention: Facility[];
  debugInfo?: any;
}

export interface BusinessInfo {
  found: boolean;
  businessName: string;
  manager?: string;
  position?: string;
  contact?: string;
  address?: string;
  rowIndex?: number;
  error?: string;
  
  // Supabase 확장 정보
  id?: string;
  사업장명?: string;
  주소?: string;
  담당자명?: string;
  담당자연락처?: string;
  담당자직급?: string;
  사업장연락처?: string;
  사업자등록번호?: string;
  대표자?: string;
  업종?: string;
  
  // 측정기기 수량 정보
  equipmentCounts?: {
    phSensor: number;
    differentialPressureMeter: number;
    temperatureMeter: number;
    dischargeCT: number;
    fanCT: number;
    pumpCT: number;
    gateway: number;
    totalDevices: number;
  };

  // 계산서 및 입금 관리 (보조금 사업장)
  invoice_1st_date?: string;
  invoice_1st_amount?: number;
  payment_1st_date?: string;
  payment_1st_amount?: number;

  invoice_2nd_date?: string;
  invoice_2nd_amount?: number;
  payment_2nd_date?: string;
  payment_2nd_amount?: number;

  invoice_additional_date?: string;
  // invoice_additional_amount는 additional_cost 사용
  payment_additional_date?: string;
  payment_additional_amount?: number;

  // 계산서 및 입금 관리 (자비 사업장)
  invoice_advance_date?: string;
  invoice_advance_amount?: number;
  payment_advance_date?: string;
  payment_advance_amount?: number;

  invoice_balance_date?: string;
  invoice_balance_amount?: number;
  payment_balance_date?: string;
  payment_balance_amount?: number;

  // 실사 관리 (견적실사, 착공전실사, 준공실사)
  estimate_survey_manager?: string;      // 견적실사 담당자
  estimate_survey_date?: string;         // 견적실사일
  pre_construction_survey_manager?: string;  // 착공전실사 담당자
  pre_construction_survey_date?: string;     // 착공전실사일
  completion_survey_manager?: string;    // 준공실사 담당자
  completion_survey_date?: string;       // 준공실사일

  // 비용 정보
  additional_cost?: number;              // 추가공사비 (계산서 발행 항목)
  installation_extra_cost?: number;      // 추가설치비 (설치팀 요청 추가 비용)
  survey_fee_adjustment?: number;        // 실사비 조정 (기본 100,000원 기준 조정금액)

  // Phase별 담당자 정보 및 특이사항 (독립 저장)
  // 설치 전 실사 (Presurvey)
  presurvey_inspector_name?: string;
  presurvey_inspector_contact?: string;
  presurvey_inspector_date?: string;
  presurvey_special_notes?: string;

  // 설치 후 (Post-Installation)
  postinstall_installer_name?: string;
  postinstall_installer_contact?: string;
  postinstall_installer_date?: string;
  postinstall_special_notes?: string;

  // AS (After Sales)
  aftersales_technician_name?: string;
  aftersales_technician_contact?: string;
  aftersales_technician_date?: string;
  aftersales_special_notes?: string;

  // 기존 필드 (하위 호환성 유지)
  inspector_name?: string;
  inspector_contact?: string;
  inspector_date?: string;
  special_notes?: string;

  // 제출일 관리 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
  construction_report_submitted_at?: string;    // 착공신고서 제출일
  greenlink_confirmation_submitted_at?: string; // 그린링크 전송확인서 제출일
  attachment_completion_submitted_at?: string;  // 부착완료통보서 제출일
}

export interface FileInfo {
  id: string;
  name: string;
  url: string;
  downloadUrl: string;
  thumbnailUrl: string;
  size: number;
  dateCreated: Date;
  mimeType: string;
}

// Supabase 기반 업로드된 파일 정보
export interface UploadedFile {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdTime: string;
  webViewLink: string;
  downloadUrl: string;
  thumbnailUrl: string;
  folderName: string;
  uploadStatus: string;
  facilityInfo?: string;
  filePath?: string; // 시설별 스토리지 경로
  justUploaded?: boolean; // 업로드 직후 마커 (깜빡임 방지)
  uploadedAt?: number; // 업로드 시점 타임스탬프
}

export interface UploadedFiles {
  basic: FileInfo[];
  discharge: FileInfo[];
  prevention: FileInfo[];
}

export type SystemType = 'completion' | 'presurvey';

// 새로운 사진 단계별 구분 타입 (3단계 확장)
export type SystemPhase = 'presurvey' | 'postinstall' | 'aftersales';

export interface SystemConfig {
  sheetName: string;
  folderId: string;
  title: string;
  urlParam: string;
}

// 월별 마감 시스템 타입 정의
export interface MonthlyClosing {
  id: string;
  year: number;
  month: number;
  totalRevenue: number;
  totalCost: number;
  salesCommissionCosts: number;
  surveyCosts: number; // 실사비용 (견적서 + 착공 전 + 준공 실사비 + 조정금액)
  installationCosts: number;
  miscellaneousCosts: number;
  netProfit: number;
  businessCount: number;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MiscellaneousCost {
  id: string;
  monthlyClosingId: string;
  itemName: string;
  amount: number;
  description?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// 프로젝트 관리 타입 정의
export interface Project {
  id: string;
  name: string;
  description?: string;
  project_type: '자체자금' | '보조금';
  business_name: string;
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  department_id: string;
  manager_id: string;
  start_date: string;
  expected_end_date?: string;
  actual_end_date?: string;
  total_budget?: number;
  subsidy_amount?: number;
  current_budget_used?: number;
  progress_percentage?: number;
  created_at: string;
  updated_at: string;

  // 조인된 정보
  department?: {
    id: string;
    name: string;
  };
  manager?: {
    id: string;
    name: string;
    email: string;
  };
  task_stats?: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
  };
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  project_id: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;

  // 조인된 정보
  project?: {
    id: string;
    name: string;
    project_type: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ProjectDashboardStats {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  overdue_projects: number;
  total_budget: number;
  used_budget: number;
  total_tasks: number;
  completed_tasks: number;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: number;  // Actual DB column: 1=regular, 2=manager, 3=admin, 4=super admin
  department_id: string;
  is_active: boolean;
}

export interface Department {
  id: string;
  name: string;
  parent_id?: string;
  description?: string;
  is_active: boolean;
}

// 매출 관리 시스템 타입 정의
export interface BusinessRevenueSummary {
  business_id: string;
  business_name: string;
  sales_office: string;
  address: string;
  manager_name: string;
  manager_contact: string;

  // 업무 카테고리별 분류
  task_categories: {
    self_tasks: number;      // 자비 업무 수
    subsidy_tasks: number;   // 보조금 업무 수
    total_tasks: number;     // 전체 업무 수
  };

  // 측정기기 정보
  equipment_summary: {
    total_equipment_count: number;
    equipment_breakdown: {
      ph_meter: number;
      differential_pressure_meter: number;
      temperature_meter: number;
      discharge_current_meter: number;
      fan_current_meter: number;
      pump_current_meter: number;
      gateway: number;
      vpn_wired: number;
      vpn_wireless: number;
      explosion_proof_differential_pressure_meter_domestic: number;
      explosion_proof_temperature_meter_domestic: number;
      expansion_device: number;
      relay_8ch: number;
      relay_16ch: number;
      main_board_replacement: number;
      multiple_stack: number;
    };
  };

  // 매출 계산 결과 (캐시됨)
  revenue_calculation?: {
    calculation_date: string;
    total_revenue: number;
    total_cost: number;
    gross_profit: number;
    sales_commission: number;
    survey_costs: number;
    installation_costs: number;
    net_profit: number;
    profit_margin_percentage: number;
    calculation_status: 'success' | 'error' | 'pending';
    last_calculated: string;
  };

  // 계산 오류 정보
  calculation_error?: string;
}

// 영업비용 조정 타입
export interface OperatingCostAdjustment {
  id: string;
  business_id: string;
  adjustment_amount: number;
  adjustment_reason?: string;
  adjustment_type: 'add' | 'subtract';
  applied_date: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

// 기기별 상세 내역
export interface EquipmentBreakdownItem {
  equipment_type: string;
  equipment_name: string;
  quantity: number;
  unit_official_price: number;
  unit_manufacturer_price: number;
  unit_installation_cost: number;
  total_revenue: number;
  total_cost: number;
  total_installation: number;
  profit: number;
}

// 매출 계산 결과 데이터
export interface CalculatedData {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  sales_commission: number;
  survey_costs: number;
  installation_costs: number;
  additional_installation_revenue: number;
  net_profit: number;
  has_calculation: boolean;
  equipment_breakdown?: EquipmentBreakdownItem[];

  // 영업비용 조정 관련 (신규)
  operating_cost_adjustment?: OperatingCostAdjustment | null;
  adjusted_sales_commission?: number;

  // 실사비 조정 관련
  survey_fee_adjustment?: number;
  adjusted_survey_costs?: number;
}

export interface BusinessSummaryResponse {
  success: boolean;
  data: {
    businesses: BusinessRevenueSummary[];
    summary_stats: {
      total_businesses: number;
      businesses_with_revenue_data: number;
      total_tasks: number;
      total_equipment: number;
      aggregate_revenue: number;
      aggregate_profit: number;
    };
    calculation_status: {
      successful_calculations: number;
      failed_calculations: number;
      pending_calculations: number;
    };
  };
  message: string;
}

// 사업장 관리 날짜 필터링 조건 타입
export interface DateFilterCondition {
  field: 'order_date' | 'survey_date' | 'installation_date' | 'completion_date' |
         'construction_report_submitted_at' | 'greenlink_confirmation_submitted_at' |
         'attachment_completion_submitted_at';
  hasValue: boolean; // true: 날짜 있음, false: 날짜 없음
}

export interface DateFilterPreset {
  id: string;
  label: string;
  conditions: DateFilterCondition[];
}

// Kakao SDK TypeScript 타입 정의
declare global {
  interface Window {
    Kakao: {
      init: (appKey: string) => void;
      isInitialized: () => boolean;
      Navi: {
        start: (options: {
          name: string;
          x: number; // 경도 (longitude)
          y: number; // 위도 (latitude)
          coordType: 'wgs84' | 'katec';
        }) => void;
      };
    };
  }
}