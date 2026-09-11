// DPF 접수이력 첨부파일 12슬롯 — 업로드(POST)/조회(GET). 저장은 비공개 버킷(dpf-attachments) + 서명 URL
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getSupabaseStorageAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';
import { DpfAttachmentSlotKey } from '@/types/dpf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const storage = getSupabaseStorageAdmin().storage;

const SLOT_KEYS: DpfAttachmentSlotKey[] = [
  'vehicle_photo', 'smoke_meter',
  'filter_cross_section_before', 'filter_cross_section_after',
  'filter_serial_before', 'filter_serial_after',
  'self_diagnostic_pressure_before', 'self_diagnostic_pressure_after',
  'smoke_test_result_before', 'smoke_test_result_after',
  'as_parts', 'as_processing',
];
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const BUCKET = 'dpf-attachments';
const MAX_SIZE = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 3600; // 모달이 열려 있는 동안 <img>가 계속 이 URL을 참조하므로 1시간

async function ensureBucket() {
  const { data: buckets } = await storage.listBuckets();
  if (!buckets?.find((b: { name: string }) => b.name === BUCKET)) {
    const { error } = await storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_SIZE,
      allowedMimeTypes: ALLOWED_MIME,
    });
    // 동시 요청이 둘 다 "버킷 없음"을 보고 각자 생성을 시도하면 하나는 "already exists"로 실패한다 — 이 경우는 무시
    if (error && !error.message?.toLowerCase().includes('already exists')) {
      throw new Error(`Storage 버킷 생성 실패: ${error.message}`);
    }
  }
}

async function findActiveRecord(id: string) {
  const { data } = await supabaseAdmin
    .from('dpf_service_records')
    .select('id')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();
  return data;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { id } = params;
    const record = await findActiveRecord(id);
    if (!record) return NextResponse.json({ error: '접수 건을 찾을 수 없습니다' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const slotKey = formData.get('slot_key') as string | null;

    if (!file || !slotKey) {
      return NextResponse.json({ error: 'file과 slot_key가 필요합니다' }, { status: 400 });
    }
    if (!SLOT_KEYS.includes(slotKey as DpfAttachmentSlotKey)) {
      return NextResponse.json({ error: '유효하지 않은 slot_key입니다' }, { status: 400 });
    }
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: '허용되지 않는 파일 형식입니다(jpg/png/webp/pdf만 가능)' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '파일 크기는 10MB를 초과할 수 없습니다' }, { status: 400 });
    }

    await ensureBucket();

    // upsert가 storage_path를 덮어쓰기 전에 이전 경로를 먼저 읽어둔다(안 그러면 삭제할 경로를 잃음)
    const { data: existing } = await supabaseAdmin
      .from('dpf_service_record_attachments')
      .select('storage_path')
      .eq('record_id', id)
      .eq('slot_key', slotKey)
      .maybeSingle();

    const path = `service-records/${id}/${slotKey}-${Date.now()}.${ext}`;
    const { error: uploadError } = await storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `파일 업로드 실패: ${uploadError.message}` }, { status: 500 });
    }

    const { data: saved, error: dbError } = await supabaseAdmin
      .from('dpf_service_record_attachments')
      .upsert(
        { record_id: id, slot_key: slotKey, storage_path: path, uploaded_by: auth.user.id },
        { onConflict: 'record_id,slot_key' }
      )
      .select()
      .single();
    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (existing?.storage_path) {
      const { error: removeError } = await storage.from(BUCKET).remove([existing.storage_path]);
      if (removeError) console.error('[DPF Attachment] 이전 파일 삭제 실패(무시):', removeError.message);
    }

    return NextResponse.json({ attachment: saved }, { status: 201 });
  } catch (err) {
    console.error('[DPF Attachment POST] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { id } = params;
    const record = await findActiveRecord(id);
    if (!record) return NextResponse.json({ error: '접수 건을 찾을 수 없습니다' }, { status: 404 });

    const { data: attachments, error } = await supabaseAdmin
      .from('dpf_service_record_attachments')
      .select('slot_key, storage_path, created_at')
      .eq('record_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result: Record<string, { url: string; created_at: string; ext: string }> = {};
    for (const a of attachments ?? []) {
      const { data: signed } = await storage
        .from(BUCKET)
        .createSignedUrl(a.storage_path, SIGNED_URL_TTL);
      if (signed?.signedUrl) {
        const ext = a.storage_path.split('.').pop() ?? '';
        result[a.slot_key] = { url: signed.signedUrl, created_at: a.created_at, ext };
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[DPF Attachment GET] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
