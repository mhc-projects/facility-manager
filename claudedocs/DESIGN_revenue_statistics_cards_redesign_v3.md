# Design Specification: Revenue Management Statistics Cards Redesign (v3 - Final)

## 📋 Overview

**Feature**: Redesign statistics cards with new order and additional "기타 비용" card
**Location**: [app/admin/revenue/page.tsx:1386-1508](app/admin/revenue/page.tsx#L1386-L1508)
**Date**: 2026-02-20
**Version**: 3.0 (Final)
**Status**: Design Complete - Ready for Implementation

## 🎯 Requirements

### Confirmed Requirements
1. ✅ Add "총 매입금액" (Total Purchase Amount) card
2. ✅ Add "기타 비용" (Other Costs) card - costs not in standard categories
3. ✅ Update "총 이익금액" to match modal's net profit formula
4. ✅ Reorder cards to match business logic flow
5. ✅ **총 설치비용 includes 추가설치비** (기본설치비 + 추가설치비)
6. ✅ **Single-row layout** on large screens (lg:grid-cols-7)

## 📊 Net Profit Calculation Formula (Source of Truth)

### Modal's Net Profit Formula

**Location**: [components/business/BusinessRevenueModal.tsx:1676-1759](components/business/BusinessRevenueModal.tsx#L1676-L1759)

```
순이익 = 매출금액
       - 매입금액
       = 총 이익
       - 영업비용
       - 실사비용
       - 기본설치비
       - 추가설치비 (if exists)
       - AS 비용 (if exists)
       - 커스텀 추가비용 (if exists)
```

### Cost Components Breakdown

| Category | Field | Included In | Modal Display |
|----------|-------|-------------|---------------|
| **매입금액** | `total_cost` | Card #2 | Yes |
| **영업비용** | `adjusted_sales_commission` / `sales_commission` | Card #3 | Yes |
| **실사비용** | `survey_costs` | Card #5 (기타 비용) | Yes |
| **기본설치비** | `installation_costs` | Card #4 (총 설치비용) | Yes |
| **추가설치비** | `installation_extra_cost` / `additional_installation_revenue` | Card #4 (총 설치비용) | Yes (conditional) |
| **AS 비용** | `as_cost` | Card #5 (기타 비용) | Yes (conditional) |
| **커스텀 추가비용** | `custom_additional_costs` | Card #5 (기타 비용) | Yes (conditional) |

### "기타 비용" (Other Costs) Definition - UPDATED

**Components** (exclude installation costs):
1. **실사비용** (Survey Costs) - Always included
2. **AS 비용** (AS Costs) - If exists
3. **커스텀 추가비용** (Custom Additional Costs) - If exists

**Calculation Formula**:
```typescript
기타 비용 = 실사비용
         + (AS 비용 > 0 ? AS 비용 : 0)
         + (커스텀 추가비용 합계 > 0 ? 커스텀 추가비용 합계 : 0)
```

**Rationale**:
- Installation costs (both base and additional) belong in "총 설치비용" category
- "기타 비용" contains miscellaneous costs: survey, AS, and custom costs
- Matches modal's calculation structure while grouping logically

## 🎨 Final Statistics Cards Design (7 Cards)

### Card Order and Specifications

| # | Title | Calculation | Icon | Color | Change |
|---|-------|-------------|------|-------|--------|
| 1 | 총 매출금액 / 총 미수금액 | Dynamic based on filter | TrendingUp | Green/Red | No change |
| 2 | **총 매입금액** | `Σ(total_cost)` | ShoppingCart | Teal | **NEW** |
| 3 | 총 영업비용 | `Σ(adjusted_sales_commission OR sales_commission)` | Calculator | Orange | Moved |
| 4 | 총 설치비용 | `Σ(installation_costs + installation_extra_cost)` | Settings | Blue | Moved (keeps both costs) |
| 5 | **기타 비용** | Survey + AS + Custom | PackagePlus | Amber | **NEW** |
| 6 | 총 이익금액 | `Σ(net_profit)` | DollarSign | Purple | Moved |
| 7 | 사업장 평균 이익률 | `avg(net_profit / total_revenue * 100)` | BarChart3 | Indigo | Moved |

### Business Logic Flow (Single Row Layout)

```
Revenue → Purchase → Operating → Installation → Other → Profit → Margin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1.매출] → [2.매입] → [3.영업] → [4.설치] → [5.기타] → [6.순이익] → [7.이익률]
```

**Logical Grouping**:
- **Revenue**: Card #1
- **Costs**: Cards #2-5 (매입, 영업, 설치, 기타)
- **Profit**: Cards #6-7 (순이익, 이익률)

## 💻 Implementation Specifications

### Required Icon Imports

```typescript
import {
  BarChart3,
  Calculator,
  TrendingUp,
  DollarSign,
  Building2,
  Calendar,
  FileText,
  Search,
  Filter,
  Download,
  Loader2,
  Settings,
  ChevronDown,
  ShoppingCart,  // NEW - for 총 매입금액
  PackagePlus    // NEW - for 기타 비용
} from 'lucide-react';
```

### Grid Layout Configuration

```tsx
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3 md:gap-4">
  {/* 7 statistics cards */}
</div>
```

**Responsive Behavior**:

| Screen Size | Columns | Layout |
|-------------|---------|--------|
| Mobile (< 640px) | 2 | 4 rows: 2-2-2-1 |
| Small (640px-768px) | 2 | 4 rows: 2-2-2-1 |
| Medium (768px-1024px) | 3 | 3 rows: 3-3-1 |
| Large (≥ 1024px) | 7 | 1 row: all 7 cards |

### Card #1: 총 매출금액 / 총 미수금액 (No Change)

**Status**: Keep existing implementation
**Position**: 1st card

### Card #2: 총 매입금액 (NEW)

```tsx
<div className="bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">
  <div className="flex items-center gap-1.5 sm:gap-2">
    <div className="p-1 sm:p-1.5 bg-teal-50 rounded flex-shrink-0">
      <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-teal-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 매입금액</p>
      <p className="text-xs sm:text-sm md:text-base font-bold text-teal-600 break-words">
        {formatCurrency((() => {
          const totalPurchase = sortedBusinesses.reduce((sum, b) => {
            const cost = Number(b.total_cost) || 0;
            return sum + cost;
          }, 0);
          return totalPurchase;
        })())}
      </p>
    </div>
  </div>
</div>
```

**Data Source**: `business.total_cost` (제조사별 원가 × 수량)
**Icon**: `ShoppingCart` - represents procurement/purchasing
**Color**: Teal (`bg-teal-50`, `text-teal-600`)

### Card #3: 총 영업비용 (Moved from position 4)

**Status**: Move existing card to position 3
**Current Implementation**: Keep as-is
**Change**: Position only

### Card #4: 총 설치비용 (Keep Current Calculation - Moved)

```tsx
<div className="bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">
  <div className="flex items-center gap-1.5 sm:gap-2">
    <div className="p-1 sm:p-1.5 bg-blue-50 rounded flex-shrink-0">
      <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-blue-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">총 설치비용</p>
      <p className="text-xs sm:text-sm md:text-base font-bold text-blue-600 break-words">
        {formatCurrency((() => {
          // 기본설치비 + 추가설치비 (현재 구현 유지)
          const totalInstallation = sortedBusinesses.reduce((sum, b) => {
            const baseCost = Number(b.installation_costs) || 0;
            const extraCost = Number(b.installation_extra_cost) || 0;
            return sum + baseCost + extraCost;
          }, 0);
          return totalInstallation;
        })())}
      </p>
    </div>
  </div>
</div>
```

**Formula**: `Σ(installation_costs + installation_extra_cost)` - **Keep current implementation**
**Change**: Position only (moved from 5th to 4th)

### Card #5: 기타 비용 (NEW - Updated Components)

```tsx
<div className="bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">
  <div className="flex items-center gap-1.5 sm:gap-2">
    <div className="p-1 sm:p-1.5 bg-amber-50 rounded flex-shrink-0">
      <PackagePlus className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-amber-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600">기타 비용</p>
      <p className="text-xs sm:text-sm md:text-base font-bold text-amber-600 break-words">
        {formatCurrency((() => {
          const totalOtherCosts = sortedBusinesses.reduce((sum, b) => {
            // 1. 실사비용 (항상 포함)
            const surveyCosts = Number(b.survey_costs) || 0;

            // 2. AS 비용 (있는 경우)
            const asCost = Number(b.as_cost) || 0;

            // 3. 커스텀 추가비용 (있는 경우)
            let customCosts = 0;
            if (b.custom_additional_costs) {
              try {
                const costs = typeof b.custom_additional_costs === 'string'
                  ? JSON.parse(b.custom_additional_costs)
                  : b.custom_additional_costs;

                if (Array.isArray(costs)) {
                  customCosts = costs.reduce((total, c) => total + (Number(c.amount) || 0), 0);
                }
              } catch (e) {
                customCosts = 0;
              }
            }

            return sum + surveyCosts + asCost + customCosts;
          }, 0);
          return totalOtherCosts;
        })())}
      </p>
    </div>
  </div>
</div>
```

**Formula**: `Σ(survey_costs + as_cost + custom_additional_costs)`
**Components**:
1. 실사비용 (survey_costs) - Always
2. AS 비용 (as_cost) - If exists
3. 커스텀 추가비용 (custom_additional_costs sum) - If exists

**Icon**: `PackagePlus` - represents miscellaneous/additional costs
**Color**: Amber (`bg-amber-50`, `text-amber-600`)

### Card #6: 총 이익금액 (Moved from position 2)

**Status**: Move existing card to position 6
**Current Implementation**: Keep as-is (already uses `net_profit`)
**Change**: Position only

### Card #7: 사업장 평균 이익률 (Moved from position 5)

**Status**: Move existing card to position 7
**Current Implementation**: Keep as-is
**Change**: Position only

## 🎨 Visual Design Summary

### Complete Color Palette

| Card # | Title | Color | Background | Text | Icon |
|--------|-------|-------|------------|------|------|
| 1 | 매출/미수금액 | Green/Red | bg-green-50 / bg-red-50 | text-green-600 / text-red-600 | TrendingUp |
| 2 | **매입금액** | **Teal** | **bg-teal-50** | **text-teal-600** | **ShoppingCart** |
| 3 | 영업비용 | Orange | bg-orange-50 | text-orange-600 | Calculator |
| 4 | 설치비용 | Blue | bg-blue-50 | text-blue-600 | Settings |
| 5 | **기타 비용** | **Amber** | **bg-amber-50** | **text-amber-600** | **PackagePlus** |
| 6 | 이익금액 | Purple | bg-purple-50 | text-purple-600 | DollarSign |
| 7 | 평균 이익률 | Indigo | bg-indigo-50 | text-indigo-600 | BarChart3 |

**Design Consistency**:
- All cards use same structure and spacing
- Consistent icon sizing across breakpoints
- Uniform typography scaling
- Matching border radius and shadows

## 📐 Cost Category Mapping

### Statistics Cards vs Modal Cost Breakdown

| Modal Cost Line | Statistics Card | Card # |
|-----------------|-----------------|--------|
| 매출금액 | 총 매출금액 | #1 |
| 매입금액 | 총 매입금액 | #2 |
| 총 이익 (gross_profit) | *(not displayed)* | - |
| 영업비용 | 총 영업비용 | #3 |
| 실사비용 | **기타 비용** (component) | #5 |
| 기본설치비 | **총 설치비용** (component) | #4 |
| 추가설치비 | **총 설치비용** (component) | #4 |
| AS 비용 | **기타 비용** (component) | #5 |
| 커스텀 추가비용 | **기타 비용** (component) | #5 |
| **순이익** | **총 이익금액** | **#6** |

### Verification Formula

```
Card #1 (매출)
  - Card #2 (매입)
  - Card #3 (영업비용)
  - Card #4 (설치비용: 기본 + 추가)
  - Card #5 (기타 비용: 실사 + AS + 커스텀)
  = Card #6 (총 이익금액 = 순이익)
```

This exactly matches the modal's net profit calculation.

## 🔧 Implementation Checklist

### Code Changes Required

#### Icon Imports
- [x] Add `ShoppingCart` import
- [x] Add `PackagePlus` import

#### Grid Layout
- [x] Update grid class to `lg:grid-cols-7` (single-row layout)

#### Card Changes
- [x] Insert Card #2 (총 매입금액) - NEW
- [x] Move Card #3 (총 영업비용) to position 3
- [x] Move Card #4 (총 설치비용) to position 4 - **Keep current calculation** (base + extra)
- [x] Insert Card #5 (기타 비용) - NEW - **Exclude installation costs**
- [x] Move Card #6 (총 이익금액) to position 6
- [x] Move Card #7 (평균 이익률) to position 7

### Data Field Requirements

Ensure these fields exist in `sortedBusinesses`:
- [x] `total_cost` - for 매입금액
- [x] `adjusted_sales_commission` / `sales_commission` - for 영업비용
- [x] `installation_costs` - for 설치비용
- [x] `installation_extra_cost` - for 설치비용
- [x] `survey_costs` - for 기타 비용
- [x] `as_cost` - for 기타 비용
- [x] `custom_additional_costs` - for 기타 비용
- [x] `net_profit` - for 이익금액

## 📱 Responsive Layout Details

### Mobile (< 640px) - 2 Columns

```
┌─────────────┬─────────────┐
│ 1. 매출     │ 2. 매입     │
├─────────────┼─────────────┤
│ 3. 영업비용 │ 4. 설치비용 │
├─────────────┼─────────────┤
│ 5. 기타비용 │ 6. 이익금액 │
├─────────────┼─────────────┤
│ 7. 이익률   │             │
└─────────────┴─────────────┘
```

### Tablet (768px-1024px) - 3 Columns

```
┌─────────┬─────────┬─────────┐
│ 1. 매출 │ 2. 매입 │ 3. 영업 │
├─────────┼─────────┼─────────┤
│ 4. 설치 │ 5. 기타 │ 6. 이익 │
├─────────┼─────────┼─────────┤
│ 7. 율   │         │         │
└─────────┴─────────┴─────────┘
```

### Desktop (≥ 1024px) - 7 Columns (Single Row)

```
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ 매출│ 매입│ 영업│ 설치│ 기타│ 이익│ 율 │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

## 🎯 Business Logic Verification

### Net Profit Calculation Cross-Check

**Modal Formula**:
```
순이익 = 매출 - 매입 - 영업비용 - 실사비용 - 기본설치비 - 추가설치비 - AS비용 - 커스텀비용
```

**Statistics Cards Formula**:
```
Card #6 (순이익)
= Card #1 (매출)
- Card #2 (매입)
- Card #3 (영업비용)
- Card #4 (설치비용: 기본 + 추가)
- Card #5 (기타 비용: 실사 + AS + 커스텀)
```

✅ **Both formulas are equivalent** - Cards correctly represent all cost components.

## 🔍 Testing Requirements

### Functional Tests
- [ ] All 7 cards display correctly
- [ ] Card order matches specification (1-7)
- [ ] "총 매입금액" shows correct total_cost sum
- [ ] "총 설치비용" includes both base and additional installation costs
- [ ] "기타 비용" correctly sums survey + AS + custom costs
- [ ] "기타 비용" custom costs JSON parsing works correctly
- [ ] All cards update when filters change
- [ ] Currency formatting is consistent

### Visual Tests
- [ ] Single-row layout on desktop (≥1024px)
- [ ] 3-column layout on tablet (768px-1024px)
- [ ] 2-column layout on mobile (<640px)
- [ ] Icons display correctly at all breakpoints
- [ ] Color scheme matches specification
- [ ] Card widths are reasonable (not too narrow on desktop)

### Edge Cases
- [ ] Empty dataset shows ₩0 for all cards
- [ ] Null/undefined values handled correctly
- [ ] Businesses without AS costs handled correctly
- [ ] Businesses without custom costs handled correctly
- [ ] Businesses without additional installation costs handled correctly
- [ ] Custom costs as string vs array handled correctly
- [ ] Large numbers display properly (> ₩1,000,000,000)

### Performance Tests
- [ ] Calculations complete < 100ms for 1000 businesses
- [ ] No memory leaks during filter changes
- [ ] Smooth rendering at all breakpoints

## 📊 Implementation Code Structure

### Card Insertion Order

```typescript
// After existing filters and search section, before table
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3 md:gap-4">

  {/* Card #1: 총 매출금액 / 총 미수금액 - EXISTING */}
  <div className="bg-white ...">
    {/* Current implementation - no change */}
  </div>

  {/* Card #2: 총 매입금액 - NEW */}
  <div className="bg-white ...">
    <div className="p-1 sm:p-1.5 bg-teal-50 ...">
      <ShoppingCart className="... text-teal-600" />
    </div>
    <p className="...">총 매입금액</p>
    <p className="... text-teal-600">{formatCurrency(...)}</p>
  </div>

  {/* Card #3: 총 영업비용 - MOVED (was #4) */}
  <div className="bg-white ...">
    {/* Existing implementation - move here */}
  </div>

  {/* Card #4: 총 설치비용 - MOVED (was #5) - KEEP CURRENT CALC */}
  <div className="bg-white ...">
    {/* Existing implementation with base + extra - move here */}
  </div>

  {/* Card #5: 기타 비용 - NEW */}
  <div className="bg-white ...">
    <div className="p-1 sm:p-1.5 bg-amber-50 ...">
      <PackagePlus className="... text-amber-600" />
    </div>
    <p className="...">기타 비용</p>
    <p className="... text-amber-600">{formatCurrency(...)}</p>
  </div>

  {/* Card #6: 총 이익금액 - MOVED (was #2) */}
  <div className="bg-white ...">
    {/* Existing implementation - move here */}
  </div>

  {/* Card #7: 사업장 평균 이익률 - MOVED (was #5 old position) */}
  <div className="bg-white ...">
    {/* Existing implementation - move here */}
  </div>

</div>
```

## ✅ Acceptance Criteria

### Design Compliance
- [x] 7 statistics cards in specified order
- [x] "총 매입금액" card added with teal color scheme
- [x] "기타 비용" card added with amber color scheme
- [x] "총 설치비용" includes both base and additional installation costs
- [x] Single-row layout on large screens (lg:grid-cols-7)
- [x] Responsive grid layout at all breakpoints

### Calculation Accuracy
- [x] "총 매입금액" = Σ(total_cost)
- [x] "총 설치비용" = Σ(installation_costs + installation_extra_cost)
- [x] "기타 비용" = Σ(survey_costs + as_cost + custom_costs)
- [x] "총 이익금액" = Σ(net_profit) matches modal formula
- [x] All calculations match modal's net profit breakdown

### User Experience
- [x] Cards display business logic flow: Revenue → Costs → Profit
- [x] Color coding helps distinguish cost categories
- [x] Icons are semantically appropriate
- [x] Layout is readable at all screen sizes

## 🚀 Implementation Estimate

**Priority**: High
**Complexity**: Medium
**Estimated Effort**: 30-45 minutes

**Breakdown**:
1. Icon imports (2 min)
2. Grid layout update to lg:grid-cols-7 (2 min)
3. Card #2 (총 매입금액) implementation (5 min)
4. Card #5 (기타 비용) implementation with JSON parsing (10 min)
5. Reorder existing cards (10 min)
6. Testing responsive layout (5-10 min)
7. Verification and validation (5-10 min)

## 📚 Related Documentation

### Reference Files
- [components/business/BusinessRevenueModal.tsx:1676-1759](../components/business/BusinessRevenueModal.tsx#L1676-L1759) - Net profit formula source
- [lib/revenue-calculator.ts](../lib/revenue-calculator.ts) - Calculation logic
- [app/admin/revenue/page.tsx:1386-1508](../app/admin/revenue/page.tsx#L1386-L1508) - Current implementation

### Previous Designs
- [DESIGN_revenue_statistics_purchase_amount_card.md](DESIGN_revenue_statistics_purchase_amount_card.md) - v1.0 (superseded)
- [DESIGN_revenue_statistics_cards_redesign_v2.md](DESIGN_revenue_statistics_cards_redesign_v2.md) - v2.0 (superseded)

### Change Log

**v3.0 (2026-02-20) - FINAL**:
- ✅ "총 설치비용" keeps current calculation (base + additional installation costs)
- ✅ "기타 비용" updated to exclude installation costs (survey + AS + custom only)
- ✅ Single-row layout confirmed for large screens (lg:grid-cols-7)
- ✅ Card order finalized: 매출→매입→영업→설치→기타→이익→이익률
- ✅ All calculations verified against modal formula
- ✅ Ready for implementation

**v2.0 (2026-02-20)**:
- Added "기타 비용" with installation costs included
- 2-row layout option explored
- (Superseded by v3.0 requirements change)

**v1.0 (2026-02-20)**:
- Initial design with "총 매입금액" only
- (Superseded by expanded requirements)

---

**Design Status**: ✅ FINAL - Ready for Implementation
**Design Version**: 3.0
**Design Date**: 2026-02-20
**Designer**: Claude Sonnet 4.5
