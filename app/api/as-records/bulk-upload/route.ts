import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['received', 'scheduled', 'in_progress', 'parts_waiting', 'on_hold', 'completed', 'cancelled'];

const STATUS_MAP: Record<string, string> = {
  '접수': 'received',
  '일정조율중': 'scheduled',
  '진행중': 'in_progress',
  '부품대기': 'parts_waiting',
  '보류': 'on_hold',
  '완료': 'completed',
  '취소': 'cancelled',
};

const PAID_MAP: Record<string, boolean | null> = {
  '유상': true,
  '무상': false,
  '자동': null,
  '': null,
};

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(val).trim();
  if (!str) return null;
  // YYYY-MM-DD or YYYY/MM/DD
  const match = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return null;
}

function str(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null;
  return String(val).trim() || null;
}

// 연락처 등 줄바꿈이 포함될 수 있는 필드: 첫 번째 줄만 사용
function strFirstLine(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null;
  const s = String(val).trim();
  if (!s) return null;
  return s.split(/[\r\n]+/)[0].trim() || null;
}

/**
 * POST /api/as-records/bulk-upload
 * AS 건 엑셀 일괄 업로드
 *
 * 엑셀 컬럼 순서:
 * A: 사업장관리코드 (권장 - 있으면 사업장명보다 우선)
 * B: 사업장명 (사업장관리코드가 없는 경우 필수)
 * C: 접수일 (YYYY-MM-DD)
 * D: 작업일 (YYYY-MM-DD)
 * E: 접수내용
 * F: 작업내용
 * G: 배출구 정보
 * H: AS담당자
 * I: 연락처
 * J: 소속/회사
 * K: 상태 (접수/일정조율중/진행중/부품대기/보류/완료/취소)
 * L: 유상/무상 (유상/무상/자동)
 * M: 사업장주소 (타업체 사업장의 경우 직접 입력)
 * N: 사업장담당자 (타업체 사업장의 경우 직접 입력)
 * O: 사업장연락처 (타업체 사업장의 경우 직접 입력)
 * P: 출동횟수 (숫자, 기본값 1)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: '파일이 없습니다' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) {
      return NextResponse.json({ success: false, error: '데이터가 없습니다 (헤더 행 제외)' }, { status: 400 });
    }

    // 헤더 행 건너뜀 (관리코드 또는 사업장명이 있는 행만 처리)
    const dataRows = rows.slice(1).filter(row => {
      const mgmtCode = str(row[0]);
      const businessName = str(row[1]);
      return (mgmtCode && mgmtCode.length > 0) || (businessName && businessName.length > 0);
    });

    if (dataRows.length === 0) {
      return NextResponse.json({ success: false, error: '유효한 데이터 행이 없습니다' }, { status: 400 });
    }

    // 사업장 일괄 조회: 관리코드 목록 + 사업장명 목록
    const mgmtCodes = [...new Set(dataRows.map(r => str(r[0])).filter((c): c is string => !!c))];
    const businessNames = [...new Set(dataRows.map(r => str(r[1])).filter((n): n is string => !!n))];

    // id → { id, business_name, business_management_code } 매핑
    const bizByCode: Record<string, string> = {};   // management_code → business_id
    const bizByName: Record<string, string> = {};   // business_name → business_id

    if (mgmtCodes.length > 0) {
      const codePlaceholders = mgmtCodes.map((_, i) => `$${i + 1}`).join(', ');
      const codeResult = await pgQuery(
        `SELECT id, business_name, business_management_code FROM business_info
         WHERE CAST(business_management_code AS TEXT) = ANY(ARRAY[${codePlaceholders}]) AND is_deleted = false`,
        mgmtCodes
      );
      for (const row of codeResult.rows) {
        if (row.business_management_code != null) {
          bizByCode[String(row.business_management_code)] = row.id;
        }
      }
    }

    if (businessNames.length > 0) {
      const namePlaceholders = businessNames.map((_, i) => `$${i + 1}`).join(', ');
      const nameResult = await pgQuery(
        `SELECT id, business_name FROM business_info WHERE TRIM(business_name) = ANY(ARRAY[${namePlaceholders}]) AND is_deleted = false`,
        businessNames.map(n => n.trim())
      );
      for (const row of nameResult.rows) {
        bizByName[row.business_name] = row.id;
      }
    }

    const results: { row: number; success: boolean; business_name: string; error?: string }[] = [];
    let successCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-based + header
      const mgmtCodeRaw = str(row[0]);
      const businessName = str(row[1]) || mgmtCodeRaw || '(코드 없음)';

      // 관리코드 우선, 없으면 사업장명으로 조회
      let businessId: string | undefined;
      if (mgmtCodeRaw) {
        businessId = bizByCode[mgmtCodeRaw];
      }
      if (!businessId && str(row[1])) {
        businessId = bizByName[str(row[1])!];
      }

      // 사업장 미등록이어도 저장 가능 (business_name_raw에 이름 저장)
      const receiptDate = parseDate(row[2]);
      const workDate = parseDate(row[3]);
      const receiptContent = str(row[4]);
      const workContent = str(row[5]);
      const outletDescription = str(row[6]);
      const asManagerName = str(row[7]);
      const asManagerContact = strFirstLine(row[8]);
      const asManagerAffiliation = str(row[9]);

      const statusRaw = str(row[10]) || '';
      const status = STATUS_MAP[statusRaw] || (VALID_STATUSES.includes(statusRaw) ? statusRaw : 'received');

      const paidRaw = str(row[11]) || '';
      const isPaidOverride = paidRaw in PAID_MAP ? PAID_MAP[paidRaw] : null;
      // 타업체 사업장인 경우(businessId 없음)에만 사업장 정보 저장
      const siteAddress = str(row[12]);
      const siteManager = str(row[13]);
      const siteContact = strFirstLine(row[14]);
      const dispatchCountRaw = row[15];
      const dispatchCount = (dispatchCountRaw !== undefined && dispatchCountRaw !== null && dispatchCountRaw !== '')
        ? Math.max(1, Math.round(Number(dispatchCountRaw)))
        : 1;

      try {
        await pgQuery(
          `INSERT INTO as_records (
            business_id, business_name_raw, receipt_date, work_date, receipt_content, work_content,
            outlet_description, as_manager_name, as_manager_contact, as_manager_affiliation,
            site_address, site_manager, site_contact,
            is_paid_override, status, dispatch_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            businessId || null,
            businessId ? null : businessName,  // 미등록 사업장은 이름 직접 저장
            receiptDate,
            workDate,
            receiptContent,
            workContent,
            outletDescription,
            asManagerName,
            asManagerContact,
            asManagerAffiliation,
            businessId ? null : siteAddress,
            businessId ? null : siteManager,
            businessId ? null : siteContact,
            isPaidOverride,
            status,
            dispatchCount,
          ]
        );
        results.push({ row: rowNum, success: true, business_name: businessName });
        successCount++;
      } catch (err) {
        console.error(`[bulk-upload] row ${rowNum} insert error:`, err);
        results.push({ row: rowNum, success: false, business_name: businessName, error: '저장 실패' });
      }
    }

    return NextResponse.json({
      success: true,
      total: dataRows.length,
      successCount,
      failCount: dataRows.length - successCount,
      results,
    });
  } catch (error) {
    console.error('[as-records/bulk-upload] error:', error);
    return NextResponse.json({ success: false, error: '업로드 처리 실패' }, { status: 500 });
  }
}
