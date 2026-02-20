# Design Specification: Revenue Management Statistics Cards Redesign (v2)

## 📋 Overview

**Feature**: Redesign statistics cards with new order and additional "기타 비용" card
**Location**: [app/admin/revenue/page.tsx:1386-1508](app/admin/revenue/page.tsx#L1386-L1508)
**Date**: 2026-02-20
**Version**: 2.0
**Status**: Design Complete

## 🎯 Requirements

### Primary Requirements
1. ✅ Add "총 매입금액" (Total Purchase Amount) card
2. ✅ Add "기타 비용" (Other Costs) card - costs not included in standard categories
3. ✅ Update "총 이익금액" calculation to match modal's net profit formula
4. ✅ Reorder cards to match business logic flow

### Business Logic Alignment
- Match the net profit calculation formula used in BusinessRevenueModal
- Display costs in logical order: Revenue → Purchase → Operating → Installation → Other → Profit

## 📊 Net Profit Calculation Formula Analysis

### Modal's Net Profit Formula (Source of Truth)

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

| Cost Category | Field Name | Condition | Display in Modal |
|---------------|-----------|-----------|------------------|
| **매입금액** | `total_cost` | Always | Yes |
| **영업비용** | `adjusted_sales_commission` OR `sales_commission` | Always | Yes |
| **실사비용** | `survey_costs` | Always | Yes |
| **기본설치비** | `installation_costs` | Always | Yes |
| **추가설치비** | `additional_installation_revenue` OR `installation_extra_cost` | If > 0 | Conditional |
| **AS 비용** | `as_cost` | If > 0 | Conditional |
| **커스텀 추가비용** | `custom_additional_costs` (JSON array) | If exists | Conditional |

### "기타 비용" (Other Costs) Definition

**Components**:
1. **실사비용** (Survey Costs) - Always included
2. **추가설치비** (Additional Installation Costs) - If exists
3. **AS 비용** (AS Costs) - If exists
4. **커스텀 추가비용** (Custom Additional Costs) - If exists

**Calculation Formula**:
```typescript
기타 비용 = 실사비용
         + (추가설치비 > 0 ? 추가설치비 : 0)
         + (AS 비용 > 0 ? AS 비용 : 0)
         + (커스텀 추가비용 합계 > 0 ? 커스텀 추가비용 합계 : 0)
```

**Rationale**:
- "기타 비용" groups all costs that are NOT standard procurement/operating/installation costs
- Matches the modal's calculation by including survey, additional installation, AS, and custom costs
- Simplifies dashboard view while maintaining calculation accuracy

## 🎨 New Statistics Cards Design

### Card Order (7 Cards Total)

| # | Title | Calculation | Icon | Color | Notes |
|---|-------|-------------|------|-------|-------|
| 1 | 총 매출금액 / 총 미수금액 | Dynamic based on filter | TrendingUp | Green/Red | Existing (conditional) |
| 2 | **총 매입금액** | `Σ(total_cost)` | ShoppingCart | Teal | **NEW** |
| 3 | 총 영업비용 | `Σ(adjusted_sales_commission OR sales_commission)` | Calculator | Orange | Existing (moved) |
| 4 | 총 설치비용 | `Σ(installation_costs)` | Settings | Blue | Modified (기본설치비 only) |
| 5 | **기타 비용** | Survey + Additional Install + AS + Custom | PackagePlus | Amber | **NEW** |
| 6 | 총 이익금액 | `Σ(net_profit)` using modal formula | DollarSign | Purple | Modified calculation |
| 7 | 사업장 평균 이익률 | `avg(net_profit / total_revenue * 100)` | BarChart3 | Indigo | Existing (moved) |

### Key Changes from Current Implementation

#### 1. Card #1 (총 매출금액/총 미수금액)
- **Status**: No change
- **Position**: Remains first

#### 2. Card #2 (총 매입금액) - NEW
- **Status**: New card
- **Position**: After revenue, before operating costs
- **Formula**: `Σ(total_cost)` from all filtered businesses
- **Data Source**: `business.total_cost` (제조사별 원가 × 수량)

#### 3. Card #3 (총 영업비용)
- **Status**: Moved from position 4
- **Position**: After purchase amount
- **Formula**: No change
- **Rationale**: Operating costs come after procurement in business flow

#### 4. Card #4 (총 설치비용)
- **Status**: Modified calculation
- **Position**: After operating costs
- **Current Formula**: `Σ(installation_costs + installation_extra_cost)`
- **New Formula**: `Σ(installation_costs)` only (기본설치비만)
- **Rationale**: 추가설치비 moved to "기타 비용"

#### 5. Card #5 (기타 비용) - NEW
- **Status**: New card
- **Position**: After installation costs
- **Formula**: Survey + Additional Installation + AS + Custom costs
- **Components**:
  - 실사비용 (survey_costs)
  - 추가설치비 (additional_installation_revenue OR installation_extra_cost)
  - AS 비용 (as_cost)
  - 커스텀 추가비용 (custom_additional_costs sum)

#### 6. Card #6 (총 이익금액)
- **Status**: Modified calculation (moved from position 2)
- **Position**: After all cost cards
- **Current Formula**: `Σ(net_profit)` (simple sum)
- **New Formula**: Verify `net_profit` includes all deductions per modal formula
- **Rationale**: Display profit after showing all cost components

#### 7. Card #7 (사업장 평균 이익률)
- **Status**: No change (moved from position 5)
- **Position**: Last card
- **Rationale**: Average ratio as final summary metric

## 💻 Implementation Specifications

### Card #2: 총 매입금액 (Total Purchase Amount)

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

### Card #4: 총 설치비용 (Modified - Base Installation Only)

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
          // 기본설치비만 포함 (추가설치비는 기타 비용으로 이동)
          const totalInstallation = sortedBusinesses.reduce((sum, b) => {
            const baseCost = Number(b.installation_costs) || 0;
            return sum + baseCost;
          }, 0);
          return totalInstallation;
        })())}
      </p>
    </div>
  </div>
</div>
```

### Card #5: 기타 비용 (New - Other Costs)

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
            // 실사비용 (항상 포함)
            const surveyCosts = Number(b.survey_costs) || 0;

            // 추가설치비 (있는 경우)
            const additionalInstall = Number(
              b.additional_installation_revenue || b.installation_extra_cost || 0
            );

            // AS 비용 (있는 경우)
            const asCost = Number(b.as_cost) || 0;

            // 커스텀 추가비용 (있는 경우)
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

            return sum + surveyCosts + additionalInstall + asCost + customCosts;
          }, 0);
          return totalOtherCosts;
        })())}
      </p>
    </div>
  </div>
</div>
```

**Icon Selection**: `PackagePlus` from lucide-react
- Represents additional/miscellaneous costs
- Visually distinct from other cost categories
- Amber color distinguishes it from installation (blue) and operating (orange)

### Card #6: 총 이익금액 (Verification)

**Current Implementation Review**:
```tsx
const totalProfit = sortedBusinesses.reduce((sum, b) => {
  const profit = Number(b.net_profit) || 0;
  return sum + profit;
}, 0);
```

**Verification Needed**: Ensure `b.net_profit` is calculated using the modal's formula:
```
net_profit = gross_profit
           - sales_commission
           - survey_costs
           - installation_costs
           - additional_installation_revenue (if > 0)
           - as_cost (if > 0)
           - custom_additional_costs (if exists)
```

**Source Validation**: [lib/revenue-calculator.ts:L198-L210](lib/revenue-calculator.ts#L198-L210)

**No Code Change Required** if calculation already matches modal formula.

## 🎨 Visual Design Summary

### Color Palette

| Card | Color | Background | Text | Icon |
|------|-------|------------|------|------|
| 매출/미수금액 | Green/Red | bg-green-50 / bg-red-50 | text-green-600 / text-red-600 | TrendingUp |
| **매입금액** | **Teal** | **bg-teal-50** | **text-teal-600** | **ShoppingCart** |
| 영업비용 | Orange | bg-orange-50 | text-orange-600 | Calculator |
| 설치비용 | Blue | bg-blue-50 | text-blue-600 | Settings |
| **기타 비용** | **Amber** | **bg-amber-50** | **text-amber-600** | **PackagePlus** |
| 이익금액 | Purple | bg-purple-50 | text-purple-600 | DollarSign |
| 평균 이익률 | Indigo | bg-indigo-50 | text-indigo-600 | BarChart3 |

### Icon Imports Required

```typescript
import {
  // ... existing imports
  ShoppingCart,  // NEW - for 총 매입금액
  PackagePlus    // NEW - for 기타 비용
} from 'lucide-react';
```

## 📐 Layout Configuration

### Grid Layout Update

**Current**: `grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`
**Updated**: `grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7`

**Responsive Behavior**:

| Breakpoint | Columns | Layout Pattern |
|------------|---------|----------------|
| Mobile (< 640px) | 2 | 4 rows: 2-2-2-1 |
| Small (640px-768px) | 2 | 4 rows: 2-2-2-1 |
| Medium (768px-1024px) | 3 | 3 rows: 3-3-1 |
| Large (≥ 1024px) | 7 | 1 row: all 7 cards |

**Alternative for Better Visual Balance on Large Screens**:

Consider using a 2-row layout for better card sizing:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
```

**Large Screen Layout** (4 columns):
- Row 1: 매출, 매입, 영업비용, 설치비용 (4 cards)
- Row 2: 기타 비용, 이익금액, 평균 이익률 (3 cards)

This provides better card width and readability than 7 narrow cards in one row.

## 🔧 Implementation Checklist

### Code Changes Required

- [ ] Add icon imports: `ShoppingCart`, `PackagePlus`
- [ ] Update grid layout class (choose 1-row or 2-row approach)
- [ ] Insert Card #2 (총 매입금액) after Card #1
- [ ] Move Card #3 (총 영업비용) to position 3
- [ ] Modify Card #4 (총 설치비용) calculation - remove extra installation costs
- [ ] Insert Card #5 (기타 비용) with multi-component calculation
- [ ] Move Card #6 (총 이익금액) to position 6
- [ ] Move Card #7 (평균 이익률) to position 7
- [ ] Verify `net_profit` calculation matches modal formula

### Data Field Validation

Ensure these fields exist in `sortedBusinesses`:
- [ ] `total_cost` - for 매입금액
- [ ] `survey_costs` - for 기타 비용 component
- [ ] `additional_installation_revenue` OR `installation_extra_cost` - for 기타 비용
- [ ] `as_cost` - for 기타 비용
- [ ] `custom_additional_costs` - for 기타 비용
- [ ] `net_profit` - for 이익금액 (verify calculation)

### Testing Requirements

- [ ] Verify all 7 cards display correctly
- [ ] Test responsive layout at all breakpoints
- [ ] Verify calculation accuracy for new cards
- [ ] Test with businesses that have/don't have optional costs (AS, custom, etc.)
- [ ] Verify filter updates reflect in all cards
- [ ] Test with empty dataset (should show ₩0)
- [ ] Test with large numbers (> ₩1B)

## 📊 Calculation Verification Matrix

### Net Profit Calculation Cross-Check

| Component | Modal Formula | Calculator File | Page Display |
|-----------|---------------|-----------------|--------------|
| 매출 | ✅ total_revenue | ✅ Line 130-150 | ✅ Card #1 |
| 매입 | ✅ total_cost | ✅ Line 193 | ✅ Card #2 |
| 총이익 | ✅ gross_profit | ✅ Line 196 | Not displayed |
| 영업비용 | ✅ adjusted_sales_commission | ✅ Line 160-165 | ✅ Card #3 |
| 실사비용 | ✅ survey_costs | ✅ Line 168-183 | ✅ Card #5 component |
| 기본설치비 | ✅ installation_costs | ✅ Line 139-141 | ✅ Card #4 |
| 추가설치비 | ✅ installation_extra_cost | ✅ Line 189 | ✅ Card #5 component |
| AS 비용 | ✅ as_cost | ⚠️ Not in calculator | ✅ Card #5 component |
| 커스텀 비용 | ✅ custom_additional_costs | ⚠️ Not in calculator | ✅ Card #5 component |
| **순이익** | ✅ net_profit | ✅ Line 198-210 | ✅ Card #6 |

**Notes**:
- AS 비용 and 커스텀 비용 are managed separately (database adjustments)
- Calculator returns base `net_profit`, adjustments applied at database level
- Modal displays all cost components including AS and custom costs
- Statistics cards should match modal's comprehensive view

## 🎯 Business Logic Flow

### Visual Information Flow (Left to Right on Large Screens)

```
Revenue Generation → Costs Incurred → Profit Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1. 총 매출]  →  [2. 매입] → [3. 영업] → [4. 설치] → [5. 기타] → [6. 순이익] → [7. 이익률%]
              ↓___________________↓__________↓_________↓_________↓
                          All costs deducted from revenue
```

**Logical Grouping**:
1. **Revenue Section**: 총 매출금액
2. **Cost Section**: 매입 → 영업 → 설치 → 기타
3. **Profit Section**: 총 이익금액 → 평균 이익률

This layout mirrors the P&L (Profit & Loss) statement structure.

## 📱 Mobile Optimization

### Mobile Card Order (2-column layout)

| Row | Left Column | Right Column |
|-----|-------------|--------------|
| 1 | 총 매출 | 총 매입 |
| 2 | 총 영업비용 | 총 설치비용 |
| 3 | 기타 비용 | 총 이익금액 |
| 4 | 평균 이익률 | (empty) |

**Consideration**: For better mobile experience, could display in single column on very small screens:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
```

## 🔍 Edge Cases & Error Handling

### Null/Undefined Handling

```typescript
// Pattern for all calculations
const value = Number(business.field_name) || 0;
```

### Custom Additional Costs Parsing

```typescript
// Safe JSON parsing with fallback
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
```

### Zero Division Protection

```typescript
// Average profit margin calculation
{sortedBusinesses.length > 0 ?
  ((sortedBusinesses.reduce((sum, b) => sum + (b.total_revenue > 0 ? ((b.net_profit || 0) / b.total_revenue * 100) : 0), 0) / sortedBusinesses.length)).toFixed(1)
  : '0'}%
```

## 📚 Documentation Updates

### Related Documentation
- [DESIGN_revenue_statistics_purchase_amount_card.md](DESIGN_revenue_statistics_purchase_amount_card.md) - Superseded by this v2 design
- [lib/revenue-calculator.ts](../lib/revenue-calculator.ts) - Source calculation logic
- [components/business/BusinessRevenueModal.tsx](../components/business/BusinessRevenueModal.tsx) - Net profit formula reference

### Change Log

**v2.0 (2026-02-20)**:
- Added "기타 비용" card with multi-component calculation
- Reordered cards to match business logic flow (Revenue → Costs → Profit)
- Modified "총 설치비용" to include only base installation costs
- Verified "총 이익금액" calculation matches modal's net profit formula
- Updated grid layout for 7 total cards

**v1.0 (2026-02-20)**:
- Initial design with "총 매입금액" card addition
- Basic calculation formula verification

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] 7 statistics cards display correctly in specified order
- [ ] "총 매입금액" shows sum of total_cost
- [ ] "기타 비용" includes survey, additional install, AS, and custom costs
- [ ] "총 설치비용" shows base installation costs only
- [ ] "총 이익금액" matches modal's net profit calculation
- [ ] All cards update dynamically with filter changes
- [ ] Currency formatting is consistent across all cards

### Visual Requirements
- [ ] New cards use specified color schemes (teal, amber)
- [ ] Icons display correctly at all breakpoints
- [ ] Card order matches specification: 매출→매입→영업→설치→기타→이익→이익률
- [ ] Responsive layout works properly at all breakpoints
- [ ] Visual consistency maintained across all 7 cards

### Technical Requirements
- [ ] No console errors or warnings
- [ ] Proper null/undefined handling for all fields
- [ ] Safe JSON parsing for custom_additional_costs
- [ ] Performance: calculations complete < 100ms for 1000 businesses
- [ ] Custom costs array properly handled (string vs array)

### Business Logic Requirements
- [ ] "기타 비용" calculation matches modal's cost breakdown
- [ ] Net profit calculation includes all cost deductions
- [ ] Card order reflects logical business flow
- [ ] All cost components accounted for in display

## 🚀 Implementation Estimate

**Priority**: High
**Complexity**: Medium
**Estimated Effort**: 45-60 minutes

**Breakdown**:
1. Icon imports and grid layout update (5 min)
2. Card #2 (총 매입금액) implementation (5 min)
3. Card #4 (총 설치비용) modification (5 min)
4. Card #5 (기타 비용) implementation with multi-component logic (15 min)
5. Card reordering (10 min)
6. Net profit calculation verification (10 min)
7. Testing and validation (10-15 min)

---

**Design Status**: ✅ Complete and Ready for Implementation
**Design Version**: 2.0
**Design Date**: 2026-02-20
**Designer**: Claude Sonnet 4.5
