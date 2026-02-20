# Design Specification: Statistics Card Tooltip with Formula

## 📋 Overview

**Feature**: Add hover tooltip to statistics cards showing calculation formula
**Location**: [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx)
**Date**: 2026-02-20
**Status**: Design Complete

## 🎯 Requirements

### Primary Requirement
Add tooltip functionality to all 7 statistics cards that displays the calculation formula when user hovers over the card.

### User Experience Goals
- Provide transparency on how each statistic is calculated
- Help users understand the business logic flow
- No additional clicks required (hover-based)
- Non-intrusive and professional appearance

## 🎨 Design Specification

### Tooltip Content by Card

| Card # | Title | Tooltip Formula |
|--------|-------|-----------------|
| 1 | 총 매출금액 | `매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)` |
| 1 | 총 미수금액 | `미수금 = Σ(선수금 + 계산서잔액 - 입금잔액)` |
| 2 | 총 매입금액 | `매입 = Σ(제조사별 원가 × 수량)` |
| 3 | 총 영업비용 | `영업비용 = Σ(영업비용 또는 조정된 영업비용)` |
| 4 | 총 설치비용 | `설치비용 = Σ(기본설치비 + 추가설치비)` |
| 5 | 기타 비용 | `기타 비용 = Σ(실사비용 + AS 비용 + 커스텀 비용)` |
| 6 | 총 이익금액 | `순이익 = 매출 - 매입 - 영업비용 - 설치비용 - 기타 비용` |
| 7 | 평균 이익률 | `평균 이익률 = (Σ(순이익 ÷ 매출 × 100) ÷ 사업장 수)%` |

### Implementation Approach

**Option 1: CSS `title` Attribute (Simplest)**
```tsx
<div className="..." title="매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)">
  {/* Card content */}
</div>
```

**Pros**:
- Zero dependencies
- Native browser support
- Minimal code change
- Automatic positioning

**Cons**:
- Basic styling (browser default)
- Delay before showing
- Limited customization

**Option 2: Custom Tailwind Tooltip (Recommended)**
```tsx
<div className="group relative ...">
  {/* Card content */}
  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block">
    <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
      매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
  </div>
</div>
```

**Pros**:
- Full design control
- Instant appearance
- Brand-consistent styling
- No dependencies

**Cons**:
- More code per card
- Manual positioning

**Option 3: Tooltip Library (e.g., Radix UI Tooltip)**
```tsx
<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <div className="...">{/* Card content */}</div>
    </Tooltip.Trigger>
    <Tooltip.Content>
      매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)
    </Tooltip.Content>
  </Tooltip.Root>
</Tooltip.Provider>
```

**Pros**:
- Accessible (ARIA)
- Advanced features (delay, positioning)
- Well-tested

**Cons**:
- Additional dependency
- More complex code
- Bundle size increase

## 💻 Recommended Implementation (Option 2: Custom Tailwind)

### Visual Design

**Tooltip Appearance**:
- Background: `bg-gray-900` (dark, high contrast)
- Text: `text-white text-xs`
- Padding: `py-1.5 px-3`
- Border radius: `rounded-md`
- Shadow: `shadow-lg`
- Arrow: Small triangle pointing down to card

**Positioning**:
- Above the card (`bottom-full`)
- Centered horizontally (`left-1/2 -translate-x-1/2`)
- 8px gap from card (`mb-2`)

**Animation**:
- Fade in on hover
- Smooth transition: `transition-opacity duration-200`
- Initially hidden: `opacity-0 group-hover:opacity-100`

### Component Structure

```tsx
{/* Card #1: Total Revenue/Receivables */}
<div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

  {/* Tooltip */}
  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
    <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
      {showReceivablesOnly
        ? '미수금 = Σ(선수금 + 계산서잔액 - 입금잔액)'
        : '매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)'
      }
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
        <div className="border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  </div>

  {/* Original card content */}
  <div className="flex items-center gap-1.5 sm:gap-2">
    {/* ... existing content ... */}
  </div>
</div>
```

### Tooltip Formula Details

#### Card #1: 총 매출금액
```
매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)
```

#### Card #1 (Alternative): 총 미수금액
```
미수금 = Σ(선수금 + 계산서잔액 - 입금잔액)
```

#### Card #2: 총 매입금액
```
매입 = Σ(제조사별 원가 × 수량)
```

#### Card #3: 총 영업비용
```
영업비용 = Σ(기본 영업비용 또는 조정된 영업비용)
```

#### Card #4: 총 설치비용
```
설치비용 = Σ(기본설치비 + 추가설치비)
```

#### Card #5: 기타 비용
```
기타 비용 = Σ(실사비용 + AS 비용 + 커스텀 비용)
```

#### Card #6: 총 이익금액
```
순이익 = 매출 - 매입 - 영업비용 - 설치비용 - 기타 비용
```

#### Card #7: 평균 이익률
```
평균 이익률 = (Σ(순이익 ÷ 매출 × 100) ÷ 사업장 수)%
```

## 📱 Responsive Behavior

### Desktop (≥ 1024px)
- Tooltip appears above card
- Centered horizontally
- Full formula displayed

### Tablet (768px-1024px)
- Same as desktop
- Formula may wrap for longer text

### Mobile (< 768px)
- **Consideration**: Hover doesn't work well on touch devices
- **Alternative**: Show formula on tap/click
- **Implementation**: Add `onClick` handler for mobile

### Mobile-Specific Solution

```tsx
const [showTooltip, setShowTooltip] = useState(false);
const isMobile = useIsMobile(); // existing hook

<div
  className="group relative ..."
  onClick={() => isMobile && setShowTooltip(!showTooltip)}
>
  <div className={`absolute ... ${isMobile ? (showTooltip ? 'opacity-100' : 'opacity-0') : 'opacity-0 group-hover:opacity-100'} ...`}>
    {/* Tooltip content */}
  </div>
</div>
```

## 🎨 Visual Examples

### Tooltip Visual Mockup

```
┌─────────────────────────────────────────────────────┐
│  매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)  │
└────────────────────▼────────────────────────────────┘
┌───────────────────────────────────────────┐
│  [Icon] 총 매출금액                        │
│         ₩721,831,893,800                  │
└───────────────────────────────────────────┘
```

### Color Scheme

- Tooltip Background: `#111827` (gray-900)
- Tooltip Text: `#FFFFFF` (white)
- Tooltip Shadow: `rgba(0, 0, 0, 0.1)`
- Arrow: Same as background

## 🔧 Implementation Details

### CSS Classes Breakdown

```tsx
// Wrapper with group for hover detection
className="group relative ..."

// Tooltip container
className="
  absolute          // Position relative to parent
  bottom-full       // Place above the card
  left-1/2          // Center horizontally
  -translate-x-1/2  // Adjust for centering
  mb-2              // 8px gap from card
  pointer-events-none // Don't block card interactions
  opacity-0         // Initially hidden
  group-hover:opacity-100 // Show on parent hover
  transition-opacity // Smooth fade
  duration-200      // 200ms transition
  z-10              // Above other content
"

// Tooltip content
className="
  bg-gray-900       // Dark background
  text-white        // White text
  text-xs           // Small font size
  rounded-md        // Rounded corners
  py-1.5 px-3       // Comfortable padding
  whitespace-nowrap // Prevent text wrapping
  shadow-lg         // Elevation shadow
"

// Tooltip arrow
className="
  absolute          // Position relative to tooltip
  top-full          // Place at bottom of tooltip
  left-1/2          // Center horizontally
  -translate-x-1/2  // Adjust for centering
  -mt-px            // Adjust for perfect alignment
"
```

### Z-Index Management

- Tooltip: `z-10`
- Card: `z-0` (default)
- Ensures tooltip appears above adjacent cards

### Accessibility Considerations

```tsx
<div
  className="group relative ..."
  role="group"
  aria-describedby="tooltip-revenue"
>
  <div
    id="tooltip-revenue"
    className="..."
    role="tooltip"
  >
    매출 = Σ(환경부 고시가 × 수량 + 추가공사비 - 협의사항)
  </div>
</div>
```

## 📊 Implementation Code Template

### Reusable Pattern for Each Card

```tsx
{/* Card #N: [Title] */}
<div className="group relative bg-white p-2 sm:p-3 md:p-4 rounded-md md:rounded-lg shadow-sm border border-gray-200">

  {/* Tooltip */}
  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
    <div className="bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 whitespace-nowrap shadow-lg">
      [Formula Text]
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
        <div className="border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  </div>

  {/* Existing card content */}
  <div className="flex items-center gap-1.5 sm:gap-2">
    {/* ... */}
  </div>
</div>
```

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] Tooltip appears on hover for all 7 cards
- [ ] Tooltip displays correct formula for each card
- [ ] Tooltip appears above card with centered alignment
- [ ] Tooltip has smooth fade-in/out animation
- [ ] Tooltip doesn't block card interactions
- [ ] Card #1 shows different formula based on filter state

### Visual Requirements
- [ ] Tooltip has dark background (gray-900)
- [ ] Tooltip has white text
- [ ] Tooltip has small arrow pointing to card
- [ ] Tooltip has drop shadow for depth
- [ ] Formula text is readable and properly formatted

### Responsive Requirements
- [ ] Desktop: Hover shows tooltip
- [ ] Tablet: Hover shows tooltip
- [ ] Mobile: Tap shows/hides tooltip (alternative UX)
- [ ] Formula text doesn't overflow on small screens

### Accessibility Requirements
- [ ] Tooltip has proper ARIA attributes
- [ ] Tooltip is keyboard accessible (focus state)
- [ ] Screen readers can access formula text
- [ ] High contrast ratio for readability

## 🧪 Testing Checklist

### Manual Testing
- [ ] Hover over each card on desktop
- [ ] Verify formula appears and is correct
- [ ] Check tooltip positioning and alignment
- [ ] Test animation smoothness
- [ ] Verify tooltip disappears on mouse leave
- [ ] Test on different screen sizes
- [ ] Test mobile tap interaction

### Browser Testing
- [ ] Chrome (desktop)
- [ ] Safari (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (iOS - mobile)
- [ ] Chrome (Android - mobile)

### Edge Cases
- [ ] Very long formula text (if any)
- [ ] Multiple cards hovered rapidly
- [ ] Tooltip near screen edges (positioning)
- [ ] Fast mouse movement (tooltip flicker)

## 🎯 Alternative Approaches Considered

### 1. Bottom Tooltip (Below Card)
**Pros**: More space available
**Cons**: Pushes content down, less intuitive

### 2. Side Tooltip (Left/Right)
**Pros**: Doesn't overlap content
**Cons**: Limited space in 7-column layout

### 3. Modal on Click
**Pros**: More space for detailed explanation
**Cons**: Requires click, interrupts workflow

### 4. Info Icon with Tooltip
**Pros**: Explicit help indicator
**Cons**: Extra visual clutter, requires precise targeting

**Decision**: Top-positioned hover tooltip provides best balance of usability and visual cleanliness.

## 📚 Related Components

### Existing Components to Reference
- None (first tooltip implementation in project)

### Potential Future Enhancements
- Add tooltip component to `components/ui/Tooltip.tsx` for reuse
- Create tooltip variant for detailed multi-line formulas
- Add animation variants (fade, scale, slide)

## 🚀 Implementation Estimate

**Priority**: Medium
**Complexity**: Low
**Estimated Effort**: 45-60 minutes

**Breakdown**:
1. Add tooltip markup to each card (30 min)
2. Test responsive behavior (10 min)
3. Mobile touch interaction (10 min)
4. Visual polish and testing (10 min)

## 📝 Implementation Notes

### Formula Text Formatting
- Use mathematical symbols: `×` (multiplication), `÷` (division), `Σ` (sum)
- Use Korean labels for clarity: "매출", "매입", etc.
- Keep formulas concise (under 60 characters for single line)

### Performance Considerations
- `pointer-events-none`: Prevents tooltip from interfering with hover detection
- `transition-opacity`: GPU-accelerated, smooth performance
- `whitespace-nowrap`: Prevents layout shifts

### Maintenance
- Formula updates: Single location per card for easy maintenance
- Consistent structure: Same tooltip pattern for all cards
- Documentation: This design doc serves as formula reference

---

**Design Status**: ✅ Complete and Ready for Implementation
**Design Version**: 1.0
**Design Date**: 2026-02-20
**Designer**: Claude Sonnet 4.5
