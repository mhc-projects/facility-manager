-- Supabase Storage: approval-attachments 버킷 생성 및 정책 설정
-- 실행 위치: Supabase Dashboard → SQL Editor

-- 1. 버킷 생성 (public: true → URL로 직접 접근 가능)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'approval-attachments',
  'approval-attachments',
  true,
  20971520, -- 20MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS 정책: 인증된 사용자는 업로드 가능 (Service Role로 API에서 처리하므로 실제로는 API가 제어)
-- public 버킷이므로 읽기는 누구나 가능 (URL 알면 접근 가능)

-- 업로드: Service Role 사용 (API route에서 supabaseAdmin으로 처리)
-- 삭제: Service Role 사용 (API route에서 supabaseAdmin으로 처리)

-- 별도 RLS 정책 불필요 (API 레이어에서 JWT 인증으로 제어)
