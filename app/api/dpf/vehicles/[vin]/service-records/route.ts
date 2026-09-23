// DPF 사후관리(AS/크리닝/물류) 접수 등록
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORIES = ['as', 'clean', 'clean_elapsed', 'cs', 'parts_delivery', 'urea', 'engine_replace'];

// 접수 1건의 분류 목록(선택 순서 유지, 첫 번째 = 대표). categories 배열이 없으면 구버전 단일 category를 받는다.
// 유효하지 않은 값이 하나라도 있으면 null.
function parseCategories(body: Record<string, unknown>): string[] | null {
  const raw = Array.isArray(body.categories) ? body.categories : body.category !== undefined ? [body.category] : [];
  const cats = Array.from(new Set(raw));
  if (cats.length === 0 || !cats.every(c => typeof c === 'string' && CATEGORIES.includes(c))) return null;
  return cats as string[];
}

// 접수 등록 폼에 실제로 있는 필드만 dpf_vehicles 변경정보 오버레이로 write-back한다(설계 §4.6).
// 차량번호/차대번호는 이 폼에 입력란이 없으므로 여기서 다루지 않는다 — VehicleFormModal에서만 수동 수정.
function buildOverlayUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const overlay: Record<string, unknown> = {};
  const map: Record<string, string> = {
    contact_wireless: 'current_contact_wireless',
    contact_wired: 'current_contact_wired',
    dispatch_area_primary: 'dispatch_area_primary',
    dispatch_area_secondary: 'dispatch_area_secondary',
  };
  for (const [from, to] of Object.entries(map)) {
    if (body[from] !== undefined) {
      const v = body[from];
      overlay[to] = typeof v === 'string' ? (v.trim() || null) : v;
    }
  }
  return overlay;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { vin: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const vin = decodeURIComponent(params.vin);
    const body = await request.json();

    const { data: vehicle, error: vErr } = await supabaseAdmin
      .from('dpf_vehicles')
      .select('id')
      .eq('vin', vin)
      .eq('is_deleted', false)
      .single();

    if (vErr || !vehicle) {
      return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 });
    }

    const categories = parseCategories(body);
    if (!categories) {
      return NextResponse.json({ error: '분류(category)가 올바르지 않습니다' }, { status: 400 });
    }

    const trimOrNull = (v: unknown) => (typeof v === 'string' ? (v.trim() || null) : v ?? null);
    const insertData: Record<string, unknown> = {
      vehicle_id: vehicle.id,
      category: categories[0],
      categories,
      status: body.status ?? 'in_progress',
      reception_date: body.reception_date || null,
      reception_content: trimOrNull(body.reception_content),
      detail_content: trimOrNull(body.detail_content),
      processing_content: trimOrNull(body.processing_content),
      local_government: trimOrNull(body.local_government),
      service_branch: trimOrNull(body.service_branch),
      assigned_as_technician: trimOrNull(body.assigned_as_technician),
      processing_technician: trimOrNull(body.processing_technician),
      technician_processed_at: body.technician_processed_at || null,
      processed_at: body.processed_at || null,
      completed_at: body.completed_at || null,
      is_urgent: Boolean(body.is_urgent),
      needs_callback: Boolean(body.needs_callback),
      is_dispatch: Boolean(body.is_dispatch),
      is_dropoff: Boolean(body.is_dropoff),
      filter_type: trimOrNull(body.filter_type),
      collected_filter: trimOrNull(body.collected_filter),
      replaced_filter: trimOrNull(body.replaced_filter),
      cost_type: body.cost_type || null,
      association_billing_date: body.association_billing_date || null,
      billing_status: body.billing_status || 'none',
      dispatch_area_primary: trimOrNull(body.dispatch_area_primary),
      dispatch_area_secondary: trimOrNull(body.dispatch_area_secondary),
      contact_wireless: trimOrNull(body.contact_wireless),
      contact_wired: trimOrNull(body.contact_wired),
      courier: trimOrNull(body.courier),
      delivery_request_type: body.delivery_request_type || null,
      delivery_address: trimOrNull(body.delivery_address),
      extension_requested: Boolean(body.extension_requested),
      extension_approved: body.extension_approved ?? null,
      extension_note: trimOrNull(body.extension_note),
      notes: trimOrNull(body.notes),
      created_by: auth.user.id,
    };
    // round_no/round_nos는 절대 세팅하지 않는다 — DB 트리거가 분류별로 채번한다(설계 §4.2)

    let { data, error } = await supabaseAdmin
      .from('dpf_service_records')
      .insert(insertData)
      .select()
      .single();

    // 동시 접수로 round_no 유니크 인덱스(23505) 충돌 시 1회만 재시도 — 트리거가 재계산하므로 재시도하면 해소된다.
    if (error?.code === '23505') {
      ({ data, error } = await supabaseAdmin
        .from('dpf_service_records')
        .insert(insertData)
        .select()
        .single());
    }

    if (error || !data) return NextResponse.json({ error: error?.message ?? '등록 실패' }, { status: 500 });

    const overlay = buildOverlayUpdate(body);
    if (Object.keys(overlay).length > 0) {
      overlay.updated_at = new Date().toISOString();
      const { error: overlayErr } = await supabaseAdmin
        .from('dpf_vehicles')
        .update(overlay)
        .eq('id', vehicle.id);
      if (overlayErr) console.error('[DPF Service Record] 변경정보 오버레이 write-back 실패:', overlayErr.message);
    }

    return NextResponse.json({ record: data }, { status: 201 });
  } catch (err) {
    console.error('[DPF Service Record] POST error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
