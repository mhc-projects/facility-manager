# 대기필증 편집 페이지 실시간 데이터 반영 설계

## 1. 문제 분석

### 현재 상황
- 사용자가 대기필증 수정 후 저장 버튼 클릭 → 성공 메시지 표시
- **문제점**: 저장 전 데이터가 여전히 화면에 표시됨 (수정 내용이 즉시 반영되지 않음)
- 사용자가 새로고침해야만 수정된 내용을 볼 수 있음

### 원인 분석

#### ✅ 이미 구현된 기능
현재 코드는 실시간 UI 업데이트를 위한 로직이 **이미 구현되어 있음**:

1. **즉시 UI 업데이트** (Line 667-673)
```typescript
// 🚀 즉시 UI 업데이트: API 응답 데이터로 먼저 업데이트 (사용자에게 즉각 반영)
if (airPermitData.data) {
  flushSync(() => {
    setPermitDetail(airPermitData.data)
    console.log('✅ [handleSave] 즉시 UI 업데이트 완료 (API 응답 데이터)')
  })
}
```

2. **백그라운드 재조회** (Line 677-834)
```typescript
// 🔧 READ-AFTER-WRITE 일관성 보장: 백그라운드에서 Primary DB 재조회 (replica lag 보정)
setTimeout(async () => {
  // 500ms 후 Primary DB에서 최신 데이터 재조회
  const refreshResponse = await fetch(`/api/air-permit?id=${actualPermitId}&details=true&forcePrimary=true`)

  // flushSync로 즉시 동기 업데이트
  flushSync(() => {
    setPermitDetail(refreshData.data)
    setOriginalPermitDetail(refreshData.data)
    setGatewayAssignments(newAssignments)
    setFacilityNumbering(newNumbering)
  })
}, 500)
```

#### ❓ 잠재적 원인

**가능성 1: 편집 모드 상태 문제**
```typescript
// Line 840: 저장 후 편집모드 해제
setIsEditing(false)
```
- 편집모드가 해제되면서 UI가 편집 전 상태로 되돌아갈 가능성
- 편집모드와 읽기 모드에서 다른 데이터를 참조할 수 있음

**가능성 2: 상태 업데이트 타이밍**
```typescript
// Line 718-727: flushSync 사용 중
flushSync(() => {
  setPermitDetail(refreshData.data)
  setOriginalPermitDetail(refreshData.data)
  setGatewayAssignments(newAssignments)
  setFacilityNumbering(newNumbering)
})
```
- `flushSync`는 동기 업데이트를 보장하지만, React 18의 자동 배칭과 충돌 가능
- 여러 state를 동시에 업데이트할 때 일부만 반영될 수 있음

**가능성 3: 게이트웨이 할당 로직**
```typescript
// Line 1505-1509: 편집 중 vs 저장 후 데이터 참조 우선순위
const currentGateway = isEditing
  ? (gatewayAssignments[outlet.id] ?? outlet.additional_info?.gateway ?? '')
  : (outlet.additional_info?.gateway ?? gatewayAssignments[outlet.id] ?? '')
```
- `isEditing`이 false가 되면 `outlet.additional_info?.gateway` 우선 참조
- 만약 API 응답에 gateway 정보가 없으면 빈 값으로 표시될 수 있음

## 2. 해결 방안

### Option 1: 편집모드 유지 (권장)
대기필증 상세 페이지는 항상 편집 가능한 상태로 유지하고, 저장 후에도 편집모드를 유지

#### 구현 방법
```typescript
// Line 840: 편집모드 해제 로직 제거 또는 주석 처리
// setIsEditing(false)  // ❌ 제거
```

#### 장점
- 사용자가 연속으로 수정할 수 있어 UX 향상
- 상태 전환으로 인한 UI 깜빡임 방지
- 편집 중/읽기 모드 데이터 참조 우선순위 문제 해결

#### 단점
- 없음 (현재 페이지가 이미 편집 전용 페이지로 설계됨)

### Option 2: 상태 업데이트 통합
여러 state 업데이트를 하나의 객체로 통합하여 원자적 업데이트 보장

#### 구현 방법
```typescript
// Line 718-727: 단일 state로 통합
const [pageState, setPageState] = useState({
  permitDetail: null,
  originalPermitDetail: null,
  gatewayAssignments: {},
  facilityNumbering: {}
})

// 저장 후 업데이트
setPageState({
  permitDetail: refreshData.data,
  originalPermitDetail: refreshData.data,
  gatewayAssignments: newAssignments,
  facilityNumbering: newNumbering
})
```

#### 장점
- 원자적 업데이트로 일관성 보장
- React 배칭 문제 회피

#### 단점
- 기존 코드 대대적 리팩토링 필요
- 컴포넌트 전체 리렌더링 가능성

### Option 3: 강제 리렌더링 추가
상태 업데이트 후 추가적인 강제 리렌더링 트리거

#### 구현 방법
```typescript
// Line 727 이후: 강제 리렌더링 트리거 추가
const [, forceUpdate] = useReducer(x => x + 1, 0)

// 상태 업데이트 후
flushSync(() => {
  setPermitDetail(refreshData.data)
  setOriginalPermitDetail(refreshData.data)
  setGatewayAssignments(newAssignments)
  setFacilityNumbering(newNumbering)
})
forceUpdate()  // 강제 리렌더링
```

#### 장점
- 최소한의 코드 변경
- 확실한 UI 업데이트 보장

#### 단점
- 불필요한 리렌더링 발생
- React 권장 패턴 위배

## 3. 권장 구현 (Option 1)

### 변경 사항

#### 파일: `app/admin/air-permit-detail/page.tsx`

**수정 1: 저장 후 편집모드 유지**
```typescript
// Line 838-840: 기존 코드
// gatewayAssignments는 위에서 재초기화되므로 여기서 초기화하지 않음
// 항상 편집모드이므로 종료하지 않음
// 즉시 편집모드 해제
setIsEditing(false)  // ❌ 이 줄을 주석 처리 또는 제거

// 수정 후
// gatewayAssignments는 위에서 재초기화되므로 여기서 초기화하지 않음
// ✅ 편집모드 유지: 저장 후에도 계속 편집 가능하도록 유지
// setIsEditing(false) // 제거: 항상 편집모드 유지
```

**수정 2: 게이트웨이 참조 로직 단순화 (선택사항)**
```typescript
// Line 1505-1509: 기존 코드
const currentGateway = isEditing
  ? (gatewayAssignments[outlet.id] ?? outlet.additional_info?.gateway ?? '')
  : (outlet.additional_info?.gateway ?? gatewayAssignments[outlet.id] ?? '')

// 수정 후 (항상 편집모드이므로 간소화 가능)
// ✅ 항상 gatewayAssignments 우선 참조 (실시간 편집 반영)
const currentGateway = gatewayAssignments[outlet.id] ?? outlet.additional_info?.gateway ?? ''
```

### 예상 효과
1. ✅ 저장 즉시 UI 업데이트 (새로고침 불필요)
2. ✅ 연속 편집 가능 (UX 향상)
3. ✅ 상태 전환 없음 (깜빡임 방지)
4. ✅ 최소한의 코드 변경

## 4. 테스트 시나리오

### 테스트 1: 기본 저장 및 UI 업데이트
1. 대기필증 편집 페이지 접속
2. 배출시설 용량 수정 (예: "100" → "200")
3. 저장 버튼 클릭
4. **예상 결과**: 저장 메시지 표시 + 즉시 "200 m³" 표시 (새로고침 불필요)

### 테스트 2: 게이트웨이 할당 저장
1. 배출구에 게이트웨이 할당 (예: Gateway 1)
2. 저장 버튼 클릭
3. **예상 결과**: 저장 메시지 표시 + 즉시 "Gateway 1" 배지 표시

### 테스트 3: 연속 편집
1. 시설 정보 수정 후 저장
2. 저장 직후 다른 시설 정보 수정
3. **예상 결과**: 새로고침 없이 연속 편집 가능

### 테스트 4: 새 시설 추가
1. "배출시설 추가" 버튼 클릭
2. 시설 정보 입력 후 저장
3. **예상 결과**: 저장 메시지 표시 + 새 시설이 목록에 즉시 표시

## 5. 구현 파일

### 수정 대상 파일
- `app/admin/air-permit-detail/page.tsx` (Line 840, 선택적으로 Line 1505-1509)

### 관련 파일 (참고용)
- `/api/air-permit` - 대기필증 CRUD API
- `lib/database-service.ts` - 데이터베이스 서비스
- `utils/facility-numbering.ts` - 시설 번호 생성 유틸

## 6. 롤백 계획

만약 문제가 발생하면:
1. `setIsEditing(false)` 복원
2. Git으로 이전 커밋 복원: `git revert HEAD`

## 7. 결론

현재 코드는 실시간 UI 업데이트를 위한 모든 로직이 구현되어 있습니다. 단지 **저장 후 편집모드를 해제하는 로직 (Line 840)** 때문에 UI가 초기 상태로 되돌아가는 것으로 추정됩니다.

**해결책**: `setIsEditing(false)` 한 줄만 제거하면 즉시 해결될 가능성이 높습니다.
