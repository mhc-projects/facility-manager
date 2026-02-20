# Calendar Backdrop Blocking Clicks Issue

**Date**: 2026-02-20
**Priority**: 🔴 CRITICAL - Calendar Still Not Clickable
**Component**: [components/admin/PaymentDateCell.tsx:95-116](components/admin/PaymentDateCell.tsx#L95-L116)

## 📋 Issue Analysis

### User Report
> "z-index를 수정했어도 여전히 달력폼을 사용할 수가 없어. 달력의 달짜가 선택이 안되고 있어."

**Previous Fixes Applied**:
1. ✅ Added `pointer-events-auto` to calendar
2. ✅ Added backdrop overlay (z-40)
3. ✅ Fixed positioning (`absolute top-full left-0`)
4. ✅ Set high z-index (z-50)

**Still Not Working**: Calendar dates are not clickable

## 🔍 Root Cause Analysis

### Current Implementation

```tsx
{isOpen && (
  <>
    {/* Backdrop - z-40 */}
    <div
      className="fixed inset-0 bg-black/10 z-40"
      onClick={() => setIsOpen(false)}
      aria-hidden="true"
    />

    {/* Calendar - z-50 */}
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto ..."
    >
```

### The Problem: Stacking Context Issue

**Issue**: The backdrop (`fixed inset-0 z-40`) and calendar (`absolute z-50`) are in **different stacking contexts**.

**Why This Breaks**:
```
┌─────────────────────────────────────────────────┐
│ Parent Container (relative positioning)         │
│  ├─ Backdrop (fixed, z-40) ← Creates NEW        │
│  │   stacking context                           │
│  └─ Calendar (absolute, z-50) ← Different       │
│      stacking context                           │
└─────────────────────────────────────────────────┘
```

When an element has `position: fixed`, it creates a **new stacking context** separate from `position: absolute` siblings. The backdrop's `fixed inset-0` covers the **entire viewport**, including where the calendar appears, even though the calendar has higher z-index.

### Visual Representation

**What's Happening**:
```
Screen Layout:
┌─────────────────────────────────────────────────┐
│ Backdrop (fixed inset-0, z-40)                  │ ← Covers ENTIRE screen
│ ┌────────────────┐                              │
│ │ Calendar       │ ← z-50 but in different      │
│ │ (absolute)     │   stacking context           │
│ │ [dates...]     │ ← Clicks hit backdrop first  │
│ └────────────────┘                              │
│                                                 │
└─────────────────────────────────────────────────┘

User clicks date → Backdrop intercepts → setIsOpen(false) → Calendar closes
```

## 🎯 Solution Design

### Option 1: Remove Backdrop Entirely (Simplest)

**Pros**:
- ✅ Fixes clickability immediately
- ✅ Simplest solution
- ✅ No stacking context conflicts

**Cons**:
- ❌ Loses visual dimming effect
- ❌ Loses full-screen click-away area

**Implementation**:
```tsx
{isOpen && (
  <div
    ref={popoverRef}
    className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
  >
    <SimpleDatePicker value={localDate} onChange={handleDateSelect} />
  </div>
)}
```

### Option 2: Add pointer-events-none to Backdrop (Recommended ✅)

**Pros**:
- ✅ Keeps visual dimming effect
- ✅ Backdrop doesn't intercept clicks
- ✅ Calendar receives all mouse events
- ✅ Minimal changes required

**Cons**:
- ⚠️ Backdrop no longer provides click-away functionality
- ⚠️ Must rely on `handleClickOutside` handler only

**Implementation**:
```tsx
{isOpen && (
  <>
    {/* Backdrop - visual only, doesn't intercept clicks */}
    <div
      className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
      //                                           ^^^^^^^^^^^^^^^^^^^^
      //                                           CRITICAL FIX
      aria-hidden="true"
    />

    {/* Calendar - receives all mouse events */}
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
    >
      <SimpleDatePicker value={localDate} onChange={handleDateSelect} />
    </div>
  </>
)}
```

**Why This Works**:
- `pointer-events-none` on backdrop → All clicks pass through
- Calendar has `pointer-events-auto` → Captures clicks
- Existing `handleClickOutside` (line 33-36) → Handles click-away

### Option 3: Use Portal for Calendar (Complex)

**Pros**:
- ✅ Calendar in separate DOM tree
- ✅ Complete isolation from parent stacking

**Cons**:
- ❌ Requires React Portal implementation
- ❌ More complex positioning logic
- ❌ Over-engineered for this use case

**Not Recommended**: Too complex for the benefit

## 📝 Recommended Implementation

### Step 1: Add `pointer-events-none` to Backdrop

```diff
  <div
-   className="fixed inset-0 bg-black/10 z-40"
+   className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
    onClick={() => setIsOpen(false)}
    aria-hidden="true"
  />
```

**Note**: The `onClick` handler can be removed since backdrop won't receive clicks anymore.

### Step 2: Verify Click-Outside Handler

The existing `handleClickOutside` (lines 30-41) should handle closing on outside clicks:

```tsx
const handleClickOutside = (e: MouseEvent) => {
  if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
    setIsOpen(false);
  }
};
```

This works because:
- Listens on `document` (entire page)
- Checks if click is outside `popoverRef` (calendar)
- Closes calendar if click is outside

### Step 3: Clean Up Backdrop onClick (Optional)

Since backdrop has `pointer-events-none`, the onClick won't fire:

```diff
  <div
    className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
-   onClick={() => setIsOpen(false)}
    aria-hidden="true"
  />
```

## 🔧 Complete Solution Code

```tsx
{/* Calendar Popover - Fixed backdrop blocking issue */}
{isOpen && (
  <>
    {/* Background overlay - visual only, doesn't block clicks */}
    <div
      className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
      aria-hidden="true"
    />

    {/* Calendar container - positioned near trigger, captures all clicks */}
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
    >
      <SimpleDatePicker
        value={localDate}
        onChange={handleDateSelect}
      />
    </div>
  </>
)}
```

## 📊 Expected Behavior After Fix

### Click on Calendar Date
```
User clicks date
  ↓
Backdrop (pointer-events-none) → Click passes through
  ↓
Calendar button receives click ✅
  ↓
handleDateSelect fires
  ↓
Date selected, calendar closes
```

### Click Outside Calendar
```
User clicks outside
  ↓
Backdrop (pointer-events-none) → Click passes through
  ↓
Document mousedown event fires
  ↓
handleClickOutside checks: click outside popoverRef? YES
  ↓
setIsOpen(false)
  ↓
Calendar closes ✅
```

## ✅ Validation Checklist

### After Implementation
- [ ] Calendar dates are clickable
- [ ] Date selection works (handleDateSelect fires)
- [ ] Calendar closes after selecting date
- [ ] Clicking outside calendar closes it
- [ ] Escape key still closes calendar
- [ ] Backdrop provides visual dimming
- [ ] No console errors

## 🎯 Success Criteria

1. ✅ **Primary**: Calendar dates are fully clickable and selectable
2. ✅ **Secondary**: Backdrop provides visual separation without blocking interaction
3. ✅ **Tertiary**: Click-outside-to-close still works via handleClickOutside
4. ✅ **UX**: Smooth date selection experience

## 🔄 Alternative: If pointer-events-none Doesn't Work

If adding `pointer-events-none` to backdrop doesn't solve it, **remove backdrop entirely**:

```tsx
{isOpen && (
  <div
    ref={popoverRef}
    className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
  >
    <SimpleDatePicker value={localDate} onChange={handleDateSelect} />
  </div>
)}
```

**Why This Always Works**:
- No backdrop = No click interception
- Calendar receives all clicks directly
- Strong shadow (`shadow-2xl`) + border provides visual separation
- Existing click-outside handler still closes calendar

## 📚 Technical Explanation

### Stacking Context Rules

1. **`position: fixed`** creates a stacking context relative to **viewport**
2. **`position: absolute`** creates a stacking context relative to **nearest positioned ancestor**
3. **z-index only works within the same stacking context**

### Why Backdrop Blocked Clicks

```
Document
  └─ PaymentDateCell (position: relative)
      ├─ Backdrop (position: fixed, z-40)
      │   → New stacking context from viewport
      │   → Covers ENTIRE viewport
      │   → Intercepts all clicks
      └─ Calendar (position: absolute, z-50)
          → Stacking context from PaymentDateCell
          → z-50 higher than z-40 BUT in different context
          → Clicks never reach calendar
```

### Solution: pointer-events-none

```css
pointer-events: none; /* Element ignores all mouse events */
```

This makes the backdrop "transparent" to mouse events, allowing clicks to pass through to elements underneath.

---

**Status**: ✅ Design Complete - Ready for Implementation
**Priority**: 🔴 CRITICAL (Calendar unusable without fix)
**Estimated Implementation Time**: 1 minute (add `pointer-events-none`)
**Risk Level**: Very Low (CSS-only change, fallback available)
