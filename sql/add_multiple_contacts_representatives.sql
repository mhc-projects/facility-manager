-- 다중 대표자 및 담당자 지원을 위한 JSONB 컬럼 추가
-- 기존 단일 필드(representative_name, manager_name 등)는 하위 호환성을 위해 유지

ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS representatives JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contacts_list   JSONB DEFAULT '[]'::jsonb;

-- 기존 단일 대표자 데이터 → 배열로 마이그레이션
UPDATE business_info
  SET representatives = jsonb_build_array(
    jsonb_build_object(
      'name',       COALESCE(representative_name, ''),
      'birth_date', representative_birth_date
    )
  )
  WHERE representative_name IS NOT NULL
    AND representative_name != ''
    AND (representatives = '[]'::jsonb OR representatives IS NULL);

-- 기존 단일 담당자 데이터 → 배열로 마이그레이션
UPDATE business_info
  SET contacts_list = jsonb_build_array(
    jsonb_build_object(
      'name',     COALESCE(manager_name, ''),
      'position', manager_position,
      'phone',    manager_contact,
      'email',    email
    )
  )
  WHERE manager_name IS NOT NULL
    AND manager_name != ''
    AND (contacts_list = '[]'::jsonb OR contacts_list IS NULL);

COMMENT ON COLUMN business_info.representatives IS '대표자 목록 [{name: string, birth_date: string|null}]';
COMMENT ON COLUMN business_info.contacts_list   IS '담당자 목록 [{name: string, position: string, phone: string, email: string}]';
