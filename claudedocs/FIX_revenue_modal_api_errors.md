# Fix: Revenue Modal API Endpoint Errors

## Issue Report
**Problem**: Clicking business name in Revenue modal header caused 404 errors preventing Business detail modal from opening

**Error Messages**:
```
GET http://localhost:3000/api/business-tasks?businessName=... 404 (Not Found)
GET http://localhost:3000/api/facility-data?businessId=... 404 (Not Found)
```

## Root Cause
The `loadBusinessDetailData` function in Revenue page was calling incorrect API endpoints:
1. `/api/business-tasks` - doesn't exist (should be `/api/facility-tasks`)
2. `/api/facility-data` - doesn't exist (unnecessary for Revenue page)

## Solution Applied

### File Changed
[app/admin/revenue/page.tsx:295-331](app/admin/revenue/page.tsx#L295-L331)

### Changes Made

#### 1. Corrected API Endpoint
```typescript
// ❌ BEFORE: Wrong endpoint
fetch(`/api/business-tasks?businessName=...`)

// ✅ AFTER: Correct endpoint
fetch(`/api/facility-tasks?businessName=...`)
```

#### 2. Removed Non-existent Endpoint
```typescript
// ❌ BEFORE: Three API calls including non-existent one
const [memosResponse, tasksResponse, facilityResponse] = await Promise.all([...]);

// ✅ AFTER: Two API calls only
const [memosResponse, tasksResponse] = await Promise.all([...]);
```

#### 3. Added Enhanced Error Handling
```typescript
// Check response status
if (!memosResponse.ok) {
  console.error('❌ [MEMOS] API 오류:', memosResponse.status, memosResponse.statusText);
}
if (!tasksResponse.ok) {
  console.error('❌ [TASKS] API 오류:', tasksResponse.status, tasksResponse.statusText);
}
```

#### 4. Added Cache Busting
```typescript
// Timestamp for cache busting
const timestamp = Date.now();

fetch(`/api/business-memos?businessId=${business.id}&_t=${timestamp}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Cache-Control': 'no-cache'
  }
})
```

#### 5. Improved Logging
```typescript
console.log('📞 [API] 요청 시작:', {
  businessId: business.id,
  businessName: businessName
});

console.log('📡 [API] 응답 상태:', {
  memos: memosResponse.status,
  tasks: tasksResponse.status
});
```

## API Endpoint Reference

### Correct Endpoints Used by Business Page
- **Memos**: `/api/business-memos?businessId={id}`
- **Tasks**: `/api/facility-tasks?businessName={name}`

### Response Structure
```typescript
// Memos API response
{
  success: true,
  data: BusinessMemo[]
}

// Tasks API response
{
  success: true,
  data: {
    tasks: BusinessTask[]
  }
}
```

## Testing Checklist

### Before Testing
- [x] Build completed successfully
- [x] TypeScript compilation passed
- [x] No linting errors

### Manual Testing Steps
1. **Start Dev Server**
   ```bash
   npm run dev
   ```

2. **Clear Browser Cache**
   - Open DevTools (F12)
   - Network tab → Check "Disable cache"
   - Hard refresh (Cmd+Shift+R)

3. **Test Flow**
   - Navigate to `/admin/revenue`
   - Click any business row → Revenue modal opens
   - Click 사업장명 in modal header
   - **Expected**: Business detail modal overlays on top
   - **Check Console**: Should see successful API responses

### Expected Console Output
```
🎯 [DEBUG] handleBusinessNameClick 호출됨
🎯 [REVENUE-PAGE] handleOpenBusinessDetail 호출됨!
🔗 [BUSINESS-DETAIL] 모달 오픈 요청: [사업장명]
🔄 [BUSINESS-DETAIL] 데이터 로딩 시작: [사업장명]
📞 [API] 요청 시작: {businessId: "...", businessName: "..."}
📡 [API] 응답 상태: {memos: 200, tasks: 200}
✅ [BUSINESS-DETAIL] 데이터 로딩 완료: {memos: X, tasks: Y}
```

### Verify Behavior
- [ ] No 404 errors in console
- [ ] No page navigation occurs
- [ ] Business detail modal opens above Revenue modal
- [ ] Memos and tasks load correctly
- [ ] Can close Business detail modal and return to Revenue modal

## Related Files

### Implementation Files
- [app/admin/revenue/page.tsx](app/admin/revenue/page.tsx) - Fixed API endpoints
- [components/business/BusinessRevenueModal.tsx](components/business/BusinessRevenueModal.tsx) - Callback implementation
- [components/business/modals/BusinessDetailModal.tsx](components/business/modals/BusinessDetailModal.tsx) - Z-index increased to z-60

### Documentation Files
- [claudedocs/IMPLEMENTATION_modal_overlay_phase3.md](claudedocs/IMPLEMENTATION_modal_overlay_phase3.md) - Full implementation guide
- [claudedocs/DEBUGGING_modal_overlay_issue.md](claudedocs/DEBUGGING_modal_overlay_issue.md) - Troubleshooting guide
- [claudedocs/ANALYSIS_modal_overlay_approach.md](claudedocs/ANALYSIS_modal_overlay_approach.md) - Design analysis

## Build Status
✅ Build completed successfully
✅ No TypeScript errors
✅ No compilation errors
✅ Revenue page compiled: `.next/server/app/admin/revenue/page.js` (77KB)

## Next Steps
1. User should test the functionality with cache cleared
2. Verify Business detail modal opens correctly
3. Check all memos and tasks display properly
4. Report any remaining issues

## Rollback Plan
If issues persist, the changes can be reverted by:
```bash
git diff HEAD app/admin/revenue/page.tsx
git checkout HEAD -- app/admin/revenue/page.tsx
```

## Summary
Fixed 404 API endpoint errors by:
- ✅ Changed `/api/business-tasks` → `/api/facility-tasks`
- ✅ Removed non-existent `/api/facility-data` call
- ✅ Added cache busting with timestamps
- ✅ Enhanced error handling and logging
- ✅ Build verification completed

**Status**: Ready for testing
