-- AS 건 테이블에 제조사(manufacturer) 컬럼 추가
-- 에코센스 전용 API를 통해 들어오는 데이터는 'ecosense'로 자동 설정됨

ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(20)
    CHECK (manufacturer IN ('ecosense', 'cleanearth', 'gaia_cns', 'evs'))
    DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_as_records_manufacturer ON as_records(manufacturer);

COMMENT ON COLUMN as_records.manufacturer IS '제조사: ecosense(에코센스), cleanearth(크린어스), gaia_cns(가이아씨앤에스), evs(이브이에스). 에코센스 외부 API를 통해 등록된 건은 자동으로 ecosense로 설정됨.';
