// utils/facility-numbering.ts - 시설 번호 자동 생성 유틸리티
// 배출구별 시설 수량을 기반으로 연속 번호 할당

import { AirPermitWithOutlets, DischargeOutlet, DischargeFacility, PreventionFacility, OutletWithFacilities } from '@/types/database'

/**
 * 시설 번호 정보
 */
export interface FacilityNumberInfo {
  facilityId: string
  facilityName: string
  capacity?: string // ✅ capacity 추가 - 같은 이름의 시설 구분용
  facilityType: 'discharge' | 'prevention'
  outletNumber: number
  facilityNumber: number
  displayNumber: string // "배1", "배2", "방1", "방2" 등
  quantity: number
}

/**
 * 배출구별 시설 번호 매핑
 */
export interface OutletFacilityNumbers {
  outletId: string
  outletNumber: number
  id?: string // ✅ UI에서 outlet.id로 접근 가능하도록 (outletId와 동일값)
  gateway_number?: string | null // ✅ 게이트웨이 번호 (gateway1-gateway50)
  vpn_type?: '유선' | '무선' | null // ✅ VPN 연결 방식
  dischargeFacilities: FacilityNumberInfo[]
  preventionFacilities: FacilityNumberInfo[]
  dischargeFacilityRange: { start: number; end: number } | null
  preventionFacilityRange: { start: number; end: number } | null
}

/**
 * 전체 시설 번호 매핑 결과
 */
export interface FacilityNumberingResult {
  outlets: OutletFacilityNumbers[]
  totalDischargeFacilities: number
  totalPreventionFacilities: number
  facilityNumberMap: Map<string, FacilityNumberInfo> // facilityId -> 번호 정보
}

/**
 * 배출시설 번호 생성
 * 배출구 순서별로 연속 번호 할당 (배1, 배2, 배3...)
 */
export function generateDischargeFacilityNumbers(
  outlets: OutletWithFacilities[]
): { facilityNumbers: Map<string, number>; totalCount: number } {
  const facilityNumbers = new Map<string, number>()
  let currentNumber = 1
  
  // 배출구를 번호순으로 정렬
  const sortedOutlets = [...outlets].sort((a, b) => a.outlet_number - b.outlet_number)
  
  for (const outlet of sortedOutlets) {
    if (outlet.discharge_facilities) {
      for (const facility of outlet.discharge_facilities) {
        // 시설의 수량만큼 번호 할당
        for (let i = 0; i < facility.quantity; i++) {
          facilityNumbers.set(`${facility.id}_${i}`, currentNumber++)
        }
      }
    }
  }
  
  return {
    facilityNumbers,
    totalCount: currentNumber - 1
  }
}

/**
 * 방지시설 번호 생성
 * 배출구 순서별로 연속 번호 할당 (방1, 방2, 방3...)
 */
export function generatePreventionFacilityNumbers(
  outlets: OutletWithFacilities[]
): { facilityNumbers: Map<string, number>; totalCount: number } {
  const facilityNumbers = new Map<string, number>()
  let currentNumber = 1
  
  // 배출구를 번호순으로 정렬
  const sortedOutlets = [...outlets].sort((a, b) => a.outlet_number - b.outlet_number)
  
  for (const outlet of sortedOutlets) {
    if (outlet.prevention_facilities) {
      for (const facility of outlet.prevention_facilities) {
        // 시설의 수량만큼 번호 할당
        for (let i = 0; i < facility.quantity; i++) {
          facilityNumbers.set(`${facility.id}_${i}`, currentNumber++)
        }
      }
    }
  }
  
  return {
    facilityNumbers,
    totalCount: currentNumber - 1
  }
}

/**
 * 전체 시설 번호 생성 및 매핑
 */
export function generateFacilityNumbering(
  airPermit: AirPermitWithOutlets
): FacilityNumberingResult {
  const outlets = airPermit.outlets || []
  const sortedOutlets = [...outlets].sort((a, b) => a.outlet_number - b.outlet_number)
  
  // 배출시설 번호 생성
  const dischargeFacilityNumbers = generateDischargeFacilityNumbers(sortedOutlets)
  
  // 방지시설 번호 생성
  const preventionFacilityNumbers = generatePreventionFacilityNumbers(sortedOutlets)
  
  const facilityNumberMap = new Map<string, FacilityNumberInfo>()
  const outletFacilityNumbers: OutletFacilityNumbers[] = []
  
  // 각 배출구별로 시설 번호 정보 생성
  for (const outlet of sortedOutlets) {
    const dischargeFacilities: FacilityNumberInfo[] = []
    const preventionFacilities: FacilityNumberInfo[] = []
    
    let dischargeStart: number | null = null
    let dischargeEnd: number | null = null
    let preventionStart: number | null = null
    let preventionEnd: number | null = null
    
    // 배출시설 처리
    if (outlet.discharge_facilities) {
      for (const facility of outlet.discharge_facilities) {
        for (let i = 0; i < facility.quantity; i++) {
          const facilityKey = `${facility.id}_${i}`
          const facilityNumber = dischargeFacilityNumbers.facilityNumbers.get(facilityKey)
          
          if (facilityNumber) {
            if (dischargeStart === null) dischargeStart = facilityNumber
            dischargeEnd = facilityNumber
            
            const numberInfo: FacilityNumberInfo = {
              facilityId: facility.id,
              facilityName: facility.facility_name,
              capacity: facility.capacity || undefined, // ✅ capacity 추가
              facilityType: 'discharge',
              outletNumber: outlet.outlet_number,
              facilityNumber,
              displayNumber: `배${facilityNumber}`,
              quantity: facility.quantity
            }
            
            dischargeFacilities.push(numberInfo)
            facilityNumberMap.set(facilityKey, numberInfo)
          }
        }
      }
    }
    
    // 방지시설 처리
    if (outlet.prevention_facilities) {
      for (const facility of outlet.prevention_facilities) {
        for (let i = 0; i < facility.quantity; i++) {
          const facilityKey = `${facility.id}_${i}`
          const facilityNumber = preventionFacilityNumbers.facilityNumbers.get(facilityKey)
          
          if (facilityNumber) {
            if (preventionStart === null) preventionStart = facilityNumber
            preventionEnd = facilityNumber
            
            const numberInfo: FacilityNumberInfo = {
              facilityId: facility.id,
              facilityName: facility.facility_name,
              capacity: facility.capacity || undefined, // ✅ capacity 추가
              facilityType: 'prevention',
              outletNumber: outlet.outlet_number,
              facilityNumber,
              displayNumber: `방${facilityNumber}`,
              quantity: facility.quantity
            }
            
            preventionFacilities.push(numberInfo)
            facilityNumberMap.set(facilityKey, numberInfo)
          }
        }
      }
    }
    
    outletFacilityNumbers.push({
      outletId: outlet.id,
      outletNumber: outlet.outlet_number,
      dischargeFacilities,
      preventionFacilities,
      dischargeFacilityRange: dischargeStart !== null && dischargeEnd !== null ? 
        { start: dischargeStart, end: dischargeEnd } : null,
      preventionFacilityRange: preventionStart !== null && preventionEnd !== null ? 
        { start: preventionStart, end: preventionEnd } : null
    })
  }
  
  return {
    outlets: outletFacilityNumbers,
    totalDischargeFacilities: dischargeFacilityNumbers.totalCount,
    totalPreventionFacilities: preventionFacilityNumbers.totalCount,
    facilityNumberMap
  }
}

/**
 * 시설 번호 표시 문자열 생성
 * 예: "배1-배3" (범위), "배5" (단일), "방1-방2" (범위)
 */
export function formatFacilityRange(
  type: 'discharge' | 'prevention',
  start: number,
  end: number
): string {
  const prefix = type === 'discharge' ? '배' : '방'
  
  if (start === end) {
    return `${prefix}${start}`
  } else {
    return `${prefix}${start}-${prefix}${end}`
  }
}

/**
 * 배출구별 시설 번호 요약 생성
 */
export function generateOutletFacilitySummary(
  outletFacilityNumbers: OutletFacilityNumbers
): string {
  const parts: string[] = []
  
  if (outletFacilityNumbers.dischargeFacilityRange) {
    const { start, end } = outletFacilityNumbers.dischargeFacilityRange
    parts.push(formatFacilityRange('discharge', start, end))
  }
  
  if (outletFacilityNumbers.preventionFacilityRange) {
    const { start, end } = outletFacilityNumbers.preventionFacilityRange
    parts.push(formatFacilityRange('prevention', start, end))
  }
  
  return parts.join(', ')
}

/**
 * 특정 시설의 번호 정보 조회
 */
export function getFacilityNumber(
  facilityNumbering: FacilityNumberingResult,
  facilityId: string,
  index: number = 0
): FacilityNumberInfo | null {
  const facilityKey = `${facilityId}_${index}`
  return facilityNumbering.facilityNumberMap.get(facilityKey) || null
}

/**
 * 배출구별 시설 번호 범위 조회
 */
export function getOutletFacilityNumbers(
  facilityNumbering: FacilityNumberingResult,
  outletId: string
): OutletFacilityNumbers | null {
  return facilityNumbering.outlets.find(outlet => outlet.outletId === outletId) || null
}

/**
 * 시설 번호 유효성 검사
 */
export function validateFacilityNumbering(
  facilityNumbering: FacilityNumberingResult
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // 배출시설 번호 연속성 확인
  const dischargeNumbers = Array.from(facilityNumbering.facilityNumberMap.values())
    .filter(info => info.facilityType === 'discharge')
    .map(info => info.facilityNumber)
    .sort((a, b) => a - b)
  
  for (let i = 1; i <= facilityNumbering.totalDischargeFacilities; i++) {
    if (!dischargeNumbers.includes(i)) {
      errors.push(`배출시설 번호 ${i}이 누락되었습니다.`)
    }
  }
  
  // 방지시설 번호 연속성 확인
  const preventionNumbers = Array.from(facilityNumbering.facilityNumberMap.values())
    .filter(info => info.facilityType === 'prevention')
    .map(info => info.facilityNumber)
    .sort((a, b) => a - b)
  
  for (let i = 1; i <= facilityNumbering.totalPreventionFacilities; i++) {
    if (!preventionNumbers.includes(i)) {
      errors.push(`방지시설 번호 ${i}이 누락되었습니다.`)
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * 시설 번호 매핑을 JSON으로 직렬화
 */
export function serializeFacilityNumbering(
  facilityNumbering: FacilityNumberingResult
): string {
  const serializable = {
    outlets: facilityNumbering.outlets,
    totalDischargeFacilities: facilityNumbering.totalDischargeFacilities,
    totalPreventionFacilities: facilityNumbering.totalPreventionFacilities,
    facilityNumberMap: Array.from(facilityNumbering.facilityNumberMap.entries())
  }
  
  return JSON.stringify(serializable, null, 2)
}

/**
 * JSON에서 시설 번호 매핑 복원
 */
export function deserializeFacilityNumbering(
  serializedData: string
): FacilityNumberingResult {
  const data = JSON.parse(serializedData)
  
  return {
    outlets: data.outlets,
    totalDischargeFacilities: data.totalDischargeFacilities,
    totalPreventionFacilities: data.totalPreventionFacilities,
    facilityNumberMap: new Map(data.facilityNumberMap)
  }
}

/**
 * 예제 사용법 및 테스트 데이터
 */
export function createExampleFacilityNumbering(): FacilityNumberingResult {
  // 예제 대기필증 데이터
  const exampleAirPermit: AirPermitWithOutlets = {
    id: 'example-permit',
    business_id: 'example-business',
    business_type: '예제 업종',
    annual_emission_amount: null,
    pollutants: [],
    emission_limits: {},
    additional_info: {},
    is_active: true,
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    outlets: [
      {
        id: 'outlet-1',
        air_permit_id: 'example-permit',
        outlet_number: 1,
        outlet_name: '배출구 1',
        stack_height: null,
        stack_diameter: null,
        flow_rate: null,
        additional_info: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        discharge_facilities: [
          {
            id: 'discharge-1-1',
            outlet_id: 'outlet-1',
            facility_name: '보일러',
            facility_code: null,
            capacity: '100kW',
            quantity: 3, // 3개 -> 배1, 배2, 배3
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        prevention_facilities: [
          {
            id: 'prevention-1-1',
            outlet_id: 'outlet-1',
            facility_name: '집진시설',
            facility_code: null,
            capacity: '500m³/h',
            quantity: 1, // 1개 -> 방1
            efficiency_rating: null,
            media_type: null,
            maintenance_interval: null,
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      },
      {
        id: 'outlet-2',
        air_permit_id: 'example-permit',
        outlet_number: 2,
        outlet_name: '배출구 2',
        stack_height: null,
        stack_diameter: null,
        flow_rate: null,
        additional_info: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        discharge_facilities: [
          {
            id: 'discharge-2-1',
            outlet_id: 'outlet-2',
            facility_name: '발전기',
            facility_code: null,
            capacity: '50kW',
            quantity: 2, // 2개 -> 배4, 배5
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        prevention_facilities: [
          {
            id: 'prevention-2-1',
            outlet_id: 'outlet-2',
            facility_name: '세정시설',
            facility_code: null,
            capacity: '300m³/h',
            quantity: 2, // 2개 -> 방2, 방3
            efficiency_rating: null,
            media_type: null,
            maintenance_interval: null,
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      },
      {
        id: 'outlet-3',
        air_permit_id: 'example-permit',
        outlet_number: 3,
        outlet_name: '배출구 3',
        stack_height: null,
        stack_diameter: null,
        flow_rate: null,
        additional_info: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        discharge_facilities: [
          {
            id: 'discharge-3-1',
            outlet_id: 'outlet-3',
            facility_name: '건조시설',
            facility_code: null,
            capacity: '200m³/h',
            quantity: 4, // 4개 -> 배6, 배7, 배8, 배9
            operating_conditions: {},
            measurement_points: [],
            device_ids: [],
            additional_info: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        prevention_facilities: []
      }
    ]
  }
  
  return generateFacilityNumbering(exampleAirPermit)
}