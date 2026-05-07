import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authGuard(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) return null;
  const level = decoded.permissionLevel ?? decoded.permission_level;
  if (!level || level < 3) return null;
  return decoded;
}

const PROGRESS_TYPE_LABELS: Record<string, string> = {
  self: '자비',
  subsidy: '보조금',
  subsidy_parallel: '보조금동시',
  subsidy_extra: '추가승인',
  dealer: '대리점',
  outsourcing: '외주',
  etc: '기타',
};

/**
 * GET /api/commission-closing/export?month=YYYY-MM&status=approved
 * 영업점별 지급 명세 Excel 생성
 */
export async function GET(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const statusFilter = searchParams.get('status') ?? 'approved';

    const monthClause = month ? `AND cp.payment_month = '${month.replace(/'/g, '')}'` : '';

    const rows = await queryAll(`
      SELECT
        cp.sales_office,
        b.business_name,
        b.local_government,
        cp.progress_type,
        cp.calculated_amount,
        cp.actual_amount,
        cp.payment_month,
        cp.payment_date,
        cp.status,
        cp.payment_note
      FROM commission_payments cp
      JOIN business_info b ON b.id = cp.business_id
      WHERE cp.status = $1
        ${monthClause}
      ORDER BY cp.sales_office, b.business_name
    `, [statusFilter]);

    // 동적 import로 ExcelJS 사용
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '블루온 영업비 마감 시스템';
    workbook.created = new Date();

    // 영업점별로 그룹화
    const grouped: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!grouped[r.sales_office]) grouped[r.sales_office] = [];
      grouped[r.sales_office].push(r);
    }

    // 전체 집계 시트
    const summarySheet = workbook.addWorksheet('영업점 집계');
    summarySheet.columns = [
      { header: '영업점', key: 'sales_office', width: 18 },
      { header: '건수', key: 'count', width: 8 },
      { header: '지급 합계', key: 'total', width: 16 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F0FF' } };

    let grandTotal = 0;
    for (const [office, bizes] of Object.entries(grouped)) {
      const total = bizes.reduce((s, r) => s + (r.actual_amount ?? 0), 0);
      grandTotal += total;
      summarySheet.addRow({ sales_office: office, count: bizes.length, total });
    }
    summarySheet.addRow({});
    const totalRow = summarySheet.addRow({ sales_office: '합계', count: rows.length, total: grandTotal });
    totalRow.font = { bold: true };

    // 영업점별 상세 시트
    for (const [office, bizes] of Object.entries(grouped)) {
      const sheet = workbook.addWorksheet(office.substring(0, 31));
      sheet.columns = [
        { header: '사업장명', key: 'business_name', width: 24 },
        { header: '지자체', key: 'local_government', width: 16 },
        { header: '진행유형', key: 'progress_type', width: 12 },
        { header: '산정영업비', key: 'calculated_amount', width: 14 },
        { header: '실지급액', key: 'actual_amount', width: 14 },
        { header: '귀속월', key: 'payment_month', width: 12 },
        { header: '지급일', key: 'payment_date', width: 12 },
        { header: '비고', key: 'payment_note', width: 24 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

      for (const r of bizes) {
        sheet.addRow({
          business_name: r.business_name,
          local_government: r.local_government ?? '',
          progress_type: PROGRESS_TYPE_LABELS[r.progress_type] ?? r.progress_type,
          calculated_amount: r.calculated_amount ?? 0,
          actual_amount: r.actual_amount ?? 0,
          payment_month: r.payment_month,
          payment_date: r.payment_date ?? '',
          payment_note: r.payment_note ?? '',
        });
      }

      const totalRow = sheet.addRow({
        business_name: '합계',
        calculated_amount: bizes.reduce((s, r) => s + (r.calculated_amount ?? 0), 0),
        actual_amount: bizes.reduce((s, r) => s + (r.actual_amount ?? 0), 0),
      });
      totalRow.font = { bold: true };

      // 금액 컬럼 숫자 형식
      ['calculated_amount', 'actual_amount'].forEach(key => {
        sheet.getColumn(key).numFmt = '#,##0';
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = month ? `영업비_지급명세_${month}.xlsx` : `영업비_지급명세.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('❌ [COMMISSION-EXPORT] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
