-- 견적서 발송일 컬럼 추가
ALTER TABLE public.business_info
ADD COLUMN IF NOT EXISTS quote_sent_date DATE;

COMMENT ON COLUMN public.business_info.quote_sent_date IS '견적서 발송일';

CREATE INDEX IF NOT EXISTS idx_business_quote_sent_date
ON public.business_info(quote_sent_date)
WHERE quote_sent_date IS NOT NULL;
