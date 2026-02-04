# Database Schema Fix: Measurement Device Columns

## Date: 2026-02-04

## Problem Summary

측정기기 데이터를 저장하면 성공 메시지가 표시되지만, 페이지 새로고침 시 데이터가 사라지는 문제가 발생했습니다.

## Root Cause

**Database Schema Mismatch**:
- POST API의 INSERT 문은 측정기기 컬럼을 포함하지만
- `discharge_facilities`와 `prevention_facilities` 테이블에 해당 컬럼이 존재하지 않음
- INSERT 실행 시 SQL 오류 발생하여 데이터가 저장되지 않음

## Investigation Process

### 1. Initial Symptoms
- 사용자가 "배출구별 시설 및 게이트웨이 정보"에서 측정기기 데이터 수정
- "저장 성공" 메시지 표시
- 페이지 새로고침 시 수정 전 데이터로 되돌아감

### 2. Code Analysis
**File**: [app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)

INSERT 문에 측정기기 필드 포함 (Line 691-714, 726-749):
```sql
-- discharge_facilities INSERT
INSERT INTO discharge_facilities (
  business_name, outlet_number, facility_number, facility_name,
  capacity, quantity, notes, discharge_ct, exemption_reason, remarks
) VALUES ...

-- prevention_facilities INSERT
INSERT INTO prevention_facilities (
  business_name, outlet_number, facility_number, facility_name,
  capacity, quantity, notes, ph, pressure, temperature, pump, fan, remarks
) VALUES ...
```

### 3. Database Schema Investigation

**File**: [sql/create_facilities_tables.sql](sql/create_facilities_tables.sql)

실제 테이블 스키마 (Line 2-37):
```sql
CREATE TABLE discharge_facilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL,
  outlet_number INTEGER NOT NULL,
  facility_number INTEGER NOT NULL,
  facility_name TEXT NOT NULL,
  capacity TEXT,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  -- ❌ 측정기기 컬럼 없음!
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE prevention_facilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL,
  outlet_number INTEGER NOT NULL,
  facility_number INTEGER NOT NULL,
  facility_name TEXT NOT NULL,
  capacity TEXT,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  -- ❌ 측정기기 컬럼 없음!
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. Migration Script Investigation

**File**: [sql/add_facility_measurement_columns.sql](sql/add_facility_measurement_columns.sql)

이 스크립트는 `outlets_facilities` 테이블에 컬럼을 추가했지만, POST API는 `discharge_facilities`와 `prevention_facilities`를 사용합니다.

## Solution

### New Migration Script

**File**: [sql/add_measurement_device_columns.sql](sql/add_measurement_device_columns.sql)

올바른 테이블에 측정기기 컬럼을 추가하는 새로운 마이그레이션을 생성했습니다.

#### discharge_facilities 테이블에 추가된 컬럼
- `discharge_ct` (INTEGER) - 배출CT 개수
- `exemption_reason` (TEXT) - 면제사유
- `remarks` (TEXT) - 비고

#### prevention_facilities 테이블에 추가된 컬럼
- `ph` (INTEGER) - pH계 개수
- `pressure` (INTEGER) - 차압계 개수
- `temperature` (INTEGER) - 온도계 개수
- `pump` (INTEGER) - 펌프CT 개수
- `fan` (INTEGER) - 송풍CT 개수
- `remarks` (TEXT) - 비고

## Execution Instructions

### Supabase SQL Editor에서 실행

1. Supabase Dashboard 접속
2. SQL Editor 열기
3. [sql/add_measurement_device_columns.sql](sql/add_measurement_device_columns.sql) 파일 내용 복사
4. SQL Editor에 붙여넣기
5. 실행 (Run)
6. 성공 메시지 확인:
   ```
   ✅ discharge_facilities 테이블에 측정기기 컬럼 추가 완료
   ✅ prevention_facilities 테이블에 측정기기 컬럼 추가 완료
   ```

### Verification Queries

마이그레이션 후 검증:

```sql
-- discharge_facilities 컬럼 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'discharge_facilities'
  AND column_name IN ('discharge_ct', 'exemption_reason', 'remarks');

-- prevention_facilities 컬럼 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'prevention_facilities'
  AND column_name IN ('ph', 'pressure', 'temperature', 'pump', 'fan', 'remarks');
```

## Expected Results After Migration

### 1. 데이터 저장 성공
- 사용자가 측정기기 데이터 수정
- DB에 실제로 저장됨
- INSERT 문이 SQL 오류 없이 성공적으로 실행됨

### 2. 데이터 영속성
- 페이지 새로고침 시 수정한 데이터 유지됨
- 강제 새로고침 (Ctrl+Shift+R) 후에도 데이터 유지됨

### 3. Admin 모달 반영
- Business 페이지에서 수정한 측정기기 데이터가
- Admin 모달 "시설 정보 (실사 기준)" 섹션에 정확히 표시됨

## Data Flow (After Fix)

```
사용자: 배출CT 수정 (2개 → 3개)
  ↓
EnhancedFacilityInfoSection.handleSaveFacility 호출
  ↓
POST /api/facilities-supabase/[businessName]
  ↓
INSERT INTO discharge_facilities (
  ..., discharge_ct, exemption_reason, remarks  -- ✅ 컬럼 존재
) VALUES (..., 3, NULL, NULL)  -- ✅ 저장 성공
  ↓
DB에 데이터 영구 저장
  ↓
페이지 새로고침
  ↓
GET /api/facilities-supabase/[businessName]
  ↓
SELECT * FROM discharge_facilities WHERE ...
  ↓
discharge_ct = 3 반환  -- ✅ 저장된 데이터 로드
  ↓
UI에 3개 표시  -- ✅ 데이터 영속성 확보
```

## Related Files

### Modified Files (Previous Sessions)
1. [components/business/modals/BusinessDetailModal.tsx](components/business/modals/BusinessDetailModal.tsx)
   - Line 1074-1081: 배출시설 조건부 렌더링
   - Line 1104-1126: 방지시설 조건부 렌더링

2. [app/admin/business/page.tsx](app/admin/business/page.tsx)
   - Line 462-521: handleFacilityUpdate 함수
   - Line 4561: onFacilityUpdate prop 전달

3. [app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)
   - Line 691-714: discharge INSERT 문 수정
   - Line 726-749: prevention INSERT 문 수정

4. [components/sections/EnhancedFacilityInfoSection.tsx](components/sections/EnhancedFacilityInfoSection.tsx)
   - Line 157-195: handleSaveFacility DB 저장 로직 추가

### New Files (This Session)
1. [sql/add_measurement_device_columns.sql](sql/add_measurement_device_columns.sql)
   - 측정기기 컬럼 추가 마이그레이션 스크립트

## Testing Checklist

마이그레이션 실행 후 테스트:

- [ ] SQL 마이그레이션 실행 성공
- [ ] discharge_facilities 테이블에 새 컬럼 존재 확인
- [ ] prevention_facilities 테이블에 새 컬럼 존재 확인
- [ ] Business 페이지에서 측정기기 데이터 수정
- [ ] 저장 성공 메시지 확인
- [ ] 페이지 새로고침 후 수정한 데이터 유지 확인
- [ ] Admin 모달에서 최신 데이터 표시 확인
- [ ] 수량이 0인 측정기기는 표시되지 않는지 확인

## Related Documentation

- [fix-measurement-device-db-save.md](fix-measurement-device-db-save.md) - 이전 저장 문제 분석
- [measurement-device-filtering-realtime-update.md](measurement-device-filtering-realtime-update.md) - 필터링 및 실시간 반영
- [admin-modal-measurement-device-fix.md](admin-modal-measurement-device-fix.md) - Admin 모달 표시 수정

## Migration History

1. **Initial Schema**: [sql/create_facilities_tables.sql](sql/create_facilities_tables.sql) - 기본 시설 테이블 생성 (측정기기 컬럼 없음)
2. **Wrong Table Migration**: [sql/add_facility_measurement_columns.sql](sql/add_facility_measurement_columns.sql) - outlets_facilities에 컬럼 추가 (잘못된 테이블)
3. **Correct Migration**: [sql/add_measurement_device_columns.sql](sql/add_measurement_device_columns.sql) - discharge_facilities와 prevention_facilities에 컬럼 추가 ✅

## Notes

- 이 마이그레이션은 **idempotent**합니다 (`IF NOT EXISTS` 사용)
- 여러 번 실행해도 안전합니다
- 기존 데이터에 영향을 주지 않습니다
- 새로운 컬럼의 기본값은 `NULL`입니다
