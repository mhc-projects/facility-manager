# 배출시설 중복 검증 로직 분석 리포트

## 📋 문제 요약
**사업장**: business/다산다가구
**증상**: 측정기기 수량체크 섹션에서 배출시설 수량이 실제보다 적게 표시됨
**원인**: 배출시설 사진 업로드 섹션과 동일한 과도한 중복 검증 로직

## 🔍 근본 원인 분석

### 1. 배출시설 사진 업로드 섹션의 중복 검증 로직

**위치**: [components/ImprovedFacilityPhotoSection.tsx:1466-1507](components/ImprovedFacilityPhotoSection.tsx#L1466-L1507)

```typescript
// 중복 제거 로직
const seenDischarge = new Set<string>();
facilities.discharge.forEach(facility => {
  // id가 있으면 id 기반, 없으면 기존 방식 (하위 호환성)
  const uniqueKey = (facility as any).id
    ? `id-${(facility as any).id}`
    : `${facility.outlet}-${facility.number}-${facility.capacity || 'unknown'}-${facility.name}`;

  if (seenDischarge.has(uniqueKey)) {
    console.warn(`⚠️ [DUPLICATE] 중복 배출시설 제거: ${uniqueKey}`);
    return; // 중복 건너뛰기 ❌ 문제 발생 지점
  }
  seenDischarge.add(uniqueKey);
  // ... 시설 추가 로직
});
```

**문제점**:
- `outlet-number-capacity-name` 조합으로 중복 판별
- **동일 배출구에 같은 이름·용량의 시설이 여러 개 있으면 첫 번째만 표시**
- 예: 배출구1에 "보일러-100kW" 3대 → 1대만 표시됨

### 2. 측정기기 수량체크 섹션의 시설 수량 계산

**위치**: [components/sections/EquipmentFieldCheckSection.tsx:220-231](components/sections/EquipmentFieldCheckSection.tsx#L220-L231)

```typescript
{facilityNumbering && (
  <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
    <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
      <FileText className="w-4 h-4" />
      대기필증 기준 시설 정보
    </p>
    <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
      <div>배출시설: <span className="font-bold">{facilityNumbering.dischargeCount}개</span></div>
      <div>방지시설: <span className="font-bold">{facilityNumbering.preventionCount}개</span></div>
    </div>
  </div>
)}
```

**데이터 흐름**:
1. `facilityNumbering` 데이터가 BusinessContent에서 전달됨
2. 이 데이터는 API `/api/facilities-supabase/[businessName]`에서 생성됨
3. API는 `generateFacilityNumbering()` 함수 사용

### 3. facilityNumbering 생성 로직

**위치**: [utils/facility-numbering.ts:108-209](utils/facility-numbering.ts#L108-L209)

```typescript
export function generateFacilityNumbering(
  airPermit: AirPermitWithOutlets
): FacilityNumberingResult {
  const outlets = airPermit.outlets || []
  const sortedOutlets = [...outlets].sort((a, b) => a.outlet_number - b.outlet_number)

  // 배출시설 번호 생성
  const dischargeFacilityNumbers = generateDischargeFacilityNumbers(sortedOutlets)

  // ...

  // 각 배출구별로 시설 번호 정보 생성
  for (const outlet of sortedOutlets) {
    // 배출시설 처리
    if (outlet.discharge_facilities) {
      for (const facility of outlet.discharge_facilities) {
        for (let i = 0; i < facility.quantity; i++) {  // ✅ quantity 고려
          const facilityKey = `${facility.id}_${i}`
          const facilityNumber = dischargeFacilityNumbers.facilityNumbers.get(facilityKey)
          // ...
        }
      }
    }
  }
}
```

**정상 동작**:
- `quantity` 필드를 기반으로 시설 수량 계산
- 예: `{ name: "보일러", quantity: 3 }` → "배1", "배2", "배3" 생성

### 4. API 응답 데이터 구조

**위치**: [app/api/facilities-supabase/[businessName]/route.ts:527-574](app/api/facilities-supabase/[businessName]/route.ts#L527-L574)

```typescript
// 시설 수량 계산 (quantity 고려)
const dischargeCount = facilities.discharge.reduce((total, facility) =>
  total + facility.quantity, 0
);
const preventionCount = facilities.prevention.reduce((total, facility) =>
  total + facility.quantity, 0
);

// 결과 데이터 구성
const resultData = {
  facilities,
  outlets: analyzeOutlets(facilities),
  dischargeCount,  // ✅ 정상: quantity 기반 합계
  preventionCount, // ✅ 정상: quantity 기반 합계
  businessInfo,
  facilityNumbering: {
    ...facilityNumbering,
    outlets: facilityNumbering.outlets.map(outlet => ({
      ...outlet,
      id: outlet.outletId,
      gateway_number: gatewayInfo.gateway_number || null,
      vpn_type: gatewayInfo.vpn_type || null
    }))
  },
  lastUpdated: new Date().toISOString()
};
```

## 🎯 문제 핵심

### API는 정상 동작
- `facilityNumbering.totalDischargeFacilities`: quantity 기반 정확한 수량
- `dischargeCount`: quantity 합계로 정확한 계산

### 문제는 UI 렌더링 단계
1. **ImprovedFacilityPhotoSection.tsx**:
   - `facilitiesByOutlet()` 함수가 과도한 중복 제거 수행
   - `outlet-number-capacity-name` 조합으로 uniqueKey 생성
   - 동일 uniqueKey 발견 시 첫 번째만 유지, 나머지 제거

2. **EquipmentFieldCheckSection.tsx**:
   - 직접적인 영향은 없음 (API 데이터 그대로 표시)
   - 하지만 `facilityNumbering` prop이 전달되지 않으면 섹션 미표시
   - BusinessContent에서 전달되는 `facilityNumbering` 데이터는 정상

## 🔧 해결 방안

### 옵션 1: ID 기반 중복 제거로 변경 (권장)

**ImprovedFacilityPhotoSection.tsx** 수정:

```typescript
// 현재 (문제 있음)
const uniqueKey = (facility as any).id
  ? `id-${(facility as any).id}`
  : `${facility.outlet}-${facility.number}-${facility.capacity || 'unknown'}-${facility.name}`;

// 제안 (올바른 방식)
const uniqueKey = (facility as any).id
  ? `id-${(facility as any).id}`
  : `${facility.outlet}-${facility.number}-${facility.capacity || 'unknown'}-${facility.name}-${index}`;
  // index 추가로 같은 시설도 구분
```

**장점**:
- ID가 있으면 완벽하게 구분 가능
- ID가 없어도 index로 구분 가능
- 기존 로직 최소 변경

### 옵션 2: quantity 기반 확장 로직

```typescript
facilities.discharge.forEach(facility => {
  const baseKey = `${facility.outlet}-${facility.name}-${facility.capacity}`;

  // quantity만큼 반복하여 별도 항목으로 추가
  for (let i = 0; i < facility.quantity; i++) {
    const uniqueKey = (facility as any).id
      ? `id-${(facility as any).id}-${i}`
      : `${baseKey}-${i}`;

    if (!seenDischarge.has(uniqueKey)) {
      seenDischarge.add(uniqueKey);
      grouped[facility.outlet].discharge.push({
        ...facility,
        _uniqueIndex: i  // 고유 인덱스 추가
      });
    }
  }
});
```

**장점**:
- quantity 필드를 정확히 반영
- 각 시설을 개별 항목으로 표시
- 데이터 구조 일관성 유지

### 옵션 3: 중복 검증 완전 제거

```typescript
// 중복 검증 없이 모든 시설 표시
facilities.discharge.forEach(facility => {
  if (!grouped[facility.outlet]) {
    grouped[facility.outlet] = { discharge: [], prevention: [] };
  }
  grouped[facility.outlet].discharge.push(facility);
});
```

**장점**:
- 가장 단순한 구현
- 모든 시설 보장
**단점**:
- 실제 중복 데이터가 있어도 필터링하지 못함

## 📊 영향 범위

### 영향받는 컴포넌트
1. ✅ **ImprovedFacilityPhotoSection.tsx** - 배출시설 사진 업로드 (이미 수정됨)
2. ⚠️ **측정기기 수량체크 섹션** - facilityNumbering 데이터는 정상이나 UI 표시 확인 필요
3. ✅ **facilityNumbering 생성 로직** - 이미 quantity 기반으로 정상 동작

### 테스트 시나리오
- [ ] 배출구1: 보일러 100kW 3대 → 3개 모두 표시되는지 확인
- [ ] 배출구2: 발전기 50kW 2대 → 2개 모두 표시되는지 확인
- [ ] 측정기기 수량체크: 대기필증 기준 시설 정보 정확한지 확인
- [ ] 사진 업로드: 모든 시설에 사진 업로드 가능한지 확인

## 💡 권장 조치

1. **즉시 조치** (옵션 1):
   - ImprovedFacilityPhotoSection.tsx의 중복 검증 로직 수정
   - ID 기반 uniqueKey 사용 + fallback에 index 추가

2. **검증**:
   - business/다산다가구 페이지에서 배출시설 개수 확인
   - 각 시설별 사진 업로드 가능 여부 확인
   - 측정기기 수량체크 섹션 정상 표시 확인

3. **문서화**:
   - 중복 검증 로직 변경 사항 CLAUDE.md에 기록
   - 향후 유사 이슈 방지 가이드라인 작성

## 🔗 관련 파일
- [components/ImprovedFacilityPhotoSection.tsx](components/ImprovedFacilityPhotoSection.tsx#L1466-L1507)
- [components/sections/EquipmentFieldCheckSection.tsx](components/sections/EquipmentFieldCheckSection.tsx)
- [utils/facility-numbering.ts](utils/facility-numbering.ts)
- [app/api/facilities-supabase/[businessName]/route.ts](app/api/facilities-supabase/[businessName]/route.ts)
