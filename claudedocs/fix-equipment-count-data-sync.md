# 측정기기 수량 데이터 연동 문제 해결

## 문제 상황

**증상**: admin/business 페이지의 사업장 상세모달에서 "측정기기 및 네트워크" 섹션에 측정기기 수량이 표시되지 않음

**원인**: business/[사업장명] 페이지의 "측정기기 수량 체크" 섹션에서 입력한 정보가 데이터베이스에 저장되지 않아 페이지 간 데이터 연동 실패

## 근본 원인 분석

### 데이터 흐름

```
[business/[사업장명] 페이지]
├─ EnhancedFacilityInfoSection 컴포넌트
│  ├─ calculateEquipmentCounts() 함수
│  │  └─ facilities 데이터로부터 측정기기 수량 계산 ✅
│  └─ 계산된 수량 저장? ❌ (문제!)
│
[admin/business 페이지]
└─ BusinessDetailModal 컴포넌트
   └─ business_info 테이블에서 측정기기 수량 조회
      └─ 데이터베이스에 값 없음 → 0 또는 빈 값 표시 ❌
```

### 문제점

1. **계산만 하고 저장 안 함**:
   - `calculateEquipmentCounts()` 함수는 시설 정보로부터 측정기기 개수를 **계산만** 함
   - 계산된 값이 `business_info` 테이블에 **저장되지 않음**

2. **저장 시점 문제**:
   - `saveEquipmentCounts()` 함수는 존재하지만, 시설 정보를 **수동으로 편집하고 저장할 때만** 호출됨
   - 페이지 로드 시나 자동 계산 시에는 저장되지 않음

3. **게이트웨이 계산 로직 오류**:
   ```typescript
   // ❌ 잘못된 로직 (게이트웨이 번호를 합산)
   facilities.prevention?.forEach(facility => {
     if (facility.gatewayInfo?.id && facility.gatewayInfo.id !== '0') {
       counts.gateway += parseInt(facility.gatewayInfo.id) || 0; // "gateway1" → NaN
     }
   });
   ```

## 해결 방안

### 1. 자동 저장 기능 추가

**파일**: `components/sections/EnhancedFacilityInfoSection.tsx`

**변경 위치**: Line 118-130 (useEffect)

**Before**:
```typescript
useEffect(() => {
  calculateEquipmentCounts(); // 계산만 하고 저장 안 함
}, [calculateEquipmentCounts]);
```

**After**:
```typescript
useEffect(() => {
  const counts = calculateEquipmentCounts();

  // 🔄 자동 저장: 측정기기 수량이 변경되면 데이터베이스에 저장
  if (businessId && counts.totalDevices > 0) {
    const timer = setTimeout(() => {
      saveEquipmentCounts(counts);
    }, 1000); // 1초 디바운스

    return () => clearTimeout(timer);
  }
}, [calculateEquipmentCounts, businessId]);
```

**작동 원리**:
- facilities 데이터가 변경될 때마다 `calculateEquipmentCounts()` 실행
- 계산된 수량이 0보다 크면 1초 후 자동으로 `saveEquipmentCounts()` 호출
- 디바운스로 불필요한 API 호출 방지

### 2. 게이트웨이 계산 로직 개선

**변경 위치**: Line 103-112

**Before**:
```typescript
// 방지시설에서 게이트웨이 수량 계산
facilities.prevention?.forEach(facility => {
  if (facility.gatewayInfo?.id && facility.gatewayInfo.id !== '0') {
    counts.gateway += parseInt(facility.gatewayInfo.id) || 0; // ❌ 게이트웨이 번호를 숫자로 변환
  }
});
```

**After**:
```typescript
// 방지시설에서 게이트웨이 수량 계산 (고유한 게이트웨이 번호 개수)
const gatewaySet = new Set<string>();
facilities.prevention?.forEach(facility => {
  if (facility.gatewayInfo?.id && facility.gatewayInfo.id !== '0' && facility.gatewayInfo.id.trim()) {
    gatewaySet.add(facility.gatewayInfo.id.trim()); // ✅ 중복 제거
  }
});
counts.gateway = gatewaySet.size; // ✅ 고유한 게이트웨이 개수
```

**작동 원리**:
- `gateway1`, `gateway2`, `gateway1` → Set에 추가 → `gateway1`, `gateway2` (중복 제거)
- Set의 크기 = 실제 게이트웨이 개수 (2개)

## 데이터베이스 저장 메커니즘

### API 엔드포인트

**파일**: `app/api/business-equipment-counts/route.ts`

**PUT 요청**:
```typescript
// Request Body
{
  businessId: "uuid",
  equipmentCounts: {
    phSensor: 3,
    differentialPressureMeter: 5,
    temperatureMeter: 2,
    dischargeCT: 4,
    fanCT: 6,
    pumpCT: 2,
    gateway: 2,
    totalDevices: 24
  }
}
```

**데이터베이스 업데이트**:
```sql
UPDATE business_info
SET
  ph_meter = 3,
  differential_pressure_meter = 5,
  temperature_meter = 2,
  discharge_current_meter = 4,
  fan_current_meter = 6,
  pump_current_meter = 2,
  gateway = 2,

  additional_info = {
    equipment_summary: {
      total_devices: 24,
      last_calculated: "2024-01-15T10:30:00Z",
      breakdown: { /* 전체 equipmentCounts */ }
    }
  },

  updated_at = NOW()
WHERE id = 'uuid';
```

### 필드 매핑

| 영문 필드명 (API) | 데이터베이스 컬럼명 | 한글 필드명 (UI) |
|------------------|-------------------|-----------------|
| `phSensor` | `ph_meter` | `PH센서` |
| `differentialPressureMeter` | `differential_pressure_meter` | `차압계` |
| `temperatureMeter` | `temperature_meter` | `온도계` |
| `dischargeCT` | `discharge_current_meter` | `배출전류계` |
| `fanCT` | `fan_current_meter` | `송풍전류계` |
| `pumpCT` | `pump_current_meter` | `펌프전류계` |
| `gateway` | `gateway` | `게이트웨이` |

## admin/business 페이지에서의 표시

**파일**: `components/business/modals/BusinessDetailModal.tsx`

**데이터 로드** (Line 958-976):
```typescript
const devices = [
  { key: 'PH센서', value: business.PH센서, facilityKey: 'ph' },
  { key: '차압계', value: business.차압계, facilityKey: 'pressure' },
  { key: '온도계', value: business.온도계, facilityKey: 'temperature' },
  { key: '배출전류계', value: business.배출전류계, facilityKey: 'discharge' },
  { key: '송풍전류계', value: business.송풍전류계, facilityKey: 'fan' },
  { key: '펌프전류계', value: business.펌프전류계, facilityKey: 'pump' },
  { key: '게이트웨이(1,2)', value: business.gateway_1_2, facilityKey: 'gateway_1_2' },
  { key: '게이트웨이(3,4)', value: business.gateway_3_4, facilityKey: 'gateway_3_4' },
  // ...
];
```

**필드 매핑** (admin/business/page.tsx Line 2453-2461):
```typescript
// 한국어 센서/장비 필드명 매핑
PH센서: business.ph_meter || 0,
차압계: business.differential_pressure_meter || 0,
온도계: business.temperature_meter || 0,
배출전류계: business.discharge_current_meter || 0,
송풍전류계: business.fan_current_meter || 0,
펌프전류계: business.pump_current_meter || 0,
게이트웨이: business.gateway || 0, // @deprecated
'게이트웨이(1,2)': business.gateway_1_2 || 0,
'게이트웨이(3,4)': business.gateway_3_4 || 0,
```

## 테스트 시나리오

### 시나리오 1: 신규 사업장 시설 정보 입력

1. **사전 조건**: 새로운 사업장 생성, 측정기기 수량 = 0
2. **실행**:
   - `business/[사업장명]` 페이지 접속
   - 시설 정보 입력 (배출시설 2개, 방지시설 3개)
   - 측정기기 체크박스 선택 (PH센서 2개, 차압계 3개, 게이트웨이 1개)
3. **예상 결과**:
   - 1초 후 자동으로 `saveEquipmentCounts()` 호출
   - `business_info` 테이블에 수량 저장
   - admin/business 상세모달에서 저장된 수량 표시 ✅

### 시나리오 2: 기존 사업장 시설 정보 수정

1. **사전 조건**: 기존 사업장, 측정기기 수량 = 5개
2. **실행**:
   - 시설 정보 수정 (방지시설 1개 추가)
   - 측정기기 추가 (온도계 1개)
3. **예상 결과**:
   - facilities 데이터 변경 감지
   - `calculateEquipmentCounts()` 재실행 (총 6개)
   - 1초 후 자동 저장
   - admin/business 모달에서 업데이트된 수량 표시 ✅

### 시나리오 3: 게이트웨이 중복 제거 확인

1. **실행**:
   - 방지시설 3개에 모두 `gateway1` 할당
2. **예상 결과**:
   - 게이트웨이 수량 = 1개 (중복 제거) ✅
   - admin/business 모달에서 게이트웨이 1개 표시 ✅

## 성능 최적화

### 디바운스 (1초)

```typescript
if (businessId && counts.totalDevices > 0) {
  const timer = setTimeout(() => {
    saveEquipmentCounts(counts);
  }, 1000); // 1초 디바운스

  return () => clearTimeout(timer);
}
```

**효과**:
- 짧은 시간 내 여러 변경 발생 시 마지막 변경만 저장
- 불필요한 API 호출 방지
- 데이터베이스 부하 감소

### 조건부 저장

```typescript
if (businessId && counts.totalDevices > 0) {
  // 저장 로직
}
```

**조건**:
- `businessId` 존재: 사업장 정보가 로드된 경우만
- `totalDevices > 0`: 측정기기가 1개 이상 있을 때만

## 구현 완료 확인

- [x] 자동 저장 기능 추가 (useEffect)
- [x] 게이트웨이 계산 로직 개선 (Set 사용)
- [x] 디바운스 적용 (1초)
- [x] 조건부 저장 (businessId, totalDevices 체크)
- [x] 코드 커밋 및 푸시

## 다음 단계

1. **개발 서버에서 테스트**:
   ```bash
   npm run dev
   ```

2. **테스트 절차**:
   - business/[사업장명] 페이지에서 시설 정보 입력
   - 1-2초 대기 (자동 저장)
   - admin/business 페이지의 사업장 상세모달 확인
   - 측정기기 수량이 정상적으로 표시되는지 확인

3. **브라우저 콘솔 확인**:
   ```
   ✅ [EQUIPMENT-COUNTS] 수량 업데이트 완료: 총 24개 기기
   ```

4. **Supabase 데이터베이스 직접 확인**:
   ```sql
   SELECT
     business_name,
     ph_meter,
     differential_pressure_meter,
     temperature_meter,
     discharge_current_meter,
     fan_current_meter,
     pump_current_meter,
     gateway,
     additional_info->'equipment_summary' as equipment_summary
   FROM business_info
   WHERE business_name = '사업장명'
     AND is_active = true;
   ```

## 예상 결과

### Before (문제)
```
[business/[사업장명]]
- 시설 정보 입력 ✅
- 측정기기 수량 계산 ✅
- 데이터베이스 저장 ❌

[admin/business]
- 측정기기 수량 표시: 0개 (또는 빈 값) ❌
```

### After (해결)
```
[business/[사업장명]]
- 시설 정보 입력 ✅
- 측정기기 수량 계산 ✅
- 데이터베이스 자동 저장 ✅ (1초 디바운스)

[admin/business]
- 측정기기 수량 표시: 24개 ✅
- 시설관리 페이지와 데이터 일치 ✅
```

## 참고 파일

- `components/sections/EnhancedFacilityInfoSection.tsx` - 측정기기 수량 계산 및 저장
- `app/api/business-equipment-counts/route.ts` - 측정기기 수량 API
- `components/business/modals/BusinessDetailModal.tsx` - admin 페이지 모달
- `app/admin/business/page.tsx` - 필드 매핑 (영문 → 한글)
