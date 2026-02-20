# Calendar DOM Portal Required - Root Cause Analysis

**Date**: 2026-02-20
**Priority**: 🔴 CRITICAL - Calendar dates completely unclick able
**Component**: [components/admin/PaymentDateCell.tsx](components/admin/PaymentDateCell.tsx)

## 📋 Root Cause: DOM Structure Problem

### The Real Issue

**position: fixed DOES NOT escape DOM tree**
- `position: fixed` only changes **visual positioning** (renders relative to viewport)
- It does **NOT move the element out of its parent's DOM tree**
- Table row elements with `hover:bg-gray-50` still capture pointer events **at the DOM level**

### Current DOM Structure (BROKEN)

```html
<table>
  <tr class="hover:bg-gray-50">  ← Captures ALL pointer events in its subtree
    <td>
      <PaymentDateCell>
        <button>📅 2026-02-19</button>  ← Trigger works (stopPropagation)
        {isOpen && (
          <div style="position: fixed; top: X; left: Y;">  ← Still IN table row's DOM!
            <SimpleDatePicker>
              <button>25</button>  ← BLOCKED by table row hover
            </SimpleDatePicker>
          </div>
        )}
      </PaymentDateCell>
    </td>
  </tr>
</table>
```

**Why Clicks Fail**:
1. User clicks date button "25"
2. Browser checks: "Which DOM element should receive this click?"
3. Browser finds: Table row div is the **ancestor** of the button
4. Table row has `hover:bg-gray-50` → browser treats it as interactive
5. Table row **intercepts the click** before it reaches the button
6. Button's onClick never fires

### What We Tried (All Failed)

❌ **Attempt 1**: `e.stopPropagation()` on buttons
- Only prevents event **bubbling AFTER click fires**
- Doesn't prevent table row from intercepting click BEFORE it reaches button

❌ **Attempt 2**: `pointer-events-none` on backdrop
- Only fixes backdrop blocking
- Doesn't fix table row blocking (table row still in DOM tree)

❌ **Attempt 3**: `position: fixed` with calculated position
- Fixed **visual position** (calendar appears near trigger)
- Did NOT fix **DOM position** (calendar still inside table cell)

❌ **Attempt 4**: `z-index: 50`
- Only fixes **visual stacking** (what's on top visually)
- Doesn't fix **DOM stacking** (pointer event capture hierarchy)

## 🎯 Solution: React Portal

### Why Portal is Required

**React Portal**:
- Renders children **outside the parent component's DOM tree**
- Places calendar in a separate DOM location (e.g., `document.body`)
- Table row can no longer intercept clicks (calendar is NOT its descendant)

### Required DOM Structure (CORRECT)

```html
<table>
  <tr class="hover:bg-gray-50">
    <td>
      <PaymentDateCell>
        <button ref={triggerRef}>📅 2026-02-19</button>
      </PaymentDateCell>
    </td>
  </tr>
</table>

<!-- OUTSIDE table, at document.body level -->
<div id="portal-root" style="position: fixed; top: X; left: Y; z-index: 50;">
  <SimpleDatePicker>
    <button>25</button>  ← ✅ NOW CLICKABLE (not inside table row!)
  </SimpleDatePicker>
</div>
```

## 🔧 Implementation Plan

### Step 1: Install React DOM (if not already)

React Portal requires `react-dom`:

```bash
npm install react-dom
# OR
yarn add react-dom
```

### Step 2: Update PaymentDateCell Component

```tsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';  // ← ADD THIS
import { Calendar } from 'lucide-react';

export function PaymentDateCell({ businessId, currentDate, onUpdate, readonly = false }: PaymentDateCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localDate, setLocalDate] = useState(currentDate);
  const [isLoading, setIsLoading] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ... existing useEffects for closing on outside click, escape key, etc. ...

  const handleDateSelect = async (date: string | null) => {
    setLocalDate(date);
    setIsOpen(false);
    setIsLoading(true);

    try {
      await onUpdate(businessId, date);
    } catch (error) {
      setLocalDate(currentDate);
    } finally {
      setIsLoading(false);
    }
  };

  // Render calendar using Portal
  const calendarPortal = isOpen && typeof window !== 'undefined' ? createPortal(
    <>
      {/* Background overlay */}
      <div
        className="fixed inset-0 bg-black/10 z-40 pointer-events-none"
        aria-hidden="true"
      />

      {/* Calendar container - NOW OUTSIDE table DOM */}
      <div
        ref={popoverRef}
        className="fixed z-50 bg-white pointer-events-auto rounded-lg shadow-2xl border-2 border-gray-300 p-3 w-64"
        style={{
          top: triggerPosition ? `${triggerPosition.top}px` : undefined,
          left: triggerPosition ? `${triggerPosition.left}px` : undefined
        }}
      >
        <SimpleDatePicker value={localDate} onChange={handleDateSelect} />
      </div>
    </>,
    document.body  // ← Render at body level, NOT inside table
  ) : null;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setTriggerPosition({
              top: rect.bottom + 4,
              left: rect.left
            });
          }
          setIsOpen(!isOpen);
        }}
        disabled={isLoading}
        className="w-full px-2 py-1 text-xs text-left hover:bg-teal-50 rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        title="클릭하여 입금예정일 수정"
      >
        <Calendar className="w-3 h-3 text-teal-600 flex-shrink-0" />
        <span className={localDate ? 'text-teal-700 font-medium' : 'text-gray-400'}>
          {isLoading ? '저장 중...' : (localDate || '-')}
        </span>
      </button>

      {/* Render calendar via Portal */}
      {calendarPortal}
    </div>
  );
}
```

## 📊 Expected Behavior After Fix

### Click on Calendar Date "25"

```
User clicks date "25"
  ↓
Browser checks DOM tree for click target
  ↓
Finds: <button>25</button> inside <div> at document.body (NOT inside table!)
  ↓
Table row cannot intercept (button is NOT its descendant)
  ↓
Button receives click event ✅
  ↓
onClick fires → handleDayClick(25) executes
  ↓
handleDateSelect called → date selected successfully
  ↓
Calendar closes, API updates payment_scheduled_date
```

### Click Outside Calendar

```
User clicks outside calendar
  ↓
handleClickOutside detects click outside popoverRef
  ↓
setIsOpen(false) called
  ↓
Portal unmounts, calendar disappears ✅
```

## ✅ Validation Checklist

After implementing Portal:

- [ ] Calendar opens when clicking trigger button
- [ ] Calendar dates are clickable (no table row interception)
- [ ] Date selection updates payment_scheduled_date
- [ ] Calendar closes after selecting date
- [ ] Click outside calendar closes it
- [ ] Escape key closes calendar
- [ ] All navigation buttons work (prev/next month, today, clear)
- [ ] No console errors related to Portal

## 🎯 Success Criteria

1. ✅ **Primary**: Calendar dates are fully clickable (no DOM interception)
2. ✅ **Secondary**: Calendar positioned correctly near trigger button
3. ✅ **Tertiary**: All calendar functionality works (selection, navigation, clear, today)
4. ✅ **UX**: Smooth interaction without flickering or positioning issues

## 📝 Technical Details

### Why Portal Works

**DOM Hierarchy Without Portal** (BROKEN):
```
document.body
└─ #root
   └─ table
      └─ tr (hover:bg-gray-50) ← INTERCEPTS CLICKS
         └─ td
            └─ PaymentDateCell
               └─ calendar ← INSIDE table row DOM
```

**DOM Hierarchy With Portal** (FIXED):
```
document.body
├─ #root
│  └─ table
│     └─ tr (hover:bg-gray-50)
│        └─ td
│           └─ PaymentDateCell
│              └─ (trigger button only)
└─ calendar ← OUTSIDE table row DOM ✅
```

### Position Calculation

Portal requires calculating trigger position **before rendering**:

1. User clicks trigger button
2. `getBoundingClientRect()` captures trigger's viewport position
3. Store position in state (`triggerPosition`)
4. Portal renders calendar at that position using `position: fixed`
5. Calendar appears visually near trigger, but in separate DOM tree

---

**Status**: ✅ Design Complete - Ready for Implementation
**Priority**: 🔴 CRITICAL (Calendar unusable without Portal)
**Estimated Implementation Time**: 10 minutes (add Portal, test)
**Risk Level**: Low (Portal is standard React pattern)
**Confidence**: Very High (Portal is the correct solution for escaping DOM tree)
