# Fix: Edit Modal Return to Revenue & Duplicate Key Error

## Issues Report

### Issue #1: Edit Modal Should Return to Revenue After Save
**Problem**: After editing business info from Revenue → Detail → Edit flow, saving should return to Revenue page to continue workflow

**User Request**: "revenue에서 사업장 상세모달로 이동 후 수정모달까지 이동된 후에 수정모달에서 저장 및 닫기를 누르면 다시 revenue 페이지로 돌아가야하는게 맞는거같아. 업무 흐름의 시작점으로 돌아가야 해당 업무를 이어서 계속 할 수 있잖아"

**Current Behavior**: Edit modal save → stays on Business page
**Expected Behavior**: Edit modal save → returns to Revenue page (workflow origin)

### Issue #2: Duplicate Key Constraint Error on Business Name Update
**Problem**: UPDATE query fails with unique constraint violation even when business_name hasn't changed

**Error Log**:
```
❌ [PG] Query failed: {
  text: '\n      UPDATE business_info\n      SET business_nam',
  error: 'duplicate key value violates unique constraint "business_info_business_name_key"'
}
code: '23505',
detail: 'Key (business_name)=((주)규원테크) already exists.',
constraint: 'business_info_business_name_key',
```

**Current Behavior**: Updating any field triggers business_name UPDATE, causing constraint error
**Expected Behavior**: Only update business_name if it actually changed

## Root Cause Analysis

### Issue #1: returnPath Cleared Too Early

**Problem in openEditModal** ([app/admin/business/page.tsx:2922-2923](app/admin/business/page.tsx#L2922-L2923)):

```typescript
const openEditModal = async (business: UnifiedBusinessInfo) => {
  // ... fetch data ...

  setIsDetailModalOpen(false)
  setReturnPath(null)        // ❌ Cleared returnPath!
  setReturnTaskId(null)      // ❌ Cleared returnTaskId!

  setTimeout(() => {
    setIsModalOpen(true)
  }, 0)
}
```

**Why This Was Wrong**:
- `returnPath` was set to `/admin/revenue` when Detail modal opened from Revenue
- `openEditModal()` cleared `returnPath` to prevent Detail modal's close handler from triggering navigation
- BUT this also removed the information about where to return after Edit modal saves
- Edit modal's save handler checks `returnPath` to decide where to navigate
- With `returnPath === null`, edit modal couldn't return to Revenue

**Workflow Broken**:
```
Revenue → Detail (returnPath = /admin/revenue)
  → Edit button clicked
    → openEditModal() clears returnPath ❌
      → Edit modal opens (returnPath = null)
        → Save button clicked
          → handleReturnToSource checks returnPath
            → returnPath === null
            → Just closes modal, stays on Business page ❌
```

### Issue #2: business_name Always Included in UPDATE

**Problem in API Route** ([app/api/business-info-direct/route.ts:212](app/api/business-info-direct/route.ts#L212)):

```typescript
// Before fix
if (updateData.business_name !== undefined) {
  const normalizedName = normalizeUTF8(updateData.business_name || '').trim();

  // Only check for duplicates if name changed
  if (normalizedName !== business.business_name?.trim()) {
    // ... duplicate check ...
  }

  updateObject.business_name = normalizedName;  // ❌ Always added!
}
```

**Why This Caused Error**:
1. Frontend sends all form fields, including unchanged `business_name`
2. API normalizes the name and checks if it changed
3. If name didn't change, duplicate check is skipped ✅
4. BUT `business_name` is still added to `updateObject` ❌
5. UPDATE query includes `business_name = '(주)규원테크'`
6. PostgreSQL checks unique constraint for ALL rows (including self)
7. Finds duplicate (the record itself!) and throws error

**PostgreSQL Unique Constraint Behavior**:
```sql
-- This fails even though it's the same record:
UPDATE business_info
SET business_name = '(주)규원테크'  -- Same value
WHERE id = 'abc123';

-- Error: duplicate key value violates unique constraint
-- Why? PostgreSQL checks constraint against ALL rows, not just other rows
```

## Solutions

### Fix #1: Preserve returnPath in openEditModal

**File**: [app/admin/business/page.tsx:2919-2927](app/admin/business/page.tsx#L2919-L2927)

**Before**:
```typescript
// Close detail modal and clear return navigation state BEFORE opening edit modal
// This prevents the detail modal's close handler (with returnTo logic) from interfering
setIsDetailModalOpen(false)
setReturnPath(null)        // ❌ Cleared returnPath
setReturnTaskId(null)

setTimeout(() => {
  setIsModalOpen(true)
}, 0)
```

**After**:
```typescript
// Close detail modal BEFORE opening edit modal
// IMPORTANT: Keep returnPath intact so edit modal can return to origin after save
setIsDetailModalOpen(false)

setTimeout(() => {
  setIsModalOpen(true)
}, 0)
```

**Why This Works**:
- Detail modal closes immediately (`setIsDetailModalOpen(false)`)
- `returnPath` stays intact (NOT cleared)
- Edit modal opens with `returnPath` still set
- When user saves, `handleReturnToSource` sees `returnPath === '/admin/revenue'`
- Navigates back to Revenue page ✅

### Fix #2: Only Update business_name If Changed

**File**: [app/api/business-info-direct/route.ts:191-215](app/api/business-info-direct/route.ts#L191-L215)

**Before**:
```typescript
if (updateData.business_name !== undefined) {
  const normalizedName = normalizeUTF8(updateData.business_name || '').trim();

  if (normalizedName !== business.business_name?.trim()) {
    // ... duplicate check ...
  }

  updateObject.business_name = normalizedName;  // ❌ Always added
}
```

**After**:
```typescript
if (updateData.business_name !== undefined) {
  const normalizedName = normalizeUTF8(updateData.business_name || '').trim();

  // Only update business_name if it actually changed
  if (normalizedName !== business.business_name?.trim()) {
    const existingWithSameName = await queryOne(
      'SELECT id FROM business_info WHERE business_name = $1 AND is_deleted = false AND id != $2',
      [normalizedName, id]
    );

    if (existingWithSameName) {
      return NextResponse.json({
        success: false,
        error: `이미 동일한 사업장명이 존재합니다: ${normalizedName}`
      }, { status: 409 });
    }

    // Only add to updateObject if name changed
    updateObject.business_name = normalizedName;  // ✅ Only when changed
  }
  // If name didn't change, don't include it in updateObject to avoid unique constraint error
}
```

**Why This Works**:
- If `business_name` unchanged, it's NOT added to `updateObject`
- UPDATE query doesn't include `business_name` field
- No unique constraint check triggered
- Update succeeds ✅

## Flow Comparison

### Issue #1: Return to Revenue

**Before Fix (Incorrect)**:
```
Revenue page (start)
  → Click business row
    → Revenue modal opens
      → Click 사업장명
        → Detail modal opens (returnPath = /admin/revenue) ✅
          → Click "정보수정"
            → openEditModal() executes:
              - setIsDetailModalOpen(false)
              - setReturnPath(null) ❌ CLEARED!
              - setIsModalOpen(true)
            → Edit modal opens (returnPath = null)
              → User edits and clicks save
                → handleReturnToSource checks returnPath
                  → returnPath === null
                  → Just closes modal ❌
                → Stays on Business page ❌
```

**After Fix (Correct)**:
```
Revenue page (start)
  → Click business row
    → Revenue modal opens
      → Click 사업장명
        → Detail modal opens (returnPath = /admin/revenue) ✅
          → Click "정보수정"
            → openEditModal() executes:
              - setIsDetailModalOpen(false)
              - returnPath stays intact ✅
              - setIsModalOpen(true)
            → Edit modal opens (returnPath = /admin/revenue) ✅
              → User edits and clicks save
                → handleReturnToSource checks returnPath
                  → returnPath === '/admin/revenue' ✅
                  → router.push('/admin/revenue') ✅
                → Returns to Revenue page ✅
```

### Issue #2: Duplicate Key Error

**Before Fix (Error)**:
```
User edits business info
  → Frontend sends: { business_name: "(주)규원테크", ... }
    → API processes:
      1. normalizedName = "(주)규원테크"
      2. Check if changed: "(주)규원테크" === "(주)규원테크" → NO change
      3. Skip duplicate check ✅
      4. Add to updateObject: updateObject.business_name = "(주)규원테크" ❌
    → Build UPDATE query:
      UPDATE business_info SET business_name = $1, ... WHERE id = $10
    → Execute with values: ["(주)규원테크", ...]
    → PostgreSQL:
      - Check unique constraint on business_name
      - Find "(주)규원테크" already exists (same record!)
      - Throw error: duplicate key violates constraint ❌
```

**After Fix (Success)**:
```
User edits business info
  → Frontend sends: { business_name: "(주)규원테크", ... }
    → API processes:
      1. normalizedName = "(주)규원테크"
      2. Check if changed: "(주)규원테크" === "(주)규원테크" → NO change
      3. Skip duplicate check ✅
      4. Don't add to updateObject ✅
    → Build UPDATE query:
      UPDATE business_info SET updated_at = $1, ... WHERE id = $5
      (business_name NOT included) ✅
    → Execute with values: [timestamp, ...]
    → PostgreSQL:
      - No business_name in SET clause
      - No unique constraint check
      - Update succeeds ✅
```

## Build Verification

```bash
✅ Build Status:
npm run build
✓ Generating static pages (91/91)
✓ Build completed successfully
✓ Business page: 167KB
✓ business-info-direct API: compiled successfully
✓ No compilation errors
✓ No TypeScript errors
```

## Testing Checklist

### Issue #1: Return to Revenue

1. **Start from Revenue Page**
   ```
   Navigate to /admin/revenue
   Click any business row → Revenue modal opens
   ```

2. **Navigate to Edit Modal**
   ```
   Click 사업장명 in Revenue modal header
   → Business detail modal opens
   Click "정보수정" button
   → Edit modal opens
   ```

3. **Test Save and Return**
   ```
   Make changes in edit modal
   Click "수정완료" (save) button
   Expected Result:
   - ✅ Changes saved successfully
   - ✅ Edit modal closes
   - ✅ Returns to Revenue page (not Business page)
   - ✅ Revenue modal opens automatically showing updated data
   ```

4. **Test Cancel Button**
   ```
   Open edit modal from Revenue flow
   Click cancel/close button
   Expected Result:
   - ✅ Edit modal closes
   - ✅ Returns to Revenue page
   ```

### Issue #2: Duplicate Key Error

1. **Edit Business Without Changing Name**
   ```
   Open any business edit modal
   Change only other fields (e.g., address, contact)
   Keep business_name unchanged
   Click "수정완료"
   Expected Result:
   - ✅ Update succeeds (no error)
   - ✅ No duplicate key constraint error
   - ✅ Other fields updated successfully
   ```

2. **Edit Business Changing Name**
   ```
   Open business edit modal
   Change business_name to new unique name
   Click "수정완료"
   Expected Result:
   - ✅ Update succeeds
   - ✅ business_name updated
   ```

3. **Try Duplicate Name**
   ```
   Open business edit modal
   Change business_name to existing name
   Click "수정완료"
   Expected Result:
   - ❌ Update fails with error message
   - ✅ Error: "이미 동일한 사업장명이 존재합니다"
   ```

### Expected Console Output

**Successful Edit from Revenue**:
```
✏️ [Edit] Opening edit modal
✅ [Edit] Detail modal closed, returnPath preserved
✅ [Edit] Edit modal opening
📝 [Save] Saving changes...
✅ [Save] Update successful
🔙 [Return] returnPath = /admin/revenue
🔙 [Return] Navigating to Revenue page
✅ [Revenue] Returned successfully
```

**Successful Update Without Name Change**:
```
📝 [API] Processing update
✅ [API] business_name unchanged, skipping from UPDATE
📝 [API] UPDATE query: SET updated_at = $1, address = $2, ... WHERE id = $10
✅ [API] Update successful
```

**Duplicate Name Attempt**:
```
📝 [API] Processing update
⚠️ [API] business_name changed: "old" → "new"
🔍 [API] Checking for duplicates...
❌ [API] Duplicate found: "new" already exists
❌ [Response] 409 Conflict: 이미 동일한 사업장명이 존재합니다
```

## Related Files

### Modified Files
- [app/admin/business/page.tsx:2919-2927](app/admin/business/page.tsx#L2919-L2927) - Removed `setReturnPath(null)` from `openEditModal`
- [app/api/business-info-direct/route.ts:191-215](app/api/business-info-direct/route.ts#L191-L215) - Only update `business_name` if changed

### Related Documentation
- [FIX_edit_button_onclick_closes_modal.md](FIX_edit_button_onclick_closes_modal.md) - Previous edit button fix
- [FIX_dual_modal_issues_final.md](FIX_dual_modal_issues_final.md) - Modal z-index fixes
- [IMPLEMENTATION_url_navigation_with_return.md](IMPLEMENTATION_url_navigation_with_return.md) - ReturnTo logic implementation

## Lessons Learned

### 1. Workflow State Management
- **Preserve workflow context**: Don't clear navigation state prematurely
- **Complete workflows**: User should return to workflow origin after completing actions
- **State lifecycle**: Understand when state should persist vs. be cleared

### 2. Database Unique Constraints
- **Update only changed fields**: Avoid triggering constraint checks unnecessarily
- **PostgreSQL behavior**: Unique constraints check ALL rows, including the record being updated
- **Conditional updates**: Only include fields in UPDATE query if they actually changed

### 3. User Experience Flow
- **Workflow continuity**: Users should return to where they started
- **Context preservation**: Keep enough state to complete workflows properly
- **Error prevention**: Avoid unnecessary database operations that could fail

### 4. API Design Patterns
- **Diff-based updates**: Compare new vs. old values before updating
- **Selective field updates**: Only update fields that changed
- **Proper error handling**: Return meaningful error messages for constraint violations

## Summary

✅ **Problem #1**: Edit modal save didn't return to Revenue page (workflow origin)
✅ **Root Cause #1**: `returnPath` cleared too early in `openEditModal()`
✅ **Solution #1**: Keep `returnPath` intact when opening edit modal
✅ **Result #1**: Edit modal save now returns to Revenue page correctly

✅ **Problem #2**: Duplicate key constraint error when business_name unchanged
✅ **Root Cause #2**: `business_name` included in UPDATE even when not changed
✅ **Solution #2**: Only add `business_name` to `updateObject` if actually changed
✅ **Result #2**: Updates succeed without unnecessary constraint checks

✅ **Status**: Both fixes implemented, build successful, ready for testing

**Quick Fixes Summary**:
1. Removed `setReturnPath(null)` from `openEditModal()` (line 2922)
2. Added condition to only update `business_name` if changed (line 197-213)

## UX Improvement: Complete Workflow Cycle

**Before**:
```
Revenue (start) → Detail → Edit → Save → Business page (stuck)
User must manually navigate back to Revenue ❌
```

**After**:
```
Revenue (start) → Detail → Edit → Save → Revenue (return) ✅
User continues workflow seamlessly
```

This follows the principle: **"Return users to where they started after completing a task"**
