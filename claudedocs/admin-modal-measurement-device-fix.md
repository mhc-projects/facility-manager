# Admin Modal Measurement Device Display Fix

## Date: 2026-02-04

## Problem Summary

Admin Business Detail Modal의 "시설 정보 (실사 기준)" 섹션에서 측정기기 정보가 표시되지 않는 문제가 발생했습니다.

## Root Cause Analysis

### Data Flow Chain
1. **Database** → Supabase tables (`facilities_air_discharge`, `facilities_air_prevention`)
2. **API** → `/app/api/facilities-supabase/[businessName]/route.ts` → ✅ Dual field names 제공
3. **Admin Page** → `/app/admin/business/page.tsx` → ❌ **측정기기 필드 누락**
4. **Modal Component** → `/components/business/modals/BusinessDetailModal.tsx` → ✅ UI 코드 정상

### Problem Location
`/app/admin/business/page.tsx` Line 485-504에서 `facilityData`를 생성할 때:
- 기본 필드만 매핑 (name, capacity, quantity)
- **측정기기 필드를 전혀 포함하지 않음**

## Solution Implementation

### 1. API Dual Field Names (Already Implemented)
API는 두 가지 필드명 형식을 모두 제공:
- **Business 페이지용**: `dischargeCT`, `ph`, `pressure` (camelCase, short)
- **Admin 모달용**: `discharge_ct`, `ph_meter`, `differential_pressure_meter` (snake_case, full)

### 2. Admin Page facilityData Transformation Fix

#### Discharge Facilities (Line 485-494)
```typescript
discharge_facilities: (facilityApiData.facilities?.discharge || []).map((facility: any) => ({
  id: `discharge-${facility.outlet}-${facility.number}`,
  outlet_number: facility.outlet || 1,
  outlet_name: `배출구 ${facility.outlet || 1}`,
  facility_number: facility.number || 1,
  facility_name: facility.name || '배출시설',
  capacity: facility.capacity || '',
  quantity: facility.quantity || 1,
  display_name: facility.displayName || `배출구${facility.outlet}-배출시설${facility.number}`,
  // ✅ 측정기기 필드 추가
  discharge_ct: facility.discharge_ct,
  exemption_reason: facility.exemption_reason,
  remarks: facility.remarks
}))
```

#### Prevention Facilities (Line 495-504)
```typescript
prevention_facilities: (facilityApiData.facilities?.prevention || []).map((facility: any) => ({
  id: `prevention-${facility.outlet}-${facility.number}`,
  outlet_number: facility.outlet || 1,
  outlet_name: `배출구 ${facility.outlet || 1}`,
  facility_number: facility.number || 1,
  facility_name: facility.name || '방지시설',
  capacity: facility.capacity || '',
  quantity: facility.quantity || 1,
  display_name: facility.displayName || `배출구${facility.outlet}-방지시설${facility.number}`,
  // ✅ 측정기기 필드 추가
  ph_meter: facility.ph_meter,
  differential_pressure_meter: facility.differential_pressure_meter,
  temperature_meter: facility.temperature_meter,
  pump_ct: facility.pump_ct,
  fan_ct: facility.fan_ct,
  remarks: facility.remarks
}))
```

## Files Modified

1. **`/app/admin/business/page.tsx`**
   - Line 485-494: Added measurement device fields to discharge_facilities transformation
   - Line 495-504: Added measurement device fields to prevention_facilities transformation

## Testing

### Build Test
```bash
npm run build
```
✅ Result: 88 pages successfully built, no TypeScript errors

### Expected Display in Admin Modal

**배출시설 카드**:
- 시설명
- 시설번호 (orange badge: #1, #2, ...)
- 용량
- 측정기기:
  - 배출CT: X개

**방지시설 카드**:
- 시설명
- 시설번호 (cyan badge: #1, #2, ...)
- 용량
- 측정기기:
  - PH센서: X개
  - 차압계: X개
  - 온도계: X개
  - 송풍CT: X개

## Data Flow Verification

### Complete Chain
```
Database (snake_case)
  ↓
API Response (dual field names)
  ├─ Business page fields: dischargeCT, ph, pressure
  └─ Admin modal fields: discharge_ct, ph_meter, differential_pressure_meter
  ↓
Admin Page facilityData (snake_case) ✅ Now includes measurement fields
  ↓
BusinessDetailModal props
  ↓
UI Display ✅ Should now show measurement devices
```

## Related Documentation

- `/claudedocs/fix-measurement-device-display.md` - Previous dual field name strategy
- `/components/business/modals/BusinessDetailModal.tsx` - Modal UI implementation
- `/app/api/facilities-supabase/[businessName]/route.ts` - API dual field names
