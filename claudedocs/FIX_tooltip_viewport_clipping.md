# Fix: Tooltip Viewport Clipping Issue

## 📋 Problem Analysis

### Current Issue
- **Symptom**: Tooltip box top edge is clipped at viewport top boundary
- **Location**: [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx) statistics cards (lines 1395-1652)
- **Root Cause**: Tooltips positioned above cards (`bottom-full`) when cards are at page top

### Visual Evidence
```
┌─────────────────────────────────────┐ ← Viewport Top
│ [Tooltip cut off here]              │ ← Clipped tooltip
│ ────────────────────                │
├─────────────────────────────────────┤
│  총 매출금액    총 매입금액   총 영업비용 │ ← Statistics Cards
│  ₩21억...     ₩6억...     ₩2억...    │
└─────────────────────────────────────┘
```

## 🎯 Solution Design

### Approach: Position Tooltips Below Cards

**Rationale**: Statistics cards are permanently fixed at page top, so there's always space below

### Implementation Changes

#### Current Positioning (Above Cards)
```tsx
{/* Tooltip positioned ABOVE card */}
<div className="absolute bottom-full ... mb-2">
  {/* Arrow pointing DOWN to card */}
  <div className="absolute top-full left-4 -mt-px">
    <div className="border-4 border-transparent border-t-gray-900"></div>
  </div>
</div>
```

#### New Positioning (Below Cards)
```tsx
{/* Tooltip positioned BELOW card */}
<div className="absolute top-full ... mt-2">
  {/* Arrow pointing UP to card */}
  <div className="absolute bottom-full left-4 mb-px">
    <div className="border-4 border-transparent border-b-gray-900"></div>
  </div>
</div>
```

### Position Mapping by Card

| Card | Horizontal Alignment | Reason |
|------|---------------------|---------|
| #1 (총 매출금액) | `left-0` | Leftmost - prevent left overflow |
| #2-6 (Middle cards) | `left-1/2 -translate-x-1/2` | Centered - sufficient space both sides |
| #7 (평균 이익률) | `right-0` | Rightmost - prevent right overflow |

### Arrow Position Mapping

| Card | Arrow Position | Reason |
|------|---------------|---------|
| #1 | `left-4` | Align with left side of tooltip |
| #2-6 | `left-1/2 -translate-x-1/2` | Centered with card |
| #7 | `right-4` | Align with right side of tooltip |

## 💻 Implementation Specification

### Card #1 (Leftmost)
```tsx
{/* Tooltip - Below card, left-aligned */}
<div className="absolute top-full left-0 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
  <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
    {formulaText}
    {/* Arrow pointing UP, positioned on left */}
    <div className="absolute bottom-full left-4 mb-px">
      <div className="border-4 border-transparent border-b-gray-900"></div>
    </div>
  </div>
</div>
```

### Cards #2-6 (Middle)
```tsx
{/* Tooltip - Below card, centered */}
<div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
  <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
    {formulaText}
    {/* Arrow pointing UP, centered */}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-px">
      <div className="border-4 border-transparent border-b-gray-900"></div>
    </div>
  </div>
</div>
```

### Card #7 (Rightmost)
```tsx
{/* Tooltip - Below card, right-aligned */}
<div className="absolute top-full right-0 mt-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
  <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
    {formulaText}
    {/* Arrow pointing UP, positioned on right */}
    <div className="absolute bottom-full right-4 mb-px">
      <div className="border-4 border-transparent border-b-gray-900"></div>
    </div>
  </div>
</div>
```

## 🔄 Change Summary

### Positioning Changes
- `bottom-full` → `top-full` (move from above to below card)
- `mb-2` → `mt-2` (margin from bottom to top)

### Arrow Direction Changes
- `top-full` → `bottom-full` (arrow container position)
- `-mt-px` → `mb-px` (arrow margin adjustment)
- `border-t-gray-900` → `border-b-gray-900` (arrow points up instead of down)

### Visual Result
```
Before (Clipped):                After (Fixed):
┌──────────┐ ← Viewport         ┌──────────┐ ← Viewport
│ [Cut off]│                    │          │
├──────────┤                    ├──────────┤
│  Card    │                    │  Card    │
└──────────┘                    │    ▲     │
                                │ ┌──┴───┐ │
                                │ │Tooltip│ │
                                └─┴──────┴─┘
```

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] All 7 tooltips appear below their cards
- [ ] No tooltip clipping at viewport top
- [ ] Tooltips remain visible during scroll
- [ ] Arrow points upward to card
- [ ] Smooth fade animation preserved

### Visual Requirements
- [ ] Tooltip appears 8px below card (mt-2)
- [ ] First card: tooltip left-aligned
- [ ] Last card: tooltip right-aligned
- [ ] Middle cards: tooltip centered
- [ ] Arrow properly aligned with card edge/center

### Technical Requirements
- [ ] z-index: 50 (above sticky header)
- [ ] No JavaScript required
- [ ] Performance unchanged
- [ ] Responsive behavior maintained

## 🧪 Testing Checklist

### Visual Testing
- [ ] Hover each card and verify tooltip appears below
- [ ] Verify arrow points upward to card
- [ ] Check tooltip alignment (left/center/right)
- [ ] Test on different screen sizes
- [ ] Verify no viewport clipping

### Edge Cases
- [ ] Page scrolled to top
- [ ] Page scrolled down
- [ ] Rapid mouse movement
- [ ] Multiple cards hovered quickly

## 📊 Impact Analysis

### Benefits
- ✅ Eliminates viewport top clipping
- ✅ Simple CSS-only solution
- ✅ No performance impact
- ✅ Maintains all existing functionality

### Risks
- ⚠️ Minimal: Tooltip now appears below instead of above (user adaptation)
- ⚠️ None: Statistics cards have ample space below

### Alternatives Considered

**Option 1: JavaScript dynamic positioning** (Rejected)
- Pros: Could keep tooltip above when space available
- Cons: Complex, performance overhead, unnecessary for fixed layout

**Option 2: Reduce tooltip size** (Rejected)
- Pros: Might fit above card
- Cons: Reduces readability, doesn't solve root cause

**Selected: Move tooltips below cards** (Chosen)
- Pros: Simple, reliable, CSS-only, permanent fix
- Cons: None for this use case

---

**Status**: ✅ Design Complete - Ready for Implementation
**Designer**: Claude Sonnet 4.5
**Date**: 2026-02-20
