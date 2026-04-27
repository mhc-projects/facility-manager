// DPF 엑셀 컬럼 매핑
// 노란색 헤더(9개)만 dpf_vehicles 컬럼으로 직접 매핑
// 나머지 컬럼은 raw_data JSONB에 보관

/** 후지노 엑셀 컬럼 → DB 컬럼 (엠즈와 동일한 컬럼명 기준) */
export const FUJINO_PRIMARY_COLUMNS: Record<string, string> = {
  '차대번호':       'vin',
  '현재 차량번호':  'plate_number',
  '차명':           'vehicle_name',
  '현재 업체명':    'owner_name',
  '주소':           'owner_address',
  '최종연락처':     'owner_contact',
  '지자체(대)':     'local_government',
  '일련번호(후)':   'device_serial',
  '구조변경일자':   'installation_date',
};

/** 엠즈 엑셀 컬럼 → DB 컬럼 */
export const MZ_PRIMARY_COLUMNS: Record<string, string> = {
  '차대번호':     'vin',
  '현재 차량번호': 'plate_number',
  '차명':         'vehicle_name',
  '현재 업체명':  'owner_name',
  '주소':         'owner_address',
  '최종연락처':   'owner_contact',
  '지자체(대)':   'local_government',
  '일련번호(후)': 'device_serial',
  '구조변경일자': 'installation_date', // 개행 제거 후 정규화된 이름
};

// 하위 호환성 유지
export const DPF_PRIMARY_COLUMNS = FUJINO_PRIMARY_COLUMNS;

export interface DpfVehicleRow {
  vin: string;
  plate_number: string;
  vehicle_name?: string;
  owner_name?: string;
  owner_address?: string;
  owner_contact?: string;
  local_government?: string;
  device_serial?: string;
  installation_date?: string;
  raw_data: Record<string, unknown>;
}

/** 엑셀 헤더의 개행 문자 및 공백 정규화 */
export function normalizeHeader(key: string): string {
  return key.replace(/[\r\n]+/g, '').trim();
}

/** 엑셀 행의 헤더를 정규화한 새 객체 반환 */
export function normalizeRowHeaders(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    result[normalizeHeader(k)] = v;
  }
  return result;
}

/** 엑셀 행 → dpf_vehicles INSERT 형태로 변환 */
export function transformDpfRow(
  row: Record<string, unknown>,
  vendor: 'fujino' | 'mz' = 'fujino',
): DpfVehicleRow {
  const colMap = vendor === 'mz' ? MZ_PRIMARY_COLUMNS : FUJINO_PRIMARY_COLUMNS;

  // 엠즈는 헤더에 개행문자가 들어있을 수 있으므로 정규화
  const normalizedRow = vendor === 'mz' ? normalizeRowHeaders(row) : row;

  const primary: Record<string, unknown> = {};
  const rawData: Record<string, unknown> = {};

  for (const [excelCol, value] of Object.entries(normalizedRow)) {
    const dbCol = colMap[excelCol];
    if (dbCol) {
      if (dbCol === 'installation_date') {
        primary[dbCol] = parseExcelDate(value);
      } else {
        primary[dbCol] = value != null ? String(value).trim() : null;
      }
    } else {
      rawData[excelCol] = value;
    }
  }

  return {
    vin:              String(primary['vin'] ?? '').replace(/\s+/g, '').substring(0, 20),
    plate_number:     String(primary['plate_number'] ?? '').trim().substring(0, 50),
    vehicle_name:     primary['vehicle_name'] as string | undefined,
    owner_name:       primary['owner_name'] as string | undefined,
    owner_address:    primary['owner_address'] as string | undefined,
    owner_contact:    primary['owner_contact'] as string | undefined,
    local_government: primary['local_government'] as string | undefined,
    device_serial:    primary['device_serial'] as string | undefined,
    installation_date: primary['installation_date'] as string | undefined,
    raw_data: rawData,
  };
}

/** 엑셀 날짜 시리얼 또는 문자열을 YYYY-MM-DD로 변환 */
function parseExcelDate(value: unknown): string | null {
  if (value == null || value === '') return null;

  // 숫자형 엑셀 시리얼
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  const str = String(value).trim();
  if (!str) return null;

  // YYYY-MM-DD 또는 YYYY/MM/DD 형식
  const match = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  return null;
}

/** UI 테이블 컬럼 헤더 레이블 */
export const DPF_COLUMN_LABELS: Record<string, string> = {
  vin:              '차대번호',
  plate_number:     '차량번호',
  vehicle_name:     '차명',
  owner_name:       '소유자(업체)명',
  owner_address:    '주소',
  owner_contact:    '연락처',
  local_government: '접수지자체',
  device_serial:    '장치시리얼번호',
  installation_date:'구변일자',
};
