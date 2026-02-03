# 어드민 사업장 상세 모달 - 대기필증 시설 정보 미출력 문제 해결

## 문제 상황

### 증상
- 어드민 `/admin/business` 페이지의 상세 모달에서 "등록된 대기필증 정보가 없습니다" 메시지 표시
- 실제로는 대기필증이 등록되어 있음
- 측정기기 수량은 정상 표시되지만, 시설 정보(배출시설/방지시설/배출구)는 표시 안 됨

### 영향 범위
- BusinessDetailModal 컴포넌트의 "측정기기 및 네트워크" 섹션
- 시설 정보 (대기필증 기준) 카드가 "등록된 대기필증 정보가 없습니다" 상태로 표시

## 근본 원인 분석

### 데이터 흐름
```
[admin/business/page.tsx]
├─ loadBusinessFacilitiesWithDetails() 호출
│  └─ fetch(`/api/facilities-supabase/${businessName}`)
│     └─ API 응답: { success: true, data: { facilities: {...}, ... } }
│        └─ facilities 구조: { discharge: [...], prevention: [...] }
│
├─ BusinessDetailModal 렌더링
│  ├─ facilityData prop 전달
│  └─ facilityData 구조 확인:
│     └─ { business, discharge_facilities, prevention_facilities, summary }
│
[BusinessDetailModal.tsx]
└─ Line 1007: facilityData ? ... : "등록된 대기필증 정보가 없습니다"
   └─ facilityData가 null 또는 undefined → 메시지 표시
```

### 문제점

#### 1. API 응답 데이터 구조 불일치 (app/admin/business/page.tsx:462-518)

**API 응답 구조** (`/api/facilities-supabase/[businessName]`):
```typescript
{
  success: true,
  data: {
    facilities: {
      discharge: [{ outlet, number, name, capacity, quantity, displayName }],
      prevention: [{ outlet, number, name, capacity, quantity, displayName }]
    },
    outlets: { outlets: [1, 2], count: 2 },
    dischargeCount: 2,
    preventionCount: 3,
    businessInfo: { businessName, airPermit },
    facilityNumbering: { outlets: [...] }
  }
}
```

**변환 코드** (page.tsx:480-499):
```typescript
discharge_facilities: facilityApiData.facilities?.discharge?.map((facility: any) => ({
  id: `discharge-${facility.outlet}-${facility.number}`,
  outlet_number: facility.outlet || 1,
  // ...
})) || []
```

**문제**: `facilityApiData.facilities.discharge` 경로가 정확하지만, 데이터가 비어있거나 변환 실패 시 `setFacilityData(null)` 호출

#### 2. 시설 정보가 없는 경우 처리 로직 (page.tsx:507-515)

```typescript
if (result.success && result.data) {
  const facilityApiData = result.data
  const transformedData: BusinessFacilityData = {
    // ... 변환 로직
  }
  setFacilityData(transformedData)
} else {
  setFacilityData(null)  // ❌ success가 true이지만 data가 비어있으면 null 설정
}
```

**문제**:
- API가 `success: true`를 반환하더라도 시설이 없으면 `facilities.discharge`와 `facilities.prevention`이 빈 배열
- 빈 배열을 변환하면 `discharge_facilities: []`, `prevention_facilities: []`가 되지만 여전히 유효한 데이터
- 하지만 조건문 구조상 `setFacilityData(null)` 호출 가능성

#### 3. 에러 처리 시 null 설정 (page.tsx:513-516)

```typescript
} catch (error) {
  console.error('사업장 시설 정보 로드 실패:', error)
  setFacilityData(null)  // ❌ 에러 발생 시 무조건 null
}
```

**문제**:
- 네트워크 오류, API 오류 등 발생 시 `facilityData`가 null로 설정
- 사용자에게는 "등록된 대기필증 정보가 없습니다" 메시지만 표시
- 실제 오류 원인을 알 수 없음

### 디버깅 필요 사항

1. **API 응답 확인**:
   - `console.log('API response:', result)` - 응답 구조 확인
   - `result.success`가 true인지 확인
   - `result.data`에 `facilities` 객체가 있는지 확인
   - `facilities.discharge`, `facilities.prevention` 배열이 비어있는지 확인

2. **변환 로직 확인**:
   - `console.log('Transformed data:', transformedData)` - 변환 결과 확인
   - `discharge_facilities`, `prevention_facilities` 배열이 올바르게 생성되는지 확인
   - `summary` 카운트가 정확한지 확인

3. **에러 확인**:
   - 브라우저 개발자 도구 콘솔에서 "사업장 시설 정보 로드 실패" 에러 확인
   - 네트워크 탭에서 API 호출 상태 코드 확인

## 해결 방안

### 방안 1: 로깅 강화 및 조건문 개선 (권장)

**장점**:
- 문제의 정확한 원인 파악 가능
- 디버깅이 용이해짐
- 사용자에게 더 명확한 피드백 제공

**구현**:

#### Step 1: 로깅 추가 (page.tsx:462-518)

```typescript
const loadBusinessFacilitiesWithDetails = useCallback(async (businessName: string) => {
  await loadBusinessFacilities(businessName)

  try {
    const encodedBusinessName = encodeURIComponent(businessName)
    console.log(`🔍 [FACILITY-LOAD] 사업장 시설 정보 조회: ${businessName}`)

    const response = await fetch(`/api/facilities-supabase/${encodedBusinessName}`)
    console.log(`📡 [FACILITY-LOAD] API 응답 상태:`, response.status, response.ok)

    if (response.ok) {
      const result = await response.json()
      console.log(`📊 [FACILITY-LOAD] API 응답 데이터:`, {
        success: result.success,
        hasData: !!result.data,
        hasFacilities: !!result.data?.facilities,
        dischargeCount: result.data?.facilities?.discharge?.length,
        preventionCount: result.data?.facilities?.prevention?.length
      })

      if (result.success && result.data && result.data.facilities) {
        const facilityApiData = result.data

        // ✅ 시설 데이터가 비어있는 경우에도 빈 배열로 변환
        const transformedData: BusinessFacilityData = {
          business: {
            id: facilityApiData.businessInfo?.businessName || businessName,
            business_name: businessName
          },
          discharge_facilities: (facilityApiData.facilities?.discharge || []).map((facility: any) => ({
            id: `discharge-${facility.outlet}-${facility.number}`,
            outlet_number: facility.outlet || 1,
            outlet_name: `배출구 ${facility.outlet || 1}`,
            facility_number: facility.number || 1,
            facility_name: facility.name || '배출시설',
            capacity: facility.capacity || '',
            quantity: facility.quantity || 1,
            display_name: facility.displayName || `배출구${facility.outlet}-배출시설${facility.number}`
          })),
          prevention_facilities: (facilityApiData.facilities?.prevention || []).map((facility: any) => ({
            id: `prevention-${facility.outlet}-${facility.number}`,
            outlet_number: facility.outlet || 1,
            outlet_name: `배출구 ${facility.outlet || 1}`,
            facility_number: facility.number || 1,
            facility_name: facility.name || '방지시설',
            capacity: facility.capacity || '',
            quantity: facility.quantity || 1,
            display_name: facility.displayName || `배출구${facility.outlet}-방지시설${facility.number}`
          })),
          summary: {
            discharge_count: facilityApiData.dischargeCount || 0,
            prevention_count: facilityApiData.preventionCount || 0,
            total_facilities: (facilityApiData.dischargeCount || 0) + (facilityApiData.preventionCount || 0)
          }
        }

        console.log(`✅ [FACILITY-LOAD] 변환 완료:`, {
          dischargeCount: transformedData.discharge_facilities.length,
          preventionCount: transformedData.prevention_facilities.length,
          totalFacilities: transformedData.summary.total_facilities
        })

        // ✅ 시설이 없어도 빈 데이터 객체로 설정 (null이 아님)
        setFacilityData(transformedData)
      } else {
        console.warn(`⚠️ [FACILITY-LOAD] API 응답 데이터 형식 오류:`, {
          success: result.success,
          hasData: !!result.data,
          hasFacilities: !!result.data?.facilities
        })
        setFacilityData(null)
      }
    } else {
      console.error(`❌ [FACILITY-LOAD] API 호출 실패:`, response.status)
      setFacilityData(null)
    }
  } catch (error) {
    console.error('❌ [FACILITY-LOAD] 사업장 시설 정보 로드 실패:', error)
    setFacilityData(null)
  }
}, [loadBusinessFacilities])
```

#### Step 2: BusinessDetailModal 조건 개선 (BusinessDetailModal.tsx:1002-1040)

```typescript
{/* Facility Information based on Air Permits */}
{facilityLoading ? (
  <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 text-center text-gray-500">
    <Settings className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-gray-300 mx-auto mb-2" />
    <div className="text-xs sm:text-sm">시설 정보를 불러오는 중...</div>
  </div>
) : facilityData && (facilityData.summary.total_facilities > 0 || facilityData.discharge_facilities.length > 0 || facilityData.prevention_facilities.length > 0) ? (
  <>
    {/* Facility Summary Card */}
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-blue-200 mb-3 sm:mb-4">
      <div className="text-xs sm:text-sm md:text-base font-semibold text-blue-700 mb-2 sm:mb-3">시설 정보 (대기필증 기준)</div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 text-center">
        <div>
          <div className="text-[10px] sm:text-xs md:text-sm text-blue-600 mb-1">배출시설</div>
          <div className="text-sm sm:text-lg md:text-xl font-bold text-blue-800">{facilityData.summary.discharge_count}</div>
        </div>
        <div>
          <div className="text-[10px] sm:text-xs md:text-sm text-blue-600 mb-1">방지시설</div>
          <div className="text-sm sm:text-lg md:text-xl font-bold text-blue-800">{facilityData.summary.prevention_count}</div>
        </div>
        <div>
          <div className="text-[10px] sm:text-xs md:text-sm text-blue-600 mb-1">배출구</div>
          <div className="text-sm sm:text-lg md:text-xl font-bold text-blue-900">
            {facilityData.discharge_facilities.concat(facilityData.prevention_facilities)
              .reduce((outlets, facility) => {
                const outletKey = facility.outlet_number;
                return outlets.includes(outletKey) ? outlets : [...outlets, outletKey];
              }, [] as number[]).length}
          </div>
        </div>
      </div>
    </div>
  </>
) : (
  <div className="bg-white rounded-lg p-4 sm:p-5 md:p-6 text-center text-gray-500">
    <Settings className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-gray-300 mx-auto mb-2" />
    <div className="text-xs sm:text-sm">등록된 대기필증 정보가 없습니다</div>
    <div className="text-[10px] sm:text-xs text-gray-400 mt-1">시설 정보를 확인하려면 먼저 대기필증을 등록하세요</div>
  </div>
)}
```

**변경점**:
- 기존: `facilityData ? ...` (null 체크만)
- 변경: `facilityData && (facilityData.summary.total_facilities > 0 || ...)` (데이터 존재 여부도 체크)
- 빈 데이터 객체와 실제 데이터 없음을 구분

### 방안 2: API 응답 구조 검증 강화

**장점**:
- 런타임 타입 안정성 향상
- 데이터 무결성 보장

**구현**:

```typescript
// Type guard for API response validation
function isValidFacilityApiData(data: any): data is {
  facilities: {
    discharge: Array<any>
    prevention: Array<any>
  }
  dischargeCount: number
  preventionCount: number
  businessInfo: any
} {
  return (
    data &&
    typeof data === 'object' &&
    data.facilities &&
    Array.isArray(data.facilities.discharge) &&
    Array.isArray(data.facilities.prevention) &&
    typeof data.dischargeCount === 'number' &&
    typeof data.preventionCount === 'number'
  )
}

// In loadBusinessFacilitiesWithDetails:
if (result.success && result.data) {
  if (isValidFacilityApiData(result.data)) {
    // 변환 로직
  } else {
    console.error('❌ [FACILITY-LOAD] 유효하지 않은 API 응답 구조:', result.data)
    setFacilityData(null)
  }
}
```

### 방안 3: 에러 상태 별도 관리

**장점**:
- 로딩/에러/빈 데이터 상태를 명확히 구분
- 사용자에게 더 정확한 피드백

**구현**:

```typescript
// State 추가
const [facilityError, setFacilityError] = useState<string | null>(null)

// loadBusinessFacilitiesWithDetails에서:
try {
  setFacilityError(null)
  // ... API 호출 및 변환
  setFacilityData(transformedData)
} catch (error) {
  setFacilityError(error instanceof Error ? error.message : '시설 정보 로드 실패')
  setFacilityData(null)
}

// BusinessDetailModal에서:
{facilityLoading ? (
  <div>로딩 중...</div>
) : facilityError ? (
  <div className="text-red-600">
    <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
    <div>오류: {facilityError}</div>
  </div>
) : facilityData && facilityData.summary.total_facilities > 0 ? (
  <div>시설 정보 표시</div>
) : (
  <div>등록된 대기필증 정보가 없습니다</div>
)}
```

## 권장 구현 순서

### Phase 1: 디버깅 및 로깅 강화
1. 방안 1의 로깅 코드 추가
2. 개발자 도구 콘솔에서 실제 데이터 흐름 확인
3. 문제의 정확한 원인 파악

### Phase 2: 조건문 개선
1. BusinessDetailModal의 조건문을 더 정교하게 수정
2. 빈 데이터와 데이터 없음을 구분

### Phase 3: (선택사항) 타입 안정성 강화
1. 방안 2의 타입 가드 추가
2. API 응답 구조 검증 강화

### Phase 4: (선택사항) UX 개선
1. 방안 3의 에러 상태 관리 추가
2. 사용자에게 더 명확한 피드백 제공

## 테스트 시나리오

### 시나리오 1: 정상 데이터 로드
1. 대기필증이 등록된 사업장 선택
2. 상세 모달 오픈
3. 기대: 시설 정보 정상 표시 (배출시설, 방지시설, 배출구 개수)

### 시나리오 2: 대기필증 미등록
1. 대기필증이 없는 사업장 선택
2. 상세 모달 오픈
3. 기대: "등록된 대기필증 정보가 없습니다" 메시지

### 시나리오 3: API 오류
1. 네트워크 차단 또는 서버 오류 시뮬레이션
2. 상세 모달 오픈
3. 기대: 에러 메시지 또는 로딩 실패 상태 표시

## 관련 파일

- [app/admin/business/page.tsx](app/admin/business/page.tsx:462-518) - 시설 정보 로드 로직
- [components/business/modals/BusinessDetailModal.tsx](components/business/modals/BusinessDetailModal.tsx:1002-1040) - 시설 정보 렌더링
- [app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts) - API 응답 구조
