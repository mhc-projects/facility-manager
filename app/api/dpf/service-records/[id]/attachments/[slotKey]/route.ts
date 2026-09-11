// DPF 접수이력 첨부파일 삭제 — 하드 삭제(§4.10의 is_deleted 소프트 삭제는 레코드 자체에만 적용, 첨부파일은 별개 축)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';
import { DpfAttachmentSlotKey } from '@/types/dpf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SLOT_KEYS: DpfAttachmentSlotKey[] = [
  'vehicle_photo', 'smoke_meter',
  'filter_cross_section_before', 'filter_cross_section_after',
  'filter_serial_before', 'filter_serial_after',
  'self_diagnostic_pressure_before', 'self_diagnostic_pressure_after',
  'smoke_test_result_before', 'smoke_test_result_after',
  'as_parts', 'as_processing',
];
const BUCKET = 'dpf-attachments';

export async function DELETE(request: NextRequest, { params }: { params: { id: string; slotKey: string } }) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { id, slotKey } = params;
    if (!SLOT_KEYS.includes(slotKey as DpfAttachmentSlotKey)) {
      return NextResponse.json({ error: '유효하지 않은 slot_key입니다' }, { status: 400 });
    }

    const { data: record } = await supabaseAdmin
      .from('dpf_service_records')
      .select('id')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!record) return NextResponse.json({ error: '접수 건을 찾을 수 없습니다' }, { status: 404 });

    const { data: attachment } = await supabaseAdmin
      .from('dpf_service_record_attachments')
      .select('storage_path')
      .eq('record_id', id)
      .eq('slot_key', slotKey)
      .maybeSingle();
    if (!attachment) return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다' }, { status: 404 });

    const { error: dbError } = await supabaseAdmin
      .from('dpf_service_record_attachments')
      .delete()
      .eq('record_id', id)
      .eq('slot_key', slotKey);
    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

    const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove([attachment.storage_path]);
    if (removeError) console.error('[DPF Attachment DELETE] storage 삭제 실패(무시):', removeError.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DPF Attachment DELETE] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
