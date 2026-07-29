// types/document-automation.ts
// 문서 자동화 시스템 타입 정의

import type { Manufacturer, VpnType } from './order-management'

/**
 * 문서 타입
 */
export type DocumentType = 'purchase_order' | 'estimate' | 'contract' | 'other'

/**
 * 파일 형식
 */
export type FileFormat = 'excel' | 'pdf'

/**
 * 문서 템플릿
 */
export interface DocumentTemplate {
  id: string
  name: string
  description: string | null
  document_type: DocumentType
  manufacturer: Manufacturer | null
  file_path: string | null
  field_mapping: Record<string, any> | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

/**
 * 문서 생성 이력
 */
export interface DocumentHistory {
  id: string
  template_id: string | null
  business_id: string
  document_type: DocumentType
  document_name: string
  document_data: PurchaseOrderData | EstimateData | ContractData
  file_path: string | null
  file_format: FileFormat
  file_size: number | null
  created_at: string
  created_by: string | null
}

/**
 * 문서 이력 상세 정보 (뷰)
 */
export interface DocumentHistoryDetail extends DocumentHistory {
  template_name: string | null
  template_description: string | null
  business_name: string
  address: string | null
  manager_name: string | null
  manufacturer: Manufacturer | null
  created_by_name: string | null
  created_by_email: string | null
}

/**
 * 발주서 데이터 구조
 */
export interface PurchaseOrderData {
  // 사업장 정보
  business_name: string
  address: string
  manager_name: string
  manager_contact: string

  // 제조사 정보
  manufacturer: Manufacturer
  vpn_type: VpnType

  // 측정기기 정보
  equipment: {
    ph_sensor: number
    differential_pressure_meter: number
    temperature_meter: number
    discharge_ct: number
    discharge_ct_400a?: number // 배출전류계 중 400A 사양 수량 (나머지는 100A)
    fan_ct: number
    fan_ct_400a?: number // 송풍전류계 중 400A 사양 수량 (나머지는 100A)
    pump_ct: number
    pump_ct_400a?: number // 펌프전류계 중 400A 사양 수량 (나머지는 100A)
    gateway_1_2: number // ✅ Gateway split fields
    gateway_3_4: number // ✅ Gateway split fields
    vpn_router_wired: number
    vpn_router_wireless: number

    // 기타 장비 (확장 가능)
    explosion_proof_differential_pressure_meter_domestic?: number
    explosion_proof_temperature_meter_domestic?: number
    expansion_device?: number
    relay_8ch?: number
    relay_16ch?: number
    main_board_replacement?: number
  }

  // 발주 정보
  order_date: string
  delivery_address: string
  special_notes?: string

  // 금액 정보
  item_details: PurchaseOrderItem[]
  subtotal: number
  vat: number
  grand_total: number
}

/**
 * 에코센스 전용 발주서 데이터 구조
 */
export interface PurchaseOrderDataEcosense extends PurchaseOrderData {
  // 담당자 정보 (facility_tasks.assignee)
  manager_name: string // 담당자명
  manager_contact?: string // 담당자 연락처
  manager_email?: string // 담당자 이메일

  // 설치 희망날짜 (오늘 +7일)
  installation_desired_date: string

  // 설치 공장 정보
  factory_name: string // 공장명 (business_name)
  factory_address: string // 공장주소 (address)
  factory_manager: string // 담당자 (manager_name from business_info)
  factory_contact: string // 연락처 (manager_contact from business_info)
  factory_email?: string // 이메일 (email from business_info)
  business_management_code?: string // 사업장관리코드 (business_management_code from business_info)

  // 택배 주소 (사용자 입력 또는 저장된 주소)
  delivery_recipient?: string // 수령인
  delivery_contact?: string // 연락처
  delivery_postal_code?: string // 우편번호
  delivery_full_address?: string // 전체 주소
  delivery_address_detail?: string // 상세 주소

  // 그린링크 정보
  greenlink_id?: string
  greenlink_pw?: string

  // 전류계 타입 (16L/24L/36L 수량 분배)
  ct_16l?: number // 16L 전류계 수량
  ct_24l?: number // 24L 전류계 수량
  ct_36l?: number // 36L 전류계 수량

  // 온도센서 타입
  temperature_sensor_type?: 'flange' | 'nipple' // 프렌지타입/니플(소켓)타입

  // 온도센서 길이
  temperature_sensor_length?: '10cm' | '20cm' | '40cm' // 10CM/20CM/40CM (기본값: 10cm)

  // PH 인디게이터 부착위치
  ph_indicator_location?: 'panel' | 'independent_box' | 'none' // 방지시설판넬(타공)/독립형하이박스부착/해당없음 (기본값: independent_box)

  // 결제조건*세금계산서 발행 후 7일 이내
  payment_terms?: 'prepay_5_balance_5' | 'full_after_delivery' | 'other_prepaid' // 선금5(발주기준)|잔금5(납품완료기준) / 납품 후 완납(납품완료기준) / 기타사항(선입금) (기본값: other_prepaid)

  // 대기필증 정보 (옵션)
  air_permit?: {
    business_type?: string // 업종
    category?: string // 종별
    facility_number?: string // 시설번호
    green_link_code?: string // 그린링크코드
    first_report_date?: string // 최초신고일
    operation_start_date?: string // 가동개시일
    outlets?: Array<{
      outlet_number: number // 배출구 번호
      outlet_name: string // 배출구명
      discharge_facilities?: Array<{ // 배출시설
        name: string
        capacity: string
        quantity: number
        green_link_code?: string // 그린링크코드
      }>
      prevention_facilities?: Array<{ // 방지시설
        name: string
        capacity: string
        quantity: number
        green_link_code?: string // 그린링크코드
      }>
    }>
  }
}

/**
 * 발주서 항목
 */
export interface PurchaseOrderItem {
  item_name: string
  specification: string
  quantity: number
  unit_price: number
  total_price: number
  notes?: string
}

/**
 * 견적서 데이터 구조 (향후 확장)
 */
export interface EstimateData {
  business_name: string
  address: string
  estimate_date: string
  valid_until: string
  items: EstimateItem[]
  subtotal: number
  vat: number
  grand_total: number
  notes?: string
}

export interface EstimateItem {
  item_name: string
  specification: string
  quantity: number
  unit_price: number
  total_price: number
}

/**
 * 계약서 데이터 구조 (향후 확장)
 */
export interface ContractData {
  business_name: string
  contract_date: string
  contract_amount: number
  start_date: string
  end_date: string
  terms: string[]
  notes?: string
}

/**
 * 발주서 생성 요청
 */
export interface CreatePurchaseOrderRequest {
  business_id: string
  data: PurchaseOrderData | PurchaseOrderDataEcosense
  file_format: FileFormat
}

/**
 * 발주서 생성 응답
 */
export interface CreatePurchaseOrderResponse {
  success: boolean
  data: {
    history_id: string
    document_name: string
    file_path: string
    file_url: string
    file_format: FileFormat
    created_at: string
  }
  message?: string
}

/**
 * 문서 이력 목록 필터
 */
export interface DocumentHistoryFilter {
  business_id?: string
  document_type?: DocumentType
  file_format?: FileFormat
  start_date?: string
  end_date?: string
  search?: string
  page?: number
  limit?: number
}

/**
 * 문서 이력 목록 응답
 */
export interface DocumentHistoryListResponse {
  success: boolean
  data: {
    documents: DocumentHistoryDetail[]
    pagination: {
      total: number
      page: number
      limit: number
      total_pages: number
    }
    summary: {
      total_documents: number
      by_type: {
        purchase_order: number
        estimate: number
        contract: number
        other: number
      }
      by_format: {
        excel: number
        pdf: number
      }
    }
  }
  message?: string
}

/**
 * 문서 타입 레이블
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  purchase_order: '발주서',
  estimate: '견적서',
  contract: '계약서',
  other: '기타'
}

/**
 * 파일 형식 레이블
 */
export const FILE_FORMAT_LABELS: Record<FileFormat, string> = {
  excel: '엑셀',
  pdf: 'PDF'
}

/**
 * 문서 타입 색상 (UI용)
 */
export const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  purchase_order: 'blue',
  estimate: 'green',
  contract: 'purple',
  other: 'gray'
}
