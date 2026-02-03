# 게이트웨이 저장 후 UI 동기화 문제 설계 분석

## 문제 상황

### 증상
1. 편집 페이지에서 게이트웨이 정보 수정 (예: A → B)
2. 저장 버튼 클릭 → Toast 성공 메시지 표시 ✅
3. **편집 화면에 수정 전 게이트웨이 A 표시됨** ❌
4. admin/air-permit 목록으로 이동 → 수정한 게이트웨이 B 표시됨 ✅
5. 다시 편집 페이지로 돌아옴 → **수정 전 게이트웨이 A 표시됨** ❌

### 핵심 문제
**저장은 성공했지만 편집 화면의 게이트웨이가 즉시 업데이트되지 않음**

## 근본 원인 분석

### 1. 상태 관리 구조

현재 게이트웨이 정보는 **두 곳**에 저장됨:

```typescript
// 1. permitDetail state (서버에서 불러온 원본 데이터)
const [permitDetail, setPermitDetail] = useState<AirPermitDetail | null>(null)
// permitDetail.outlets[n].additional_info.gateway

// 2. gatewayAssignments state (편집 중인 게이트웨이 할당)
const [gatewayAssignments, setGatewayAssignments] = useState<{[outletId: string]: string}>({})
```

### 2. UI 렌더링 로직 (Line 1516)

```typescript
// Line 1516 - 게이트웨이 표시 로직
const currentGateway = gatewayAssignments[outlet.id] ?? outlet.additional_info?.gateway ?? ''
```

**우선순위**:
1. `gatewayAssignments[outlet.id]` (편집 중인 값)
2. `outlet.additional_info?.gateway` (서버 원본)

### 3. 저장 프로세스 흐름

```typescript
// Line 724-732 - 저장 후 UI 업데이트
flushSync(() => {
  setPermitDetail(refreshData.data)         // ✅ 서버에서 최신 데이터 받아옴
  setOriginalPermitDetail(refreshData.data)  // ✅ 원본 백업
  setGatewayAssignments(newAssignments)      // ✅ 게이트웨이 할당도 업데이트
  setFacilityNumbering(newNumbering)         // ✅ 시설 번호 재생성
})
```

**이론상 완벽**: `flushSync()`로 동기 업데이트, `gatewayAssignments`도 새 값으로 설정

### 4. 실제 발생하는 문제

#### 가능한 원인 1: API 응답 데이터 불일치

```typescript
// Line 713-717 - newAssignments 생성
const newAssignments: {[outletId: string]: string} = {}
refreshData.data.outlets.forEach((outlet: any) => {
  newAssignments[outlet.id] = outlet.additional_info?.gateway || ''
  console.log(`🔍 [RELOAD] 배출구 ${outlet.outlet_number} (ID: ${outlet.id}): gateway = "${outlet.additional_info?.gateway}"`)
})
```

**문제 가능성**:
- `refreshData.data` (outlet-facility API)의 `additional_info.gateway`가 **저장 직후에도 예전 값을 반환**할 수 있음
- Primary DB 조회가 아니거나, 트랜잭션이 완료되기 전에 조회했을 가능성

#### 가능한 원인 2: 컴포넌트 리렌더링 타이밍

```typescript
// Line 360-370 - handleGatewayChange
const handleGatewayChange = useCallback((outletId: string, gateway: string) => {
  console.log('🎯 게이트웨이 변경 감지:', { outletId, gateway })

  setGatewayAssignments(prev => {
    if (prev[outletId] === gateway) return prev // 중복 업데이트 방지
    return {
      ...prev,
      [outletId]: gateway
    }
  })
}, [])
```

**문제 가능성**:
- 사용자가 게이트웨이를 A → B로 변경
- `gatewayAssignments[outletId] = "B"` 설정됨
- 저장 성공 후 `setGatewayAssignments(newAssignments)`
- `newAssignments[outletId] = "A"` (서버가 예전 값 반환)
- **결과**: UI가 다시 A로 롤백됨

#### 가능한 원인 3: React 배치 업데이트 충돌

`flushSync()` 내부:
```typescript
flushSync(() => {
  setPermitDetail(refreshData.data)          // State 1 업데이트
  setOriginalPermitDetail(refreshData.data)  // State 2 업데이트
  setGatewayAssignments(newAssignments)      // State 3 업데이트
  setFacilityNumbering(newNumbering)         // State 4 업데이트
})
```

**문제 가능성**:
- 4개의 state 업데이트가 동시에 발생
- React가 리렌더링을 스케줄링하는 과정에서 타이밍 이슈 발생
- Toast 표시와 겹쳐서 렌더링 순서가 꼬일 수 있음

## 디버깅 전략

### 1. 서버 응답 데이터 검증

**추가할 로그**:
```typescript
// Line 713-720 수정
const newAssignments: {[outletId: string]: string} = {}
refreshData.data.outlets.forEach((outlet: any) => {
  const serverGateway = outlet.additional_info?.gateway || ''
  const currentUIGateway = gatewayAssignments[outlet.id] || ''

  newAssignments[outlet.id] = serverGateway

  console.log(`🔍 [RELOAD] 배출구 ${outlet.outlet_number} (ID: ${outlet.id}):`)
  console.log(`  - 서버 응답: "${serverGateway}"`)
  console.log(`  - 현재 UI: "${currentUIGateway}"`)
  console.log(`  - 일치 여부: ${serverGateway === currentUIGateway ? '✅' : '❌'}`)
})
```

### 2. State 업데이트 추적

**추가할 로그**:
```typescript
// Line 724-732 수정
flushSync(() => {
  console.log('🔄 [SYNC] flushSync 시작 - 이전 상태:', gatewayAssignments)
  setPermitDetail(refreshData.data)
  setOriginalPermitDetail(refreshData.data)
  setGatewayAssignments(newAssignments)
  setFacilityNumbering(newNumbering)
  console.log('🔄 [SYNC] flushSync 완료 - 새 상태:', newAssignments)
})

// flushSync 직후 확인
console.log('🔍 [VERIFY] flushSync 직후 gatewayAssignments:', gatewayAssignments)
```

### 3. 렌더링 시점 검증

**컴포넌트 렌더링 시점 로그**:
```typescript
// 렌더링 함수 상단에 추가
console.log('🎨 [RENDER] 컴포넌트 렌더링:', {
  permitDetailId: permitDetail?.id,
  outletCount: permitDetail?.outlets?.length,
  gatewayAssignments: Object.entries(gatewayAssignments).map(([id, gw]) => `${id}:${gw}`)
})
```

## 해결 방안

### 방안 1: 저장 API에 forcePrimary 추가 (권장)

**문제**: outlet-facility API가 Primary DB를 조회하지 않을 수 있음

**해결**:
```typescript
// Line 656 - outlet-facility API 호출
const response = await fetch('/api/outlet-facility?forcePrimary=true', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updatePayload)
})
```

**또한 재조회 API도 수정**:
```typescript
// Line 665 - 재조회
const refreshResponse = await fetch(
  `/api/outlet-facility?permitId=${permitDetail.id}&forcePrimary=true`,
  { cache: 'no-store' }
)
```

### 방안 2: Optimistic UI Update (즉시 반영)

**개념**: 서버 응답을 기다리지 않고 사용자가 선택한 값을 즉시 UI에 반영

**구현**:
```typescript
// handleSave 시작 부분에 추가
const handleSave = async () => {
  // ... 기존 코드 ...

  // ✅ 1. Optimistic Update - 사용자가 선택한 값을 즉시 UI에 반영
  const optimisticAssignments = { ...gatewayAssignments }

  try {
    // API 호출 전에 UI 먼저 업데이트
    flushSync(() => {
      setGatewayAssignments(optimisticAssignments)
    })

    // ... 저장 로직 ...

    // 저장 성공 후에도 optimistic 값 유지
    if (refreshData?.data) {
      const newAssignments: {[outletId: string]: string} = {}
      refreshData.data.outlets.forEach((outlet: any) => {
        // ✅ 서버 응답이 비어있으면 optimistic 값 사용
        newAssignments[outlet.id] = outlet.additional_info?.gateway || optimisticAssignments[outlet.id] || ''
      })

      flushSync(() => {
        setPermitDetail(refreshData.data)
        setOriginalPermitDetail(refreshData.data)
        setGatewayAssignments(newAssignments)
        setFacilityNumbering(newNumbering)
      })
    }
  } catch (error) {
    // 실패 시 rollback (이미 구현되어 있음)
    setGatewayAssignments(originalGatewayAssignments)
  }
}
```

### 방안 3: 저장 후 페이지 완전 새로고침

**가장 확실하지만 UX는 좋지 않음**:
```typescript
// 저장 성공 후
if (!wasNewPermit) {
  setToast({ message: '변경사항이 저장되었습니다', type: 'success' })

  // 1초 후 페이지 새로고침
  setTimeout(() => {
    window.location.reload()
  }, 1000)
}
```

### 방안 4: permitId 변경 트리거 (Hack)

**아이디어**: `permitId` URL 파라미터를 변경하여 `loadData()` 강제 실행

```typescript
// 저장 성공 후
if (!wasNewPermit) {
  setToast({ message: '변경사항이 저장되었습니다', type: 'success' })

  // URL 파라미터에 타임스탬프 추가하여 loadData 트리거
  const currentUrl = new URL(window.location.href)
  currentUrl.searchParams.set('_t', Date.now().toString())
  window.history.replaceState({}, '', currentUrl.toString())

  // loadData 강제 실행
  await loadData()
}
```

## 권장 솔루션 (단계별)

### Phase 1: 디버깅 (먼저 확인)
1. 로그 추가하여 서버 응답 데이터 확인
2. `refreshData.data.outlets[n].additional_info.gateway` 값 검증
3. `newAssignments`와 `gatewayAssignments` 비교

### Phase 2: Quick Fix (즉시 적용)
1. **방안 1**: outlet-facility API에 `forcePrimary=true` 추가
2. **방안 2**: Optimistic UI Update 적용

### Phase 3: Long-term Fix (추후 개선)
1. React Query 도입하여 캐싱 및 리페칭 전략 체계화
2. 상태 관리 단순화 (permitDetail과 gatewayAssignments 통합)

## 구현 우선순위

### 1순위: forcePrimary 파라미터 추가
- **난이도**: 낮음
- **영향도**: 중간
- **리스크**: 낮음
- **예상 효과**: 서버 응답 데이터 일관성 보장

### 2순위: Optimistic UI Update
- **난이도**: 중간
- **영향도**: 높음
- **리스크**: 중간 (rollback 로직 필요)
- **예상 효과**: 즉각적인 UI 반영, UX 개선

### 3순위: 디버깅 로그 추가
- **난이도**: 낮음
- **영향도**: 낮음 (진단용)
- **리스크**: 없음
- **예상 효과**: 문제 근본 원인 파악

## 예상 구현 시간

- **디버깅 로그 추가**: 10분
- **forcePrimary 파라미터**: 5분
- **Optimistic UI Update**: 30분
- **전체 테스트 및 검증**: 20분

**총 소요 시간**: 약 1시간

## 추가 고려사항

### API 응답 시간
- outlet-facility API 응답 속도 확인
- 느린 경우 Optimistic Update가 더 중요함

### 트랜잭션 일관성
- outlet-facility PUT → air-permit GET 사이의 트랜잭션 보장 여부
- Supabase Primary/Replica 복제 지연 확인

### 에러 처리
- 저장 성공 but 재조회 실패 시나리오 대비
- Rollback 로직 강화 (이미 구현되어 있음)

## 결론

**핵심 문제**: 저장 후 서버에서 반환하는 게이트웨이 값이 예전 값일 가능성

**즉시 조치**:
1. outlet-facility API에 `forcePrimary=true` 추가
2. 디버깅 로그로 서버 응답 검증
3. Optimistic UI Update 적용 검토

**기대 효과**:
- 저장 즉시 UI 업데이트 ✅
- 페이지 재진입 시에도 최신 데이터 표시 ✅
- 일관된 사용자 경험 제공 ✅
