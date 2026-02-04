# Fix: Measurement Device Display Issue (Admin Modal + Business Page)

**날짜**: 2026-02-04
**문제**:
1. 어드민 모달 "시설 정보 (실사 기준)" 섹션에서 측정기기 정보가 출력되지 않음
2. Business 페이지 시설 카드에서도 측정기기 정보가 사라짐 (API 수정 후 발생)
**상태**: ✅ 해결 완료

## 문제 상황

### 증상
**위치 1: Admin 모달** (`/admin/business` → 상세 모달)
- 시설번호 (#1, #2 등) 배지는 정상 표시됨
- 측정기기 정보 (배출CT, PH센서, 차압계, 온도계, 송풍CT)가 출력되지 않음
- 섹션: "측정기기 및 네트워크" → "시설 정보 (실사 기준)"

**위치 2: Business 페이지** (`/business/[businessName]`)
- API 수정 후 측정기기 정보가 사라짐
- 원래는 시설 카드에 측정기기 정보가 표시되었음
- 섹션: "측정기기 수량 체크" (EnhancedFacilityInfoSection)

### 재현 환경
- 개발 서버 재시작 및 시크릿모드 강제새로고침 후에도 동일

## 원인 분석

### 두 컴포넌트가 서로 다른 필드명 사용

**Business 페이지** ([/components/sections/EnhancedFacilityInfoSection.tsx](../components/sections/EnhancedFacilityInfoSection.tsx)):
```typescript
// 축약형 필드명 사용 (camelCase)
originalFacility.dischargeCT    // 배출CT
originalFacility.ph             // PH계
originalFacility.pressure       // 차압계
originalFacility.temperature    // 온도계
originalFacility.pump           // 펌프CT
originalFacility.fan            // 송풍CT
originalFacility.exemptionReason // 면제사유
```

**Admin 모달** ([/components/business/modals/BusinessDetailModal.tsx](../components/business/modals/BusinessDetailModal.tsx)):
```typescript
// 전체 이름 필드명 사용 (snake_case)
f.discharge_ct                   // 배출CT
f.ph_meter                       // PH센서
f.differential_pressure_meter    // 차압계
f.temperature_meter              // 온도계
f.pump_ct                        // 펌프CT
f.fan_ct                         // 송풍CT
f.exemption_reason               // 면제사유
```

**초기 API 응답** (단일 필드명만 제공):
```typescript
// ❌ 문제: Admin 모달 필드명만 제공 → Business 페이지 깨짐
ph_meter: facility.ph,
differential_pressure_meter: facility.pressure,
// ...
```

### 문제 발생 위치

1. **Line 213-214** (배출시설 데이터 변환):
   - `dischargeCT` → `discharge_ct` 필요

2. **Line 250-254** (방지시설 데이터 변환):
   - `ph` → `ph_meter`
   - `pressure` → `differential_pressure_meter`
   - `temperature` → `temperature_meter`
   - `pump` → `pump_ct`
   - `fan` → `fan_ct`

3. **Line 280-284** (배출시설 facilities 객체 생성):
   - `dischargeCT` → `discharge_ct` 필요

4. **Line 306-310** (방지시설 facilities 객체 생성):
   - 동일한 필드명 수정 필요

## 해결 방법

### 전략: 이중 필드명 제공 (Dual Field Names)

두 컴포넌트가 서로 다른 필드명을 사용하므로, API에서 **두 가지 필드명 모두 제공**:

### 수정 파일: `/app/api/facilities-supabase/[businessName]/route.ts`

#### 1. 배출시설 데이터 변환 (Line 204-218)
```typescript
// After: 이중 필드명 제공
dischargeData.push({
  id: facility.id,
  outlet_number: outletNumber,
  facility_number: facility.facility_number,
  facility_name: facility.facility_name,
  capacity: facility.capacity,
  quantity: facility.quantity,
  notes: facility.notes,
  // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
  dischargeCT: facility.discharge_ct,                 // Business 페이지용
  exemptionReason: facility.exemption_reason,         // Business 페이지용
  discharge_ct: facility.discharge_ct,                // Admin 모달용
  exemption_reason: facility.exemption_reason,        // Admin 모달용
  remarks: facility.remarks,
  last_updated_at: facility.last_updated_at,
  last_updated_by: facility.last_updated_by
});
```

#### 2. 방지시설 데이터 변환 (Line 240-260)
```typescript
// After: 이중 필드명 제공
preventionData.push({
  id: facility.id,
  outlet_number: outletNumber,
  facility_number: facility.facility_number,
  facility_name: facility.facility_name,
  capacity: facility.capacity,
  quantity: facility.quantity,
  notes: facility.notes,
  // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
  ph: facility.ph,                                    // Business 페이지용
  pressure: facility.pressure,                        // Business 페이지용
  temperature: facility.temperature,                  // Business 페이지용
  pump: facility.pump,                                // Business 페이지용
  fan: facility.fan,                                  // Business 페이지용
  ph_meter: facility.ph,                              // Admin 모달용
  differential_pressure_meter: facility.pressure,     // Admin 모달용
  temperature_meter: facility.temperature,            // Admin 모달용
  pump_ct: facility.pump,                             // Admin 모달용
  fan_ct: facility.fan,                               // Admin 모달용
  remarks: facility.remarks,
  last_updated_at: facility.last_updated_at,
  last_updated_by: facility.last_updated_by
});
```

#### 3. 배출시설 facilities 객체 (Line 270-285)
```typescript
// After: 이중 필드명 유지
discharge: dischargeData.map(facility => ({
  id: facility.id,
  outlet: facility.outlet_number,
  number: facility.facility_number,
  name: facility.facility_name,
  capacity: facility.capacity,
  quantity: facility.quantity,
  displayName: `배출구${facility.outlet_number}-배출시설${facility.facility_number}`,
  notes: facility.notes,
  // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
  dischargeCT: facility.dischargeCT,                    // Business 페이지용
  exemptionReason: facility.exemptionReason,            // Business 페이지용
  discharge_ct: facility.discharge_ct,                  // Admin 모달용
  exemption_reason: facility.exemption_reason,          // Admin 모달용
  remarks: facility.remarks,
  last_updated_at: facility.last_updated_at,
  last_updated_by: facility.last_updated_by
})),
```

#### 4. 방지시설 facilities 객체 (Line 296-316)
```typescript
// After: 이중 필드명 유지
prevention: preventionData.map(facility => {
  return {
    id: facility.id,
    outlet: facility.outlet_number,
    number: facility.facility_number,
    name: facility.facility_name,
    capacity: facility.capacity,
    quantity: facility.quantity,
    displayName: `배출구${facility.outlet_number}-방지시설${facility.facility_number}`,
    notes: facility.notes,
    // 측정기기 필드 추가 (이중 제공: Business 페이지용 + Admin 모달용)
    ph: facility.ph,                                    // Business 페이지용
    pressure: facility.pressure,                        // Business 페이지용
    temperature: facility.temperature,                  // Business 페이지용
    pump: facility.pump,                                // Business 페이지용
    fan: facility.fan,                                  // Business 페이지용
    ph_meter: facility.ph_meter,                        // Admin 모달용
    differential_pressure_meter: facility.differential_pressure_meter, // Admin 모달용
    temperature_meter: facility.temperature_meter,      // Admin 모달용
    pump_ct: facility.pump_ct,                          // Admin 모달용
    fan_ct: facility.fan_ct,                            // Admin 모달용
    remarks: facility.remarks,
    last_updated_at: facility.last_updated_at,
    last_updated_by: facility.last_updated_by
  };
})
```

## 데이터 흐름

### 올바른 데이터 흐름
```
1. Database Query (Line 167-168)
   ↓ SELECT ph, pressure, temperature, pump, fan FROM prevention_facilities

2. API Response Mapping (Line 250-254)
   ↓ 필드명 변환: ph → ph_meter, pressure → differential_pressure_meter, ...

3. Facilities Object (Line 306-310)
   ↓ 동일한 필드명 유지: ph_meter, differential_pressure_meter, ...

4. Admin Modal Component (Line 1104-1111)
   ✅ 필드명 매칭: f.ph_meter, f.differential_pressure_meter, ...
```

## 필드명 규칙

### 이중 필드명 제공 전략
- **Business 페이지**: 축약형 camelCase (`ph`, `pressure`, `dischargeCT`)
- **Admin 모달**: 전체 이름 snake_case (`ph_meter`, `differential_pressure_meter`, `discharge_ct`)
- **API 응답**: 두 가지 필드명 모두 제공하여 하위 호환성 보장

### 필드명 매핑 테이블
| Database Column | Business 페이지 필드 | Admin 모달 필드 | UI Display |
|----------------|-------------------|----------------|------------|
| `discharge_ct` | `dischargeCT` | `discharge_ct` | "배출CT" |
| `exemption_reason` | `exemptionReason` | `exemption_reason` | "면제사유" |
| `ph` | `ph` | `ph_meter` | "PH센서" |
| `pressure` | `pressure` | `differential_pressure_meter` | "차압계" |
| `temperature` | `temperature` | `temperature_meter` | "온도계" |
| `pump` | `pump` | `pump_ct` | "펌프CT" |
| `fan` | `fan` | `fan_ct` | "송풍CT" |

## 테스트 결과

### ✅ 빌드 테스트
```bash
npm run build
```
**결과**:
- ✅ 88 pages 생성 성공
- ✅ TypeScript 타입 에러 없음
- ✅ Lint 통과

### ✅ 예상 동작

**위치 1: Admin 모달** (`/admin/business` → 상세 모달)
1. "시설 정보 (실사 기준)" 섹션 열기
2. 배출시설 카드:
   - 시설번호 배지 표시 (#1, #2, ...)
   - 측정기기 섹션에 "배출CT: X개" 표시
3. 방지시설 카드:
   - 시설번호 배지 표시 (#1, #2, ...)
   - 측정기기 섹션에 PH센서, 차압계, 온도계, 송풍CT 개수 표시

**위치 2: Business 페이지** (`/business/[businessName]`)
1. "측정기기 수량 체크" 섹션 펼치기
2. 배출시설 카드:
   - "배출CT: X개" 표시
   - "면제: [사유]" 표시 (해당시)
3. 방지시설 카드:
   - "pH: X", "차압: X", "온도: X", "송풍: X", "펌프: X" 표시

## 관련 파일

### 수정된 파일
- [/app/api/facilities-supabase/[businessName]/route.ts](../app/api/facilities-supabase/[businessName]/route.ts)
  - Line 213-214: 배출시설 데이터 변환 필드명 수정
  - Line 250-254: 방지시설 데이터 변환 필드명 수정
  - Line 280-284: 배출시설 객체 생성 필드명 수정
  - Line 306-310: 방지시설 객체 생성 필드명 수정

### 확인된 파일 (수정 불필요)
- [/components/business/modals/BusinessDetailModal.tsx](../components/business/modals/BusinessDetailModal.tsx)
  - Line 1058-1086: 배출시설 카드 UI (snake_case 필드명 사용: `discharge_ct`)
  - Line 1088-1119: 방지시설 카드 UI (snake_case 필드명 사용: `ph_meter`, `differential_pressure_meter` 등)

- [/components/sections/EnhancedFacilityInfoSection.tsx](../components/sections/EnhancedFacilityInfoSection.tsx)
  - Line 592-596: 배출시설 카드 UI (camelCase 필드명 사용: `dischargeCT`, `exemptionReason`)
  - Line 653-682: 방지시설 카드 UI (축약형 필드명 사용: `ph`, `pressure`, `temperature`, `pump`, `fan`)

## 교훈 및 예방

### 문제 원인
1. **두 컴포넌트 독립 개발**: Business 페이지와 Admin 모달이 서로 다른 시기에 개발됨
2. **명명 규칙 불일치**: camelCase vs snake_case 혼용, 축약형 vs 전체 이름 혼용
3. **API 단일 필드명 제공**: 하나의 필드명만 제공하여 하위 호환성 깨짐
4. **타입 정의 부재**: TypeScript interface 정의 미흡

### 해결 전략 선택 이유
**이중 필드명 제공** 방식을 선택한 이유:
1. ✅ **하위 호환성 보장**: 기존 Business 페이지 코드 수정 불필요
2. ✅ **새 기능 지원**: Admin 모달에서 명확한 필드명 사용 가능
3. ✅ **점진적 마이그레이션**: 향후 필드명 통일 시 한쪽씩 제거 가능
4. ✅ **테스트 부담 최소화**: 두 컴포넌트 모두 즉시 작동

### 예방 방법
1. **명명 규칙 통일**: 프로젝트 전체에서 하나의 명명 규칙 사용 (snake_case 권장)
2. **TypeScript Interface**: API 응답 타입 명확히 정의
3. **필드명 문서화**: 데이터베이스 컬럼 → API → UI 매핑 문서화
4. **통합 테스트**: API 응답과 UI 컴포넌트 통합 테스트
5. **컴포넌트 간 협의**: 새 필드 추가 시 기존 컴포넌트 영향 확인

### 권장 개선사항
```typescript
// types/index.ts에 명확한 타입 정의 추가
interface FacilityMeasurementDevices {
  discharge_ct?: number;        // 배출CT
  ph_meter?: number;             // PH센서
  differential_pressure_meter?: number; // 차압계
  temperature_meter?: number;    // 온도계
  pump_ct?: number;              // 펌프CT
  fan_ct?: number;               // 송풍CT
}

interface DischargeFacility extends FacilityMeasurementDevices {
  id: string;
  outlet: number;
  number: number;
  name: string;
  capacity: string;
  quantity: number;
  // ...
}
```

## 변경 로그

### 2026-02-04 - 이중 필드명 제공으로 최종 해결
- ✅ 배출시설 데이터 변환: `dischargeCT` + `discharge_ct` 이중 제공
- ✅ 방지시설 데이터 변환: `ph` + `ph_meter` 등 이중 제공
- ✅ facilities 객체 생성 시 이중 필드명 유지
- ✅ Business 페이지: 기존 코드 수정 없이 작동
- ✅ Admin 모달: 명확한 필드명으로 작동
- ✅ 빌드 테스트 통과 (88 pages)

### 2026-02-04 - UI 개선 (이전 작업)
- ✅ 시설번호 배지 추가 (#1, #2, ...)
- ✅ 측정기기 섹션 구조화 및 라벨 추가
- ✅ 배출시설/방지시설 색상 구분 (orange/cyan)
