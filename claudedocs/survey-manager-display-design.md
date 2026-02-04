# 실사관리 담당자 정보 표시 기능 설계

## 📋 요구사항

**목적**: admin/business 페이지 상세모달의 "업무 진행 현황" → "팀 공유 사항" 섹션에 실사관리 담당자 정보를 추가 표시

**배경**:
- 현재 수정 모달에서 실사관리 섹션의 담당자 정보를 입력할 수 있음
- 하지만 상세모달(읽기 전용 뷰)의 "팀 공유 사항"에는 실사관리 담당자 정보가 표시되지 않음
- 설치 담당자, 주문 담당자는 표시되지만 실사 담당자는 누락됨

## 🎯 설계 목표

1. **정보 가시성 향상**: 실사관리 담당자 정보를 팀 공유 사항에서 확인 가능하도록 함
2. **일관성 유지**: 기존 UI 디자인 패턴과 일관성 있는 표시 방식
3. **실용성 우선**: 가장 중요한 실사 담당자 정보만 간결하게 표시

## 📊 현재 상태 분석

### 데이터 모델 (UnifiedBusinessInfo 인터페이스)

실사 관리 관련 필드:
```typescript
// 실사 관리 필드
estimate_survey_manager?: string | null              // 견적실사 담당자
estimate_survey_date?: string | null                 // 견적실사 날짜
estimate_survey_start_time?: string | null           // 견적실사 시작시간
estimate_survey_end_time?: string | null             // 견적실사 종료시간

pre_construction_survey_manager?: string | null      // 착공실사 담당자
pre_construction_survey_date?: string | null         // 착공실사 날짜
pre_construction_survey_start_time?: string | null   // 착공실사 시작시간
pre_construction_survey_end_time?: string | null     // 착공실사 종료시간

completion_survey_manager?: string | null            // 준공실사 담당자
completion_survey_date?: string | null               // 준공실사 날짜
completion_survey_start_time?: string | null         // 준공실사 시작시간
completion_survey_end_time?: string | null           // 준공실사 종료시간
```

### 현재 UI 구조

**위치**: `components/business/modals/BusinessDetailModal.tsx` Line 586-605

```tsx
{/* Team Communication */}
<div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm">
  <div className="flex items-center text-xs sm:text-sm md:text-base text-gray-600 mb-2">
    <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-500" />
    팀 공유 사항
  </div>
  <div className="space-y-1.5 sm:space-y-2">
    {/* 현재 표시되는 정보 */}
    <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-gray-50 rounded-lg">
      • 설치 담당자: {business.installation_team || '미배정'}
    </div>
    <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-blue-50 rounded-lg">
      • 주문 담당자: {business.order_manager || '미배정'}
    </div>
    {business.installation_date && (
      <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-green-50 rounded-lg">
        • 설치 예정일: {formatDate(business.installation_date)}
      </div>
    )}
  </div>
</div>
```

## 🎨 UI/UX 설계

### 표시 전략

**원칙**:
1. **담당자 이름만 표시**: 날짜/시간 정보는 수정 모달에서만 확인 (팀 공유 사항은 간결함 우선)
2. **조건부 표시**: 실사 담당자가 지정된 경우만 표시
3. **시각적 구분**: 색상 구분으로 실사 유형 구별
4. **반응형 디자인**: 기존 패턴과 동일한 반응형 스타일 적용

### 색상 스키마

```typescript
const surveyColors = {
  estimate: 'bg-purple-50',      // 견적실사 - 보라색
  preConstruction: 'bg-orange-50', // 착공실사 - 주황색
  completion: 'bg-teal-50'       // 준공실사 - 청록색
}
```

**색상 선택 이유**:
- `purple`: 견적(초기 단계) - 기존 팀 공유 사항에서 미사용 색상
- `orange`: 착공(중간 단계) - 현재 "업무 진행 현황" 섹션의 메인 색상과 조화
- `teal`: 준공(최종 단계) - 완료/성공의 의미로 green 계열

### 표시 순서

```
1. 설치 담당자 (기존)
2. 주문 담당자 (기존)
3. 견적실사 담당자 (신규) - 있는 경우만
4. 착공실사 담당자 (신규) - 있는 경우만
5. 준공실사 담당자 (신규) - 있는 경우만
6. 설치 예정일 (기존)
```

## 💻 구현 설계

### 1. 컴포넌트 수정

**파일**: `components/business/modals/BusinessDetailModal.tsx`
**위치**: Line 586-605 (팀 공유 사항 섹션)

### 2. 코드 구조

```tsx
{/* Team Communication */}
<div className="bg-white rounded-lg p-3 sm:p-4 shadow-sm">
  <div className="flex items-center text-xs sm:text-sm md:text-base text-gray-600 mb-2">
    <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-500" />
    팀 공유 사항
  </div>
  <div className="space-y-1.5 sm:space-y-2">
    {/* 기존: 설치 담당자 */}
    <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-gray-50 rounded-lg">
      • 설치 담당자: {business.installation_team || '미배정'}
    </div>

    {/* 기존: 주문 담당자 */}
    <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-blue-50 rounded-lg">
      • 주문 담당자: {business.order_manager || '미배정'}
    </div>

    {/* 신규: 견적실사 담당자 */}
    {business.estimate_survey_manager && (
      <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-purple-50 rounded-lg">
        • 견적실사 담당자: {business.estimate_survey_manager}
      </div>
    )}

    {/* 신규: 착공실사 담당자 */}
    {business.pre_construction_survey_manager && (
      <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-orange-50 rounded-lg">
        • 착공실사 담당자: {business.pre_construction_survey_manager}
      </div>
    )}

    {/* 신규: 준공실사 담당자 */}
    {business.completion_survey_manager && (
      <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-teal-50 rounded-lg">
        • 준공실사 담당자: {business.completion_survey_manager}
      </div>
    )}

    {/* 기존: 설치 예정일 */}
    {business.installation_date && (
      <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-green-50 rounded-lg">
        • 설치 예정일: {formatDate(business.installation_date)}
      </div>
    )}
  </div>
</div>
```

## 📱 반응형 디자인

기존 패턴과 동일한 반응형 클래스 사용:
- `text-xs sm:text-sm`: 모바일에서 작은 텍스트, 데스크톱에서 조금 큰 텍스트
- `p-2 sm:p-3`: 모바일에서 작은 패딩, 데스크톱에서 중간 패딩
- `space-y-1.5 sm:space-y-2`: 아이템 간 간격 조정

## 🎯 사용자 경험 개선

### Before (현재)
```
팀 공유 사항
• 설치 담당자: 홍길동
• 주문 담당자: 김철수
• 설치 예정일: 2024-03-15
```

### After (개선 후)
```
팀 공유 사항
• 설치 담당자: 홍길동
• 주문 담당자: 김철수
• 견적실사 담당자: 박실사  (보라색 배경)
• 착공실사 담당자: 이실사  (주황색 배경)
• 준공실사 담당자: 최실사  (청록색 배경)
• 설치 예정일: 2024-03-15
```

## ✅ 검증 시나리오

### 1. 기본 표시 검증
- [ ] 실사 담당자가 없는 경우: 기존과 동일하게 표시
- [ ] 견적실사 담당자만 있는 경우: 보라색 배경으로 표시
- [ ] 착공실사 담당자만 있는 경우: 주황색 배경으로 표시
- [ ] 준공실사 담당자만 있는 경우: 청록색 배경으로 표시
- [ ] 모든 실사 담당자가 있는 경우: 3개 모두 순서대로 표시

### 2. 반응형 검증
- [ ] 모바일 화면 (< 640px): 텍스트 크기 및 패딩 축소 확인
- [ ] 태블릿 화면 (640px ~ 768px): 중간 크기 적용 확인
- [ ] 데스크톱 화면 (> 768px): 최대 크기 적용 확인

### 3. 데이터 검증
- [ ] null/undefined 처리: 오류 없이 숨김 처리 확인
- [ ] 빈 문자열 처리: 표시되지 않는지 확인
- [ ] 긴 이름 처리: 텍스트 잘림/줄바꿈 적절한지 확인

## 🔄 향후 확장 가능성

**현재 설계**: 담당자 이름만 표시 (간결함 우선)

**향후 고려사항** (요청 시 확장 가능):
1. **날짜 정보 추가**: 실사 예정일/완료일 표시
2. **시간 정보 추가**: 실사 시간 범위 표시 (예: 09:00 ~ 11:00)
3. **상태 표시**: 실사 완료 여부 아이콘으로 표시
4. **클릭 이벤트**: 클릭 시 상세 정보 모달/툴팁 표시

**확장 예시** (날짜 포함):
```tsx
{business.estimate_survey_manager && (
  <div className="text-xs sm:text-sm text-gray-700 p-2 sm:p-3 bg-purple-50 rounded-lg">
    <div>• 견적실사 담당자: {business.estimate_survey_manager}</div>
    {business.estimate_survey_date && (
      <div className="text-[10px] sm:text-xs text-gray-500 ml-3 mt-1">
        일정: {formatDate(business.estimate_survey_date)}
      </div>
    )}
  </div>
)}
```

## 📝 구현 체크리스트

- [ ] BusinessDetailModal.tsx Line 586-605 수정
- [ ] 견적실사 담당자 조건부 표시 추가
- [ ] 착공실사 담당자 조건부 표시 추가
- [ ] 준공실사 담당자 조건부 표시 추가
- [ ] 색상 스키마 적용 (purple/orange/teal)
- [ ] 반응형 클래스 적용
- [ ] 빌드 테스트
- [ ] 다양한 데이터 시나리오 테스트
- [ ] 모바일/태블릿/데스크톱 화면 테스트
- [ ] 커밋 및 푸시

## 🎨 디자인 참고

**기존 스타일 패턴 준수**:
- 같은 섹션 내 다른 항목과 동일한 간격, 패딩, 텍스트 크기
- 조건부 렌더링으로 불필요한 공간 차지 방지
- 색상으로 정보 유형 구분 (기능적 색상 사용)

**색상 선택 기준**:
- 기존 사용 색상: `gray-50` (설치), `blue-50` (주문), `green-50` (설치예정일)
- 신규 색상: `purple-50` (견적실사), `orange-50` (착공실사), `teal-50` (준공실사)
- 모두 같은 `-50` 명도로 통일하여 시각적 조화 유지

## 📊 영향 분석

**영향 범위**: 최소 (단일 컴포넌트 내 추가만 필요)

**장점**:
- ✅ 팀 공유 사항에서 실사 담당자 정보 즉시 확인 가능
- ✅ 수정 모달을 열지 않고도 필요한 정보 파악 가능
- ✅ 업무 협업 효율성 증가
- ✅ 정보 일관성 향상 (설치/주문 담당자와 동등한 중요도로 표시)

**단점/제약**:
- ⚠️ 날짜/시간 정보는 표시하지 않음 (간결함 우선)
- ⚠️ 실사 담당자가 없는 경우 표시되지 않음 (의도된 동작)

**리스크**: 없음 (조건부 렌더링으로 안전하게 구현)
