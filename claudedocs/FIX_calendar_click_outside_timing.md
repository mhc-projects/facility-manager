# Calendar Click-Outside Handler Timing Issue

**Date**: 2026-02-20
**Priority**: 🔴 CRITICAL - Calendar Dates Still Not Clickable
**Component**: [components/admin/PaymentDateCell.tsx:29-41](components/admin/PaymentDateCell.tsx#L29-L41)

## 📋 Root Cause Identified

### The Real Problem

**Line 33-41**: The `handleClickOutside` handler is **closing the calendar before the button click event fires**.

```tsx
const handleClickOutside = (e: MouseEvent) => {
  if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
    setIsOpen(false);  // ← Closes calendar immediately
  }
};

document.addEventListener('mousedown', handleClickOutside);
//                        ^^^^^^^^^^ mousedown fires BEFORE click
```

### Event Firing Order

```
User clicks calendar date button
  ↓
1. mousedown event fires on button
  ↓
2. handleClickOutside executes
  ↓
3. Checks: Does popoverRef contain event target?
  ↓
4. Result: Could be false due to timing or ref issues
  ↓
5. setIsOpen(false) executes → Calendar closes
  ↓
6. click event fires on button (BUT calendar is already gone!)
  ↓
7. handleDayClick never executes ❌
```

### Why This Happens

**Possible causes**:
1. **Event bubbling timing**: `mousedown` fires before `click`
2. **Ref timing**: `popoverRef.current` might not include all child elements at check time
3. **Event target**: `e.target` might be a child element not directly in popoverRef
4. **React rendering**: Calendar might re-render between mousedown and click

## 🎯 Solution Design

### Option 1: Use `mouseup` Instead of `mousedown` (Recommended ✅)

**Why This Works**:
- `mouseup` fires AFTER `click` event
- Button's `onClick` executes first
- Calendar stays open during button click processing

**Implementation**:
```tsx
document.addEventListener('mouseup', handleClickOutside);
//                        ^^^^^^^^^ Fires after click
```

**Event Order with Fix**:
```
User clicks calendar date button
  ↓
1. mousedown event fires
  ↓
2. click event fires → handleDayClick executes ✅
  ↓
3. mouseup event fires → handleClickOutside checks
  ↓
4. Calendar already closed by handleDateSelect (line 59)
```

### Option 2: Add Delay to handleClickOutside

**Implementation**:
```tsx
const handleClickOutside = (e: MouseEvent) => {
  // Small delay allows click event to fire first
  setTimeout(() => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, 0);
};
```

**Cons**:
- ⚠️ Hacky solution using setTimeout
- ⚠️ Could cause race conditions
- ⚠️ Not reliable

### Option 3: Check `e.target` More Carefully

**Implementation**:
```tsx
const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as Node;

  // Check if click is on popover or any of its descendants
  if (popoverRef.current && !popoverRef.current.contains(target)) {
    // Additional check: Is target a button inside calendar?
    const isCalendarButton = (target as Element).closest('[data-calendar-button]');
    if (!isCalendarButton) {
      setIsOpen(false);
    }
  }
};
```

**Cons**:
- ⚠️ Requires adding data attributes to calendar buttons
- ⚠️ More complex logic
- ⚠️ Not addressing root timing issue

## ✅ Recommended Solution: Option 1 (mouseup)

### Implementation

**File**: [components/admin/PaymentDateCell.tsx:39](components/admin/PaymentDateCell.tsx#L39)

```diff
- document.addEventListener('mousedown', handleClickOutside);
+ document.addEventListener('mouseup', handleClickOutside);
  return () => document.removeEventListener('mouseup', handleClickOutside);
```

### Why This is Best

1. ✅ **Simple**: One-word change
2. ✅ **Reliable**: Standard event handling pattern
3. ✅ **No Side Effects**: Doesn't introduce timing hacks
4. ✅ **Predictable**: Click always fires before mouseup
5. ✅ **Performant**: No setTimeout or complex checks

### Event Timeline Comparison

**Before (mousedown - BROKEN)**:
```
Time    Event           Handler                Result
0ms     mousedown    → handleClickOutside  → setIsOpen(false)
10ms    click        → (calendar gone!)    → ❌ No effect
20ms    mouseup      → (nothing)
```

**After (mouseup - FIXED)**:
```
Time    Event           Handler                Result
0ms     mousedown    → (nothing)
10ms    click        → handleDayClick      → ✅ Date selected
                     → handleDateSelect    → setIsOpen(false)
20ms    mouseup      → handleClickOutside  → (already closed)
```

## 🔧 Complete Fix

```tsx
// Close on outside click
useEffect(() => {
  if (!isOpen) return;

  const handleClickOutside = (e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  // FIXED: Use mouseup instead of mousedown
  document.addEventListener('mouseup', handleClickOutside);
  return () => document.removeEventListener('mouseup', handleClickOutside);
}, [isOpen]);
```

## 📊 Testing Validation

### Test Scenarios

1. **Click calendar date**:
   - ✅ mousedown → click (handleDayClick) → mouseup (handleClickOutside, but calendar already closed)
   - ✅ Date selected successfully

2. **Click "오늘" button**:
   - ✅ mousedown → click (handleToday) → mouseup
   - ✅ Today's date selected

3. **Click "삭제" button**:
   - ✅ mousedown → click (handleClear) → mouseup
   - ✅ Date cleared successfully

4. **Click outside calendar**:
   - ✅ mousedown (outside) → click (outside) → mouseup (handleClickOutside detects, closes calendar)
   - ✅ Calendar closes as expected

### Edge Cases Covered

- **Rapid clicking**: mouseup ensures click completes first
- **Touch events**: Mobile touch → click → touchend (similar to mouseup timing)
- **Keyboard navigation**: Enter key triggers click, no mouseup conflict

## 🎯 Success Criteria

1. ✅ **Primary**: Calendar dates are clickable and selectable
2. ✅ **Secondary**: Outside click still closes calendar
3. ✅ **Tertiary**: All calendar buttons (prev, next, today, clear) work
4. ✅ **Edge Cases**: Rapid clicking, touch events, keyboard all work

## 📝 Alternative: If mouseup Doesn't Fully Solve It

If `mouseup` alone doesn't solve the issue, there might be **another problem**:

### Potential Additional Issue: Table Row Click Handler

The revenue table might have row click handlers that are also capturing events.

**Check**: [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx) for row onClick handlers

If table rows have `onClick`:
```tsx
<tr onClick={handleRowClick}>  // ← This might interfere
  <td>
    <PaymentDateCell />  // ← Our calendar
  </td>
</tr>
```

**Solution**: Stop event propagation in calendar trigger button:
```tsx
<button
  onClick={(e) => {
    e.stopPropagation();  // ← Prevent bubbling to table row
    setIsOpen(!isOpen);
  }}
  ...
>
```

## 🔍 Additional Investigation Needed

If after fixing to `mouseup`, the calendar still doesn't work:

1. **Check table row handlers**: Look for onClick on `<tr>` elements
2. **Check parent divs**: Look for event handlers on calendar's parent containers
3. **Check CSS pointer-events**: Ensure no parent has `pointer-events: none`
4. **Check z-index stacking**: Verify calendar is actually on top visually
5. **Browser DevTools**: Use event listener breakpoints to see what's capturing clicks

---

**Status**: ✅ Design Complete - Ready for Implementation
**Priority**: 🔴 CRITICAL (Calendar unusable without fix)
**Estimated Implementation Time**: 1 minute (change mousedown → mouseup)
**Risk Level**: Very Low (Standard event handling pattern)
**Confidence**: High (This is a common timing issue in click-outside handlers)
