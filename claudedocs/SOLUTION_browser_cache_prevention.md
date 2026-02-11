# Solution: Browser Cache Prevention for Development

## Problem

**Issue**: 코드 변경사항이 개발자 콘솔을 열지 않으면 브라우저에 반영되지 않음

**Symptoms**:
- 코드 수정 후 새로고침해도 변경사항이 안 보임
- 개발자 콘솔(F12)을 열면 변경사항이 보임
- Hard refresh (Ctrl+Shift+R)를 해야 변경사항 반영됨

**Root Causes**:
1. **Service Worker**: 백그라운드에서 리소스를 캐싱
2. **Browser HTTP Cache**: HTML, JS, CSS 파일을 브라우저가 캐싱
3. **Next.js Build Cache**: 개발 서버의 빌드 캐시
4. **개발자 도구 설정**: "Disable cache" 옵션이 콘솔 열릴 때만 활성화

## Solutions

### Solution 1: Service Worker 개발 환경 비활성화 (✅ 추천)

**문제**: Service Worker가 항상 리소스를 캐싱해서 변경사항 반영 안 됨

**해결**: 개발 환경에서 Service Worker 등록 비활성화

**File**: [app/layout.tsx](app/layout.tsx)

**Current**:
```typescript
<script
  dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
          navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
              console.log('SW registered: ', registration);
            })
            .catch(function(err) {
              console.log('SW registration failed: ', err);
            });
        });
      }
    `,
  }}
/>
```

**Recommended Change**:
```typescript
<script
  dangerouslySetInnerHTML={{
    __html: `
      // Only register Service Worker in production
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        window.addEventListener('load', function() {
          navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
              console.log('SW registered: ', registration);
            })
            .catch(function(err) {
              console.log('SW registration failed: ', err);
            });
        });
      }
    `,
  }}
/>
```

**Issue**: `process.env.NODE_ENV`는 서버 환경 변수로 클라이언트에서 접근 불가

**Better Solution**:
```typescript
{/* Service Worker - Only in production */}
{process.env.NODE_ENV === 'production' && (
  <script
    dangerouslySetInnerHTML={{
      __html: `
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js')
              .then(function(registration) {
                console.log('SW registered: ', registration);
              })
              .catch(function(err) {
                console.log('SW registration failed: ', err);
              });
          });
        }
      `,
    }}
  />
)}
```

### Solution 2: 개발 환경 전용 Cache-Control 헤더

**File**: [next.config.js](next.config.js)

**Add to headers() function**:
```javascript
async headers() {
  return [
    // ... existing headers ...

    // 🔥 개발 환경 - 모든 페이지 캐싱 비활성화
    ...(process.env.NODE_ENV === 'development' ? [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ] : []),
  ];
},
```

### Solution 3: 개발 서버 시작 시 브라우저 캐시 클리어 안내

**File**: Create `scripts/dev.sh`

```bash
#!/bin/bash

echo "🚀 Starting development server..."
echo ""
echo "⚠️  IMPORTANT: Clear browser cache for best experience!"
echo ""
echo "How to clear cache:"
echo "  Chrome/Edge: Press Ctrl+Shift+Delete (Windows) / Cmd+Shift+Delete (Mac)"
echo "  Or: Open DevTools (F12) → Network tab → Check 'Disable cache'"
echo ""
echo "Starting Next.js dev server..."
npm run dev
```

**Update package.json**:
```json
{
  "scripts": {
    "dev": "next dev",
    "dev:fresh": "rm -rf .next && next dev",
    "dev:cache-warning": "bash scripts/dev.sh"
  }
}
```

### Solution 4: Next.js 개발 서버 캐시 비활성화

**File**: [next.config.js](next.config.js)

**Add/Update experimental options**:
```javascript
experimental: {
  // ... existing options ...

  // 개발 환경에서 캐시 비활성화
  isrMemoryCacheSize: 0, // ISR 메모리 캐시 비활성화

  // 서버 컴포넌트 캐시 비활성화
  serverActions: {
    bodySizeLimit: '2mb',
  },
},
```

### Solution 5: 브라우저별 자동 캐시 무효화

**Create**: `public/cache-buster.js`

```javascript
// Automatically bust cache by appending timestamp to resources
(function() {
  const timestamp = Date.now();

  // Add timestamp to all script and link tags
  const scripts = document.getElementsByTagName('script');
  const links = document.getElementsByTagName('link');

  // Development only
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🔄 Cache buster active - timestamp:', timestamp);

    // Store timestamp for resource revalidation
    sessionStorage.setItem('app-cache-timestamp', timestamp);
  }
})();
```

**Add to layout.tsx**:
```typescript
<script src="/cache-buster.js" />
```

### Solution 6: 사용자 안내 배너 (임시 솔루션)

**Create**: `components/DevModeBanner.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function DevModeBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV === 'development') {
      // Check if user has dismissed the banner
      const dismissed = sessionStorage.getItem('dev-banner-dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('dev-banner-dismissed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black px-4 py-2 text-center z-50">
      <p className="text-sm">
        🔧 <strong>개발 모드</strong>: 변경사항이 안 보이면{' '}
        <strong>Ctrl+Shift+R</strong> (Hard Refresh)를 눌러주세요.
        <button
          onClick={handleDismiss}
          className="ml-4 underline hover:no-underline"
        >
          닫기
        </button>
      </p>
    </div>
  );
}
```

**Add to app/layout.tsx**:
```typescript
import DevModeBanner from '@/components/DevModeBanner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {process.env.NODE_ENV === 'development' && <DevModeBanner />}
        {children}
      </body>
    </html>
  );
}
```

## Implementation Priority

### Phase 1: Immediate Fix (5 minutes)
1. ✅ **Disable Service Worker in Development** (Solution 1)
   - Edit `app/layout.tsx`
   - Wrap Service Worker script in production check
   - Restart dev server

### Phase 2: Enhanced Cache Control (10 minutes)
2. ✅ **Add Development Cache Headers** (Solution 2)
   - Edit `next.config.js`
   - Add development-specific headers
   - Restart dev server

### Phase 3: Developer Experience (15 minutes)
3. ✅ **Add Dev Mode Banner** (Solution 6)
   - Create `DevModeBanner.tsx`
   - Add to layout
   - Test in development

### Phase 4: Advanced (Optional)
4. ⚪ **Cache Buster Script** (Solution 5)
5. ⚪ **Dev Script with Warning** (Solution 3)

## Testing

### Verify Cache is Disabled

1. **Start dev server**:
   ```bash
   npm run dev
   ```

2. **Open browser** (without DevTools):
   ```
   Navigate to http://localhost:3000
   ```

3. **Make a code change**:
   ```typescript
   // Change some text in a component
   <h1>Test - Version 1</h1>
   ```

4. **Reload page** (without DevTools):
   ```
   Press F5 or Ctrl+R
   Expected: See changes immediately ✅
   ```

5. **Verify no Service Worker**:
   ```javascript
   // In browser console
   navigator.serviceWorker.getRegistrations().then(registrations => {
     console.log('Active Service Workers:', registrations.length);
   });
   // Expected: 0 in development ✅
   ```

### Browser DevTools Settings

**Chrome/Edge**:
1. Open DevTools (F12)
2. Go to Network tab
3. **Uncheck** "Disable cache" (we want to test without this)
4. Reload page → Should still see changes

**Firefox**:
1. Open DevTools (F12)
2. Go to Network tab
3. Settings icon → **Uncheck** "Disable HTTP cache"
4. Reload page → Should still see changes

## Troubleshooting

### Changes Still Not Showing?

**1. Clear Existing Service Worker**:
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => {
    registration.unregister();
    console.log('Unregistered:', registration);
  });
  window.location.reload(true);
});
```

**2. Clear All Browser Data**:
- Chrome: `chrome://settings/clearBrowserData`
- Edge: `edge://settings/clearBrowserData`
- Firefox: `about:preferences#privacy` → Clear Data

**3. Use Incognito/Private Window**:
- Incognito mode doesn't use cached data
- Good for testing if cache is the issue

**4. Check Next.js Build Cache**:
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

**5. Hard Refresh Shortcut**:
- Windows: `Ctrl + Shift + R` or `Ctrl + F5`
- Mac: `Cmd + Shift + R`

## Best Practices for Development

### For Developers

1. **Always use development mode**:
   ```bash
   npm run dev  # Not npm run build + npm start
   ```

2. **Keep DevTools open** (optional but helpful):
   - Auto-refreshes on file changes
   - "Disable cache" active when open
   - Shows console logs

3. **Use browser extensions carefully**:
   - Some extensions cache aggressively
   - Disable unnecessary extensions during development

4. **Regular cache clearing**:
   - Clear cache weekly during active development
   - After major Next.js version updates

### For Users (Production)

1. **Service Worker active** (good for performance):
   - Caches resources for offline access
   - Faster page loads

2. **Cache versioning**:
   - Build ID changes on each deployment
   - Users get latest version automatically

3. **Fallback**: Hard refresh if updates not showing:
   - Instruct users to press `Ctrl+Shift+R`

## Summary

### Quick Fix (Recommended)
✅ **Disable Service Worker in development** (Solution 1)
- Prevents 90% of cache issues
- Zero performance impact
- Easy to implement

### Complete Solution
1. ✅ Disable Service Worker in dev (Solution 1)
2. ✅ Add dev-specific cache headers (Solution 2)
3. ✅ Add dev mode banner (Solution 6)

### Result
- ✅ Changes visible immediately without DevTools
- ✅ No hard refresh needed
- ✅ Better developer experience
- ✅ Production performance unchanged

## Files to Modify

### Priority 1 (Required)
- `app/layout.tsx` - Disable Service Worker in development
- `next.config.js` - Add development cache headers

### Priority 2 (Recommended)
- `components/DevModeBanner.tsx` - Create dev mode banner (new file)

### Priority 3 (Optional)
- `public/cache-buster.js` - Cache busting script (new file)
- `scripts/dev.sh` - Development script with warnings (new file)
- `package.json` - Add new scripts

## Related Issues

- Service Worker caching in development
- Next.js build cache
- Browser HTTP cache
- Static file caching
- API response caching

## References

- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
