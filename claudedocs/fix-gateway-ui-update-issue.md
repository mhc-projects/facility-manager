# 게이트웨이 UI 업데이트 문제 해결

## 문제 상황

### 증상
- 게이트웨이 번호 또는 VPN 타입 선택 시 API 호출은 성공 (200 OK)
- 하지만 UI에 선택한 값이 표시되지 않음
- 페이지 새로고침 후에는 선택한 값이 표시됨

### 서버 로그 분석
```
📊 [OUTLET-GATEWAY] 배출구 게이트웨이 정보 업데이트: xxx { gateway_number: 'gateway1', vpn_type: undefined }
✅ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 완료

📊 [OUTLET-GATEWAY] 배출구 게이트웨이 정보 업데이트: xxx { gateway_number: undefined, vpn_type: '무선' }
✅ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 완료
```

**문제점**:
1. 게이트웨이 번호 선택 시 → `vpn_type: undefined`로 전송 → 기존 VPN 값 삭제됨
2. VPN 타입 선택 시 → `gateway_number: undefined`로 전송 → 기존 게이트웨이 값 삭제됨

## 근본 원인 분석

### 데이터 흐름
```
[UI 이벤트]
  └─ handleOutletGatewayChange(outletId, field, value)
     └─ fetch PUT /api/air-permits/outlets/${outletId}
        └─ body: { [field]: value }  // ❌ 한 필드만 전송
           ├─ gateway_number 선택 → { gateway_number: 'gateway1' }
           │  └─ API에서 vpn_type이 없어서 undefined로 업데이트
           └─ vpn_type 선택 → { vpn_type: '유선' }
              └─ API에서 gateway_number가 없어서 undefined로 업데이트

[데이터베이스]
  ├─ 선택 전: { gateway_number: 'gateway1', vpn_type: '유선' }
  ├─ gateway2 선택 후: { gateway_number: 'gateway2', vpn_type: null }  // ❌ VPN 삭제됨
  └─ 무선 선택 후: { gateway_number: null, vpn_type: '무선' }  // ❌ 게이트웨이 삭제됨

[UI 상태]
  └─ facilityNumbering.outlets[].gateway_number, vpn_type
     └─ API 응답에서 업데이트된 값 반영 안 됨 ❌
        └─ 페이지 새로고침 시에만 최신 데이터 로드됨
```

### 문제점 정리

1. **API 요청 데이터 불완전**:
   - 한 필드만 전송하면 다른 필드가 `undefined`로 전송됨
   - Supabase는 `undefined` 필드를 `null`로 업데이트함

2. **UI 상태 업데이트 누락**:
   - API 호출 성공 후 로컬 상태(`facilityNumbering`) 업데이트 안 됨
   - 페이지 새로고침 시에만 최신 데이터 반영됨

## 해결 방안

### 방안 1: API 부분 업데이트 (PATCH 방식) - 권장

**장점**:
- RESTful 원칙에 부합 (PATCH는 부분 업데이트용)
- 클라이언트 코드 변경 최소화
- 다른 필드에 영향 없음

**단점**:
- API 로직 수정 필요

**구현**:

#### API 수정 ([app/api/air-permits/outlets/[outletId]/route.ts](app/api/air-permits/outlets/[outletId]/route.ts))

```typescript
// PUT - 배출구 게이트웨이 정보 업데이트
export async function PUT(
  request: NextRequest,
  { params }: { params: { outletId: string } }
) {
  try {
    const { outletId } = params;
    const body = await request.json();
    const { gateway_number, vpn_type } = body;

    // ✅ undefined 필드는 업데이트에서 제외 (부분 업데이트)
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (gateway_number !== undefined) {
      // 게이트웨이 번호 형식 검증
      if (gateway_number && !/^gateway([1-9]|[1-4][0-9]|50)$/.test(gateway_number)) {
        return NextResponse.json({
          success: false,
          message: '게이트웨이 번호 형식이 올바르지 않습니다. (gateway1 ~ gateway50)'
        }, { status: 400 });
      }
      updateData.gateway_number = gateway_number || null;
    }

    if (vpn_type !== undefined) {
      // VPN 타입 검증
      if (vpn_type && !['유선', '무선'].includes(vpn_type)) {
        return NextResponse.json({
          success: false,
          message: 'VPN 연결 방식은 유선 또는 무선이어야 합니다.'
        }, { status: 400 });
      }
      updateData.vpn_type = vpn_type || null;
    }

    console.log(`📊 [OUTLET-GATEWAY] 배출구 게이트웨이 정보 업데이트: ${outletId}`, updateData);

    const { data, error } = await supabaseAdmin
      .from('discharge_outlets')
      .update(updateData)
      .eq('id', outletId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 완료`);

    return NextResponse.json({
      success: true,
      message: '배출구 게이트웨이 정보가 성공적으로 업데이트되었습니다.',
      data: {
        outlet: data
      }
    });
  } catch (error) {
    console.error('❌ [OUTLET-GATEWAY] 게이트웨이 정보 업데이트 실패:', error);
    return NextResponse.json({
      success: false,
      message: '게이트웨이 정보 업데이트 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}
```

#### UI 상태 업데이트 추가 ([components/sections/EnhancedFacilityInfoSection.tsx](components/sections/EnhancedFacilityInfoSection.tsx))

```typescript
// 배출구 게이트웨이 정보 변경 핸들러
const handleOutletGatewayChange = async (outletId: string, field: 'gateway_number' | 'vpn_type', value: string) => {
  if (!outletId || outletId === 'undefined') {
    console.error('❌ 배출구 ID가 유효하지 않습니다:', outletId);
    alert('배출구 정보를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
    return;
  }

  try {
    const response = await fetch(`/api/air-permits/outlets/${outletId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        [field]: value || null
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');

      // ✅ UI 상태 업데이트: facilityNumbering 로컬 상태 갱신
      if (facilityNumbering?.outlets) {
        const updatedOutlets = facilityNumbering.outlets.map((outlet: any) =>
          outlet.id === outletId
            ? { ...outlet, [field]: value || null }
            : outlet
        );

        // 부모 컴포넌트에 업데이트된 facilityNumbering 전달
        // onFacilityNumberingUpdate?.({ ...facilityNumbering, outlets: updatedOutlets });

        // 또는 로컬 상태만 업데이트 (prop으로 받은 경우 직접 수정 불가)
        // setLocalFacilityNumbering({ ...facilityNumbering, outlets: updatedOutlets });
      }
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

### 방안 2: 클라이언트에서 전체 필드 전송

**장점**:
- API 수정 불필요
- 간단한 구현

**단점**:
- 클라이언트가 outlet 객체 전체를 알아야 함
- 불필요한 데이터 전송

**구현**:

```typescript
// EnhancedFacilityInfoSection.tsx
const handleOutletGatewayChange = async (
  outlet: any, // ✅ outlet 객체 전체를 받음
  field: 'gateway_number' | 'vpn_type',
  value: string
) => {
  if (!outlet?.id || outlet.id === 'undefined') {
    console.error('❌ 배출구 ID가 유효하지 않습니다:', outlet?.id);
    alert('배출구 정보를 불러오는 중 오류가 발생했습니다.');
    return;
  }

  try {
    const response = await fetch(`/api/air-permits/outlets/${outlet.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // ✅ 기존 값 + 변경된 값 병합
        gateway_number: field === 'gateway_number' ? value : outlet.gateway_number,
        vpn_type: field === 'vpn_type' ? value : outlet.vpn_type
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');

      // UI 상태 업데이트 (방안 1과 동일)
      // ...
    }
  } catch (error) {
    console.error('❌ 배출구 게이트웨이 정보 업데이트 오류:', error);
  }
};
```

UI 호출 부분 수정:
```typescript
// 기존
onChange={(e) => handleOutletGatewayChange(outlet.id, 'gateway_number', e.target.value)}

// 변경 후
onChange={(e) => handleOutletGatewayChange(outlet, 'gateway_number', e.target.value)}
```

### 방안 3: React State 관리 강화

**최선의 해결책**: 방안 1 (API 부분 업데이트) + UI 상태 관리

```typescript
// EnhancedFacilityInfoSection.tsx
const [localFacilityNumbering, setLocalFacilityNumbering] = useState(facilityNumbering);

// props 변경 시 로컬 상태 동기화
useEffect(() => {
  setLocalFacilityNumbering(facilityNumbering);
}, [facilityNumbering]);

const handleOutletGatewayChange = async (outletId: string, field: 'gateway_number' | 'vpn_type', value: string) => {
  // ... API 호출

  if (result.success) {
    console.log('✅ 배출구 게이트웨이 정보 업데이트 성공');

    // ✅ 로컬 상태 즉시 업데이트
    setLocalFacilityNumbering(prev => {
      if (!prev?.outlets) return prev;

      return {
        ...prev,
        outlets: prev.outlets.map((outlet: any) =>
          outlet.id === outletId
            ? { ...outlet, [field]: value || null }
            : outlet
        )
      };
    });
  }
};

// UI 렌더링 시 localFacilityNumbering 사용
{localFacilityNumbering?.outlets && localFacilityNumbering.outlets.map((outlet: any) => (
  // ...
))}
```

## 권장 구현 순서

### Step 1: API 부분 업데이트 구현
- `app/api/air-permits/outlets/[outletId]/route.ts` 수정
- `undefined` 필드는 업데이트에서 제외

### Step 2: UI 상태 관리 추가
- `EnhancedFacilityInfoSection.tsx`에 로컬 상태 추가
- API 성공 시 로컬 상태 즉시 업데이트

### Step 3: 테스트
1. 게이트웨이 번호 선택
2. VPN 타입 선택
3. 두 값이 모두 UI에 즉시 반영되는지 확인
4. 데이터베이스에 두 값이 모두 저장되는지 확인

## 예상 결과

### Before (문제)
```
[UI] gateway1 선택
[API] { gateway_number: 'gateway1', vpn_type: undefined }
[DB] gateway_number='gateway1', vpn_type=NULL  // ❌ VPN 삭제됨
[UI] gateway1 표시 안 됨 ❌

[UI] 무선 선택
[API] { gateway_number: undefined, vpn_type: '무선' }
[DB] gateway_number=NULL, vpn_type='무선'  // ❌ 게이트웨이 삭제됨
[UI] 무선 표시 안 됨 ❌
```

### After (해결)
```
[UI] gateway1 선택
[API] { gateway_number: 'gateway1' }  // vpn_type은 전송 안 함
[DB] gateway_number='gateway1', vpn_type='유선'  // ✅ 기존 VPN 유지
[UI] gateway1 즉시 표시 ✅

[UI] 무선 선택
[API] { vpn_type: '무선' }  // gateway_number는 전송 안 함
[DB] gateway_number='gateway1', vpn_type='무선'  // ✅ 기존 게이트웨이 유지
[UI] 무선 즉시 표시 ✅
```

## 관련 파일

- `app/api/air-permits/outlets/[outletId]/route.ts` - API 부분 업데이트 로직
- `components/sections/EnhancedFacilityInfoSection.tsx` - UI 상태 관리
- `app/business/[businessName]/BusinessContent.tsx` - facilityNumbering 데이터 소스
