// app/admin/air-permit/page.tsx - 대기필증 관리 페이지
'use client'

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FixedSizeList } from 'react-window'
import { BusinessInfo, AirPermitInfo } from '@/lib/database-service'
import { AirPermitWithOutlets } from '@/types/database'
import AdminLayout from '@/components/ui/AdminLayout'
import { withAuth } from '@/contexts/AuthContext'
import { ConfirmModal } from '@/components/ui/Modal'
import { generateFacilityNumbering, generateOutletFacilitySummary, type FacilityNumberingResult } from '@/utils/facility-numbering'
import {
  FileText,
  Plus,
  Building2,
  Trash2,
  Edit,
  Eye,
  Factory,
  Search,
  X
} from 'lucide-react'
import { UnitInput } from '@/components/ui/UnitInput'

// ✅ 게이트웨이 색상 팔레트 - air-permit 페이지용 (연한 톤)
const baseGatewayColors = [
  'bg-blue-100 text-blue-700 border-blue-300',
  'bg-green-100 text-green-700 border-green-300',
  'bg-yellow-100 text-yellow-700 border-yellow-300',
  'bg-red-100 text-red-700 border-red-300',
  'bg-purple-100 text-purple-700 border-purple-300',
  'bg-pink-100 text-pink-700 border-pink-300',
  'bg-indigo-100 text-indigo-700 border-indigo-300',
  'bg-cyan-100 text-cyan-700 border-cyan-300',
  'bg-orange-100 text-orange-700 border-orange-300',
  'bg-teal-100 text-teal-700 border-teal-300',
  'bg-lime-100 text-lime-700 border-lime-300',
  'bg-rose-100 text-rose-700 border-rose-300',
]

// ✅ 동적 게이트웨이 색상 생성 함수 (Gateway 1~50 지원)
const getGatewayColorClass = (gatewayValue: string): string => {
  if (!gatewayValue) {
    return 'bg-gray-100 text-gray-700 border-gray-300'
  }

  // gateway1, gateway2 등에서 숫자 추출
  const match = gatewayValue.match(/gateway(\d+)/)
  if (match) {
    const num = parseInt(match[1])
    const colorIndex = (num - 1) % baseGatewayColors.length
    return baseGatewayColors[colorIndex]
  }

  // 숫자 추출 실패 시 회색 반환
  return 'bg-gray-100 text-gray-700 border-gray-300'
}

// 커스텀 날짜 입력 컴포넌트 (yyyy-mm-dd 형태, 백스페이스 네비게이션)
const DateInput = ({ value, onChange, placeholder = "YYYY-MM-DD" }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) => {
  const yearRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  
  const parts = value ? value.split('-') : ['', '', '']
  const [year, month, day] = parts

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length <= 4 && /^\d*$/.test(val)) {
      const newValue = `${val}-${month}-${day}`
      onChange(newValue)
      if (val.length === 4) {
        monthRef.current?.focus()
      }
    }
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length <= 2 && /^\d*$/.test(val)) {
      let monthVal = val
      if (val !== '' && val !== '0') {
        const numVal = parseInt(val)
        if (numVal > 12) {
          monthVal = '12'
        } else if (val.length === 2) {
          monthVal = numVal.toString().padStart(2, '0')
        }
      }
      const newValue = `${year}-${monthVal}-${day}`
      onChange(newValue)
      if (monthVal.length === 2) {
        dayRef.current?.focus()
      }
    }
  }

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length <= 2 && /^\d*$/.test(val)) {
      let dayVal = val
      // 빈 값이 아닐 때만 처리
      if (val !== '') {
        const numVal = parseInt(val)
        // 유효한 날짜 범위 제한 (1-31)
        if (numVal > 31) {
          dayVal = '31'
        } else if (val.length === 2) {
          // 두 자리 입력 완료 시 0 패딩 (예: 06, 09)
          dayVal = numVal.toString().padStart(2, '0')
        } else {
          // 한 자리 입력 중에는 그대로 유지 (선행 0 포함)
          dayVal = val
        }
      }
      const newValue = `${year}-${month}-${dayVal}`
      onChange(newValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, type: 'year' | 'month' | 'day') => {
    if (e.key === 'Backspace') {
      const target = e.target as HTMLInputElement
      if (target.selectionStart === 0 && target.selectionEnd === 0) {
        e.preventDefault()
        if (type === 'month') {
          yearRef.current?.focus()
          yearRef.current?.setSelectionRange(yearRef.current.value.length, yearRef.current.value.length)
        } else if (type === 'day') {
          monthRef.current?.focus()
          monthRef.current?.setSelectionRange(monthRef.current.value.length, monthRef.current.value.length)
        }
      }
    }
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <input
        ref={yearRef}
        type="text"
        value={year}
        onChange={handleYearChange}
        onKeyDown={(e) => handleKeyDown(e, 'year')}
        placeholder="YYYY"
        className="w-12 sm:w-14 md:w-16 px-1 sm:px-2 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-center text-base"
      />
      <span className="text-base text-gray-400">-</span>
      <input
        ref={monthRef}
        type="text"
        value={month}
        onChange={handleMonthChange}
        onKeyDown={(e) => handleKeyDown(e, 'month')}
        placeholder="MM"
        className="w-8 sm:w-10 md:w-12 px-1 sm:px-2 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-center text-base"
      />
      <span className="text-base text-gray-400">-</span>
      <input
        ref={dayRef}
        type="text"
        value={day}
        onChange={handleDayChange}
        onKeyDown={(e) => handleKeyDown(e, 'day')}
        placeholder="DD"
        className="w-8 sm:w-10 md:w-12 px-1 sm:px-2 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-center text-base"
      />
    </div>
  )
}

function AirPermitManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [businessesWithPermits, setBusinessesWithPermits] = useState<BusinessInfo[]>([])
  const [businessListSearchTerm, setBusinessListSearchTerm] = useState('')
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessInfo | null>(null)
  const [airPermits, setAirPermits] = useState<AirPermitInfo[]>([])
  const [selectedPermit, setSelectedPermit] = useState<AirPermitInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [permitToDelete, setPermitToDelete] = useState<AirPermitInfo | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [allBusinesses, setAllBusinesses] = useState<BusinessInfo[]>([])
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showBusinessDropdown, setShowBusinessDropdown] = useState(false)
  const [selectedBusinessName, setSelectedBusinessName] = useState('')
  const [newPermitData, setNewPermitData] = useState({
    business_id: '',
    business_type: '',
    category: '',
    first_report_date: '',
    operation_start_date: '',
    facility_number: '',
    green_link_code: '',
    memo: '',
    outlets: [
      {
        outlet_number: 1,
        outlet_name: '배출구 1',
        discharge_facilities: [{ name: '', capacity: '', quantity: 1 }],
        prevention_facilities: [{ name: '', capacity: '', quantity: 1 }]
      }
    ]
  })
  
  // 대기필증 검색 상태
  const [filteredAirPermits, setFilteredAirPermits] = useState<AirPermitInfo[]>([])
  const [permitSearchQuery, setPermitSearchQuery] = useState('')
  const [facilityNumberingMap, setFacilityNumberingMap] = useState<Map<string, FacilityNumberingResult>>(new Map())

  // 가상 스크롤 컨테이너 높이 상태
  const [containerHeight, setContainerHeight] = useState(600)

  // 대기필증이 등록된 사업장만 필터링 (선택 리스트용)
  const filteredBusinessesWithPermits = useMemo(() => {
    if (!businessListSearchTerm.trim()) return businessesWithPermits
    const searchLower = businessListSearchTerm.toLowerCase()
    return businessesWithPermits.filter(business =>
      business.business_name.toLowerCase().includes(searchLower) ||
      business.local_government?.toLowerCase().includes(searchLower) ||
      business.manager_name?.toLowerCase().includes(searchLower) ||
      business.manager_contact?.toLowerCase().includes(searchLower) ||
      business.address?.toLowerCase().includes(searchLower)
    )
  }, [businessListSearchTerm, businessesWithPermits])
  

  // 대기필증 필터링 함수
  const filterAirPermits = useCallback((query: string) => {
    if (!query.trim()) {
      setFilteredAirPermits(airPermits)
      return
    }
    
    const searchLower = query.toLowerCase()
    const filtered = airPermits.filter(permit => {
      return (
        permit.id?.toLowerCase().includes(searchLower) ||
        permit.business_type?.toLowerCase().includes(searchLower) ||
        permit.business_name?.toLowerCase().includes(searchLower)
      )
    })
    
    setFilteredAirPermits(filtered)
  }, [airPermits])

  // 대기필증 검색어 하이라이팅 함수
  const highlightPermitSearchTerm = useCallback((text: string, searchTerm: string) => {
    if (!searchTerm || !text) return text
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return (
      <>
        {parts.map((part, index) => 
          regex.test(part) ? (
            <mark key={index} className="bg-yellow-200 px-1 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    )
  }, [])

  // 사업장 검색어 하이라이팅 함수
  const highlightBusinessSearchTerm = useCallback((text: string, searchTerm: string) => {
    if (!searchTerm || !text) return text
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return (
      <>
        {parts.map((part, index) => 
          regex.test(part) ? (
            <mark key={index} className="bg-yellow-200 px-1 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    )
  }, [])


  // 대기필증이 등록된 사업장만 로드하는 함수 (필터링 적용)
  const loadBusinessesWithPermits = useCallback(async () => {
    let timeoutId: NodeJS.Timeout | undefined
    const abortController = new AbortController()
    
    try {
      setIsLoading(true)
      console.log('🔄 대기필증 보유 사업장 로드 시작')
      
      // 10초 타임아웃 설정
      timeoutId = setTimeout(() => {
        console.error('⏰ 대기필증 로드 타임아웃 (10초)')
        abortController.abort()
        setIsLoading(false)
      }, 10000)
      
      // 1. 모든 대기필증 조회 (사업장 정보 포함)
      // 🔥 배포 환경에서 캐싱 방지
      const airPermitResponse = await fetch('/api/air-permit', {
        cache: 'no-store',
        signal: abortController.signal
      })
      
      if (abortController.signal.aborted) {
        console.log('❌ 요청이 중단되었습니다.')
        return
      }
      
      const airPermitResult = await airPermitResponse.json()
      
      if (airPermitResponse.ok && airPermitResult.data) {
        const permits = airPermitResult.data
        console.log(`✅ 대기필증 ${permits.length}개 조회 완료`)
        
        if (permits.length === 0) {
          console.log('ℹ️ 등록된 대기필증이 없습니다.')
          setBusinessesWithPermits([])
          // 타임아웃 클리어
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          setIsLoading(false)
          return
        }
        
        // 2. 대기필증에서 유니크한 사업장 ID 추출 - FIX: 타입 명시
        const uniqueBusinessIds = [...new Set(permits.map((permit: any) => permit.business_id as string))].filter(Boolean) as string[]
        console.log(`✅ 대기필증 보유 사업장 ${uniqueBusinessIds.length}개 발견`)
        
        if (uniqueBusinessIds.length === 0) {
          console.warn('⚠️ 대기필증이 있지만 유효한 사업장 ID가 없습니다.')
          setBusinessesWithPermits([])
          // 타임아웃 클리어
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          setIsLoading(false)
          return
        }
        
        // 3. 사업장 ID별로 실제 사업장 정보 조회
        const businessesWithPermitsMap = new Map()
        
        // 대기필증 데이터에서 직접 사업장 정보 추출 (더 안정적)
        for (const businessId of uniqueBusinessIds) {
          if (abortController.signal.aborted) {
            console.log('❌ 사업장 정보 로드 중단됨')
            return
          }
          
          // 해당 사업장 ID의 첫 번째 대기필증에서 사업장 정보 가져오기
          const permitForBusiness = permits.find((p: any) => p.business_id === businessId)
          
          if (permitForBusiness && permitForBusiness.business) {
            // 대기필증에 연결된 사업장 정보 사용 (이미 join되어 있음)
            businessesWithPermitsMap.set(businessId, {
              id: businessId,
              business_name: permitForBusiness.business.business_name || '(사업장명 없음)',
              local_government: permitForBusiness.business.local_government || '',
              address: '',
              manager_name: '',
              manager_contact: '',
              is_active: true,
              created_at: new Date().toISOString()
            })
            console.log(`✅ 사업장 "${permitForBusiness.business.business_name}" 정보 로드 완료`)
          } else {
            // 사업장 정보가 없는 경우 대기필증 ID로 기본 정보 생성
            console.warn(`⚠️ 사업장 ID ${businessId}의 사업장 정보가 없습니다.`)
            businessesWithPermitsMap.set(businessId, {
              id: businessId,
              business_name: `사업장-${businessId.slice(0, 8)}`,
              local_government: '',
              address: '',
              manager_name: '',
              manager_contact: '',
              is_active: true,
              created_at: new Date().toISOString()
            })
          }
        }
        
        const businessesWithPermits = Array.from(businessesWithPermitsMap.values())
        setBusinessesWithPermits(businessesWithPermits)
        console.log(`✅ 대기필증 보유 사업장 ${businessesWithPermits.length}개 로드 완료`)
        
        if (businessesWithPermits.length === 0) {
          console.warn('⚠️ 대기필증은 있지만 사업장 정보를 찾을 수 없습니다. uniqueBusinessIds:', uniqueBusinessIds)
        }
      } else {
        console.error('❌ 대기필증 데이터 로드 실패:', airPermitResult.error)
        setBusinessesWithPermits([])
        // 타임아웃 클리어
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
      
    } catch (error) {
      console.error('Error loading businesses with permits:', error)
      alert('대기필증 사업장 목록을 불러오는데 실패했습니다')
    } finally {
      // 타임아웃 클리어
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      setIsLoading(false)
    }
  }, [])

  // 선택된 사업장의 대기필증 목록 로드
  const loadAirPermits = async (businessId: string) => {
    try {
      setIsLoading(true)
      // 🔥 배포 환경에서 캐싱 방지 - 수정 후 즉시 반영
      const response = await fetch(`/api/air-permit?businessId=${businessId}&details=true`, {
        cache: 'no-store'
      })
      const result = await response.json()
      
      if (response.ok) {
        console.log('📋 로드된 대기필증 목록:', result.data)
        
        // 데이터 구조 정규화 - additional_info가 문자열인 경우 파싱
        const normalizedPermits = result.data.map((permit: any) => {
          let additionalInfo = permit.additional_info || {}
          
          // additional_info가 문자열인 경우 JSON 파싱
          if (typeof additionalInfo === 'string') {
            try {
              additionalInfo = JSON.parse(additionalInfo)
            } catch (e) {
              console.warn('additional_info 파싱 실패:', e)
              additionalInfo = {}
            }
          }
          
          return {
            ...permit,
            additional_info: additionalInfo
          }
        })
        
        setAirPermits(normalizedPermits)
        
        // 시설 번호 생성 및 캐싱
        const newFacilityNumberingMap = new Map<string, FacilityNumberingResult>()
        normalizedPermits.forEach((permit: AirPermitWithOutlets) => {
          if (permit.outlets && permit.outlets.length > 0) {
            const facilityNumbering = generateFacilityNumbering(permit as AirPermitWithOutlets)
            newFacilityNumberingMap.set(permit.id, facilityNumbering)
          }
        })
        setFacilityNumberingMap(newFacilityNumberingMap)
        
        // 🎯 첫 번째 대기필증 자동 선택하여 상세페이지 바로 표시
        if (normalizedPermits.length > 0) {
          console.log('✅ 첫 번째 대기필증 자동 선택:', normalizedPermits[0])
          console.log('🔍 첫 번째 대기필증의 outlets 정보:', normalizedPermits[0].outlets)
          setSelectedPermit(normalizedPermits[0])
        }
      } else {
        alert('대기필증 목록을 불러오는데 실패했습니다: ' + result.error)
      }
    } catch (error) {
      console.error('Error loading air permits:', error)
      alert('대기필증 목록을 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 반응형 컨테이너 높이 설정
  useEffect(() => {
    const updateHeight = () => {
      const vh = window.innerHeight
      const offset = vh < 768 ? 300 : vh < 1024 ? 250 : 200
      setContainerHeight(vh - offset)
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  // 대기필증 검색어 변경 시 필터링
  useEffect(() => {
    filterAirPermits(permitSearchQuery)
  }, [permitSearchQuery, filterAirPermits])

  // 대기필증 목록 변경 시 필터링 초기화
  useEffect(() => {
    setFilteredAirPermits(airPermits)
    if (permitSearchQuery) {
      filterAirPermits(permitSearchQuery)
    }
  }, [airPermits, filterAirPermits, permitSearchQuery])

  // 모든 사업장 목록 로드 (모달용 - 전체 사업장)
  const loadAllBusinesses = async () => {
    setIsLoadingBusinesses(true)
    try {
      // includeAll=true 파라미터로 전체 사업장 조회
      // 🔥 배포 환경에서 캐싱 방지
      const response = await fetch('/api/business-list?includeAll=true', {
        cache: 'no-store'
      })
      const result = await response.json()

      if (response.ok) {
        // API에서 BusinessInfo 객체 배열을 반환
        const businesses = Array.isArray(result.data?.businesses) ? result.data.businesses : []

        console.log('✅ 전체 사업장 목록 로드 완료:', businesses.length, '개')
        setAllBusinesses(businesses)
      } else {
        console.error('❌ 사업장 목록 로드 실패:', result.error)
        setAllBusinesses([]) // Ensure it's always an array
        alert('사업장 목록을 불러오는데 실패했습니다: ' + result.error)
      }
    } catch (error) {
      console.error('❌ 사업장 목록 로드 오류:', error)
      setAllBusinesses([]) // Ensure it's always an array
      alert('사업장 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setIsLoadingBusinesses(false)
    }
  }

  // 배출구 추가
  const addOutlet = () => {
    const newOutletNumber = newPermitData.outlets.length + 1
    setNewPermitData(prev => ({
      ...prev,
      outlets: [
        ...prev.outlets,
        {
          outlet_number: newOutletNumber,
          outlet_name: `배출구 ${newOutletNumber}`,
          discharge_facilities: [{ name: '', capacity: '', quantity: 1 }],
          prevention_facilities: [{ name: '', capacity: '', quantity: 1 }]
        }
      ]
    }))
  }

  // 배출구 삭제
  const removeOutlet = (outletIndex: number) => {
    if (newPermitData.outlets.length > 1) {
      setNewPermitData(prev => ({
        ...prev,
        outlets: prev.outlets.filter((_, index) => index !== outletIndex)
      }))
    }
  }

  // 배출시설 추가
  const addDischargeFacility = (outletIndex: number) => {
    setNewPermitData(prev => ({
      ...prev,
      outlets: prev.outlets.map((outlet, index) => 
        index === outletIndex
          ? {
              ...outlet,
              discharge_facilities: [
                ...outlet.discharge_facilities,
                { name: '', capacity: '', quantity: 1 }
              ]
            }
          : outlet
      )
    }))
  }

  // 배출시설 삭제
  const removeDischargeFacility = (outletIndex: number, facilityIndex: number) => {
    setNewPermitData(prev => ({
      ...prev,
      outlets: prev.outlets.map((outlet, index) => 
        index === outletIndex
          ? {
              ...outlet,
              discharge_facilities: outlet.discharge_facilities.filter((_, fIndex) => fIndex !== facilityIndex)
            }
          : outlet
      )
    }))
  }

  // 방지시설 추가
  const addPreventionFacility = (outletIndex: number) => {
    setNewPermitData(prev => ({
      ...prev,
      outlets: prev.outlets.map((outlet, index) => 
        index === outletIndex
          ? {
              ...outlet,
              prevention_facilities: [
                ...outlet.prevention_facilities,
                { name: '', capacity: '', quantity: 1 }
              ]
            }
          : outlet
      )
    }))
  }

  // 방지시설 삭제
  const removePreventionFacility = (outletIndex: number, facilityIndex: number) => {
    setNewPermitData(prev => ({
      ...prev,
      outlets: prev.outlets.map((outlet, index) => 
        index === outletIndex
          ? {
              ...outlet,
              prevention_facilities: outlet.prevention_facilities.filter((_, fIndex) => fIndex !== facilityIndex)
            }
          : outlet
      )
    }))
  }

  // 시설 정보 업데이트
  const updateFacility = (outletIndex: number, facilityType: 'discharge' | 'prevention', facilityIndex: number, field: string, value: any) => {
    setNewPermitData(prev => ({
      ...prev,
      outlets: prev.outlets.map((outlet, oIndex) => 
        oIndex === outletIndex
          ? {
              ...outlet,
              [`${facilityType}_facilities`]: outlet[`${facilityType}_facilities`].map((facility: any, fIndex: number) => 
                fIndex === facilityIndex
                  ? { ...facility, [field]: value }
                  : facility
              )
            }
          : outlet
      )
    }))
  }

  // 대기필증 추가 모달 열기
  // 사업장 필터링 로직 (실시간 검색 최적화)
  const filteredBusinesses = useMemo(() => {
    if (!Array.isArray(allBusinesses)) return []

    // 검색어가 없으면 전체 목록 반환 (정렬됨)
    if (!searchTerm || searchTerm.length < 1) {
      return allBusinesses
    }

    // 검색어가 있으면 필터링 (제한 없이 전체 검색)
    const searchLower = searchTerm.toLowerCase()
    return allBusinesses.filter(business => {
      return (
        business.business_name?.toLowerCase().includes(searchLower) ||
        business.local_government?.toLowerCase().includes(searchLower) ||
        business.business_registration_number?.includes(searchTerm)
      )
    })
  }, [allBusinesses, searchTerm])

  const openAddModal = () => {
    setNewPermitData({
      business_id: '',
      business_type: '',
      category: '',
      first_report_date: '',
      operation_start_date: '',
      facility_number: '',
      green_link_code: '',
      memo: '',
      outlets: [
        {
          outlet_number: 1,
          outlet_name: '배출구 1',
          discharge_facilities: [{ name: '', capacity: '', quantity: 1 }],
          prevention_facilities: [{ name: '', capacity: '', quantity: 1 }]
        }
      ]
    })
    // 검색 상태 리셋
    setSearchTerm('')
    setSelectedBusinessName('')
    setShowBusinessDropdown(false)
    
    setIsAddModalOpen(true)
    // 모달이 열릴 때만 사업장 데이터 로드 (지연 로딩)
    if (allBusinesses.length === 0) {
      loadAllBusinesses()
    }
  }

  // 외부 클릭시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showBusinessDropdown) {
        const target = event.target as HTMLElement
        if (!target.closest('.business-dropdown-container')) {
          setShowBusinessDropdown(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBusinessDropdown])

  // 페이지 로드 시 대기필증이 등록된 사업장만 로드
  useEffect(() => {
    loadBusinessesWithPermits()
  }, [])

  // 🔄 URL 파라미터에서 사업장 복원 (목록으로 버튼으로 돌아왔을 때)
  useEffect(() => {
    const businessId = searchParams?.get('businessId')
    if (businessId && businessesWithPermits.length > 0 && !selectedBusiness) {
      const business = businessesWithPermits.find(b => b.id === businessId)
      if (business) {
        console.log('🔄 URL 파라미터에서 사업장 복원:', business.business_name)
        handleBusinessSelect(business)
        // URL에서 파라미터 제거 (깔끔한 URL 유지)
        router.replace('/admin/air-permit', { scroll: false })
      }
    }
  }, [searchParams, businessesWithPermits, selectedBusiness])

  // 🔄 페이지가 다시 보여질 때마다 데이터 새로고침 (디테일 페이지에서 돌아왔을 때 게이트웨이 변경사항 반영)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && selectedBusiness) {
        console.log('🔄 페이지 visibility 복원 - 대기필증 데이터 새로고침')
        loadAirPermits(selectedBusiness.id)
      }
    }

    const handleFocus = () => {
      if (selectedBusiness) {
        console.log('🔄 페이지 focus 복원 - 대기필증 데이터 새로고침')
        loadAirPermits(selectedBusiness.id)
      }
    }

    // ✅ Storage 이벤트로 같은 탭/다른 탭에서 대기필증 변경 감지
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'air-permit-updated' && selectedBusiness) {
        const updatedBusinessId = e.newValue
        if (updatedBusinessId === selectedBusiness.id) {
          console.log('🔄 대기필증 업데이트 감지 - 데이터 새로고침')
          loadAirPermits(selectedBusiness.id)
          // 즉시 제거하여 중복 호출 방지
          localStorage.removeItem('air-permit-updated')
        }
      }
    }

    // Visibility API로 탭 전환 감지
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // Focus 이벤트로 다른 페이지에서 돌아온 경우 감지
    window.addEventListener('focus', handleFocus)
    // Storage 이벤트로 대기필증 변경 감지
    window.addEventListener('storage', handleStorageChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [selectedBusiness])

  // 사업장 선택 시 대기필증 목록 로드
  const handleBusinessSelect = (business: BusinessInfo) => {
    setSelectedBusiness(business)
    setSelectedPermit(null) // 사업장 변경시 선택된 필증 초기화
    loadAirPermits(business.id)
  }

  // 필증 선택 핸들러
  const handlePermitSelect = (permit: AirPermitInfo) => {
    setSelectedPermit(permit)
  }


  // 대기필증 생성 함수 (실시간 업데이트 적용)
  const handleCreatePermit = async () => {
    try {
      if (!newPermitData.business_id) {
        alert('사업장을 선택해주세요.')
        return
      }

      const selectedBusiness = Array.isArray(allBusinesses) ? allBusinesses.find(b => b.id === newPermitData.business_id) : null
      
      // API 호출용 데이터 구성
      const permitData = {
        business_id: newPermitData.business_id,
        business_type: newPermitData.business_type || selectedBusiness?.business_type || '',
        category: newPermitData.category,
        business_name: selectedBusiness?.business_name || '',
        first_report_date: newPermitData.first_report_date?.trim() || null,
        operation_start_date: newPermitData.operation_start_date?.trim() || null,
        additional_info: {
          facility_number: newPermitData.facility_number,
          green_link_code: newPermitData.green_link_code,
          memo: newPermitData.memo
        },
        outlets: newPermitData.outlets.map(outlet => ({
          outlet_number: outlet.outlet_number,
          outlet_name: outlet.outlet_name,
          discharge_facilities: outlet.discharge_facilities.filter(f => f.name.trim()),
          prevention_facilities: outlet.prevention_facilities.filter(f => f.name.trim()),
          additional_info: {
            gateway: ''
          }
        }))
      }

      // 낙관적 업데이트: 임시 ID로 즉시 UI 업데이트
      const tempPermit = {
        id: `temp-${Date.now()}`,
        ...permitData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        is_deleted: false
      }

      // 즉시 UI 업데이트
      setAirPermits(prev => [...prev, tempPermit as any])
      setIsAddModalOpen(false)

      console.log('📤 대기필증 POST 요청 데이터:', {
        first_report_date: permitData.first_report_date,
        operation_start_date: permitData.operation_start_date,
        fullData: permitData
      })

      const response = await fetch('/api/air-permit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(permitData)
      })

      const result = await response.json()

      if (response.ok) {
        // 대기필증이 등록된 사업장 목록 업데이트
        await loadBusinessesWithPermits()

        // ✅ 서버에서 최신 데이터 재조회하여 UI 동기화 (낙관적 업데이트 대신 정확한 데이터 표시)
        if (newPermitData.business_id) {
          await loadAirPermits(newPermitData.business_id)
        }

        alert('대기필증이 성공적으로 생성되었습니다.')
        console.log('✅ 대기필증 생성 성공:', result.data)
      } else {
        // 실패 시 롤백
        setAirPermits(prev => prev.filter(permit => permit.id !== tempPermit.id))
        console.error('❌ 대기필증 생성 실패:', result)
        alert(result.error || '대기필증 생성에 실패했습니다.')
      }

    } catch (error) {
      console.error('💥 대기필증 생성 중 예외 발생:', error)
      // 오류 시 롤백
      setAirPermits(prev => prev.filter(permit => !permit.id.toString().startsWith('temp-')))
      alert('대기필증 생성 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  // 대기필증 삭제 확인
  const confirmDelete = (permit: AirPermitInfo) => {
    setPermitToDelete(permit)
    setDeleteConfirmOpen(true)
  }

  // 대기필증 삭제
  const handleDelete = async () => {
    if (!permitToDelete) return

    try {
      // 낙관적 업데이트: 즉시 UI에서 제거
      const deletedPermit = permitToDelete
      setAirPermits(prev => prev.filter(permit => permit.id !== permitToDelete.id))
      setDeleteConfirmOpen(false)
      setPermitToDelete(null)

      // 사업장 목록의 필증 카운트 업데이트 (삭제 성공 후 처리)
      // loadBusinessesWithPermits()를 호출하지 않고 UI만 즉시 업데이트

      const response = await fetch(`/api/air-permit?id=${deletedPermit.id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok) {
        // 실패 시 롤백
        setAirPermits(prev => [...prev, deletedPermit])
        console.error('❌ 대기필증 삭제 실패:', result)
        alert(result.error || '대기필증 삭제에 실패했습니다')
      } else {
        console.log('✅ 대기필증 삭제 성공:', deletedPermit.id)
      }
    } catch (error) {
      console.error('💥 대기필증 삭제 중 예외 발생:', error)
      // 오류 시 롤백
      if (permitToDelete) {
        setAirPermits(prev => [...prev, permitToDelete])
      }
      alert('대기필증 삭제 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <AdminLayout 
      title="대기필증 관리"
      description="대기배출시설 허가증 관리 시스템"
      actions={
        <button
          onClick={openAddModal}
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 md:px-3 md:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
          title="새 대기필증 추가"
        >
          <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="sm:hidden">추가</span>
          <span className="hidden sm:inline">대기필증 추가</span>
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[23%_77%] gap-3 sm:gap-4 lg:gap-6">
        {/* Business Selection Panel */}
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 sm:mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600" />
                <span className="whitespace-nowrap">대기필증 보유 사업장</span>
              </div>
              <span className="text-[8px] sm:text-[9px] md:text-[10px] font-normal bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                {businessListSearchTerm ? (
                  `검색 ${filteredBusinessesWithPermits.length}개`
                ) : (
                  `전체 ${filteredBusinessesWithPermits.length}개`
                )}
              </span>
            </h2>
            
            {/* 사업장 검색 입력 */}
            <div className="mb-3 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="사업장명, 지역, 담당자명으로 검색..."
                value={businessListSearchTerm}
                onChange={(e) => setBusinessListSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-10 py-1.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              {businessListSearchTerm && (
                <button
                  onClick={() => setBusinessListSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            
            {filteredBusinessesWithPermits.length > 0 ? (
              <FixedSizeList
                height={containerHeight}
                itemCount={filteredBusinessesWithPermits.length}
                itemSize={80}
                width="100%"
                itemKey={(index: number) => filteredBusinessesWithPermits[index].id}
                className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
              >
                {({ index, style }: { index: number; style: React.CSSProperties }) => {
                  const business = filteredBusinessesWithPermits[index]
                  const isSelected = selectedBusiness?.id === business.id

                  return (
                    <div style={style} className="px-2">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`사업장: ${business.business_name}`}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleBusinessSelect(business)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleBusinessSelect(business)
                          }
                        }}
                      >
                        <h3 className="font-medium text-gray-900 text-sm">
                          {businessListSearchTerm ? highlightBusinessSearchTerm(business.business_name, businessListSearchTerm) : business.business_name}
                        </h3>
                        <p className="text-[9px] sm:text-[10px] md:text-xs text-gray-600 mt-1">
                          {business.business_registration_number || '등록번호 미등록'}
                        </p>
                      </div>
                    </div>
                  )
                }}
              </FixedSizeList>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">
                  {businessListSearchTerm ? '검색 결과가 없습니다' : '대기필증 보유 사업장이 없습니다'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Air Permit Detail Panel */}
        <div>
          {!selectedBusiness ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="text-center text-gray-500">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-base font-medium mb-2">사업장을 선택해주세요</h3>
                <p className="text-sm">좌측에서 사업장을 선택하면 해당 대기필증 정보가 표시됩니다.</p>
              </div>
            </div>
          ) : !selectedPermit ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  {selectedBusiness.business_name} - 대기필증 목록
                </span>
                <span className="text-sm font-normal bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {permitSearchQuery ? `${filteredAirPermits.length}개 검색 결과 (전체 ${airPermits.length}개)` : `${airPermits.length}개 대기필증`}
                </span>
              </h2>
              
              {/* 대기필증 검색 입력 */}
              <div className="mb-3 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="대기필증 번호, 업종, 시설명, 설치장소, 오염물질로 검색..."
                  value={permitSearchQuery}
                  onChange={(e) => setPermitSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-10 py-1.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {permitSearchQuery && (
                  <button
                    onClick={() => setPermitSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
              
              <div className="space-y-2">
                {filteredAirPermits.map((permit) => (
                  <div
                    key={permit.id}
                    className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => setSelectedPermit(permit)}
                      >
                        <h3 className="font-medium text-gray-900 text-sm">
                          {permitSearchQuery ? (
                            <>
                              대기필증 #{highlightPermitSearchTerm(permit.id || '', permitSearchQuery)}
                            </>
                          ) : (
                            `대기필증 #${permit.id}`
                          )}
                        </h3>
                        <div className="text-[9px] sm:text-[10px] md:text-xs text-gray-600 mt-1 space-y-1">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="font-medium">업종: </span>
                              {permitSearchQuery ? 
                                highlightPermitSearchTerm(permit.business_type || '미지정', permitSearchQuery) : 
                                (permit.business_type || '미지정')
                              }
                            </div>
                            <div>
                              <span className="font-medium">종별: </span>
                              {permitSearchQuery ? 
                                highlightPermitSearchTerm(permit.additional_info?.category || '미지정', permitSearchQuery) : 
                                (permit.additional_info?.category || '미지정')
                              }
                            </div>
                          </div>
                          
                          {/* 시설 번호 정보 표시 */}
                          {(() => {
                            const facilityNumbering = facilityNumberingMap.get(permit.id)
                            if (!facilityNumbering || facilityNumbering.outlets.length === 0) return null

                            return (
                              <div className="mt-2 p-2 bg-gray-50 rounded border">
                                <div className="text-[9px] sm:text-[10px] md:text-xs font-medium text-gray-600 mb-1">시설 번호 현황</div>
                                <div className="space-y-1">
                                  {facilityNumbering.outlets.map(outlet => {
                                    const summary = generateOutletFacilitySummary(outlet)
                                    if (!summary) return null

                                    // 게이트웨이 정보 가져오기
                                    const outletData = permit.outlets?.find((o: any) => o.id === outlet.outletId) as any
                                    const gateway = outletData?.additional_info?.gateway || ''
                                    const gatewayColorClass = getGatewayColorClass(gateway)

                                    return (
                                      <div key={outlet.outletId} className="text-[8px] sm:text-[9px] md:text-[10px] text-gray-700 flex items-center gap-1">
                                        <span className="font-medium">배출구 {outlet.outletNumber}:</span>
                                        {gateway && (
                                          <span className={`text-[7px] sm:text-[8px] px-1.5 py-0.5 rounded-full border ${gatewayColorClass}`}>
                                            GW{gateway.replace('gateway', '')}
                                          </span>
                                        )}
                                        <span>{summary}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                                <div className="text-[8px] sm:text-[9px] md:text-[10px] text-gray-500 mt-1">
                                  배출시설 {facilityNumbering.totalDischargeFacilities}개,
                                  방지시설 {facilityNumbering.totalPreventionFacilities}개
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedPermit(permit)
                          }}
                          className="p-1 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="상세보기"
                        >
                          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/admin/air-permit-detail?permitId=${permit.id}&edit=true`)
                          }}
                          className="p-1 sm:p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="편집"
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            confirmDelete(permit)
                          }}
                          className="p-1 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Permit Detail View */
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Header - 제목, 상세관리, 닫기 버튼 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
                    <div className="p-1 sm:p-1.5 md:p-2 bg-blue-100 rounded-lg">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm md:text-base lg:text-base font-bold text-gray-900">
                        대기필증 상세정보
                      </h2>
                      <p className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs text-gray-600">
                        {selectedBusiness.business_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* X 버튼만 헤더에 유지 */}
                    <button
                      onClick={() => setSelectedPermit(null)}
                      className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 sm:p-4 md:p-4 space-y-3 sm:space-y-4 md:space-y-4">
                {/* Basic Information */}
                <div>
                  <h3 className="text-sm lg:text-base font-semibold text-gray-900 mb-2 sm:mb-2 flex items-center gap-1 sm:gap-2">
                    <Factory className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-blue-600" />
                    기본 정보
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2 md:gap-3 bg-gray-50 rounded-lg p-2 sm:p-3 md:p-3">
                    <div>
                      <label className="block text-[8px] sm:text-[9px] md:text-[10px] lg:text-sm font-medium text-gray-700">업종</label>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-gray-900">
                        {selectedPermit.business_type || '미지정'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[8px] sm:text-[9px] md:text-[10px] lg:text-sm font-medium text-gray-700">종별</label>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-gray-900">
                        {selectedPermit.additional_info?.category || '미지정'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[8px] sm:text-[9px] md:text-[10px] lg:text-sm font-medium text-gray-700">최초신고일</label>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-gray-900">
                        {(selectedPermit as any).first_report_date || '미지정'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[8px] sm:text-[9px] md:text-[10px] lg:text-sm font-medium text-gray-700">가동개시일</label>
                      <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-gray-900">
                        {(selectedPermit as any).operation_start_date || '미지정'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Outlets and Facilities Information */}
                <div>
                  <h3 className="text-sm lg:text-base font-semibold text-gray-900 mb-2 sm:mb-2 md:mb-3 flex items-center gap-1 sm:gap-2">
                    <Factory className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-green-600" />
                    배출구별 시설 현황
                  </h3>
                  
                  {(() => {
                    console.log('🔍 현재 selectedPermit:', selectedPermit)
                    console.log('🔍 selectedPermit.outlets:', selectedPermit.outlets)
                    return selectedPermit.outlets && selectedPermit.outlets.length > 0
                  })() ? (
                    <div className="space-y-2 sm:space-y-3 md:space-y-4">
                      {selectedPermit.outlets?.map((outlet: any, index: number) => {
                        // 게이트웨이 색상 결정 (동적 생성 함수 사용)
                        const gateway = outlet.additional_info?.gateway || ''
                        const colorClass = getGatewayColorClass(gateway)
                        
                        return (
                          <div key={index} className={`border-2 rounded-lg p-2 sm:p-3 md:p-4 ${colorClass}`}>
                            {/* 배출구 헤더 */}
                            <div className="flex justify-between items-center mb-2 sm:mb-3 md:mb-4">
                              <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
                                <h4 className="text-[9px] sm:text-[10px] md:text-xs lg:text-lg font-semibold">
                                  배출구 #{outlet.outlet_number || index + 1}
                                </h4>
                                {outlet.outlet_name && (
                                  <span className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-sm text-gray-600">({outlet.outlet_name})</span>
                                )}
                                {gateway && (
                                  <span className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-full bg-white bg-opacity-70">
                                    Gateway {gateway.replace('gateway', '')}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 시설 정보 테이블 */}
                            <div className="bg-white rounded-lg overflow-hidden shadow-sm">
                              <table className="w-full text-[9px] sm:text-[10px] md:text-xs lg:text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-left font-medium text-gray-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">구분</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-left font-medium text-red-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">배출시설</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-red-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">용량</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-red-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">수량</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-red-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">시설번호</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-red-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">그린링크</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-left font-medium text-red-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">메모</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-left font-medium text-blue-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">방지시설</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-blue-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">용량</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-blue-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">수량</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-blue-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">시설번호</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center font-medium text-blue-700 border-r text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">그린링크</th>
                                    <th className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-left font-medium text-blue-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">메모</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    const maxRows = Math.max(
                                      outlet.discharge_facilities?.length || 0,
                                      outlet.prevention_facilities?.length || 0,
                                      1
                                    )
                                    
                                    // 시설 번호 정보 가져오기
                                    const facilityNumbering = facilityNumberingMap.get(selectedPermit.id)
                                    const outletNumbering = facilityNumbering?.outlets.find(o => o.outletId === outlet.id)
                                    
                                    return Array.from({ length: maxRows }, (_, rowIndex) => {
                                      const dischargeFacility = outlet.discharge_facilities?.[rowIndex]
                                      const preventionFacility = outlet.prevention_facilities?.[rowIndex]
                                      
                                      // 시설별 번호 표시 로직
                                      const getDischargeFacilityNumbers = () => {
                                        if (!dischargeFacility || !outletNumbering) return '-'
                                        const facilityNumbers = outletNumbering.dischargeFacilities
                                          .filter(f => f.facilityId === dischargeFacility.id)
                                          .map(f => f.displayNumber)
                                        
                                        if (facilityNumbers.length === 0) return '-'
                                        if (facilityNumbers.length === 1) return facilityNumbers[0]
                                        return `${facilityNumbers[0]}-${facilityNumbers[facilityNumbers.length - 1]}`
                                      }
                                      
                                      const getPreventionFacilityNumbers = () => {
                                        if (!preventionFacility || !outletNumbering) return '-'
                                        const facilityNumbers = outletNumbering.preventionFacilities
                                          .filter(f => f.facilityId === preventionFacility.id)
                                          .map(f => f.displayNumber)
                                        
                                        if (facilityNumbers.length === 0) return '-'
                                        if (facilityNumbers.length === 1) return facilityNumbers[0]
                                        return `${facilityNumbers[0]}-${facilityNumbers[facilityNumbers.length - 1]}`
                                      }
                                      
                                      return (
                                        <tr key={rowIndex} className="border-t hover:bg-gray-50">
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center text-gray-500 border-r font-medium text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {rowIndex + 1}
                                          </td>

                                          {/* 배출시설 정보 */}
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border-r">
                                            <div className="font-medium text-gray-900 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                              {dischargeFacility?.facility_name || '-'}
                                            </div>
                                            {dischargeFacility?.additional_info?.facility_number && (
                                              <div className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] text-gray-500 mt-1">
                                                #{dischargeFacility.additional_info.facility_number}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r text-gray-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {dischargeFacility?.capacity || '-'}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r font-medium text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {dischargeFacility?.quantity || '-'}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r">
                                            <span className="inline-block px-1 sm:px-2 py-0.5 sm:py-1 bg-red-100 text-red-800 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-medium rounded">
                                              {getDischargeFacilityNumbers()}
                                            </span>
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r text-gray-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {dischargeFacility?.additional_info?.green_link_code || '-'}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border-r text-gray-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            <div className="max-w-[120px] truncate" title={dischargeFacility?.additional_info?.memo || ''}>
                                              {dischargeFacility?.additional_info?.memo || '-'}
                                            </div>
                                          </td>

                                          {/* 방지시설 정보 */}
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 border-r">
                                            <div className="font-medium text-gray-900 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                              {preventionFacility?.facility_name || '-'}
                                            </div>
                                            {preventionFacility?.additional_info?.facility_number && (
                                              <div className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] text-gray-500 mt-1">
                                                #{preventionFacility.additional_info.facility_number}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r text-gray-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {preventionFacility?.capacity || '-'}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r font-medium text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {preventionFacility?.quantity || '-'}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r">
                                            <span className="inline-block px-1 sm:px-2 py-0.5 sm:py-1 bg-blue-100 text-blue-800 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-medium rounded">
                                              {getPreventionFacilityNumbers()}
                                            </span>
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-center border-r text-gray-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            {preventionFacility?.additional_info?.green_link_code || '-'}
                                          </td>
                                          <td className="px-1 sm:px-2 md:px-3 py-1 sm:py-2 text-gray-700 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs">
                                            <div className="max-w-[120px] truncate" title={preventionFacility?.additional_info?.memo || ''}>
                                              {preventionFacility?.additional_info?.memo || '-'}
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 sm:py-8 bg-gray-50 rounded-lg">
                      <Factory className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 mx-auto mb-2 sm:mb-3 text-gray-300" />
                      <p className="text-gray-500 text-base">등록된 배출구 정보가 없습니다</p>
                      <p className="text-gray-400 mt-1 text-[9px] sm:text-[10px] md:text-xs">상세관리 버튼을 클릭하여 배출구 정보를 추가해보세요</p>
                    </div>
                  )}
                </div>

              </div>

              {/* Fixed FAB 버튼 - 스크롤해도 고정 위치 유지 */}
              <button
                onClick={() => router.push(`/admin/air-permit-detail?permitId=${selectedPermit.id}&edit=true`)}
                className="fixed top-[170px] right-[90px] z-30 flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 text-sm font-medium hover:scale-105"
              >
                <Edit className="w-4 h-4" />
                상세관리
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 대기필증 추가 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-2 sm:p-4 md:p-6 lg:p-8 max-w-sm sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-7xl w-full max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6 lg:mb-8 pb-2 sm:pb-3 md:pb-4 lg:pb-6 border-b border-gray-200">
              <div>
                <h2 className="text-sm sm:text-base md:text-base lg:text-lg font-bold text-gray-900 mb-1 sm:mb-2">새 대기필증 추가</h2>
                <p className="text-sm lg:text-sm text-gray-600">새로운 대기필증 정보를 입력하고 등록하세요.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 sm:p-2 md:p-2.5 lg:p-3 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-gray-500" />
              </button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleCreatePermit(); }} className="space-y-3 sm:space-y-4 md:space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
              {/* 사업장 선택 */}
              <div className="relative business-dropdown-container">
                <label className="block text-sm font-semibold text-gray-800 mb-1 sm:mb-2">
                  사업장 선택 <span className="text-red-500">*</span>
                </label>
                {isLoadingBusinesses ? (
                  <div className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 flex items-center text-sm">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-1 sm:mr-2"></div>
                    사업장 목록을 불러오는 중...
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={newPermitData.business_id ? selectedBusinessName : searchTerm}
                      onChange={(e) => {
                        const value = e.target.value
                        setSearchTerm(value)
                        setShowBusinessDropdown(true)

                        // 사업장이 선택된 상태에서 수정하는 경우 선택 해제
                        if (newPermitData.business_id) {
                          setSelectedBusinessName('')
                          setNewPermitData(prev => ({
                            ...prev,
                            business_id: '',
                            business_type: ''
                          }))
                        }
                      }}
                      onFocus={() => {
                        setShowBusinessDropdown(true)
                        // 포커스시 선택된 사업장이 있다면 검색어를 비워서 다시 검색할 수 있게 함
                        if (newPermitData.business_id) {
                          setSearchTerm('')
                        }
                      }}
                      className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-8 sm:pr-10 text-sm"
                      placeholder="사업장명 또는 지자체명으로 검색..."
                      required={!newPermitData.business_id}
                    />
                    <div className="absolute inset-y-0 right-0 pr-2 sm:pr-3 flex items-center">
                      <svg className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    
                    {showBusinessDropdown && (!newPermitData.business_id || searchTerm) && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 sm:max-h-60 overflow-y-auto">
                        {filteredBusinesses.length > 0 ? (
                          <>
                            <div className="px-2 sm:px-3 py-1 sm:py-2 text-[9px] sm:text-[10px] md:text-xs text-gray-500 border-b border-gray-200 bg-gray-50">
                              {searchTerm ?
                                `검색 결과: ${filteredBusinesses.length}개 사업장` :
                                `전체: ${filteredBusinesses.length}개 사업장`
                              }
                            </div>
                            {filteredBusinesses.map(business => (
                              <div
                                key={business.id}
                                onClick={() => {
                                  setSelectedBusinessName(`${business.business_name} - ${business.local_government}`)
                                  setSearchTerm('')
                                  setShowBusinessDropdown(false)
                                  setNewPermitData(prev => ({
                                    ...prev,
                                    business_id: business.id,
                                    business_type: business.business_type || ''
                                  }))
                                }}
                                className="px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                              >
                                <div className="font-medium text-gray-900 text-sm">{business.business_name}</div>
                                <div className="text-[9px] sm:text-[10px] md:text-xs text-gray-500">{business.local_government}</div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="px-2 sm:px-3 py-2 sm:py-4 text-gray-500 text-center text-sm">
                            {isLoadingBusinesses ? (
                              <div className="flex items-center justify-center">
                                <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-1 sm:mr-2"></div>
                                사업장 목록을 불러오는 중...
                              </div>
                            ) : (
                              searchTerm ? `"${searchTerm}"에 대한 검색 결과가 없습니다.` : '사업장 목록이 없습니다.'
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 선택된 사업장 표시 */}
                {newPermitData.business_id && !showBusinessDropdown && (
                  <div className="mt-1 sm:mt-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
                    <div>
                      <div className="font-medium text-blue-900 text-sm">{selectedBusinessName.split(' - ')[0]}</div>
                      <div className="text-[9px] sm:text-[10px] md:text-xs text-blue-700">{selectedBusinessName.split(' - ')[1]}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBusinessName('')
                        setSearchTerm('')
                        setNewPermitData(prev => ({
                          ...prev,
                          business_id: '',
                          business_type: ''
                        }))
                      }}
                      className="text-blue-600 hover:text-blue-800 ml-1 sm:ml-2"
                    >
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* 업종 */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1 sm:mb-2">
                  업종
                </label>
                <input
                  type="text"
                  value={newPermitData.business_type}
                  onChange={(e) => setNewPermitData(prev => ({...prev, business_type: e.target.value}))}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="업종을 입력하세요"
                />
              </div>

              {/* 종별 */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1 sm:mb-2">
                  종별
                </label>
                <input
                  type="text"
                  value={newPermitData.category}
                  onChange={(e) => setNewPermitData(prev => ({...prev, category: e.target.value}))}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="종별을 입력하세요"
                />
              </div>

              {/* 최초 신고일 */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1 sm:mb-2">
                  최초 신고일
                </label>
                <DateInput
                  value={newPermitData.first_report_date}
                  onChange={(value) => setNewPermitData(prev => ({...prev, first_report_date: value}))}
                  placeholder="YYYY-MM-DD"
                />
              </div>

              {/* 가동 개시일 */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1 sm:mb-2">
                  가동 개시일
                </label>
                <DateInput
                  value={newPermitData.operation_start_date}
                  onChange={(value) => setNewPermitData(prev => ({...prev, operation_start_date: value}))}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              </div>


              {/* 배출구 및 시설 정보 섹션 */}
              <div className="bg-blue-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 flex items-center gap-1 sm:gap-2">
                    <Factory className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                    배출구 및 시설 정보
                  </h3>
                  <button
                    type="button"
                    onClick={addOutlet}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] md:text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                    배출구 추가
                  </button>
                </div>

                <div className="space-y-2 sm:space-y-3 max-h-80 sm:max-h-[30rem] overflow-y-auto">
                  {newPermitData.outlets.map((outlet, outletIndex) => (
                    <div key={outletIndex} className="border border-gray-200 rounded-lg p-2 sm:p-3">
                      <div className="flex items-center justify-between mb-2 sm:mb-2">
                        <h4 className="font-medium text-gray-900 text-sm">
                          배출구 {outlet.outlet_number}
                        </h4>
                        {newPermitData.outlets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOutlet(outletIndex)}
                            className="p-0.5 sm:p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <X className="w-3 h-3 sm:w-4 sm:h-4" />
                          </button>
                        )}
                      </div>

                      {/* 배출구명 */}
                      <div className="mb-2 sm:mb-2">
                        <label className="block text-[9px] sm:text-[10px] md:text-xs font-medium text-gray-600 mb-1">
                          배출구명
                        </label>
                        <input
                          type="text"
                          lang="ko"
                          value={outlet.outlet_name}
                          onChange={(e) => setNewPermitData(prev => ({
                            ...prev,
                            outlets: prev.outlets.map((o, i) =>
                              i === outletIndex ? {...o, outlet_name: e.target.value} : o
                            )
                          }))}
                          className="w-full px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* 배출시설 */}
                      <div className="mb-2 sm:mb-2">
                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                          <label className="block text-[9px] sm:text-[10px] md:text-xs font-medium text-gray-600">
                            배출시설
                          </label>
                          <button
                            type="button"
                            onClick={() => addDischargeFacility(outletIndex)}
                            className="text-[9px] sm:text-[10px] md:text-xs text-blue-600 hover:text-blue-700"
                          >
                            + 추가
                          </button>
                        </div>
                        <div className="space-y-1 sm:space-y-2">
                          {outlet.discharge_facilities.map((facility, facilityIndex) => (
                            <div key={facilityIndex} className="flex gap-1 sm:gap-2 items-start">
                              <input
                                type="text"
                                lang="ko"
                                value={facility.name}
                                onChange={(e) => updateFacility(outletIndex, 'discharge', facilityIndex, 'name', e.target.value)}
                                placeholder="시설명"
                                className="flex-1 px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              />
                              <UnitInput
                                value={facility.capacity}
                                onChange={(value) => updateFacility(outletIndex, 'discharge', facilityIndex, 'capacity', value)}
                                placeholder="용량"
                                unit="m³"
                                className="w-12 sm:w-16 md:w-20 px-1 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              />
                              <input
                                type="number"
                                value={facility.quantity}
                                onChange={(e) => updateFacility(outletIndex, 'discharge', facilityIndex, 'quantity', parseInt(e.target.value) || 1)}
                                placeholder="수량"
                                min="1"
                                className="w-10 sm:w-12 md:w-16 px-1 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              />
                              {outlet.discharge_facilities.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeDischargeFacility(outletIndex, facilityIndex)}
                                  className="p-0.5 sm:p-1 text-red-600 hover:bg-red-50 rounded"
                                >
                                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 방지시설 */}
                      <div>
                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                          <label className="block text-[9px] sm:text-[10px] md:text-xs font-medium text-gray-600">
                            방지시설
                          </label>
                          <button
                            type="button"
                            onClick={() => addPreventionFacility(outletIndex)}
                            className="text-[9px] sm:text-[10px] md:text-xs text-blue-600 hover:text-blue-700"
                          >
                            + 추가
                          </button>
                        </div>
                        <div className="space-y-1 sm:space-y-2">
                          {outlet.prevention_facilities.map((facility, facilityIndex) => (
                            <div key={facilityIndex} className="flex gap-1 sm:gap-2 items-start">
                              <input
                                type="text"
                                lang="ko"
                                value={facility.name}
                                onChange={(e) => updateFacility(outletIndex, 'prevention', facilityIndex, 'name', e.target.value)}
                                placeholder="시설명"
                                className="flex-1 px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              />
                              <UnitInput
                                value={facility.capacity}
                                onChange={(value) => updateFacility(outletIndex, 'prevention', facilityIndex, 'capacity', value)}
                                placeholder="용량"
                                unit="m³/분"
                                className="w-12 sm:w-16 md:w-20 px-1 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              />
                              <input
                                type="number"
                                value={facility.quantity}
                                onChange={(e) => updateFacility(outletIndex, 'prevention', facilityIndex, 'quantity', parseInt(e.target.value) || 1)}
                                placeholder="수량"
                                min="1"
                                className="w-10 sm:w-12 md:w-16 px-1 sm:px-2 py-1 text-[9px] sm:text-[10px] md:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              />
                              {outlet.prevention_facilities.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePreventionFacility(outletIndex, facilityIndex)}
                                  className="p-0.5 sm:p-1 text-red-600 hover:bg-red-50 rounded"
                                >
                                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 버튼들 */}
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg sm:rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 text-sm"
                >
                  <span className="flex items-center justify-center gap-1 sm:gap-2">
                    <span className="sm:hidden">생성</span>
                    <span className="hidden sm:inline">대기필증 생성</span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="대기필증 삭제"
        message={`정말로 대기필증 "${permitToDelete?.id}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제"
        variant="danger"
      />
    </AdminLayout>
  );
}

// Suspense로 감싸서 useSearchParams 사용 가능하게 함
function AirPermitPageWithSuspense() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    }>
      <AirPermitManagementPage />
    </Suspense>
  )
}

export default withAuth(AirPermitPageWithSuspense, undefined, 1)