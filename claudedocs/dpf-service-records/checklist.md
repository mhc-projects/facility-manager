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
- [x] 검증 중 실제 차량(260132205738/85가8787)에 넣은 테스트 데이터 정리 — 사용자가 Supabase SQL 에디터에서 직접 실행, 성공 확인(2026-09-11)
- [x] 설계문서 §7 PATCH→PUT 표기 수정 (실제 구현은 PUT, 문서만 안 고쳐져 있었음)

## 2단계: 접수현황 통합 리스트
설계: `../dpf-as-logistics-design.md` §7(2단계)·§8.1·§9(2단계 세부 순서·결정 4가지) — 어드바이저 2차 검토로 구체화 완료(2026-09-11), 마이그레이션 없음.

결정 확정(설계문서 §9 참고): 날짜 필터는 `reception_date` 고정(드롭다운은 3단계 이후로 명시적 보류), 요약 바 집계는 5쿼리(크리닝대기/완료,
AS대기/완료, 상담종료 전체 — `cancelled`는 집계 제외), `?tab=`은 `useSearchParams()` 1회 읽기로 `useState` 초기값만 설정(URL 동기화 안 함,
Suspense 래핑 + 옵셔널 체이닝으로 기존 `meeting-minutes` TS18047 오류 반복 금지), 테스트 데이터 정리 SQL 전달은 매 검증마다 반복되는 절차로 취급.

- [x] `types/dpf.ts`에 `DpfServiceRecordWithVehicle` 조인 타입 추가 (인라인 금지)
- [x] `GET /api/dpf/service-records` — `/api/dpf/search/route.ts` 패턴 복제, `dpf_vehicles!inner` 조인(양쪽 is_deleted=false). 텍스트검색은 PostgREST or() 와일드카드가 `%`가 아니라 `*`임을 실제 요청으로 발견해 `.or(filter, {foreignTable})`로 수정
- [x] `GET /api/dpf/service-records/stats` — count 쿼리 병렬 5개(크리닝대기/완료, AS대기/완료, 상담종료 전체)
- [x] `components/dpf/DpfServiceRecordTable.tsx` 신규 (`DpfVehicleTable.tsx`의 COLUMNS+cellValue 구조 복제, 차량번호/차대번호 셀만 링크)
- [x] `app/dpf/service/page.tsx` 신규 (`/dpf/page.tsx`의 debounce 패턴 그대로, 검색행+필터패널 재사용, 빠른 등록 버튼 없음)
- [x] `app/dpf/[vin]/page.tsx`에 `?tab=` 쿼리 파라미터로 초기 탭 지정 — Suspense 래핑(`meeting-minutes/page.tsx` 패턴) + useEffect 보정(라우터 캐시로 컴포넌트 재사용되는 경우 대비)
- [x] `BasicInfoTab`에 변경정보(오버레이 필드) 읽기 전용 섹션 추가
- [x] `components/ui/AdminLayout.tsx` DPF업무 그룹에 "접수현황" 사이드바 항목 추가(ClipboardList 아이콘 재사용)
- [x] 신규 테이블/마이그레이션 불필요 확인 — 2단계는 순수 조회 레이어로 완료
- [x] `npx tsc --noEmit` 통과 (신규 오류 0건, baseline 대조 확인)
- [x] 브라우저 하드 리로드 후 확인 완료: 필터(분류/상태/청구상태/지자체/처리점/기간/텍스트검색) 각각 동작, 요약 바 숫자(AS대기 1) = 테이블 실제 건수 일치, 행 클릭→`?tab=service`로 상세 이동+정확한 탭 활성화, 변경정보 섹션 정상 표시, `/dpf`·`/dpf/[vin]` 기존 탭 회귀 없음, 콘솔 에러 없음
- [x] 검증 중 실 데이터에 남긴 테스트 흔적 정리 SQL을 사용자에게 전달(1단계에서 이미 전달 — 2단계 검증도 같은 레코드 재사용해서 추가 흔적 없음, 사용자가 2026-09-11 실행 완료)
- [x] 커밋 3개: (a) 2561bc0 API, (b) 58a9904 테이블+페이지+사이드바, (c) 상세페이지 `?tab=`+`BasicInfoTab`(1단계 파일 건드리는 유일한 커밋, 분리 보존)
- [x] `claude-progress.txt` 갱신

## 2단계 사후 검토 (2026-09-11, 어드바이저)
- [x] 2단계 결과물 어드바이저 검토 — "clean, 체크리스트 전부 실제 브라우저 증거로 검증됨" 확인
- [x] 잔여 3건 확인/문서화(정리 SQL 충분함 확인·사용자 실행 완료, 통계 useEffect 의존성 3단계로 미룸, initialTab 주석 이미 존재)

## 3단계: 부착현황(`/dpf`) 파생 컬럼 + 접수/물류 행 액션 버튼
설계: `../dpf-as-logistics-design.md` §7(3단계)·§8.3·§9(3단계 세부 순서) — 어드바이저 3차 검토로 구체화(2026-09-11), 마이그레이션 없음.

결정 확정(어드바이저 3차+4차 검토): 파생값은 메인 목록에 조인하지 않고 배치 조회 API 1개로 분리(집계는 서버 응용 코드에서,
두 쿼리 `Promise.all`), 19컬럼에 6개 대신 **4개**(최근접수일/마지막처리일/처리횟수/구조변경경과일, 단일 라인)+액션버튼
1개로 압축(24컬럼), `clean_count`/`as_count`는 `cancelled` 제외, 철부횟수는 엠즈 차량에서 클라이언트가 `-`로 표시(서버는
벤더 무관), `derivedStats[id]===undefined` 구간은 `0`이 아니라 `…`로 표시, 파생통계 재조회는 `result` 구독 useEffect 대신
`search()` 콜백 안에서 목록과 나란히 호출, "부착경과일"이 아니라 "구조변경경과일"로 명명(`installation_date`=구변일 확인).

- [x] `types/dpf.ts`에 `DpfVehicleDerivedStats` 인터페이스 추가
- [x] `GET /api/dpf/service-records/derived-stats` 신설 — `dpf_service_records`+`dpf_device_installations` 배치 조회(`Promise.all`),
      vehicle_id별 집계(`clean_count`/`as_count`는 `status != 'cancelled'`만)
- [x] `DpfVehicleTable.tsx`에 `derivedStats` prop + 컬럼 4개(최근접수일/마지막처리일/처리횟수/구조변경경과일) + 액션버튼 컬럼 1개 추가,
      `derivedStats[v.id]===undefined`일 때 `…` 표시
- [x] `app/dpf/page.tsx` — `derivedStats`/`serviceModal` state, `search()` 콜백에서 파생통계 동시 fetch, 접수/물류 버튼 → `ServiceRecordFormModal` 재사용
- [x] `npx tsc --noEmit` 통과 (신규 오류 0건, 기존 baseline 오류와 대조 확인)
- [x] 브라우저 하드 리로드 후 확인: `/api/dpf/service-records/derived-stats` 단독 호출로 응답 모양 먼저 검증(2단계와 동일 절차),
      파생 컬럼 숫자=상세 탭 실제 건수 일치(테스트 차량: 크2·AS1·철0, 상세 탭 4건과 정확히 일치), 취소 건(크리닝 2회차)이
      처리횟수에서 제외되면서도 최근접수일/마지막처리일에는 포함되는 것 확인, 엠즈 차량(KL2UL61FDYP002208)에서 철부횟수 `-` 표시
      확인, "접수"/"물류" 버튼 각각 올바른 초기 분류로 모달이 열리는 것 확인, 접수 등록 후 목록+파생값 동시 갱신 확인(크1→크2),
      상세 탭에서도 동일 레코드 확인, `/dpf` 벤더 탭 회귀 없음, 콘솔 에러 없음(하드 리로드 후 재확인)
- [x] 검증 중 실 데이터에 남긴 테스트 흔적 정리 SQL 사용자에게 전달(3단계에서 추가로 만든 레코드 포함, 1~2단계분은 이미 정리됨) — 사용자가 2026-09-12 실행 완료
- [x] 커밋 2개: (a) 2db594f API+타입, (b) cf29b9d 테이블 컬럼+페이지 wiring (+ 86571fa 문서 갱신, 2단계와 동일 패턴)
- [x] `claude-progress.txt` 갱신

## 3단계 마무리 검토 (2026-09-12, 어드바이저)
- [x] 3단계 결과물 어드바이저 검토 — "증거 기반으로 정확함" 확인, 마무리 전 처리할 3+1건 지적
- [x] 커밋 트레일러 누락(a989421) 사용자 확인 후 amend로 수정
- [x] `DpfVehicleTable` `minWidth` 1780px→2250px로 실제 코드 수정(문서와 불일치 해소)
- [x] 벤더 탭(엠즈) 재검증 — 최초 확인이 디바운스 전 캡처라 inconclusive였음, 재클릭+대기 후 17,762건 정상 필터링 확인, 페이지 2 이동 시 파생값도 정상 반영 확인
- [x] `.claude/skills/dpf/SKILL.md` 신설(설계 §10이 1단계부터 미룬 도메인 스킬 갱신, 3단계까지 누락돼 있던 것)
- [x] 테스트 흔적 정리 SQL 사용자 실행 완료(2026-09-12)
