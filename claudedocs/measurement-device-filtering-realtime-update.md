# Measurement Device Filtering & Real-time Update Implementation

## Date: 2026-02-04

## 구현 요약

Admin Business Detail Modal의 "시설 정보 (실사 기준)" 섹션에 두 가지 개선사항을 구현했습니다:
1. **수량이 있는 측정기기만 표시** - 공간 효율성 향상
2. **실시간 데이터 반영** - 모달 열릴 때마다 최신 시설 데이터 자동 로드

## Phase 1: 조건부 렌더링 구현

### 문제
- 수량이 0이거나 없는 측정기기가 모두 표시되어 공간 활용도 저하
- 예: "PH센서: 0개", "차압계: 0개" 등 불필요한 항목 표시

### 해결 방법

#### 배출시설 측정기기 필터링
**File**: [components/business/modals/BusinessDetailModal.tsx:1074-1081](components/business/modals/BusinessDetailModal.tsx#L1074-L1081)

```typescript
{f.discharge_ct && Number(f.discharge_ct) > 0 && (
  <div className="text-gray-600 mt-1">
    <span className="font-medium text-orange-700">측정기기:</span>
    <div className="ml-2 mt-0.5">
      • 배출CT: {f.discharge_ct}개
    </div>
  </div>
)}
```

**개선**: `f.discharge_ct && Number(f.discharge_ct) > 0` 조건으로 수량이 실제로 존재하고 0보다 큰 경우만 표시

#### 방지시설 측정기기 필터링
**File**: [components/business/modals/BusinessDetailModal.tsx:1104-1126](components/business/modals/BusinessDetailModal.tsx#L1104-L1126)

```typescript
{(() => {
  const hasMeasurementDevices =
    (f.ph_meter && Number(f.ph_meter) > 0) ||
    (f.differential_pressure_meter && Number(f.differential_pressure_meter) > 0) ||
    (f.temperature_meter && Number(f.temperature_meter) > 0) ||
    (f.pump_ct && Number(f.pump_ct) > 0) ||
    (f.fan_ct && Number(f.fan_ct) > 0);

  return hasMeasurementDevices && (
    <div className="text-gray-600 mt-1">
      <span className="font-medium text-cyan-700">측정기기:</span>
      <div className="ml-2 mt-0.5 space-y-0.5">
        {f.ph_meter && Number(f.ph_meter) > 0 && <div>• PH센서: {f.ph_meter}개</div>}
        {f.differential_pressure_meter && Number(f.differential_pressure_meter) > 0 && <div>• 차압계: {f.differential_pressure_meter}개</div>}
        {f.temperature_meter && Number(f.temperature_meter) > 0 && <div>• 온도계: {f.temperature_meter}개</div>}
        {f.pump_ct && Number(f.pump_ct) > 0 && <div>• 펌프CT: {f.pump_ct}개</div>}
        {f.fan_ct && Number(f.fan_ct) > 0 && <div>• 송풍CT: {f.fan_ct}개</div>}
      </div>
    </div>
  );
})()}
```

**개선**:
1. `hasMeasurementDevices` 변수로 측정기기가 하나라도 있는지 확인
2. 측정기기가 있는 경우에만 "측정기기:" 섹션 표시
3. 각 항목도 수량이 0보다 큰 경우만 개별 표시

### 결과

**Before**:
```
측정기기:
• PH센서: 2개
• 차압계: 0개      ← 불필요
• 온도계: 1개
• 펌프CT: 0개      ← 불필요
• 송풍CT: 0개      ← 불필요
```

**After**:
```
측정기기:
• PH센서: 2개
• 온도계: 1개
(공간 효율성 ↑)
```

## Phase 2: 실시간 데이터 반영 구현

### 문제
- Business 페이지에서 시설 정보를 수정해도 Admin 모달에 즉시 반영되지 않음
- 수동으로 페이지를 새로고침해야 최신 데이터 확인 가능

### 해결 방법

#### 1. handleFacilityUpdate 핸들러 추가
**File**: [app/admin/business/page.tsx:462-521](app/admin/business/page.tsx#L462-L521)

```typescript
// 🔄 시설 데이터 실시간 업데이트 핸들러
const handleFacilityUpdate = useCallback(async (businessName: string) => {
  try {
    console.log('🔄 [handleFacilityUpdate] 시설 데이터 업데이트 시작:', businessName);

    // API에서 최신 시설 데이터 가져오기
    const response = await fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch facility data');
    }

    const facilityApiData = await response.json();

    // facilityData 상태 업데이트 (측정기기 필드 포함)
    const transformedData: BusinessFacilityData = {
      business: { /* ... */ },
      discharge_facilities: (facilityApiData.facilities?.discharge || []).map((facility: any) => ({
        // ... 기본 필드
        discharge_ct: facility.discharge_ct,
        exemption_reason: facility.exemption_reason,
        remarks: facility.remarks
      })),
      prevention_facilities: (facilityApiData.facilities?.prevention || []).map((facility: any) => ({
        // ... 기본 필드
        ph_meter: facility.ph_meter,
        differential_pressure_meter: facility.differential_pressure_meter,
        temperature_meter: facility.temperature_meter,
        pump_ct: facility.pump_ct,
        fan_ct: facility.fan_ct,
        remarks: facility.remarks
      })),
      summary: { /* ... */ }
    };

    setFacilityData(transformedData);
    console.log('✅ [handleFacilityUpdate] facilityData 업데이트 완료');

  } catch (error) {
    console.error('❌ [handleFacilityUpdate] 시설 데이터 업데이트 실패:', error);
  }
}, []);
```

#### 2. BusinessDetailModal에 prop 전달
**File**: [app/admin/business/page.tsx:4561](app/admin/business/page.tsx#L4561)

```typescript
<BusinessDetailModal
  // ... 기존 props
  onFacilityUpdate={handleFacilityUpdate}
/>
```

#### 3. BusinessDetailModal에서 prop 받기
**File**: [components/business/modals/BusinessDetailModal.tsx:278-279](components/business/modals/BusinessDetailModal.tsx#L278-L279)

```typescript
interface BusinessDetailModalProps {
  // ... 기존 props
  // 실시간 업데이트 핸들러
  onFacilityUpdate?: (businessName: string) => void
}
```

### 자동 실시간 반영 메커니즘

기존 코드 분석 결과, **모달이 열릴 때마다 자동으로 최신 데이터를 가져오는 로직이 이미 구현**되어 있습니다:

**File**: [app/admin/business/page.tsx:2627-2680](app/admin/business/page.tsx#L2627-L2680)

```typescript
const openDetailModal = async (business: UnifiedBusinessInfo) => {
  try {
    // 기본 데이터로 먼저 모달 열기
    setSelectedBusiness(business)
    setIsDetailModalOpen(true)

    // ✅ 시설 정보 로딩 (대기필증 기준)
    if (business.사업장명) {
      await loadBusinessFacilitiesWithDetails(business.사업장명)  // 👈 최신 데이터 자동 로드
    }

    // 백그라운드에서 최신 데이터 조회
    if (business.id && business.사업장명) {
      const refreshedBusiness = await refreshBusinessData(business.id, business.사업장명)
      if (refreshedBusiness) {
        setSelectedBusiness(refreshedBusiness)  // 👈 최신 사업장 데이터로 업데이트
      }
    }

    // ... 기타 데이터 로딩
  } catch (error) {
    console.error('❌ 모달 열기 오류:', error)
  }
}
```

**`loadBusinessFacilitiesWithDetails` 함수**:
**File**: [app/admin/business/page.tsx:528-588](app/admin/business/page.tsx#L528-L588)

```typescript
const loadBusinessFacilitiesWithDetails = useCallback(async (businessName: string) => {
  await loadBusinessFacilities(businessName)

  try {
    const response = await fetch(`/api/facilities-supabase/${encodedBusinessName}`)

    if (response.ok) {
      const result = await response.json()
      const facilityApiData = result.data

      // ✅ 시설 데이터 변환 및 측정기기 필드 포함
      const transformedData: BusinessFacilityData = {
        // ... discharge_facilities with discharge_ct, exemption_reason, remarks
        // ... prevention_facilities with ph_meter, differential_pressure_meter, etc.
      }

      setFacilityData(transformedData)  // 👈 최신 facilityData 업데이트
    }
  } catch (error) {
    console.error('시설 정보 변환 오류:', error)
  }
}, [loadBusinessFacilities])
```

### 실시간 반영 동작 방식

1. **Business 페이지에서 시설 정보 수정**
   - 사용자가 EnhancedFacilityInfoSection에서 시설 정보 수정
   - 수정 내용이 Supabase DB에 저장됨

2. **Admin 페이지로 돌아와서 모달 열기**
   - `openDetailModal` 함수 호출
   - `loadBusinessFacilitiesWithDetails` 자동 실행
   - API에서 최신 DB 데이터 조회
   - `facilityData` 상태 자동 업데이트

3. **모달에 최신 데이터 표시**
   - BusinessDetailModal이 업데이트된 `facilityData` prop 받음
   - "시설 정보 (실사 기준)" 섹션에 최신 측정기기 수량 표시

### 결과

```
Business 페이지: 배출CT 2개 → 3개로 수정 후 저장
  ↓
Admin 페이지: 사업장 클릭하여 상세 모달 열기
  ↓
openDetailModal 자동 실행
  ↓
loadBusinessFacilitiesWithDetails 호출
  ↓
API에서 최신 데이터 조회
  ↓
facilityData 업데이트
  ↓
모달에 "배출CT: 3개" 즉시 표시 ✅
```

## 파일 수정 내역

### 1. [components/business/modals/BusinessDetailModal.tsx](components/business/modals/BusinessDetailModal.tsx)
- **Line 1074-1081**: 배출시설 측정기기 조건부 렌더링 (`Number(f.discharge_ct) > 0`)
- **Line 1104-1126**: 방지시설 측정기기 조건부 렌더링 (`hasMeasurementDevices` 체크)
- **Line 278-279**: `onFacilityUpdate` prop 타입 정의 추가
- **Line 309**: `onFacilityUpdate` prop 구조 분해 추가

### 2. [app/admin/business/page.tsx](app/admin/business/page.tsx)
- **Line 462-521**: `handleFacilityUpdate` 핸들러 구현
- **Line 4561**: BusinessDetailModal에 `onFacilityUpdate` prop 전달

## 테스트 결과

### Build Test
```bash
npm run build
```
✅ **Result**: 88 pages successfully built, no TypeScript errors

### 예상 동작

#### 측정기기 필터링
1. 수량이 0인 측정기기는 표시되지 않음
2. 측정기기가 하나도 없는 시설은 "측정기기:" 섹션 자체가 표시되지 않음
3. 공간 효율성 향상으로 UI 깔끔하게 개선

#### 실시간 데이터 반영
1. Business 페이지에서 시설 정보 수정
2. Admin 페이지로 돌아와서 상세 모달 열기
3. 모달에 즉시 최신 측정기기 수량 반영됨
4. 별도의 새로고침 없이 자동 업데이트

## 기술적 개선 사항

### 조건부 렌더링 최적화
- `Number()` 함수로 명시적 타입 변환하여 falsy 값 처리 개선
- IIFE(즉시 실행 함수)로 복잡한 조건 로직 캡슐화
- 각 측정기기별 개별 조건 체크로 정확한 필터링

### 실시간 반영 아키텍처
- `useCallback`으로 핸들러 메모이제이션
- 기존 `loadBusinessFacilitiesWithDetails` 활용으로 중복 코드 방지
- 모달 열릴 때마다 자동 갱신으로 사용자 경험 개선

## 관련 문서

- [admin-modal-measurement-device-fix.md](admin-modal-measurement-device-fix.md) - 측정기기 필드 누락 문제 해결
- [fix-measurement-device-display.md](fix-measurement-device-display.md) - API 이중 필드명 전략
