# Navigation 태블릿 브레이크포인트 수정

## 문제 현황

**증상:** 브라우저 화면이 절반 정도(태블릿 크기)일 때 네비게이션 접근 불가

**원인:**
- 데스크톱 사이드바: `hidden lg:flex` (1024px 이상에서만 표시)
- 모바일 햄버거 메뉴: `lg:hidden` (1024px 미만에서만 표시)
- **문제 구간:** 768px ~ 1023px (md ~ lg 사이)
  - 데스크톱 사이드바 숨김 ❌
  - 모바일 메뉴 버튼 표시 안 됨 ❌
  - **네비게이션 완전 접근 불가!**

## Tailwind CSS Breakpoints

```
sm:  640px  ✅ 모바일
md:  768px  ⚠️ 태블릿 (문제 발생)
lg:  1024px ✅ 데스크톱
xl:  1280px ✅ 대형 데스크톱
2xl: 1536px
```

## 현재 코드 분석

### 파일: [components/layout/Navigation.tsx](../components/layout/Navigation.tsx)

#### 데스크톱 사이드바 (line 191-218)
```typescript
{/* 데스크톱 사이드바 */}
<div className="hidden lg:flex lg:flex-shrink-0">
  {/* ❌ lg (1024px) 미만에서는 완전히 숨김 */}
  <div className="flex flex-col w-64 border-r border-gray-200 bg-white pt-5 pb-4 overflow-y-auto">
    {/* 로고, 알림, 네비게이션 메뉴 */}
  </div>
</div>
```

#### 모바일 메뉴 버튼 (line 220-238)
```typescript
{/* 모바일 메뉴 버튼 */}
<div className="lg:hidden">
  {/* ❌ lg (1024px) 이상에서는 완전히 숨김 */}
  <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2">
    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
      {/* 햄버거 메뉴 아이콘 */}
    </button>
  </div>
</div>
```

#### 모바일 메뉴 드로어 (line 240-251)
```typescript
{/* 모바일 메뉴 */}
{isMobileMenuOpen && (
  <div className="lg:hidden">
    {/* 드로어 형태의 네비게이션 */}
  </div>
)}
```

## 해결 방안

### 옵션 A: md 브레이크포인트로 변경 (권장)

**변경 사항:**
- `lg:flex` → `md:flex` (768px부터 사이드바 표시)
- `lg:hidden` → `md:hidden` (768px 미만에서만 햄버거 메뉴)

**장점:**
- 간단한 수정 (클래스명만 변경)
- 태블릿에서 데스크톱 레이아웃 제공
- 일관된 사용자 경험

**단점:**
- 768px에서 사이드바(256px)가 화면 1/3 차지
- 작은 태블릿에서 콘텐츠 영역 좁아짐

**적용 코드:**
```typescript
{/* 데스크톱 사이드바 */}
<div className="hidden md:flex md:flex-shrink-0">
  <div className="flex flex-col w-64 border-r border-gray-200 bg-white pt-5 pb-4 overflow-y-auto">
    {/* ... */}
  </div>
</div>

{/* 모바일 메뉴 버튼 */}
<div className="md:hidden">
  {/* ... */}
</div>

{/* 모바일 메뉴 */}
{isMobileMenuOpen && (
  <div className="md:hidden">
    {/* ... */}
  </div>
)}
```

### 옵션 B: 사이드바 축소 모드 추가

**변경 사항:**
- md ~ lg: 아이콘만 표시하는 축소 사이드바 (64px)
- lg 이상: 전체 사이드바 표시 (256px)

**장점:**
- 모든 화면 크기에서 네비게이션 접근 가능
- 태블릿에서도 충분한 콘텐츠 영역 확보

**단점:**
- 구현 복잡도 증가
- 축소/확장 상태 관리 필요

**적용 코드 (개념):**
```typescript
{/* 사이드바 - 축소/확장 반응형 */}
<div className="hidden md:flex md:flex-shrink-0">
  <div className={`
    flex flex-col border-r border-gray-200 bg-white pt-5 pb-4 overflow-y-auto
    md:w-16 lg:w-64
  `}>
    {/* md: 아이콘만, lg: 텍스트 포함 */}
  </div>
</div>
```

### 옵션 C: 태블릿에서 토글 가능한 오버레이 사이드바

**변경 사항:**
- md ~ lg: 햄버거 메뉴 + 오버레이 사이드바
- lg 이상: 고정 사이드바

**장점:**
- 태블릿에서 전체 화면 활용
- 필요할 때만 네비게이션 표시

**단점:**
- 현재 모바일 메뉴와 유사 (중복)
- UX 일관성 저하

## 권장 해결방안: 옵션 A (md 브레이크포인트)

**이유:**
1. **즉시 적용 가능**: 클래스명만 변경 (5분 작업)
2. **표준 UX 패턴**: 대부분의 웹앱이 태블릿에서 데스크톱 레이아웃 사용
3. **충분한 화면 크기**: 768px - 256px(사이드바) = 512px(콘텐츠) ✅
4. **일관성**: 태블릿과 데스크톱에서 동일한 인터페이스

**적용 파일:**
- [components/layout/Navigation.tsx](../components/layout/Navigation.tsx)

**변경 라인:**
- Line 192: `hidden lg:flex` → `hidden md:flex`
- Line 221: `lg:hidden` → `md:hidden`
- Line 242: `lg:hidden` → `md:hidden`

**테스트 시나리오:**
1. 브라우저 너비 1280px: 사이드바 표시 ✅
2. 브라우저 너비 1024px: 사이드바 표시 ✅
3. 브라우저 너비 768px: 사이드바 표시 ✅
4. 브라우저 너비 640px: 햄버거 메뉴 ✅
5. 브라우저 너비 375px: 햄버거 메뉴 ✅

## 구현 계획

### 1단계: 즉시 수정 (옵션 A)
- [ ] `lg:flex` → `md:flex` 변경
- [ ] `lg:hidden` → `md:hidden` 변경 (2곳)
- [ ] 브라우저 테스트 (768px ~ 1280px)
- [ ] 커밋 및 배포

### 2단계: 장기 개선 (선택사항)
- [ ] 옵션 B 검토: 축소 사이드바 프로토타입
- [ ] 사용자 피드백 수집
- [ ] A/B 테스트 고려

## 관련 파일

- [components/layout/Navigation.tsx](../components/layout/Navigation.tsx) - 네비게이션 컴포넌트
- [app/admin/layout.tsx](../app/admin/layout.tsx) - 관리자 레이아웃 (단순 래퍼)

## 참고: Tailwind 반응형 설계 원칙

### Mobile-First 접근
```typescript
// ❌ 잘못된 방식: Desktop-First
<div className="flex lg:hidden">  // 기본 표시, lg부터 숨김

// ✅ 올바른 방식: Mobile-First
<div className="hidden lg:flex">  // 기본 숨김, lg부터 표시
```

### 브레이크포인트 선택 기준
- **sm (640px)**: 대형 모바일 세로
- **md (768px)**: 태블릿 세로 / 소형 태블릿 가로
- **lg (1024px)**: 태블릿 가로 / 소형 노트북
- **xl (1280px)**: 노트북 / 데스크톱
- **2xl (1536px)**: 대형 데스크톱

### 일반적인 사이드바 브레이크포인트
- 대부분의 앱: **md (768px)** 또는 **lg (1024px)**
- Material-UI: **md (960px)** 기본값
- Bootstrap: **md (768px)** 기본값
- Ant Design: **lg (1024px)** 권장

**결론:** md (768px)가 업계 표준에 가장 부합

---

**작성일:** 2026-02-05
**작성자:** Claude Code
**우선순위:** High
**상태:** ✅ 분석 완료, 해결방안 제시
**문제 유형:** 반응형 브레이크포인트 누락
**영향 범위:** 모든 페이지의 네비게이션 접근성 (768px ~ 1023px)
