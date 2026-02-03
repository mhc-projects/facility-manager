# 배출구 그룹 기반 게이트웨이 표시 설계

## 📋 요구사항 분석

### 현재 구조 (문제점)
```
측정기기 수량 체크 섹션
├─ 배출시설 목록 (평면 리스트)
│  ├─ 배출시설1 카드
│  ├─ 배출시설2 카드
│  └─ ...
├─ 방지시설 목록 (평면 리스트)
│  ├─ 방지시설1 카드
│  ├─ 방지시설2 카드
│  └─ ...
└─ 배출구별 게이트웨이 설정 (별도 섹션)
   ├─ 배출구1 카드
   ├─ 배출구2 카드
   └─ ...
```

**문제점:**
- 배출구와 시설의 관계가 명확하지 않음
- 게이트웨이 정보가 별도 섹션에 분리되어 있어 직관적이지 않음
- 배출구 1개에 속한 시설들을 한눈에 파악하기 어려움

### 개선 구조 (목표)
```
측정기기 수량 체크 섹션
└─ 배출구별 시설 및 게이트웨이 정보 (배출구 그룹핑)
   ├─ 📦 배출구 1번 [gateway1 | 유선] ← 빨간색 박스
   │  ├─ 🏭 배출시설1
   │  └─ 🛡️ 방지시설1
   ├─ 📦 배출구 2번 [gateway2 | 무선] ← 빨간색 박스
   │  ├─ 🏭 배출시설2
   │  └─ 🛡️ 방지시설2
   └─ ...
```

**장점:**
- ✅ 배출구를 기준으로 시설들이 그룹화되어 관계가 명확함
- ✅ 게이트웨이 정보가 배출구 레벨에 표시되어 직관적
- ✅ 첨부파일의 빨간색 박스 구조와 동일한 시각적 그룹핑

---

## 🎨 UI 설계

### 1. 배출구 그룹 컨테이너 구조

```
┌─────────────────────────────────────────────────────────────┐
│ 📦 배출구 1번                                    ← 헤더       │
│    gateway1 | 유선                              ← 게이트웨이   │
├─────────────────────────────────────────────────────────────┤
│ 🏭 배출시설 (1개)                               ← 서브섹션    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 배출시설1                                               │ │
│ │ 배1 - 배출구 1번                                        │ │
│ │ 목재사용말림시설 (34.8 m³)                              │ │
│ │ ⚡ 배출CT: 1개                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🛡️ 방지시설 (1개)                              ← 서브섹션    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 방지시설1                                               │ │
│ │ 방1 - 배출구 1번                                        │ │
│ │ 원심력집진시설 (30 m³/분)                               │ │
│ │ 💧 차압계: 1 | 🌡️ 온도계: 1 | ⚡ 송풍CT: 1               │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. 게이트웨이 정보 표시 위치

**옵션 A: 배출구 헤더에 통합 (추천)**
```tsx
<div className="배출구_컨테이너">
  {/* 헤더: 배출구 번호 + 게이트웨이 정보 */}
  <div className="flex items-center justify-between">
    <h3>📦 배출구 {outletNumber}번</h3>
    <div className="flex items-center gap-2">
      <Router className="w-4 h-4" />
      <span>gateway1</span>
      <span className="badge">유선</span>
      <button>편집</button>
    </div>
  </div>

  {/* 배출시설 카드들 */}
  {/* 방지시설 카드들 */}
</div>
```

**옵션 B: 별도 게이트웨이 섹션 (현재 구현과 유사)**
```tsx
<div className="배출구_컨테이너">
  <h3>📦 배출구 {outletNumber}번</h3>

  {/* 게이트웨이 정보 섹션 */}
  <div className="gateway-section">
    <Router /> gateway1 | 유선
  </div>

  {/* 배출시설 카드들 */}
  {/* 방지시설 카드들 */}
</div>
```

**선택: 옵션 A 추천**
- 더 간결하고 직관적
- 헤더에 중요 정보가 집중되어 스캔하기 쉬움
- 편집 버튼 접근성 좋음

### 3. 상세 UI 컴포넌트

#### 3.1 배출구 그룹 컨테이너
```tsx
{facilityNumbering?.outlets?.map((outlet: any) => (
  <div
    key={outlet.id}
    className="border-2 border-red-300 bg-red-50/30 rounded-xl p-5 mb-4"
  >
    {/* 배출구 헤더: 번호 + 게이트웨이 정보 */}
    <div className="flex items-center justify-between mb-4 pb-3 border-b border-red-200">
      <div className="flex items-center gap-3">
        <Factory className="w-6 h-6 text-red-600" />
        <h3 className="text-xl font-bold text-gray-900">
          배출구 {outlet.outletNumber}번
        </h3>
      </div>

      {/* 게이트웨이 정보 표시 및 편집 */}
      <div className="flex items-center gap-3">
        {outlet.gateway_number ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-100 rounded-lg">
              <Router className="w-4 h-4 text-teal-600" />
              <span className="font-medium text-teal-900">
                {outlet.gateway_number}
              </span>
              {outlet.vpn_type && (
                <span className="px-2 py-0.5 bg-teal-200 rounded-full text-xs font-medium text-teal-900">
                  {outlet.vpn_type}
                </span>
              )}
            </div>
            <button
              onClick={() => handleEditOutletGateway(outlet)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Edit className="w-4 h-4 text-gray-600" />
            </button>
          </>
        ) : (
          <button
            onClick={() => handleEditOutletGateway(outlet)}
            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2"
          >
            <Router className="w-4 h-4" />
            게이트웨이 설정
          </button>
        )}
      </div>
    </div>

    {/* 배출시설 카드들 */}
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <Factory className="w-4 h-4 text-orange-600" />
        배출시설 ({outlet.dischargeFacilities?.length || 0}개)
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {outlet.dischargeFacilities?.map((facility: any) => (
          <div key={facility.id} className="bg-white rounded-lg border border-orange-200 p-3">
            {/* 배출시설 카드 내용 */}
          </div>
        ))}
      </div>
    </div>

    {/* 방지시설 카드들 */}
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-600" />
        방지시설 ({outlet.preventionFacilities?.length || 0}개)
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {outlet.preventionFacilities?.map((facility: any) => (
          <div key={facility.id} className="bg-white rounded-lg border border-blue-200 p-3">
            {/* 방지시설 카드 내용 */}
          </div>
        ))}
      </div>
    </div>
  </div>
))}
```

#### 3.2 게이트웨이 편집 모달
```tsx
<Modal
  isOpen={isGatewayModalOpen}
  onClose={() => setIsGatewayModalOpen(false)}
  title={`배출구 ${selectedOutlet?.outletNumber}번 게이트웨이 설정`}
>
  <div className="space-y-4">
    {/* 게이트웨이 번호 선택 */}
    <div>
      <label className="block text-sm font-medium mb-2">게이트웨이 번호</label>
      <select
        value={selectedOutlet?.gateway_number || ''}
        onChange={(e) => handleGatewayChange('gateway_number', e.target.value)}
        className="w-full p-3 border rounded-lg"
      >
        <option value="">선택하세요</option>
        {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
          <option key={num} value={`gateway${num}`}>
            gateway{num}
          </option>
        ))}
      </select>
    </div>

    {/* VPN 타입 선택 */}
    <div>
      <label className="block text-sm font-medium mb-2">VPN 연결 방식</label>
      <div className="flex gap-3">
        <button
          onClick={() => handleGatewayChange('vpn_type', '유선')}
          className={`flex-1 py-3 rounded-lg font-medium ${
            selectedOutlet?.vpn_type === '유선'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          유선
        </button>
        <button
          onClick={() => handleGatewayChange('vpn_type', '무선')}
          className={`flex-1 py-3 rounded-lg font-medium ${
            selectedOutlet?.vpn_type === '무선'
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          무선
        </button>
      </div>
    </div>

    {/* 저장/취소 버튼 */}
    <div className="flex gap-3 mt-6">
      <button
        onClick={handleSaveGateway}
        className="flex-1 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
      >
        저장
      </button>
      <button
        onClick={() => setIsGatewayModalOpen(false)}
        className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
      >
        취소
      </button>
    </div>
  </div>
</Modal>
```

---

## 🔄 데이터 구조

### facilityNumbering 구조
```typescript
interface FacilityNumbering {
  outlets: Array<{
    id: string;
    outletNumber: number;
    gateway_number?: string;  // 'gateway1' ~ 'gateway50'
    vpn_type?: '유선' | '무선';

    dischargeFacilities: Array<{
      facilityId: string;
      facilityNumber: number;
      displayNumber: string;  // "배1"
      facilityName: string;
      capacity: string;
      // ... 기타 배출시설 정보
    }>;

    preventionFacilities: Array<{
      facilityId: string;
      facilityNumber: number;
      displayNumber: string;  // "방1"
      facilityName: string;
      capacity: string;
      // ... 기타 방지시설 정보
    }>;
  }>;
}
```

---

## 📊 레이아웃 비교

### Before (현재 구현)
```
┌─────────────────────────────────────┐
│ 📊 측정기기 수량 체크               │
├─────────────────────────────────────┤
│ 🏭 배출시설 (1개)                   │
│ ┌─────┐ ┌─────┐ ┌─────┐             │
│ │시설1│ │시설2│ │시설3│  ← 평면     │
│ └─────┘ └─────┘ └─────┘             │
│                                     │
│ 🛡️ 방지시설 (1개)                   │
│ ┌─────┐ ┌─────┐ ┌─────┐             │
│ │시설1│ │시설2│ │시설3│  ← 평면     │
│ └─────┘ └─────┘ └─────┘             │
│                                     │
│ 🌐 배출구별 게이트웨이 설정 (3개)    │
│ ┌─────┐ ┌─────┐ ┌─────┐             │
│ │구1  │ │구2  │ │구3  │  ← 별도     │
│ │GW1  │ │GW2  │ │GW3  │             │
│ └─────┘ └─────┘ └─────┘             │
└─────────────────────────────────────┘
```

### After (개선안)
```
┌─────────────────────────────────────┐
│ 📊 측정기기 수량 체크               │
├─────────────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│ ┃ 📦 배출구 1번 | GW1 | 유선    ┃   │
│ ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫   │
│ ┃ 🏭 배출시설: 시설1             ┃   │
│ ┃ 🛡️ 방지시설: 시설1             ┃   │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│                                     │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│ ┃ 📦 배출구 2번 | GW2 | 무선    ┃   │
│ ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫   │
│ ┃ 🏭 배출시설: 시설2             ┃   │
│ ┃ 🛡️ 방지시설: 시설2             ┃   │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│                                     │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│ ┃ 📦 배출구 3번 | 미설정         ┃   │
│ ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫   │
│ ┃ 🏭 배출시설: 시설3             ┃   │
│ ┃ 🛡️ 방지시설: 시설3             ┃   │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
└─────────────────────────────────────┘
```

---

## 🎯 구현 계획

### Phase 1: UI 구조 변경
1. 현재 평면 리스트 구조를 배출구 그룹핑 구조로 변경
2. 배출구 컨테이너 컴포넌트 생성
3. 빨간색 박스 스타일링 (border-2 border-red-300)

### Phase 2: 게이트웨이 정보 통합
1. 배출구 헤더에 게이트웨이 정보 표시
2. 게이트웨이 편집 모달 구현
3. 게이트웨이 미설정 시 "게이트웨이 설정" 버튼 표시

### Phase 3: 시설 카드 재배치
1. 배출시설 카드를 배출구 컨테이너 내부로 이동
2. 방지시설 카드를 배출구 컨테이너 내부로 이동
3. 서브섹션 헤더 추가 (배출시설 n개, 방지시설 m개)

### Phase 4: 상호작용 개선
1. 배출구 컨테이너 접기/펼치기 기능 (선택사항)
2. 게이트웨이 편집 인라인 vs 모달 선택
3. 빠른 게이트웨이 설정 UI

---

## 💡 추가 개선 아이디어

### 1. 배출구 컨테이너 접기/펼치기
```tsx
<div className="outlet-container">
  <div className="header" onClick={() => toggleOutlet(outlet.id)}>
    <ChevronDown className={collapsed ? '' : 'rotate-180'} />
    배출구 {outlet.outletNumber}번 | gateway1 | 유선
    <span className="text-sm text-gray-600">
      (시설 {totalFacilities}개)
    </span>
  </div>

  {!collapsed && (
    <div className="content">
      {/* 배출시설 + 방지시설 카드들 */}
    </div>
  )}
</div>
```

### 2. 게이트웨이 색상 코딩
```tsx
// 게이트웨이별로 다른 색상 배정
const gatewayColors = {
  'gateway1': 'bg-teal-100 text-teal-900',
  'gateway2': 'bg-blue-100 text-blue-900',
  'gateway3': 'bg-purple-100 text-purple-900',
  // ...
};
```

### 3. 게이트웨이 사용 현황 표시
```tsx
<div className="gateway-summary">
  <h4>게이트웨이 사용 현황</h4>
  <div className="grid grid-cols-2 gap-2">
    <div className="gateway-stat">
      <span>gateway1 (유선)</span>
      <span>2개 배출구</span>
    </div>
    <div className="gateway-stat">
      <span>gateway2 (무선)</span>
      <span>1개 배출구</span>
    </div>
  </div>
</div>
```

### 4. 드래그 앤 드롭으로 게이트웨이 할당
```tsx
// 게이트웨이 팔레트
<div className="gateway-palette">
  {gateways.map(gw => (
    <div
      draggable
      onDragStart={() => setDraggingGateway(gw)}
      className="gateway-chip"
    >
      {gw.number} | {gw.vpnType}
    </div>
  ))}
</div>

// 배출구 컨테이너 (드롭 가능)
<div
  onDrop={() => assignGateway(outlet, draggingGateway)}
  className="outlet-container droppable"
>
  ...
</div>
```

---

## 📝 구현 체크리스트

### UI 구조 변경
- [ ] 배출구 그룹핑 컨테이너 컴포넌트 생성
- [ ] 빨간색 박스 스타일링 적용
- [ ] 배출구 헤더에 게이트웨이 정보 표시
- [ ] 배출시설 카드 배출구 컨테이너 내부로 이동
- [ ] 방지시설 카드 배출구 컨테이너 내부로 이동

### 게이트웨이 편집
- [ ] 게이트웨이 편집 모달 구현
- [ ] 게이트웨이 미설정 시 "설정" 버튼 표시
- [ ] 게이트웨이 설정 완료 시 헤더에 표시
- [ ] 편집 아이콘 클릭 시 모달 열기

### 기능 개선
- [ ] 배출구별 시설 개수 표시
- [ ] 게이트웨이 사용 현황 요약 (선택사항)
- [ ] 배출구 접기/펼치기 (선택사항)

### 테스트
- [ ] 게이트웨이 설정 테스트
- [ ] 게이트웨이 수량 계산 정확성 확인
- [ ] 반응형 레이아웃 확인
- [ ] 접근성 테스트

---

## 🎨 디자인 토큰

### 색상
```css
/* 배출구 컨테이너 */
--outlet-border: #fca5a5; /* red-300 */
--outlet-bg: #fef2f2;     /* red-50/30 */

/* 게이트웨이 */
--gateway-bg: #ccfbf1;    /* teal-100 */
--gateway-text: #134e4a;  /* teal-900 */
--gateway-badge: #99f6e4; /* teal-200 */

/* 배출시설 */
--discharge-border: #fed7aa; /* orange-200 */
--discharge-icon: #ea580c;   /* orange-600 */

/* 방지시설 */
--prevention-border: #bfdbfe; /* blue-200 */
--prevention-icon: #2563eb;   /* blue-600 */
```

### 간격
```css
--outlet-padding: 1.25rem;  /* 5 */
--outlet-gap: 1rem;         /* 4 */
--card-padding: 0.75rem;    /* 3 */
--section-gap: 0.75rem;     /* 3 */
```

---

## 📖 참고 자료

### 유사 UI 패턴
- Notion의 토글 블록 (접기/펼치기)
- Trello의 카드 그룹핑
- Jira의 Epic - Story 관계 표시

### 접근성 고려사항
- 키보드 네비게이션 지원
- 스크린 리더 호환성
- 색상 대비 WCAG AA 준수
- 포커스 인디케이터 명확성
