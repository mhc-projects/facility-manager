# Fix: returnPath Value Mismatch in handleReturnToSource

## Issue Report

**Problem**: Edit modal save/cancel doesn't return to Revenue page even though update succeeds

**User Report**: "Revenue → Detail → Edit → 저장 or 취소 → Revenue로 복귀가 안되고 있어. 업데이트는 성공했어."

**Current Behavior**: Edit modal closes but stays on Business page
**Expected Behavior**: Edit modal closes and returns to Revenue page

## Root Cause Analysis

### Problem: Inconsistent returnPath Value Check

**Detail Modal onClose** ([app/admin/business/page.tsx:4567](app/admin/business/page.tsx#L4567)):
```typescript
onClose={() => {
  if (returnPath === '/admin/revenue' || returnPath === 'revenue') {
    // ✅ Checks both '/admin/revenue' AND 'revenue'
    router.push('/admin/revenue')
    setReturnPath(null)
  }
}}
```

**Edit Modal handleReturnToSource** ([app/admin/business/page.tsx:2301](app/admin/business/page.tsx#L2301)):
```typescript
const handleReturnToSource = useCallback(() => {
  if (returnPath === 'revenue' && selectedBusiness) {
    // ❌ Only checks 'revenue', NOT '/admin/revenue'!
    router.push(`/admin/revenue?businessId=${selectedBusiness.id}&openRevenueModal=true`);
  } else {
    // Goes here when returnPath === '/admin/revenue'
    setIsModalOpen(false);
    // ... just closes modal, no navigation
  }
}, [returnPath, selectedBusiness, router]);
```

### Execution Flow (Incorrect)

```
Revenue page
  → Navigate to Business page with URL: /admin/business?openModal=id&returnTo=/admin/revenue
    → useLayoutEffect sets: returnPath = '/admin/revenue'  ← Set to '/admin/revenue'
      → Detail modal opens
        → Click "정보수정"
          → openEditModal() executes:
            - Detail modal closes
            - returnPath stays = '/admin/revenue'  ← Still '/admin/revenue'
            - Edit modal opens
              → User saves/cancels
                → handleReturnToSource executes:
                  - Check: returnPath === 'revenue' ? NO (it's '/admin/revenue')
                  - Goes to else branch ❌
                  - setIsModalOpen(false) ← Just closes modal
                  - No navigation ❌
                → Stays on Business page ❌
```

### Why Values Don't Match

**URL Parameter** (set from BusinessRevenueModal):
```typescript
// components/business/BusinessRevenueModal.tsx:397
router.push(`/admin/business?openModal=${business.id}&returnTo=/admin/revenue`)
//                                                     ^^^^^^^^^^^^^^^^^^^^
//                                                     Full path format
```

**useLayoutEffect** (reads URL parameter):
```typescript
// app/admin/business/page.tsx:2204
const returnTo = searchParams?.get('returnTo')  // Gets '/admin/revenue'
if (returnTo) {
  setReturnPath(returnTo)  // Sets '/admin/revenue'
}
```

**Detail Modal Check** (consistent):
```typescript
if (returnPath === '/admin/revenue' || returnPath === 'revenue') {
  // ✅ Handles both formats
}
```

**Edit Modal Check** (inconsistent):
```typescript
if (returnPath === 'revenue' && selectedBusiness) {
  // ❌ Only handles 'revenue', not '/admin/revenue'
}
```

## Solution

### Fix: Check Both Path Formats in handleReturnToSource

**File**: [app/admin/business/page.tsx:2301](app/admin/business/page.tsx#L2301)

**Before**:
```typescript
const handleReturnToSource = useCallback(() => {
  if (returnPath === 'revenue' && selectedBusiness) {
    // ❌ Only checks 'revenue'
    router.push(`/admin/revenue?businessId=${selectedBusiness.id}&openRevenueModal=true`);
  } else {
    setIsModalOpen(false);
    // ...
  }
}, [returnPath, selectedBusiness, router]);
```

**After**:
```typescript
const handleReturnToSource = useCallback(() => {
  if ((returnPath === 'revenue' || returnPath === '/admin/revenue') && selectedBusiness) {
    // ✅ Checks both 'revenue' AND '/admin/revenue'
    router.push(`/admin/revenue?businessId=${selectedBusiness.id}&openRevenueModal=true`);
  } else {
    setIsModalOpen(false);
    // ...
  }
}, [returnPath, selectedBusiness, router]);
```

### Fix: Update Button Labels Consistency

**File**: [app/admin/business/page.tsx:4634, 4638](app/admin/business/page.tsx#L4634)

**Before**:
```typescript
<button
  onClick={handleReturnToSource}
  title={returnPath === 'revenue' ? '매출 관리로 돌아가기' : '취소'}
>
  <span>{returnPath === 'revenue' ? '돌아가기' : '취소'}</span>
</button>
```

**After**:
```typescript
<button
  onClick={handleReturnToSource}
  title={(returnPath === 'revenue' || returnPath === '/admin/revenue') ? '매출 관리로 돌아가기' : '취소'}
>
  <span>{(returnPath === 'revenue' || returnPath === '/admin/revenue') ? '돌아가기' : '취소'}</span>
</button>
```

## Flow Comparison

### Before Fix (Incorrect)

```
Revenue page
  → Click business → Revenue modal opens
    → Click 사업장명
      → Business page URL: /admin/business?openModal=id&returnTo=/admin/revenue
        → returnPath = '/admin/revenue'  ← Set from URL
          → Detail modal opens
            → Click "정보수정"
              → Edit modal opens (returnPath still = '/admin/revenue')
                → User clicks save/cancel
                  → handleReturnToSource:
                    - Check: returnPath === 'revenue' ? NO ❌
                    - else branch: just close modal
                  → Stays on Business page ❌
```

### After Fix (Correct)

```
Revenue page
  → Click business → Revenue modal opens
    → Click 사업장명
      → Business page URL: /admin/business?openModal=id&returnTo=/admin/revenue
        → returnPath = '/admin/revenue'  ← Set from URL
          → Detail modal opens
            → Click "정보수정"
              → Edit modal opens (returnPath still = '/admin/revenue')
                → User clicks save/cancel
                  → handleReturnToSource:
                    - Check: returnPath === '/admin/revenue' ? YES ✅
                    - router.push('/admin/revenue?businessId=...') ✅
                  → Returns to Revenue page ✅
```

## Build Verification

```bash
✅ Build Status:
npm run build
✓ Generating static pages (91/91)
✓ Build completed successfully
✓ Business page: 167KB
✓ No compilation errors
✓ No TypeScript errors
```

## Testing Checklist

### Complete Workflow Test

1. **Start from Revenue**
   ```
   Navigate to /admin/revenue
   Click any business row → Revenue modal opens
   ```

2. **Navigate to Edit Modal**
   ```
   Click 사업장명 in Revenue modal header
   → Business detail modal opens (returnPath = '/admin/revenue')
   Click "정보수정" button
   → Edit modal opens (returnPath still = '/admin/revenue')
   ```

3. **Test Save Button**
   ```
   Make changes in edit modal
   Click "수정완료" (save) button
   Expected Result:
   - ✅ Changes saved successfully
   - ✅ Edit modal closes
   - ✅ Returns to Revenue page
   - ✅ Revenue modal opens automatically
   ```

4. **Test Cancel Button**
   ```
   Open edit modal from Revenue flow again
   Click "취소" (cancel) button
   Expected Result:
   - ✅ Edit modal closes
   - ✅ Returns to Revenue page
   - ✅ No changes saved
   ```

5. **Verify Button Labels**
   ```
   When editing from Revenue flow:
   - ✅ Button shows "돌아가기" (not "취소")
   - ✅ Tooltip shows "매출 관리로 돌아가기"

   When editing from Business page directly:
   - ✅ Button shows "취소"
   - ✅ Tooltip shows "취소"
   ```

### Expected Console Output

**Successful Return to Revenue**:
```
✏️ [Edit] Edit modal opened
📝 [Save] Saving changes...
✅ [Save] Update successful
🔙 [Return] Revenue 페이지로 복귀: (주)규원테크
✅ [Navigation] Navigating to /admin/revenue?businessId=...
✅ [Revenue] Page loaded
✅ [Revenue] Auto-opening modal for business
```

**Cancel and Return**:
```
✏️ [Edit] Edit modal opened
❌ [Cancel] User clicked cancel button
🔙 [Return] Revenue 페이지로 복귀: (주)규원테크
✅ [Navigation] Navigating to /admin/revenue?businessId=...
```

## Related Files

### Modified Files
- [app/admin/business/page.tsx:2301](app/admin/business/page.tsx#L2301) - Fixed `handleReturnToSource` returnPath check
- [app/admin/business/page.tsx:4634](app/admin/business/page.tsx#L4634) - Fixed button label condition
- [app/admin/business/page.tsx:4638](app/admin/business/page.tsx#L4638) - Fixed button text condition

### Related Documentation
- [FIX_edit_modal_return_and_duplicate_key.md](FIX_edit_modal_return_and_duplicate_key.md) - Original return flow implementation
- [FIX_edit_button_onclick_closes_modal.md](FIX_edit_button_onclick_closes_modal.md) - Edit button fix
- [IMPLEMENTATION_url_navigation_with_return.md](IMPLEMENTATION_url_navigation_with_return.md) - ReturnTo logic implementation

## Alternative Solutions Considered

### ❌ Option 1: Normalize returnPath to Single Format
```typescript
// In useLayoutEffect
const returnTo = searchParams?.get('returnTo')
if (returnTo) {
  // Always store as 'revenue' format
  const normalizedPath = returnTo.replace('/admin/', '')
  setReturnPath(normalizedPath)
}
```
**Rejected**: Would require updating all returnPath checks throughout codebase

### ❌ Option 2: Use Enum for Return Paths
```typescript
enum ReturnPath {
  REVENUE = 'revenue',
  TASKS = 'tasks'
}
```
**Rejected**: Over-engineering for simple string comparison issue

### ✅ Option 3: Check Both Formats (Chosen)
```typescript
if (returnPath === 'revenue' || returnPath === '/admin/revenue') {
  // Handle return
}
```
**Advantages**:
- Minimal code change
- Backward compatible
- No breaking changes
- Easy to understand

## Lessons Learned

### 1. Consistency in Value Formats
- **Be consistent**: Use same format throughout codebase
- **Document formats**: Comment expected value formats
- **Handle variations**: Check for common variations defensively

### 2. Testing Edge Cases
- **Test complete flows**: Not just happy path, but all navigation paths
- **Verify conditions**: Ensure all conditional checks match actual values
- **Console logging**: Add logging to debug value mismatches

### 3. Code Review Patterns
- **Check conditionals**: When reviewing, verify condition values match
- **Search for patterns**: Find all places a value is checked
- **Consistency audit**: Ensure consistent checks across codebase

### 4. Path Handling
- **Relative vs Absolute**: Document whether paths are relative or absolute
- **Normalization**: Consider normalizing paths to single format
- **Defensive coding**: Check for common variations

## Summary

✅ **Problem**: Edit modal save/cancel didn't return to Revenue page
✅ **Root Cause**: `handleReturnToSource` only checked `'revenue'`, but actual value was `'/admin/revenue'`
✅ **Solution**: Updated condition to check both `'revenue'` and `'/admin/revenue'`
✅ **Result**: Edit modal save/cancel now correctly returns to Revenue page

✅ **Status**: Fix implemented, build successful, ready for testing

**Quick Fix**: Added `|| returnPath === '/admin/revenue'` to 3 conditions (lines 2301, 4634, 4638)

## Key Insight

**The issue wasn't in the flow logic or state management** - those were correct!

The problem was a simple **string value mismatch**:
- We set: `returnPath = '/admin/revenue'` (full path from URL)
- We checked: `returnPath === 'revenue'` (short format)
- Result: Condition never matched ❌

This is a reminder to:
1. Use consistent value formats
2. Add logging to verify actual values
3. Test complete workflows, not just individual steps
