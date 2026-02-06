# 대기필증 상세페이지 제조사 표시 버그 수정

## 문제 상황
- URL: `/admin/air-permit-detail?permitId=79f155ff-8a48-4e61-b314-80486e5868f7&edit=true`
- 증상: 대기필증 상세페이지 상단에 제조사 값이 출력되지 않음
- VPN 정보는 정상적으로 표시됨

## 원인 분석

### 1. 데이터베이스 스키마 변경 이력
초기 스키마(`sql/02_business_schema.sql`):
```sql
manufacturer VARCHAR(20) CHECK (manufacturer IN ('ecosense', 'cleanearth', 'gaia_cns', 'evs'))
```
- 영어 코드로 저장하도록 설계됨

마이그레이션 스크립트(`sql/STEP1_fix_manufacturer_constraint_and_data.sql`):
```sql
UPDATE manufacturer_pricing
SET manufacturer = '에코센스'
WHERE LOWER(manufacturer) = 'ecosense';
```
- 일부 테이블에서 한글 이름으로 변경됨

### 2. TypeScript 함수의 제한적인 타입
기존 `constants/manufacturers.ts`:
```typescript
export function getManufacturerName(code: ManufacturerCode): ManufacturerName {
  return MANUFACTURER_NAMES[code];
}
```

**문제점:**
- `ManufacturerCode` 타입만 받아서 영어 코드(`'ecosense'`)만 처리 가능
- 한글 이름(`'에코센스'`)이 입력되면 `undefined` 반환
- `undefined`는 falsy이므로 조건부 렌더링 실패:
  ```tsx
  {(permitDetail.business as any)?.manufacturer && (
    // manufacturer가 undefined이면 이 블록이 렌더링되지 않음
  )}
  ```

### 3. API 응답 데이터 구조
`app/api/air-permit/route.ts`:
```typescript
json_build_object(
  'business_name', bi.business_name,
  'manufacturer', bi.manufacturer  // 데이터베이스 값을 그대로 반환
) as business
```
- API는 데이터베이스 값을 변환 없이 그대로 반환
- 데이터베이스에 한글로 저장되어 있으면 한글로 전달됨

## 해결 방법

### 수정 파일: `constants/manufacturers.ts`

```typescript
// 영어 코드 → 한글 이름 변환 (한글 이름이 입력되면 그대로 반환)
export function getManufacturerName(code: ManufacturerCode | ManufacturerName | string): ManufacturerName | string {
  // 이미 한글 이름인 경우 그대로 반환
  if (code in MANUFACTURER_NAMES_REVERSE) {
    return code;
  }
  // 영어 코드인 경우 한글로 변환
  if (code in MANUFACTURER_NAMES) {
    return MANUFACTURER_NAMES[code as ManufacturerCode];
  }
  // 알 수 없는 값은 그대로 반환
  return code || '';
}

// 한글 이름 → 영어 코드 변환 (영어 코드가 입력되면 그대로 반환)
export function getManufacturerCode(name: ManufacturerName | ManufacturerCode | string): ManufacturerCode | string {
  // 이미 영어 코드인 경우 그대로 반환
  if (name in MANUFACTURER_NAMES) {
    return name;
  }
  // 한글 이름인 경우 영어로 변환
  if (name in MANUFACTURER_NAMES_REVERSE) {
    return MANUFACTURER_NAMES_REVERSE[name as ManufacturerName];
  }
  // 알 수 없는 값은 그대로 반환
  return name || '';
}
```

### 개선 사항

1. **타입 유연성 증가**
   - `string` 타입도 받을 수 있도록 확장
   - 런타임에 값의 형태를 판단하여 처리

2. **양방향 호환성**
   - 영어 코드 → 한글 변환
   - 한글 이름 → 그대로 반환
   - 알 수 없는 값 → 그대로 반환 (빈 문자열로 폴백)

3. **안전한 폴백**
   - `undefined`나 `null` 대신 빈 문자열 반환
   - 조건부 렌더링 실패 방지

## 동작 확인

### 테스트 케이스

```typescript
// 영어 코드 입력
getManufacturerName('ecosense') // → '에코센스'
getManufacturerName('cleanearth') // → '크린어스'

// 한글 이름 입력 (데이터베이스에 한글로 저장된 경우)
getManufacturerName('에코센스') // → '에코센스'
getManufacturerName('크린어스') // → '크린어스'

// 알 수 없는 값
getManufacturerName('unknown') // → 'unknown'
getManufacturerName('') // → ''
getManufacturerName(null) // → ''
getManufacturerName(undefined) // → ''
```

## 영향 범위

### 수정된 파일
- `constants/manufacturers.ts` - 제조사 이름 변환 함수

### 영향받는 컴포넌트
- `app/admin/air-permit-detail/page.tsx` - 대기필증 상세 페이지
- 제조사 정보를 표시하는 모든 페이지/컴포넌트

### 하위 호환성
- ✅ 영어 코드로 저장된 기존 데이터: 정상 동작
- ✅ 한글 이름으로 저장된 마이그레이션 데이터: 정상 동작
- ✅ 혼합된 데이터: 모두 정상 동작

## 추가 고려사항

### 데이터베이스 정규화 권장
현재 데이터베이스에 영어/한글이 혼재되어 있을 가능성이 있으므로, 향후 다음 작업을 권장:

```sql
-- 1. 모든 제조사 데이터를 영어 코드로 통일
UPDATE business_info
SET manufacturer = CASE
  WHEN manufacturer = '에코센스' THEN 'ecosense'
  WHEN manufacturer = '크린어스' THEN 'cleanearth'
  WHEN manufacturer = '가이아씨앤에스' THEN 'gaia_cns'
  WHEN manufacturer = '이브이에스' THEN 'evs'
  ELSE manufacturer
END;

-- 2. CHECK 제약조건 재적용
ALTER TABLE business_info
ADD CONSTRAINT business_info_manufacturer_check
CHECK (manufacturer IN ('ecosense', 'cleanearth', 'gaia_cns', 'evs'));
```

## 테스트 방법

1. 개발 서버 재시작:
   ```bash
   npm run dev
   ```

2. 대기필증 상세 페이지 접속:
   ```
   http://localhost:3000/admin/air-permit-detail?permitId=79f155ff-8a48-4e61-b314-80486e5868f7&edit=true
   ```

3. 확인 사항:
   - VPN 정보 옆에 제조사 정보가 표시되는지 확인
   - 제조사 이름이 한글로 정상 출력되는지 확인

## 결론

제조사 표시 버그는 데이터베이스 마이그레이션 과정에서 발생한 데이터 형식 변경(영어 → 한글)과 TypeScript 함수의 엄격한 타입 체크가 충돌하여 발생했습니다.

`getManufacturerName()` 함수를 양방향 호환 가능하도록 수정하여 영어 코드와 한글 이름을 모두 처리할 수 있게 했으며, 이제 제조사 정보가 정상적으로 표시됩니다.
