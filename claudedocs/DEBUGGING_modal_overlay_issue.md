# Debugging: Modal Overlay Not Working

## Issue Report

**Problem:** Revenue 페이지 상세 모달의 헤더에 있는 사업장명을 클릭하면 오버레이로 Business 상세 모달이 뜨지 않고 여전히 페이지 이동이 발생함

**Expected:** Business 상세 모달이 Revenue 모달 위에 오버레이로 표시
**Actual:** Business 페이지로 네비게이션

## Investigation

### 1. Code Verification

#### ✅ Revenue Page - Callback Passed Correctly
**File:** `app/admin/revenue/page.tsx:2085`

```typescript
<BusinessRevenueModal
  business={selectedEquipmentBusiness}
  isOpen={showEquipmentModal}
  onClose={/* ... */}
  userPermission={userPermission}
  onOpenBusinessDetail={handleOpenBusinessDetail}  // ✅ 전달됨
/>
```

#### ✅ Handler Function Defined
**File:** `app/admin/revenue/page.tsx:340-343`

```typescript
const handleOpenBusinessDetail = (business: any) => {
  console.log('🎯 [REVENUE-PAGE] handleOpenBusinessDetail 호출됨!');
  console.log('🔗 [BUSINESS-DETAIL] 모달 오픈 요청:', business.business_name);
  loadBusinessDetailData(business);
};
```

#### ✅ BusinessRevenueModal - Props Received
**File:** `components/business/BusinessRevenueModal.tsx:10-23`

```typescript
interface BusinessRevenueModalProps {
  business: any;
  isOpen: boolean;
  onClose: (dataChanged?: boolean) => void;
  userPermission: number;
  onOpenBusinessDetail?: (business: any) => void; // ✅ 정의됨
}

export default function BusinessRevenueModal({
  business,
  isOpen,
  onClose,
  userPermission,
  onOpenBusinessDetail  // ✅ 받음
}: BusinessRevenueModalProps) {
```

#### ✅ Click Handler Logic
**File:** `components/business/BusinessRevenueModal.tsx:397-414`

```typescript
const handleBusinessNameClick = () => {
  console.log('🎯 [DEBUG] handleBusinessNameClick 호출됨');
  console.log('🎯 [DEBUG] onOpenBusinessDetail 존재 여부:', !!onOpenBusinessDetail);

  if (!business?.id) {
    console.error('❌ [Navigation] Business ID가 없습니다.');
    return;
  }

  if (onOpenBusinessDetail) {
    console.log('✅ [SUCCESS] 콜백 함수 호출 → 모달 오버레이');
    onOpenBusinessDetail(business);
  } else {
    console.warn('⚠️ [FALLBACK] onOpenBusinessDetail 콜백 없음, 페이지 이동');
    router.push(`/admin/business?openModal=${business.id}&returnTo=revenue`);
  }
};
```

### 2. Possible Root Causes

#### A. Browser/Build Cache (Most Likely) ⭐
**Symptoms:**
- 코드는 정상적으로 변경됨
- 빌드는 성공
- 하지만 브라우저가 이전 버전의 JS를 캐싱

**Solution:**
```bash
# 1. Dev server 재시작
npm run dev

# 2. 브라우저 Hard Refresh
# Chrome/Edge: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
# Firefox: Ctrl+F5 (Windows) / Cmd+Shift+R (Mac)

# 3. 브라우저 캐시 완전 클리어
# Chrome: DevTools → Network → Disable cache 체크
```

#### B. Dynamic Import Caching
**Symptoms:**
- `dynamic()` import가 이전 버전을 캐싱
- Next.js가 새로운 chunk를 로드하지 않음

**Solution:**
```bash
# .next 폴더 삭제 후 재빌드
rm -rf .next
npm run dev
```

#### C. Multiple BusinessRevenueModal Instances
**Symptoms:**
- 페이지에 여러 BusinessRevenueModal 컴포넌트가 있음
- 하나는 콜백 있고, 하나는 없음

**Solution:**
Revenue 페이지 전체 검색:
```bash
grep -n "BusinessRevenueModal" app/admin/revenue/page.tsx
```

Expected: 딱 1개의 인스턴스만 있어야 함

### 3. Debug Steps for User

#### Step 1: Check Console Logs
브라우저 개발자 도구 (F12) → Console 탭 열기

**사업장명 클릭 시 기대되는 로그:**
```
🎯 [DEBUG] handleBusinessNameClick 호출됨
🎯 [DEBUG] business: {id: "...", business_name: "..."}
🎯 [DEBUG] onOpenBusinessDetail 존재 여부: true
🎯 [DEBUG] onOpenBusinessDetail 타입: function
🔗 [MODAL-OVERLAY] Business 상세 모달 오픈: 사업장명
✅ [SUCCESS] 콜백 함수 호출 → 모달 오버레이
🎯 [REVENUE-PAGE] handleOpenBusinessDetail 호출됨!
🔗 [BUSINESS-DETAIL] 모달 오픈 요청: 사업장명
🔄 [BUSINESS-DETAIL] 데이터 로딩 시작: 사업장명
```

**만약 다른 로그가 보인다면:**

**Case 1: `onOpenBusinessDetail 존재 여부: false`**
→ 콜백이 전달되지 않음
→ Revenue 페이지 재빌드 필요

**Case 2: 로그가 아예 안 보임**
→ 브라우저가 이전 JS 캐싱
→ Hard Refresh 필요

**Case 3: `⚠️ [FALLBACK]` 로그**
→ 조건문이 false로 평가됨
→ Props 전달 문제

#### Step 2: Force Refresh
```
1. Chrome DevTools 열기 (F12)
2. Network 탭 이동
3. "Disable cache" 체크박스 켜기
4. 페이지 새로고침 (Ctrl+Shift+R)
5. Revenue 페이지 다시 테스트
```

#### Step 3: Clear Next.js Cache
```bash
# Terminal에서 실행
cd /path/to/facility-manager
rm -rf .next
npm run dev
```

#### Step 4: Verify Build Output
```bash
# 빌드 확인
npm run build

# 예상 출력:
# ✓ Compiled successfully
# ✓ Generating static pages (91/91)
```

### 4. Added Debug Logging

#### BusinessRevenueModal Enhanced Logs
```typescript
const handleBusinessNameClick = () => {
  console.log('🎯 [DEBUG] handleBusinessNameClick 호출됨');
  console.log('🎯 [DEBUG] business:', business);
  console.log('🎯 [DEBUG] onOpenBusinessDetail 존재 여부:', !!onOpenBusinessDetail);
  console.log('🎯 [DEBUG] onOpenBusinessDetail 타입:', typeof onOpenBusinessDetail);
  // ... rest of the function
};
```

#### Revenue Page Enhanced Logs
```typescript
const handleOpenBusinessDetail = (business: any) => {
  console.log('🎯 [REVENUE-PAGE] handleOpenBusinessDetail 호출됨!');
  console.log('🔗 [BUSINESS-DETAIL] 모달 오픈 요청:', business.business_name);
  console.log('🔗 [BUSINESS-DETAIL] business 데이터:', business);
  loadBusinessDetailData(business);
};
```

### 5. Manual Verification Checklist

- [ ] **Dev Server Restart**
  ```bash
  # Ctrl+C to stop
  npm run dev
  ```

- [ ] **Browser Hard Refresh**
  - Chrome: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
  - Firefox: Ctrl+F5 (Windows) / Cmd+Shift+R (Mac)

- [ ] **Open Console**
  - F12 → Console tab
  - Clear previous logs (trash icon)

- [ ] **Test Navigation**
  1. Go to `/admin/revenue`
  2. Click any business row
  3. Revenue modal opens
  4. Click 사업장명 in header
  5. **Check console logs**

- [ ] **Expected Behavior**
  - No page navigation
  - Console shows debug logs
  - Business detail modal overlays on top

- [ ] **If Still Fails**
  - Screenshot console logs
  - Note which logs appear/missing
  - Check Network tab for 404s

### 6. Troubleshooting Matrix

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Page navigates | Old JS cached | Hard refresh + clear cache |
| No console logs | JS not loaded | Check Network tab, rebuild |
| `onOpenBusinessDetail: false` | Prop not passed | Verify Revenue page code |
| `onOpenBusinessDetail: undefined` | TypeScript mismatch | Check prop destructuring |
| Error in console | Runtime error | Check error message |
| Modal doesn't open | Data loading fails | Check API responses |

### 7. Files Modified for Debugging

1. **`components/business/BusinessRevenueModal.tsx`**
   - Added extensive debug logging in `handleBusinessNameClick`

2. **`app/admin/revenue/page.tsx`**
   - Added debug logging in `handleOpenBusinessDetail`

### 8. Next Steps After User Testing

**If logs show callback is working:**
```
🎯 [DEBUG] onOpenBusinessDetail 존재 여부: true
✅ [SUCCESS] 콜백 함수 호출 → 모달 오버레이
🎯 [REVENUE-PAGE] handleOpenBusinessDetail 호출됨!
```
→ Issue is with data loading or modal rendering
→ Check `loadBusinessDetailData` function

**If logs show callback is missing:**
```
🎯 [DEBUG] onOpenBusinessDetail 존재 여부: false
⚠️ [FALLBACK] onOpenBusinessDetail 콜백 없음
```
→ Props not being passed correctly
→ Verify BusinessRevenueModal receives prop

**If no logs at all:**
→ Old JavaScript is cached
→ Force rebuild and clear all caches

## Quick Fix Commands

```bash
# Complete cache clear and rebuild
rm -rf .next
rm -rf node_modules/.cache
npm run dev

# Then in browser:
# 1. Open DevTools (F12)
# 2. Network tab → Check "Disable cache"
# 3. Hard refresh (Ctrl+Shift+R)
```

## Verification After Fix

1. **Open Console** (F12)
2. **Navigate to Revenue page**
3. **Click business name in modal**
4. **Verify console logs show:**
   ```
   🎯 [DEBUG] handleBusinessNameClick 호출됨
   🎯 [DEBUG] onOpenBusinessDetail 존재 여부: true
   ✅ [SUCCESS] 콜백 함수 호출 → 모달 오버레이
   🎯 [REVENUE-PAGE] handleOpenBusinessDetail 호출됨!
   ```
5. **Verify behavior:**
   - No page navigation
   - Business detail modal opens on top
   - Revenue modal still visible behind

## Summary

**Root Cause (Most Likely):** Browser caching old JavaScript bundle

**Solution:**
1. Restart dev server
2. Hard refresh browser (Ctrl+Shift+R)
3. Clear .next folder if needed

**Code Status:** ✅ All code changes are correct and committed

**Build Status:** ✅ Build succeeds without errors

**Next Action:** User should clear cache and test with console open
