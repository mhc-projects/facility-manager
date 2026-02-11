# AS 비용 및 커스텀 추가비용 마이그레이션 가이드

## 🎯 목적
business_info 테이블에 AS 비용과 커스텀 추가비용 컬럼을 추가합니다.

## 📋 실행 방법

### 방법 1: Supabase 대시보드 (추천)

1. **Supabase 대시보드 접속**
   - URL: https://app.supabase.com/project/uvdvfsjekqshxtxthxeq
   - 로그인 후 프로젝트 선택

2. **SQL Editor 열기**
   - 좌측 메뉴에서 "SQL Editor" 클릭
   - 또는 직접 이동: https://app.supabase.com/project/uvdvfsjekqshxtxthxeq/sql

3. **마이그레이션 SQL 실행**
   - 아래 SQL을 복사하여 SQL Editor에 붙여넣기
   - "Run" 버튼 클릭

```sql
-- AS 비용 및 커스텀 추가비용 마이그레이션
-- 실행 시간: ~2초

-- 1. AS 비용 컬럼 추가
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS as_cost DECIMAL(12, 2) DEFAULT 0 CHECK (as_cost >= 0);

-- 2. 커스텀 추가비용 컬럼 추가 (JSONB 배열)
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS custom_additional_costs JSONB DEFAULT '[]'::jsonb;

-- 3. 성능 최적화 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_business_info_as_cost
ON business_info(as_cost)
WHERE as_cost > 0;

CREATE INDEX IF NOT EXISTS idx_business_info_custom_costs
ON business_info USING GIN (custom_additional_costs)
WHERE jsonb_array_length(custom_additional_costs) > 0;

-- 4. 검증 (결과에 새 컬럼이 보이면 성공)
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'business_info'
AND column_name IN ('as_cost', 'custom_additional_costs')
ORDER BY column_name;
```

4. **실행 결과 확인**
   - 결과 창에 2개의 행이 표시되어야 함:
     - as_cost | numeric | 0 | YES
     - custom_additional_costs | jsonb | '[]'::jsonb | YES

### 방법 2: 로컬에서 검증

마이그레이션 후 로컬에서 검증:

```bash
npm run verify-migration
# 또는
npx tsx scripts/verify-business-info-schema.ts
```

성공 시 출력:
```
✅ Columns exist! Schema verification successful
```

## 📊 데이터 구조

### as_cost
- **타입**: DECIMAL(12, 2)
- **기본값**: 0
- **제약**: >= 0 (음수 불가)
- **예시**: 50000.00 (5만원)

### custom_additional_costs
- **타입**: JSONB 배열
- **기본값**: []
- **구조**:
```json
[
  {"name": "특별 수리비", "amount": 50000},
  {"name": "긴급 출장비", "amount": 30000}
]
```

## ⚠️ 주의사항

1. **프로덕션 환경**
   - 이 마이그레이션은 기존 데이터에 영향을 주지 않습니다
   - DEFAULT 값이 설정되어 있어 안전합니다
   - 하지만 프로덕션 실행 전 백업 권장

2. **롤백 방법**
   문제 발생 시 아래 SQL로 롤백:
```sql
-- 인덱스 삭제
DROP INDEX IF EXISTS idx_business_info_as_cost;
DROP INDEX IF EXISTS idx_business_info_custom_costs;

-- 컬럼 삭제
ALTER TABLE business_info DROP COLUMN IF EXISTS as_cost;
ALTER TABLE business_info DROP COLUMN IF EXISTS custom_additional_costs;
```

3. **실행 시간**
   - 예상 시간: 2-5초
   - 테이블 크기에 따라 다를 수 있음

## ✅ 완료 체크리스트

- [ ] Supabase SQL Editor에서 마이그레이션 SQL 실행
- [ ] 실행 결과에서 2개 컬럼 확인
- [ ] 로컬에서 verify-migration 스크립트 실행
- [ ] ✅ 표시 확인
- [ ] 다음 단계로 진행 (API 구현)

## 🔗 다음 단계

마이그레이션 완료 후:
- Phase 2: API 엔드포인트 구현 (/api/business-info-direct/route.ts 수정)
- Phase 3: BusinessRevenueModal UI 구현
- Phase 4: Revenue 페이지 업데이트
