# 대기필증 날짜 컬럼 타입 문제 및 해결 방안

## 🚨 문제 현황

### 증상
```
사용자 입력: 2022.02.04
저장 시도: "2022-02-04" (문자열)
실제 저장: "2022-02-03T15:00:00.000Z"
조회 결과: 2022.02.03 (하루 빠짐!)
```

### 근본 원인
**데이터베이스 컬럼 타입이 `timestamptz` (timestamp with timezone)**

```sql
-- 현재 스키마 (문제 있음)
first_report_date: timestamptz
operation_start_date: timestamptz

-- 권장 스키마
first_report_date: date
operation_start_date: date
```

### 타임존 변환 과정
```
"2022-02-04"
→ PostgreSQL이 timestamptz로 변환
→ UTC 2022-02-04 00:00:00
→ 한국 시간(UTC+9)으로 조회 시
→ 2022-02-03 15:00:00
→ 날짜만 추출 시 2022-02-03
```

## 🎯 해결 방안

### 방안 1: 데이터베이스 스키마 변경 (권장)

**장점**:
- 근본적 해결
- 타임존 문제 완전 제거
- 성능 향상 (타임존 계산 불필요)

**단점**:
- 마이그레이션 필요
- 기존 데이터 변환 필요

**구현**:
```sql
-- 1. 컬럼 타입 변경
ALTER TABLE air_permit_info
  ALTER COLUMN first_report_date TYPE date USING first_report_date::date,
  ALTER COLUMN operation_start_date TYPE date USING operation_start_date::date;

-- 2. 기존 데이터 정규화 (타임존 보정)
UPDATE air_permit_info
SET
  first_report_date = (first_report_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date,
  operation_start_date = (operation_start_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')::date
WHERE first_report_date IS NOT NULL OR operation_start_date IS NOT NULL;
```

### 방안 2: API에서 타임존 보정 (임시 해결)

**장점**:
- 즉시 적용 가능
- 마이그레이션 불필요

**단점**:
- 근본 해결 아님
- 매번 변환 필요
- 복잡성 증가

**구현**:
```typescript
// app/api/air-permits/[id]/route.ts

// GET - 조회 시 날짜만 추출
if (airPermit.first_report_date) {
  airPermit.first_report_date = toKSTDateString(airPermit.first_report_date)
}
if (airPermit.operation_start_date) {
  airPermit.operation_start_date = toKSTDateString(airPermit.operation_start_date)
}

// PUT - 저장 시 KST 기준으로 변환
if (updateData.first_report_date) {
  // "2022-02-04" → "2022-02-04T00:00:00+09:00"
  updateData.first_report_date = `${updateData.first_report_date}T00:00:00+09:00`
}
if (updateData.operation_start_date) {
  updateData.operation_start_date = `${updateData.operation_start_date}T00:00:00+09:00`
}
```

### 방안 3: 프론트엔드에서 보정 (추가 처리)

**구현**:
```typescript
// app/admin/air-permit-detail/page.tsx

// 데이터 로딩 후 날짜 필드 정규화
useEffect(() => {
  if (permitData) {
    const normalized = {
      ...permitData,
      first_report_date: toKSTDateString(permitData.first_report_date),
      operation_start_date: toKSTDateString(permitData.operation_start_date)
    }
    setPermitDetail(normalized)
  }
}, [permitData])
```

## 📋 권장 구현 순서

### Phase 1: 즉시 수정 (임시 해결)
1. **API GET 수정** - 조회 시 날짜만 추출
2. **API PUT 수정** - 저장 시 KST 타임존 명시
3. **테스트 및 검증**

### Phase 2: 스키마 마이그레이션 (근본 해결)
1. **백업**: 현재 데이터 전체 백업
2. **마이그레이션 스크립트 작성**
3. **개발 환경 테스트**
4. **프로덕션 적용**
5. **API 코드 간소화** (타임존 보정 제거)

## 🔧 Phase 1 상세 구현

### 1. API GET 수정

**파일**: `app/api/air-permits/[id]/route.ts`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // ... 기존 코드 ...

  const { data: airPermit, error } = await query;

  if (error) {
    console.error('❌ [AIR-PERMIT-DETAIL] 조회 실패:', error);
    return createErrorResponse(`대기필증 조회 실패: ${error.message}`, 404);
  }

  // ✅ 날짜 필드 정규화 (timestamptz → date string)
  if (airPermit.first_report_date) {
    const originalDate = airPermit.first_report_date
    airPermit.first_report_date = toKSTDateString(airPermit.first_report_date)
    console.log(`📅 first_report_date 정규화: ${originalDate} → ${airPermit.first_report_date}`)
  }
  if (airPermit.operation_start_date) {
    const originalDate = airPermit.operation_start_date
    airPermit.operation_start_date = toKSTDateString(airPermit.operation_start_date)
    console.log(`📅 operation_start_date 정규화: ${originalDate} → ${airPermit.operation_start_date}`)
  }

  const response: any = { air_permit: airPermit };

  // ... 나머지 코드 ...
}
```

### 2. API PUT 수정

**파일**: `app/api/air-permits/[id]/route.ts`

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updateData = await request.json();

    console.log(`📝 [AIR-PERMIT-UPDATE] 대기필증 업데이트: ${id}`);
    console.log('📅 [AIR-PERMIT-UPDATE] 날짜 필드 입력값:', {
      first_report_date: updateData.first_report_date,
      operation_start_date: updateData.operation_start_date
    });

    // ✅ 날짜 필드 타임존 보정 (date string → timestamptz with KST)
    let first_report_date = updateData.first_report_date
    let operation_start_date = updateData.operation_start_date

    if (first_report_date && !first_report_date.includes('T')) {
      // "2022-02-04" → "2022-02-04T00:00:00+09:00"
      first_report_date = `${first_report_date}T00:00:00+09:00`
      console.log(`📅 first_report_date KST 변환: ${updateData.first_report_date} → ${first_report_date}`)
    }

    if (operation_start_date && !operation_start_date.includes('T')) {
      // "2022-02-04" → "2022-02-04T00:00:00+09:00"
      operation_start_date = `${operation_start_date}T00:00:00+09:00`
      console.log(`📅 operation_start_date KST 변환: ${updateData.operation_start_date} → ${operation_start_date}`)
    }

    const adminClient = getSupabaseAdminClient();

    const { data: updatedPermit, error } = await adminClient
      .from('air_permit_info')
      .update({
        business_type: updateData.business_type,
        annual_emission_amount: updateData.annual_emission_amount,
        annual_pollutant_emission: updateData.annual_pollutant_emission,
        first_report_date: first_report_date,  // KST 타임존 포함
        operation_start_date: operation_start_date,  // KST 타임존 포함
        additional_info: updateData.additional_info,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    // ✅ 응답 데이터도 정규화
    if (updatedPermit) {
      if (updatedPermit.first_report_date) {
        updatedPermit.first_report_date = toKSTDateString(updatedPermit.first_report_date)
      }
      if (updatedPermit.operation_start_date) {
        updatedPermit.operation_start_date = toKSTDateString(updatedPermit.operation_start_date)
      }
    }

    console.log('✅ [AIR-PERMIT-UPDATE] 업데이트 완료:', {
      business_type: (updatedPermit as any).business_type,
      first_report_date: (updatedPermit as any).first_report_date,
      operation_start_date: (updatedPermit as any).operation_start_date
    });

    return createSuccessResponse({
      air_permit: updatedPermit,
      message: '대기필증 정보가 성공적으로 업데이트되었습니다'
    });

  } catch (error) {
    console.error('❌ [AIR-PERMIT-UPDATE] 업데이트 실패:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : '대기필증 업데이트에 실패했습니다',
      500
    );
  }
}
```

### 3. Import 추가

**파일**: `app/api/air-permits/[id]/route.ts`

```typescript
import { toKSTDateString } from '@/utils/date-utils';
```

## 🧪 테스트 시나리오

### 1. 날짜 저장 테스트
```
입력: 2022.02.04
기대 결과: "2022-02-04" 저장
실제 DB: "2022-02-04T00:00:00+09:00" (KST 자정)
조회 결과: "2022-02-04" ✅
```

### 2. 날짜 표시 테스트
```
DB 저장값: "2022-02-04T00:00:00+09:00"
API 응답: "2022-02-04"
프론트엔드 표시: "2022.02.04" ✅
```

### 3. 기존 데이터 호환성
```
DB 저장값: "2022-02-03T15:00:00Z" (잘못된 데이터)
toKSTDateString() 변환: "2022-02-04" ✅
표시: "2022.02.04" (보정됨)
```

## 📊 예상 효과

### 즉시 효과
- ✅ 날짜 입력/저장/조회 정확성 보장
- ✅ 사용자 입력값과 저장값 일치
- ✅ 기존 잘못된 데이터도 보정

### 장기 효과
- ✅ 스키마 마이그레이션 후 코드 간소화
- ✅ 성능 향상 (타임존 계산 제거)
- ✅ 유지보수 편의성 향상

## ⚠️ 주의사항

### 1. 데이터 일관성
- API GET/PUT 모두 수정해야 함
- 모든 날짜 관련 API에 동일 로직 적용

### 2. 기존 데이터
- 잘못 저장된 데이터는 자동 보정됨
- 필요시 일괄 수정 스크립트 실행

### 3. 스키마 마이그레이션 준비
- 임시 해결책이므로 향후 스키마 변경 권장
- 마이그레이션 시 현재 코드도 간소화

## 🚀 다음 단계

1. **즉시 적용**: API GET/PUT 타임존 보정 추가
2. **테스트**: 다양한 날짜로 저장/조회 검증
3. **모니터링**: 콘솔 로그로 변환 과정 확인
4. **스키마 마이그레이션 계획**: Phase 2 준비

---

**작성일**: 2026-02-05
**관련 문서**: claudedocs/timezone-fix-comprehensive-design.md
