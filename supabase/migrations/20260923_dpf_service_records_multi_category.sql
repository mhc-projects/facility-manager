-- DPF 접수 1건에 분류 여러 개 + 분류별 회차 — categories 배열/round_nos 맵 추가, 회차 트리거 재작성
-- categories: 선택 순서 유지, [1]이 대표 분류. round_nos: {"as": 1, "clean": 4}처럼 분류마다 회차.
-- category/round_no는 트리거가 대표 분류 값으로 계속 동기화한다(기존 유니크 인덱스·구버전 코드 호환).

BEGIN;

-- 1. 컬럼 추가 + 기존 행 백필 (기존 트리거는 UPDATE OF category, vehicle_id라 이 UPDATE에선 돌지 않는다)
ALTER TABLE dpf_service_records
  ADD COLUMN IF NOT EXISTS categories TEXT[],
  ADD COLUMN IF NOT EXISTS round_nos JSONB;

UPDATE dpf_service_records
SET categories = ARRAY[category::text],
    round_nos  = jsonb_build_object(category, round_no)
WHERE categories IS NULL OR round_nos IS NULL;

ALTER TABLE dpf_service_records
  ALTER COLUMN categories SET NOT NULL,
  ALTER COLUMN round_nos SET NOT NULL,
  ALTER COLUMN round_nos SET DEFAULT '{}'::jsonb;

ALTER TABLE dpf_service_records DROP CONSTRAINT IF EXISTS dpf_service_records_categories_check;
ALTER TABLE dpf_service_records ADD CONSTRAINT dpf_service_records_categories_check
  CHECK (
    cardinality(categories) >= 1
    AND categories <@ ARRAY['as','clean','clean_elapsed','cs','parts_delivery','urea','engine_replace']::text[]
  );

CREATE INDEX IF NOT EXISTS idx_dpf_service_records_categories
  ON dpf_service_records USING GIN (categories);

-- 2. 회차 트리거 재작성
CREATE OR REPLACE FUNCTION dpf_service_records_set_round_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  c TEXT;
  n INT;
  kept JSONB := '{}'::jsonb;
  removed TEXT;
BEGIN
  -- 구버전 코드 호환: categories 없이 category만 보내는 경로
  IF TG_OP = 'INSERT' THEN
    IF NEW.categories IS NULL OR cardinality(NEW.categories) = 0 THEN
      NEW.categories := ARRAY[NEW.category::text];
    END IF;
  ELSIF NEW.categories IS NOT DISTINCT FROM OLD.categories AND NEW.category IS DISTINCT FROM OLD.category THEN
    NEW.categories := ARRAY[NEW.category::text] || array_remove(OLD.categories[2:], NEW.category::text);
  END IF;

  -- 선택 순서를 유지한 채 중복 제거
  SELECT array_agg(x ORDER BY ord) INTO NEW.categories
  FROM (
    SELECT DISTINCT ON (x) x, ord
    FROM unnest(NEW.categories) WITH ORDINALITY AS t(x, ord)
    ORDER BY x, ord
  ) d;

  -- 분류 구성·차량이 그대로면 회차 유지
  IF TG_OP = 'UPDATE'
     AND NEW.categories IS NOT DISTINCT FROM OLD.categories
     AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id THEN
    NEW.category  := NEW.categories[1];
    NEW.round_nos := OLD.round_nos;
    NEW.round_no  := OLD.round_no;
    RETURN NEW;
  END IF;

  -- 같은 차량 접수의 채번을 직렬화(동시 등록 시 같은 회차 방지) — 트랜잭션 종료 시 자동 해제
  PERFORM pg_advisory_xact_lock(hashtext('dpf_service_records_round:' || NEW.vehicle_id::text));

  -- 수정 시 남아 있는 분류는 기존 회차 유지
  IF TG_OP = 'UPDATE' AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id THEN
    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) INTO kept
    FROM jsonb_each(OLD.round_nos) AS e(k, v)
    WHERE k = ANY(NEW.categories);
  END IF;

  -- 새로 들어온 분류만 채번 (소프트 삭제 건 포함 MAX+1 — 기존 규칙과 동일)
  FOREACH c IN ARRAY NEW.categories LOOP
    CONTINUE WHEN kept ? c;
    SELECT COALESCE(MAX((r.round_nos ->> c)::int), 0) + 1 INTO n
    FROM dpf_service_records r
    WHERE r.vehicle_id = NEW.vehicle_id AND r.round_nos ? c AND r.id <> NEW.id;
    kept := kept || jsonb_build_object(c, n);
  END LOOP;

  NEW.round_nos := kept;
  NEW.category  := NEW.categories[1];
  NEW.round_no  := (kept ->> NEW.categories[1])::int;

  -- 전환: 분류가 빠지고 새 분류가 들어온 경우 처음 빠진 분류를 기록(이미 있으면 최초 분류 보존). 단순 추가는 전환 아님.
  IF TG_OP = 'UPDATE' AND NEW.converted_from_category IS NULL
     AND EXISTS (SELECT 1 FROM unnest(NEW.categories) x WHERE x <> ALL(OLD.categories)) THEN
    SELECT x INTO removed
    FROM unnest(OLD.categories) WITH ORDINALITY AS t(x, ord)
    WHERE x <> ALL(NEW.categories)
    ORDER BY ord LIMIT 1;
    IF removed IS NOT NULL THEN
      NEW.converted_from_category := removed;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dpf_service_records_round_no ON dpf_service_records;
CREATE TRIGGER trg_dpf_service_records_round_no
  BEFORE INSERT OR UPDATE OF category, categories, vehicle_id ON dpf_service_records
  FOR EACH ROW EXECUTE FUNCTION dpf_service_records_set_round_no();

COMMIT;

-- 되돌리기(필요 시):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_dpf_service_records_round_no ON dpf_service_records;
-- (20260911_dpf_service_records.sql의 dpf_service_records_set_round_no 함수·트리거 정의를 다시 실행)
-- ALTER TABLE dpf_service_records DROP CONSTRAINT IF EXISTS dpf_service_records_categories_check;
-- DROP INDEX IF EXISTS idx_dpf_service_records_categories;
-- ALTER TABLE dpf_service_records DROP COLUMN IF EXISTS categories, DROP COLUMN IF EXISTS round_nos;
-- COMMIT;
