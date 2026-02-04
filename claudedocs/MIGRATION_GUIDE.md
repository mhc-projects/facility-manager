# Database Migration Guide

## 측정기기 컬럼 추가 마이그레이션

### 실행 시기
**지금 즉시 실행해야 합니다!** 현재 측정기기 데이터가 DB에 저장되지 않는 문제를 해결하는 필수 마이그레이션입니다.

### 실행 방법

#### 1. Supabase Dashboard 접속
```
https://supabase.com/dashboard
→ 프로젝트 선택
→ SQL Editor 메뉴 클릭
```

#### 2. 마이그레이션 스크립트 실행

1. **New Query** 버튼 클릭
2. 아래 파일 내용 전체 복사:
   ```
   sql/add_measurement_device_columns.sql
   ```
3. SQL Editor에 붙여넣기
4. **Run** 버튼 클릭 (또는 Ctrl+Enter)

#### 3. 성공 확인

다음 메시지가 표시되어야 합니다:
```
✅ discharge_facilities 테이블에 측정기기 컬럼 추가 완료
   - discharge_ct: 배출CT 개수
   - exemption_reason: 면제사유
   - remarks: 비고
✅ prevention_facilities 테이블에 측정기기 컬럼 추가 완료
   - ph: pH계 개수
   - pressure: 차압계 개수
   - temperature: 온도계 개수
   - pump: 펌프CT 개수
   - fan: 송풍CT 개수
   - remarks: 비고
```

### 검증 방법

#### SQL Editor에서 검증

마이그레이션 후 다음 쿼리를 실행하여 컬럼이 추가되었는지 확인:

```sql
-- discharge_facilities 테이블 컬럼 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'discharge_facilities'
ORDER BY ordinal_position;

-- prevention_facilities 테이블 컬럼 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prevention_facilities'
ORDER BY ordinal_position;
```

**Expected Output**:

discharge_facilities에 다음 컬럼들이 보여야 합니다:
- `discharge_ct` (integer, YES)
- `exemption_reason` (text, YES)
- `remarks` (text, YES)

prevention_facilities에 다음 컬럼들이 보여야 합니다:
- `ph` (integer, YES)
- `pressure` (integer, YES)
- `temperature` (integer, YES)
- `pump` (integer, YES)
- `fan` (integer, YES)
- `remarks` (text, YES)

#### Application에서 검증

1. **Business 페이지 접속**:
   ```
   http://localhost:3000/business/[사업장명]
   ```

2. **"배출구별 시설 및 게이트웨이 정보" 섹션에서**:
   - 배출시설의 배출CT 개수 수정 (예: 2개 → 3개)
   - 저장 버튼 클릭
   - "저장 성공" 메시지 확인

3. **데이터 영속성 확인**:
   - 페이지 새로고침 (F5)
   - 수정한 데이터가 유지되는지 확인 (3개로 표시되어야 함)
   - 강제 새로고침 (Ctrl+Shift+R)
   - 여전히 3개로 표시되는지 확인

4. **Admin 모달 확인**:
   ```
   http://localhost:3000/admin/business
   ```
   - 해당 사업장 클릭하여 상세 모달 열기
   - "시설 정보 (실사 기준)" 섹션에서 최신 데이터 확인
   - 배출CT: 3개로 표시되어야 함

### 문제 해결

#### Q: "column already exists" 오류
**A**: 이미 마이그레이션이 실행된 상태입니다. 안전하게 무시할 수 있습니다. (`IF NOT EXISTS` 사용)

#### Q: 데이터가 여전히 저장되지 않음
**A**: 다음을 확인하세요:
1. 마이그레이션이 성공적으로 완료되었는지 검증 쿼리로 확인
2. 브라우저 캐시 완전 삭제 (Ctrl+Shift+Delete)
3. 개발 서버 재시작 (`npm run dev`)
4. Chrome DevTools Console에서 API 응답 확인

#### Q: 기존 데이터는 어떻게 되나요?
**A**:
- 기존 시설 데이터는 영향받지 않습니다
- 새로운 컬럼은 기본값 `NULL`로 추가됩니다
- 사용자가 수정하면 그때부터 데이터가 저장됩니다

### Rollback (되돌리기)

만약 문제가 발생하면 다음 SQL로 되돌릴 수 있습니다:

```sql
-- ⚠️ 주의: 측정기기 데이터가 모두 삭제됩니다!

-- discharge_facilities 컬럼 제거
ALTER TABLE discharge_facilities
DROP COLUMN IF EXISTS discharge_ct,
DROP COLUMN IF EXISTS exemption_reason,
DROP COLUMN IF EXISTS remarks;

-- prevention_facilities 컬럼 제거
ALTER TABLE prevention_facilities
DROP COLUMN IF EXISTS ph,
DROP COLUMN IF EXISTS pressure,
DROP COLUMN IF EXISTS temperature,
DROP COLUMN IF EXISTS pump,
DROP COLUMN IF EXISTS fan,
DROP COLUMN IF EXISTS remarks;
```

### 마이그레이션 후 체크리스트

- [ ] SQL 마이그레이션 실행 완료
- [ ] 검증 쿼리로 컬럼 추가 확인
- [ ] Business 페이지에서 데이터 수정 테스트
- [ ] 페이지 새로고침 후 데이터 유지 확인
- [ ] Admin 모달에서 최신 데이터 표시 확인
- [ ] 수량이 0인 측정기기는 표시되지 않는지 확인
- [ ] 개발팀에 마이그레이션 완료 공지

### 관련 문서

- [fix-db-schema-measurement-devices.md](fix-db-schema-measurement-devices.md) - 상세한 문제 분석 및 해결 과정
- [sql/add_measurement_device_columns.sql](../sql/add_measurement_device_columns.sql) - 실제 마이그레이션 스크립트
