# 모바일 화면 텍스트 크기 최적화 설계

## 현재 문제점

### 스크린샷 분석
- **모달 제목**: 사업장명이 너무 크고 여러 줄로 나뉘어져 공간 낭비
- **탭 라벨**: "📊 매출 내역", "📝 메모" 텍스트가 큼
- **테이블 헤더**: "기기명", "수량", "매출단가" 등이 큼
- **테이블 데이터**: 숫자와 텍스트가 큼
- **레이블**: "영업점:", "진행 구분:", "제조사:" 등이 큼
- **닫기 버튼**: 하단 버튼이 과도하게 큼

### 균형 문제
- 모바일 화면에서 데스크톱과 동일한 폰트 크기 사용
- 작은 화면에 큰 텍스트로 인한 콘텐츠 압박
- 스크롤 양 증가로 사용자 경험 저하

## 설계 원칙

### 1. 반응형 타이포그래피 전략
```yaml
breakpoint: 768px (md)

desktop_sizing:
  - 넓은 화면에서 가독성 우선
  - 여유로운 공간 활용

mobile_sizing:
  - 콘텐츠 밀도 증가
  - 스크롤 최소화
  - 터치 타겟 크기 유지 (최소 44px)
```

### 2. 타이포그래피 스케일 조정

#### 모달 제목 (Modal Header)
```yaml
current:
  desktop: text-xl (1.25rem / 20px)
  mobile: text-xl (1.25rem / 20px)

optimized:
  desktop: text-xl (1.25rem / 20px)
  mobile: text-base (1rem / 16px)
  reduction: 20%
```

#### 섹션 제목 (Section Headers)
```yaml
current:
  "설치 기기 목록": text-lg font-semibold (1.125rem / 18px)

optimized:
  desktop: text-lg font-semibold (1.125rem / 18px)
  mobile: text-base font-semibold (1rem / 16px)
  reduction: 11%
```

#### 탭 라벨 (MobileTabs)
```yaml
current:
  text-sm (0.875rem / 14px)

optimized:
  keep: text-sm (0.875rem / 14px)
  reason: 이미 적절한 크기, 터치 타겟 고려
```

#### 테이블 헤더
```yaml
current:
  desktop: px-4 py-2 (default browser size ~16px)
  mobile: px-4 py-2 (default browser size ~16px)

optimized:
  desktop: text-sm (0.875rem / 14px)
  mobile: text-xs (0.75rem / 12px)
  reduction: 14%
```

#### 테이블 데이터
```yaml
current:
  desktop: default (1rem / 16px)
  mobile: default (1rem / 16px)

optimized:
  desktop: text-sm (0.875rem / 14px)
  mobile: text-xs (0.75rem / 12px)
  reduction: 25%
```

#### 레이블 및 값 (Info Cards)
```yaml
current:
  label: text-sm font-medium (0.875rem / 14px)
  value: text-sm (0.875rem / 14px)

optimized:
  desktop:
    label: text-sm font-medium (0.875rem / 14px)
    value: text-sm (0.875rem / 14px)
  mobile:
    label: text-xs font-medium (0.75rem / 12px)
    value: text-xs (0.75rem / 12px)
  reduction: 14%
```

#### 닫기 버튼
```yaml
current:
  desktop: px-4 py-2 (default text size)
  mobile: px-4 py-2 (default text size)

optimized:
  desktop: text-base (1rem / 16px)
  mobile: text-sm (0.875rem / 14px)
  reduction: 12.5%
```

## 구현 전략

### 1. Tailwind CSS 반응형 클래스 활용
```typescript
// Before
className="text-xl font-bold"

// After
className="text-base md:text-xl font-bold"
```

### 2. 컴포넌트별 최적화 영역

#### A. 모달 헤더 (Modal Header)
**파일**: `components/business/BusinessRevenueModal.tsx`
**라인**: ~708-717

**변경**:
```tsx
// 사업장명
<h3 className="text-base md:text-xl font-bold text-gray-900">

// "- 기기 상세 정보"
<span className="text-xs md:text-base text-gray-500">

// "최신 계산 완료" 배지
<span className="text-[10px] md:text-xs px-2 py-1">
```

#### B. 탭 컴포넌트
**파일**: `components/ui/MobileTabs.tsx`
**라인**: 53-65

**변경**: 유지 (이미 적절한 크기)

#### C. 기본 정보 카드
**파일**: `components/business/BusinessRevenueModal.tsx`
**라인**: ~798-827

**변경**:
```tsx
// 레이블
<span className="text-xs md:text-sm font-medium text-gray-600">

// 값
<span className="text-xs md:text-sm text-gray-900">

// 진행 구분 배지
<span className="text-[10px] md:text-xs font-medium px-2 py-0.5">
```

#### D. 테이블
**파일**: `components/business/BusinessRevenueModal.tsx`
**라인**: ~831-920

**변경**:
```tsx
// 제목
<h4 className="text-base md:text-lg font-semibold text-gray-900">

// 테이블 헤더
<th className="border border-gray-300 px-2 md:px-4 py-1 md:py-2 text-xs md:text-sm">

// 테이블 데이터
<td className="border border-gray-300 px-2 md:px-4 py-1 md:py-2 text-xs md:text-sm">
```

#### E. 비용 카드들
**파일**: `components/business/BusinessRevenueModal.tsx`
**라인**: ~960-1520

**변경**:
```tsx
// 카드 제목
<h5 className="text-sm md:text-base font-semibold">

// 레이블
<span className="text-xs md:text-sm font-medium">

// 값
<span className="text-xs md:text-sm md:text-base font-bold">

// 입력 필드
<input className="text-xs md:text-sm px-2 md:px-3 py-1 md:py-2">

// 버튼 (작은 버튼들)
<button className="text-xs md:text-sm px-2 md:px-3 py-1">
```

#### F. 순이익 계산 공식
**파일**: `components/business/BusinessRevenueModal.tsx`
**라인**: ~1528-1617

**변경**:
```tsx
// 제목
<h5 className="text-xs md:text-sm font-semibold">

// 계산식 레이블
<span className="text-xs md:text-sm">

// 금액
<span className="text-xs md:text-sm md:text-base font-bold">

// 최종 순이익
<span className="text-sm md:text-lg font-bold">
```

#### G. 닫기 버튼
**파일**: `components/business/BusinessRevenueModal.tsx`
**라인**: ~1667-1673

**변경**:
```tsx
<button className="w-full px-4 py-2 text-sm md:text-base">
  닫기
</button>
```

### 3. 패딩 최적화

테이블과 카드의 패딩도 모바일에서 축소:
```tsx
// Before
className="p-6"

// After
className="p-4 md:p-6"
```

## 예상 효과

### 1. 공간 효율성
```yaml
modal_header_height:
  before: ~80px (제목 2줄 + 패딩)
  after: ~60px (제목 1-2줄 + 작은 패딩)
  saved: 25%

table_row_height:
  before: ~48px
  after: ~36px
  saved: 25%

total_scroll_reduction: ~20-30%
```

### 2. 가독성
- 모바일: 텍스트 크기 감소하지만 여전히 가독 가능 (최소 12px)
- 데스크톱: 변화 없음 (기존 크기 유지)
- 균형: 화면 크기에 맞는 적절한 비율

### 3. 사용자 경험
- 한 화면에 더 많은 정보 표시
- 스크롤 빈도 감소
- 더 빠른 정보 파악

## 접근성 고려사항

### WCAG 2.1 준수
```yaml
minimum_font_size: 12px (0.75rem)
  - AA 기준: 충족 (최소 크기 유지)
  - 사용자 확대 가능

touch_target_size: 44px minimum
  - 버튼 높이: py-2 (0.5rem) + text-sm → ~44px
  - 탭 버튼: py-3 (0.75rem) → 48px 유지

contrast_ratio: 유지
  - 크기 변경은 대비에 영향 없음
```

## 구현 체크리스트

- [ ] 모달 헤더 텍스트 크기 조정
- [ ] 기본 정보 카드 텍스트 크기 조정
- [ ] 테이블 헤더/데이터 텍스트 크기 조정
- [ ] 비용 카드들 텍스트 크기 조정
- [ ] 순이익 계산 공식 텍스트 크기 조정
- [ ] 입력 필드 텍스트 크기 조정
- [ ] 버튼 텍스트 크기 조정
- [ ] 패딩 최적화 (p-4 md:p-6)
- [ ] 모바일 테스트 (375px, 414px)
- [ ] 태블릿 테스트 (768px, 1024px)
- [ ] 접근성 검증 (최소 크기, 터치 타겟)

## 롤백 계획

만약 텍스트가 너무 작다는 피드백이 있을 경우:
```yaml
option_1: text-[13px] md:text-sm (12px → 13px)
option_2: text-xs md:text-sm 일부만 적용
option_3: 중요 정보만 크기 유지 (금액, 제목 등)
```
