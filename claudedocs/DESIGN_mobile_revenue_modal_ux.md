# BusinessRevenueModal 모바일 UX 개선 설계

## 📋 현황 분석

### 현재 문제점
```
데스크톱 레이아웃 (현재):
┌─────────────────────────────────────────────┐
│  [제목]                          [X]        │
├──────────────────────┬──────────────────────┤
│                      │                      │
│   메인 콘텐츠        │    메모 영역        │
│   (flex-1)           │    (w-80 고정)      │
│                      │                      │
│   - 사업장 정보      │    - 메모 입력      │
│   - 매출/이익        │    - 메모 목록      │
│   - 비용 상세        │                      │
│   - 장비 목록        │                      │
│                      │                      │
└──────────────────────┴──────────────────────┘

모바일 레이아웃 (문제):
┌─────────────┬──────────┐
│             │          │
│  메인       │  메모    │
│  (좁음)     │  (넓음)  │
│             │          │
└─────────────┴──────────┘
  ↑ 거의 안보임   ↑ 대부분 차지
```

**핵심 문제:**
- 모바일에서 `flex flex-1` + `w-80 고정` 구조로 인해 메모 영역이 대부분의 가로 공간 차지
- 320px ~ 768px 화면에서 w-80 (320px)이 전체 화면의 50% 이상 차지
- 중요한 매출/비용 정보가 좁은 공간에 압축되어 가독성 저하

## 🎯 설계 목표

1. **모바일 우선 반응형 디자인**: 화면 크기에 따라 레이아웃 자동 전환
2. **콘텐츠 우선순위 보장**: 매출/비용 정보가 항상 잘 보이도록
3. **메모 접근성 유지**: 메모 기능 손실 없이 UX 개선
4. **점진적 향상**: 기존 데스크톱 UX 유지하면서 모바일 개선

## 🏗️ 설계 방안

### 방안 1: 탭 기반 전환 (추천) ⭐

**개념:**
- 모바일: 탭으로 "내역" / "메모" 전환
- 태블릿 이상: 기존 2열 레이아웃 유지

**장점:**
- ✅ 구현 간단 (조건부 렌더링 + 상태 관리)
- ✅ 각 섹션이 전체 화면 활용 가능
- ✅ 명확한 정보 구분
- ✅ 모바일 앱 UX 패턴과 일치

**단점:**
- ⚠️ 탭 전환 필요 (하지만 모바일에서는 일반적인 패턴)

**구현 상세:**

```tsx
// 1. 반응형 상태 관리
const [isMobile, setIsMobile] = useState(false);
const [activeTab, setActiveTab] = useState<'content' | 'memo'>('content');

useEffect(() => {
  const checkMobile = () => {
    setIsMobile(window.innerWidth < 768); // md breakpoint
  };

  checkMobile();
  window.addEventListener('resize', checkMobile);
  return () => window.removeEventListener('resize', checkMobile);
}, []);

// 2. 조건부 레이아웃 렌더링
{isMobile ? (
  // 모바일: 탭 UI
  <div className="flex flex-col h-full">
    {/* 탭 헤더 */}
    <div className="flex border-b border-gray-200">
      <button
        onClick={() => setActiveTab('content')}
        className={`flex-1 py-3 text-sm font-medium ${
          activeTab === 'content'
            ? 'border-b-2 border-blue-600 text-blue-600'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        📊 매출 내역
      </button>
      <button
        onClick={() => setActiveTab('memo')}
        className={`flex-1 py-3 text-sm font-medium ${
          activeTab === 'memo'
            ? 'border-b-2 border-blue-600 text-blue-600'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        📝 메모
      </button>
    </div>

    {/* 탭 콘텐츠 */}
    <div className="flex-1 overflow-y-auto">
      {activeTab === 'content' ? (
        <div className="p-4 space-y-4">
          {/* 기존 메인 콘텐츠 */}
        </div>
      ) : (
        <div className="p-4">
          <MemoSection {...memoProps} />
        </div>
      )}
    </div>
  </div>
) : (
  // 데스크톱: 기존 2열 레이아웃
  <div className="flex flex-1 overflow-hidden">
    <div className="flex-1 overflow-y-auto p-6">
      {/* 메인 콘텐츠 */}
    </div>
    <div className="w-80 border-l">
      <MemoSection {...memoProps} />
    </div>
  </div>
)}
```

**브레이크포인트 전략:**
- `< 768px (md)`: 탭 UI (모바일/소형 태블릿)
- `>= 768px (md)`: 2열 레이아웃 (태블릿/데스크톱)

---

### 방안 2: 슬라이드 패널 (고급)

**개념:**
- 메모 영역을 슬라이드 패널로 변경
- 모바일: 하단에서 올라오는 Sheet 또는 우측에서 나오는 Drawer
- FAB(Floating Action Button)로 메모 패널 토글

**장점:**
- ✅ 매출 정보가 항상 전체 화면 차지
- ✅ 메모가 필요할 때만 표시
- ✅ 현대적인 모바일 UX 패턴

**단점:**
- ⚠️ 구현 복잡도 높음 (애니메이션, 제스처)
- ⚠️ 추가 라이브러리 필요 가능 (react-spring, framer-motion)
- ⚠️ 접근성 고려사항 많음

**구현 개요:**
```tsx
// 상태
const [showMemoPanel, setShowMemoPanel] = useState(false);

// 모바일 레이아웃
<div className="relative flex-1">
  {/* 메인 콘텐츠 */}
  <div className="flex-1 overflow-y-auto p-4">
    {/* 콘텐츠 */}
  </div>

  {/* 메모 토글 FAB */}
  <button
    onClick={() => setShowMemoPanel(!showMemoPanel)}
    className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-full shadow-lg md:hidden"
  >
    📝 메모 {memoCount > 0 && <span className="badge">{memoCount}</span>}
  </button>

  {/* 슬라이드 패널 */}
  {showMemoPanel && (
    <div className="fixed inset-0 bg-black/50 z-50 md:hidden">
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4">
          <button onClick={() => setShowMemoPanel(false)}>닫기</button>
          <MemoSection {...memoProps} />
        </div>
      </div>
    </div>
  )}
</div>
```

---

### 방안 3: 아코디언 방식 (절충안)

**개념:**
- 모바일: 메모를 접을 수 있는 아코디언으로 하단 배치
- 기본적으로 접힌 상태, 필요시 펼침

**장점:**
- ✅ 한 화면에서 모든 정보 접근 가능
- ✅ 간단한 구현

**단점:**
- ⚠️ 스크롤이 길어짐
- ⚠️ 메모 접근 불편 (항상 하단으로 스크롤 필요)

---

## 🎨 최종 권장 설계: 방안 1 (탭 기반)

### 구현 계획

#### Phase 1: 반응형 감지 및 상태 관리
```tsx
// hooks/useIsMobile.ts
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}
```

#### Phase 2: 탭 컴포넌트 구현
```tsx
// components/ui/MobileTabs.tsx
interface Tab {
  id: string;
  label: string;
  icon?: string;
}

interface MobileTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function MobileTabs({ tabs, activeTab, onTabChange }: MobileTabsProps) {
  return (
    <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            flex-1 py-3 px-4 text-sm font-medium transition-colors
            ${activeTab === tab.id
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }
          `}
        >
          {tab.icon && <span className="mr-1">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

#### Phase 3: BusinessRevenueModal 수정
```tsx
// components/business/BusinessRevenueModal.tsx

import { useIsMobile } from '@/hooks/useIsMobile';
import { MobileTabs } from '@/components/ui/MobileTabs';

function BusinessRevenueModal({ business, onClose, onDataChange }) {
  const isMobile = useIsMobile(768);
  const [activeTab, setActiveTab] = useState<'content' | 'memo'>('content');

  // ... 기존 로직 ...

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col overflow-hidden">

        {/* 헤더 (공통) */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center">
          {/* ... 기존 헤더 ... */}
        </div>

        {/* 본문: 모바일/데스크톱 조건부 렌더링 */}
        {isMobile ? (
          // 🆕 모바일: 탭 UI
          <div className="flex flex-col flex-1 overflow-hidden">
            <MobileTabs
              tabs={[
                { id: 'content', label: '매출 내역', icon: '📊' },
                { id: 'memo', label: '메모', icon: '📝' }
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'content' ? (
                <div className="p-4 space-y-4">
                  {/* 기존 메인 콘텐츠 (사업장 정보, 매출/이익, 비용 상세, 장비 목록) */}
                  {renderMainContent()}
                </div>
              ) : (
                <div className="h-full">
                  <MemoSection
                    businessId={business.id}
                    businessName={business.business_name}
                    userPermission={userPermission}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          // ✅ 데스크톱: 기존 2열 레이아웃
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {renderMainContent()}
            </div>

            <div className="w-80 border-l border-indigo-200 flex flex-col overflow-hidden bg-gradient-to-b from-indigo-50/30 to-white">
              <MemoSection
                businessId={business.id}
                businessName={business.business_name}
                userPermission={userPermission}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

#### Phase 4: 메인 콘텐츠 리팩토링 (선택적 DRY)
```tsx
// 중복 방지를 위한 콘텐츠 렌더링 함수
function renderMainContent() {
  return (
    <>
      {/* 사업장 기본 정보 */}
      <div className="bg-gray-50 rounded-lg p-4">
        {/* ... */}
      </div>

      {/* 매출/매입/이익 정보 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* ... */}
      </div>

      {/* 비용 상세 내역 */}
      <div>
        {/* ... */}
      </div>

      {/* 장비 목록 */}
      <div>
        {/* ... */}
      </div>
    </>
  );
}
```

---

## 📱 반응형 브레이크포인트 정의

| 화면 크기 | 뷰포트 | 레이아웃 | 설명 |
|----------|--------|---------|------|
| Mobile | `< 768px` | 탭 UI | 세로형 탭, 전체 너비 활용 |
| Tablet | `768px - 1024px` | 2열 (좁은 메모) | 메모 w-64 또는 w-72 |
| Desktop | `>= 1024px` | 2열 (기존) | 메모 w-80 유지 |

**Tailwind 클래스 전략:**
```tsx
// 메모 영역 너비 반응형
<div className="
  w-full           // 모바일: 전체 너비 (탭 내부)
  md:w-72          // 태블릿: 288px
  lg:w-80          // 데스크톱: 320px
  border-l
  border-indigo-200
">
```

---

## 🎯 UX 개선 효과 측정

### Before (현재)
- 모바일 화면 (375px 기준)
  - 메인 콘텐츠: ~55px (15%)
  - 메모 영역: 320px (85%)
  - **가독성 점수: 2/10** ❌

### After (탭 UI)
- 모바일 화면 (375px 기준)
  - 각 탭: 375px (100%)
  - **가독성 점수: 9/10** ✅

**개선율:**
- 콘텐츠 가시 영역: **15% → 100%** (+566%)
- 탭 전환 비용: 1탭 (허용 가능)

---

## 🔍 접근성 고려사항

### 키보드 네비게이션
```tsx
<button
  role="tab"
  aria-selected={activeTab === 'content'}
  aria-controls="content-panel"
  onKeyDown={(e) => {
    if (e.key === 'ArrowRight') {
      setActiveTab('memo');
    }
  }}
>
  매출 내역
</button>
```

### 스크린 리더 지원
```tsx
<div
  id="content-panel"
  role="tabpanel"
  aria-labelledby="content-tab"
  hidden={activeTab !== 'content'}
>
  {/* 콘텐츠 */}
</div>
```

---

## 📋 구현 체크리스트

### Phase 1: 기반 구조
- [ ] `useIsMobile` 커스텀 훅 생성
- [ ] `MobileTabs` 공용 컴포넌트 생성
- [ ] 기존 콘텐츠를 `renderMainContent()` 함수로 리팩토링

### Phase 2: 조건부 렌더링
- [ ] `isMobile` 상태에 따른 레이아웃 분기
- [ ] 탭 상태 관리 (`activeTab`)
- [ ] 탭 전환 이벤트 핸들러

### Phase 3: 스타일링
- [ ] 탭 헤더 스타일링 (활성/비활성)
- [ ] 모바일 패딩/마진 조정
- [ ] 반응형 그리드 확인 (grid-cols-2 → grid-cols-1 필요시)

### Phase 4: 테스트
- [ ] 모바일 (375px, 414px) 테스트
- [ ] 태블릿 (768px, 1024px) 테스트
- [ ] 데스크톱 (1440px, 1920px) 테스트
- [ ] 탭 전환 동작 확인
- [ ] 메모 CRUD 기능 정상 동작 확인

### Phase 5: 최적화
- [ ] 탭 전환 시 불필요한 리렌더링 방지 (useMemo)
- [ ] 스크롤 위치 복원 (탭 전환 시)
- [ ] 접근성 검증 (키보드, 스크린 리더)

---

## 🚀 대안 고려: 하이브리드 접근

만약 탭 UI가 사용자에게 익숙하지 않다면, 다음 하이브리드 방식 고려:

**모바일 레이아웃:**
1. 기본: 메인 콘텐츠 전체 표시
2. 하단 고정 버튼: "📝 메모 보기 (3)" - 메모 개수 표시
3. 버튼 클릭 시: Bottom Sheet로 메모 영역 표시 (높이 50-80%)
4. Sheet 닫기: 스와이프 다운 또는 X 버튼

**장점:**
- 메인 콘텐츠가 항상 우선 표시
- 메모 접근성 유지
- 모바일 앱과 유사한 UX

**단점:**
- Bottom Sheet 라이브러리 필요 또는 직접 구현
- 애니메이션 복잡도

---

## 📚 참고: 유사 패턴 사례

### Notion Mobile
- 메인 콘텐츠 우선, 코멘트는 별도 화면/Sheet

### Jira Mobile
- 이슈 상세: 탭 UI (Details / Comments / Activity)

### Trello Mobile
- 카드 상세: 스크롤 방식, 댓글은 하단 섹션

### Slack Mobile
- 메시지 스레드: Bottom Sheet 또는 전체 화면 전환

---

## 🎯 결론 및 권장사항

**최종 권장: 방안 1 (탭 기반 전환)**

**이유:**
1. ✅ 구현 복잡도 낮음 (1-2일)
2. ✅ 검증된 모바일 UX 패턴
3. ✅ 접근성 우수
4. ✅ 유지보수 용이
5. ✅ 기존 데스크톱 UX 완전 보존

**다음 단계:**
1. 사용자 피드백 수집 (프로토타입 또는 베타 테스트)
2. Phase 1-3 구현
3. 모바일 기기 실제 테스트
4. 필요시 방안 2(슬라이드 패널)로 업그레이드

**예상 개발 시간:**
- 기반 구조: 2-3시간
- 조건부 렌더링: 2-3시간
- 스타일링/반응형: 2-4시간
- 테스트/버그 픽스: 2-4시간
- **총 예상: 8-14시간 (1-2일)**
