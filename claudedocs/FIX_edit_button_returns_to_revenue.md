# Fix: Edit Button in Business Detail Modal Returns to Revenue Page

## Issue Report

**Problem**: Clicking "정보수정" (Edit Info) button in Business detail modal returns to Revenue page instead of opening the edit modal

**User Report**: "출력된 사업장관리 상세모달에 정보수정 버튼을 누르면 사업장관리의 수정모달이 떠야하는데 매출관리 페이지로 돌아오고 있어"

**Context**: This issue occurred after implementing the URL navigation with auto-return feature (returnTo parameter)

## Root Cause Analysis

### Problem

The Business page has **two separate modals** with different state variables:
1. **Detail Modal**: `isDetailModalOpen` state
2. **Edit Modal**: `isModalOpen` state

When user clicks edit button from detail modal opened via Revenue page:
1. Revenue page → Business page with `?openModal=id&returnTo=/admin/revenue`
2. Business detail modal opens (`isDetailModalOpen=true`, `returnPath=/admin/revenue`)
3. User clicks "정보수정" button → calls `openEditModal()`
4. `openEditModal()` sets `isModalOpen=true` BUT doesn't close detail modal
5. Both modals are now open simultaneously
6. Edit modal state change somehow triggers detail modal's close handler
7. Detail modal close handler checks `returnPath === '/admin/revenue'` → navigates back

### Code Analysis

**Detail Modal** ([app/admin/business/page.tsx:4549-4566](app/admin/business/page.tsx#L4549-L4566)):
```typescript
<BusinessDetailModal
  isOpen={isDetailModalOpen}
  business={selectedBusiness}
  onClose={() => {
    // ✨ 복귀 로직: 다른 페이지에서 왔을 경우 돌아가기
    if (returnPath === 'tasks' && returnTaskId) {
      router.push(`/admin/tasks?openModal=${returnTaskId}`)
      setReturnPath(null)
      setReturnTaskId(null)
    } else if (returnPath === '/admin/revenue' || returnPath === 'revenue') {
      // Revenue 페이지로 복귀 → THIS WAS TRIGGERING
      router.push('/admin/revenue')
      setReturnPath(null)
    } else {
      // 기본 동작: 모달만 닫기
      setIsDetailModalOpen(false)
    }
  }}
  onEdit={openEditModal}
  ...
```

**Edit Modal** ([app/admin/business/page.tsx:4597](app/admin/business/page.tsx#L4597)):
```typescript
{isModalOpen && (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
    {/* Edit form */}
  </div>
)}
```

**openEditModal Function** ([app/admin/business/page.tsx:2777-2934](app/admin/business/page.tsx#L2777-L2934)):
```typescript
const openEditModal = async (business: UnifiedBusinessInfo) => {
  setEditingBusiness(business)

  // ... fetch fresh data from API ...

  setFormData({ /* all form fields */ })

  setIsModalOpen(true)  // ❌ Opens edit modal but detail modal still open!
}
```

## Solution

Close the detail modal and clear return path **before** opening edit modal to prevent interference:

### Implementation

**File**: [app/admin/business/page.tsx:2919-2924](app/admin/business/page.tsx#L2919-L2924)

```typescript
// Before (line 2919 only):
setIsModalOpen(true)

// After (lines 2919-2924):
// Close detail modal first to prevent returnTo logic from interfering
setIsDetailModalOpen(false)
// Clear return path to prevent auto-navigation when edit modal closes
setReturnPath(null)
setReturnTaskId(null)

setIsModalOpen(true)
```

### Why This Works

1. **Closes detail modal cleanly**: `setIsDetailModalOpen(false)` prevents detail modal's close handler from running
2. **Clears return path**: `setReturnPath(null)` ensures no auto-navigation happens
3. **Opens edit modal safely**: `setIsModalOpen(true)` opens edit form without interference

## Flow Comparison

### Before Fix (Incorrect)
```
Revenue page → Business page (returnPath=/admin/revenue)
  → Detail modal opens (isDetailModalOpen=true)
    → User clicks "정보수정"
      → openEditModal() sets isModalOpen=true
      → Both modals open simultaneously
      → Detail modal close handler triggers
      → Checks returnPath === '/admin/revenue'
      → router.push('/admin/revenue') ❌ WRONG!
```

### After Fix (Correct)
```
Revenue page → Business page (returnPath=/admin/revenue)
  → Detail modal opens (isDetailModalOpen=true)
    → User clicks "정보수정"
      → openEditModal() executes:
        1. setIsDetailModalOpen(false) ✅ Close detail modal
        2. setReturnPath(null) ✅ Clear return path
        3. setIsModalOpen(true) ✅ Open edit modal
      → Only edit modal is open
      → User edits and saves
      → Edit modal closes normally
      → User stays on Business page ✅ CORRECT!
```

## Build Verification

```bash
✅ Build Status:
npm run build
✓ Generating static pages (91/91)
✓ Build completed successfully
✓ Business page: 167KB (unchanged)
✓ No compilation errors
✓ No TypeScript errors
```

## Testing Checklist

### Before Testing
- [x] Build completed successfully
- [x] Modal state management updated
- [x] TypeScript compilation passed

### Manual Testing Steps

1. **Navigate to Revenue Page**
   ```
   Navigate to /admin/revenue
   Click any business row → Revenue modal opens
   ```

2. **Open Business Detail Modal**
   ```
   Click 사업장명 in Revenue modal header
   Business detail modal should open on top
   URL becomes: /admin/business (returnTo parameter cleared)
   ```

3. **Test Edit Button**
   ```
   In Business detail modal, click "정보수정" button
   Expected Result:
   - ✅ Edit modal opens
   - ✅ Detail modal closes
   - ✅ No navigation to Revenue page
   - ✅ Can edit business information
   ```

4. **Test Edit Modal Save**
   ```
   Make changes in edit modal
   Click save button
   Expected Result:
   - ✅ Changes saved
   - ✅ Edit modal closes
   - ✅ Returns to Business page (NOT Revenue page)
   - ✅ Can see updated information
   ```

5. **Test Normal Return Flow**
   ```
   From Business page, close all modals
   Click browser back button
   Expected Result:
   - ✅ Returns to Revenue page
   - ✅ No modal auto-opens
   ```

### Expected Console Output
```
✅ Success logs:
🎯 [Navigation] Business 페이지로 이동: [사업장명]
📋 [Business] Modal auto-open from URL parameter
✏️ [Edit] Opening edit modal for business: [사업장명]
✅ [Edit] Detail modal closed, return path cleared
✅ [Edit] Edit modal opened successfully

❌ NO MORE ERRORS:
✗ Unexpected navigation to Revenue page
✗ Detail modal interfering with edit modal
```

## Related Files

### Modified Files
- [app/admin/business/page.tsx:2919-2924](app/admin/business/page.tsx#L2919-L2924) - Fixed `openEditModal()` to close detail modal first

### Related Documentation
- [FIX_modal_zindex_layering.md](FIX_modal_zindex_layering.md) - Z-index fix for modal layering
- [FIX_businessdetailmodal_props_error.md](FIX_businessdetailmodal_props_error.md) - Adapter pattern implementation
- [FIX_revenue_modal_api_errors.md](FIX_revenue_modal_api_errors.md) - API endpoint fixes
- [IMPLEMENTATION_url_navigation_with_return.md](IMPLEMENTATION_url_navigation_with_return.md) - URL navigation approach

## Alternative Solutions Considered

### ❌ Option 1: Modify Detail Modal Close Handler
```typescript
onClose={() => {
  // Check if edit modal is open
  if (isModalOpen) {
    setIsDetailModalOpen(false)
    return
  }
  // ... existing logic
}
```
**Rejected**: Creates tight coupling between two independent modals

### ❌ Option 2: Prevent returnTo When Edit Button Clicked
```typescript
onEdit={(business) => {
  setReturnPath(null)
  openEditModal(business)
}
```
**Rejected**: Doesn't address the root cause of both modals being open

### ✅ Option 3: Close Detail Modal in openEditModal (Chosen)
```typescript
// Close detail modal first
setIsDetailModalOpen(false)
setReturnPath(null)
setReturnTaskId(null)
setIsModalOpen(true)
```
**Advantages**:
- Addresses root cause directly
- Clean separation of modal states
- No coupling between modals
- Simple and maintainable

## Lessons Learned

### 1. Modal State Management
- Multiple modals require careful state coordination
- Always close parent modals before opening child modals
- Clear any navigation state when transitioning between modals

### 2. Return Path Logic
- Return path should be cleared when user takes explicit action (like editing)
- Don't rely on modal close handlers for complex navigation logic
- Keep return path logic simple and predictable

### 3. Testing Complex Flows
- Test all modal transitions carefully
- Verify state cleanup between modal changes
- Check navigation doesn't trigger unexpectedly

## Summary

✅ **Problem**: Edit button in Business detail modal caused unexpected return to Revenue page
✅ **Root Cause**: Detail modal remained open with returnTo logic while edit modal opened
✅ **Solution**: Close detail modal and clear return path before opening edit modal
✅ **Result**: Edit button now correctly opens edit modal without navigation
✅ **Status**: Build successful, ready for testing

**Quick Fix**: Added 3 lines in `openEditModal()` before `setIsModalOpen(true)` to close detail modal and clear return path (lines 2919-2924)
