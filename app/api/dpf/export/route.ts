// app/api/dpf/export/route.ts
// 차량 목록(검색/필터 조건 반영) 엑셀 다운로드
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';
import type { DpfVehicle } from '@/types/dpf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VENDOR_LABELS: Record<string, string> = { fujino: 'FJ', mz: 'MZ' };
const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

function raw(vehicle: DpfVehicle, key: string): string {
  const rd = vehicle.raw_data as Record<string, unknown> | undefined;
  const v = rd?.[key];
  return v != null && v !== '' ? String(v) : '';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() ?? '';
    const localGov = searchParams.get('local_government')?.trim() ?? '';
    const vendor = searchParams.get('vendor')?.trim() ?? '';

    const vehicles: DpfVehicle[] = [];
    let offset = 0;
    while (offset < MAX_ROWS) {
      let dbQuery = supabaseAdmin
        .from('dpf_vehicles')
        .select('id, vin, plate_number, vehicle_name, owner_name, owner_address, owner_contact, local_government, device_serial, installation_date, engine_type, device_type, trust_grade, plate_number_original, grade_management, management_direction, vendor, raw_data, is_active, created_at')
        .eq('is_deleted', false)
        .eq('is_active', true);

      if (query) {
        dbQuery = dbQuery.or(
          `vin.ilike.%${query}%,plate_number.ilike.%${query}%,owner_name.ilike.%${query}%,device_serial.ilike.%${query}%,owner_contact.ilike.%${query}%`
        );
      }
      if (localGov) {
        dbQuery = dbQuery.ilike('local_government', `%${localGov}%`);
      }
      if (vendor === 'fujino' || vendor === 'mz') {
        dbQuery = dbQuery.eq('vendor', vendor);
      }

      const { data, error } = await dbQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('[DPF Export] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      vehicles.push(...((data ?? []) as DpfVehicle[]));
      if (!data || data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Facility Manager';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('차량목록');
    sheet.columns = [
      { header: '구분', key: 'vendor', width: 8 },
      { header: '차량번호', key: 'plate_number', width: 14 },
      { header: '차대번호', key: 'vin', width: 20 },
      { header: '차명', key: 'vehicle_name', width: 14 },
      { header: '현재 업체명', key: 'owner_name', width: 18 },
      { header: '이전 업체명', key: 'prev_owner', width: 18 },
      { header: '연락처', key: 'owner_contact', width: 16 },
      { header: '주소', key: 'owner_address', width: 30 },
      { header: '제작사', key: 'manufacturer', width: 12 },
      { header: '장치', key: 'device_type', width: 12 },
      { header: '지자체(대)', key: 'local_gov_large', width: 14 },
      { header: '지자체(소)', key: 'local_gov_small', width: 12 },
      { header: '구조변경일', key: 'installation_date', width: 12 },
      { header: '최종실시일', key: 'last_service', width: 12 },
      { header: '청구년월', key: 'billing_month', width: 10 },
      { header: '조치공업사', key: 'service_shop', width: 16 },
      { header: '장소', key: 'location', width: 12 },
      { header: '일련번호(전)', key: 'serial_before', width: 16 },
      { header: '일련번호(후)', key: 'device_serial', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

    for (const v of vehicles) {
      sheet.addRow({
        vendor: VENDOR_LABELS[v.vendor] ?? v.vendor,
        plate_number: v.plate_number ?? '',
        vin: v.vin ?? '',
        vehicle_name: v.vehicle_name ?? '',
        owner_name: v.owner_name ?? '',
        prev_owner: raw(v, '이전 업체명'),
        owner_contact: v.owner_contact ?? '',
        owner_address: v.owner_address ?? '',
        manufacturer: raw(v, '제작사'),
        device_type: v.device_type || raw(v, '부착장치'),
        local_gov_large: v.local_government ?? '',
        local_gov_small: raw(v, '지자체(소)'),
        installation_date: v.installation_date ? v.installation_date.split('T')[0] : '',
        last_service: raw(v, '최종실시일자'),
        billing_month: raw(v, '청구년월'),
        service_shop: raw(v, '조치공업사'),
        location: raw(v, '장소'),
        serial_before: raw(v, '일련번호(전)'),
        device_serial: v.device_serial ?? '',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `DPF_차량목록_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (err) {
    console.error('[DPF Export] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
