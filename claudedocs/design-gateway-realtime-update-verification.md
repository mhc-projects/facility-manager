# 게이트웨이 정보 실시간 반영 검증 및 설계

## 1. 현재 상태 분석

### ✅ 이미 구현된 실시간 반영 메커니즘

#### 1.1 게이트웨이 변경 핸들러 (Line 356-366)
```typescript
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

**특징:**
- `useCallback`으로 최적화된 함수
- 중복 업데이트 방지 로직
- 즉시 state 업데이트 → React 리렌더링 트리거

#### 1.2 게이트웨이 표시 로직 (Line 1504-1507)
```typescript
// ✅ 항상 편집모드이므로 gatewayAssignments state 우선 참조 (실시간 편집 반영)
const currentGateway = gatewayAssignments[outlet.id] ?? outlet.additional_info?.gateway ?? ''
const gatewayColor = getGatewayColorClass(currentGateway)
```

**특징:**
- `gatewayAssignments` state 우선 참조
- 실시간 편집 내용이 즉시 반영
- 색상도 동적으로 변경

#### 1.3 게이트웨이 선택 UI (Line 1536-1546)
```typescript
<select
  value={currentGateway}
  onChange={(e) => handleGatewayChange(outlet.id, e.target.value)}
  className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500"
>
  {generateGatewayOptions(gatewayAssignments).map((gw) => (
    <option key={gw.value} value={gw.value}>
      {gw.name}
    </option>
  ))}
</select>
```

**특징:**
- Controlled component (`value={currentGateway}`)
- 선택 시 즉시 `handleGatewayChange` 호출
- state 업데이트 → UI 즉시 반영

#### 1.4 게이트웨이 배지 표시 (Line 1524-1529)
```typescript
<div className="flex items-center gap-2">
  <span className="text-xs text-gray-500">게이트웨이:</span>
  <span className={`px-2 py-1 rounded-md text-xs font-medium ${gatewayColor}`}>
    {generateGatewayInfo(currentGateway).name}
  </span>
</div>
```

**특징:**
- `currentGateway` 기반 동적 표시
- 색상도 `gatewayColor`로 동적 변경
- state 변경 시 즉시 리렌더링

### ✅ 저장 후 데이터 재조회 (Line 677-834)
```typescript
// 🔧 READ-AFTER-WRITE 일관성 보장: 백그라운드에서 Primary DB 재조회
setTimeout(async () => {
  const refreshResponse = await fetch(`/api/air-permit?id=${actualPermitId}&details=true&forcePrimary=true`)

  // 게이트웨이 할당 정보 재초기화
  const newAssignments: {[outletId: string]: string} = {}
  refreshData.data.outlets.forEach((outlet: any) => {
    newAssignments[outlet.id] = outlet.additional_info?.gateway || ''
  })

  flushSync(() => {
    setPermitDetail(refreshData.data)
    setOriginalPermitDetail(refreshData.data)
    setGatewayAssignments(newAssignments)  // ✅ 게이트웨이도 재초기화
    setFacilityNumbering(newNumbering)
  })
}, 500)
```

**특징:**
- 저장 후 500ms 뒤 Primary DB에서 최신 데이터 재조회
- `gatewayAssignments` state도 DB 데이터로 재초기화
- `flushSync`로 동기적 UI 업데이트 보장

## 2. 실시간 반영 동작 흐름

### 편집 중 (저장 전)
```
사용자가 게이트웨이 선택
  ↓
handleGatewayChange 호출
  ↓
setGatewayAssignments(새 값)
  ↓
React 리렌더링
  ↓
currentGateway = gatewayAssignments[outlet.id] (즉시 반영)
  ↓
게이트웨이 배지 & 배경색 즉시 변경
```

### 저장 후
```
저장 버튼 클릭
  ↓
API PUT 요청 (게이트웨이 포함)
  ↓
API 응답으로 즉시 UI 업데이트 (Line 668-673)
  ↓
500ms 후 Primary DB 재조회 (Line 677)
  ↓
gatewayAssignments 재초기화 (Line 706-723)
  ↓
최신 DB 데이터로 UI 확정
```

## 3. 잠재적 문제점 분석

### 문제 1: 시각적 피드백 부족
**현상**: 게이트웨이를 변경해도 사용자가 변경되었는지 인지하기 어려울 수 있음

**원인**:
- 배경색 변경만으로는 미묘한 변화
- 명시적인 "저장되지 않음" 표시 없음

**영향도**: 낮음 (기능은 정상 작동)

### 문제 2: 편집 중 vs 저장 후 상태 구분 부족
**현상**: 사용자가 편집 중인 내용인지 저장된 내용인지 구분 어려움

**원인**:
- 이전에 `setIsEditing(false)`가 있었으나 제거됨
- 항상 편집 모드로 유지

**영향도**: 낮음 (UX 개선 여지)

### 문제 3: 저장 실패 시 롤백 로직에 게이트웨이 미포함
**현상**: 저장 실패 시 게이트웨이 할당이 롤백되지 않을 수 있음

**원인**:
```typescript
// Line 844-849: 실패 시 롤백
if (originalPermitDetail) {
  setPermitDetail(originalPermitDetail);  // ✅ permitDetail 롤백
}
// ❌ gatewayAssignments 롤백 없음
```

**영향도**: 중간 (저장 실패 시 불일치 발생 가능)

## 4. 개선 방안

### Option 1: 시각적 피드백 강화 (권장)
편집 중인 항목에 "미저장" 표시 추가

#### 구현 방법
```typescript
// 변경 사항 추적
const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

// handleGatewayChange 수정
const handleGatewayChange = useCallback((outletId: string, gateway: string) => {
  console.log('🎯 게이트웨이 변경 감지:', { outletId, gateway })

  setGatewayAssignments(prev => {
    if (prev[outletId] === gateway) return prev
    return {
      ...prev,
      [outletId]: gateway
    }
  })

  setHasUnsavedChanges(true)  // ✅ 미저장 표시
}, [])

// 저장 완료 후
setHasUnsavedChanges(false)  // ✅ 미저장 표시 제거
```

#### UI 표시
```typescript
{hasUnsavedChanges && (
  <div className="fixed top-20 right-4 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-lg shadow-lg">
    ⚠️ 저장되지 않은 변경사항이 있습니다
  </div>
)}
```

**장점:**
- 사용자에게 명확한 피드백 제공
- 저장 전 확인 가능

**단점:**
- 추가 state 관리 필요
- 모든 편집 핸들러에 추가 필요

### Option 2: 저장 실패 시 게이트웨이 롤백 추가 (권장)
저장 실패 시 게이트웨이 할당도 원래 상태로 복원

#### 구현 방법
```typescript
// handleSave 시작 시 원본 저장
const originalGatewayAssignments = { ...gatewayAssignments }

try {
  // ... 저장 로직 ...
} catch (error) {
  console.error('Error saving changes:', error);

  // 실패 시 롤백
  if (originalPermitDetail) {
    setPermitDetail(originalPermitDetail);
  }

  // ✅ 게이트웨이 할당도 롤백
  setGatewayAssignments(originalGatewayAssignments);

  setIsEditing(true);
  alert('저장에 실패했습니다');
}
```

**장점:**
- 저장 실패 시 데이터 일관성 보장
- 사용자 혼란 방지

**단점:**
- 최소한의 코드 추가 필요

### Option 3: 낙관적 업데이트 (Optimistic Update) 개선
현재는 이미 낙관적 업데이트가 구현되어 있으므로, 추가 개선 불필요

## 5. 테스트 시나리오

### 테스트 1: 게이트웨이 변경 즉시 반영
1. 대기필증 편집 페이지 접속
2. 배출구의 게이트웨이 선택 드롭다운 클릭
3. "Gateway 2" 선택
4. **예상 결과**:
   - 드롭다운 값 즉시 변경
   - 게이트웨이 배지 "Gateway 2"로 즉시 변경
   - 배출구 배경색 Gateway 2 색상으로 즉시 변경

### 테스트 2: 저장 후 데이터 유지
1. 게이트웨이 변경 (Gateway 1 → Gateway 2)
2. 저장 버튼 클릭
3. 저장 성공 메시지 확인
4. **예상 결과**:
   - 게이트웨이 "Gateway 2" 유지
   - 새로고침 후에도 "Gateway 2" 표시

### 테스트 3: 저장 실패 시 롤백 (Option 2 적용 후)
1. 게이트웨이 변경 (Gateway 1 → Gateway 3)
2. 네트워크 끊기 (개발자 도구 → Offline)
3. 저장 버튼 클릭
4. **예상 결과**:
   - 저장 실패 메시지 표시
   - 게이트웨이 "Gateway 1"로 롤백
   - UI 일관성 유지

### 테스트 4: 연속 게이트웨이 변경
1. Gateway 1 → Gateway 2 변경
2. Gateway 2 → Gateway 3 변경
3. Gateway 3 → Gateway 1 변경
4. **예상 결과**:
   - 각 변경마다 즉시 UI 반영
   - 최종 "Gateway 1" 표시
   - 저장 후 "Gateway 1" 유지

## 6. 구현 우선순위

### 필수 (High Priority)
- ✅ **Option 2: 저장 실패 시 게이트웨이 롤백 추가**
  - 데이터 일관성 보장
  - 최소한의 코드 변경
  - 즉시 구현 가능

### 권장 (Medium Priority)
- 🔲 **Option 1: 시각적 피드백 강화**
  - UX 개선
  - 사용자 인지 향상
  - 시간 여유 있을 때 구현

### 선택 (Low Priority)
- 🔲 편집 모드/읽기 모드 명확한 구분 (현재 항상 편집모드)
- 🔲 변경 이력 추적 (언두/리두 기능)

## 7. 결론

### 현재 상태
✅ **게이트웨이 정보는 이미 실시간으로 반영되도록 완벽하게 구현되어 있습니다.**

1. **편집 중**: `handleGatewayChange` → `setGatewayAssignments` → 즉시 리렌더링
2. **표시**: `currentGateway = gatewayAssignments[outlet.id]` (state 우선 참조)
3. **저장 후**: API 응답 → 즉시 UI 업데이트 → 500ms 후 DB 재조회 → 최종 확정

### 권장 개선 사항
**단 하나의 개선만 필요**: 저장 실패 시 게이트웨이 롤백 로직 추가 (Option 2)

이는 데이터 일관성을 보장하기 위한 방어적 코딩이며, 실제 사용자에게는 거의 영향이 없지만 시스템 안정성을 높입니다.

## 8. 구현 파일

### 수정 대상
- `app/admin/air-permit-detail/page.tsx` (Line 475의 handleSave 함수)

### 수정 내용
```typescript
// Line 480 이후 추가
const originalGatewayAssignments = { ...gatewayAssignments }

// Line 844-849 수정
catch (error) {
  console.error('Error saving changes:', error);

  if (originalPermitDetail) {
    setPermitDetail(originalPermitDetail);
  }

  // ✅ 게이트웨이 할당도 롤백
  setGatewayAssignments(originalGatewayAssignments);

  setIsEditing(true);
  alert('저장에 실패했습니다');
}
```
