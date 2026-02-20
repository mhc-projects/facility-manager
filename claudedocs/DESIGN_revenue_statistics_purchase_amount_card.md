# Design Specification: Revenue Management Statistics Card Enhancement

## 📋 Overview

**Feature**: Add "총 매입금액" (Total Purchase Amount) statistics card to the revenue management page
**Location**: [app/admin/revenue/page.tsx:1404-1508](app/admin/revenue/page.tsx#L1404-L1508)
**Date**: 2026-02-20
**Status**: Design Complete

## 🎯 Requirements

### Primary Requirement
Add a new statistics card to display **총 매입금액** (Total Purchase Amount) in the revenue management page statistics section.

### Secondary Requirement
Document and verify the calculation formula for **총 이익금액** (Total Profit).

## 📊 Current System Analysis

### Existing Statistics Cards (6 cards)

The revenue management page currently displays 6 statistics cards in a responsive grid layout:

| Card # | Title | Value Calculation | Icon | Color |
|--------|-------|-------------------|------|-------|
| 1 | 총 매출금액 / 총 미수금액 | Dynamic based on `showReceivablesOnly` filter | TrendingUp | Green/Red |
| 2 | 총 이익금액 | `sum(net_profit)` | DollarSign | Purple |
| 3 | 총 영업비용 | `sum(adjusted_sales_commission OR sales_commission)` | Calculator | Orange |
| 4 | 총 설치비용 | `sum(installation_costs + installation_extra_cost)` | Settings | Blue |
| 5 | 사업장 평균 이익률 | `avg(net_profit / total_revenue * 100)` | BarChart3 | Indigo |

### Current Layout Structure

```tsx
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
  {/* 5 statistics cards */}
</div>
```

**Grid Configuration**:
- Mobile: 2 columns (grid-cols-2)
- Small screens: 2 columns (sm:grid-cols-2)
- Medium screens: 3 columns (md:grid-cols-3)
- Large screens: 5 columns (lg:grid-cols-5)

## 💰 Total Profit Calculation Formula (총 이익금액)

### Current Implementation

**Location**: [app/admin/revenue/page.tsx:1442-1450](app/admin/revenue/page.tsx#L1442-L1450)

```typescript
const totalProfit = sortedBusinesses.reduce((sum, b) => {
  const profit = Number(b.net_profit) || 0;
  return sum + profit;
}, 0);
```

### Calculation Chain

**총 이익금액 = Σ(순이익)** where 순이익 is calculated as:

```
순이익 (net_profit) = 총이익 - 영업비용 - 실사비용 - 기본설치비 - 추가설치비

총이익 (gross_profit) = 매출 - 매입
  where:
    매출 (total_revenue) = (환경부 고시가 × 수량) + 추가공사비 - 협의사항
    매입 (total_cost) = 제조사별 원가 × 수량
```

**Source**: [lib/revenue-calculator.ts:1-11](lib/revenue-calculator.ts#L1-L11)

### Formula Breakdown

| Component | Formula | Source |
|-----------|---------|--------|
| **매출** | `(환경부 고시가 × 수량) + 추가공사비 - 협의사항` | revenue-calculator.ts:L130-L150 |
| **매입** | `제조사별 원가 × 수량` | revenue-calculator.ts:L133-L137 |
| **총이익** | `매출 - 매입` | revenue-calculator.ts:L196 |
| **순이익** | `총이익 - 영업비용 - 실사비용 - 기본설치비 - 추가설치비` | revenue-calculator.ts:L198-L199 |
| **총 이익금액** | `Σ(순이익)` for all businesses | page.tsx:L1445-L1449 |

### Important Notes

1. **총 이익금액 ≠ 총이익 (gross_profit)**
   - 총 이익금액 = Sum of **net_profit** (순이익)
   - 순이익 already deducts all costs from gross profit

2. **Cost Components Deducted**:
   - ✅ 영업비용 (sales_commission)
   - ✅ 실사비용 (survey_costs)
   - ✅ 기본설치비 (installation_costs)
   - ✅ 추가설치비 (installation_extra_cost)

## 🎨 Design Specification: New Purchase Amount Card

### Card Position

**Insert After**: Card #1 (총 매출금액/총 미수금액)
**Insert Before**: Card #2 (총 이익금액)

**New Card Order**:
1. 총 매출금액 / 총 미수금액
2. **총 매입금액** ← NEW
3. 총 이익금액
4. 총 영업비용
5. 총 설치비용
6. 사업장 평균 이익률

### Card Specification

**Title**: 총 매입금액 (Total Purchase Amount)

**Value Calculation**:
```typescript
const totalPurchaseAmount = sortedBusinesses.reduce((sum, b) => {
  const cost = Number(b.total_cost) || 0;
  return sum + cost;
}, 0);
```

**Data Source**: `business.total_cost` field from revenue calculation
- **Definition**: 제조사별 원가 × 수량 합계
- **Source**: [lib/revenue-calculator.ts:L193](lib/revenue-calculator.ts#L193)

### Visual Design

**Icon**: `ShoppingCart` from lucide-react (represents purchasing/procurement)
**Color**: `teal` (represents procurement/supply chain - distinct from existing colors)
**Background**: `bg-teal-50`
**Text Color**: `text-teal-600`

### Responsive Design

**Card Structure**:
```tsx
<div className="bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">
  <div className="flex items-center gap-1.5 sm:gap-2">
    <div className="p-1 sm:p-1.5 bg-teal-50 rounded flex-shrink-0">
      <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-teal-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 매입금액</p>
      <p className="text-xs sm:text-sm md:text-base font-bold text-teal-600 break-words">
        {formatCurrency(totalPurchaseAmount)}
      </p>
    </div>
  </div>
</div>
```

### Grid Layout Update

**Current**: `grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`
**Updated**: `grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6`

**Rationale**: With 6 cards, the large screen layout should display all 6 cards in a single row.

## 🔧 Implementation Details

### Required Changes

#### 1. Import Addition
```typescript
import {
  // ... existing imports
  ShoppingCart // ADD THIS
} from 'lucide-react';
```

#### 2. Card Addition
**Location**: [app/admin/revenue/page.tsx:1434](app/admin/revenue/page.tsx#L1434) (after Card #1, before Card #2)

#### 3. Grid Layout Update
**Location**: [app/admin/revenue/page.tsx:1386](app/admin/revenue/page.tsx#L1386)

**Before**:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
```

**After**:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
```

### Data Validation

**Ensure**:
- `total_cost` field exists in `sortedBusinesses` array
- `total_cost` is calculated via [lib/revenue-calculator.ts:L193](lib/revenue-calculator.ts#L193)
- Proper number conversion with `Number()` and fallback to 0
- Consistent formatting with `formatCurrency()` utility

### Edge Cases

| Scenario | Handling |
|----------|----------|
| `total_cost` is `undefined` | Default to 0 via `|| 0` |
| `total_cost` is `null` | Default to 0 via `|| 0` |
| `total_cost` is `NaN` | Convert with `Number()`, fallback to 0 |
| Empty `sortedBusinesses` | Display ₩0 |

## 📱 Responsive Behavior

### Breakpoint Analysis

| Screen Size | Columns | Card Layout |
|-------------|---------|-------------|
| Mobile (< 640px) | 2 | 3 rows: 2-2-2 |
| Small (640px-768px) | 2 | 3 rows: 2-2-2 |
| Medium (768px-1024px) | 3 | 2 rows: 3-3 |
| Large (≥ 1024px) | 6 | 1 row: all 6 cards |

### Visual Consistency

**All cards maintain**:
- Same padding: `p-2 sm:p-3 md:p-4`
- Same border radius: `rounded-md md:rounded-lg`
- Same shadow: `shadow-sm`
- Same border: `border border-gray-200`
- Same icon sizing: `w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4`
- Same text sizing: Title `text-[10px] sm:text-xs md:text-sm`, Value `text-xs sm:text-sm md:text-base`

## 🎨 Color Palette

### Existing Colors
- Green/Red: 매출/미수금액
- Purple: 이익금액
- Orange: 영업비용
- Blue: 설치비용
- Indigo: 평균 이익률

### New Color
- **Teal**: 매입금액 ← Represents procurement/supply chain

**Color Rationale**: Teal is visually distinct from existing colors and semantically appropriate for purchase/procurement operations.

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] New "총 매입금액" card displays correctly
- [ ] Card shows sum of `total_cost` from all filtered businesses
- [ ] Value updates dynamically when filters change
- [ ] Currency formatting matches existing cards (₩ symbol, thousand separators)

### Visual Requirements
- [ ] Card uses teal color scheme (bg-teal-50, text-teal-600)
- [ ] ShoppingCart icon displays correctly at all breakpoints
- [ ] Card maintains visual consistency with existing cards
- [ ] Grid layout displays 6 cards properly at all breakpoints

### Technical Requirements
- [ ] No console errors or warnings
- [ ] Proper null/undefined handling for `total_cost`
- [ ] Performance: calculation completes < 100ms for 1000 businesses
- [ ] Responsive behavior matches specification

### Documentation Requirements
- [ ] "총 이익금액" calculation formula documented and verified
- [ ] New card implementation documented
- [ ] Grid layout changes documented

## 🔍 Testing Strategy

### Unit Testing
```typescript
describe('Purchase Amount Card', () => {
  it('calculates total purchase amount correctly', () => {
    const businesses = [
      { total_cost: 1000000 },
      { total_cost: 2000000 },
      { total_cost: 3000000 }
    ];
    const total = businesses.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0);
    expect(total).toBe(6000000);
  });

  it('handles null/undefined total_cost', () => {
    const businesses = [
      { total_cost: 1000000 },
      { total_cost: null },
      { total_cost: undefined },
      { }
    ];
    const total = businesses.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0);
    expect(total).toBe(1000000);
  });
});
```

### Manual Testing Checklist
- [ ] Verify card displays on desktop (≥1024px)
- [ ] Verify card displays on tablet (768px-1024px)
- [ ] Verify card displays on mobile (<640px)
- [ ] Apply various filters and verify total updates
- [ ] Test with empty data set
- [ ] Test with large numbers (> ₩1,000,000,000)

## 📊 Data Flow

```
Database (businesses table)
  ↓
API Fetch (/api/revenue/calculate)
  ↓
calculateBusinessRevenue() [lib/revenue-calculator.ts]
  ├─ Calculates total_cost (제조사별 원가 × 수량)
  ↓
sortedBusinesses (filtered & sorted business data)
  ↓
Statistics Card Calculation
  ├─ Reduces total_cost across all businesses
  ↓
Display: formatCurrency(totalPurchaseAmount)
```

## 📝 Related Files

### Files to Modify
- [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx) - Add card, update grid layout

### Reference Files (No Changes)
- [lib/revenue-calculator.ts](lib/revenue-calculator.ts) - Calculation logic reference
- [components/ui/StatsCard.tsx](components/ui/StatsCard.tsx) - Unused (inline implementation)

## 🎓 Business Logic Summary

### Revenue Management Calculation Chain

```
매출 (total_revenue)
  = (환경부 고시가 × 수량) + 추가공사비 - 협의사항

매입 (total_cost) ← NEW CARD DISPLAYS THIS
  = 제조사별 원가 × 수량

총이익 (gross_profit)
  = 매출 - 매입

순이익 (net_profit)
  = 총이익 - 영업비용 - 실사비용 - 기본설치비 - 추가설치비

총 이익금액 (EXISTING CARD)
  = Σ(순이익)

총 매입금액 (NEW CARD)
  = Σ(매입)
```

## 🚀 Implementation Priority

**Priority**: Medium
**Complexity**: Low
**Estimated Effort**: 15-30 minutes

**Implementation Steps**:
1. Add `ShoppingCart` import (1 min)
2. Add new card JSX (5 min)
3. Update grid layout class (1 min)
4. Test responsive behavior (5-10 min)
5. Verify calculation accuracy (5-10 min)

## 📌 Notes

1. **Card Position Logic**: Placing purchase amount after revenue creates a logical flow:
   - Revenue → Purchase → Profit (Revenue - Purchase - Costs)

2. **Color Selection**: Teal chosen to maintain visual distinction while semantically representing procurement/supply operations

3. **Grid Layout**: Updated to `lg:grid-cols-6` to accommodate 6 cards in a single row on large screens

4. **Calculation Verification**: "총 이익금액" correctly uses `net_profit` (순이익), not `gross_profit` (총이익)

5. **Data Consistency**: All statistics cards use `sortedBusinesses` array, ensuring filter consistency

---

**Design Status**: ✅ Complete and Ready for Implementation
**Design Date**: 2026-02-20
**Designer**: Claude Sonnet 4.5
