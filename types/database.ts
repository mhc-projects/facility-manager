// types/database.ts - Extensible Database Type Definitions
// Supports both legacy flat structure and new normalized hierarchy
// Created: 2025-09-01

// =====================================================
// CORE BUSINESS ENTITIES
// =====================================================

export interface BusinessInfo {
  id: string
  created_at: string
  updated_at: string
  
  // Core Business Identity
  business_name: string
  business_registration_number?: string | null
  local_government?: string | null
  address?: string | null
  
  // Contact Information
  manager_name?: string | null
  manager_position?: string | null
  manager_contact?: string | null
  business_contact?: string | null
  fax_number?: string | null
  email?: string | null
  representative_name?: string | null
  
  // Equipment & Infrastructure (Quantities for scalability)
  manufacturer: 'ecosense' | 'cleanearth' | 'gaia_cns' | 'evs'
  vpn: 'wired' | 'wireless'
  greenlink_id?: string | null
  greenlink_pw?: string | null
  business_management_code?: number | null
  
  // Measurement Device Quantities
  ph_meter: number
  differential_pressure_meter: number
  temperature_meter: number
  discharge_current_meter: number
  fan_current_meter: number
  pump_current_meter: number
  gateway: number
  vpn_wired: number
  vpn_wireless: number
  explosion_proof_differential_pressure_meter_domestic: number
  explosion_proof_temperature_meter_domestic: number
  expansion_device: number
  relay_8ch: number
  relay_16ch: number
  main_board_replacement: number
  multiple_stack: number
  
  // Project Management
  installation_phase: 'presurvey' | 'installation' | 'completed'
  surveyor_name?: string | null
  surveyor_contact?: string | null
  surveyor_company?: string | null
  survey_date?: string | null
  installation_date?: string | null
  completion_date?: string | null
  special_notes?: string | null
  sales_office?: string | null
  
  // Extensible Data
  additional_info: Record<string, any>
  
  // Status Management
  is_active: boolean
  is_deleted: boolean
}

export interface AirPermitInfo {
  id: string
  business_id: string
  created_at: string
  updated_at: string
  
  // Permit Details
  permit_number?: string | null
  business_type?: string | null
  annual_emission_amount?: number | null
  first_report_date?: string | null
  operation_start_date?: string | null
  permit_expiry_date?: string | null
  
  // Pollutant Information (Extensible)
  pollutants: Array<{
    type: string
    amount?: number | null
    unit?: string
    limit?: number | null
  }>
  emission_limits: Record<string, {
    limit: number
    unit: string
    monitoring_frequency?: string
  }>
  
  // Extensible Data
  additional_info: Record<string, any>
  
  // Status
  is_active: boolean
  is_deleted: boolean
  
  // Relationships (populated by joins)
  business?: {
    business_name: string
    local_government?: string | null
  }
}

export interface DischargeOutlet {
  id: string
  air_permit_id: string
  created_at: string
  updated_at: string
  
  // Outlet Information
  outlet_number: number
  outlet_name?: string | null

  // Gateway Information (배출구별 게이트웨이 설정)
  gateway_number?: string | null  // 'gateway1' ~ 'gateway50'
  vpn_type?: '유선' | '무선' | null  // VPN 연결 방식

  // Physical Properties
  stack_height?: number | null
  stack_diameter?: number | null
  flow_rate?: number | null

  // Extensible Data
  additional_info: Record<string, any>
}

// =====================================================
// FACILITY ENTITIES (Dual Structure Support)
// =====================================================

export interface DischargeFacility {
  id: string
  outlet_id?: string | null // Optional for backward compatibility
  created_at: string
  updated_at: string
  
  // Core Facility Data
  facility_name: string
  facility_code?: string | null
  capacity?: string | null
  quantity: number
  
  // Operating Conditions (Extensible)
  operating_conditions: Record<string, any>
  measurement_points: Array<{
    point: string
    parameters: string[]
    location?: string
  }>
  
  // Associated Devices
  device_ids: string[]
  
  // Legacy Compatibility Fields (Always populated)
  business_name?: string | null
  outlet_number?: number | null
  facility_number?: number | null
  
  // Extensible Data
  additional_info: Record<string, any>
}

export interface PreventionFacility {
  id: string
  outlet_id?: string | null
  created_at: string
  updated_at: string
  
  // Core Facility Data
  facility_name: string
  facility_code?: string | null
  capacity?: string | null
  quantity: number
  
  // Prevention-specific Attributes
  efficiency_rating?: number | null
  media_type?: string | null
  maintenance_interval?: number | null
  
  // Operating Conditions
  operating_conditions: Record<string, any>
  measurement_points: Array<{
    point: string
    parameters: string[]
    location?: string
  }>
  
  // Associated Devices
  device_ids: string[]
  
  // Legacy Compatibility Fields
  business_name?: string | null
  outlet_number?: number | null
  facility_number?: number | null
  
  // Extensible Data
  additional_info: Record<string, any>
}

// =====================================================
// MEASUREMENT & DEVICE MANAGEMENT
// =====================================================

export interface MeasurementDevice {
  id: string
  business_id: string
  created_at: string
  updated_at: string
  
  // Device Identity
  device_type: 'ph_meter' | 'differential_pressure_meter' | 'temperature_meter' | 'ct_meter' | 'gateway' | 'flow_meter' | 'gas_analyzer'
  device_name: string
  model_number?: string | null
  serial_number?: string | null
  manufacturer?: string | null
  
  // Installation & Location
  installation_location?: string | null
  facility_association: {
    discharge_facility_ids?: string[]
    prevention_facility_ids?: string[]
    outlet_ids?: string[]
  }
  
  // Technical Specifications
  measurement_range?: string | null
  accuracy?: string | null
  resolution?: string | null
  
  // Calibration Management
  calibration_date?: string | null
  next_calibration_date?: string | null
  calibration_certificate?: string | null
  
  // CT-specific Information
  ct_ratio?: string | null
  primary_current?: string | null
  secondary_current?: string | null
  
  // Network Information
  ip_address?: string | null
  mac_address?: string | null
  firmware_version?: string | null
  communication_protocol?: string | null
  network_config: Record<string, any>
  
  // Status & Maintenance
  device_status: 'normal' | 'maintenance' | 'error' | 'inactive'
  is_active: boolean
  last_maintenance_date?: string | null
  next_maintenance_date?: string | null
  maintenance_history: Array<{
    date: string
    type: string
    notes?: string
    performed_by?: string
  }>
  
  // Current Measurement
  current_value?: number | null
  unit?: string | null
  measurement_timestamp?: string | null
  data_quality: 'normal' | 'warning' | 'error' | 'calibration'
  
  // Extensible Settings
  additional_settings: Record<string, any>
}

export interface MeasurementReading {
  id: string
  device_id: string
  business_id: string
  measured_at: string
  
  // Measurement Data
  measured_value: number
  unit: string
  measurement_type?: string | null
  
  // Quality Information
  data_quality: 'normal' | 'warning' | 'error' | 'calibration' | 'maintenance'
  confidence_level: number // 0.00-1.00
  quality_flags: string[] // ['outlier', 'drift', 'noise']
  
  // Context
  measurement_method?: string | null
  environmental_conditions: Record<string, any>
  calibration_status: boolean
  operator_notes?: string | null
  
  // Analytics (computed fields)
  normalized_value?: number | null
  trend_direction?: 'increasing' | 'decreasing' | 'stable' | null
  alarm_status?: 'normal' | 'warning' | 'alarm' | 'critical' | null
  
  // Partitioning helpers
  date_bucket: string // DATE
  hour_bucket: number // 0-23
}

// =====================================================
// PROJECT & WORKFLOW MANAGEMENT
// =====================================================

export interface ProjectPhase {
  id: string
  business_id: string
  created_at: string
  updated_at: string
  
  // Phase Information
  phase_type: 'presurvey' | 'installation' | 'completion' | 'maintenance'
  phase_name: string
  phase_order: number
  
  // Scheduling
  start_date?: string | null
  end_date?: string | null
  expected_completion_date?: string | null
  actual_completion_date?: string | null
  
  // Progress Tracking
  status: 'pending' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
  progress_percentage: number // 0-100
  
  // Team Management
  assigned_to?: string | null
  supervisor?: string | null
  team_members: Array<{
    name: string
    role: string
    contact?: string
  }>
  
  // Quality Control
  checklist_items: Array<{
    item: string
    completed: boolean
    completed_at?: string
    completed_by?: string
    notes?: string
  }>
  completion_criteria: Record<string, any>
  quality_checkpoints: Array<{
    checkpoint: string
    status: 'pending' | 'passed' | 'failed'
    notes?: string
  }>
  
  // Approval Workflow
  approval_status: 'pending' | 'approved' | 'rejected' | 'revision_required'
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  
  // Documentation
  required_documents: string[]
  submitted_documents: Array<{
    document_type: string
    file_id: string
    submitted_at: string
    submitted_by: string
  }>
  completion_notes?: string | null
  
  // Extensible Metadata
  phase_metadata: Record<string, any>
}

// =====================================================
// FILE & DOCUMENT MANAGEMENT
// =====================================================

export interface EnhancedUploadedFile {
  id: string
  business_id?: string | null
  facility_id?: string | null // Legacy field
  created_at: string
  synced_at?: string | null
  
  // File Properties
  filename: string
  original_filename: string
  file_hash?: string | null
  file_path: string
  google_file_id?: string | null
  file_size: number
  mime_type: string
  
  // Upload Status
  upload_status: 'uploaded' | 'syncing' | 'synced' | 'failed'
  thumbnail_path?: string | null
  
  // Enhanced Classification
  project_phase: 'presurvey' | 'installation' | 'completion' | 'maintenance'
  document_category?: string | null // 'survey_photo', 'installation_photo', 'completion_photo', 'certificate', 'report'
  
  // Flexible Relationships
  device_id?: string | null
  outlet_id?: string | null
  discharge_facility_id?: string | null
  prevention_facility_id?: string | null
  
  // Quality & Processing
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  quality_score?: number | null // 0.00-1.00
  tags: string[]
  
  // Spatial & Temporal Data
  geolocation?: { lat: number; lng: number } | null
  capture_timestamp?: string | null
  
  // Legacy Support
  facility_info?: string | null
  
  // Extensible Metadata
  file_metadata: Record<string, any>
}

// =====================================================
// SYSTEM MANAGEMENT
// =====================================================

export interface SystemConfig {
  id: string
  created_at: string
  updated_at: string
  
  config_key: string
  config_value: Record<string, any>
  config_type: 'setting' | 'feature_flag' | 'integration'
  description?: string | null
  
  // Validation
  validation_schema?: Record<string, any> | null
  is_sensitive: boolean
  
  // Environment
  environment: 'development' | 'staging' | 'production'
  version?: string | null
  
  is_active: boolean
}

export interface IntegrationStatus {
  id: string
  business_id?: string | null
  created_at: string
  updated_at: string
  
  // Integration Type
  integration_type: 'google_drive' | 'google_sheets' | 'email' | 'sms' | 'api'
  integration_name?: string | null
  
  // Connection Status
  status: 'active' | 'inactive' | 'error' | 'pending'
  last_sync_at?: string | null
  next_sync_at?: string | null
  sync_frequency_minutes: number
  
  // Configuration (sensitive data hashed)
  config: Record<string, any>
  credentials_hash?: string | null
  
  // Performance Metrics
  success_count: number
  error_count: number
  last_error_message?: string | null
  avg_response_time_ms?: number | null
  
  // Quota Management
  daily_quota?: number | null
  daily_usage: number
  monthly_quota?: number | null
  monthly_usage: number
}

// =====================================================
// BUSINESS MEMOS
// =====================================================

export interface BusinessMemo {
  id: string
  business_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  is_active: boolean
  is_deleted: boolean
}

export interface CreateBusinessMemoInput {
  business_id: string
  title: string
  content: string
  created_by?: string
}

export interface UpdateBusinessMemoInput {
  title?: string
  content?: string
  updated_by?: string
}

// =====================================================
// AUDIT & HISTORY
// =====================================================

export interface DataHistory {
  id: string
  created_at: string
  
  // Change Tracking
  table_name: string
  record_id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  
  // Data Snapshots
  old_data?: Record<string, any> | null
  new_data?: Record<string, any> | null
  changed_fields: string[]
  
  // User & Session Tracking
  user_id?: string | null
  session_id?: string | null
  user_agent?: string | null
  ip_address?: string | null
  
  // Change Metadata
  change_reason?: string | null
  change_type?: 'manual' | 'bulk_import' | 'api' | 'migration' | null
  source_system?: 'web_app' | 'mobile_app' | 'api' | 'migration' | null
  
  // Validation
  validation_status: 'pending' | 'validated' | 'failed'
  validation_errors: Array<{
    field: string
    error: string
    severity: 'warning' | 'error'
  }>
  
  // Performance
  processing_time_ms?: number | null
}

// =====================================================
// COMPOSITE & RELATIONSHIP TYPES
// =====================================================

export interface OutletWithFacilities extends DischargeOutlet {
  discharge_facilities: DischargeFacility[]
  prevention_facilities: PreventionFacility[]
  
  // Computed properties
  total_discharge_facilities?: number
  total_prevention_facilities?: number
  facility_summary?: {
    discharge_capacity_total?: string
    prevention_capacity_total?: string
    device_count?: number
  }
}

export interface AirPermitWithOutlets extends AirPermitInfo {
  outlets: OutletWithFacilities[]
  
  // Computed properties
  total_outlets?: number
  total_facilities?: number
  permit_summary?: {
    outlet_count: number
    facility_count: number
    device_count: number
    last_updated: string
  }
}

export interface BusinessWithPermits extends BusinessInfo {
  air_permits: AirPermitWithOutlets[]
  project_phases?: ProjectPhase[]
  measurement_devices?: MeasurementDevice[]
  
  // Computed Analytics
  business_summary?: {
    total_permits: number
    total_outlets: number
    total_facilities: number
    total_devices: number
    current_phase: string
    completion_percentage: number
    last_activity: string
  }
}

// =====================================================
// LEGACY COMPATIBILITY TYPES
// =====================================================

// Legacy types for backward compatibility with existing APIs
export interface LegacyFacility {
  outlet: number
  number: number
  name: string
  capacity?: string
  quantity: number
  displayName: string
  notes?: string
  
  // Extended legacy fields
  dischargeCT?: string
  ph?: string
  pressure?: string
  temperature?: string
  pump?: string
  fan?: string
}

export interface LegacyFacilitiesData {
  discharge: LegacyFacility[]
  prevention: LegacyFacility[]
  debugInfo?: any
  
  // Enhanced metadata
  outlets?: {
    outlets: number[]
    count: number
    maxOutlet: number
    minOutlet: number
  }
  source?: 'supabase' | 'google_sheets'
  lastUpdated?: string
  processingTime?: number
}

// =====================================================
// REPORTING & ANALYTICS TYPES
// =====================================================

export interface ReportGenerationHistory {
  id: string
  business_id: string
  created_at: string
  
  // Report Metadata
  report_type: string
  report_format: 'pdf' | 'excel' | 'word' | 'json'
  report_title?: string | null
  template_version?: string | null
  
  // Generation Context
  generated_by?: string | null
  generation_trigger: 'manual' | 'scheduled' | 'event_driven'
  report_period_start?: string | null
  report_period_end?: string | null
  
  // File Information
  file_path?: string | null
  file_size?: number | null
  file_hash?: string | null
  download_count: number
  
  // Status
  generation_status: 'pending' | 'generating' | 'completed' | 'failed'
  error_message?: string | null
  generation_time_ms?: number | null
  
  // Content Summary
  summary: Record<string, any>
  included_data: Record<string, any>
  metrics: Record<string, any>
}

// =====================================================
// SEARCH & QUERY TYPES
// =====================================================

export interface BusinessSearchResult {
  businesses: BusinessInfo[]
  total_count: number
  search_term?: string
  filters_applied?: Record<string, any>
  search_time_ms?: number
}

export interface FacilitySearchResult {
  facilities: Array<DischargeFacility | PreventionFacility>
  total_count: number
  facility_type?: 'discharge' | 'prevention' | 'all'
  search_criteria?: Record<string, any>
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  metadata?: {
    processing_time_ms?: number
    cache_hit?: boolean
    source?: string
    version?: string
  }
}

export interface PaginatedResponse<T = any> extends ApiResponse<T> {
  pagination?: {
    page: number
    limit: number
    total_count: number
    total_pages: number
    has_next: boolean
    has_previous: boolean
  }
}

// =====================================================
// UTILITY TYPES
// =====================================================

export type CreateBusinessInput = Omit<BusinessInfo, 'id' | 'created_at' | 'updated_at'>
export type UpdateBusinessInput = Partial<CreateBusinessInput>

export type CreateAirPermitInput = Omit<AirPermitInfo, 'id' | 'created_at' | 'updated_at'>
export type UpdateAirPermitInput = Partial<CreateAirPermitInput>

export type CreateDischargeFacilityInput = Omit<DischargeFacility, 'id' | 'created_at' | 'updated_at'>
export type UpdateDischargeFacilityInput = Partial<CreateDischargeFacilityInput>

export type CreatePreventionFacilityInput = Omit<PreventionFacility, 'id' | 'created_at' | 'updated_at'>
export type UpdatePreventionFacilityInput = Partial<CreatePreventionFacilityInput>

// Database operation results
export interface DatabaseOperationResult {
  success: boolean
  affected_rows?: number
  inserted_id?: string
  error_details?: {
    code: string
    message: string
    hint?: string
  }
  execution_time_ms?: number
}

// Migration helpers
export interface MigrationValidationResult {
  check_name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  details: string
}

export interface MigrationSummary {
  total_businesses: number
  total_permits: number
  total_outlets: number
  total_discharge_facilities: number
  total_prevention_facilities: number
  migration_time_ms: number
  validation_results: MigrationValidationResult[]
}