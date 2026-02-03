# Air Permit 목록 페이지 게이트웨이 색상 문제 분석

## 문제 상황

**증상**: air-permit 목록 페이지에서 Gateway 16, 18 등 큰 숫자의 게이트웨이 색상이 표시되지 않음

**위치**: `/app/admin/air-permit/page.tsx`

## 근본 원인

### 현재 구현 (Line 1101-1108, 1264-1272)

**하드코딩된 게이트웨이 색상 매핑**:
```typescript
const gatewayColors = {
  'gateway1': 'bg-blue-100 text-blue-700 border-blue-300',
  'gateway2': 'bg-green-100 text-green-700 border-green-300',
  'gateway3': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'gateway4': 'bg-red-100 text-red-700 border-red-300',
  'gateway5': 'bg-purple-100 text-purple-700 border-purple-300',
  'gateway6': 'bg-pink-100 text-pink-700 border-pink-300',
}
```

**문제점**:
1. **Gateway 1~6만 정의**되어 있음
2. Gateway 7 이상은 색상 매핑 없음
3. `gatewayColors[gateway]`가 `undefined` 반환
4. Fallback이 빈 문자열 (`''`)로 처리됨
5. **결과**: Gateway 16, 18 등에서 색상 클래스가 적용 안 됨

### 색상 적용 코드 분석

**Line 1120-1122** (목록 카드 내 게이트웨이 표시):
```typescript
const gateway = outletData?.additional_info?.gateway || ''
const gatewayColorClass = gateway ? (gatewayColors[gateway as keyof typeof gatewayColors] || '') : ''
// gateway16 → gatewayColors['gateway16'] → undefined → '' (빈 문자열)
```

**Line 1264-1273** (상세 정보 배출구 색상):
```typescript
const gateway = outlet.additional_info?.gateway || ''
const gatewayColors = { /* ... gateway1~6만 ... */ }
const colorClass = gatewayColors[gateway as keyof typeof gatewayColors] || gatewayColors['']
// gateway16 → gatewayColors['gateway16'] → undefined → gatewayColors[''] → 회색
```

### air-permit-detail과의 차이

**air-permit-detail 페이지** (동적 색상 생성):
```typescript
// Line 26-39: 12개 색상 팔레트
const baseGatewayColors = [
  'bg-blue-200 text-blue-800',
  // ... 12개 색상
]

// Line 42-57: 동적 생성 함수
const generateGatewayInfo = (gatewayValue: string) => {
  const match = gatewayValue.match(/gateway(\d+)/)
  if (match) {
    const num = parseInt(match[1])
    const colorIndex = (num - 1) % baseGatewayColors.length
    return {
      name: `Gateway ${num}`,
      color: baseGatewayColors[colorIndex],  // ✅ Gateway 50까지 지원
      value: gatewayValue
    }
  }
}
```

**air-permit 페이지** (하드코딩):
```typescript
const gatewayColors = {
  'gateway1': 'bg-blue-100...',
  // ... gateway6까지만
}
// ❌ Gateway 7 이상은 undefined
```

## 해결 방안

### 방안 1: 동적 색상 생성 함수 재사용 (권장)

**장점**:
- air-permit-detail과 동일한 로직 사용
- Gateway 1~50 모두 지원
- 유지보수 용이 (한 곳만 수정)

**구현**:
```typescript
// 파일 상단에 동일한 함수 추가
const baseGatewayColors = [
  'bg-blue-100 text-blue-700 border-blue-300',
  'bg-green-100 text-green-700 border-green-300',
  'bg-yellow-100 text-yellow-700 border-yellow-300',
  'bg-red-100 text-red-700 border-red-300',
  'bg-purple-100 text-purple-700 border-purple-300',
  'bg-pink-100 text-pink-700 border-pink-300',
  'bg-indigo-100 text-indigo-700 border-indigo-300',
  'bg-cyan-100 text-cyan-700 border-cyan-300',
  'bg-orange-100 text-orange-700 border-orange-300',
  'bg-teal-100 text-teal-700 border-teal-300',
  'bg-lime-100 text-lime-700 border-lime-300',
  'bg-rose-100 text-rose-700 border-rose-300',
]

const getGatewayColorClass = (gatewayValue: string): string => {
  if (!gatewayValue) {
    return 'bg-gray-100 text-gray-700 border-gray-300'
  }

  const match = gatewayValue.match(/gateway(\d+)/)
  if (match) {
    const num = parseInt(match[1])
    const colorIndex = (num - 1) % baseGatewayColors.length
    return baseGatewayColors[colorIndex]
  }

  return 'bg-gray-100 text-gray-700 border-gray-300'
}

// 사용
const gatewayColorClass = getGatewayColorClass(gateway)
```

### 방안 2: 모든 Gateway를 객체에 명시 (비권장)

**단점**: Gateway 50까지 모두 하드코딩 필요, 확장성 없음

### 방안 3: 유틸리티 함수로 분리 (Best Practice)

**장점**:
- 두 페이지에서 동일한 함수 사용
- 일관성 보장
- 테스트 용이

**구현**:
```typescript
// lib/gateway-colors.ts (새 파일)
export const baseGatewayColors = [
  'bg-blue-100 text-blue-700 border-blue-300',
  'bg-green-100 text-green-700 border-green-300',
  // ... 12개 색상
]

export function getGatewayColorClass(gatewayValue: string): string {
  if (!gatewayValue) {
    return 'bg-gray-100 text-gray-700 border-gray-300'
  }

  const match = gatewayValue.match(/gateway(\d+)/)
  if (match) {
    const num = parseInt(match[1])
    const colorIndex = (num - 1) % baseGatewayColors.length
    return baseGatewayColors[colorIndex]
  }

  return 'bg-gray-100 text-gray-700 border-gray-300'
}

// air-permit/page.tsx
import { getGatewayColorClass } from '@/lib/gateway-colors'

// air-permit-detail/page.tsx
import { getGatewayColorClass } from '@/lib/gateway-colors'
```

## Tailwind Safelist 업데이트 필요

air-permit 페이지는 `-100`, `-700`, `-300` 색상을 사용하므로 safelist에 추가 필요:

```javascript
// tailwind.config.js
safelist: [
  // 기존 -200, -800 (air-permit-detail용)
  'bg-blue-200', 'text-blue-800',
  // ...

  // ✅ 추가: -100, -700, -300 (air-permit용)
  'bg-blue-100', 'text-blue-700', 'border-blue-300',
  'bg-green-100', 'text-green-700', 'border-green-300',
  'bg-yellow-100', 'text-yellow-700', 'border-yellow-300',
  'bg-red-100', 'text-red-700', 'border-red-300',
  'bg-purple-100', 'text-purple-700', 'border-purple-300',
  'bg-pink-100', 'text-pink-700', 'border-pink-300',
  'bg-indigo-100', 'text-indigo-700', 'border-indigo-300',
  'bg-cyan-100', 'text-cyan-700', 'border-cyan-300',
  'bg-orange-100', 'text-orange-700', 'border-orange-300',
  'bg-teal-100', 'text-teal-700', 'border-teal-300',
  'bg-lime-100', 'text-lime-700', 'border-lime-300',
  'bg-rose-100', 'text-rose-700', 'border-rose-300',
  'bg-gray-100', 'text-gray-700', 'border-gray-300',
]
```

## 색상 차이 비교

### air-permit-detail (편집 페이지)
- 배경: `-200` (더 진한 파스텔)
- 텍스트: `-800` (더 어두운 텍스트)
- 테두리: 없음
- **용도**: 배출구 전체 배경 및 라벨

### air-permit (목록 페이지)
- 배경: `-100` (더 연한 파스텔)
- 텍스트: `-700` (약간 밝은 텍스트)
- 테두리: `-300` (중간 톤)
- **용도**: 배출구 카드 배경 및 라벨

## 구현 우선순위

### Phase 1: 즉시 수정 (Quick Fix)
1. air-permit/page.tsx에 동적 색상 생성 함수 추가
2. tailwind.config.js safelist에 -100, -700, -300 추가

### Phase 2: 리팩토링 (Best Practice)
1. `lib/gateway-colors.ts` 유틸리티 파일 생성
2. 두 페이지에서 import하여 사용
3. 색상 팔레트 통일

## 예상 결과

### Before (문제)
```
Gateway 1 → Blue ✅
Gateway 6 → Pink ✅
Gateway 7 → 색상 없음 ❌
Gateway 16 → 색상 없음 ❌
Gateway 18 → 색상 없음 ❌
```

### After (해결)
```
Gateway 1 → Blue (colorIndex 0) ✅
Gateway 6 → Pink (colorIndex 5) ✅
Gateway 7 → Indigo (colorIndex 6) ✅
Gateway 16 → Red (colorIndex 3, 15 % 12 = 3) ✅
Gateway 18 → Pink (colorIndex 5, 17 % 12 = 5) ✅
```

## 테스트 체크리스트

- [ ] Gateway 1~12 색상 표시 확인
- [ ] Gateway 13~24 색상 표시 확인 (두 번째 사이클)
- [ ] Gateway 16 → Red 표시 확인
- [ ] Gateway 18 → Pink 표시 확인
- [ ] Gateway 25~50 색상 표시 확인
- [ ] 미할당 게이트웨이 → Gray 표시 확인
- [ ] 목록 카드 내 게이트웨이 라벨 색상 확인
- [ ] 상세 정보 배출구 카드 배경 색상 확인
