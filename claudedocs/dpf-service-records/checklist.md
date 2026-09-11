# DPF 서비스 이력(AS/크리닝) 구현 체크리스트

설계: `../dpf-as-logistics-design.md` (어드바이저 검토 반영 완료, 2026-09-11)

- [x] 마이그레이션 SQL 작성: `supabase/migrations/20260911_dpf_service_records.sql` (설계 §5, 어드바이저 2차 검토로 VIN/차량번호 컬럼 타입 수정 반영)
- [x] 사용자에게 SQL 전달, 직접 실행 요청 — **에이전트가 직접 실행하지 않음** ([[feedback_supabase_sql]])
- [x] 사용자 적용 확인 대기 — 2026-09-11 사용자가 Supabase SQL 에디터에서 직접 실행, 성공 확인
- [x] `types/dpf.ts`에 `DpfServiceRecord` 인터페이스 추가
- [x] `types/dpf.ts`의 `DpfVehicle`에 오버레이 필드 추가 (current_contact_wireless/wired, dispatch_area_primary/secondary, current_plate_number, current_vin_override, is_special_management, is_special_sale)
- [x] `app/api/dpf/vehicles/[vin]/route.ts` GET에 `serviceRecords` 조회 추가 (installations/inspections/subsidies/callMonitoring과 나란히)
- [x] `app/api/dpf/vehicles/[vin]/service-records/route.ts` POST 신설 (vin→vehicle_id 조회 + insert + 오버레이 write-back)
- [x] `app/api/dpf/vehicles/[vin]/service-records/[id]/route.ts` PUT/DELETE 신설 (기존 sub-record 라우트 컨벤션에 맞춰 PATCH 대신 PUT 사용, DELETE는 is_deleted=true 소프트 삭제)
- [x] round_no 유니크 위반(23505) 시 1회 재시도 로직 (POST/PUT 양쪽)
- [x] `ServiceRecordFormModal.tsx` 신설 (설계 §5 필드 전체, CATEGORY_OPTIONS/CATEGORY_LABELS export)
- [x] `/dpf/[vin]` 페이지에 "AS/크리닝" 탭 추가 (`ALL_TABS`에 vendors 제한 없이, 기본정보 바로 다음 위치)
- [x] `npx tsc --noEmit` 통과 — 새로 추가/수정한 파일에서 발생한 오류 0건(기존 오류는 stash로 baseline 대조 확인)
- [x] 브라우저 하드 리로드 후 확인 완료 (2026-09-11): 탭 진입(0건→1건→2건), 신규 접수 등록, 연락처 write-back, "최신 레코드만 write-back" 규칙(오래된 건 수정해도 차량 오버레이 불변 확인), 크리닝→AS 전환 시 AS 1회차 재채번 + "크리닝에서 전환" 태그, 소프트 삭제(목록에서 사라짐, 카운트 갱신) — 모두 설계대로 동작
- [x] 기존 탭(설치이력) 회귀 확인 — 정상 렌더링, 콘솔 에러 없음(하드 리로드 후 재확인)
- [x] `.claude/skills/db-schema/SKILL.md`에 `dpf_service_records` 테이블 추가 (DPF 섹션 신설 — 기존에 dpf 전용 섹션이 없었음)
- [x] 커밋 3개: (a) 093edde 마이그레이션+타입+설계문서, (b) da73de1 API, (c) e5c5c6c UI+스킬/진행상황
- [x] `claude-progress.txt` 갱신

## 1단계 사후 검토 (2026-09-11, 어드바이저)
- [x] 1단계 결과물 어드바이저 검토 — "clean, 설계한 규칙 전부 검증됨" 확인
- [ ] 검증 중 실제 차량(260132205738/85가8787)에 넣은 테스트 데이터 정리 — 사용자에게 SQL 전달함, 직접 실행 대기
- [x] 설계문서 §7 PATCH→PUT 표기 수정 (실제 구현은 PUT, 문서만 안 고쳐져 있었음)

## 2단계: 접수현황 통합 리스트
설계: `../dpf-as-logistics-design.md` §7(2단계)·§8.1·§9(2단계 세부 순서·결정 4가지) — 어드바이저 2차 검토로 구체화 완료(2026-09-11), 마이그레이션 없음.

결정 확정(설계문서 §9 참고): 날짜 필터는 `reception_date` 고정(드롭다운은 3단계 이후로 명시적 보류), 요약 바 집계는 5쿼리(크리닝대기/완료,
AS대기/완료, 상담종료 전체 — `cancelled`는 집계 제외), `?tab=`은 `useSearchParams()` 1회 읽기로 `useState` 초기값만 설정(URL 동기화 안 함,
Suspense 래핑 + 옵셔널 체이닝으로 기존 `meeting-minutes` TS18047 오류 반복 금지), 테스트 데이터 정리 SQL 전달은 매 검증마다 반복되는 절차로 취급.

- [ ] `types/dpf.ts`에 `DpfServiceRecordWithVehicle` 조인 타입 추가 (인라인 금지)
- [ ] `GET /api/dpf/service-records` — `/api/dpf/search/route.ts` 패턴 복제, `dpf_vehicles!inner` 조인(양쪽 is_deleted=false), 텍스트검색은 `dpf_vehicles.plate_number.ilike.%q%` 형태로 1건 테스트 후 필터 바 조립
- [ ] `GET /api/dpf/service-records/stats` — count 쿼리 병렬 5개(크리닝대기/완료, AS대기/완료, 상담종료 전체)
- [ ] `components/dpf/DpfServiceRecordTable.tsx` 신규 (`DpfVehicleTable.tsx`의 COLUMNS+cellValue 구조 복제, 차량번호/차대번호 셀만 링크 — 행 전체 클릭 아님, 행 액션 버튼과 클릭 영역 분리)
- [ ] `app/dpf/service/page.tsx` 신규 (`/dpf/page.tsx:35-57`의 debounce 패턴 그대로, 검색행+필터패널+탭 재사용, 빠른 등록 버튼 없음)
- [ ] `app/dpf/[vin]/page.tsx`에 `?tab=` 쿼리 파라미터로 초기 탭 지정 — Suspense 래핑(`meeting-minutes/page.tsx` 패턴), `searchParams?.get('tab')` 옵셔널 체이닝
- [ ] `BasicInfoTab`에 변경정보(오버레이 필드) 읽기 전용 섹션 추가
- [ ] `components/ui/AdminLayout.tsx` DPF업무 그룹에 "접수현황" 사이드바 항목 추가(ClipboardList 아이콘 재사용)
- [ ] 신규 테이블/마이그레이션 필요성이 느껴지면 멈추고 확인 — 2단계는 조회 레이어만
- [ ] `npx tsc --noEmit` 통과 (신규 오류 0건, meeting-minutes류 기존 오류 재확인으로 baseline 대조)
- [ ] 브라우저 하드 리로드 후 확인: 필터 전 조합, 요약 바 숫자 = 테이블 실제 건수, 행 클릭→상세 탭 이동, `/dpf`·`/dpf/[vin]` 회귀 없음
- [ ] 검증 중 실 데이터에 남긴 테스트 흔적 정리 SQL을 사용자에게 전달(직접 실행 안 함)
- [ ] 커밋 3개: (a) API, (b) 테이블+페이지+사이드바, (c) 상세페이지 `?tab=`+`BasicInfoTab`(1단계 파일 건드리는 유일한 커밋, 분리 보존)
- [ ] `claude-progress.txt` 갱신
