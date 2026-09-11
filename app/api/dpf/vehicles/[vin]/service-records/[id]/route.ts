// DPF 사후관리(AS/크리닝/물류) 접수 건 수정/삭제
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORIES = ['as', 'clean', 'cs', 'parts_delivery', 'urea', 'engine_replace'];

// 접수 등록 폼에 실제로 있는 필드만 write-back 대상(설계 §4.6) — POST 라우트와 동일 매핑
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { vin: string; id: string } }
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

    if (body.category !== undefined && !CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: '분류(category)가 올바르지 않습니다' }, { status: 400 });
    }

    const trimOrNull = (v: unknown) => (typeof v === 'string' ? (v.trim() || null) : v ?? null);
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    // 전환(크리닝↔AS 등) 허용 — round_no 재채번과 converted_from_category 기록은 DB 트리거가 처리(설계 §4.2)
    if (body.category !== undefined) update.category = body.category;
    if (body.status !== undefined) update.status = body.status;
    if (body.reception_date !== undefined) update.reception_date = body.reception_date || null;
    if (body.reception_content !== undefined) update.reception_content = trimOrNull(body.reception_content);
    if (body.detail_content !== undefined) update.detail_content = trimOrNull(body.detail_content);
    if (body.processing_content !== undefined) update.processing_content = trimOrNull(body.processing_content);
    if (body.local_government !== undefined) update.local_government = trimOrNull(body.local_government);
    if (body.service_branch !== undefined) update.service_branch = trimOrNull(body.service_branch);
    if (body.assigned_as_technician !== undefined) update.assigned_as_technician = trimOrNull(body.assigned_as_technician);
    if (body.processing_technician !== undefined) update.processing_technician = trimOrNull(body.processing_technician);
    if (body.technician_processed_at !== undefined) update.technician_processed_at = body.technician_processed_at || null;
    if (body.processed_at !== undefined) update.processed_at = body.processed_at || null;
    if (body.completed_at !== undefined) update.completed_at = body.completed_at || null;
    if (body.is_urgent !== undefined) update.is_urgent = Boolean(body.is_urgent);
    if (body.needs_callback !== undefined) update.needs_callback = Boolean(body.needs_callback);
    if (body.is_dispatch !== undefined) update.is_dispatch = Boolean(body.is_dispatch);
    if (body.is_dropoff !== undefined) update.is_dropoff = Boolean(body.is_dropoff);
    if (body.filter_type !== undefined) update.filter_type = trimOrNull(body.filter_type);
    if (body.collected_filter !== undefined) update.collected_filter = trimOrNull(body.collected_filter);
    if (body.replaced_filter !== undefined) update.replaced_filter = trimOrNull(body.replaced_filter);
    if (body.cost_type !== undefined) update.cost_type = body.cost_type || null;
    if (body.association_billing_date !== undefined) update.association_billing_date = body.association_billing_date || null;
    if (body.billing_status !== undefined) update.billing_status = body.billing_status || 'none';
    if (body.dispatch_area_primary !== undefined) update.dispatch_area_primary = trimOrNull(body.dispatch_area_primary);
    if (body.dispatch_area_secondary !== undefined) update.dispatch_area_secondary = trimOrNull(body.dispatch_area_secondary);
    if (body.contact_wireless !== undefined) update.contact_wireless = trimOrNull(body.contact_wireless);
    if (body.contact_wired !== undefined) update.contact_wired = trimOrNull(body.contact_wired);
    if (body.courier !== undefined) update.courier = trimOrNull(body.courier);
    if (body.delivery_request_type !== undefined) update.delivery_request_type = body.delivery_request_type || null;
    if (body.delivery_address !== undefined) update.delivery_address = trimOrNull(body.delivery_address);
    if (body.extension_requested !== undefined) update.extension_requested = Boolean(body.extension_requested);
    if (body.extension_approved !== undefined) update.extension_approved = body.extension_approved ?? null;
    if (body.extension_note !== undefined) update.extension_note = trimOrNull(body.extension_note);
    if (body.notes !== undefined) update.notes = trimOrNull(body.notes);
    // vehicle_id, round_no, converted_from_category, is_deleted는 이 라우트에서 받지 않는다(설계 §4.2/§4.10)

    let { data, error } = await supabaseAdmin
      .from('dpf_service_records')
      .update(update)
      .eq('id', params.id)
      .eq('vehicle_id', vehicle.id)
      .eq('is_deleted', false)
      .select()
      .single();

    // category 변경 시 round_no 재채번 트리거가 돌아 동시 요청과 부딪히면 23505 — 1회 재시도
    if (error?.code === '23505') {
      ({ data, error } = await supabaseAdmin
        .from('dpf_service_records')
        .update(update)
        .eq('id', params.id)
        .eq('vehicle_id', vehicle.id)
        .eq('is_deleted', false)
        .select()
        .single());
    }

    if (error || !data) return NextResponse.json({ error: error?.message ?? '접수 건을 찾을 수 없습니다' }, { status: 404 });

    // 변경정보 오버레이는 이 레코드가 해당 차량의 최신 접수 건일 때만 write-back(설계 §4.6) —
    // 오래된 티켓 수정이 더 최신 접수에서 확인된 연락처를 덮어쓰지 않도록.
    const overlay = buildOverlayUpdate(body);
    if (Object.keys(overlay).length > 0) {
      const { data: latest } = await supabaseAdmin
        .from('dpf_service_records')
        .select('id')
        .eq('vehicle_id', vehicle.id)
        .eq('is_deleted', false)
        .order('reception_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.id === params.id) {
        overlay.updated_at = new Date().toISOString();
        const { error: overlayErr } = await supabaseAdmin
          .from('dpf_vehicles')
          .update(overlay)
          .eq('id', vehicle.id);
        if (overlayErr) console.error('[DPF Service Record] 변경정보 오버레이 write-back 실패:', overlayErr.message);
      }
    }

    return NextResponse.json({ record: data });
  } catch (err) {
    console.error('[DPF Service Record] PUT error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { vin: string; id: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const vin = decodeURIComponent(params.vin);

    const { data: vehicle, error: vErr } = await supabaseAdmin
      .from('dpf_vehicles')
      .select('id')
      .eq('vin', vin)
      .eq('is_deleted', false)
      .single();

    if (vErr || !vehicle) {
      return NextResponse.json({ error: '차량을 찾을 수 없습니다' }, { status: 404 });
    }

    // 협회청구일자 등 청구 이력을 담고 있어 하드 삭제하지 않는다(설계 §4.10) — as_records/dpf_vehicles와 동일한 소프트 삭제 패턴
    const { error } = await supabaseAdmin
      .from('dpf_service_records')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('vehicle_id', vehicle.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DPF Service Record] DELETE error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
