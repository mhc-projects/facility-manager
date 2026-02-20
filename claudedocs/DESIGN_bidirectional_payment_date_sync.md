# Design: Bidirectional Payment Date & Risk Level Sync with Inline Editing

## 📋 Overview

**Purpose**: Enable bidirectional synchronization of payment dates and risk levels between admin/revenue table and admin/business modal with inline editing
**Scope**:
- admin/revenue table inline editing
- admin/business modal schedule management section
- Real-time cache invalidation
- Optimistic UI updates

**Date**: 2026-02-20
**Status**: Design Phase

## ⚡ Critical Requirement: Immediate Cache Updates

**Problem Statement**:
When users edit payment dates or risk levels in the admin/revenue table, the cache must update **immediately** with the new values, not just be invalidated. This ensures the UI always displays the latest data without requiring a page refresh or database re-fetch.

**Current Limitation**:
- Risk level updates: Cache is **invalidated** (deleted), not updated
- Payment dates: No inline editing exists yet

**Required Behavior**:
```
User changes value → UI updates → Cache updates → API saves → Done
                      ↓             ↓
                   Instant       Instant (not just deleted)
```

**Solution Summary**:
- Implement `CacheManager.updateBusinessField()` to modify cached data in-place
- Apply to both payment date and risk level updates
- Three-layer sync: UI State → Session Cache → Database

## 🎯 Requirements

### Functional Requirements
1. **Bidirectional Sync**: Changes in either location (revenue table OR business modal) must sync to the other
2. **Inline Editing**: Click payment date cell in revenue table → date picker appears
3. **⚡ CRITICAL: Immediate Cache Update**: When payment date or risk level changes, cache MUST update **immediately** to always display latest data (not just invalidate)
4. **Optimistic UI**: UI updates before server response for better UX
5. **Rollback on Failure**: Revert to previous value if API call fails

### UX Requirements
- **Space-Constrained Table**: Use popover/modal date picker (not inline input)
- **Risk Level**: Already has inline buttons (상/중/하) - keep existing UX
- **Payment Date**: Click cell → calendar popover appears → select date → auto-save

## 🏗️ Current Architecture Analysis

### Existing Implementation

#### 1. Payment Date (입금예정일)
**Current State**:
- **admin/business modal**: Has DateInput component ([page.tsx:5203-5206](app/admin/business/page.tsx#L5203-L5206))
- **admin/revenue table**: Display-only, no editing ([page.tsx:2328-2334](app/admin/revenue/page.tsx#L2328-L2334))
- **Data field**: `payment_scheduled_date` (string, YYYY-MM-DD format)

#### 2. Risk Level (위험도)
**Current State**:
- ✅ **admin/revenue table**: Has inline editing with optimistic updates ([page.tsx:234-256](app/admin/revenue/page.tsx#L234-L256))
- ✅ **API endpoint**: `/api/business-risk/[id]` (PATCH)
- ✅ **Cache invalidation**: sessionStorage cleared on update
- **Data field**: `risk_level` (string: '상' | '중' | '하' | null)

**Issue**: Payment date NOT editable in revenue table, only in business modal

### Current Cache Strategy

**Location**: [app/admin/revenue/page.tsx:258-265](app/admin/revenue/page.tsx#L258-L265)

```typescript
const CACHE_KEYS = {
  PRICING: 'revenue_pricing_cache',
  BUSINESSES: 'revenue_businesses_cache',
  CALCULATIONS: 'revenue_calculations_cache',
  CACHE_TIME: 'revenue_cache_time'
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
```

**Cache Invalidation** (Risk Level):
```typescript
sessionStorage.removeItem('revenue_businesses_cache');
sessionStorage.removeItem('revenue_cache_time');
```

## 🎨 Proposed Solution

### Architecture: Optimistic Update Pattern with Immediate Cache Sync

```
┌─────────────────────────────────────────────────────────────┐
│                    User Action                               │
│  (Click payment date cell OR change in business modal)       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         1. Optimistic UI Update (Immediate)                  │
│  • Update local state (paymentDateMap / formData)            │
│  • UI reflects change instantly                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         2. ⚡ IMMEDIATE Cache Update (NEW)                   │
│  • CacheManager.updateBusinessField()                        │
│  • sessionStorage cache updated with new value               │
│  • Next render shows latest data from cache                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         3. API Call (Background)                             │
│  PATCH /api/businesses/[id]/payment-date                     │
│  { payment_scheduled_date: "2026-03-15" }                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
       Success                  Failure
            │                       │
            ▼                       ▼
┌─────────────────────┐  ┌────────────────────────┐
│ 4a. Broadcast Sync  │  │ 4b. Rollback All       │
│ • Cross-tab event   │  │ • UI: old value        │
│ • Modal sync event  │  │ • Cache: old value     │
│ • Database: synced  │  │ • Show error toast     │
└─────────────────────┘  └────────────────────────┘
```

**Key Difference from Previous Design**:
- ❌ **Old**: Cache only invalidated (deleted) → next load fetches from DB
- ✅ **New**: Cache immediately updated with new value → instant display of latest data

### Component Design

#### 1. Payment Date Editor Component

**New Component**: `PaymentDateCell.tsx`

```tsx
// components/admin/PaymentDateCell.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';

interface PaymentDateCellProps {
  businessId: string;
  currentDate: string | null;
  onUpdate: (businessId: string, date: string | null) => Promise<void>;
  readonly?: boolean;
}

export function PaymentDateCell({ businessId, currentDate, onUpdate, readonly = false }: PaymentDateCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localDate, setLocalDate] = useState(currentDate);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleDateSelect = async (date: string | null) => {
    setLocalDate(date);
    setIsOpen(false);
    await onUpdate(businessId, date);
  };

  if (readonly) {
    return (
      <div className="text-xs text-gray-600">
        {currentDate || '-'}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Display/Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-1 text-xs text-left hover:bg-teal-50 rounded transition-colors flex items-center gap-1"
      >
        <Calendar className="w-3 h-3 text-teal-600" />
        <span className={localDate ? 'text-teal-700 font-medium' : 'text-gray-400'}>
          {localDate || '-'}
        </span>
      </button>

      {/* Date Picker Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3"
        >
          <DatePicker
            value={localDate}
            onChange={handleDateSelect}
            minDate={new Date()}
          />
        </div>
      )}
    </div>
  );
}
```

#### 2. Reusable Date Picker Component

**Enhancement**: Extract existing DateInput logic into reusable DatePicker

```tsx
// components/ui/DatePicker.tsx
'use client';

interface DatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  minDate?: Date;
  maxDate?: Date;
}

export function DatePicker({ value, onChange, minDate, maxDate }: DatePickerProps) {
  // Calendar grid implementation
  // - Month/Year navigation
  // - Day selection
  // - Min/max date constraints
  // - "Clear" button for null value

  return (
    <div className="w-64">
      {/* Month/Year selector */}
      {/* Calendar grid */}
      {/* Action buttons (Clear, Today) */}
    </div>
  );
}
```

**Alternative**: Use existing library like `react-day-picker` or `date-fns`

### State Management

#### Revenue Table State

```typescript
// app/admin/revenue/page.tsx

// New state for payment dates (similar to riskMap pattern)
const [paymentDateMap, setPaymentDateMap] = useState<Record<string, string | null>>({});

// Initialize from businesses data
useEffect(() => {
  const initialDates = businesses.reduce((acc, b) => {
    acc[b.id] = b.payment_scheduled_date || null;
    return acc;
  }, {} as Record<string, string | null>);
  setPaymentDateMap(initialDates);
}, [businesses]);

// Update handler (optimistic)
const handlePaymentDateUpdate = async (businessId: string, date: string | null) => {
  const previousDate = paymentDateMap[businessId] ?? null;

  // 1. Optimistic update
  setPaymentDateMap(prev => ({ ...prev, [businessId]: date }));

  try {
    // 2. API call
    const response = await fetch(`/api/businesses/${businessId}/payment-date`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ payment_scheduled_date: date }),
    });

    if (!response.ok) throw new Error('Payment date update failed');

    // 3. Cache invalidation
    invalidateBusinessCache();

    // 4. Broadcast change (for business modal sync)
    window.dispatchEvent(new CustomEvent('payment-date-updated', {
      detail: { businessId, date }
    }));

  } catch (error) {
    console.error('[handlePaymentDateUpdate] Error:', error);
    // Rollback on failure
    setPaymentDateMap(prev => ({ ...prev, [businessId]: previousDate }));
    // Show error toast
  }
};
```

#### Business Modal State

```typescript
// app/admin/business/page.tsx

// Listen for external updates
useEffect(() => {
  const handleExternalUpdate = (e: CustomEvent) => {
    if (e.detail.businessId === formData.id) {
      setFormData(prev => ({
        ...prev,
        payment_scheduled_date: e.detail.date
      }));
    }
  };

  window.addEventListener('payment-date-updated', handleExternalUpdate as EventListener);
  return () => window.removeEventListener('payment-date-updated', handleExternalUpdate as EventListener);
}, [formData.id]);

// On form submit, broadcast change
const handleSave = async () => {
  // ... existing save logic ...

  // Broadcast payment date change
  window.dispatchEvent(new CustomEvent('payment-date-updated', {
    detail: {
      businessId: formData.id,
      date: formData.payment_scheduled_date
    }
  }));
};
```

### API Design

#### New Endpoint: Update Payment Date

**Path**: `app/api/businesses/[id]/payment-date/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { payment_scheduled_date } = await request.json();

    // Validate date format (YYYY-MM-DD or null)
    if (payment_scheduled_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(payment_scheduled_date)) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('businesses')
      .update({ payment_scheduled_date })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[PATCH /payment-date] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update payment date' },
      { status: 500 }
    );
  }
}
```

#### Enhancement: Batch Update Endpoint (Optional)

For updating multiple businesses at once:

```typescript
// POST /api/businesses/batch-update-payment-dates
{
  updates: [
    { id: "uuid1", payment_scheduled_date: "2026-03-15" },
    { id: "uuid2", payment_scheduled_date: null }
  ]
}
```

### Cache Invalidation Strategy

#### Immediate Cache Update on Value Change

**Critical Requirement**: When payment date or risk level changes, cache MUST update immediately to display latest data.

**Current Problem**:
- Cache only invalidates (deleted)
- Next load fetches from database
- UI may show stale data if cache not refreshed

**Solution**: Immediate In-Memory Cache Update

```typescript
// utils/cache-manager.ts
export const CacheManager = {
  keys: {
    PRICING: 'revenue_pricing_cache',
    BUSINESSES: 'revenue_businesses_cache',
    CALCULATIONS: 'revenue_calculations_cache',
    CACHE_TIME: 'revenue_cache_time',
  },

  // ENHANCED: Update specific field in cached data
  updateBusinessField(businessId: string, field: string, value: any) {
    try {
      const cached = sessionStorage.getItem(this.keys.BUSINESSES);
      if (!cached) return;

      const businesses = JSON.parse(cached);
      const index = businesses.findIndex((b: any) => b.id === businessId);

      if (index !== -1) {
        businesses[index][field] = value;
        sessionStorage.setItem(this.keys.BUSINESSES, JSON.stringify(businesses));
        console.log(`✅ Cache updated: ${field} for business ${businessId}`);
      }
    } catch (error) {
      console.error('[CacheManager.updateBusinessField] Error:', error);
    }
  },

  // ENHANCED: Update multiple fields at once
  updateBusinessFields(businessId: string, fields: Record<string, any>) {
    try {
      const cached = sessionStorage.getItem(this.keys.BUSINESSES);
      if (!cached) return;

      const businesses = JSON.parse(cached);
      const index = businesses.findIndex((b: any) => b.id === businessId);

      if (index !== -1) {
        businesses[index] = { ...businesses[index], ...fields };
        sessionStorage.setItem(this.keys.BUSINESSES, JSON.stringify(businesses));
        console.log(`✅ Cache updated: ${Object.keys(fields).join(', ')} for business ${businessId}`);
      }
    } catch (error) {
      console.error('[CacheManager.updateBusinessFields] Error:', error);
    }
  },

  invalidateAll() {
    Object.values(this.keys).forEach(key => {
      sessionStorage.removeItem(key);
    });
  },

  invalidateBusinesses() {
    sessionStorage.removeItem(this.keys.BUSINESSES);
    sessionStorage.removeItem(this.keys.CACHE_TIME);
  },

  invalidatePricing() {
    sessionStorage.removeItem(this.keys.PRICING);
    sessionStorage.removeItem(this.keys.CACHE_TIME);
  },

  // Broadcast to other tabs/windows
  broadcastInvalidation() {
    localStorage.setItem('cache-invalidate-timestamp', Date.now().toString());
  },

  // ENHANCED: Broadcast specific field update
  broadcastFieldUpdate(businessId: string, field: string, value: any) {
    const update = {
      businessId,
      field,
      value,
      timestamp: Date.now()
    };
    localStorage.setItem('cache-field-update', JSON.stringify(update));
  }
};
```

#### Enhanced Update Handlers with Immediate Cache Sync

**Payment Date Update (Enhanced)**:
```typescript
const handlePaymentDateUpdate = async (businessId: string, date: string | null) => {
  const previousDate = paymentDateMap[businessId] ?? null;

  // 1. Optimistic UI update
  setPaymentDateMap(prev => ({ ...prev, [businessId]: date }));

  // 2. IMMEDIATE cache update (NEW)
  CacheManager.updateBusinessField(businessId, 'payment_scheduled_date', date);

  try {
    // 3. API call
    const response = await fetch(`/api/businesses/${businessId}/payment-date`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ payment_scheduled_date: date }),
    });

    if (!response.ok) throw new Error('Payment date update failed');

    // 4. Broadcast to other tabs
    CacheManager.broadcastFieldUpdate(businessId, 'payment_scheduled_date', date);

    // 5. CustomEvent for modal sync
    window.dispatchEvent(new CustomEvent('payment-date-updated', {
      detail: { businessId, date }
    }));

  } catch (error) {
    console.error('[handlePaymentDateUpdate] Error:', error);

    // Rollback both UI and cache
    setPaymentDateMap(prev => ({ ...prev, [businessId]: previousDate }));
    CacheManager.updateBusinessField(businessId, 'payment_scheduled_date', previousDate);

    // Show error toast
  }
};
```

**Risk Level Update (Enhanced)**:
```typescript
const handleRiskUpdate = (businessId: string, risk: '상' | '중' | '하' | null) => {
  const previousRisk = riskMap[businessId] ?? null;

  // 1. Optimistic UI update
  setRiskMap(prev => ({ ...prev, [businessId]: risk }));

  // 2. IMMEDIATE cache update (NEW)
  CacheManager.updateBusinessField(businessId, 'risk_level', risk);

  // 3. API call (background)
  fetch(`/api/business-risk/${businessId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ risk }),
  }).then(response => {
    if (!response.ok) throw new Error('위험도 업데이트 실패');

    // 4. Broadcast to other tabs (NEW)
    CacheManager.broadcastFieldUpdate(businessId, 'risk_level', risk);

  }).catch(error => {
    console.error('[handleRiskUpdate] 오류:', error);

    // Rollback both UI and cache
    setRiskMap(prev => ({ ...prev, [businessId]: previousRisk }));
    CacheManager.updateBusinessField(businessId, 'risk_level', previousRisk);
  });
};
```

#### Cross-Tab Field-Level Synchronization

```typescript
// In revenue page
useEffect(() => {
  const handleStorageChange = (e: StorageEvent) => {
    // Full cache invalidation (existing)
    if (e.key === 'cache-invalidate-timestamp') {
      loadBusinessesData();
      return;
    }

    // Field-level update (NEW)
    if (e.key === 'cache-field-update' && e.newValue) {
      try {
        const update = JSON.parse(e.newValue);
        const { businessId, field, value } = update;

        // Update local state maps
        if (field === 'payment_scheduled_date') {
          setPaymentDateMap(prev => ({ ...prev, [businessId]: value }));
        } else if (field === 'risk_level') {
          setRiskMap(prev => ({ ...prev, [businessId]: value }));
        }

        // Update cache in this tab too
        CacheManager.updateBusinessField(businessId, field, value);

      } catch (error) {
        console.error('[handleStorageChange] Field update error:', error);
      }
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

#### Cache Consistency Guarantees

**Three-Layer Synchronization**:

```
┌─────────────────────────────────────────────────┐
│ Layer 1: UI State (Optimistic - Immediate)      │
│  • paymentDateMap / riskMap                      │
│  • Updates: Instantly on user action            │
│  • Source: Local React state                     │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ Layer 2: Session Cache (Immediate Sync)         │
│  • sessionStorage.revenue_businesses_cache       │
│  • Updates: Immediately after UI state           │
│  • Source: CacheManager.updateBusinessField()   │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ Layer 3: Database (Eventual - Background)       │
│  • Supabase businesses table                     │
│  • Updates: After API call succeeds              │
│  • Source: API endpoint PATCH request            │
└─────────────────────────────────────────────────┘

Rollback Flow (on API failure):
Layer 3 ✗ Fails → Layer 2 ← Reverts → Layer 1 ← Reverts
```

**Consistency Scenarios**:

| Scenario | UI State | Cache | Database | Result |
|----------|----------|-------|----------|--------|
| **Success** | Updated | Updated | Updated | ✅ All synced |
| **API Failure** | Reverted | Reverted | Unchanged | ✅ Consistent (old value) |
| **Cache Write Fail** | Updated | Unchanged | Updated | ⚠️ Cache stale until refresh |
| **Network Error** | Reverted | Reverted | Unchanged | ✅ Consistent (old value) |

**Cache Staleness Detection**:
```typescript
// Validate cache freshness before use
function isCacheValid(): boolean {
  const cacheTime = sessionStorage.getItem(CACHE_KEYS.CACHE_TIME);
  if (!cacheTime) return false;

  const age = Date.now() - parseInt(cacheTime);
  return age < CACHE_DURATION; // 5 minutes
}

// On data load, verify cache integrity
function loadBusinessesData() {
  if (!isCacheValid()) {
    // Cache expired - full refresh from database
    CacheManager.invalidateAll();
    fetchFromDatabase();
  } else {
    // Use cache
    const cached = CacheManager.getBusinesses();
    setBusinesses(cached);
  }
}
```

## 🔄 Data Flow Diagrams

### Scenario 1: Edit Payment Date in Revenue Table

```
User clicks payment date cell
  ↓
PaymentDateCell opens calendar popover
  ↓
User selects "2026-03-15"
  ↓
handlePaymentDateUpdate() called
  ↓
1. paymentDateMap[businessId] = "2026-03-15" (optimistic)
  ↓
2. PATCH /api/businesses/{id}/payment-date
  ↓
3. sessionStorage.clear() (cache invalidation)
  ↓
4. CustomEvent 'payment-date-updated' dispatched
  ↓
5. Business modal (if open) receives event → updates formData
```

### Scenario 2: Edit Payment Date in Business Modal

```
User changes payment date in modal schedule section
  ↓
formData.payment_scheduled_date = "2026-03-20"
  ↓
User clicks "저장" button
  ↓
PATCH /api/businesses/{id} (full business update)
  ↓
1. Database updated
  ↓
2. CustomEvent 'payment-date-updated' dispatched
  ↓
3. Revenue table receives event → updates paymentDateMap
  ↓
4. sessionStorage.clear() (cache invalidation)
  ↓
5. Next page load fetches fresh data
```

### Scenario 3: Risk Level Update (Existing)

```
User clicks risk button (상/중/하)
  ↓
handleRiskUpdate() called
  ↓
1. riskMap[businessId] = '상' (optimistic)
  ↓
2. PATCH /api/business-risk/{id}
  ↓
3. sessionStorage.clear() (cache invalidation)
  ↓
(No modal sync needed - risk only edited in revenue table)
```

## 🎨 UI/UX Enhancements

### Payment Date Cell States

| State | Visual | Interaction |
|-------|--------|-------------|
| **Empty** | Gray "-" text | Click → Calendar opens |
| **Has Date** | Teal text "2026-03-15" | Click → Calendar opens with date selected |
| **Hover** | Light teal background | Shows edit affordance |
| **Editing** | Calendar popover open | Select date or click outside to cancel |
| **Saving** | Spinner icon | Brief loading state |
| **Error** | Red border, revert value | Error toast notification |

### Date Picker Features

**Core Features**:
- Month/Year navigation
- Day grid (Sun-Sat)
- Today button
- Clear button (set to null)
- Min/max date constraints

**Calendar Layout**:
```
┌─────────────────────────────┐
│  ◀  2026년 3월  ▶           │
├─────────────────────────────┤
│ 일 월 화 수 목 금 토         │
│                1  2  3  4  5 │
│ 6  7  8  9 10 11 12          │
│13 14 [15] 16 17 18 19       │  ← 15일 selected
│20 21 22 23 24 25 26          │
│27 28 29 30 31                │
├─────────────────────────────┤
│ [Clear] [Today] [Cancel]    │
└─────────────────────────────┘
```

### Risk Level Buttons (Existing - Keep As-Is)

```
┌─────────────────┐
│ [상] [중] [하]   │  ← Inline button group
└─────────────────┘
```

## 📊 Performance Considerations

### Optimistic Updates
- **Benefit**: Instant UI feedback (no server wait)
- **Trade-off**: Must handle rollback on failure

### Cache Strategy
- **Session Storage**: Fast, tab-scoped, 5MB limit
- **Invalidation**: Immediate on update, prevents stale data
- **Fallback**: If cache full, degrade to API-only mode

### Virtual Scrolling
- Existing: `@tanstack/react-virtual` for 1000+ rows
- New cells add minimal overhead (same pattern as risk buttons)

## 🔒 Security Considerations

### Authorization
```typescript
// Middleware check in API route
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Row-level security (RLS) in Supabase
// Only users with proper role can update businesses
```

### Input Validation
- Date format: `/^\d{4}-\d{2}-\d{2}$/`
- Risk level: Enum validation `['상', '중', '하', null]`
- SQL injection: Prevented by Supabase parameterized queries

### Rate Limiting (Recommended)
```typescript
// utils/rate-limiter.ts
const updateLimiter = new Map<string, number>();

export function checkRateLimit(userId: string, maxPerMinute = 60): boolean {
  const now = Date.now();
  const count = updateLimiter.get(userId) || 0;

  if (count >= maxPerMinute) return false;

  updateLimiter.set(userId, count + 1);
  setTimeout(() => updateLimiter.delete(userId), 60000);

  return true;
}
```

## ✅ Implementation Checklist

### Phase 1: Payment Date Inline Editing
- [ ] Create `PaymentDateCell` component with calendar popover
- [ ] Add `paymentDateMap` state to revenue page
- [ ] Implement `handlePaymentDateUpdate` with optimistic updates
- [ ] Create API endpoint `/api/businesses/[id]/payment-date`
- [ ] Add cache invalidation on update
- [ ] Test inline editing in revenue table

### Phase 2: Bidirectional Sync
- [ ] Add `CustomEvent` broadcasting in revenue table
- [ ] Add event listener in business modal
- [ ] Add event broadcasting in business modal save
- [ ] Add event listener in revenue table
- [ ] Test: Edit in table → verify modal updates
- [ ] Test: Edit in modal → verify table updates

### Phase 3: Cache & Performance (CRITICAL)
- [ ] ⚡ Implement `CacheManager.updateBusinessField()` for immediate cache updates
- [ ] ⚡ Update payment date handler to sync cache immediately (not just invalidate)
- [ ] ⚡ Update risk level handler to sync cache immediately (not just invalidate)
- [ ] Add `CacheManager.broadcastFieldUpdate()` for cross-tab field-level sync
- [ ] Add cross-tab sync listener for `cache-field-update` events
- [ ] Add error handling and rollback logic (UI + Cache)
- [ ] Add loading states and success/error toasts
- [ ] Implement cache staleness detection and validation
- [ ] Performance test with 1000+ rows

### Phase 4: Polish & Edge Cases
- [ ] Add keyboard navigation (Tab, Enter, Esc)
- [ ] Add accessibility (ARIA labels, screen reader support)
- [ ] Handle date picker positioning near screen edges
- [ ] Add rate limiting on API endpoints
- [ ] Write integration tests

## 🔮 Future Enhancements

### Bulk Edit Mode
Allow selecting multiple rows and setting same payment date:
```
[✓] Business A
[✓] Business B
[✓] Business C
[Set Payment Date: 2026-03-15] → Updates all 3
```

### Date Range Filters
Add quick filters for payment dates:
- "This Week"
- "This Month"
- "Overdue"
- "Custom Range"

### Calendar Heatmap
Visual indicator of payment concentration:
```
March 2026
┌───────────────────────────┐
│ 1  2  3  4  5  6  7       │
│ ●  ●  ○  ●●● ○  ○  ○      │ ← Dot size = payment count
└───────────────────────────┘
```

### Automated Reminders
- Email notification 3 days before payment date
- Dashboard badge for upcoming payments
- SMS integration for urgent cases

---

**Design Status**: ✅ Complete - Ready for Review
**Next Step**: User approval → Implementation
**Designer**: Claude Sonnet 4.5
**Date**: 2026-02-20
