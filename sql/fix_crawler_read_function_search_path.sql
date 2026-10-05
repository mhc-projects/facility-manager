-- 보조금 크롤러 조회 함수 2개의 search_path를 public으로 되돌리는 수정 (2026-10-05 운영 적용)
--
-- 배경: 2026-03-05 app/api/migrations/fix-function-search-path/migration.sql 이 함수들에 SET search_path = '' 를 넣었다.
--       본문이 테이블을 스키마 없이(direct_url_sources, crawl_logs) 참조해서 그 뒤로 호출할 때마다
--       `relation "direct_url_sources" does not exist` 로 실패했다(GET /api/subsidy-crawler/direct 500).
-- 수정: 빈 값 대신 public 으로 고정한다. 고정값이므로 Security Advisor의 "Function Search Path Mutable" 경고는 다시 나오지 않는다
--       (auto_match_business_id 등 이미 search_path=public 인 함수와 같은 설정).
-- 되돌리기: ALTER FUNCTION ... SET search_path = '';
--
-- 같은 마이그레이션으로 search_path 가 비워진 함수 중 스키마 없이 테이블을 쓰는 것이 더 있다(트리거 포함).
-- 그쪽은 되살리면 알림·이력 기록 동작이 달라질 수 있어 이 파일에서 건드리지 않는다 — claude-progress.txt 2026-10-05 항목 참고.

ALTER FUNCTION public.get_urls_for_crawling(integer) SET search_path = public;
ALTER FUNCTION public.get_running_crawls() SET search_path = public;
