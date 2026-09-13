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

## 4단계: 물류관리(`/dpf/service/logistics`) 필터 뷰
설계: `../dpf-as-logistics-design.md` §7(4단계)·§8.2·§9(4단계 세부 순서) — 어드바이저 검토로 구체화(2026-09-12), 마이그레이션 없음.

결정 확정: `/dpf/service/page.tsx` 본문을 `DpfServiceListView.tsx`(mode prop)로 추출해 reception/logistics 공유,
logistics 분류 필터는 항상 parts_delivery/urea 우주 안에서만 동작, 처리점 필터→택배사 필터 교체 + 비용 필터는
logistics 전용 추가, `/stats`는 엔드포인트 분리 없이 4필드 additive 확장, 통계 useEffect를 마운트 1회로 수정(이 페이지엔
등록 버튼이 없어 안전), `/dpf/[vin]` "AS/크리닝" 탭 라벨을 "접수이력"으로 변경.

- [x] `types/dpf.ts`의 `DpfServiceRecordStats`에 urea/parts pending·completed 4필드 추가
- [x] `GET /api/dpf/service-records`에 `cost_type`/`courier` 파라미터 추가
- [x] `GET /api/dpf/service-records/stats`에 count 쿼리 4개 추가(urea/parts pending·completed)
- [x] `DpfServiceRecordTable.tsx`에 `variant` prop + `LOGISTICS_COLUMNS`(처리점/담당AS기사/기사처리일자 제거, 택배사 추가),
      `SkeletonRow`/`minWidth`를 컬럼 배열 기반 동적 계산으로 수정(3단계의 "문서-코드 불일치" 재발 방지)
- [x] `components/dpf/DpfServiceListView.tsx` 신규(mode prop, 분류 옵션/필터 슬롯/요약 타일/테이블 variant 분기, 통계 useEffect
      를 마운트 1회로 수정)
- [x] `/dpf/service/page.tsx` AdminLayout+DpfServiceListView(mode="reception")로 축소
- [x] `app/dpf/service/logistics/page.tsx` 신규
- [x] `/dpf/[vin]` `ALL_TABS` 탭 라벨 + `TabHeader` 섹션 제목 "AS/크리닝"→"접수이력"(그렙으로 두 곳 모두 확인, 모달 타이틀
      폴백은 "접수상담/엔진물류" 구분을 반영하는 것이라 그대로 유지)
- [x] `AdminLayout.tsx`에 "물류관리" 사이드바 항목 추가(이미 import된 Package 아이콘, 활성 상태는 기존
      `hasMoreSpecificMatch` 로직이 `/dpf/service` vs `/dpf/service/logistics`를 이미 올바르게 구분함을 그렙으로 확인)
- [x] `npx tsc --noEmit` 통과(baseline 대조, 신규 오류 0)
- [x] 브라우저 하드 리로드 후 확인: 테스트 데이터(부품전달 진행중+경동화물+유상, 요소수 완료+대신화물+무상) 2건 생성 →
      `/dpf/service`(reception) 회귀 없음(요약 5타일/필터 패널/처리점 필드 그대로) → `/dpf/service/logistics` 요약 4타일=
      실제 건수 일치, 분류 드롭다운 2개 옵션만, 택배사 필터로 "경동" 검색 시 1건만 필터링 확인 → `/dpf/[vin]?tab=service`
      탭 라벨+섹션 헤더 "접수이력"으로 일관 확인 → 콘솔 에러 없음(매 단계 하드 리로드 후)
- [x] (어드바이저 4단계 마무리 검토 지적) `effectiveCategory` 규칙 판별 검증 — 물류 2건뿐이던 상태에서는 "전체=빈 값"과
      "전체=parts_delivery,urea"가 결과가 같아 무의미했음. 크리닝 1건을 추가로 만들어 `/dpf/service`는 3건(회귀 없음),
      `/dpf/service/logistics`는 여전히 2건(크리닝 제외)으로 실제 구분됨을 확인. 비용 필터도 UI 셀렉트로 "무상" 선택 →
      1건(요소수)만 필터링되는 것을 직접 확인(이전엔 API 레벨에서만 검증했었음)
- [x] 검증 중 테스트 흔적 정리 SQL 사용자에게 전달(3단계와 동일 2줄, 4단계 검증분인 물류 2건+크리닝 1건 포함) — 사용자가 2026-09-12 실행 완료
- [x] 커밋 4개: a02d7f0 API+타입, 660906a 테이블 variant+뷰 추출+reception 축소, 3f7e105 물류관리 라우트+사이드바,
      289b5ef 탭 라벨 변경
- [x] `claude-progress.txt` 갱신

## 5단계: 첨부파일(12슬롯) — `dpf_service_record_attachments`
설계: `../dpf-as-logistics-design.md` §4.7·§5(5단계 스키마)·§7(5단계)·§8.4(첨부파일 UI)·§9(5단계 세부 순서).
착수 조건 확인 완료(2026-09-12, AskUserQuestion): "크린어스 관찰 12슬롯 그대로 지금 구현" 선택.

결정 확정(어드바이저 2차 검토로 수정): 신규 마이그레이션(1단계 이후 첫 마이그레이션, feedback_supabase_sql 절차 그대로
적용), 저장 버킷은 `dpf-documents`(공개) 재사용이 **아니라** 신규 비공개 버킷 `dpf-attachments` + 서명 URL(차량 개인정보라
이미 있는 announcements/uploaded-files-supabase 패턴 재사용, `storage_path` 컬럼 필요), 서버 확장자 화이트리스트
검증 추가, 재업로드는 타임스탬프 경로+이전 파일 베스트에포트 삭제, 첨부파일 삭제는 하드 삭제(레코드 자체의
소프트삭제와 별개 축), UI는 수정 모드에만 노출·개별 업로드만(일괄 업로드/목록 서류 컬럼 없음, 미관찰 UI 추측 안 함).

- [x] 마이그레이션 SQL 작성(테이블만, 버킷은 코드가 런타임 자동생성) → 사용자에게 전달(비공개 버킷 이유 설명 포함) →
      사용자가 2026-09-12 Supabase SQL 에디터에서 직접 실행, 성공 확인
- [x] `types/dpf.ts`에 `DpfAttachmentSlotKey`(12개 union) + `DpfServiceRecordAttachment`(`storage_path` 포함) 추가
- [x] `ServiceRecordFormModal.tsx`에 `ATTACHMENT_SLOTS`(key+한글 라벨 12개) export
- [x] `POST /api/dpf/service-records/[id]/attachments` 신설(requireAuth 먼저, slot_key+확장자 화이트리스트 검증,
      `dpf-attachments` 비공개 버킷 자동생성 시 `fileSizeLimit: 10MB` 지정, 버킷 동시생성 race는 "already exists"를
      성공으로 취급, upsert, 이전 파일 베스트에포트 삭제)
- [x] `GET /api/dpf/service-records/[id]/attachments` 신설(슬롯별 `createSignedUrl` 발급, 응답 필드명 `created_at`)
- [x] `DELETE /api/dpf/service-records/[id]/attachments/[slotKey]` 신설(storage+DB 하드 삭제)
- [x] non-file API 케이스 실제 요청으로 검증: 빈 레코드 GET({}), 존재하지 않는 레코드 GET(404), 잘못된 slot_key
      DELETE(400), 미존재 첨부 DELETE(404) — 파일 포함 케이스(업로드/재업로드)는 브라우저 확장 보안 필터가
      "input.files를 읽어 fetch로 전송" 패턴을 차단해 API 단독 테스트 불가, UI 완성 후 실제 파일 선택으로 검증 예정
- [x] (어드바이저 검토 지적) GET 응답에 `ext` 필드 추가 — 서명 URL은 토큰 쿼리스트링을 포함해 클라이언트가 직접
      파싱해 이미지/PDF를 구분하는 게 부적절, `storage_path` 확장자를 그대로 내려줌
- [x] `ServiceRecordFormModal.tsx`에 첨부파일 섹션 추가(`AttachmentSlotView` 서브컴포넌트, 수정 모드 전용, 12슬롯
      업로드/미리보기/교체/삭제, 클라이언트 10MB+확장자 가드, `attachments` 상태는 `values`와 분리)
- [x] **실사용 버그 발견 및 수정**: 실제 UI로 첫 업로드를 시도하자 415 "mime type application/json ... is not supported"
      실패. 처음엔 "request.formData()의 File이 storage-js의 instanceof Blob 체크와 다른 realm" 가설을 세워 Blob으로
      재포장했으나 동일 실패 → debug 로그로 `blobIsBlob: true` 확인되어 가설 반증 → 근본 원인은 `supabaseAdmin`의
      `global.headers['Content-Type']` 고정값이 Fetch 스펙상 FormData/바이너리 body의 자동 Content-Type을 무시시켜
      Storage가 415로 거부하는 것으로 확인. `lib/supabase.ts`에 `global.headers` 없는 `getSupabaseStorageAdmin()`
      신설, 첨부파일 API 3개 라우트의 storage 호출만 교체(DB 호출은 `supabaseAdmin` 유지) → 정상 업로드 확인
- [x] `.claude/skills/db-schema/SKILL.md`에 `dpf_service_record_attachments` 추가
- [x] `.claude/skills/dpf/SKILL.md`에 첨부파일 하드삭제/재업로드/비공개 버킷/전용 storage 클라이언트 규칙 추가
- [x] `npx tsc --noEmit` 통과(신규 오류 0)
- [x] 브라우저 실제 UI로 검증(`file_upload` 도구로 실제 `<input>`에 파일 선택 → 페이지 자체 fetch 실행):
      이미지 업로드(썸네일 렌더 확인, `img.complete && naturalWidth>0`) → 재업로드/교체(새 서명 URL로 변경, storage
      list API로 이전 파일 실제 삭제 확인 — 단, 이전 서명 URL 자체는 CDN 캐시(`cacheControl: max-age=3600`)로 최대
      1시간 200을 반환할 수 있어 신뢰 불가, storage list API가 최종 진실) → PDF 업로드("PDF 보기" 링크 렌더링,
      GET 응답 `ext:"pdf"` 확인) → UI 삭제 버튼(storage+DB 모두 제거 확인) → 신규 등록 모드엔 섹션 미노출 확인 →
      기존 필드/탭 회귀 없음
- [x] 브라우저 확장 파일업로드 차단 가설 최종 결론: **차단 가설은 틀렸음(반증됨)** — `file_upload` 도구로 실제
      `<input>`에 파일을 선택시키고 페이지 자체 onChange 핸들러가 fetch를 수행하는 흐름은 정상 동작한다. 이전에
      관찰된 차단은 `javascript_tool` 스크립트가 파일을 직접 읽어 fetch로 전송하는 패턴에서만 발생하는 것으로 범위가
      좁혀짐(이 기능 자체의 한계가 아님)
- [x] 검증 중 생성한 첨부파일(이미지 2개+PDF 1개)은 모두 UI/API의 실제 삭제 흐름으로 정리 완료(storage list API로
      최종 확인, DB 행도 0건)
- [x] 커밋 7개: 4c48fee 마이그레이션+타입, 89039fc API 3개 라우트, 1b7916e API 검증결과 문서, d7b0e97 GET 응답
      ext 필드 추가, 3cf4a79 storage 클라이언트 분리(버그 수정), 07917ad UI+스킬 문서 갱신, d8d28ef 레코드 전환
      레이스 컨디션 수정
- [x] `claude-progress.txt` 갱신
- [x] (미검증 항목 명시) 클라이언트 측 확장자 거부 메시지 경로(`.txt` 업로드 → 빨간 에러 박스)는 구현만 되고 UI로
      직접 확인하지 않음(서버 측 확장자 검증은 400 응답으로 검증 완료). 10MB 클라이언트 가드는 `file_upload` 도구
      자체가 10MB를 넘는 파일을 못 보내 UI로 검증 불가능(서버 측 `fileSizeLimit`/크기 체크는 코드 리뷰로만 확인).
- [ ] 사용자에게 전달할 것: (1) `dpf_service_records` 테스트 레코드 2건(크리닝 1·2회차, 85가8787) 정리 SQL,
      (2) 동일 헤더 충돌 버그가 잠재된 다른 업로드 라우트 목록(수정하지 않음, 발견만) — `announcements/[id]/attachments`,
      `approvals/attachments`, `facility-photos`, `calendar/upload`, `upload-supabase`, `wiki/upload-guideline`,
      `document-automation/purchase-order` 전부 `supabaseAdmin` 또는 `getSupabaseAdmin()`으로 storage 업로드 —
      특히 `announcements/[id]/attachments`는 버킷에 `allowedMimeTypes` 제한이 없어 415는 안 뜨지만 저장된 객체의
      `mimetype` 메타데이터가 잘못됐을 가능성이 있음(서명 URL의 inline 렌더링에 영향 가능)

## 후속 (2026-09-13) — 날짜 필터 기준 드롭다운 + 크린어스 대비 재점검
사용자 요청: "날짜 필터 기준 드롭다운도 이번에 추가해줘. 그리고 재설계는 아주 좋은데 크린어스 시스템에서 기록하고
작성하던 부분에서 빠진게 있는지도 한번 더 확인해줘."

- [x] `GET /api/dpf/service-records`에 `date_field` 파라미터 추가(reception_date/processed_at/
      technician_processed_at/completed_at/created_at 화이트리스트, 미지정 시 reception_date 하위호환).
      `created_at`은 timestamptz라 KST 오프셋(+09:00) 명시 필요(어드바이저 지적, UTC 자정 경계 드리프트 —
      기존 `daysSince` 이슈와 동일 계열). 정렬 기준도 `date_field`를 따라가도록 변경.
- [x] `DpfServiceListView.tsx`에 날짜 기준 드롭다운 UI 추가("접수일" 고정 라벨 → 5개 옵션 셀렉트). 날짜 범위가
      비어있으면 `date_field`를 서버에 안 보내 정렬에 영향 없음. `clearAll`은 기준을 기본값(접수일)으로 복원.
- [x] 실제 브라우저로 검증: 테스트 레코드 1건(접수일 2026-09-01, 완료일 2026-09-13) 생성 → API 직접 호출로
      완료일 기준 2026-09-13~ = 1건, 접수일 기준 = 0건, 등록일 기준(KST 당일 생성) = 1건 확인 → UI 드롭다운으로도
      동일하게 재확인(완료일 선택 시 1건, 접수일 선택 시 0건, 전체 초기화 시 드롭다운도 접수일로 복원) → 콘솔 에러 없음
- [x] design doc §9(2단계 세부 결정)에 완료 표시 추가
- [x] 테스트 레코드 UI로 소프트 삭제 완료 — DB 잔여분 하드 삭제 SQL은 사용자에게 전달 예정
- [x] 크린어스 대비 재점검(코드 재확인, §2.1~§2.5 항목별 대조) — 발견사항은 context-notes.md에 상세 기록,
      사용자에게 별도 보고. 요약:
      - (a) **기록되지만 목록에 안 보임**: `DpfServiceRecordTable`(접수현황/물류관리 목록)에 기사처리일자·
        협회청구일자·연장내역/승인 컬럼 없음(폼엔 있고 DB에도 저장됨). 차량상세 접수이력 카드엔 기사처리일자만 있고
        협회청구일자/연장은 여기도 없음.
      - (b) **필터 어휘 누락**: 크린어스 접수현황의 "전환전체"(전환 C→AS/AS→C) 드롭다운에 대응하는 필터가
        `DpfServiceListView`에 없음(`converted_from_category` 컬럼 자체는 있고 상세 카드에 표시는 됨).
      - (c) **차량 레벨 필드 자체가 스키마에 없음**: 크린어스 접수상담 상세의 성능검사기간/보증기간/클리닝경과일/
        협회반납/주행시간/형식/요소수 보증기간/보조금 입금일자 — `types/dpf.ts` 전체를 그렙했으나 대응 필드 없음.
      - (d) **`/dpf`(부착현황) 크롬 — 이번 1~5단계 재설계 범위 밖, pre-existing**: 카테고리별 요약 바(크린어스는
        총계약/크리닝/AS/부품전달/요소수/엔진교체를 숫자로 분리 표시, 우리는 "전체 등록 차량" 총계만), 기간
        프리셋(1/3/6/12개월)+기준일 토글, 특판/처리점/장착점/장치종류 드롭다운 필터, 최근/과거 정렬 토글 — 전부 없음.
      - (e) **재확인만 하고 다시 나열 안 함**: 사용자가 명시적으로 확정한 차이(본사/협력사 구분, 크린어스 vendor
        미추가, 연장 전자결재 미연동)와 미관찰이라 추측하지 않은 것들(서류 보기 상세, 접수종류 하위옵션, 일괄
        업로드 매칭방식)은 직전 턴에서 이미 보고했으므로 반복하지 않음.
- [ ] (a)(b) 항목을 추가할지는 사용자 결정 대기 — 추가 시 `DpfServiceRecordTable`의 "컬럼 예산" 원칙(§8.3,
      "19개에 6개를 그대로 더하지 않는다") 적용해 압축된 형태로 제안(기사처리/처리/완료를 스택 셀 하나로, 연장은
      상태 배지에 덧붙이는 형태, 협회청구일자는 청구상태 셀에 폴드)
