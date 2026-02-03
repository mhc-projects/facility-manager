# 프리미엄 대기필증 추가 모달 디자인

## 개요

admin/air-permit 페이지의 "새 대기필증 추가" 모달을 세계 최고 수준의 UX와 프리미엄 디자인으로 개선합니다.

## 디자인 철학

### 핵심 원칙
1. **Progressive Disclosure**: 단계별 정보 노출로 복잡도 감소
2. **Contextual Guidance**: 각 단계에서 필요한 도움말 제공
3. **Intelligent Defaults**: 스마트한 기본값과 자동완성
4. **Error Prevention**: 사용자 실수를 사전에 방지
5. **Visual Hierarchy**: 명확한 시각적 계층 구조

### 참고 디자인 시스템
- **Stripe**: 결제 흐름의 단계별 진행
- **Linear**: 깔끔하고 효율적인 작업 생성
- **Notion**: 유연하고 직관적인 데이터 입력
- **Vercel**: 프리미엄 그라데이션과 애니메이션
- **Tailwind UI**: 프로페셔널한 폼 디자인

## 현재 문제점

### UX 문제
1. **정보 과부하**: 모든 필드가 한 번에 표시됨
2. **긴 스크롤**: 배출구/시설 정보가 많을 때 탐색 어려움
3. **가이드 부족**: 각 필드 입력 방법 불명확
4. **검증 피드백 부족**: 실시간 유효성 검사 없음
5. **사업장 선택 복잡**: 드롭다운이 직관적이지 않음

### 디자인 문제
1. **평범한 스타일**: 기본 Tailwind 스타일만 사용
2. **애니메이션 부족**: 정적이고 생동감 없음
3. **시각적 위계 부족**: 중요 정보가 눈에 띄지 않음
4. **피드백 부재**: 액션에 대한 시각적 피드백 부족
5. **일관성 부족**: 컴포넌트 간 스타일 통일되지 않음

## 프리미엄 UX 개선 방안

### 1. Multi-Step Wizard 도입

**단계별 진행**:
```
Step 1: 사업장 선택 (Business Selection)
  ├─ 검색 또는 새 사업장 생성
  └─ 자동으로 업종 정보 가져오기

Step 2: 기본 정보 (Basic Information)
  ├─ 업종, 종별
  ├─ 최초신고일, 가동개시일
  └─ 실시간 유효성 검사

Step 3: 배출구 구성 (Outlet Configuration)
  ├─ 배출구 개수 선택
  ├─ 각 배출구 이름 지정
  └─ 게이트웨이 자동 할당 제안

Step 4: 시설 정보 (Facility Details)
  ├─ 배출구별 시설 추가
  ├─ 템플릿 사용 (일반적인 조합)
  └─ 시설 번호 자동 생성

Step 5: 검토 및 확인 (Review & Confirm)
  ├─ 입력한 정보 요약
  ├─ 수정 가능
  └─ 최종 제출
```

**장점**:
- 한 번에 하나의 작업에 집중
- 진행률 표시로 예측 가능성 향상
- 단계별 저장으로 데이터 손실 방지
- 각 단계에서 맞춤형 도움말 제공

### 2. Smart Business Selection

**개선된 사업장 선택 UI**:

```typescript
// 검색 기능 강화
interface BusinessSearchProps {
  // 실시간 검색 (debounced)
  onSearch: (term: string) => void

  // 최근 선택한 사업장
  recentBusinesses: BusinessInfo[]

  // 인기 사업장 (자주 사용)
  popularBusinesses: BusinessInfo[]

  // 빠른 필터
  filters: {
    region: string[]
    businessType: string[]
  }
}
```

**기능**:
- **Command Palette**: Cmd+K로 빠른 검색
- **Fuzzy Search**: 오타 허용 검색
- **Recent & Popular**: 최근/인기 사업장 빠른 선택
- **Quick Filters**: 지역, 업종별 필터링
- **Preview Card**: 사업장 정보 미리보기

**UI 예시**:
```tsx
<BusinessSearchModal>
  {/* 검색 입력 */}
  <SearchInput
    placeholder="사업장 이름, 관리코드로 검색... (⌘K)"
    icon={<Search />}
    autoFocus
  />

  {/* 빠른 선택 */}
  <QuickAccess>
    <Section title="최근 선택">
      {recentBusinesses.map(business => (
        <BusinessCard key={business.id} {...business} />
      ))}
    </Section>

    <Section title="자주 사용">
      {popularBusinesses.map(business => (
        <BusinessCard key={business.id} {...business} />
      ))}
    </Section>
  </QuickAccess>

  {/* 검색 결과 */}
  <SearchResults>
    {filteredBusinesses.map(business => (
      <BusinessCard
        key={business.id}
        {...business}
        onSelect={() => selectBusiness(business)}
      />
    ))}
  </SearchResults>
</BusinessSearchModal>
```

### 3. Intelligent Form Validation

**실시간 검증**:
```typescript
interface FieldValidation {
  // 입력 중 검증
  onBlur: () => ValidationResult

  // 즉시 피드백
  onChange: (value: string) => {
    isValid: boolean
    message?: string
    suggestion?: string
  }

  // 자동 수정
  autoFix?: (value: string) => string
}
```

**검증 예시**:

```tsx
<FormField name="business_type">
  <Label>
    업종
    <Tooltip>제조업, 서비스업 등 사업장의 주요 업종</Tooltip>
  </Label>

  <Input
    value={businessType}
    onChange={handleBusinessTypeChange}
    validation={{
      required: true,
      minLength: 2,
      suggestions: commonBusinessTypes // 자동완성
    }}
  />

  {/* 실시간 피드백 */}
  {validation.error && (
    <ErrorMessage icon={<AlertCircle />}>
      {validation.message}
    </ErrorMessage>
  )}

  {/* 제안 */}
  {validation.suggestion && (
    <Suggestion onClick={() => apply(validation.suggestion)}>
      💡 "{validation.suggestion}"을(를) 사용하시겠습니까?
    </Suggestion>
  )}
</FormField>
```

### 4. Facility Templates

**일반적인 시설 조합 템플릿**:

```typescript
interface FacilityTemplate {
  id: string
  name: string
  description: string
  icon: ReactNode
  outlets: {
    count: number
    defaultNames: string[]
    facilities: {
      discharge: FacilityConfig[]
      prevention: FacilityConfig[]
    }
  }
}

const templates: FacilityTemplate[] = [
  {
    id: 'manufacturing-basic',
    name: '제조업 기본형',
    description: '일반적인 제조업 시설 구성',
    icon: <Factory />,
    outlets: {
      count: 1,
      defaultNames: ['주 배출구'],
      facilities: {
        discharge: [
          { name: '소각시설', capacity: 10, quantity: 1 }
        ],
        prevention: [
          { name: '여과집진시설', capacity: 10, quantity: 1 }
        ]
      }
    }
  },
  {
    id: 'manufacturing-complex',
    name: '제조업 복합형',
    description: '여러 공정이 있는 제조업',
    icon: <Building2 />,
    outlets: {
      count: 3,
      defaultNames: ['주 배출구', '보조 배출구 1', '보조 배출구 2'],
      facilities: {
        discharge: [
          { name: '소각시설', capacity: 10, quantity: 1 },
          { name: '연소시설', capacity: 5, quantity: 2 }
        ],
        prevention: [
          { name: '여과집진시설', capacity: 10, quantity: 1 },
          { name: '흡수시설', capacity: 5, quantity: 2 }
        ]
      }
    }
  },
  {
    id: 'custom',
    name: '직접 구성',
    description: '수동으로 시설 구성',
    icon: <Settings />,
    outlets: {
      count: 1,
      defaultNames: ['배출구 1'],
      facilities: { discharge: [], prevention: [] }
    }
  }
]
```

**템플릿 선택 UI**:
```tsx
<TemplateSelector>
  <SectionTitle>시설 구성 방법 선택</SectionTitle>
  <p className="text-sm text-gray-600 mb-4">
    일반적인 시설 조합을 선택하거나 직접 구성할 수 있습니다.
  </p>

  <TemplateGrid>
    {templates.map(template => (
      <TemplateCard
        key={template.id}
        selected={selectedTemplate === template.id}
        onClick={() => applyTemplate(template)}
      >
        <Icon>{template.icon}</Icon>
        <Title>{template.name}</Title>
        <Description>{template.description}</Description>

        <Preview>
          <Badge>배출구 {template.outlets.count}개</Badge>
          <Badge>
            배출시설 {template.outlets.facilities.discharge.length}개
          </Badge>
          <Badge>
            방지시설 {template.outlets.facilities.prevention.length}개
          </Badge>
        </Preview>
      </TemplateCard>
    ))}
  </TemplateGrid>
</TemplateSelector>
```

### 5. Progress & Autosave

**진행률 표시**:
```tsx
<ProgressBar>
  <Steps>
    {steps.map((step, index) => (
      <Step
        key={step.id}
        active={currentStep === index}
        completed={index < currentStep}
        onClick={() => goToStep(index)}
      >
        <StepNumber>{index + 1}</StepNumber>
        <StepLabel>{step.label}</StepLabel>
        <StepIcon>{step.icon}</StepIcon>
      </Step>
    ))}
  </Steps>

  <ProgressIndicator>
    <ProgressFill width={`${(currentStep / steps.length) * 100}%`} />
  </ProgressIndicator>

  <ProgressText>
    {currentStep + 1} / {steps.length} 완료
  </ProgressText>
</ProgressBar>
```

**자동 저장**:
```typescript
// Draft 저장
const saveDraft = useDebouncedCallback(
  (data: NewPermitData) => {
    localStorage.setItem('air-permit-draft', JSON.stringify({
      data,
      timestamp: Date.now(),
      step: currentStep
    }))
  },
  1000 // 1초 debounce
)

// Draft 복원
useEffect(() => {
  const draft = localStorage.getItem('air-permit-draft')
  if (draft) {
    const { data, timestamp, step } = JSON.parse(draft)

    // 24시간 이내 draft만 복원
    if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
      showRestoreDraftDialog({
        onRestore: () => {
          setNewPermitData(data)
          setCurrentStep(step)
        },
        onDiscard: () => {
          localStorage.removeItem('air-permit-draft')
        }
      })
    }
  }
}, [])
```

## 프리미엄 디자인 시스템

### 1. 색상 팔레트

```typescript
const premiumColors = {
  // Primary - 블루 그라데이션
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },

  // Success - 그린
  success: {
    50: '#f0fdf4',
    500: '#10b981',
    600: '#059669',
    gradient: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
  },

  // Warning - 오렌지
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    600: '#d97706',
    gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  },

  // Error - 레드
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },

  // Neutral - 그레이
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  }
}
```

### 2. 타이포그래피

```css
/* 헤딩 */
.heading-xl {
  font-size: 2rem; /* 32px */
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.heading-lg {
  font-size: 1.5rem; /* 24px */
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.heading-md {
  font-size: 1.25rem; /* 20px */
  font-weight: 600;
  line-height: 1.4;
}

/* 본문 */
.body-lg {
  font-size: 1rem; /* 16px */
  font-weight: 400;
  line-height: 1.6;
}

.body-md {
  font-size: 0.875rem; /* 14px */
  font-weight: 400;
  line-height: 1.5;
}

.body-sm {
  font-size: 0.75rem; /* 12px */
  font-weight: 400;
  line-height: 1.4;
}
```

### 3. 애니메이션

```typescript
// Framer Motion 애니메이션
const animations = {
  // 모달 등장
  modalVariants: {
    hidden: {
      opacity: 0,
      scale: 0.95,
      y: 20
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 300
      }
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 20,
      transition: {
        duration: 0.2
      }
    }
  },

  // 단계 전환
  stepVariants: {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 300
      }
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0,
      transition: {
        duration: 0.2
      }
    })
  },

  // 아이템 등장 (Stagger)
  containerVariants: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  },

  itemVariants: {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 300
      }
    }
  }
}
```

### 4. 그림자 시스템

```css
/* Soft shadows */
.shadow-soft-xs {
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.shadow-soft-sm {
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.06),
              0 1px 2px 0 rgba(0, 0, 0, 0.04);
}

.shadow-soft-md {
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.08),
              0 2px 4px 0 rgba(0, 0, 0, 0.06);
}

.shadow-soft-lg {
  box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.1),
              0 4px 8px 0 rgba(0, 0, 0, 0.08);
}

.shadow-soft-xl {
  box-shadow: 0 12px 24px 0 rgba(0, 0, 0, 0.12),
              0 6px 12px 0 rgba(0, 0, 0, 0.1);
}

/* Colored shadows */
.shadow-primary {
  box-shadow: 0 8px 16px 0 rgba(59, 130, 246, 0.2);
}

.shadow-success {
  box-shadow: 0 8px 16px 0 rgba(16, 185, 129, 0.2);
}
```

### 5. 인터랙션 패턴

```typescript
// Hover 효과
const hoverStyles = {
  card: {
    transform: 'translateY(-2px)',
    boxShadow: '0 12px 24px 0 rgba(0, 0, 0, 0.12)',
    transition: 'all 0.2s ease-out'
  },

  button: {
    transform: 'scale(1.02)',
    transition: 'all 0.15s ease-out'
  },

  input: {
    borderColor: 'rgb(59 130 246)',
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)',
    transition: 'all 0.2s ease-out'
  }
}

// Active 효과
const activeStyles = {
  button: {
    transform: 'scale(0.98)',
    transition: 'all 0.1s ease-out'
  }
}

// Focus 효과
const focusStyles = {
  input: {
    outline: 'none',
    borderColor: 'rgb(59 130 246)',
    boxShadow: '0 0 0 3px rgba(59, 130 246, 0.1)',
    ring: '2px solid rgb(59 130 246)'
  }
}
```

## 컴포넌트 구조

### 메인 모달 컴포넌트

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={animations.modalVariants}
      className="premium-modal"
    >
      {/* 헤더 */}
      <ModalHeader>
        <div>
          <h2 className="heading-lg">새 대기필증 추가</h2>
          <p className="body-sm text-gray-600">
            단계별로 진행하며 정보를 입력하세요
          </p>
        </div>

        {/* 진행률 */}
        <ProgressIndicator
          current={currentStep}
          total={totalSteps}
        />

        {/* 닫기 버튼 */}
        <CloseButton onClick={onClose} />
      </ModalHeader>

      {/* 진행 단계 */}
      <StepIndicator
        steps={steps}
        currentStep={currentStep}
        onStepClick={goToStep}
      />

      {/* 내용 */}
      <ModalBody>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={animations.stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {renderStep(currentStep)}
          </motion.div>
        </AnimatePresence>
      </ModalBody>

      {/* 푸터 */}
      <ModalFooter>
        <AutosaveIndicator lastSaved={lastSavedTime} />

        <ActionButtons>
          {currentStep > 0 && (
            <Button
              variant="ghost"
              onClick={previousStep}
              icon={<ChevronLeft />}
            >
              이전
            </Button>
          )}

          {currentStep < totalSteps - 1 ? (
            <Button
              variant="primary"
              onClick={nextStep}
              disabled={!isStepValid(currentStep)}
              icon={<ChevronRight />}
              iconPosition="right"
            >
              다음
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              icon={<Check />}
            >
              대기필증 등록
            </Button>
          )}
        </ActionButtons>
      </ModalFooter>
    </motion.div>
  )}
</AnimatePresence>
```

### Step 1: Business Selection

```tsx
<StepContainer>
  <StepTitle>사업장 선택</StepTitle>
  <StepDescription>
    대기필증을 등록할 사업장을 선택하세요
  </StepDescription>

  {/* Command 스타일 검색 */}
  <SearchBox>
    <SearchIcon />
    <input
      placeholder="사업장 이름 또는 관리코드로 검색... (⌘K)"
      value={searchTerm}
      onChange={handleSearch}
      onKeyDown={handleKeyDown}
    />
    <Kbd>⌘K</Kbd>
  </SearchBox>

  {/* 빠른 선택 */}
  {!searchTerm && (
    <QuickAccessSection>
      {recentBusinesses.length > 0 && (
        <Section>
          <SectionTitle>최근 선택한 사업장</SectionTitle>
          <BusinessGrid>
            {recentBusinesses.map(business => (
              <BusinessCard
                key={business.id}
                business={business}
                onSelect={() => selectBusiness(business)}
                isRecent
              />
            ))}
          </BusinessGrid>
        </Section>
      )}

      <Section>
        <SectionTitle>자주 사용하는 사업장</SectionTitle>
        <BusinessGrid>
          {popularBusinesses.map(business => (
            <BusinessCard
              key={business.id}
              business={business}
              onSelect={() => selectBusiness(business)}
              isPopular
            />
          ))}
        </BusinessGrid>
      </Section>
    </QuickAccessSection>
  )}

  {/* 검색 결과 */}
  {searchTerm && (
    <SearchResults>
      {isSearching ? (
        <LoadingSpinner />
      ) : filteredBusinesses.length > 0 ? (
        <BusinessList>
          {filteredBusinesses.map((business, index) => (
            <BusinessListItem
              key={business.id}
              business={business}
              onSelect={() => selectBusiness(business)}
              isHighlighted={highlightedIndex === index}
            />
          ))}
        </BusinessList>
      ) : (
        <EmptyState>
          <EmptyIcon />
          <EmptyText>검색 결과가 없습니다</EmptyText>
          <Button
            variant="secondary"
            onClick={openCreateBusinessModal}
          >
            새 사업장 등록
          </Button>
        </EmptyState>
      )}
    </SearchResults>
  )}
</StepContainer>
```

### Step 2: Basic Information

```tsx
<StepContainer>
  <StepTitle>기본 정보</StepTitle>
  <StepDescription>
    대기필증의 기본 정보를 입력하세요
  </StepDescription>

  {/* 선택된 사업장 확인 */}
  <SelectedBusinessCard>
    <BusinessIcon />
    <div>
      <BusinessName>{selectedBusiness.name}</BusinessName>
      <BusinessDetails>
        {selectedBusiness.local_government} · {selectedBusiness.management_code}
      </BusinessDetails>
    </div>
    <ChangeButton onClick={goToStep1}>변경</ChangeButton>
  </SelectedBusinessCard>

  {/* 폼 필드 */}
  <FormGrid>
    {/* 업종 */}
    <FormField>
      <Label>
        업종
        <RequiredBadge />
        <Tooltip>사업장의 주요 업종을 입력하세요</Tooltip>
      </Label>

      <AutocompleteInput
        value={businessType}
        onChange={setBusinessType}
        suggestions={commonBusinessTypes}
        placeholder="예: 제조업, 서비스업"
        validation={{
          required: true,
          minLength: 2
        }}
      />

      {/* 실시간 피드백 */}
      {businessTypeError && (
        <ErrorMessage>{businessTypeError}</ErrorMessage>
      )}

      {/* 제안 */}
      {businessTypeSuggestion && (
        <Suggestion onClick={() => applyBusinessType(businessTypeSuggestion)}>
          💡 "{businessTypeSuggestion}"을(를) 사용하시겠습니까?
        </Suggestion>
      )}
    </FormField>

    {/* 종별 */}
    <FormField>
      <Label>
        종별
        <Tooltip>대기배출시설의 종별을 입력하세요</Tooltip>
      </Label>

      <Input
        value={category}
        onChange={setCategory}
        placeholder="예: 1종, 2종, 3종"
      />
    </FormField>

    {/* 최초신고일 */}
    <FormField>
      <Label>
        최초신고일
        <RequiredBadge />
        <Tooltip>대기배출시설을 최초로 신고한 날짜</Tooltip>
      </Label>

      <DatePicker
        value={firstReportDate}
        onChange={setFirstReportDate}
        placeholder="날짜 선택"
        maxDate={new Date()}
        validation={{
          required: true,
          maxDate: new Date()
        }}
      />
    </FormField>

    {/* 가동개시일 */}
    <FormField>
      <Label>
        가동개시일
        <RequiredBadge />
        <Tooltip>시설의 실제 가동을 시작한 날짜</Tooltip>
      </Label>

      <DatePicker
        value={operationStartDate}
        onChange={setOperationStartDate}
        placeholder="날짜 선택"
        minDate={firstReportDate}
        validation={{
          required: true,
          minDate: firstReportDate
        }}
      />

      {/* 날짜 관계 검증 */}
      {operationStartDateError && (
        <ErrorMessage>
          가동개시일은 최초신고일 이후여야 합니다
        </ErrorMessage>
      )}
    </FormField>
  </FormGrid>
</StepContainer>
```

### Step 3: Outlet Configuration

```tsx
<StepContainer>
  <StepTitle>배출구 구성</StepTitle>
  <StepDescription>
    배출구 개수와 이름을 설정하세요
  </StepDescription>

  {/* 배출구 개수 선택 */}
  <Section>
    <SectionTitle>배출구 개수</SectionTitle>
    <OutletCountSelector>
      {[1, 2, 3, 4, 5, '직접 입력'].map(count => (
        <OutletCountButton
          key={count}
          selected={outletCount === count}
          onClick={() => setOutletCount(count)}
        >
          {count === '직접 입력' ? (
            <>
              <Plus size={16} />
              직접 입력
            </>
          ) : (
            <>
              <Factory size={16} />
              {count}개
            </>
          )}
        </OutletCountButton>
      ))}
    </OutletCountSelector>

    {/* 직접 입력 */}
    {outletCount === '직접 입력' && (
      <CustomCountInput>
        <Input
          type="number"
          min={1}
          max={50}
          value={customOutletCount}
          onChange={setCustomOutletCount}
          placeholder="배출구 개수 입력"
        />
      </CustomCountInput>
    )}
  </Section>

  {/* 배출구 이름 설정 */}
  <Section>
    <div className="flex items-center justify-between">
      <SectionTitle>배출구 이름</SectionTitle>
      <Button
        variant="ghost"
        size="sm"
        onClick={applyDefaultNames}
      >
        기본 이름 사용
      </Button>
    </div>

    <OutletNameList>
      {outlets.map((outlet, index) => (
        <OutletNameItem key={index}>
          <OutletNumber>{index + 1}</OutletNumber>

          <Input
            value={outlet.name}
            onChange={(e) => updateOutletName(index, e.target.value)}
            placeholder={`배출구 ${index + 1}`}
          />

          {/* 게이트웨이 미리보기 */}
          <GatewayPreview gateway={outlet.suggestedGateway}>
            Gateway {outlet.suggestedGateway}
          </GatewayPreview>
        </OutletNameItem>
      ))}
    </OutletNameList>
  </Section>

  {/* 게이트웨이 자동 할당 안내 */}
  <InfoBox>
    <InfoIcon />
    <div>
      <InfoTitle>게이트웨이 자동 할당</InfoTitle>
      <InfoDescription>
        각 배출구에 자동으로 게이트웨이가 할당됩니다.
        나중에 수정할 수 있습니다.
      </InfoDescription>
    </div>
  </InfoBox>
</StepContainer>
```

### Step 4: Facility Details

```tsx
<StepContainer>
  <StepTitle>시설 정보</StepTitle>
  <StepDescription>
    각 배출구의 시설 정보를 입력하세요
  </StepDescription>

  {/* 템플릿 선택 (첫 배출구만) */}
  {currentOutlet === 0 && !templateApplied && (
    <TemplateSection>
      <SectionTitle>빠른 시작</SectionTitle>
      <p className="text-sm text-gray-600 mb-4">
        일반적인 시설 조합을 선택하거나 직접 구성하세요
      </p>

      <TemplateGrid>
        {templates.map(template => (
          <TemplateCard
            key={template.id}
            selected={selectedTemplate === template.id}
            onClick={() => selectTemplate(template)}
          >
            <TemplateIcon>{template.icon}</TemplateIcon>
            <TemplateTitle>{template.name}</TemplateTitle>
            <TemplateDescription>{template.description}</TemplateDescription>

            <TemplateBadges>
              <Badge variant="blue">
                배출구 {template.outlets.count}개
              </Badge>
              <Badge variant="green">
                배출시설 {template.outlets.facilities.discharge.length}개
              </Badge>
              <Badge variant="purple">
                방지시설 {template.outlets.facilities.prevention.length}개
              </Badge>
            </TemplateBadges>
          </TemplateCard>
        ))}
      </TemplateGrid>

      <Divider>또는</Divider>
    </TemplateSection>
  )}

  {/* 배출구별 탭 */}
  <OutletTabs>
    {outlets.map((outlet, index) => (
      <OutletTab
        key={index}
        active={currentOutlet === index}
        onClick={() => setCurrentOutlet(index)}
        completed={isOutletComplete(index)}
      >
        <OutletTabIcon>
          {isOutletComplete(index) ? <Check /> : <Factory />}
        </OutletTabIcon>
        <OutletTabLabel>
          {outlet.name || `배출구 ${index + 1}`}
        </OutletTabLabel>
        {isOutletComplete(index) && (
          <CompleteBadge>완료</CompleteBadge>
        )}
      </OutletTab>
    ))}
  </OutletTabs>

  {/* 현재 배출구 시설 입력 */}
  <OutletContent>
    {/* 배출시설 */}
    <FacilitySection>
      <div className="flex items-center justify-between">
        <SectionTitle>
          <FlameIcon />
          배출시설
        </SectionTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addFacility('discharge')}
          icon={<Plus />}
        >
          시설 추가
        </Button>
      </div>

      {outlets[currentOutlet].dischargeFacilities.length === 0 ? (
        <EmptyState>
          <EmptyIcon />
          <EmptyText>배출시설을 추가하세요</EmptyText>
        </EmptyState>
      ) : (
        <FacilityList>
          {outlets[currentOutlet].dischargeFacilities.map((facility, index) => (
            <FacilityCard key={index}>
              <FacilityHeader>
                <FacilityNumber>#{index + 1}</FacilityNumber>
                <DeleteButton
                  onClick={() => removeFacility('discharge', index)}
                />
              </FacilityHeader>

              <FacilityForm>
                <FormField>
                  <Label>시설명</Label>
                  <AutocompleteInput
                    value={facility.name}
                    onChange={(value) => updateFacility('discharge', index, 'name', value)}
                    suggestions={dischargeFacilitySuggestions}
                    placeholder="예: 소각시설, 연소시설"
                  />
                </FormField>

                <FormRow>
                  <FormField>
                    <Label>용량</Label>
                    <NumberInput
                      value={facility.capacity}
                      onChange={(value) => updateFacility('discharge', index, 'capacity', value)}
                      unit="㎥/min"
                    />
                  </FormField>

                  <FormField>
                    <Label>수량</Label>
                    <NumberInput
                      value={facility.quantity}
                      onChange={(value) => updateFacility('discharge', index, 'quantity', value)}
                      unit="대"
                    />
                  </FormField>
                </FormRow>
              </FacilityForm>
            </FacilityCard>
          ))}
        </FacilityList>
      )}
    </FacilitySection>

    {/* 방지시설 */}
    <FacilitySection>
      <div className="flex items-center justify-between">
        <SectionTitle>
          <ShieldIcon />
          방지시설
        </SectionTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addFacility('prevention')}
          icon={<Plus />}
        >
          시설 추가
        </Button>
      </div>

      {/* Similar structure as discharge facilities */}
    </FacilitySection>
  </OutletContent>

  {/* 다음 배출구로 이동 */}
  {currentOutlet < outlets.length - 1 && (
    <NextOutletButton
      onClick={() => setCurrentOutlet(currentOutlet + 1)}
      disabled={!isOutletComplete(currentOutlet)}
    >
      다음 배출구로 이동
      <ChevronRight />
    </NextOutletButton>
  )}
</StepContainer>
```

### Step 5: Review & Confirm

```tsx
<StepContainer>
  <StepTitle>검토 및 확인</StepTitle>
  <StepDescription>
    입력한 정보를 확인하고 등록하세요
  </StepDescription>

  {/* 요약 카드 */}
  <SummaryCard>
    <SummaryHeader>
      <CheckCircleIcon className="text-green-500" />
      <div>
        <SummaryTitle>등록 준비 완료</SummaryTitle>
        <SummarySubtitle>
          모든 정보가 입력되었습니다
        </SummarySubtitle>
      </div>
    </SummaryHeader>

    {/* 사업장 정보 */}
    <SummarySection>
      <SectionTitle>사업장 정보</SectionTitle>
      <SummaryGrid>
        <SummaryItem>
          <Label>사업장명</Label>
          <Value>{selectedBusiness.name}</Value>
          <EditButton onClick={() => goToStep(0)}>수정</EditButton>
        </SummaryItem>

        <SummaryItem>
          <Label>지자체</Label>
          <Value>{selectedBusiness.local_government}</Value>
        </SummaryItem>

        <SummaryItem>
          <Label>관리코드</Label>
          <Value>{selectedBusiness.management_code}</Value>
        </SummaryItem>
      </SummaryGrid>
    </SummarySection>

    {/* 기본 정보 */}
    <SummarySection>
      <SectionTitle>기본 정보</SectionTitle>
      <SummaryGrid>
        <SummaryItem>
          <Label>업종</Label>
          <Value>{businessType}</Value>
          <EditButton onClick={() => goToStep(1)}>수정</EditButton>
        </SummaryItem>

        <SummaryItem>
          <Label>종별</Label>
          <Value>{category || '미지정'}</Value>
        </SummaryItem>

        <SummaryItem>
          <Label>최초신고일</Label>
          <Value>{formatDate(firstReportDate)}</Value>
        </SummaryItem>

        <SummaryItem>
          <Label>가동개시일</Label>
          <Value>{formatDate(operationStartDate)}</Value>
        </SummaryItem>
      </SummaryGrid>
    </SummarySection>

    {/* 배출구 및 시설 */}
    <SummarySection>
      <SectionTitle>배출구 및 시설</SectionTitle>
      <OutletSummaryList>
        {outlets.map((outlet, index) => (
          <OutletSummaryCard key={index}>
            <OutletSummaryHeader>
              <div>
                <OutletName>
                  {outlet.name || `배출구 ${index + 1}`}
                </OutletName>
                <GatewayBadge gateway={outlet.gateway}>
                  Gateway {outlet.gateway}
                </GatewayBadge>
              </div>
              <EditButton onClick={() => {
                goToStep(3)
                setCurrentOutlet(index)
              }}>
                수정
              </EditButton>
            </OutletSummaryHeader>

            <FacilitySummary>
              <FacilityCount>
                <FlameIcon />
                배출시설 {outlet.dischargeFacilities.length}개
              </FacilityCount>
              <FacilityCount>
                <ShieldIcon />
                방지시설 {outlet.preventionFacilities.length}개
              </FacilityCount>
            </FacilitySummary>

            {/* 시설 목록 */}
            <FacilityDetails>
              {outlet.dischargeFacilities.map((facility, fIndex) => (
                <FacilityItem key={`d-${fIndex}`}>
                  <FlameIcon size={14} />
                  <span>{facility.name}</span>
                  <span className="text-gray-500">
                    {facility.capacity}㎥/min × {facility.quantity}대
                  </span>
                </FacilityItem>
              ))}

              {outlet.preventionFacilities.map((facility, fIndex) => (
                <FacilityItem key={`p-${fIndex}`}>
                  <ShieldIcon size={14} />
                  <span>{facility.name}</span>
                  <span className="text-gray-500">
                    {facility.capacity}㎥/min × {facility.quantity}대
                  </span>
                </FacilityItem>
              ))}
            </FacilityDetails>
          </OutletSummaryCard>
        ))}
      </OutletSummaryList>
    </SummarySection>
  </SummaryCard>

  {/* 최종 확인 */}
  <ConfirmationBox>
    <InfoIcon />
    <div>
      <ConfirmationTitle>최종 확인</ConfirmationTitle>
      <ConfirmationText>
        위 정보로 새 대기필증을 등록하시겠습니까?
        등록 후에도 수정할 수 있습니다.
      </ConfirmationText>
    </div>
  </ConfirmationBox>
</StepContainer>
```

## 반응형 디자인

### 브레이크포인트
```typescript
const breakpoints = {
  mobile: '640px',    // sm
  tablet: '768px',    // md
  desktop: '1024px',  // lg
  wide: '1280px'      // xl
}
```

### 모달 크기
```css
/* Mobile */
@media (max-width: 640px) {
  .premium-modal {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }
}

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) {
  .premium-modal {
    width: 90vw;
    max-width: 720px;
    max-height: 90vh;
    border-radius: 16px;
  }
}

/* Desktop */
@media (min-width: 1025px) {
  .premium-modal {
    width: 85vw;
    max-width: 1200px;
    max-height: 90vh;
    border-radius: 20px;
  }
}
```

## 접근성 (Accessibility)

### 키보드 내비게이션
```typescript
// 키보드 단축키
const shortcuts = {
  'Escape': closeModal,
  'Enter': submitOrNext,
  'ArrowLeft': previousStep,
  'ArrowRight': nextStep,
  'Cmd+K': openCommandPalette,
  'Tab': focusNextField,
  'Shift+Tab': focusPreviousField
}

// Focus trap
useFocusTrap(modalRef, isOpen)

// 첫 요소 자동 포커스
useEffect(() => {
  if (isOpen) {
    firstInputRef.current?.focus()
  }
}, [isOpen])
```

### ARIA 속성
```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">새 대기필증 추가</h2>
  <p id="modal-description">
    단계별로 진행하며 대기필증 정보를 입력하세요
  </p>

  {/* 진행률 */}
  <div role="progressbar" aria-valuenow={currentStep} aria-valuemax={totalSteps}>
    {currentStep} / {totalSteps}
  </div>

  {/* 필수 필드 */}
  <input
    aria-required="true"
    aria-invalid={hasError}
    aria-describedby="field-error"
  />
  {hasError && (
    <span id="field-error" role="alert">
      {errorMessage}
    </span>
  )}
</div>
```

## 성능 최적화

### 코드 스플리팅
```typescript
// 모달 지연 로딩
const PremiumModal = lazy(() => import('./PremiumAirPermitModal'))

// 단계별 컴포넌트 지연 로딩
const Step1 = lazy(() => import('./steps/BusinessSelection'))
const Step2 = lazy(() => import('./steps/BasicInformation'))
const Step3 = lazy(() => import('./steps/OutletConfiguration'))
const Step4 = lazy(() => import('./steps/FacilityDetails'))
const Step5 = lazy(() => import('./steps/ReviewConfirm'))
```

### 메모이제이션
```typescript
// 비용이 큰 계산 메모이제이션
const filteredBusinesses = useMemo(() => {
  return allBusinesses.filter(business =>
    business.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
}, [allBusinesses, searchTerm])

// 콜백 메모이제이션
const handleSearch = useCallback(
  debounce((term: string) => {
    // 검색 로직
  }, 300),
  []
)
```

### 가상화
```typescript
// 긴 목록 가상화
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={500}
  itemCount={businesses.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <BusinessCard
      style={style}
      business={businesses[index]}
      onSelect={selectBusiness}
    />
  )}
</FixedSizeList>
```

## 구현 우선순위

### Phase 1: Core UX (1-2주)
1. ✅ Multi-step wizard 구조
2. ✅ 진행률 표시
3. ✅ 단계별 유효성 검사
4. ✅ 자동 저장 및 Draft 복원

### Phase 2: Premium Design (1주)
1. ✅ 색상 시스템 적용
2. ✅ 애니메이션 추가
3. ✅ 프리미엄 컴포넌트 스타일링
4. ✅ 반응형 디자인

### Phase 3: Smart Features (1-2주)
1. ✅ Business search 개선
2. ✅ Facility templates
3. ✅ 자동완성 및 제안
4. ✅ 실시간 검증

### Phase 4: Polish & Optimization (1주)
1. ✅ 접근성 개선
2. ✅ 성능 최적화
3. ✅ 에러 처리 강화
4. ✅ 사용자 테스트 및 피드백

## 다음 단계

설계 문서를 기반으로 구현을 진행하시겠습니까?

1. **전체 구현**: Multi-step wizard + Premium design 전체 적용
2. **단계별 구현**: Phase 1부터 순차적 구현
3. **부분 개선**: 특정 기능만 먼저 개선 (예: Business search)

어떤 방식으로 진행하시겠습니까?
