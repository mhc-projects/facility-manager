# 배출시설 측정기기 수량 저장 후 상태 업데이트 이슈 분석

## 📋 문제 상황

**발생 시나리오**:
1. 측정기기 수량체크 섹션에 배출시설 6개 정상 표시
2. 배출시설1의 측정기기 수량 저장 버튼 클릭
3. 저장 후 배출시설 4개가 빈값으로 표시됨
4. 배출시설4를 클릭하려 해도 활성화되지 않음
5. 페이지 새로고침 시 모두 정상 표시
6. 데이터는 정상적으로 저장됨

## 🔍 근본 원인 분석

### 1. 상태 업데이트 체인

**파일**: [app/business/[businessName]/BusinessContent.tsx](app/business/[businessName]/BusinessContent.tsx#L763)

```typescript
<EnhancedFacilityInfoSection
  businessName={businessName}
  businessId={businessInfo?.id}
  facilities={facilities}
  facilityNumbering={facilityNumbering}
  systemType={systemType}
  onFacilitiesUpdate={setFacilities}  // ⚠️ 직접 setState 전달
/>
```

**문제점**:
- `onFacilitiesUpdate`에 `setFacilities`를 **직접 전달**
- 이는 React의 **참조 동등성(Reference Equality)** 문제를 일으킴

### 2. 시설 정보 저장 로직

**파일**: [components/sections/EnhancedFacilityInfoSection.tsx:157-202](components/sections/EnhancedFacilityInfoSection.tsx#L157-L202)

```typescript
const handleSaveFacility = async () => {
  if (!editingFacility) return;

  try {
    const updatedFacilities = { ...facilities };  // ⚠️ 얕은 복사
    const facilityArray = facilityType === 'discharge'
      ? updatedFacilities.discharge
      : updatedFacilities.prevention;

    const index = facilityArray?.findIndex(f =>
      f.outlet === editingFacility.outlet && f.number === editingFacility.number
    );

    if (index !== -1 && facilityArray) {
      facilityArray[index] = editingFacility;  // ⚠️ 배열 직접 변경

      // DB 저장
      const response = await fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discharge: updatedFacilities.discharge,
          prevention: updatedFacilities.prevention
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ DB 저장 성공');
        onFacilitiesUpdate(updatedFacilities);  // ⚠️ 얕은 복사된 객체 전달
      }
    }

    setShowAddForm(false);
    setEditingFacility(null);
  } catch (error) {
    console.error('❌ 시설 정보 저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};
```

**문제점**:

1. **얕은 복사 (Shallow Copy)**:
   ```typescript
   const updatedFacilities = { ...facilities };
   ```
   - 최상위 객체만 복사, 내부 배열(`discharge`, `prevention`)은 **참조 유지**

2. **배열 직접 변경 (Mutation)**:
   ```typescript
   facilityArray[index] = editingFacility;
   ```
   - 원본 배열을 직접 변경 → React는 참조가 같으면 리렌더링 안 함

3. **상태 업데이트 후 즉시 API 응답**:
   - API가 최신 데이터를 반환하지만, 클라이언트 상태는 중간 상태
   - Race condition 가능성

### 3. React 상태 업데이트 원리

React는 **참조 동등성(Reference Equality)** 으로 변경 감지:

```typescript
// ❌ 안티패턴: 같은 참조
const updatedFacilities = { ...facilities };
updatedFacilities.discharge[0] = newFacility;  // 배열 참조는 그대로
setFacilities(updatedFacilities);  // React: "discharge 참조 같음 → 변경 없음"

// ✅ 올바른 패턴: 새로운 참조
const updatedFacilities = {
  ...facilities,
  discharge: facilities.discharge.map((f, i) =>
    i === index ? newFacility : f
  )
};
setFacilities(updatedFacilities);  // React: "discharge 참조 다름 → 리렌더링"
```

### 4. 문제 발생 시퀀스

1. **저장 버튼 클릭** → `handleSaveFacility()` 실행
2. **얕은 복사** → `updatedFacilities.discharge`는 원본 배열 참조
3. **배열 변경** → `facilityArray[index] = editingFacility`
4. **상태 업데이트** → `onFacilitiesUpdate(updatedFacilities)`
5. **React 판단**:
   - `facilities` 객체 참조: 변경됨 ✅
   - `facilities.discharge` 배열 참조: 변경 안됨 ❌
6. **부분 리렌더링** → 일부 컴포넌트만 업데이트
7. **UI 불일치** → 4개는 빈값, 나머지는 정상

### 5. 새로고침 시 정상 동작 이유

- 페이지 새로고침 → API에서 최신 데이터 다시 로드
- `setFacilities(facilitiesData.data.facilities)` → 완전히 새로운 객체
- 모든 컴포넌트 정상 렌더링

## 🎯 해결 방안

### 옵션 1: 깊은 복사 (Deep Copy) - 권장

```typescript
const handleSaveFacility = async () => {
  if (!editingFacility) return;

  try {
    // ✅ 깊은 복사: 배열도 새로 생성
    const updatedFacilities = {
      discharge: facilities.discharge.map((f, i) =>
        f.outlet === editingFacility.outlet && f.number === editingFacility.number
          ? editingFacility
          : f
      ),
      prevention: facilities.prevention.map(f => f)  // 방지시설도 새 배열
    };

    // DB 저장
    const response = await fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discharge: updatedFacilities.discharge,
        prevention: updatedFacilities.prevention
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ DB 저장 성공');
      onFacilitiesUpdate(updatedFacilities);  // ✅ 완전히 새로운 객체
    }

    setShowAddForm(false);
    setEditingFacility(null);
  } catch (error) {
    console.error('❌ 시설 정보 저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};
```

**장점**:
- 불변성(Immutability) 보장
- React 리렌더링 확실히 트리거
- 예측 가능한 동작

### 옵션 2: API 응답 데이터 사용

```typescript
const handleSaveFacility = async () => {
  // ... 기존 코드 ...

  const result = await response.json();

  if (result.success) {
    console.log('✅ DB 저장 성공');

    // ✅ API 응답에서 최신 데이터 사용
    if (result.data && result.data.facilities) {
      onFacilitiesUpdate(result.data.facilities);
    } else {
      // Fallback: 로컬 업데이트
      onFacilitiesUpdate(updatedFacilities);
    }
  }
};
```

**장점**:
- 서버와 클라이언트 상태 일치 보장
- Race condition 방지

**단점**:
- API 응답 구조 변경 필요할 수 있음

### 옵션 3: 함수형 상태 업데이트

```typescript
// BusinessContent.tsx
<EnhancedFacilityInfoSection
  onFacilitiesUpdate={(newFacilities) => {
    setFacilities(prev => ({
      discharge: newFacilities.discharge || prev.discharge,
      prevention: newFacilities.prevention || prev.prevention
    }));
  }}
/>
```

**장점**:
- 최신 상태 기반 업데이트
- 동시 업데이트 안전

## 🔧 권장 수정 사항

### 1. EnhancedFacilityInfoSection.tsx 수정

```typescript
const handleSaveFacility = async () => {
  if (!editingFacility) return;

  try {
    // ✅ 깊은 복사로 불변성 보장
    const updatedFacilities = {
      discharge: (facilities?.discharge || []).map((f) =>
        f.outlet === editingFacility.outlet && f.number === editingFacility.number
          ? { ...editingFacility }  // 편집된 시설은 새 객체로
          : { ...f }  // 나머지도 새 객체로 복사
      ),
      prevention: (facilities?.prevention || []).map(f => ({ ...f }))
    };

    console.log('💾 [EnhancedFacilityInfoSection] DB 저장 시작:', businessName);
    const response = await fetch(`/api/facilities-supabase/${encodeURIComponent(businessName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discharge: updatedFacilities.discharge,
        prevention: updatedFacilities.prevention
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ [EnhancedFacilityInfoSection] DB 저장 성공');

      // ✅ API 응답에 최신 데이터가 있으면 사용, 없으면 로컬 업데이트
      const latestFacilities = result.data?.facilities || updatedFacilities;
      onFacilitiesUpdate(latestFacilities);
    } else {
      console.error('❌ [EnhancedFacilityInfoSection] DB 저장 실패:', result.error);
      alert('저장 실패: ' + (result.error || '알 수 없는 오류'));
      return;
    }

    setShowAddForm(false);
    setEditingFacility(null);
  } catch (error) {
    console.error('❌ [EnhancedFacilityInfoSection] 시설 정보 저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};
```

### 2. API 응답 구조 확인

**파일**: [app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)

POST 요청 응답에 `facilities` 데이터 포함 확인:

```typescript
return NextResponse.json({
  success: true,
  message: '시설 정보가 저장되었습니다.',
  data: {
    facilities: updatedFacilities,  // ✅ 최신 데이터 반환
    facilityNumbering: generateFacilityNumbering(airPermitData)
  }
});
```

## 📊 테스트 시나리오

1. **정상 동작 확인**:
   - [ ] 배출시설1 수량 저장
   - [ ] 저장 후 모든 배출시설 정상 표시
   - [ ] 다른 배출시설 클릭 가능

2. **연속 저장 테스트**:
   - [ ] 배출시설1 저장 → 배출시설2 저장
   - [ ] 각 저장 후 UI 정상 유지

3. **동시 저장 테스트**:
   - [ ] 빠른 연속 클릭
   - [ ] Race condition 없이 정상 동작

## 💡 추가 개선 사항

### 1. 낙관적 업데이트 (Optimistic Update)

```typescript
const handleSaveFacility = async () => {
  // 1. 즉시 UI 업데이트 (낙관적)
  onFacilitiesUpdate(updatedFacilities);

  try {
    // 2. API 저장
    const response = await fetch(...);

    if (!result.success) {
      // 3. 실패 시 롤백
      onFacilitiesUpdate(facilities);
      alert('저장 실패');
    }
  } catch (error) {
    // 4. 에러 시 롤백
    onFacilitiesUpdate(facilities);
  }
};
```

### 2. 로딩 상태 추가

```typescript
const [saving, setSaving] = useState(false);

const handleSaveFacility = async () => {
  setSaving(true);
  try {
    // ... 저장 로직 ...
  } finally {
    setSaving(false);
  }
};
```

### 3. React Query / SWR 사용 고려

장기적으로는 상태 관리 라이브러리 도입 검토:
- 자동 캐시 무효화
- 낙관적 업데이트 내장
- 재시도 로직

## 🔗 관련 파일

- [app/business/[businessName]/BusinessContent.tsx:763](app/business/[businessName]/BusinessContent.tsx#L763)
- [components/sections/EnhancedFacilityInfoSection.tsx:157-202](components/sections/EnhancedFacilityInfoSection.tsx#L157-L202)
- [app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)

## 📌 결론

이 문제는 **캐시 문제가 아니라 React 상태 업데이트의 불변성(Immutability) 원칙 위반**으로 인한 것입니다.

**핵심 원인**:
- 얕은 복사 + 배열 직접 변경 → React가 변경 감지 못함
- 부분 리렌더링 → UI 불일치

**해결책**:
- 깊은 복사로 완전히 새로운 객체 생성
- API 응답 데이터 사용으로 서버-클라이언트 동기화
