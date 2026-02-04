# Fix: outlet_id Missing in POST API

## Date: 2026-02-04

## 문제 요약

방지시설 측정기기 데이터를 수정하고 저장하면 성공 메시지가 표시되지만, 페이지 새로고침 시 데이터가 사라지는 문제가 발생했습니다.

## 근본 원인 분석

### 데이터베이스 스키마 확인

**prevention_facilities 테이블** (실제 Production DB):
```sql
CREATE TABLE prevention_facilities (
  id UUID PRIMARY KEY,
  outlet_id UUID,  -- ✅ FK to discharge_outlets.id
  business_name TEXT,
  outlet_number INTEGER,
  facility_number INTEGER,
  facility_name VARCHAR NOT NULL,
  capacity VARCHAR,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  -- 측정기기 필드 (마이그레이션으로 추가됨)
  ph VARCHAR DEFAULT '0',
  pressure VARCHAR DEFAULT '0',
  temperature VARCHAR DEFAULT '0',
  pump VARCHAR DEFAULT '0',
  fan VARCHAR DEFAULT '0',
  remarks TEXT,
  ...
);
```

### GET API (조회) - 정상 동작

**File**: [app/api/facilities-supabase/[businessName]/route.ts:165-171](app/api/facilities-supabase/[businessName]/route.ts#L165-L171)

```sql
SELECT
  id, outlet_id, facility_name, capacity, quantity, facility_number,
  notes, ph, pressure, temperature, pump, fan, remarks,
  last_updated_at, last_updated_by
FROM prevention_facilities
WHERE outlet_id = ANY($1)  -- ✅ outlet_id 기준 조회
```

GET API는 `outlet_id` 기준으로 올바르게 조회하고 있었습니다.

### POST API (저장) - 문제 발생

**이전 코드**:
```sql
INSERT INTO prevention_facilities (
  business_name, outlet_number, facility_number, facility_name,
  capacity, quantity, notes, ph, pressure, temperature, pump, fan, remarks
) VALUES ...
```

**문제점**:
- ❌ `outlet_id`가 INSERT 컬럼에 **포함되지 않음**
- DB에 데이터가 저장되지만 `outlet_id`가 NULL
- GET API는 `WHERE outlet_id = ANY($1)` 조건으로 조회하므로, NULL인 행은 조회되지 않음

### 데이터 플로우 분석

```
사용자: 방지시설 측정기기 수정 (pH: 0 → 2)
  ↓
EnhancedFacilityInfoSection.handleSaveFacility 호출
  ↓
POST /api/facilities-supabase/[businessName]
  ↓
DELETE FROM prevention_facilities WHERE business_name = '사업장명'
  → 기존 데이터 삭제 성공
  ↓
INSERT INTO prevention_facilities (...) -- outlet_id 없이 INSERT
  → 새 행 생성되지만 outlet_id = NULL
  ↓
사용자: "저장 성공" 메시지 확인
  ↓
페이지 새로고침
  ↓
GET /api/facilities-supabase/[businessName]
  ↓
SELECT ... WHERE outlet_id = ANY([...])
  → outlet_id가 NULL인 행은 조회되지 않음
  ↓
UI에 이전 데이터 표시 (실제로는 빈 데이터)
```

## 해결 방법

### 1. outlet_number → outlet_id 매핑 로직 추가

**File**: [app/api/facilities-supabase/[businessName]/route.ts:664-705](app/api/facilities-supabase/[businessName]/route.ts#L664-L705)

```typescript
// 1. 사업장 정보 조회하여 business_id 획득
const business = await queryOne(
  'SELECT id FROM business_info WHERE business_name = $1',
  [businessName]
);

if (!business) {
  throw new Error(`사업장 "${businessName}"을 찾을 수 없습니다.`);
}

// 2. 대기필증 정보 조회
const airPermit = await queryOne(
  'SELECT id FROM air_permit_info WHERE business_id = $1 AND is_deleted = false ORDER BY created_at DESC LIMIT 1',
  [business.id]
);

if (!airPermit) {
  throw new Error(`사업장 "${businessName}"의 대기필증을 찾을 수 없습니다.`);
}

// 3. 배출구 정보 조회하여 outlet_number → outlet_id 매핑 생성
const outlets = await queryAll(
  'SELECT id, outlet_number FROM discharge_outlets WHERE air_permit_id = $1',
  [airPermit.id]
);

const outletNumberToId: { [key: number]: string } = {};
outlets?.forEach((outlet: any) => {
  outletNumberToId[outlet.outlet_number] = outlet.id;
});

console.log('🏭 [FACILITIES-SUPABASE] 배출구 매핑:', outletNumberToId);
```

### 2. 배출시설 INSERT 수정

**이전 코드**:
```typescript
discharge.forEach((facility: any) => {
  valueStrings.push(
    `($${paramIndex}, $${paramIndex + 1}, ..., $${paramIndex + 9})`  // 10개 파라미터
  );
  values.push(
    businessName,
    facility.outlet,
    facility.number,
    ...
  );
  paramIndex += 10;
});

const dischargeInsertQuery = `
  INSERT INTO discharge_facilities (
    business_name, outlet_number, facility_number, facility_name,
    capacity, quantity, notes, discharge_ct, exemption_reason, remarks
  ) VALUES ${valueStrings.join(', ')}
`;
```

**수정 후**:
```typescript
discharge.forEach((facility: any) => {
  const outletId = outletNumberToId[facility.outlet];
  if (!outletId) {
    console.warn(`⚠️ [FACILITIES-SUPABASE] 배출구 ${facility.outlet}에 대한 outlet_id를 찾을 수 없습니다.`);
    return;
  }

  valueStrings.push(
    `($${paramIndex}, $${paramIndex + 1}, ..., $${paramIndex + 10})`  // 11개 파라미터
  );
  values.push(
    outletId,  // ✅ outlet_id 추가
    businessName,
    facility.outlet,
    facility.number,
    ...
  );
  paramIndex += 11;  // 10 → 11로 변경
});

if (valueStrings.length > 0) {
  const dischargeInsertQuery = `
    INSERT INTO discharge_facilities (
      outlet_id, business_name, outlet_number, facility_number, facility_name,
      capacity, quantity, notes, discharge_ct, exemption_reason, remarks
    ) VALUES ${valueStrings.join(', ')}
  `;

  promises.push(pgQuery(dischargeInsertQuery, values));
}
```

### 3. 방지시설 INSERT 수정

**이전 코드**:
```typescript
prevention.forEach((facility: any) => {
  valueStrings.push(
    `($${paramIndex}, ..., $${paramIndex + 12})`  // 13개 파라미터
  );
  values.push(
    businessName,
    facility.outlet,
    facility.number,
    ...
  );
  paramIndex += 13;
});

const preventionInsertQuery = `
  INSERT INTO prevention_facilities (
    business_name, outlet_number, facility_number, facility_name,
    capacity, quantity, notes, ph, pressure, temperature, pump, fan, remarks
  ) VALUES ${valueStrings.join(', ')}
`;
```

**수정 후**:
```typescript
prevention.forEach((facility: any) => {
  const outletId = outletNumberToId[facility.outlet];
  if (!outletId) {
    console.warn(`⚠️ [FACILITIES-SUPABASE] 배출구 ${facility.outlet}에 대한 outlet_id를 찾을 수 없습니다.`);
    return;
  }

  valueStrings.push(
    `($${paramIndex}, ..., $${paramIndex + 13})`  // 14개 파라미터
  );
  values.push(
    outletId,  // ✅ outlet_id 추가
    businessName,
    facility.outlet,
    facility.number,
    ...
  );
  paramIndex += 14;  // 13 → 14로 변경
});

if (valueStrings.length > 0) {
  const preventionInsertQuery = `
    INSERT INTO prevention_facilities (
      outlet_id, business_name, outlet_number, facility_number, facility_name,
      capacity, quantity, notes, ph, pressure, temperature, pump, fan, remarks
    ) VALUES ${valueStrings.join(', ')}
  `;

  promises.push(pgQuery(preventionInsertQuery, values));
}
```

## 수정된 데이터 플로우

```
사용자: 방지시설 측정기기 수정 (pH: 0 → 2)
  ↓
EnhancedFacilityInfoSection.handleSaveFacility 호출
  ↓
POST /api/facilities-supabase/[businessName]
  ↓
1. business_name → business_id 조회
2. business_id → air_permit_id 조회
3. air_permit_id → outlet 정보 조회
4. outlet_number → outlet_id 매핑 생성 { 1: 'uuid-1', 2: 'uuid-2', ... }
  ↓
DELETE FROM prevention_facilities WHERE business_name = '사업장명'
  → 기존 데이터 삭제
  ↓
INSERT INTO prevention_facilities (
  outlet_id, business_name, outlet_number, ...  -- ✅ outlet_id 포함
) VALUES ('uuid-1', '사업장명', 1, ...)
  → outlet_id가 올바르게 저장됨
  ↓
사용자: "저장 성공" 메시지 확인
  ↓
페이지 새로고침
  ↓
GET /api/facilities-supabase/[businessName]
  ↓
SELECT ... WHERE outlet_id = ANY(['uuid-1', 'uuid-2', ...])
  → outlet_id가 올바르게 설정된 행 조회 성공
  ↓
UI에 최신 데이터 표시 (pH: 2) ✅
```

## 테스트 결과

### Build Test
```bash
npm run build
```
✅ **Result**: 88 pages successfully built, no TypeScript errors

### 예상 동작

1. **Business 페이지에서 측정기기 수정**:
   - 배출시설: 배출CT 개수 수정 (예: 2개 → 3개)
   - 방지시설: pH, 차압계 등 수정 (예: pH 0 → 2)

2. **저장 버튼 클릭**:
   - DB에 `outlet_id`와 함께 저장됨
   - 성공 메시지 표시

3. **페이지 새로고침**:
   - GET API가 `outlet_id` 기준으로 조회
   - 수정한 측정기기 데이터가 정확히 표시됨 ✅

4. **Admin 모달 확인**:
   - "시설 정보 (실사 기준)" 섹션에 최신 데이터 표시
   - 수량이 0인 항목은 필터링되어 표시되지 않음

## 관련 파일

### 수정된 파일

1. **[app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)**
   - Line 664-705: outlet_number → outlet_id 매핑 로직 추가
   - Line 723-760: 배출시설 INSERT에 outlet_id 추가
   - Line 762-801: 방지시설 INSERT에 outlet_id 추가

## 기술적 개선 사항

### outlet_id 매핑 로직
- outlet_number를 outlet_id(UUID)로 변환하는 딕셔너리 생성
- 존재하지 않는 배출구 번호에 대한 경고 로그 추가
- 빈 valueStrings 배열 처리로 SQL 오류 방지

### 에러 처리 강화
- business 조회 실패 시 명확한 에러 메시지
- air_permit 조회 실패 시 명확한 에러 메시지
- outlet_id 없는 시설은 건너뛰고 경고 로그 출력

### 데이터 일관성
- DELETE와 INSERT 모두 business_name 기준으로 동작
- outlet_id와 business_name 모두 저장하여 양쪽 조회 방식 지원

## 관련 문서

- [fix-db-schema-measurement-devices.md](fix-db-schema-measurement-devices.md) - 측정기기 컬럼 추가 마이그레이션
- [measurement-device-filtering-realtime-update.md](measurement-device-filtering-realtime-update.md) - 필터링 및 실시간 반영
- [admin-modal-measurement-device-fix.md](admin-modal-measurement-device-fix.md) - Admin 모달 표시 수정
