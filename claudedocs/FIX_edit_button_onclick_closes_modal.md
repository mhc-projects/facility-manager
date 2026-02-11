# Fix: Edit Button Calls onClose Before onEdit

## Issue Report

**Problem**: Clicking "정보수정" (Edit Info) button in Business detail modal navigates back to Revenue page instead of opening edit modal

**User Report**: "정보수정을 누르면 사업장관리의 상세모달로 이동을 해야해. 지금은 정보수정 버튼을 눌러도 revenue 페이지로 이동하고 있어"

**Context**:
- ✅ Revenue modal → Business detail modal (사업장명 클릭): 작동 정상
- ✅ Business detail modal 닫기 → Revenue page 복귀: 작동 정상
- ❌ Business detail modal "정보수정" → Revenue page로 이동 (잘못됨)
- ✅ **기대 동작**: Business detail modal "정보수정" → Edit modal 열림

## Root Cause Analysis

### Problem

**BusinessDetailModal의 "정보수정" 버튼 구현** ([components/business/modals/BusinessDetailModal.tsx:374-383](components/business/modals/BusinessDetailModal.tsx#L374-L383)):

```typescript
<button
  onClick={() => {
    onClose()      // ❌ 먼저 onClose 호출!
    onEdit(business)  // 그 다음 onEdit 호출
  }}
>
  정보수정
</button>
```

### Execution Flow (Incorrect)

```
User clicks "정보수정" button
  ↓
1. onClose() 호출
  ↓
  BusinessDetailModal의 onClose 핸들러 실행 (Business page에서 전달)
  ↓
  조건 체크: returnPath === '/admin/revenue' ?
  ↓
  YES → router.push('/admin/revenue')  ❌ Revenue 페이지로 네비게이션!
  ↓
2. onEdit(business) 호출
  ↓
  하지만 이미 페이지가 이동했으므로 의미 없음
```

### Why onClose Was Called First

**Original Design Intent** (추측):
- 원래 설계에서는 edit 모달이 detail 모달을 **대체**하는 것으로 생각
- detail 모달을 닫고 → edit 모달을 여는 순서
- 하지만 returnTo 로직이 추가되면서 문제 발생

**ReturnTo Logic Conflict**:
```typescript
// Business page - BusinessDetailModal의 onClose
onClose={() => {
  if (returnPath === '/admin/revenue' || returnPath === 'revenue') {
    router.push('/admin/revenue')  // ❌ 이것이 트리거됨!
    setReturnPath(null)
  } else {
    setIsDetailModalOpen(false)
  }
}}
```

Revenue page에서 열린 detail 모달은 `returnPath`가 설정되어 있으므로, `onClose()` 호출 시 무조건 Revenue로 복귀합니다.

## Solution

### Approach

**"정보수정" 버튼에서 `onClose()` 호출 제거**:
- `onEdit()` 함수가 자체적으로 모달 상태를 관리하도록 함
- `openEditModal()`이 이미 detail 모달을 닫고 edit 모달을 여는 로직을 가지고 있음

### Implementation

**File**: [components/business/modals/BusinessDetailModal.tsx:374-383, 416-425](components/business/modals/BusinessDetailModal.tsx#L374-L383)

**Before** (2곳):
```typescript
// Line 374-383 (작은 화면)
<button
  onClick={() => {
    onClose()           // ❌ 제거
    onEdit(business)
  }}
>
  <Edit className="w-3 h-3 mr-1" />
  수정
</button>

// Line 416-425 (큰 화면)
<button
  onClick={() => {
    onClose()           // ❌ 제거
    onEdit(business)
  }}
>
  <Edit className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-1.5" />
  <span className="hidden md:inline">정보수정</span>
  <span className="md:hidden">수정</span>
</button>
```

**After** (2곳):
```typescript
// Line 374-383 (작은 화면)
<button
  onClick={() => {
    // Don't call onClose() - let onEdit handle modal state
    onEdit(business)
  }}
>
  <Edit className="w-3 h-3 mr-1" />
  수정
</button>

// Line 416-425 (큰 화면)
<button
  onClick={() => {
    // Don't call onClose() - let onEdit handle modal state
    onEdit(business)
  }}
>
  <Edit className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-1.5" />
  <span className="hidden md:inline">정보수정</span>
  <span className="md:hidden">수정</span>
</button>
```

### Why This Works

**openEditModal Already Handles Modal State** ([app/admin/business/page.tsx:2919-2927](app/admin/business/page.tsx#L2919-L2927)):

```typescript
const openEditModal = async (business: UnifiedBusinessInfo) => {
  // ... fetch fresh data ...

  setFormData({ /* ... */ })

  // Close detail modal and clear return navigation state
  setIsDetailModalOpen(false)  // ✅ Detail 모달 닫기
  setReturnPath(null)           // ✅ Return path 클리어
  setReturnTaskId(null)

  // Open edit modal in next cycle
  setTimeout(() => {
    setIsModalOpen(true)         // ✅ Edit 모달 열기
  }, 0)
}
```

**New Execution Flow (Correct)**:
```
User clicks "정보수정" button
  ↓
onEdit(business) 호출
  ↓
openEditModal() 실행:
  1. setIsDetailModalOpen(false)   ✅ Detail 모달 닫기
  2. setReturnPath(null)            ✅ Return path 클리어
  3. setTimeout(() => setIsModalOpen(true), 0)  ✅ Edit 모달 열기
  ↓
Result:
  - Detail modal closes without triggering returnTo logic
  - Edit modal opens successfully
  - No navigation to Revenue page ✅
```

## Flow Comparison

### Before Fix (Incorrect)
```
Revenue page → Business page (returnPath=/admin/revenue)
  → Detail modal opens (isDetailModalOpen=true)
    → User clicks "정보수정"
      → onClick handler:
        1. onClose() ← Triggers returnTo logic
           → Checks: returnPath === '/admin/revenue' ? YES
           → router.push('/admin/revenue') ❌ NAVIGATION!
        2. onEdit(business) ← Never executes properly
      → User ends up on Revenue page ❌
```

### After Fix (Correct)
```
Revenue page → Business page (returnPath=/admin/revenue)
  → Detail modal opens (isDetailModalOpen=true)
    → User clicks "정보수정"
      → onClick handler:
        1. onEdit(business) ← Directly calls edit handler
           → openEditModal() executes:
              a. setIsDetailModalOpen(false) ✅
              b. setReturnPath(null) ✅
              c. setTimeout(() => setIsModalOpen(true), 0) ✅
      → Detail modal closes cleanly
      → Edit modal opens successfully
      → User can edit business info ✅
```

## Build Verification

```bash
✅ Build Status:
npm run build
✓ Generating static pages (91/91)
✓ Build completed successfully
✓ BusinessDetailModal: compiled successfully
✓ Business page: 167KB (unchanged)
✓ No compilation errors
✓ No TypeScript errors
```

## Testing Checklist

### Before Testing
- [x] Build completed successfully
- [x] Removed `onClose()` from both edit buttons
- [x] TypeScript compilation passed

### Manual Testing Steps

1. **Navigate from Revenue to Business Detail**
   ```
   Navigate to /admin/revenue
   Click any business row → Revenue modal opens
   Click 사업장명 in modal header
   Business detail modal should open (returnPath set)
   ```

2. **Test Edit Button (Main Test)**
   ```
   In Business detail modal, click "정보수정" button
   Expected Result:
   - ✅ Detail modal closes
   - ✅ Edit modal opens
   - ✅ NO navigation to Revenue page
   - ✅ Can edit business information
   - ✅ returnPath is cleared
   ```

3. **Test Edit Modal Close**
   ```
   In edit modal, click close/cancel button
   Expected Result:
   - ✅ Edit modal closes
   - ✅ Returns to Business page (not Revenue)
   - ✅ No auto-navigation
   ```

4. **Test Normal Close Flow**
   ```
   Open detail modal from Revenue
   Click X (close button) in detail modal
   Expected Result:
   - ✅ Detail modal closes
   - ✅ Returns to Revenue page (returnTo logic works)
   ```

5. **Test Direct Edit (No ReturnPath)**
   ```
   Navigate to /admin/business directly
   Click any business row → Detail modal opens
   Click "정보수정"
   Expected Result:
   - ✅ Detail modal closes
   - ✅ Edit modal opens
   - ✅ Stays on Business page
   ```

### Expected Console Output

**Edit Button Click**:
```
✏️ [Edit] Opening edit modal for business: [사업장명]
✅ [Edit] Detail modal closed, return path cleared
✅ [Edit] Edit modal opening in next cycle

✅ CORRECT BEHAVIOR:
✓ No onClose() call before onEdit()
✓ openEditModal() handles all modal state
✓ No navigation triggered
```

**Close Button Click**:
```
🔙 [Close] Detail modal close handler triggered
✅ [Close] returnPath = /admin/revenue
🔙 [Return] Revenue 페이지로 복귀

✅ CORRECT BEHAVIOR:
✓ Close button triggers returnTo logic
✓ Navigation to Revenue page
```

## Related Files

### Modified Files
- [components/business/modals/BusinessDetailModal.tsx:374-383](components/business/modals/BusinessDetailModal.tsx#L374-L383) - Removed `onClose()` from first edit button
- [components/business/modals/BusinessDetailModal.tsx:416-425](components/business/modals/BusinessDetailModal.tsx#L416-L425) - Removed `onClose()` from second edit button

### Related Code (No Changes Needed)
- [app/admin/business/page.tsx:2919-2927](app/admin/business/page.tsx#L2919-L2927) - `openEditModal()` already handles modal state correctly
- [app/admin/business/page.tsx:4561-4574](app/admin/business/page.tsx#L4561-L4574) - Detail modal `onClose` with returnTo logic (works correctly now)

### Related Documentation
- [FIX_dual_modal_issues_final.md](FIX_dual_modal_issues_final.md) - Previous fix attempts
- [FIX_edit_button_returns_to_revenue.md](FIX_edit_button_returns_to_revenue.md) - Initial diagnosis
- [IMPLEMENTATION_url_navigation_with_return.md](IMPLEMENTATION_url_navigation_with_return.md) - ReturnTo logic implementation

## Alternative Solutions Considered

### ❌ Option 1: Modify onClose Handler to Check Context
```typescript
onClose={(triggeredBy) => {
  if (triggeredBy === 'edit') {
    // Don't navigate, just close
    setIsDetailModalOpen(false)
  } else if (returnPath === '/admin/revenue') {
    router.push('/admin/revenue')
  }
}}
```
**Rejected**: Adds complexity and requires changing prop interface

### ❌ Option 2: Add Flag to Prevent Navigation
```typescript
const [isEditingTransition, setIsEditingTransition] = useState(false)

onClose={() => {
  if (isEditingTransition) {
    setIsDetailModalOpen(false)
    setIsEditingTransition(false)
    return
  }
  // ... existing returnTo logic
}}
```
**Rejected**: Adds unnecessary state management complexity

### ✅ Option 3: Remove onClose from Edit Button (Chosen)
```typescript
onClick={() => {
  // Just call onEdit, which handles everything
  onEdit(business)
}}
```
**Advantages**:
- Simplest solution
- No additional state needed
- Leverages existing `openEditModal` logic
- Clear separation of concerns
- No interface changes needed

## Lessons Learned

### 1. Event Handler Order Matters
- When chaining handlers, order of execution is critical
- Handlers with navigation/routing should be last in chain
- Or better: don't chain handlers that have side effects

### 2. Modal State Management
- Each handler should have single responsibility
- `onClose` should only handle closing
- `onEdit` should handle edit transition
- Don't mix concerns in event handlers

### 3. ReturnTo Logic Complexity
- returnTo patterns add hidden behavior to handlers
- Document when handlers have navigation side effects
- Test all paths that trigger handlers with returnTo

### 4. Debugging Event Handlers
- Check what events/handlers fire first
- Look for unexpected handler calls
- Verify handler execution order matches intent

## Summary

✅ **Problem**: Edit button called `onClose()` before `onEdit()`, triggering returnTo navigation
✅ **Root Cause**: Button onClick handler: `onClose()` → navigation, then `onEdit()` → ineffective
✅ **Solution**: Removed `onClose()` call from edit button, let `onEdit()` handle modal state
✅ **Result**: Edit button now correctly opens edit modal without navigation

✅ **Status**: Fix implemented, build successful, ready for testing

**Quick Fix**: Removed `onClose()` call from 2 edit button onClick handlers (lines 374-383, 416-425)

## Key Insight

**The Problem Was Not in `openEditModal()`** - it was already correct!

The problem was that **`onClose()` was being called BEFORE `openEditModal()`**, so all the state cleanup in `openEditModal()` came too late. The navigation had already been triggered by `onClose()`.

By removing the `onClose()` call and letting `openEditModal()` handle everything, we ensure proper execution order and state management.
