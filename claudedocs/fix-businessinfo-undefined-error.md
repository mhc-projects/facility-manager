# Fix: businessInfo is not defined Error

## 문제 상황 (Problem)

**날짜**: 2025-02-04
**발견 위치**: `business/[사업장명]` 페이지에서 "측정기기 수량 체크" 섹션 클릭 시
**에러 메시지**: `ReferenceError: businessInfo is not defined`
**에러 위치**: `EnhancedFacilityInfoSection.tsx:899:47`

### 에러 발생 원인

Phase 2에서 `EquipmentFieldCheckSection` 컴포넌트를 추가하면서:
```tsx
<EquipmentFieldCheckSection
  businessId={businessId}
  businessName={businessName}
  businessInfo={businessInfo}  // ❌ 이 prop이 정의되지 않음!
  facilityNumbering={facilityNumbering}
/>
```

`EnhancedFacilityInfoSection` 컴포넌트가 `businessInfo` prop을 받지 않았기 때문에 런타임 에러 발생.

## 해결 방법 (Solution)

### 1. TypeScript 인터페이스 업데이트

#### `/types/index.ts`
```typescript
export interface BusinessInfo {
  // ... 기존 필드들 ...

  // 현장 확인 데이터 (사무실 관리 데이터)
  discharge_flowmeter?: number;  // 배출전류계 수량
  supply_flowmeter?: number;     // 송풍전류계 수량

  // ... 나머지 필드들 ...
}
```

#### `/components/sections/EnhancedFacilityInfoSection.tsx`
```typescript
interface EnhancedFacilityInfoSectionProps {
  businessName: string;
  businessId?: string;
  businessInfo?: {
    discharge_flowmeter?: number;
    supply_flowmeter?: number;
  };  // ✅ 추가
  facilities: FacilitiesData;
  facilityNumbering?: any;
  systemType: 'completion' | 'presurvey';
  onFacilitiesUpdate: (facilities: FacilitiesData) => void;
}
```

### 2. Props 전달 체인 수정

#### `/app/business/[businessName]/BusinessContent.tsx`
```typescript
<EnhancedFacilityInfoSection
  businessName={businessName}
  businessId={businessInfo?.id}
  businessInfo={businessInfo ? {
    discharge_flowmeter: businessInfo.discharge_flowmeter,
    supply_flowmeter: businessInfo.supply_flowmeter
  } : undefined}  // ✅ businessInfo 전달
  facilities={facilities}
  facilityNumbering={facilityNumbering}
  systemType={systemType}
  onFacilitiesUpdate={setFacilities}
/>
```

### 3. 데이터베이스 스키마 업데이트

#### 신규 SQL 파일: `/sql/add_equipment_flowmeter_columns.sql`

```sql
-- businesses 테이블에 현장 확인 데이터 컬럼 추가

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS discharge_flowmeter INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS supply_flowmeter INTEGER DEFAULT 0;

COMMENT ON COLUMN businesses.discharge_flowmeter IS '배출전류계 수량 (사무실 관리 데이터)';
COMMENT ON COLUMN businesses.supply_flowmeter IS '송풍전류계 수량 (사무실 관리 데이터)';

CREATE INDEX IF NOT EXISTS idx_businesses_equipment_flowmeters
ON businesses(discharge_flowmeter, supply_flowmeter);
```

## 데이터 흐름 (Data Flow)

### 3-Layer 데이터 구조
```
1️⃣ 대기필증 데이터 (Layer 1: Official Document)
   - facilityNumbering.dischargeCount
   - facilityNumbering.preventionCount
   ↓

2️⃣ 사무실 관리 데이터 (Layer 2: Office Management)
   - businessInfo.discharge_flowmeter  ← 🆕 추가된 필드
   - businessInfo.supply_flowmeter     ← 🆕 추가된 필드
   ↓

3️⃣ 현장 확인 데이터 (Layer 3: Field Check)
   - equipment_field_checks 테이블
   - fieldCheck.discharge_flowmeter
   - fieldCheck.supply_flowmeter
```

### Sync 프로세스
```
현장 확인 입력 → equipment_field_checks 저장
     ↓
Admin 검토 및 승인
     ↓
Sync 버튼 클릭 → PUT /api/equipment-field-checks/sync/[checkId]
     ↓
businesses.discharge_flowmeter 업데이트 ✅
businesses.supply_flowmeter 업데이트 ✅
```

## 테스트 시나리오

### ✅ 정상 동작 확인
1. `business/[사업장명]` 페이지 접속
2. "측정기기 수량 체크" 섹션 클릭
3. **에러 없이** EquipmentFieldCheckSection 컴포넌트 렌더링
4. 대기필증 데이터, 사무실 데이터, 현장 확인 입력 폼이 모두 표시됨

### 🗄️ 데이터베이스 마이그레이션 필요
```bash
# Supabase SQL Editor 또는 psql에서 실행
psql -h [host] -U [user] -d [database] -f sql/add_equipment_flowmeter_columns.sql
```

## 빌드 테스트 결과

```bash
npm run build
```

**결과**: ✅ **성공**
- TypeScript 컴파일 성공
- 88개 페이지 정적 생성 완료
- ⚠️ 기존 경고만 있음 (신규 코드와 무관)

## 변경 파일 목록

### 수정된 파일
1. `/types/index.ts` - BusinessInfo 인터페이스에 필드 추가
2. `/components/sections/EnhancedFacilityInfoSection.tsx` - Props 인터페이스 및 함수 시그니처 업데이트
3. `/app/business/[businessName]/BusinessContent.tsx` - businessInfo prop 전달 (2곳)

### 신규 파일
4. `/sql/add_equipment_flowmeter_columns.sql` - 데이터베이스 스키마 마이그레이션

## 다음 단계 (Next Steps)

### 즉시 실행 필요
- [ ] 데이터베이스 마이그레이션 실행:
  - `sql/equipment_field_checks_table.sql` (Phase 1)
  - `sql/add_equipment_flowmeter_columns.sql` (신규)

### 테스트 필요
- [ ] business 페이지에서 측정기기 수량 체크 섹션 정상 동작 확인
- [ ] Admin 페이지에서 현장 확인 데이터 조회 확인
- [ ] Sync 기능으로 businesses 테이블 업데이트 확인

## 관련 문서
- [Phase 1 구현 완료](./field-check-system-implementation-complete.md#phase-1)
- [Phase 2 구현 완료](./phase2-implementation-summary.md)
- [Phase 3 구현 완료](./field-check-system-implementation-complete.md#phase-3)
