-- 사용자 정의 포토 카테고리 테이블 생성
-- 기존 하드코딩된 3개 phase(presurvey, postinstall, aftersales)를 정규화하고
-- 사용자가 자유롭게 카테고리를 추가할 수 있도록 확장

CREATE TABLE IF NOT EXISTS public.business_photo_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_info(id) ON DELETE CASCADE,
  category_key VARCHAR(50) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) DEFAULT '📋',
  color VARCHAR(20) DEFAULT 'gray',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN DEFAULT false,

  -- 담당자 정보
  inspector_name VARCHAR(100),
  inspector_contact VARCHAR(20),
  inspector_date DATE,
  special_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(business_id, category_key)
);

COMMENT ON TABLE public.business_photo_categories IS '사업장별 포토 카테고리 (설치 전 실사, 설치 후 사진, AS 사진 + 사용자 정의)';
COMMENT ON COLUMN public.business_photo_categories.is_system IS 'true = 기본 시스템 카테고리 (삭제 불가)';
COMMENT ON COLUMN public.business_photo_categories.category_key IS '스토리지 경로 및 필터링에 사용되는 고유 키';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_bpc_business_id ON public.business_photo_categories(business_id);
CREATE INDEX IF NOT EXISTS idx_bpc_sort_order ON public.business_photo_categories(business_id, sort_order);

-- 기존 business_info의 phase별 데이터를 새 테이블로 마이그레이션
INSERT INTO public.business_photo_categories (business_id, category_key, category_name, icon, color, sort_order, is_system, inspector_name, inspector_contact, inspector_date, special_notes)
SELECT
  id, 'presurvey', '설치 전 실사', '🔍', 'blue', 0, true,
  presurvey_inspector_name, presurvey_inspector_contact, presurvey_inspector_date, presurvey_special_notes
FROM public.business_info
WHERE id IS NOT NULL
ON CONFLICT (business_id, category_key) DO NOTHING;

INSERT INTO public.business_photo_categories (business_id, category_key, category_name, icon, color, sort_order, is_system, inspector_name, inspector_contact, inspector_date, special_notes)
SELECT
  id, 'postinstall', '설치 후 사진', '📸', 'green', 1, true,
  postinstall_installer_name, postinstall_installer_contact, postinstall_installer_date, postinstall_special_notes
FROM public.business_info
WHERE id IS NOT NULL
ON CONFLICT (business_id, category_key) DO NOTHING;

INSERT INTO public.business_photo_categories (business_id, category_key, category_name, icon, color, sort_order, is_system, inspector_name, inspector_contact, inspector_date, special_notes)
SELECT
  id, 'aftersales', 'AS 사진', '🔧', 'orange', 2, true,
  aftersales_technician_name, aftersales_technician_contact, aftersales_technician_date, aftersales_special_notes
FROM public.business_info
WHERE id IS NOT NULL
ON CONFLICT (business_id, category_key) DO NOTHING;

-- RLS 정책
ALTER TABLE public.business_photo_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to business_photo_categories" ON public.business_photo_categories
  FOR ALL USING (true) WITH CHECK (true);
