# Design: Revenue → Business Modal Navigation Integration

## Problem Statement

**Current Behavior:**
- Revenue 페이지 상세 모달에서 사업장명 클릭 시
- Business 페이지로 전체 네비게이션 발생 (`router.push`)
- Business 페이지만 표시되고 상세 모달이 자동으로 열리지 않음

**Expected Behavior:**
- Revenue 페이지 상세 모달에서 사업장명 클릭 시
- Business 페이지의 상세 모달이 Revenue 모달 위에 오버레이로 표시
- 또는 Business 페이지로 이동하되 상세 모달이 자동으로 열림

## Current Architecture Analysis

### 1. Revenue Page Modal Structure
**File:** `app/admin/revenue/page.tsx`

**Key Components:**
- `showEquipmentModal`: Revenue 모달 상태
- `selectedEquipmentBusiness`: 선택된 사업장 데이터
- `BusinessRevenueModal`: Revenue 상세 정보 표시 모달

**URL Parameter Flow:**
```typescript
// Revenue 페이지는 URL 파라미터로 모달 자동 오픈 지원
useEffect(() => {
  const businessId = searchParams?.get('businessId');
  const openRevenueModal = searchParams?.get('openRevenueModal');

  if (businessId && openRevenueModal === 'true' && businesses.length > 0) {
    const targetBusiness = businesses.find(b => b.id === businessId);
    if (targetBusiness) {
      setSelectedEquipmentBusiness(targetBusiness);
      setShowEquipmentModal(true);
      window.history.replaceState({}, '', '/admin/revenue');
    }
  }
}, [searchParams, businesses]);
```

### 2. BusinessRevenueModal Component
**File:** `components/business/BusinessRevenueModal.tsx`

**Current Navigation Handler (Line 395-405):**
```typescript
const handleBusinessNameClick = () => {
  if (!business?.id) {
    console.error('❌ [Navigation] Business ID가 없습니다.');
    return;
  }

  console.log('🔗 [Navigation] Business 페이지로 이동:', business.business_name || business.사업장명);
  // returnTo=revenue 파라미터 추가로 복귀 경로 추적
  router.push(`/admin/business?businessId=${business.id}&openModal=true&returnTo=revenue`);
};
```

**Issue:** Full page navigation occurs, causing Revenue modal to close

### 3. Business Page Modal Structure
**File:** `app/admin/business/page.tsx`

**Key Components:**
- `isDetailModalOpen`: Business 상세 모달 상태
- `selectedBusiness`: 선택된 사업장 데이터
- `BusinessDetailModal`: 사업장 상세 정보 표시 모달

**URL Parameter Auto-Open Logic (Line 2193-2224):**
```typescript
useLayoutEffect(() => {
  const openModalId = searchParams?.get('openModal');
  const returnTo = searchParams?.get('returnTo');
  const taskId = searchParams?.get('taskId');

  if (!openModalId || allBusinesses.length === 0) {
    return;
  }

  const targetBusiness = allBusinesses.find(b => b.id === openModalId);

  if (targetBusiness) {
    setSelectedBusiness(targetBusiness);
    setIsDetailModalOpen(true);  // ✅ 모달 자동 오픈

    if (returnTo && taskId) {
      setReturnPath(returnTo);
      setReturnTaskId(taskId);
    }

    // URL 정리
    requestAnimationFrame(() => {
      router.replace('/admin/business', { scroll: false });
    });
  }
}, [searchParams, allBusinesses, router]);
```

## Root Cause Analysis

### The Problem

현재 코드를 보면 **Business 페이지의 URL 파라미터 자동 오픈 로직은 이미 구현되어 있습니다:**

```typescript
// ✅ 이미 구현된 로직
const openModalId = searchParams?.get('openModal');  // businessId를 받음
if (openModalId && targetBusiness) {
  setSelectedBusiness(targetBusiness);
  setIsDetailModalOpen(true);  // 모달 자동 오픈
}
```

하지만 **Revenue 모달에서는 잘못된 URL 파라미터를 전달하고 있습니다:**

```typescript
// ❌ 잘못된 파라미터명
router.push(`/admin/business?businessId=${business.id}&openModal=true&returnTo=revenue`);
//                                        ^^^^^^^^^ businessId로 전달
//                                                  ^^^^^^^^^^^^^ 'true'로 전달
```

**Business 페이지는 `openModal` 파라미터의 값을 businessId로 기대하지만, Revenue에서는 `businessId`를 별도 파라미터로 전달하고 `openModal=true`를 전달하고 있습니다.**

### Why It Fails

```typescript
// Business 페이지 로직
const openModalId = searchParams?.get('openModal');  // 'true'를 받음
const targetBusiness = allBusinesses.find(b => b.id === openModalId);  // 'true'와 매칭 실패
```

- `openModal=true`를 받았으므로 `openModalId = 'true'`
- `allBusinesses.find(b => b.id === 'true')`는 항상 실패 (ID는 UUID 형식)
- 결과적으로 모달이 열리지 않음

## Design Solutions

### Solution 1: Fix URL Parameter (Recommended) ⭐

**가장 간단하고 기존 로직을 활용하는 방법**

#### Changes Required

**File:** `components/business/BusinessRevenueModal.tsx` (Line 404)

```typescript
// ❌ Before
router.push(`/admin/business?businessId=${business.id}&openModal=true&returnTo=revenue`);

// ✅ After
router.push(`/admin/business?openModal=${business.id}&returnTo=revenue`);
```

#### Why This Works

1. Business 페이지는 이미 `openModal` 파라미터를 businessId로 처리하는 로직이 완성됨
2. 한 줄만 수정하면 전체 플로우가 작동
3. 기존 `useLayoutEffect` 로직을 그대로 활용
4. URL cleanup 로직도 이미 구현되어 있음

#### Benefits

- ✅ Minimal code changes (1 line)
- ✅ Uses existing auto-open logic
- ✅ Maintains URL cleanup behavior
- ✅ No new state management needed
- ✅ No breaking changes to Business page

#### Implementation Steps

1. Update `handleBusinessNameClick` in BusinessRevenueModal.tsx
2. Test navigation flow: Revenue modal → Business modal
3. Verify URL cleanup after modal opens
4. Test returnTo parameter preservation

---

### Solution 2: Modal Overlay (Complex, Not Recommended)

**모달을 오버레이로 띄우는 방법 (복잡함)**

#### Architecture

```
Revenue Page
  └─ BusinessRevenueModal (isOpen: true)
       └─ [Click 사업장명]
            └─ BusinessDetailModal (isOpen: true)  ← 새로운 모달을 Revenue 모달 위에 렌더링
```

#### Changes Required

1. **Import BusinessDetailModal in Revenue page**
   ```typescript
   // app/admin/revenue/page.tsx
   import BusinessDetailModal from '@/components/business/modals/BusinessDetailModal'
   ```

2. **Add State Management**
   ```typescript
   const [showBusinessDetailModal, setShowBusinessDetailModal] = useState(false);
   const [selectedBusinessForDetail, setSelectedBusinessForDetail] = useState(null);
   ```

3. **Update BusinessRevenueModal Props**
   ```typescript
   interface BusinessRevenueModalProps {
     business: any;
     isOpen: boolean;
     onClose: (dataChanged?: boolean) => void;
     userPermission: number;
     onOpenBusinessDetail?: (business: any) => void;  // ✅ 새로운 prop
   }
   ```

4. **Modify Click Handler**
   ```typescript
   // components/business/BusinessRevenueModal.tsx
   const handleBusinessNameClick = () => {
     if (!business?.id) return;

     if (onOpenBusinessDetail) {
       onOpenBusinessDetail(business);  // Revenue 페이지에 알림
     }
   };
   ```

5. **Render Both Modals in Revenue Page**
   ```typescript
   <BusinessRevenueModal
     business={selectedEquipmentBusiness}
     isOpen={showEquipmentModal}
     onClose={(dataChanged) => { /* ... */ }}
     userPermission={userPermission}
     onOpenBusinessDetail={(business) => {
       setSelectedBusinessForDetail(business);
       setShowBusinessDetailModal(true);
     }}
   />

   <BusinessDetailModal
     isOpen={showBusinessDetailModal}
     onClose={() => setShowBusinessDetailModal(false)}
     business={selectedBusinessForDetail}
     // ... other props
   />
   ```

#### Challenges

- ❌ Need to import and manage BusinessDetailModal dependencies
- ❌ Z-index management for overlapping modals
- ❌ State synchronization between pages
- ❌ Memory overhead from loading both modals
- ❌ Complex prop drilling
- ❌ Potential data inconsistency between modals

---

## Recommended Solution: Solution 1

### Implementation Plan

#### Step 1: Update Navigation URL
**File:** `components/business/BusinessRevenueModal.tsx`

```typescript
// Line 395-405
const handleBusinessNameClick = () => {
  if (!business?.id) {
    console.error('❌ [Navigation] Business ID가 없습니다.');
    return;
  }

  console.log('🔗 [Navigation] Business 페이지로 이동:', business.business_name || business.사업장명);

  // ✅ FIX: openModal 파라미터에 businessId를 직접 전달
  router.push(`/admin/business?openModal=${business.id}&returnTo=revenue`);
};
```

#### Step 2: Verification Points

1. **URL Parameter Verification**
   - Navigate from Revenue modal to Business page
   - Verify URL contains: `?openModal={businessId}&returnTo=revenue`
   - Verify NO `businessId` parameter exists

2. **Modal Auto-Open Verification**
   - Business 페이지의 `useLayoutEffect`가 트리거되는지 확인
   - `selectedBusiness`가 올바른 사업장으로 설정되는지 확인
   - `isDetailModalOpen`이 `true`로 설정되는지 확인

3. **URL Cleanup Verification**
   - 모달이 열린 후 URL이 `/admin/business`로 정리되는지 확인
   - `requestAnimationFrame` 로직이 정상 작동하는지 확인

4. **Return Path Verification**
   - `returnTo=revenue` 파라미터가 올바르게 전달되는지 확인
   - Business 모달에서 복귀 기능이 작동하는지 확인

#### Step 3: Edge Cases

1. **Invalid Business ID**
   - URL에 존재하지 않는 businessId 전달 시 처리
   - 현재 로직: 자동으로 URL cleanup만 수행 (안전함)

2. **Slow Data Loading**
   - `allBusinesses.length === 0`인 경우 useLayoutEffect skip
   - 데이터 로드 후 자동으로 다시 실행됨 (deps: `allBusinesses`)

3. **Multiple Rapid Clicks**
   - Router.push는 마지막 요청으로 덮어씀 (문제 없음)

#### Step 4: Testing Checklist

- [ ] Revenue 페이지에서 사업장명 클릭
- [ ] Business 페이지로 네비게이션 발생
- [ ] Business 상세 모달이 자동으로 열림
- [ ] 올바른 사업장 정보가 표시됨
- [ ] URL이 정리됨 (`/admin/business`)
- [ ] 모달 닫기 버튼이 작동함
- [ ] Revenue 페이지로 복귀 기능이 작동함 (returnTo 파라미터)

## Impact Analysis

### Files Modified
1. ✅ `components/business/BusinessRevenueModal.tsx` (1 line change)

### Files Not Modified
- ❌ `app/admin/revenue/page.tsx` (no changes needed)
- ❌ `app/admin/business/page.tsx` (no changes needed)
- ❌ `components/business/modals/BusinessDetailModal.tsx` (no changes needed)

### Backward Compatibility
- ✅ No breaking changes to Business page URL parameter handling
- ✅ Existing openModal behavior preserved
- ✅ returnTo/taskId parameters still supported

### Performance Impact
- ✅ No additional components loaded
- ✅ No new state management overhead
- ✅ Existing useLayoutEffect optimizations maintained

## Code Snippets

### Before (Current Implementation)
```typescript
// components/business/BusinessRevenueModal.tsx:404
const handleBusinessNameClick = () => {
  if (!business?.id) {
    console.error('❌ [Navigation] Business ID가 없습니다.');
    return;
  }

  console.log('🔗 [Navigation] Business 페이지로 이동:', business.business_name || business.사업장명);
  router.push(`/admin/business?businessId=${business.id}&openModal=true&returnTo=revenue`);
  //                                        ^^^^^^^^^ 잘못된 파라미터명
  //                                                  ^^^^^^^^^^^^^ 'true' 대신 businessId 전달 필요
};
```

### After (Recommended Fix)
```typescript
// components/business/BusinessRevenueModal.tsx:404
const handleBusinessNameClick = () => {
  if (!business?.id) {
    console.error('❌ [Navigation] Business ID가 없습니다.');
    return;
  }

  console.log('🔗 [Navigation] Business 페이지로 이동:', business.business_name || business.사업장명);
  router.push(`/admin/business?openModal=${business.id}&returnTo=revenue`);
  //                          ^^^^^^^^^^^^^^^^^^^^^^^^ businessId를 openModal 파라미터로 전달
};
```

### Business Page Existing Logic (No Changes Needed)
```typescript
// app/admin/business/page.tsx:2193-2224 (이미 완벽하게 구현됨)
useLayoutEffect(() => {
  const openModalId = searchParams?.get('openModal');  // ✅ businessId를 받음
  const returnTo = searchParams?.get('returnTo');
  const taskId = searchParams?.get('taskId');

  if (!openModalId || allBusinesses.length === 0) {
    return;
  }

  const targetBusiness = allBusinesses.find(b => b.id === openModalId);  // ✅ businessId로 검색

  if (targetBusiness) {
    setSelectedBusiness(targetBusiness);
    setIsDetailModalOpen(true);  // ✅ 모달 자동 오픈

    if (returnTo && taskId) {
      setReturnPath(returnTo);
      setReturnTaskId(taskId);
    }

    requestAnimationFrame(() => {
      router.replace('/admin/business', { scroll: false });
    });
  } else {
    router.replace('/admin/business', { scroll: false });
  }
}, [searchParams, allBusinesses, router]);
```

## Conclusion

**The simplest and most effective solution is to fix the URL parameter in BusinessRevenueModal.**

- Business 페이지는 이미 완벽한 자동 모달 오픈 로직을 가지고 있음
- Revenue 모달에서 잘못된 파라미터명(`businessId`)과 값(`true`)을 전달하고 있었음
- 한 줄만 수정하면 전체 플로우가 작동함
- 추가 상태 관리, 컴포넌트 임포트, 오버레이 처리 불필요

**Implementation Effort:**
- Lines of code: 1
- Files modified: 1
- Testing effort: Low
- Risk level: Minimal
- Performance impact: None

**Alternative Solution (Modal Overlay):**
- Lines of code: 50+
- Files modified: 3+
- Testing effort: High
- Risk level: Medium
- Performance impact: Additional modal component loading
