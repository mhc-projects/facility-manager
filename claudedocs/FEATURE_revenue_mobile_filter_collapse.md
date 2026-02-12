# Revenue Page Mobile Filter Collapse Feature

## Overview
Implemented a collapsible filter section for the admin revenue page that allows mobile users to toggle the filter panel visibility, improving mobile UX and screen real estate management.

## Implementation Date
2026-02-12

## Changes Made

### 1. Icon Import ([app/admin/revenue/page.tsx:32-46](app/admin/revenue/page.tsx#L32-L46))
Added `ChevronDown` icon from lucide-react for the collapse indicator:
```typescript
import {
  // ... existing icons
  ChevronDown
} from 'lucide-react';
```

### 2. Hook Import ([app/admin/revenue/page.tsx:15-18](app/admin/revenue/page.tsx#L15-L18))
Added `useIsMobile` hook for mobile detection:
```typescript
import { useIsMobile } from '@/hooks/useIsMobile';
```

### 3. State Management ([app/admin/revenue/page.tsx:87-124](app/admin/revenue/page.tsx#L87-L124))
- Added `isMobile` hook usage to detect mobile viewport (< 768px)
- Added `isFilterExpanded` state (default: `true`) to track filter panel visibility

```typescript
const isMobile = useIsMobile();
const [isFilterExpanded, setIsFilterExpanded] = useState(true);
```

### 4. UI Implementation ([app/admin/revenue/page.tsx:1416-1432](app/admin/revenue/page.tsx#L1416-L1432))
Modified the filter section header to be interactive on mobile:
- Changed from `<h3>` to `<button>` for accessibility
- Added click handler that only works on mobile devices
- Added `ChevronDown` icon with rotation animation (180° when expanded)
- Applied conditional hiding to filter content on mobile when collapsed

```tsx
<button
  onClick={() => isMobile && setIsFilterExpanded(!isFilterExpanded)}
  className={`w-full ... ${isMobile ? 'cursor-pointer' : 'cursor-default'}`}
>
  <div className="flex items-center gap-1.5 sm:gap-2">
    <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
    필터 및 검색
  </div>
  {isMobile && (
    <ChevronDown
      className={`w-4 h-4 transition-transform duration-200 ${isFilterExpanded ? 'rotate-180' : ''}`}
    />
  )}
</button>
<div className={`space-y-2 sm:space-y-3 ${isMobile && !isFilterExpanded ? 'hidden' : ''}`}>
  {/* Filter content */}
</div>
```

## User Experience

### Desktop (≥768px)
- Filter section always visible
- Header is not clickable
- No chevron icon displayed
- Original behavior maintained

### Mobile (<768px)
- Filter section can be toggled
- Header becomes clickable button
- Chevron icon indicates expand/collapse state
- Smooth rotation animation (200ms)
- Default state: expanded for immediate access
- Collapsed state: filter content hidden, saves screen space

## Technical Details

### Dependencies
- **useIsMobile Hook**: Custom hook using window.innerWidth with 768px breakpoint
- **ChevronDown Icon**: lucide-react icon library
- **Tailwind CSS**: Responsive utilities and transition classes

### Responsive Breakpoint
- Mobile: `< 768px` (matches Tailwind's `md` breakpoint)
- Desktop: `≥ 768px`

### Animation
- Duration: 200ms
- Property: transform (rotate)
- States: 0° (collapsed) / 180° (expanded)

## Benefits

1. **Mobile UX**: Better use of limited screen space on mobile devices
2. **Accessibility**: Button element with proper click handling
3. **Progressive Enhancement**: Desktop experience unaffected
4. **Visual Feedback**: Clear animation indicates interactive state
5. **Performance**: No impact on existing filter functionality

## Testing

✅ Build successful without errors
✅ Type checking passed
✅ No linting issues
✅ Development server running

## Related Files
- [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx) - Main implementation
- [hooks/useIsMobile.ts](hooks/useIsMobile.ts) - Mobile detection hook
- [components/business/BusinessRevenueModal.tsx](components/business/BusinessRevenueModal.tsx) - Similar mobile pattern

## Future Enhancements (Optional)
- Consider adding collapse animation (slide down/up)
- Option to persist collapse state in localStorage
- Keyboard shortcut for toggle (e.g., Ctrl+F)
- Active filter indicator when collapsed (badge count)
