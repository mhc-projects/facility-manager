import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: { vin: string; id: string } }
) {
  try {
    const body = await request.json();
    const { action_type, serial_number, installer_company, installation_date,
            management_number, sales_office, notes } = body;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action_type !== undefined) update.action_type = action_type;
    if (serial_number !== undefined) update.serial_number = serial_number?.trim() || null;
    if (installer_company !== undefined) update.installer_company = installer_company?.trim() || null;
    if (installation_date !== undefined) update.installation_date = installation_date || null;
    if (management_number !== undefined) update.management_number = management_number?.trim() || null;
    if (sales_office !== undefined) update.sales_office = sales_office?.trim() || null;
    if (notes !== undefined) update.notes = notes?.trim() || null;

    const { data, error } = await supabaseAdmin
      .from('dpf_device_installations')
      .update(update)
      .eq('id', params.id)
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: '이력을 찾을 수 없습니다' }, { status: 404 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { vin: string; id: string } }
) {
  try {
    const { error } = await supabaseAdmin
      .from('dpf_device_installations')
      .delete()
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
