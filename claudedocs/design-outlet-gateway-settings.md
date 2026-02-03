# 배출구별 게이트웨이 설정 기능 설계

## 📋 요구사항

### 현재 상황
- ❌ 배출시설별 게이트웨이 설정이 구현되어 있으나 UI에 표시되지 않음
- ❌ 실제 필요한 것은 **배출구별** 게이트웨이 설정

### 목표
- ✅ 배출구(outlet)별로 게이트웨이 번호와 VPN 타입 설정
- ✅ 측정기기 수량 체크 섹션에서 배출구별 게이트웨이 정보 표시 및 수정
- ✅ 배출시설별 게이트웨이 설정 코드 제거 (불필요)

---

## 🏗️ 아키텍처 설계

### 1. 데이터 구조 변경

#### 1.1 타입 정의 수정 (`types/database.ts`)

```typescript
export interface DischargeOutlet {
  id: string
  air_permit_id: string
  created_at: string
  updated_at: string

  // Outlet Information
  outlet_number: number
  outlet_name?: string | null

  // 🆕 게이트웨이 정보 추가
  gateway_number?: string | null  // 'gateway1' ~ 'gateway50'
  vpn_type?: '유선' | '무선' | null  // VPN 연결 방식

  // Physical Properties (기존 필드들...)
  height?: number | null
  inner_diameter?: number | null
  // ...
}
```

#### 1.2 Facility 타입에서 게이트웨이 정보 제거 (`types/index.ts`)

**제거할 부분:**
```typescript
// ❌ 배출시설용 게이트웨이 정보 제거
gatewayInfo?: {
  id?: string;
  gateway?: string;  // 이 부분 제거
  vpn?: '유선' | '무선';  // 이 부분 제거
  ip?: string;
  mac?: string;
  firmware?: string;
  status?: 'connected' | 'disconnected' | 'error';
};
```

**수정 후:**
```typescript
// ✅ 방지시설용만 유지
gatewayInfo?: {
  id?: string;  // 방지시설용 게이트웨이 번호
  ip?: string;
  mac?: string;
  firmware?: string;
  status?: 'connected' | 'disconnected' | 'error';
};
```

---

### 2. UI 컴포넌트 설계

#### 2.1 배출구별 게이트웨이 설정 섹션 위치

```
📁 components/sections/EnhancedFacilityInfoSection.tsx
  ↓
  📊 측정기기 수량 체크 섹션
    ├─ 배출시설 목록 (현재 있음)
    ├─ 방지시설 목록 (현재 있음)
    └─ 🆕 배출구별 게이트웨이 설정 (새로 추가)
```

#### 2.2 배출구별 게이트웨이 설정 UI 구조

```typescript
// 배출구별 게이트웨이 설정 섹션
<div className="bg-white rounded-lg border border-gray-100 p-4 mt-6">
  <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
    <Router className="w-5 h-5 text-teal-600" />
    배출구별 게이트웨이 설정 ({outlets.length}개 배출구)
  </h3>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {outlets.map(outlet => (
      <div key={outlet.id} className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4 border border-teal-200">
        {/* 배출구 정보 헤더 */}
        <div className="flex items-center gap-2 mb-3">
          <Factory className="w-5 h-5 text-teal-600" />
          <h4 className="font-semibold text-gray-900">
            배출구 {outlet.outletNumber}번
          </h4>
        </div>

        {/* 게이트웨이 번호 선택 */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            게이트웨이 번호
          </label>
          <select
            value={outlet.gateway_number || ''}
            onChange={(e) => handleOutletGatewayChange(outlet.id, 'gateway_number', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="">선택하세요</option>
            {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
              <option key={num} value={`gateway${num}`}>
                gateway{num}
              </option>
            ))}
          </select>
        </div>

        {/* VPN 타입 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            VPN 연결 방식
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleOutletGatewayChange(outlet.id, 'vpn_type', '유선')}
              className={`flex-1 px-3 py-2 rounded-lg font-medium ${
                outlet.vpn_type === '유선'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300'
              }`}
            >
              유선
            </button>
            <button
              type="button"
              onClick={() => handleOutletGatewayChange(outlet.id, 'vpn_type', '무선')}
              className={`flex-1 px-3 py-2 rounded-lg font-medium ${
                outlet.vpn_type === '무선'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300'
              }`}
            >
              무선
            </button>
          </div>
        </div>

        {/* 현재 설정 표시 */}
        {outlet.gateway_number && (
          <div className="mt-3 pt-3 border-t border-teal-200">
            <div className="flex items-center gap-2 text-sm text-teal-700">
              <Router className="w-4 h-4" />
              <span>{outlet.gateway_number}</span>
              {outlet.vpn_type && (
                <span className="px-2 py-0.5 bg-teal-100 rounded-full text-xs">
                  {outlet.vpn_type}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
</div>
```

---

### 3. 데이터 흐름 설계

#### 3.1 데이터 로드 플로우

```
1. 페이지 로드
   ↓
2. facilityNumbering 데이터 가져오기
   ↓
3. outlets 배열에서 각 배출구의 gateway_number, vpn_type 확인
   ↓
4. UI에 표시
```

#### 3.2 데이터 저장 플로우

```
1. 사용자가 배출구의 게이트웨이 번호 또는 VPN 타입 변경
   ↓
2. handleOutletGatewayChange(outletId, field, value) 실행
   ↓
3. 로컬 상태 업데이트
   ↓
4. API 호출: PUT /api/air-permits/outlets/[outletId]
   ↓
5. Supabase discharge_outlets 테이블 업데이트
   ↓
6. 자동 저장 완료 (1초 디바운스)
```

---

### 4. API 설계

#### 4.1 배출구 게이트웨이 정보 업데이트 API

**Endpoint:** `PUT /api/air-permits/outlets/[outletId]`

**Request Body:**
```typescript
{
  gateway_number?: string;  // 'gateway1' ~ 'gateway50'
  vpn_type?: '유선' | '무선';
}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
  data: {
    outlet: DischargeOutlet;
  };
}
```

**Supabase 쿼리:**
```typescript
const { data, error } = await supabaseAdmin
  .from('discharge_outlets')
  .update({
    gateway_number: body.gateway_number,
    vpn_type: body.vpn_type,
    updated_at: new Date().toISOString()
  })
  .eq('id', outletId)
  .select()
  .single();
```

---

### 5. 데이터베이스 마이그레이션

#### 5.1 SQL 마이그레이션 스크립트

```sql
-- discharge_outlets 테이블에 게이트웨이 정보 컬럼 추가
ALTER TABLE discharge_outlets
ADD COLUMN IF NOT EXISTS gateway_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS vpn_type VARCHAR(10);

-- 체크 제약조건 추가
ALTER TABLE discharge_outlets
ADD CONSTRAINT check_vpn_type
CHECK (vpn_type IN ('유선', '무선', NULL));

-- 게이트웨이 번호 형식 체크 (gateway1 ~ gateway50)
ALTER TABLE discharge_outlets
ADD CONSTRAINT check_gateway_number_format
CHECK (
  gateway_number IS NULL OR
  gateway_number ~ '^gateway([1-9]|[1-4][0-9]|50)$'
);

-- 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_discharge_outlets_gateway
ON discharge_outlets(gateway_number)
WHERE gateway_number IS NOT NULL;

-- 코멘트 추가
COMMENT ON COLUMN discharge_outlets.gateway_number IS '배출구별 게이트웨이 번호 (gateway1-gateway50)';
COMMENT ON COLUMN discharge_outlets.vpn_type IS 'VPN 연결 방식 (유선/무선)';
```

---

### 6. 게이트웨이 수량 계산 로직 수정

#### 6.1 calculateEquipmentCounts 함수 수정

**기존 (배출시설 게이트웨이 수집):**
```typescript
// ❌ 제거: 배출시설에서 게이트웨이 수집
facilities.discharge?.forEach(facility => {
  if (facility.gatewayInfo?.gateway && ...) {
    gatewaySet.add(facility.gatewayInfo.gateway.trim());
  }
});
```

**변경 후 (배출구에서 게이트웨이 수집):**
```typescript
// ✅ 배출구에서 게이트웨이 수집
facilityNumbering?.outlets?.forEach((outlet: any) => {
  if (outlet.gateway_number && outlet.gateway_number.trim()) {
    gatewaySet.add(outlet.gateway_number.trim());
  }
});

// 방지시설에서 게이트웨이 수집 (기존 유지)
facilities.prevention?.forEach(facility => {
  if (facility.gatewayInfo?.id && facility.gatewayInfo.id !== '0' && facility.gatewayInfo.id.trim()) {
    gatewaySet.add(facility.gatewayInfo.id.trim());
  }
});

counts.gateway = gatewaySet.size;
```

---

## 🗂️ 파일별 수정 사항

### 1. 타입 정의 파일

#### `types/database.ts` (수정)
- ✅ `DischargeOutlet` 인터페이스에 `gateway_number`, `vpn_type` 추가

#### `types/index.ts` (수정)
- ❌ `Facility.gatewayInfo.gateway` 제거
- ❌ `Facility.gatewayInfo.vpn` 제거
- ✅ 방지시설용 `gatewayInfo.id`만 유지

### 2. UI 컴포넌트

#### `components/sections/EnhancedFacilityInfoSection.tsx` (대폭 수정)

**제거할 부분:**
1. 배출시설 편집 모달의 게이트웨이 섹션 (338-416 라인)
2. 배출시설 카드의 게이트웨이 표시 (728-738 라인)
3. calculateEquipmentCounts의 배출시설 게이트웨이 수집 로직

**추가할 부분:**
1. 배출구별 게이트웨이 설정 섹션 (새 섹션)
2. handleOutletGatewayChange 함수
3. 배출구 게이트웨이 자동 저장 로직
4. calculateEquipmentCounts에 배출구 게이트웨이 수집 로직

### 3. API 라우트

#### `app/api/air-permits/outlets/[outletId]/route.ts` (신규)
- ✅ PUT 메서드: 배출구 게이트웨이 정보 업데이트
- ✅ GET 메서드: 배출구 정보 조회

### 4. 데이터베이스

#### `sql/add_outlet_gateway_columns.sql` (신규)
- ✅ discharge_outlets 테이블에 컬럼 추가
- ✅ 제약조건 추가
- ✅ 인덱스 추가

---

## 📊 데이터 플로우 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 인터페이스                          │
│  business/[사업장명] 페이지 - 측정기기 수량 체크 섹션          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 1. 페이지 로드
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              facilityNumbering 데이터 로드                    │
│  outlets: [                                                 │
│    {                                                        │
│      id, outletNumber, gateway_number?, vpn_type?,         │
│      dischargeFacilities: [...],                           │
│      preventionFacilities: [...]                           │
│    }                                                        │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 2. UI 렌더링
                            ↓
┌─────────────────────────────────────────────────────────────┐
│            배출구별 게이트웨이 설정 카드 표시                  │
│  [배출구1] gateway1, 유선                                    │
│  [배출구2] gateway2, 무선                                    │
│  [배출구3] 미설정                                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 3. 사용자 변경
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         handleOutletGatewayChange(outletId, field, value)   │
│  - 로컬 상태 업데이트                                        │
│  - 1초 디바운스 타이머 시작                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 4. API 호출 (1초 후)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│     PUT /api/air-permits/outlets/[outletId]                 │
│  {                                                          │
│    gateway_number: 'gateway1',                             │
│    vpn_type: '유선'                                         │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 5. DB 업데이트
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         Supabase discharge_outlets 테이블 업데이트            │
│  UPDATE discharge_outlets                                   │
│  SET gateway_number = 'gateway1',                          │
│      vpn_type = '유선',                                     │
│      updated_at = NOW()                                    │
│  WHERE id = [outletId]                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 6. 게이트웨이 수량 재계산
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           calculateEquipmentCounts() 실행                    │
│  - 배출구별 게이트웨이 수집 (Set으로 중복 제거)              │
│  - 방지시설 게이트웨이 수집                                  │
│  - 총 게이트웨이 수 계산                                     │
│  - 자동 저장 (business_equipment_counts API)                │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 7. admin 페이지에서 확인
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          admin/business 상세모달에서 수량 확인                │
│  게이트웨이: 3개 (배출구2 + 방지시설1)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ 구현 체크리스트

### Phase 1: 코드 정리 및 타입 수정
- [ ] `types/index.ts`: Facility.gatewayInfo에서 배출시설용 필드 제거
- [ ] `types/database.ts`: DischargeOutlet에 gateway_number, vpn_type 추가
- [ ] `EnhancedFacilityInfoSection.tsx`: 배출시설 편집 모달 게이트웨이 섹션 제거
- [ ] `EnhancedFacilityInfoSection.tsx`: 배출시설 카드 게이트웨이 표시 제거
- [ ] `EnhancedFacilityInfoSection.tsx`: calculateEquipmentCounts 배출시설 게이트웨이 로직 제거

### Phase 2: 데이터베이스 마이그레이션
- [ ] SQL 스크립트 작성: discharge_outlets 테이블 컬럼 추가
- [ ] 제약조건 추가: vpn_type, gateway_number 형식 검증
- [ ] 인덱스 추가: 검색 성능 향상
- [ ] 마이그레이션 실행 및 검증

### Phase 3: API 구현
- [ ] `app/api/air-permits/outlets/[outletId]/route.ts` 생성
- [ ] PUT 메서드 구현: 게이트웨이 정보 업데이트
- [ ] GET 메서드 구현: 배출구 정보 조회
- [ ] 에러 처리 및 유효성 검증

### Phase 4: UI 구현
- [ ] 배출구별 게이트웨이 설정 섹션 추가
- [ ] handleOutletGatewayChange 함수 구현
- [ ] 게이트웨이 번호 드롭다운 구현 (gateway1-50)
- [ ] VPN 타입 토글 버튼 구현 (유선/무선)
- [ ] 자동 저장 로직 구현 (1초 디바운스)
- [ ] 현재 설정 상태 표시

### Phase 5: 게이트웨이 수량 계산 로직 수정
- [ ] calculateEquipmentCounts에 배출구 게이트웨이 수집 로직 추가
- [ ] Set으로 중복 제거 로직 구현
- [ ] 자동 저장 연동 확인

### Phase 6: 테스트 및 검증
- [ ] 배출구별 게이트웨이 설정 기능 테스트
- [ ] 게이트웨이 수량 계산 정확성 검증
- [ ] admin 페이지 상세모달에서 수량 확인
- [ ] 자동 저장 동작 확인
- [ ] 에러 케이스 테스트

---

## 🎯 구현 우선순위

### 1순위 (필수)
- 배출시설별 게이트웨이 코드 제거
- 타입 정의 수정
- 데이터베이스 마이그레이션

### 2순위 (핵심 기능)
- 배출구별 게이트웨이 설정 UI
- API 구현
- 자동 저장 로직

### 3순위 (완성도)
- 게이트웨이 수량 계산 로직 수정
- 에러 처리 개선
- UI/UX 개선

---

## 📝 참고사항

### 기존 방지시설 게이트웨이
- 방지시설의 `gatewayInfo.id` 필드는 **그대로 유지**
- 방지시설 편집 모달의 게이트웨이 설정 기능은 **변경 없음**
- 방지시설 카드의 게이트웨이 표시 기능은 **변경 없음**

### 게이트웨이 수량 계산
- 배출구 게이트웨이 + 방지시설 게이트웨이를 합산
- Set을 사용하여 중복 게이트웨이 번호 제거
- 고유한 게이트웨이 개수만 카운팅

### 데이터 일관성
- 배출구 게이트웨이 정보는 `discharge_outlets` 테이블에 저장
- 방지시설 게이트웨이 정보는 Facility의 `gatewayInfo`에 저장
- 두 데이터를 조합하여 총 게이트웨이 수량 계산
