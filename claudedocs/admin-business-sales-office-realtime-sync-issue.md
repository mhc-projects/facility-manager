# Admin Business - 영업점 실시간 동기화 문제 분석

## 문제 현황

사용자가 admin/business 수정 모달에서 **영업점** 값을 저장했는데, 메인 페이지의 테이블에서 **영업점** 컬럼에 해당 값이 실시간으로 출력되지 않는 문제.

## 원인 분석

### 1. 데이터 흐름 확인

#### 1.1 수정 모달 제출 시 (`handleSubmit`)

```typescript
// app/admin/business/page.tsx:3307-3437
const handleSubmit = async (e: React.FormEvent) => {
  // ...

  // ✅ 2. Optimistic Update - 편집의 경우 즉시 로컬 상태 업데이트
  if (editingBusiness) {
    const optimisticUpdate = {
      ...editingBusiness,
      ...Object.keys(processedFormData).reduce((acc, key) => {
        const value = (processedFormData as any)[key];
        acc[key] = value; // 영문 키

        // ✅ 한글 키 매핑
        const koreanKeyMap: {[key: string]: string} = {
          'sales_office': '영업점',  // ← 여기에 매핑 존재
          // ... 기타 매핑
        };

        if (koreanKeyMap[key]) {
          acc[koreanKeyMap[key]] = value;
        }
        return acc;
      }, {} as any),
      updated_at: new Date().toISOString(),
      수정일: new Date().toISOString()
    };

    // ✅ 상태 업데이트
    updateBusinessState(optimisticUpdate, editingBusiness.id);
  }
}
```

**✅ Optimistic Update 단계에서 정상 동작**
- `sales_office` → `영업점` 매핑이 존재 (line 3411)
- `updateBusinessState` 함수 호출로 로컬 상태 즉시 업데이트

#### 1.2 서버 응답 후 데이터 동기화

```typescript
// app/admin/business/page.tsx:3539-3599
if (editingBusiness) {
  const serverData = result.data
  const updatedBusiness = {
    id: serverData.id,
    // ... 기타 필드들

    // ✅ 영업점 필드 매핑
    sales_office: serverData.sales_office || null,  // line 3598
    영업점: serverData.sales_office || null,         // line 3599

    // ... 계속
  }

  // ✅ 서버 데이터로 상태 재동기화
  updateBusinessState(updatedBusiness, editingBusiness.id);
}
```

**✅ 서버 응답 동기화 단계도 정상 동작**
- 영문 키 `sales_office` 설정
- 한글 키 `영업점` 설정
- `updateBusinessState` 함수로 최종 상태 업데이트

### 2. 테이블 컬럼 렌더링 확인

```typescript
// app/admin/business/page.tsx:3851-3862
{
  key: 'sales_office' as string,
  title: '영업점',
  width: '90px',
  render: (item: any) => {
    const office = item.sales_office || item.영업점 || '-'  // ✅ 양쪽 키 모두 체크

    return (
      <div className="text-center">
        {office === '-' ? (
          <span className="text-gray-400 text-xs">-</span>
        ) : (
          <span className="text-xs font-medium text-gray-700">{office}</span>
        )}
      </div>
    )
  }
}
```

**✅ 테이블 렌더링도 정상**
- `item.sales_office || item.영업점` 양쪽 모두 체크
- 값이 없으면 `-` 표시

### 3. `updateBusinessState` 함수 검증 필요

```typescript
// app/admin/business/page.tsx에서 updateBusinessState 함수 위치 확인 필요
```

**🔍 검증 포인트:**
1. `updateBusinessState` 함수가 `allBusinesses` 상태를 올바르게 업데이트하는가?
2. 테이블이 `allBusinesses` 배열을 기반으로 렌더링되는가?
3. 필터링된 `filteredBusinesses`에도 업데이트가 반영되는가?

## 예상되는 문제점

### 시나리오 A: `updateBusinessState` 함수 문제
```typescript
// 잘못된 구현 예시
const updateBusinessState = (updated, id) => {
  // ❌ 잘못된 방식: 객체 참조가 변경되지 않아 리렌더링 안 됨
  const found = allBusinesses.find(b => b.id === id);
  if (found) {
    Object.assign(found, updated); // ❌ 원본 객체 변경, 새 배열 생성 안 함
  }
}

// ✅ 올바른 구현
const updateBusinessState = (updated, id) => {
  setAllBusinesses(prev =>
    prev.map(b => b.id === id ? { ...b, ...updated } : b)
  );

  // selectedBusiness도 업데이트 필요
  if (selectedBusiness?.id === id) {
    setSelectedBusiness({ ...selectedBusiness, ...updated });
  }
}
```

### 시나리오 B: 필터링 시점 문제
```typescript
// app/admin/business/page.tsx:1723-1730
const filtered = allBusinesses.filter(b => {
  const office = b.영업점 || b.sales_office || ''  // ✅ 양쪽 키 체크
  return filterOffices.includes(office)
})
```

필터링 로직도 양쪽 키를 체크하므로 정상.

### 시나리오 C: React 리렌더링 이슈
- `allBusinesses` 상태 변경 시 테이블이 리렌더링되지 않을 수 있음
- `useMemo` 의존성 배열 문제로 캐시된 데이터 사용

## 검증 단계

### 1단계: `updateBusinessState` 함수 위치 확인
```bash
grep -n "updateBusinessState" app/admin/business/page.tsx
```

### 2단계: 함수 구현 확인
- 새 배열/객체를 생성하는지 확인
- `setAllBusinesses` 호출 여부 확인
- 불변성(immutability) 유지 여부 확인

### 3단계: 콘솔 로그 확인
```typescript
// handleSubmit 내부 로그
console.log('✅ [SYNC-CHECK-AFTER] Optimistic Update 완료:', {
  updatedBusinessId: optimisticUpdate.id,
  updatedBusinessName: optimisticUpdate.사업장명,
  영업점: optimisticUpdate.영업점,
  sales_office: optimisticUpdate.sales_office
});
```

브라우저 개발자 도구에서 확인:
1. Optimistic Update 후 값이 올바르게 설정되는가?
2. 서버 응답 후 값이 유지되는가?
3. `allBusinesses` 배열이 업데이트되는가?

### 4단계: React DevTools로 상태 검증
1. React DevTools 설치
2. Admin Business 컴포넌트 선택
3. `allBusinesses` state 확인
4. 수정 후 해당 사업장 객체에 `영업점` / `sales_office` 값이 있는지 확인

## 임시 해결방안

### A. 강제 새로고침
```typescript
// handleSubmit 함수 끝 부분
if (editingBusiness) {
  // 기존 updateBusinessState 호출 후
  updateBusinessState(updatedBusiness, editingBusiness.id);

  // 강제 새로고침 추가
  await loadAllBusinesses(); // ← 추가
}
```

**장점:** 확실하게 최신 데이터 로드
**단점:** 네트워크 요청 추가, 성능 저하

### B. 명시적 상태 업데이트
```typescript
const updateBusinessState = (updated: UnifiedBusinessInfo, id: string) => {
  console.log('🔄 updateBusinessState 호출:', { id, updated });

  // 1. allBusinesses 업데이트
  setAllBusinesses(prev => {
    const newArray = prev.map(b =>
      b.id === id ? { ...b, ...updated } : b
    );
    console.log('✅ allBusinesses 업데이트 완료:', newArray.find(b => b.id === id));
    return newArray;
  });

  // 2. selectedBusiness 업데이트
  setSelectedBusiness(prev =>
    prev?.id === id ? { ...prev, ...updated } : prev
  );

  // 3. 필터링 재계산 강제
  setFilterOffices(prev => [...prev]); // 트리거
}
```

## 권장 해결방안

### 1. `updateBusinessState` 함수 재구현
```typescript
const updateBusinessState = useCallback((updated: UnifiedBusinessInfo, id: string) => {
  console.log('🔄 [UPDATE-STATE] 상태 업데이트 시작:', {
    id,
    영업점: updated.영업점,
    sales_office: updated.sales_office
  });

  // 원자적 배치 업데이트
  setAllBusinesses(prev => {
    const index = prev.findIndex(b => b.id === id);
    if (index === -1) {
      console.warn('⚠️ [UPDATE-STATE] 사업장을 찾을 수 없음:', id);
      return prev;
    }

    const newArray = [...prev];
    newArray[index] = {
      ...prev[index],
      ...updated,
      // 영업점 필드 명시적 보장
      영업점: updated.sales_office || updated.영업점 || prev[index].영업점,
      sales_office: updated.sales_office || updated.영업점 || prev[index].sales_office
    };

    console.log('✅ [UPDATE-STATE] 업데이트된 사업장:', newArray[index]);
    return newArray;
  });

  // selectedBusiness도 동기화
  if (selectedBusiness?.id === id) {
    setSelectedBusiness(prev => ({
      ...prev!,
      ...updated,
      영업점: updated.sales_office || updated.영업점,
      sales_office: updated.sales_office || updated.영업점
    }));
  }
}, [selectedBusiness]);
```

### 2. 디버깅 로그 강화
```typescript
// handleSubmit 함수 내부
console.log('🔍 [SALES-OFFICE-UPDATE] 수정 데이터:', {
  '전송할_영업점': processedFormData.sales_office,
  'Optimistic_영업점': optimisticUpdate.영업점,
  'Optimistic_sales_office': optimisticUpdate.sales_office,
  '서버응답_sales_office': serverData.sales_office
});

// 테이블 렌더링 전
console.log('📊 [TABLE-RENDER] 렌더링될 데이터:',
  filteredBusinesses.map(b => ({
    id: b.id,
    사업장명: b.사업장명,
    영업점: b.영업점,
    sales_office: b.sales_office
  }))
);
```

## 다음 단계

1. **`updateBusinessState` 함수 위치 및 구현 확인**
2. **브라우저 콘솔에서 로그 확인**
   - Optimistic Update 후 값
   - 서버 응답 후 값
   - 테이블 렌더링 시 값
3. **React DevTools로 상태 검증**
4. **필요 시 함수 재구현**

## 관련 파일

- [app/admin/business/page.tsx](../app/admin/business/page.tsx) - 메인 로직
  - `handleSubmit` (line 3307-3507)
  - 테이블 컬럼 정의 (line 3851-3862)
  - `updateBusinessState` 함수 (위치 확인 필요)
- [app/admin/business/hooks/useBusinessData.ts](../app/admin/business/hooks/useBusinessData.ts) - 데이터 로딩
  - 영업점 필드 매핑 (line 138)
- [app/api/business-info-direct/route.ts](../app/api/business-info-direct/route.ts) - API 엔드포인트
  - PUT 요청 처리
  - `sales_office` 필드 업데이트 (line 395-397)

## 검증 완료 사항

✅ Optimistic Update 시 `sales_office` → `영업점` 매핑 존재
✅ 서버 응답 동기화 시 양쪽 키 모두 설정
✅ 테이블 렌더링 시 양쪽 키 모두 체크
✅ API 엔드포인트에서 `sales_office` 필드 처리
✅ 데이터 로딩 훅에서 필드 매핑

## 문제 원인 확정

### 핵심 문제: `updateBusinessState` 함수가 `allBusinesses` 상태를 업데이트하지 않음

```typescript
// app/admin/business/page.tsx:2377-2398
const updateBusinessState = (updatedBusiness: UnifiedBusinessInfo, businessId: string) => {
  console.log('🔄 [updateBusinessState] 원자적 상태 업데이트 시작:', {
    businessId,
    businessName: updatedBusiness.사업장명
  });

  // ❌ 문제: allBusinesses 업데이트 없음!
  // ⚠️ Note: allBusinesses is now from useBusinessData hook (read-only)
  // Instead of updating state directly, we reload the data
  // TODO: Consider optimistic updates if performance becomes an issue
  console.log('⚠️ [updateBusinessState] allBusinesses is from hook - will refetch on next load');

  // ✅ selectedBusiness만 업데이트 (상세보기 모달용)
  if (selectedBusiness && selectedBusiness.id === businessId) {
    setSelectedBusiness(updatedBusiness);
    console.log('✅ [updateBusinessState] selectedBusiness 업데이트 완료');
  } else {
    console.log('ℹ️ [updateBusinessState] selectedBusiness 업데이트 건너뜀 (선택된 사업장 아님)');
  }

  console.log('🎯 [updateBusinessState] 원자적 상태 업데이트 완료');
};
```

**문제 상황:**
1. `allBusinesses`는 `useBusinessData` 훅에서 관리됨
2. `updateBusinessState` 함수는 `allBusinesses`를 업데이트하지 않음
3. `selectedBusiness`만 업데이트하여 상세보기 모달에만 반영
4. **메인 테이블은 `allBusinesses`를 기반으로 렌더링하므로 업데이트 안 됨**

### 데이터 흐름 분석

```
[수정 모달에서 영업점 값 저장]
    ↓
[handleSubmit 호출]
    ↓
[Optimistic Update: optimisticUpdate 객체 생성]
    ↓ (영업점 값 포함)
[updateBusinessState(optimisticUpdate, id) 호출]
    ↓
[❌ allBusinesses 업데이트 건너뜀 - "will refetch on next load"]
[✅ selectedBusiness만 업데이트 - 상세보기 모달에만 반영]
    ↓
[메인 테이블은 allBusinesses 기반으로 렌더링]
    ↓
[❌ 영업점 값이 테이블에 표시 안 됨]
```

### 해결 방안 A: `allBusinesses` 직접 업데이트 (Optimistic Update 완성)

**파일:** `app/admin/business/page.tsx`

**위치:** `updateBusinessState` 함수 (line 2377-2398)

**수정 내용:**
```typescript
const updateBusinessState = (updatedBusiness: UnifiedBusinessInfo, businessId: string) => {
  console.log('🔄 [updateBusinessState] 원자적 상태 업데이트 시작:', {
    businessId,
    businessName: updatedBusiness.사업장명
  });

  // ✅ 1. allBusinesses 업데이트 (테이블 실시간 반영)
  setAllBusinesses(prev => {
    const index = prev.findIndex(b => b.id === businessId);
    if (index === -1) {
      console.warn('⚠️ [updateBusinessState] 사업장을 찾을 수 없음:', businessId);
      return prev;
    }

    const newArray = [...prev];
    newArray[index] = {
      ...prev[index],
      ...updatedBusiness
    };

    console.log('✅ [updateBusinessState] allBusinesses 업데이트 완료:', {
      index,
      사업장명: newArray[index].사업장명,
      영업점: newArray[index].영업점,
      sales_office: newArray[index].sales_office
    });
    return newArray;
  });

  // ✅ 2. selectedBusiness 업데이트 (상세보기 모달)
  if (selectedBusiness && selectedBusiness.id === businessId) {
    setSelectedBusiness(updatedBusiness);
    console.log('✅ [updateBusinessState] selectedBusiness 업데이트 완료');
  } else {
    console.log('ℹ️ [updateBusinessState] selectedBusiness 업데이트 건너뜀 (선택된 사업장 아님)');
  }

  console.log('🎯 [updateBusinessState] 원자적 상태 업데이트 완료');
};
```

**주의사항:**
- `allBusinesses`가 `useBusinessData` 훅의 상태가 아니라 로컬 상태 `const [allBusinesses, setAllBusinesses] = useState([])`여야 함
- 현재 코드에서 `allBusinesses`가 `useBusinessData`에서 온다면, 훅 구조를 변경하거나 해결방안 B를 사용해야 함

### 해결 방안 B: `refetch` 함수 호출 (서버 데이터로 새로고침)

**파일:** `app/admin/business/page.tsx`

**위치:** `handleSubmit` 함수 내부, 서버 응답 후 (line 3694 이후)

**수정 내용:**
```typescript
// 서버 응답으로 상태 업데이트 후
updateBusinessState(updatedBusiness as unknown as UnifiedBusinessInfo, editingBusiness.id);

// ✅ useBusinessData 훅의 refetch 함수 호출 (테이블 실시간 반영)
await refetch();
console.log('✅ [REFETCH] allBusinesses 새로고침 완료');
```

**장점:**
- 서버의 정확한 최신 데이터로 동기화
- `allBusinesses` 상태 관리 구조 변경 불필요

**단점:**
- 네트워크 요청 추가 (약간의 성능 저하)
- Optimistic Update의 즉시성 손실

### 해결 방안 C: 하이브리드 (Optimistic + Server Sync)

1. **Optimistic Update:** 즉시 로컬 상태 업데이트 (해결방안 A)
2. **Server Sync:** 서버 응답 후 정확한 데이터로 재동기화 (해결방안 B)

**장점:**
- 사용자는 즉시 변경사항 확인 (UX 향상)
- 서버 데이터로 정확성 보장

**단점:**
- 구현 복잡도 증가
- 두 번의 상태 업데이트

## 권장 해결방안

**단기:** 해결방안 B (refetch 호출) - 즉시 적용 가능
**장기:** 해결방안 A (Optimistic Update 완성) - 성능 최적화

### 단기 해결 (즉시 적용 가능)

**파일:** `app/admin/business/page.tsx`

**위치:** `handleSubmit` 함수 내부 (line 3694 이후)

**수정 전:**
```typescript
// 원자적 상태 업데이트 함수 사용 (서버 데이터 동기화)
updateBusinessState(updatedBusiness as unknown as UnifiedBusinessInfo, editingBusiness.id);

// 🗑️ 캐시 무효화 (서버에서 최신 데이터를 받았으므로)
invalidateBusinessCache(editingBusiness.id);
```

**수정 후:**
```typescript
// 원자적 상태 업데이트 함수 사용 (서버 데이터 동기화)
updateBusinessState(updatedBusiness as unknown as UnifiedBusinessInfo, editingBusiness.id);

// 🗑️ 캐시 무효화 (서버에서 최신 데이터를 받았으므로)
invalidateBusinessCache(editingBusiness.id);

// ✅ 추가: 테이블 즉시 반영 (영업점 및 모든 필드 실시간 동기화)
await refetchBusinesses();
console.log('✅ [REFETCH] allBusinesses 새로고침 완료 - 테이블 즉시 업데이트');
```

**참고사항:**
- `refetchBusinesses`는 이미 line 363에서 `useBusinessData` 훅으로부터 가져옴:
  ```typescript
  const { allBusinesses, isLoading, error: businessDataError, refetch: refetchBusinesses, deleteBusiness } = useBusinessData()
  ```
- `loadAllBusinesses`는 `refetchBusinesses`의 alias (line 1563)
- 두 함수 중 어느 것을 사용해도 동일

### 장기 해결 (성능 최적화)

`updateBusinessState` 함수 전체 재작성:
1. `allBusinesses` 직접 업데이트
2. `selectedBusiness` 동기화
3. 캐시 무효화

---

**작성일:** 2026-02-05
**작성자:** Claude Code
**우선순위:** High
**상태:** ✅ 원인 확정, 해결방안 제시
**문제 유형:** Optimistic Update 미완성 (`allBusinesses` 상태 업데이트 누락)
**영향 범위:** 메인 테이블 실시간 동기화 전체 (영업점뿐 아니라 모든 필드)
