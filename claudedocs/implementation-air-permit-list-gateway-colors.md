# Air Permit 목록 페이지 게이트웨이 색상 구현 완료

## 문제 요약

**증상**: air-permit 목록 페이지에서 Gateway 16, 18 등 큰 숫자의 게이트웨이 색상이 표시되지 않음

**근본 원인**: 하드코딩된 게이트웨이 색상 매핑이 gateway1~6만 포함되어 있음

## 구현 완료 내용

### 1. Tailwind Safelist 업데이트

**파일**: `tailwind.config.js`

**추가된 색상 클래스** (air-permit 페이지용 `-100`/`-700`/`-300` 톤):
```javascript
safelist: [
  // ... 기존 air-permit-detail용 -200/-800 색상들 ...

  // ✅ air-permit 페이지용: -100/-700/-300 (연한 파스텔, 밝은 텍스트, 테두리)
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

### 2. 동적 색상 생성 함수 추가

**파일**: `app/admin/air-permit/page.tsx`

**위치**: Line 26-49 (컴포넌트 상단, AirPermitPage 함수 외부)

**추가된 코드**:
```typescript
// ✅ 게이트웨이 색상 팔레트 - air-permit 페이지용 (연한 톤)
const baseGatewayColors = [
  'bg-blue-100 text-blue-700 border-blue-300',      // Gateway 1, 13, 25, 37, 49
  'bg-green-100 text-green-700 border-green-300',   // Gateway 2, 14, 26, 38, 50
  'bg-yellow-100 text-yellow-700 border-yellow-300', // Gateway 3, 15, 27, 39
  'bg-red-100 text-red-700 border-red-300',         // Gateway 4, 16, 28, 40
  'bg-purple-100 text-purple-700 border-purple-300', // Gateway 5, 17, 29, 41
  'bg-pink-100 text-pink-700 border-pink-300',      // Gateway 6, 18, 30, 42
  'bg-indigo-100 text-indigo-700 border-indigo-300', // Gateway 7, 19, 31, 43
  'bg-cyan-100 text-cyan-700 border-cyan-300',      // Gateway 8, 20, 32, 44
  'bg-orange-100 text-orange-700 border-orange-300', // Gateway 9, 21, 33, 45
  'bg-teal-100 text-teal-700 border-teal-300',      // Gateway 10, 22, 34, 46
  'bg-lime-100 text-lime-700 border-lime-300',      // Gateway 11, 23, 35, 47
  'bg-rose-100 text-rose-700 border-rose-300',      // Gateway 12, 24, 36, 48
]

// ✅ 동적 게이트웨이 색상 생성 함수 (Gateway 1~50 지원)
const getGatewayColorClass = (gatewayValue: string): string => {
  if (!gatewayValue) {
    return 'bg-gray-100 text-gray-700 border-gray-300'
  }

  // gateway1, gateway2 등에서 숫자 추출
  const match = gatewayValue.match(/gateway(\d+)/)
  if (match) {
    const num = parseInt(match[1])
    const colorIndex = (num - 1) % baseGatewayColors.length
    return baseGatewayColors[colorIndex]
  }

  // 숫자 추출 실패 시 회색 반환
  return 'bg-gray-100 text-gray-700 border-gray-300'
}
```

### 3. 하드코딩된 색상 매핑 제거 및 함수 사용

#### 3-1. 목록 카드 내 게이트웨이 라벨 (Line ~1145)

**Before** (삭제됨):
```typescript
// 게이트웨이 색상 매핑
const gatewayColors = {
  'gateway1': 'bg-blue-100 text-blue-700 border-blue-300',
  'gateway2': 'bg-green-100 text-green-700 border-green-300',
  'gateway3': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'gateway4': 'bg-red-100 text-red-700 border-red-300',
  'gateway5': 'bg-purple-100 text-purple-700 border-purple-300',
  'gateway6': 'bg-pink-100 text-pink-700 border-pink-300',
}

// 게이트웨이 정보 가져오기
const outletData = permit.outlets?.find((o: any) => o.id === outlet.outletId) as any
const gateway = outletData?.additional_info?.gateway || ''
const gatewayColorClass = gateway ? (gatewayColors[gateway as keyof typeof gatewayColors] || '') : ''
```

**After** (현재):
```typescript
// 게이트웨이 정보 가져오기
const outletData = permit.outlets?.find((o: any) => o.id === outlet.outletId) as any
const gateway = outletData?.additional_info?.gateway || ''
const gatewayColorClass = getGatewayColorClass(gateway)
```

#### 3-2. 상세 정보 배출구 카드 (Line ~1288)

**Before** (삭제됨):
```typescript
// 게이트웨이 색상 결정
const gateway = outlet.additional_info?.gateway || ''
const gatewayColors = {
  'gateway1': 'bg-blue-100 border-blue-300 text-blue-800',
  'gateway2': 'bg-green-100 border-green-300 text-green-800',
  'gateway3': 'bg-yellow-100 border-yellow-300 text-yellow-800',
  'gateway4': 'bg-red-100 border-red-300 text-red-800',
  'gateway5': 'bg-purple-100 border-purple-300 text-purple-800',
  'gateway6': 'bg-pink-100 border-pink-300 text-pink-800',
  '': 'bg-gray-100 border-gray-300 text-gray-800'
}
const colorClass = gatewayColors[gateway as keyof typeof gatewayColors] || gatewayColors['']
```

**After** (현재):
```typescript
// 게이트웨이 색상 결정 (동적 생성 함수 사용)
const gateway = outlet.additional_info?.gateway || ''
const colorClass = getGatewayColorClass(gateway)
```

## 색상 매핑 시스템

### 게이트웨이 번호 → 색상 인덱스

**공식**: `colorIndex = (gatewayNumber - 1) % 12`

**매핑 테이블**:
```
Gateway  | colorIndex | Color     | 클래스
---------|------------|-----------|----------------------------------
1, 13, 25, 37, 49 | 0  | Blue      | bg-blue-100 text-blue-700 border-blue-300
2, 14, 26, 38, 50 | 1  | Green     | bg-green-100 text-green-700 border-green-300
3, 15, 27, 39     | 2  | Yellow    | bg-yellow-100 text-yellow-700 border-yellow-300
4, 16, 28, 40     | 3  | Red       | bg-red-100 text-red-700 border-red-300
5, 17, 29, 41     | 4  | Purple    | bg-purple-100 text-purple-700 border-purple-300
6, 18, 30, 42     | 5  | Pink      | bg-pink-100 text-pink-700 border-pink-300
7, 19, 31, 43     | 6  | Indigo    | bg-indigo-100 text-indigo-700 border-indigo-300
8, 20, 32, 44     | 7  | Cyan      | bg-cyan-100 text-cyan-700 border-cyan-300
9, 21, 33, 45     | 8  | Orange    | bg-orange-100 text-orange-700 border-orange-300
10, 22, 34, 46    | 9  | Teal      | bg-teal-100 text-teal-700 border-teal-300
11, 23, 35, 47    | 10 | Lime      | bg-lime-100 text-lime-700 border-lime-300
12, 24, 36, 48    | 11 | Rose      | bg-rose-100 text-rose-700 border-rose-300
```

### Gateway 16 예시

```javascript
const gatewayValue = "gateway16"
const num = 16
const colorIndex = (16 - 1) % 12  // = 15 % 12 = 3

baseGatewayColors[3]  // = 'bg-red-100 text-red-700 border-red-300'
```

### Gateway 18 예시

```javascript
const gatewayValue = "gateway18"
const num = 18
const colorIndex = (18 - 1) % 12  // = 17 % 12 = 5

baseGatewayColors[5]  // = 'bg-pink-100 text-pink-700 border-pink-300'
```

## 두 페이지 간 색상 차이

### air-permit-detail (편집 페이지)
- **색상 톤**: `-200` (진한 파스텔) / `-800` (어두운 텍스트)
- **용도**: 배출구 전체 배경 및 라벨 (강조 효과)
- **예시**: `bg-red-200 text-red-800`

### air-permit (목록 페이지)
- **색상 톤**: `-100` (연한 파스텔) / `-700` (밝은 텍스트) / `-300` (테두리)
- **용도**: 배출구 카드 배경 및 라벨 (부드러운 표현)
- **예시**: `bg-red-100 text-red-700 border-red-300`

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

## 다음 단계

### 1. 빌드 및 테스트

```bash
# 프로젝트 재빌드 (Tailwind safelist 적용)
npm run build

# 개발 서버 재시작 (권장)
npm run dev
```

### 2. 브라우저 캐시 삭제

Tailwind CSS 변경사항 적용을 위해:
- **하드 새로고침**: `Cmd + Shift + R` (Mac) / `Ctrl + Shift + R` (Windows)
- 또는 개발자 도구 (F12) 열고 일반 새로고침

### 3. 테스트 체크리스트

- [ ] **목록 페이지**: air-permit 페이지에서 Gateway 1~12 색상 표시 확인
- [ ] **목록 페이지**: Gateway 13~24 색상 표시 확인 (두 번째 사이클)
- [ ] **목록 페이지**: Gateway 16 → Red 색상 표시 확인
- [ ] **목록 페이지**: Gateway 18 → Pink 색상 표시 확인
- [ ] **목록 페이지**: Gateway 25~50 색상 표시 확인
- [ ] **상세 정보**: 선택한 permit 상세에서 배출구 카드 배경 색상 확인
- [ ] **미할당 게이트웨이**: Gateway 미선택 시 Gray 색상 표시 확인

### 4. 디버깅 (문제 발생 시)

**색상이 여전히 안 보이는 경우**:
1. 재빌드 했는가? (`npm run build`)
2. 개발 서버 재시작 했는가?
3. 브라우저 하드 새로고침 (Cmd+Shift+R)
4. 개발자 도구 Elements 탭에서 클래스 적용 확인
5. Computed 스타일에서 색상 값 확인

**CSS 확인 명령어**:
```bash
# 빌드된 CSS에서 색상 클래스 확인
grep -r "bg-red-100" .next/static/css/

# 모든 safelist 클래스 확인
grep -E "bg-(blue|green|yellow|red|purple|pink|indigo|cyan|orange|teal|lime|rose)-100" .next/static/css/
```

## 구현 완료 요약

✅ **Tailwind safelist**에 `-100`/`-700`/`-300` 색상 클래스 13개 × 3 = 39개 추가
✅ **동적 색상 생성 함수** `getGatewayColorClass` 구현 (Gateway 1~50 지원)
✅ **하드코딩된 색상 매핑 제거** (gateway1-6 제한 해결)
✅ **두 위치에서 함수 사용**:
   - 목록 카드 내 게이트웨이 라벨 (Line ~1145)
   - 상세 정보 배출구 카드 배경 (Line ~1288)

**기대 효과**:
- Gateway 1~50 모든 번호에서 정상 색상 표시 ✅
- Gateway 16 → Red 색상 표시 ✅
- Gateway 18 → Pink 색상 표시 ✅
- air-permit-detail과 동일한 동적 색상 생성 로직 사용 ✅
