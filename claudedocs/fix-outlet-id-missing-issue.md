# 배출구 게이트웨이 설정 오류 해결 - outlet.id undefined 문제

## 문제 상황

### 증상
- 게이트웨이 번호 또는 VPN 타입 선택 시 `500 Internal Server Error` 발생
- API 호출 URL: `PUT /api/air-permits/outlets/undefined`
- 데이터베이스 오류: `invalid input syntax for type uuid: "undefined"`

### 서버 로그
```
📊 [OUTLET-GATEWAY] 배출구 게이트웨이 정보 업데이트: undefined { gateway_number: 'gateway1' }
❌ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 실패: {
  code: '22P02',
  message: 'invalid input syntax for type uuid: "undefined"'
}
```

### 브라우저 로그
```
EnhancedFacilityInfoSection.tsx:191  PUT http://localhost:3000/api/air-permits/outlets/undefined 500
handleOutletGatewayChange @ EnhancedFacilityInfoSection.tsx:191
onChange @ EnhancedFacilityInfoSection.tsx:646
```

## 근본 원인 분석

### 데이터 흐름
```
[BusinessContent.tsx]
├─ facilitiesData.data.facilityNumbering 받아옴
│  └─ outlets: [{ outletNumber, dischargeFacilities, preventionFacilities }]
│     ❌ id 필드 없음!
│
[EnhancedFacilityInfoSection.tsx]
├─ facilityNumbering prop으로 받음
└─ handleOutletGatewayChange(outlet.id, ...) 호출
   └─ outlet.id = undefined ❌
      └─ API 호출: /api/air-permits/outlets/undefined
```

### 문제점
1. **facilityNumbering 데이터에 outlet.id 필드가 없음**
   - `outletNumber`는 있지만 데이터베이스 UUID인 `id`는 없음
   - API 호출에는 UUID가 필요함

2. **데이터 구조 불일치**
   - `discharge_outlets` 테이블: `id` (UUID) + `outlet_number` (숫자)
   - `facilityNumbering` 데이터: `outletNumber`만 있고 `id` 없음

3. **API 엔드포인트 요구사항**
   - `PUT /api/air-permits/outlets/[outletId]`
   - `[outletId]`는 UUID 타입이어야 함

## 해결 방안

### 방안 1: facilityNumbering 데이터에 outlet.id 추가 (권장)

**장점**:
- 근본적 해결
- API 설계 유지 (UUID 사용)
- 향후 다른 기능에서도 outlet.id 사용 가능

**단점**:
- 데이터 조회 API 수정 필요
- 기존 데이터 구조 변경

**구현 위치**:
1. `app/api/facilities/route.ts` - facilityNumbering 생성 로직
2. 또는 `BusinessContent.tsx` - facilityNumbering 조회 로직

**변경 전**:
```typescript
// facilityNumbering 구조
{
  outlets: [{
    outletNumber: 1,
    dischargeFacilities: [...],
    preventionFacilities: [...]
  }]
}
```

**변경 후**:
```typescript
// facilityNumbering 구조
{
  outlets: [{
    id: "uuid-123-456",          // ✅ 추가
    outletNumber: 1,
    outletName: "배출구1",        // 선택사항
    gateway_number: "gateway1",   // 선택사항
    vpn_type: "유선",             // 선택사항
    dischargeFacilities: [...],
    preventionFacilities: [...]
  }]
}
```

### 방안 2: outletNumber로 API 호출 변경

**장점**:
- 빠른 수정
- 기존 데이터 구조 유지

**단점**:
- API 엔드포인트 변경 필요
- outlet_number는 air_permit_id와 함께 복합 키로 사용해야 함
- 확장성 낮음

**구현**:
1. API 엔드포인트 변경: `/api/air-permits/[permitId]/outlets/[outletNumber]`
2. 데이터베이스 쿼리: `air_permit_id + outlet_number`로 조회

### 방안 3: 클라이언트에서 outlet_number로 id 조회

**장점**:
- API 변경 없음
- 최소 코드 수정

**단점**:
- 불필요한 추가 API 호출
- 성능 저하 (매번 조회 필요)
- 복잡도 증가

## 권장 해결책: 방안 1 구현

### Phase 1: 데이터 조회 API 수정

**파일**: `app/api/facilities/route.ts` (또는 facilityNumbering 생성하는 곳)

**변경 위치**: facilityNumbering 데이터 생성 로직

**변경 내용**:
```typescript
// 배출구 정보 조회 시 id 포함
const { data: outlets } = await supabaseAdmin
  .from('discharge_outlets')
  .select(`
    id,                    // ✅ UUID 추가
    outlet_number,
    outlet_name,
    gateway_number,        // ✅ 게이트웨이 정보도 포함
    vpn_type,              // ✅ VPN 정보도 포함
    additional_info
  `)
  .eq('air_permit_id', permitId)
  .order('outlet_number');

// facilityNumbering 구성
const facilityNumbering = {
  outlets: outlets.map(outlet => ({
    id: outlet.id,                        // ✅ UUID 추가
    outletNumber: outlet.outlet_number,
    outletName: outlet.outlet_name,
    gateway_number: outlet.gateway_number, // ✅ 기존 게이트웨이 정보
    vpn_type: outlet.vpn_type,            // ✅ 기존 VPN 정보
    dischargeFacilities: [...],
    preventionFacilities: [...]
  }))
};
```

### Phase 2: TypeScript 타입 정의 업데이트

**파일**: `types/index.ts`

```typescript
export interface OutletInfo {
  id: string;                    // ✅ UUID 추가
  outletNumber: number;
  outletName?: string;
  gateway_number?: string;       // gateway1-50
  vpn_type?: '유선' | '무선';
  dischargeFacilities: FacilityInfo[];
  preventionFacilities: FacilityInfo[];
}

export interface FacilityNumbering {
  outlets: OutletInfo[];
}
```

### Phase 3: EnhancedFacilityInfoSection 검증

**파일**: `components/sections/EnhancedFacilityInfoSection.tsx`

**현재 코드 (이미 올바름)**:
```typescript
// Line 646
onChange={(e) => handleOutletGatewayChange(outlet.id, 'gateway_number', e.target.value)}

// Line 662
onClick={() => handleOutletGatewayChange(outlet.id, 'vpn_type', '유선')}
```

**검증**:
- `outlet.id`를 올바르게 사용하고 있음 ✅
- Phase 1 완료 후 자동으로 작동할 것

### Phase 4: 데이터 새로고침 로직 추가 (선택사항)

**파일**: `components/sections/EnhancedFacilityInfoSection.tsx`

**목적**: 게이트웨이 업데이트 후 UI 즉시 반영

**현재**:
```typescript
// Line 203-206
if (result.success) {
  console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');
  // facilityNumbering 데이터 새로고침 필요 시 onFacilitiesUpdate 호출
  // 현재는 로컬 상태만 업데이트하고, 페이지 새로고침 시 최신 데이터 로드됨
}
```

**개선 옵션 1: 로컬 상태 업데이트**
```typescript
if (result.success) {
  console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');

  // facilityNumbering 로컬 상태 업데이트
  const updatedOutlets = facilityNumbering.outlets.map((o: any) =>
    o.id === outletId
      ? { ...o, [field]: value }
      : o
  );

  // 부모 컴포넌트에 업데이트 전달 (필요시)
  // onFacilityNumberingUpdate?.({ outlets: updatedOutlets });
}
```

**개선 옵션 2: 데이터 재조회** (더 확실함)
```typescript
if (result.success) {
  console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');

  // 부모 컴포넌트의 데이터 재조회 트리거
  // onRefresh?.();
}
```

## 구현 순서

### Step 1: facilityNumbering 데이터 소스 찾기
```bash
# facilityNumbering이 어디서 생성되는지 확인
grep -r "facilityNumbering" app/api/
grep -r "facilityNumbering" app/business/
```

### Step 2: 데이터 조회 API 수정
- `discharge_outlets` 조회 시 `id` 필드 포함
- `gateway_number`, `vpn_type` 필드도 함께 포함 (이미 있어야 함)

### Step 3: TypeScript 타입 업데이트
- `OutletInfo` 인터페이스에 `id: string` 추가
- 타입 체크로 누락된 부분 확인

### Step 4: 테스트
1. 개발 서버 실행: `npm run dev`
2. 사업장 페이지 접속
3. 배출구 게이트웨이 설정 시도
4. 브라우저 콘솔/네트워크 탭 확인
5. 데이터베이스 업데이트 확인

## 예상 결과

### Before (현재)
```
[브라우저]
- outlet.id = undefined
- API 호출: PUT /api/air-permits/outlets/undefined
- 오류: 500 Internal Server Error

[서버]
- 배출구 게이트웨이 정보 업데이트: undefined
- 오류: invalid input syntax for type uuid: "undefined"
```

### After (수정 후)
```
[브라우저]
- outlet.id = "123e4567-e89b-12d3-a456-426614174000"
- API 호출: PUT /api/air-permits/outlets/123e4567-e89b-12d3-a456-426614174000
- 성공: 200 OK

[서버]
- 배출구 게이트웨이 정보 업데이트: 123e4567-e89b-12d3-a456-426614174000
- ✅ 게이트웨이 정보 업데이트 완료

[데이터베이스]
- discharge_outlets 테이블 업데이트
  - gateway_number: 'gateway1'
  - vpn_type: '유선'
  - updated_at: NOW()
```

## 추가 고려사항

### 1. 데이터베이스 마이그레이션 확인
```sql
-- discharge_outlets 테이블에 gateway_number, vpn_type 컬럼이 있는지 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'discharge_outlets'
  AND column_name IN ('gateway_number', 'vpn_type');
```

마이그레이션이 실행되지 않았다면:
```bash
# Supabase SQL 에디터에서 실행
# sql/add_outlet_gateway_columns.sql
```

### 2. 에러 핸들링 개선
```typescript
// EnhancedFacilityInfoSection.tsx
const handleOutletGatewayChange = async (outletId: string, field: 'gateway_number' | 'vpn_type', value: string) => {
  // ✅ 유효성 검사 추가
  if (!outletId || outletId === 'undefined') {
    console.error('❌ 배출구 ID가 유효하지 않습니다:', outletId);
    alert('배출구 정보를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
    return;
  }

  try {
    const response = await fetch(`/api/air-permits/outlets/${outletId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');
    } else {
      console.error('❌ 배출구 게이트웨이 정보 업데이트 실패:', result.message);
      alert(`업데이트 실패: ${result.message}`);
    }
  } catch (error) {
    console.error('❌ 배출구 게이트웨이 정보 업데이트 오류:', error);
    alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
  }
};
```

### 3. 로딩 상태 추가 (UX 개선)
```typescript
const [updatingOutletId, setUpdatingOutletId] = useState<string | null>(null);

const handleOutletGatewayChange = async (outletId: string, field: 'gateway_number' | 'vpn_type', value: string) => {
  setUpdatingOutletId(outletId);
  try {
    // ... API 호출
  } finally {
    setUpdatingOutletId(null);
  }
};

// UI에서 로딩 표시
{updatingOutletId === outlet.id && (
  <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
    <Loader className="w-5 h-5 animate-spin text-teal-600" />
  </div>
)}
```

## 관련 파일

- `components/sections/EnhancedFacilityInfoSection.tsx` - 게이트웨이 설정 UI
- `app/api/air-permits/outlets/[outletId]/route.ts` - 게이트웨이 업데이트 API
- `app/api/facilities/route.ts` (또는 유사 파일) - facilityNumbering 데이터 생성
- `types/index.ts` - TypeScript 타입 정의
- `sql/add_outlet_gateway_columns.sql` - 데이터베이스 마이그레이션
