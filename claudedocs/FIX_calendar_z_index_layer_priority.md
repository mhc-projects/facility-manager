# Calendar Z-Index Layer Priority Fix

**Date**: 2026-02-20
**Priority**: 🔴 CRITICAL - UX Blocker
**Component**: [components/admin/PaymentDateCell.tsx:95-116](components/admin/PaymentDateCell.tsx#L95-L116)

## 📋 Issue Clarification

### User's Original Request
> "최상단이라고 하는게 달력이 뜨는 위치를 위쪽으로 옮겨달라는게 아니라 화면을 구성하는 레이어가 있으면 레이어의 최상단을 얘기한거야. 달력폼이 뜨는 위치는 컬럼의 항목을 누른 위치에서 띄워주는게 맞아."

**Translation**:
- "최상단" (top-most) refers to **z-index layer priority**, NOT physical position
- Calendar should appear **near the clicked column item** (current behavior is correct)
- The issue is **layer stacking order**, not positioning

### Correct Understanding

**What User WANTS**:
- ✅ Calendar positioned near clicked cell (KEEP current `absolute top-full left-0`)
- ✅ Calendar on the **highest z-index layer** to be clickable
- ✅ Calendar above all other UI elements

**What User DOESN'T Want**:
- ❌ NOT moving calendar to viewport top (`fixed top-4`)
- ❌ NOT changing position from near the trigger button

## 🔍 Current Z-Index Layer Analysis

### Current Implementation (Line 95-116)

```tsx
{isOpen && (
  <>
    {/* Background overlay */}
    <div className="fixed inset-0 bg-black/10 z-40" />

    {/* Calendar container */}
    <div
      ref={popoverRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white pointer-events-auto ..."
      //        ^^^^^ ^^^^^ ^^^^^^^^^^ ^^^^^^^^^^^^^^
      //        WRONG POSITIONING - Should be absolute, not fixed
    >
```

**Current Problems**:
1. ❌ Calendar uses `fixed top-4 left-1/2` → Positioned at viewport top (WRONG)
2. ❌ Should use `absolute top-full left-0` → Positioned below trigger button (CORRECT)
3. ⚠️ Z-index `z-50` may not be high enough for all scenarios

### Revenue Table Z-Index Hierarchy

Let me analyze the table's z-index usage:

```
┌─────────────────────────────────────────────────┐
│ Revenue Page Header (z-10?)                     │
├─────────────────────────────────────────────────┤
│ Table Container                                 │
│  • Table rows (z-0, default)                    │
│  • Hover states (z-1?)                          │
│  • Sticky headers (z-10?)                       │
│  • Tooltips (z-10 in statistics cards)          │
├─────────────────────────────────────────────────┤
│ Backdrop Overlay (z-40) ← Current               │
├─────────────────────────────────────────────────┤
│ Calendar Popover (z-50) ← Current               │
├─────────────────────────────────────────────────┤
│ Modals (z-50+?)                                 │
└─────────────────────────────────────────────────┘
```

### Investigation Needed

Need to check:
1. Table header z-index (sticky positioning)
2. Business modal z-index (if it overlaps)
3. Other popovers/dropdowns z-index
4. Global modal z-index

## 🎯 Correct Solution Design

### Solution: Restore Absolute Positioning + Ensure High Z-Index

**Required Changes**:

1. **Revert positioning** from `fixed` back to `absolute`
2. **Keep z-50** or increase if necessary
3. **Keep pointer-events-auto** (critical for clickability)
4. **Keep backdrop overlay** (visual separation)

### Implementation Specification

**File**: [components/admin/PaymentDateCell.tsx:106-109](components/admin/PaymentDateCell.tsx#L106-L109)

```tsx
{/* Calendar container - positioned near trigger, highest z-index layer */}
<div
  ref={popoverRef}
  className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
  //        ^^^^^^^^ ^^^^^^^^ ^^^^^^^
  //        CORRECT: Positioned relative to trigger button
  //                                  ^^^^ HIGH z-index for top layer
>
  <SimpleDatePicker value={localDate} onChange={handleDateSelect} />
</div>
```

### Visual Result (Correct Behavior)

```
┌─────────────────────────────────────────────────┐
│ Revenue Table                                   │
│                                                 │
│  [입금예정일 컬럼]                              │
│  ┌─────────────────┐                            │
│  │ 📅 2026-02-19  │ ← User clicks here         │
│  └────────┬────────┘                            │
│           │                                     │
│           ▼ Opens at trigger position           │
│  ┌──────────────────┐                           │
│  │ Calendar Popover │ ← z-50 (top layer)       │
│  │   2026년 2월     │                           │
│  │ [날짜 선택 가능]  │ ← Fully clickable        │
│  └──────────────────┘                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### CSS Class Breakdown

| Class | Purpose | Why Needed |
|-------|---------|------------|
| `absolute` | Position relative to trigger | ✅ Correct positioning behavior |
| `top-full` | Below trigger button | ✅ Natural flow from trigger |
| `left-0` | Align with trigger's left edge | ✅ Visual alignment |
| `mt-1` | 4px spacing from trigger | ✅ Breathing room |
| `z-50` | High layer priority | ✅ Above table/tooltips |
| `pointer-events-auto` | Capture mouse events | ✅ Critical for clicks |
| `bg-white` | Opaque background | ✅ Visibility |
| `shadow-2xl` | Strong elevation | ✅ Visual separation |
| `border-2 border-gray-300` | Defined boundary | ✅ Clear edges |

### Z-Index Strategy

**Recommended Z-Index Values**:

```yaml
Table Elements:
  - table_rows: z-0 (default)
  - table_hover: z-1
  - sticky_header: z-10
  - tooltips: z-10

Overlay Elements:
  - backdrop: z-40
  - calendar_popover: z-50
  - modals: z-[100] (if needed)
```

**Why z-50 is Sufficient**:
- ✅ Above table elements (z-0 to z-10)
- ✅ Above backdrop (z-40)
- ✅ Below global modals (z-100+)
- ✅ Matches Tailwind's standard popover z-index

**When to Increase to z-[60] or Higher**:
- ⚠️ If calendar conflicts with other popovers
- ⚠️ If business modal uses z-50
- ⚠️ If global navigation uses z-50+

## 🔧 Implementation Steps

### Step 1: Revert Incorrect Fixed Positioning

```diff
  <div
    ref={popoverRef}
-   className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
+   className="absolute top-full left-0 mt-1 z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
  >
```

### Step 2: Verify Z-Index Hierarchy

**Check these files for conflicting z-index**:
- [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx) - Table tooltips, sticky headers
- [components/business/BusinessRevenueModal.tsx](components/business/BusinessRevenueModal.tsx) - Modal z-index
- Any global navigation or header components

**If conflicts found**, increase calendar z-index:
```tsx
className="absolute top-full left-0 mt-1 z-[60] bg-white pointer-events-auto ..."
//                                        ^^^^^^^ Higher if needed
```

### Step 3: Test Clickability

**Validation**:
- [ ] Calendar appears below trigger button (not at viewport top)
- [ ] Calendar dates are clickable
- [ ] No table elements appear above calendar
- [ ] Backdrop dims background
- [ ] Click outside closes calendar

## 📊 Before/After Comparison

### ❌ WRONG (Current Implementation)

```tsx
className="fixed top-4 left-1/2 -translate-x-1/2 z-50 ..."
//        ^^^^^ ^^^^^ ^^^^^^^^^^ ^^^^^^^^^^^^^^
//        Positions at viewport top-center (WRONG)
```

**Visual**:
```
┌─────────────────────────────────────────────────┐
│        ┌──────────────────┐                     │ ← Calendar at top
│        │ Calendar Popover │                     │   (WRONG)
│        └──────────────────┘                     │
│                                                 │
│  Revenue Table                                  │
│  ┌─────────────────┐                            │
│  │ 📅 2026-02-19  │ ← User clicked here        │
│  └─────────────────┘      but calendar is      │
│                            far away (BAD UX)    │
└─────────────────────────────────────────────────┘
```

### ✅ CORRECT (Required Implementation)

```tsx
className="absolute top-full left-0 mt-1 z-50 ..."
//        ^^^^^^^^ ^^^^^^^^ ^^^^^^^ ^^^^
//        Positions below trigger (CORRECT)
//        Highest z-index layer (CORRECT)
```

**Visual**:
```
┌─────────────────────────────────────────────────┐
│  Revenue Table                                  │
│                                                 │
│  ┌─────────────────┐                            │
│  │ 📅 2026-02-19  │ ← User clicks here         │
│  └────────┬────────┘                            │
│           ▼                                     │
│  ┌──────────────────┐ ← Calendar appears here  │
│  │ Calendar Popover │   (CORRECT)               │
│  │   2026년 2월     │   z-50 (top layer)       │
│  │ [날짜 선택 가능]  │   Fully clickable        │
│  └──────────────────┘                           │
└─────────────────────────────────────────────────┘
```

## 🎯 Success Criteria

1. ✅ **Positioning**: Calendar appears directly below the clicked cell
2. ✅ **Z-Index**: Calendar is on the highest layer (above all table elements)
3. ✅ **Clickability**: All calendar dates are clickable
4. ✅ **No Conflicts**: No other UI elements appear above calendar
5. ✅ **Visual Clarity**: Backdrop provides clear separation from table

## 📝 Related Issues

### Original Problem
- User reported calendar items were not clickable
- Mouse events were passing through to table underneath

### Root Causes Identified
1. ✅ **FIXED**: Missing `pointer-events-auto` → Added
2. ✅ **FIXED**: Missing backdrop overlay → Added
3. ❌ **INCORRECT FIX**: Changed to `fixed top-4` positioning → Need to revert
4. ✅ **CORRECT**: z-50 is sufficient for layer priority

### What We Learned
- "최상단" in Korean UX context often means **z-index layer priority**, not physical position
- Always clarify positioning requirements:
  - **Position**: WHERE element appears (absolute vs fixed, top vs bottom)
  - **Layer**: WHICH layer element is on (z-index stacking order)

## 🔄 Rollback Required

**Current State** (INCORRECT):
```tsx
className="fixed top-4 left-1/2 -translate-x-1/2 z-50 ..."
```

**Required State** (CORRECT):
```tsx
className="absolute top-full left-0 mt-1 z-50 ..."
```

**Changes**:
- `fixed` → `absolute`: Position relative to trigger, not viewport
- `top-4 left-1/2 -translate-x-1/2` → `top-full left-0 mt-1`: Below trigger, left-aligned
- Keep: `z-50`, `pointer-events-auto`, styling classes

---

**Status**: ✅ Design Complete - Ready for Rollback Implementation
**Priority**: 🔴 CRITICAL (Incorrect positioning needs immediate fix)
**Estimated Implementation Time**: 2 minutes (revert positioning classes)
**Risk Level**: Very Low (reverting to correct positioning behavior)
