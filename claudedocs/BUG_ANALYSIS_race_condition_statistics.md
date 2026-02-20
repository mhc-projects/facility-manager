# 🔴 CRITICAL: 통계카드 일관성 없는 표시 (레이스 컨디션)

**날짜**: 2026-02-20
**우선순위**: 🔴 CRITICAL
**심각도**: HIGH - 시스템 신뢰도 저하
**상태**: 🔍 ANALYZED

---

## 🔍 증상 설명

### 재현 시나리오
1. 개발 서버 재시작
2. 브라우저에서 `/admin/revenue` 페이지 접속 (Ctrl+F5 강제 새로고침)
3. **첫 번째 로딩**: "총 설치비용" = ₩0 표시
4. 몇 초 후 다시 강제 새로고침 (Ctrl+F5)
5. **두 번째 로딩**: "총 설치비용" = ₩2,071,640,000 표시 (정상)

### 관찰된 동작
- **불일치**: 동일한 데이터인데 첫 로딩에서는 0원, 두 번째 로딩에서는 정상 값
- **비결정적(Non-deterministic)**: 때때로 정상, 때때로 0원
- **타이밍 의존적**: "조금 이따가" 다시 새로고침하면 정상 표시

### 사용자 영향
> "이렇게 일관성이 없게 나오면 시스템에 신뢰도가 많이 떨어질꺼야."

✅ **정확한 지적**: 데이터 무결성 신뢰도 심각 손상

---

## 🔬 근본 원인 분석

### 데이터 로딩 체인 (Dependency Chain)

```
1. loadPricingData() 시작
   ↓
2. 6개 API 병렬 호출 (Promise.all)
   - /api/revenue/government-pricing
   - /api/revenue/manufacturer-pricing
   - /api/revenue/sales-office-settings
   - /api/revenue/survey-costs
   - /api/revenue/installation-cost  ← ⚠️ 설치비 데이터
   - /api/revenue/commission-rates
   ↓
3. setPricesLoaded(true)
   setCostSettingsLoaded(true)
   ↓
4. useEffect 트리거 (pricesLoaded 의존성)
   ↓
5. loadBusinesses() 병렬 실행
   ↓
6. businesses 상태 업데이트
   ↓
7. filteredBusinesses useMemo 재계산
   ↓
8. 통계카드 렌더링
```

### 🐛 레이스 컨디션 발생 지점

**문제 위치**: [page.tsx:1100-1104](../app/admin/revenue/page.tsx#L1100-L1104)

```typescript
const filteredBusinesses = useMemo(() => {
  // 가격 데이터가 로드되지 않았으면 빈 배열 반환
  if (!pricesLoaded || !costSettingsLoaded) {
    return [];  // ⚠️ 조건부 조기 반환
  }

  return businesses.filter(business => {
    // ... 필터링 로직 ...
  }).map(business => {
    // ✅ calculateBusinessRevenue() 호출
    const calculatedData = calculateBusinessRevenue(business, pricingData);
    // ... installation_extra_cost 포함 ...
  });
}, [
  businesses,
  pricesLoaded,      // ⚠️ 의존성 1
  costSettingsLoaded, // ⚠️ 의존성 2
  pricingData,
  // ... 기타 필터 의존성들 ...
]);
```

### 🕐 타이밍 문제 (Race Condition)

#### 시나리오 1: 정상 동작 (Lucky Case)
```
t0: 컴포넌트 마운트
t1: loadPricingData() 시작
t2: 6개 API 병렬 호출
t3: ✅ 모든 API 응답 완료 (빠름)
t4: setPricesLoaded(true), setCostSettingsLoaded(true)
t5: loadBusinesses() 시작
t6: businesses 로드 완료
t7: filteredBusinesses 재계산 → pricesLoaded=true → 정상 계산
t8: 통계카드 정상 표시 ✅
```

#### 시나리오 2: 버그 발생 (Unlucky Case)
```
t0: 컴포넌트 마운트
t1: loadPricingData() 시작
t2: 6개 API 병렬 호출
t3: ⚠️ API 응답 지연 (네트워크, 서버 부하)
t4: loadBusinesses() 시작 (pricesLoaded=false 상태)
t5: businesses 로드 완료 (빈 배열 또는 기존 캐시)
t6: filteredBusinesses 재계산 → pricesLoaded=false → [] 반환 ❌
t7: 통계카드 0원 표시 ❌
t8: (늦게) API 응답 완료
t9: setPricesLoaded(true), setCostSettingsLoaded(true)
t10: filteredBusinesses 재계산 → pricesLoaded=true → 정상 계산
t11: 통계카드 정상 표시 (하지만 이미 늦음)
```

### 캐시의 영향

**첫 번째 로딩** (캐시 없음):
- API 응답 시간: 500-1000ms (병렬 호출)
- 레이스 컨디션 확률: **높음** (타이밍 민감)

**두 번째 로딩** (캐시 있음):
```typescript
// page.tsx:425-439
const cachedPricing = getCachedData(CACHE_KEYS.PRICING);
if (cachedPricing) {
  // ... 즉시 상태 설정 ...
  setPricesLoaded(true);      // ⚡ 즉시
  setCostSettingsLoaded(true); // ⚡ 즉시
  return; // API 호출 없음
}
```
- 응답 시간: ~0ms (동기)
- 레이스 컨디션 확률: **낮음** (매우 빠름)

### 추가 문제: 중복 상태 플래그

```typescript
setPricesLoaded(true);      // Line 546
setCostSettingsLoaded(true); // Line 547

// ... 그리고 try-catch에서 또 ...

setPricesLoaded(true);      // Line 595
setCostSettingsLoaded(true); // Line 596
```

**문제**: 동일한 플래그를 두 번 설정 → 코드 중복, 유지보수 어려움

---

## 🎯 영향 분석

### 사용자 경험 영향
- **첫 방문자**: 잘못된 통계 표시 (0원)
- **재방문자**: 정상 표시 (캐시 덕분)
- **신뢰도**: 심각한 손상 ❌

### 비즈니스 영향
- **의사결정 오류**: 잘못된 데이터 기반 결정
- **시스템 신뢰도**: 데이터 정확성 의문
- **사용자 이탈**: "이 시스템 믿을 수 없어"

### 기술적 영향
- **디버깅 어려움**: 비결정적 버그는 재현 어려움
- **테스트 실패**: E2E 테스트에서 간헐적 실패 가능
- **유지보수 부담**: 근본 원인 파악 시간 소요

---

## ✅ 해결 방안

### 방안 1: 로딩 상태 명시적 표시 (Quick Fix) ⭐ 권장

**개념**: 데이터가 완전히 로드되기 전까지 로딩 UI 표시

**구현**:
```typescript
const filteredBusinesses = useMemo(() => {
  // ❌ 조기 반환 대신 빈 배열 계속 사용
  // if (!pricesLoaded || !costSettingsLoaded) {
  //   return [];
  // }

  // ✅ 로딩 중에도 빈 배열 반환하되, 별도 플래그로 UI 제어
  if (!pricesLoaded || !costSettingsLoaded) {
    return [];
  }

  return businesses.filter(...).map(...);
}, [...]);

// 통계카드 렌더링에서:
{!pricesLoaded || !costSettingsLoaded ? (
  <div className="flex items-center gap-2">
    <Loader2 className="w-4 h-4 animate-spin" />
    <span>데이터 로딩 중...</span>
  </div>
) : (
  <p>₩{formatCurrency(totalInstallationCost)}</p>
)}
```

**장점**:
- ✅ 간단한 구현 (1-2시간)
- ✅ 사용자에게 명확한 피드백
- ✅ 레이스 컨디션 영향 최소화

**단점**:
- ⚠️ 근본 원인 해결은 아님 (표시만 개선)

---

### 방안 2: 데이터 로딩 순서 강제 (Proper Fix) ⭐⭐ 최선

**개념**: pricesLoaded가 true가 된 **후**에만 loadBusinesses() 호출

**현재 코드** (Race Condition):
```typescript
// page.tsx:159-173
useEffect(() => {
  if (pricesLoaded) {
    Promise.all([
      loadBusinesses(),      // ⚠️ 가격 데이터와 경쟁
      loadCalculations(),
      loadTaskStatuses()
    ]);
  }
}, [pricesLoaded]);
```

**수정 코드**:
```typescript
useEffect(() => {
  // ✅ pricesLoaded AND costSettingsLoaded 둘 다 확인
  if (pricesLoaded && costSettingsLoaded) {
    console.log('✅ [INIT] 가격 데이터 완전 로드됨 → 사업장 데이터 로드 시작');
    Promise.all([
      loadBusinesses(),
      loadCalculations(),
      loadTaskStatuses()
    ]).then(() => {
      console.log('✅ 전체 데이터 로드 완료');
    });
  }
}, [pricesLoaded, costSettingsLoaded]); // ✅ 두 플래그 모두 의존성
```

**장점**:
- ✅ 근본 원인 해결
- ✅ 데이터 무결성 보장
- ✅ 레이스 컨디션 완전 제거

**단점**:
- ⚠️ 초기 로딩 약간 느려짐 (순차 로딩)

---

### 방안 3: 통합 로딩 플래그 (Best Practice) ⭐⭐⭐ 이상적

**개념**: 여러 플래그 대신 단일 "시스템 준비 완료" 플래그

**구현**:
```typescript
const [isSystemReady, setIsSystemReady] = useState(false);

const loadPricingData = async () => {
  try {
    // ... API 호출 ...

    setOfficialPrices(officialData);
    setManufacturerPrices(manufacturerData);
    setSalesOfficeSettings(salesOfficeData);
    setSurveyCostSettings(surveyCostData);
    setBaseInstallationCosts(installCostData);
    setCommissionRates(commissionData);

    // ✅ 모든 가격 데이터 로드 완료 확인
    const allDataLoaded =
      officialData && manufacturerData && salesOfficeData &&
      surveyCostData && installCostData && commissionData;

    if (allDataLoaded) {
      // ✅ 이제 사업장 데이터 로드 안전
      await Promise.all([
        loadBusinesses(),
        loadCalculations(),
        loadTaskStatuses()
      ]);

      // ✅ 모든 데이터 준비 완료
      setIsSystemReady(true);
    }
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    setIsSystemReady(false); // 명시적 실패 상태
  }
};

const filteredBusinesses = useMemo(() => {
  if (!isSystemReady) {
    return []; // ✅ 단일 플래그로 간단 명확
  }

  return businesses.filter(...).map(...);
}, [isSystemReady, businesses, ...otherDeps]);
```

**장점**:
- ✅ 가장 명확하고 이해하기 쉬움
- ✅ 데이터 무결성 100% 보장
- ✅ 유지보수 용이 (단일 진실의 원천)
- ✅ 에러 처리 개선

**단점**:
- ⚠️ 구조 변경 필요 (2-3시간)

---

## 🛠️ 권장 수정 (단계별)

### 1단계: 즉시 적용 (Quick Win) - 30분

**목표**: 사용자에게 명확한 피드백

```typescript
// 통계카드 렌더링 부분 수정
const totalInstallation = useMemo(() => {
  // ✅ 로딩 중 체크
  if (!pricesLoaded || !costSettingsLoaded) {
    return null; // null = 로딩 중
  }

  return sortedBusinesses.reduce((sum, b) => {
    const baseCost = Number(b.installation_costs) || 0;
    const extraCost = Number(b.installation_extra_cost) || 0;
    return sum + baseCost + extraCost;
  }, 0);
}, [sortedBusinesses, pricesLoaded, costSettingsLoaded]);

// JSX
<p className="...">
  {totalInstallation === null ? (
    <span className="flex items-center gap-1">
      <Loader2 className="w-3 h-3 animate-spin" />
      계산 중...
    </span>
  ) : (
    formatCurrency(totalInstallation)
  )}
</p>
```

### 2단계: 근본 원인 해결 (Proper Fix) - 1시간

**파일**: [page.tsx:159-173](../app/admin/revenue/page.tsx#L159-L173)

```typescript
useEffect(() => {
  // ✅ 두 플래그 모두 true일 때만 데이터 로드
  if (pricesLoaded && costSettingsLoaded) {
    console.log('✅ [INIT] 가격 설정 완료 → 사업장 데이터 로드');

    Promise.all([
      loadBusinesses(),
      loadCalculations(),
      loadTaskStatuses()
    ]).then(() => {
      console.log('✅ [INIT] 전체 데이터 로드 완료');
    }).catch((error) => {
      console.error('❌ [INIT] 데이터 로드 실패:', error);
      // ⚠️ 에러 발생 시 사용자에게 알림
      alert('데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
    });
  }
}, [pricesLoaded, costSettingsLoaded]); // ✅ 두 플래그 의존성
```

### 3단계: 장기 개선 (Best Practice) - 2-3시간

**새 상태 추가**:
```typescript
const [dataLoadingState, setDataLoadingState] = useState<'idle' | 'loading-prices' | 'loading-businesses' | 'ready' | 'error'>('idle');
```

**상태 머신 구현**:
```typescript
const initializeData = async () => {
  try {
    setDataLoadingState('loading-prices');
    await loadPricingData();

    setDataLoadingState('loading-businesses');
    await Promise.all([
      loadBusinesses(),
      loadCalculations(),
      loadTaskStatuses()
    ]);

    setDataLoadingState('ready');
  } catch (error) {
    setDataLoadingState('error');
    console.error('초기화 실패:', error);
  }
};
```

---

## 📊 우선순위 판단

| 방안 | 구현 시간 | 효과 | 위험도 | 권장도 |
|------|-----------|------|--------|--------|
| 1. 로딩 UI 추가 | 30분 | 중간 | 낮음 | ⭐ 즉시 |
| 2. 의존성 수정 | 1시간 | 높음 | 낮음 | ⭐⭐ 우선 |
| 3. 상태 머신 | 2-3시간 | 매우 높음 | 중간 | ⭐⭐⭐ 장기 |

---

## 🧪 테스트 시나리오

### 수정 전 재현 테스트
1. 브라우저 캐시 완전 삭제
2. 개발 서버 재시작
3. Network 탭 열기 → Slow 3G 시뮬레이션
4. 페이지 접속 → 통계카드 0원 확인 ❌

### 수정 후 검증 테스트
1. 동일한 조건으로 테스트
2. 로딩 UI 표시 확인 ✅
3. 모든 데이터 로드 후 정상 값 표시 ✅
4. 여러 번 새로고침 → 일관된 결과 ✅

---

## 📝 추가 권장사항

### 1. 로깅 개선
```typescript
console.log('[DATA-LOAD] Pricing loaded:', pricesLoaded);
console.log('[DATA-LOAD] Cost settings loaded:', costSettingsLoaded);
console.log('[DATA-LOAD] Businesses count:', businesses.length);
console.log('[DATA-LOAD] Filtered businesses count:', filteredBusinesses.length);
```

### 2. 에러 바운더리
```typescript
<ErrorBoundary fallback={<ErrorDisplay />}>
  <StatisticsCards />
</ErrorBoundary>
```

### 3. 성능 모니터링
```typescript
performance.mark('pricing-start');
await loadPricingData();
performance.mark('pricing-end');
performance.measure('pricing-load', 'pricing-start', 'pricing-end');
```

---

**분석자**: Claude Sonnet 4.5 (/sc:analyze)
**날짜**: 2026-02-20
**우선순위**: 🔴 즉시 수정 필요
