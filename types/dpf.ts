// DPF(매연저감장치) 관련 TypeScript 타입 정의

export interface DpfVehicle {
  id: string;
  vin: string;
  plate_number: string;
  vehicle_name?: string | null;
  owner_name?: string | null;
  owner_address?: string | null;
  owner_contact?: string | null;
  local_government?: string | null;
  device_serial?: string | null;
  installation_date?: string | null;
  raw_data?: Record<string, unknown>;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface DpfDeviceInstallation {
  id: string;
  vehicle_id: string;
  serial_number?: string | null;
  installer_company?: string | null;
  installation_date?: string | null;
  management_number?: string | null;
  sales_office?: string | null;
  action_type: 'install' | 'remove' | 'replace';
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DpfPerformanceInspection {
  id: string;
  vehicle_id: string;
  installation_id?: string | null;
  inspection_date?: string | null;
  inspection_agency?: string | null;
  kd147_before?: number | null;
  kd147_after?: number | null;
  lugdown_before?: number | null;
  lugdown_after?: number | null;
  free_accel_before?: number | null;
  free_accel_after?: number | null;
  inspection_type?: 'initial' | 'confirmation' | 'periodic' | null;
  pass_yn?: boolean | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DpfSubsidyApplication {
  id: string;
  vehicle_id: string;
  local_government?: string | null;
  reception_date?: string | null;
  approval_status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
  subsidy_payment_date?: string | null;
  subsidy_claim_amount?: number | null;
  subsidy_expected_date?: string | null;
  self_payment_removal?: number | null;
  deposit_date_removal?: string | null;
  offset_date?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DpfCallMonitoring {
  id: string;
  vehicle_id: string;
  monitoring_yn?: boolean | null;
  monitoring_date?: string | null;
  satisfaction_score?: number | null;
  memo?: string | null;
  call_agent?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface DpfImportStaging {
  id: string;
  import_batch_id: string;
  row_index?: number | null;
  raw_data: Record<string, unknown>;
  vin?: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error_message?: string | null;
  created_at: string;
}

export interface DpfImportResult {
  batchId: string;
  totalRows: number;
  processedCount: number;
  errorCount: number;
  errors: Array<{ rowIndex: number; vin?: string; message: string }>;
}

export interface DpfSearchParams {
  query?: string;
  local_government?: string;
  page?: number;
  pageSize?: number;
}

export interface DpfSearchResult {
  vehicles: DpfVehicle[];
  total: number;
  page: number;
  pageSize: number;
}

// Wiki 관련
export interface WikiNode {
  id: string;
  parent_id?: string | null;
  node_type: 'root' | 'chapter' | 'section' | 'subsection' | 'form' | 'attachment';
  sort_order: number;
  title: string;
  slug?: string | null;
  content_md?: string | null;
  metadata?: Record<string, unknown>;
  tags?: string[];
  is_published: boolean;
  current_revision_id?: string | null;
  created_at: string;
  updated_at: string;
  children?: WikiNode[];
}

export interface WikiChunk {
  id: string;
  node_id: string;
  chunk_index: number;
  chunk_text: string;
  token_count?: number | null;
  created_at: string;
}

export interface FormTemplate {
  id: string;
  wiki_node_id?: string | null;
  code: string;
  name: string;
  version: string;
  schema: FormFieldDefinition[];
  layout: Record<string, unknown>;
  vehicle_field_map: Record<string, string>;
  source_file_url?: string | null;
  source_file_type?: 'pdf' | 'docx' | null;
  ai_extracted: boolean;
  upload_note?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea' | 'checkbox' | 'select';
  required?: boolean;
  options?: string[];
  vehicleField?: string;
  placeholder?: string;
}

export interface FormSubmission {
  id: string;
  template_id: string;
  vehicle_id?: string | null;
  business_id?: string | null;
  values: Record<string, unknown>;
  status: 'draft' | 'submitted' | 'printed';
  submitted_by?: string | null;
  pdf_url?: string | null;
  submitted_at?: string | null;
  created_at: string;
}

export interface GuidelineUpload {
  id: string;
  file_url: string;
  version_label: string;
  status: 'analyzing' | 'review_needed' | 'applied' | 'rejected';
  diff_summary?: string | null;
  wiki_changes?: unknown[];
  form_changes?: unknown[];
  applied_by?: string | null;
  applied_at?: string | null;
  created_by?: string | null;
  created_at: string;
}
