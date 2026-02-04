# Fix Measurement Device DB Save Issue

## Date: 2026-02-04

## 문제 요약

사용자가 "배출구별 시설 및 게이트웨이 정보"에서 측정기기 데이터를 수정하면:
1. **저장 성공 메시지**가 표시되지만
2. **실제로는 DB에 저장되지 않음**
3. **새로고침하면 이전 데이터**가 다시 로드됨

## 근본 원인 분석

### 문제 1: EnhancedFacilityInfoSection - DB 저장 API 미호출

**File**: [components/sections/EnhancedFacilityInfoSection.tsx:157-178](components/sections/EnhancedFacilityInfoSection.tsx#L157-L178)

**이전 코드**:
```typescript
const handleSaveFacility = async () => {
  if (!editingFacility) return;

  try {
    const updatedFacilities = { ...facilities };
    const facilityArray = facilityType === 'discharge'
      ? updatedFacilities.discharge
      : updatedFacilities.prevention;

    const index = facilityArray?.findIndex(f =>
      f.outlet === editingFacility.outlet && f.number === editingFacility.number
    );

    if (index !== -1 && facilityArray) {
      facilityArray[index] = editingFacility;
      onFacilitiesUpdate(updatedFacilities);  // ❌ 로컬 상태만 업데이트!
    }

    setShowAddForm(false);
    setEditingFacility(null);
  } catch (error) {
    console.error('시설 정보 저장 실패:', error);
  }
};
```

**문제점**:
- `onFacilitiesUpdate`로 React 상태만 업데이트
- **DB 저장 API를 전혀 호출하지 않음**
- 페이지 새로고침 시 DB의 이전 데이터가 다시 로드됨

### 문제 2: POST API - 측정기기 필드 누락

**File**: [app/api/facilities-supabase/[businessName]/route.ts:708-747](app/api/facilities-supabase/[businessName]/route.ts#L708-L747)

**배출시설 이전 INSERT 문**:
```sql
INSERT INTO discharge_facilities (
  business_name, outlet_number, facility_number, facility_name,
  capacity, quantity, notes  -- ❌ 측정기기 필드 없음!
) VALUES ...
```

**누락된 필드**:
- `discharge_ct` - 배출CT 개수
- `exemption_reason` - 면제사유
- `remarks` - 비고

**방지시설 이전 INSERT 문**:
```sql
INSERT INTO prevention_facilities (
  business_name, outlet_number, facility_number, facility_name,
  capacity, quantity, notes  -- ❌ 측정기기 필드 없음!
) VALUES ...
```

**누락된 필드**:
- `ph` - pH계 개수
- `pressure` - 차압계 개수
- `temperature` - 온도계 개수
- `pump` - 펌프CT 개수
- `fan` - 송풍CT 개수
- `remarks` - 비고

## 해결 방법

### 1. POST API 수정 - 측정기기 필드 추가

#### 배출시설 INSERT 문 수정

**File**: [app/api/facilities-supabase/[businessName]/route.ts:691-714](app/api/facilities-supabase/[businessName]/route.ts#L691-L714)

```typescript
discharge.forEach((facility: any) => {
  valueStrings.push(
    `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9})`
  );
  values.push(
    businessName,
    facility.outlet,
    facility.number,
    facility.name,
    facility.capacity,
    facility.quantity || 1,
    facility.notes || null,
    facility.dischargeCT || facility.discharge_ct || null,  // ✅ 추가
    facility.exemptionReason || facility.exemption_reason || null,  // ✅ 추가
    facility.remarks || null  // ✅ 추가
  );
  paramIndex += 10;  // 7 → 10으로 변경
});

const dischargeInsertQuery = `
  INSERT INTO discharge_facilities (
    business_name, outlet_number, facility_number, facility_name,
    capacity, quantity, notes, discharge_ct, exemption_reason, remarks  // ✅ 추가
  ) VALUES ${valueStrings.join(', ')}
`;
```

**변경 사항**:
- `discharge_ct`, `exemption_reason`, `remarks` 컬럼 추가
- camelCase와 snake_case 모두 지원 (`facility.dischargeCT || facility.discharge_ct`)
- `paramIndex` 증가값 7 → 10으로 변경

#### 방지시설 INSERT 문 수정

**File**: [app/api/facilities-supabase/[businessName]/route.ts:726-749](app/api/facilities-supabase/[businessName]/route.ts#L726-L749)

```typescript
prevention.forEach((facility: any) => {
  valueStrings.push(
    `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11}, $${paramIndex + 12})`
  );
  values.push(
    businessName,
    facility.outlet,
    facility.number,
    facility.name,
    facility.capacity,
    facility.quantity || 1,
    facility.notes || null,
    facility.ph || facility.ph_meter || null,  // ✅ 추가
    facility.pressure || facility.differential_pressure_meter || null,  // ✅ 추가
    facility.temperature || facility.temperature_meter || null,  // ✅ 추가
    facility.pump || facility.pump_ct || null,  // ✅ 추가
    facility.fan || facility.fan_ct || null,  // ✅ 추가
    facility.remarks || null  // ✅ 추가
  );
  paramIndex += 13;  // 7 → 13으로 변경
});

const preventionInsertQuery = `
  INSERT INTO prevention_facilities (
    business_name, outlet_number, facility_number, facility_name,
    capacity, quantity, notes, ph, pressure, temperature, pump, fan, remarks  // ✅ 추가
  ) VALUES ${valueStrings.join(', ')}
`;
```

**변경 사항**:
- `ph`, `pressure`, `temperature`, `pump`, `fan`, `remarks` 컬럼 추가
- 이중 필드명 지원 (예: `facility.ph || facility.ph_meter`)
- `paramIndex` 증가값 7 → 13으로 변경

### 2. EnhancedFacilityInfoSection 수정 - DB 저장 API 호출 추가

**File**: [components/sections/EnhancedFacilityInfoSection.tsx:157-195](components/sections/EnhancedFacilityInfoSection.tsx#L157-L195)

```typescript
const handleSaveFacility = async () => {
  if (!editingFacility) return;

  try {
    const updatedFacilities = { ...facilities };
    const facilityArray = facilityType === 'discharge'
      ? updatedFacilities.discharge
      : updatedFacilities.prevention;

    const index = facilityArray?.findIndex(f =>
      f.outlet === editingFacility.outlet && f.number === editingFacility.number
    );

    if (index !== -1 && facilityArray) {
      facilityArray[index] = editingFacility;

      // 🔄 DB에 저장 (추가됨!)
      console.log('💾 [EnhancedFacilityInfoSection] DB 저장 시작:', businessName);
      const response = await fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discharge: updatedFacilities.discharge,
          prevention: updatedFacilities.prevention
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ [EnhancedFacilityInfoSection] DB 저장 성공');
        onFacilitiesUpdate(updatedFacilities);
      } else {
        console.error('❌ [EnhancedFacilityInfoSection] DB 저장 실패:', result.error);
        alert('저장 실패: ' + (result.error || '알 수 없는 오류'));
        return;
      }
    }

    setShowAddForm(false);
    setEditingFacility(null);
  } catch (error) {
    console.error('❌ [EnhancedFacilityInfoSection] 시설 정보 저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};
```

**변경 사항**:
- POST API 호출 추가 (`/api/facilities-supabase/${businessName}`)
- 전체 시설 데이터 전송 (discharge + prevention)
- 성공/실패 처리 로직 추가
- 에러 발생 시 사용자에게 alert 표시

## 데이터 흐름

### Before (수정 전)
```
사용자: 배출CT 수정 (2개 → 3개)
  ↓
handleSaveFacility 호출
  ↓
onFacilitiesUpdate (React 상태만 업데이트) ❌
  ↓
모달 닫힘 (DB 저장 없음)
  ↓
새로고침
  ↓
DB에서 이전 데이터(2개) 로드
  ↓
UI에 2개 표시 ❌
```

### After (수정 후)
```
사용자: 배출CT 수정 (2개 → 3개)
  ↓
handleSaveFacility 호출
  ↓
POST /api/facilities-supabase/[businessName] 호출 ✅
  ↓
DB INSERT (discharge_ct = 3) ✅
  ↓
응답 성공
  ↓
onFacilitiesUpdate (React 상태 업데이트)
  ↓
모달 닫힘
  ↓
새로고침
  ↓
DB에서 최신 데이터(3개) 로드 ✅
  ↓
UI에 3개 표시 ✅
```

## 테스트 결과

### Build Test
```bash
npm run build
```
✅ **Result**: 88 pages successfully built, no TypeScript errors

### 예상 동작

1. **Business 페이지에서 측정기기 수정**:
   - 배출시설: 배출CT 개수 수정
   - 방지시설: pH계, 차압계 등 수정

2. **저장 버튼 클릭**:
   - DB에 실제로 저장됨
   - 성공 시: 모달 닫힘
   - 실패 시: 에러 메시지 표시

3. **새로고침 또는 페이지 재방문**:
   - DB에서 최신 데이터 로드
   - 수정한 측정기기 수량이 정확히 표시됨

4. **Admin 모달에서도 확인**:
   - "시설 정보 (실사 기준)" 섹션에 최신 데이터 표시
   - 수량이 0인 항목은 필터링되어 표시되지 않음

## 관련 파일

### 수정된 파일

1. **[app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)**
   - Line 691-714: 배출시설 INSERT 문에 측정기기 필드 추가
   - Line 726-749: 방지시설 INSERT 문에 측정기기 필드 추가

2. **[components/sections/EnhancedFacilityInfoSection.tsx](components/sections/EnhancedFacilityInfoSection.tsx)**
   - Line 157-195: handleSaveFacility에 DB 저장 API 호출 추가

## 기술적 개선 사항

### 이중 필드명 지원
API가 camelCase와 snake_case 모두 지원하여 다양한 소스에서 데이터를 받을 수 있음:
```typescript
facility.dischargeCT || facility.discharge_ct || null
facility.ph || facility.ph_meter || null
```

### 에러 처리 강화
- API 응답 검증
- 사용자에게 명확한 에러 메시지 표시
- 콘솔 로깅으로 디버깅 지원

### 전체 데이터 전송
개별 시설이 아닌 전체 시설 데이터를 전송하여 일관성 보장

## 관련 문서

- [measurement-device-filtering-realtime-update.md](measurement-device-filtering-realtime-update.md) - 조건부 렌더링 및 실시간 반영
- [admin-modal-measurement-device-fix.md](admin-modal-measurement-device-fix.md) - Admin 모달 표시 문제 해결
- [fix-measurement-device-display.md](fix-measurement-device-display.md) - API 이중 필드명 전략
