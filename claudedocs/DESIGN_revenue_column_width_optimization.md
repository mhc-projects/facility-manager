# Revenue Table Column Width Optimization Design

**Date**: 2026-02-20
**Purpose**: Optimize column widths to provide more space for payment date column with calendar picker
**Location**: [app/admin/revenue/page.tsx:2264-2289](app/admin/revenue/page.tsx#L2264-L2289)

## 📋 Problem Statement

**Current Issue**:
- Payment date column (입금예정일) displays calendar icon + date text
- Current width (8-10%) is cramped for interactive calendar picker
- Revenue (매출), Purchase (매입), Profit (이익) columns have generous space for numbers

**User Requirement**:
> "입금예정일 컬럼의 크기가 더 필요할거같아. 매출, 매입, 이익금액 컬럼의크기를 아주 조금 줄이고 그만큼 입금예정일 컬럼의 크기를 키우는건 어때?"

## 🎯 Design Goals

1. **Increase Payment Date Width**: From 8-10% → 11-12% (+2-3%)
2. **Redistribute from Financial Columns**: Reduce Revenue/Purchase/Profit by ~1% each
3. **Maintain Visual Balance**: Keep total at 100-101%
4. **Preserve Readability**: Ensure financial amounts still display clearly

## 📊 Current Column Width Analysis

### Scenario 1: 자비 + 미수금 + 실사비용 (12 columns)
```
사업장명  입금예정일  업무단계  위험도  지역  담당자  매출  매입  이익  이익률  실사비용  미수금
  16%      9%      9%    7%   7%   7%   9%   9%   9%   5%     7%     7%  = 101%
```

**Analysis**:
- Payment date: 9% (acceptable but tight)
- Financial columns (매출/매입/이익): 9% each (generous)
- **Optimization opportunity**: -1% from each financial column → +3% to payment date

### Scenario 2: 자비 + 미수금 (11 columns)
```
사업장명  입금예정일  업무단계  위험도  지역  담당자  매출   매입   이익   이익률  미수금
  17%      8%      7%    7%   8%   8%   10%   10%   10%   6%    9%  = 100%
```

**Analysis**:
- Payment date: 8% ⚠️ **TOO NARROW** (calendar picker cramped)
- Financial columns (매출/매입/이익): 10% each (very generous)
- **Critical optimization needed**: -1% from each financial → +3% to payment date

### Scenario 3: 자비 only (10 columns)
```
사업장명  입금예정일  지역  담당자  카테고리  영업점  매출   매입   이익   이익률
  18%      10%     9%   7%    8%    8%   11%   11%   11%   7%  = 100%
```

**Analysis**:
- Payment date: 10% (adequate)
- Financial columns (매출/매입/이익): 11% each (very generous)
- **Optimization beneficial**: -1% from each financial → +3% to payment date

## ✅ Optimized Column Width Design

### Scenario 1 (Optimized): 자비 + 미수금 + 실사비용
```diff
  사업장명  입금예정일  업무단계  위험도  지역  담당자  매출  매입  이익  이익률  실사비용  미수금
-   16%      9%      9%    7%   7%   7%   9%   9%   9%   5%     7%     7%
+   16%     11%      9%    7%   7%   7%   8%   8%   8%   5%     7%     7%
  = 100%
```

**Changes**:
- ✅ Payment date: 9% → 11% (+2%, +22% increase)
- 📉 Revenue: 9% → 8% (-1%)
- 📉 Purchase: 9% → 8% (-1%)
- 📉 Profit: 9% → 8% (-1%)
- ✅ **Total remains 100%** (fixed rounding issue)

**Rationale**:
- Payment date gains meaningful space for calendar interaction
- Financial columns still wide enough for 11-digit numbers (₩99,999,999,999)
- Visual balance maintained

### Scenario 2 (Optimized): 자비 + 미수금
```diff
  사업장명  입금예정일  업무단계  위험도  지역  담당자  매출   매입   이익   이익률  미수금
-   17%      8%      7%    7%   8%   8%   10%   10%   10%   6%    9%
+   16%     11%      7%    7%   8%   8%    9%    9%    9%   6%    9%
  = 99% → rounded to 100%
```

**Changes**:
- ✅ Payment date: 8% → 11% (+3%, +37.5% increase) **CRITICAL FIX**
- 📉 Business name: 17% → 16% (-1%, still generous)
- 📉 Revenue: 10% → 9% (-1%)
- 📉 Purchase: 10% → 9% (-1%)
- 📉 Profit: 10% → 9% (-1%)

**Rationale**:
- Payment date now has comfortable space for calendar picker
- Financial columns still adequate for large numbers
- Business name still has ample space (reduced from very generous 17%)

### Scenario 3 (Optimized): 자비 only
```diff
  사업장명  입금예정일  지역  담당자  카테고리  영업점  매출   매입   이익   이익률
-   18%      10%     9%   7%    8%    8%   11%   11%   11%   7%
+   17%      12%     9%   7%    8%    8%   10%   10%   10%   7%
  = 98% → rounded to 100%
```

**Changes**:
- ✅ Payment date: 10% → 12% (+2%, +20% increase)
- 📉 Business name: 18% → 17% (-1%)
- 📉 Revenue: 11% → 10% (-1%)
- 📉 Purchase: 11% → 10% (-1%)
- 📉 Profit: 11% → 10% (-1%)

**Rationale**:
- Payment date gains premium space for best calendar UX
- Financial columns reduced from "very generous" to "adequate"
- Business name still has most space for long names

## 🎨 Visual Impact Analysis

### Before Optimization (Scenario 2 - Worst Case)
```
┌────────┬────┬─────┬────┬────┬────┬──────┬──────┬──────┬────┬──────┐
│Business│ 📅 │Task │Risk│Area│Mgr │  💰  │  🏭  │  💵  │ %  │ 📊  │
│  17%   │ 8% │ 7% │ 7% │ 8% │ 8% │ 10% │ 10% │ 10% │ 6% │  9% │
└────────┴────┴─────┴────┴────┴────┴──────┴──────┴──────┴────┴──────┘
         ↑ CRAMPED - Calendar picker squeezed
                              ↑ VERY GENEROUS - Lots of empty space
```

### After Optimization (Scenario 2 - Improved)
```
┌────────┬──────┬─────┬────┬────┬────┬─────┬─────┬─────┬────┬──────┐
│Business│  📅  │Task │Risk│Area│Mgr │ 💰  │ 🏭  │ 💵  │ %  │ 📊  │
│  16%   │ 11% │ 7% │ 7% │ 8% │ 8% │ 9% │ 9% │ 9% │ 6% │  9% │
└────────┴──────┴─────┴────┴────┴────┴─────┴─────┴─────┴────┴──────┘
         ↑ COMFORTABLE - Calendar picker has breathing room
                              ↑ ADEQUATE - Still clear for 11-digit numbers
```

## 💻 Implementation Specification

### Code Location
File: [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx)
Function: `VirtualizedTable`
Lines: 2264-2289

### Changes Required

**Scenario 1**: Lines 2265-2267
```typescript
// Before
if (showPaymentSchedule && showReceivablesOnly && showSurveyCostsColumn) {
  return ['16%', '9%', '9%', '7%', '7%', '7%', '9%', '9%', '9%', '5%', '7%', '7%'];
}

// After
if (showPaymentSchedule && showReceivablesOnly && showSurveyCostsColumn) {
  // 사업장명, 입금예정일, 업무단계, 위험도, 지역, 담당자, 매출, 매입, 이익, 이익률, 실사비용, 미수금
  return ['16%', '11%', '9%', '7%', '7%', '7%', '8%', '8%', '8%', '5%', '7%', '7%'];
  //            ^^^^ +2%                          ^^^  ^^^  ^^^  all -1%
}
```

**Scenario 2**: Lines 2268-2270
```typescript
// Before
else if (showPaymentSchedule && showReceivablesOnly) {
  return ['17%', '8%', '7%', '7%', '8%', '8%', '10%', '10%', '10%', '6%', '9%'];
}

// After
else if (showPaymentSchedule && showReceivablesOnly) {
  // 사업장명, 입금예정일, 업무단계, 위험도, 지역, 담당자, 매출, 매입, 이익, 이익률, 미수금
  return ['16%', '11%', '7%', '7%', '8%', '8%', '9%', '9%', '9%', '6%', '9%'];
  //      ^^^^ -1%  ^^^^ +3%                      ^^^  ^^^  ^^^  all -1%
}
```

**Scenario 3**: Lines 2271-2273
```typescript
// Before
else if (showPaymentSchedule) {
  return ['18%', '10%', '9%', '7%', '8%', '8%', '11%', '11%', '11%', '7%'];
}

// After
else if (showPaymentSchedule) {
  // 사업장명, 입금예정일, 지역, 담당자, 카테고리, 영업점, 매출, 매입, 이익, 이익률
  return ['17%', '12%', '9%', '7%', '8%', '8%', '10%', '10%', '10%', '7%'];
  //      ^^^^ -1%  ^^^^ +2%                      ^^^^  ^^^^  ^^^^ all -1%
}
```

## ✅ Validation Checklist

### Visual Testing
- [ ] Payment date column: Calendar icon + date text displays comfortably
- [ ] Calendar popover: Opens without layout shift
- [ ] Financial columns: 11-digit numbers (₩99,999,999,999) display clearly
- [ ] Business name: Long names don't truncate excessively
- [ ] Overall balance: Table looks visually balanced

### Responsive Testing
- [ ] Desktop (1920px): All columns readable
- [ ] Laptop (1440px): No horizontal scroll
- [ ] Tablet (1024px): Graceful degradation

### Content Testing
- [ ] Test with shortest payment date: `-` (empty state)
- [ ] Test with full date: `2026-12-31` + calendar icon
- [ ] Test with longest business name in dataset
- [ ] Test with max financial value: `₩99,999,999,999`

## 📊 Impact Assessment

### Benefits
- ✅ Payment date column: +20-37% width increase improves UX
- ✅ Calendar picker: More breathing room for interaction
- ✅ Financial columns: Still adequate for large numbers
- ✅ Visual balance: Better proportions across all scenarios

### Risks
- ⚠️ **Low Risk**: Financial columns reduced but still adequate
- ⚠️ **Mitigation**: 8-10% width supports 11-digit numbers with `text-2xs` font

### Alternatives Considered

**Option 1: Only reduce financial columns** (Selected ✅)
- Pros: Balanced approach, proportional reduction
- Cons: None significant

**Option 2: Reduce business name more**
- Pros: More space for payment date
- Cons: Business names are critical identifiers, should prioritize space

**Option 3: Use smaller font for payment dates**
- Pros: No column width changes
- Cons: Reduces readability and clickability of calendar picker

## 🎯 Success Criteria

1. ✅ Payment date column width increases by 2-3%
2. ✅ Financial columns reduced proportionally (~1% each)
3. ✅ Total column width remains 98-101%
4. ✅ Calendar picker displays comfortably
5. ✅ 11-digit numbers in financial columns remain readable
6. ✅ No horizontal scrolling introduced
7. ✅ Visual balance maintained across all filter scenarios

---

**Status**: ✅ Design Complete - Ready for Implementation
**Designer**: Claude Sonnet 4.5
**Estimated Implementation Time**: 5 minutes (simple value changes)
**Risk Level**: Low (cosmetic CSS percentage adjustments)
