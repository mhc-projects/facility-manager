// 사업장관리 등록정보(기본정보·장비·진행현황) 실시간 조회 도구 (블루온AI 함수호출용)
import { query as pgQuery } from '@/lib/supabase-direct';
import { EQUIPMENT_FIELDS } from '@/lib/receivables-engine';
import { findBusinessesByName } from '@/lib/revenue-tools';
import { TASK_STATUS_KR, TASK_TYPE_KR, PRIORITY_KR } from '@/lib/task-status-utils';

const EQUIPMENT_LABELS: Record<string, string> = {
  ph_meter: 'pH미터',
  differential_pressure_meter: '차압계',
  temperature_meter: '온도계',
  discharge_current_meter: '배출전류계',
  fan_current_meter: '송풍전류계',
  pump_current_meter: '펌프전류계',
  gateway: '게이트웨이',
  gateway_1_2: '게이트웨이(1,2구)',
  gateway_3_4: '게이트웨이(3,4구)',
  vpn_wired: 'VPN(유선)',
  vpn_wireless: 'VPN(무선)',
  explosion_proof_differential_pressure_meter_domestic: '방폭차압계',
  explosion_proof_temperature_meter_domestic: '방폭온도계',
  expansion_device: '확장장치',
  relay_8ch: '중계기(8채널)',
  relay_16ch: '중계기(16채널)',
  main_board_replacement: '메인보드교체',
  multiple_stack: '복수굴뚝',
};

type TaskRow = {
  business_id: string;
  title: string;
  status: string;
  task_type: string | null;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  updated_at: string;
};

const PRIORITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** status 코드를 한글 라벨로 변환한다. task_stages 커스텀 라벨을 우선하고, 없으면 기본 매핑으로 폴백한다. */
function labelizeStatus(status: string, stageLabels: Map<string, string>): string {
  return stageLabels.get(status) ?? TASK_STATUS_KR[status] ?? status;
}

type StageDetail = { label: string; taskType: string | null };

/** 사업장관리 목록의 "현재단계" 컬럼과 동일한 로직(업무관리 계산 로직)으로 대표 업무단계를 계산한다. */
function computeCurrentStageDetail(tasks: TaskRow[], stageLabels: Map<string, string>): StageDetail {
  const activeTasks = tasks.filter(t => !t.completed_at);
  if (activeTasks.length === 0) {
    const label = tasks.some(t => t.completed_at) ? '업무 완료' : '업무 미등록';
    return { label, taskType: null };
  }
  const sorted = [...activeTasks].sort((a, b) => {
    const diff = (PRIORITY_ORDER[b.priority ?? ''] ?? 0) - (PRIORITY_ORDER[a.priority ?? ''] ?? 0);
    if (diff !== 0) return diff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
  const topTask = sorted[0];
  const rawLabel = labelizeStatus(topTask.status, stageLabels);
  const typeKR = topTask.task_type && topTask.task_type !== 'etc' ? TASK_TYPE_KR[topTask.task_type] : null;
  const label = typeKR ? `[${typeKR}] ${rawLabel}` : rawLabel;
  return {
    label: activeTasks.length === 1 ? label : `${label} 외 ${activeTasks.length - 1}건`,
    taskType: topTask.task_type,
  };
}

/** 사업장의 등록정보(기본정보·연락처·진행현황·업무단계·제출현황·장비·관련 업무)를 한 번에 조회한다. */
export async function getBusinessProfile(businessNameQuery: string) {
  const matches = await findBusinessesByName(businessNameQuery);
  if (matches.length === 0) {
    return { found: false, message: `"${businessNameQuery}"와 일치하는 사업장을 찾을 수 없습니다.` };
  }

  const ids = matches.map(m => m.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const equipmentSelect = EQUIPMENT_FIELDS.map(f => `bi.${f}`).join(', ');

  const [bizResult, tasksResult, stageResult] = await Promise.all([
    pgQuery(
      `SELECT bi.id, bi.business_name, bi.address, bi.local_government, bi.business_type, bi.industry_type,
              bi.business_registration_number, bi.manager_name, bi.manager_contact, bi.business_contact,
              bi.representative_name, bi.manufacturer, bi.sales_office, bi.department,
              bi.progress_status, bi.project_year, bi.order_date, bi.installation_date, bi.completion_date,
              bi.construction_report_submitted_at, bi.greenlink_confirmation_submitted_at,
              bi.attachment_completion_submitted_at,
              bi.special_notes, bi.notes, ${equipmentSelect}
       FROM business_info bi WHERE bi.id IN (${placeholders})`,
      ids
    ),
    pgQuery(
      `SELECT business_id, title, status, task_type, priority, due_date, completed_at, updated_at
       FROM facility_tasks
       WHERE business_id IN (${placeholders}) AND is_active = true AND is_deleted = false
       ORDER BY due_date ASC NULLS LAST
       LIMIT 50`,
      ids
    ),
    pgQuery(`SELECT stage_key, stage_label FROM task_stages WHERE is_active = true`),
  ]);

  const stageLabels = new Map<string, string>(
    (stageResult.rows ?? []).map((s: any) => [s.stage_key, s.stage_label])
  );

  const tasksByBusiness = new Map<string, TaskRow[]>();
  for (const t of (tasksResult.rows ?? []) as TaskRow[]) {
    const list = tasksByBusiness.get(t.business_id) ?? [];
    list.push(t);
    tasksByBusiness.set(t.business_id, list);
  }

  const results = (bizResult.rows ?? []).map((biz: any) => {
    const equipment = EQUIPMENT_FIELDS
      .filter(f => Number(biz[f]) > 0)
      .map(f => ({ 종류: EQUIPMENT_LABELS[f] ?? f, 수량: biz[f] }));
    const tasks = tasksByBusiness.get(biz.id) ?? [];

    return {
      business_name: biz.business_name,
      주소: biz.address,
      지자체: biz.local_government,
      업종: biz.business_type || biz.industry_type,
      사업자등록번호: biz.business_registration_number,
      담당자명: biz.manager_name,
      담당자연락처: biz.manager_contact,
      사업장연락처: biz.business_contact,
      대표자: biz.representative_name,
      제조사: biz.manufacturer,
      영업소: biz.sales_office,
      부서: biz.department,
      진행상태: biz.progress_status,
      현재단계: computeCurrentStageDetail(tasks, stageLabels).label,
      사업진행연도: biz.project_year,
      수주일: biz.order_date,
      설치일: biz.installation_date,
      완료일: biz.completion_date,
      착공신고서제출일: biz.construction_report_submitted_at,
      그린링크전송확인서제출일: biz.greenlink_confirmation_submitted_at,
      부착완료통보제출일: biz.attachment_completion_submitted_at,
      특이사항: biz.special_notes || biz.notes,
      장비: equipment,
      관련업무: tasks.map(t => ({
        title: t.title,
        상태: labelizeStatus(t.status, stageLabels),
        우선순위: t.priority ? PRIORITY_KR[t.priority] ?? t.priority : null,
        기한: t.due_date,
      })),
    };
  });

  return { found: true, results };
}

const STATUS_FIELD_MAP: Record<string, string> = {
  order_placed: 'order_date',
  construction_report_submitted: 'construction_report_submitted_at',
  greenlink_confirmation_submitted: 'greenlink_confirmation_submitted_at',
  attachment_completion_submitted: 'attachment_completion_submitted_at',
  installation_completed: 'installation_date',
};

export type BusinessStatusCriteria = {
  order_placed?: boolean;
  construction_report_submitted?: boolean;
  greenlink_confirmation_submitted?: boolean;
  attachment_completion_submitted?: boolean;
  installation_completed?: boolean;
  progress_status?: string;
  limit?: number;
};

/** 사업장관리 "상세 필터"와 동일한 조건(발주일/착공신고서/그린링크/부착완료/설치완료 있음·없음, 진행구분)으로 사업장 목록을 검색한다. */
export async function findBusinessesByStatus(criteria: BusinessStatusCriteria) {
  const conditions = ['bi.is_active = true', 'bi.is_deleted = false'];
  const params: unknown[] = [];

  for (const [key, column] of Object.entries(STATUS_FIELD_MAP)) {
    const value = (criteria as Record<string, unknown>)[key];
    if (typeof value !== 'boolean') continue;
    conditions.push(value ? `bi.${column} IS NOT NULL` : `bi.${column} IS NULL`);
  }

  if (criteria.progress_status) {
    params.push(`%${criteria.progress_status}%`);
    conditions.push(`bi.progress_status ILIKE $${params.length}`);
  }

  const limit = Math.min(Math.max(criteria.limit ?? 50, 1), 100);

  const result = await pgQuery(
    `SELECT business_name, address, manager_name, manager_contact, progress_status,
            order_date, installation_date, construction_report_submitted_at,
            greenlink_confirmation_submitted_at, attachment_completion_submitted_at
     FROM business_info bi
     WHERE ${conditions.join(' AND ')}
     ORDER BY business_name
     LIMIT ${limit}`,
    params
  );

  const rows = result.rows ?? [];
  return {
    found: true,
    count: rows.length,
    truncated: rows.length === limit,
    results: rows.map((r: any) => ({
      business_name: r.business_name,
      주소: r.address,
      담당자명: r.manager_name,
      담당자연락처: r.manager_contact,
      진행상태: r.progress_status,
      수주일: r.order_date,
      설치일: r.installation_date,
      착공신고서제출일: r.construction_report_submitted_at,
      그린링크전송확인서제출일: r.greenlink_confirmation_submitted_at,
      부착완료통보제출일: r.attachment_completion_submitted_at,
    })),
  };
}

const TASK_TYPE_KR_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TASK_TYPE_KR).map(([code, kr]) => [kr, code])
);

export type BusinessStageCriteria = {
  stage_keyword?: string;
  task_type?: string;
  limit?: number;
};

/**
 * 사업장관리 목록의 "현재단계"(업무관리와 동일한 계산 로직)를 기준으로 사업장 목록을 검색한다.
 * 현재단계는 저장된 컬럼이 아니라 매번 계산되는 값이라, 활성 업무 전체를 불러와 사업장별로 계산한 뒤 필터링한다.
 */
export async function findBusinessesByStage(criteria: BusinessStageCriteria) {
  const limit = Math.min(Math.max(criteria.limit ?? 50, 1), 100);

  const [taskRowsResult, stageResult, bizRowsResult] = await Promise.all([
    pgQuery(
      `SELECT business_id, business_name, status, task_type, priority, completed_at, updated_at
       FROM facility_tasks WHERE is_active = true AND is_deleted = false`
    ),
    pgQuery(`SELECT stage_key, stage_label FROM task_stages WHERE is_active = true`),
    pgQuery(`SELECT id, business_name FROM business_info WHERE is_active = true AND is_deleted = false`),
  ]);

  const stageLabels = new Map<string, string>(
    (stageResult.rows ?? []).map((s: any) => [s.stage_key, s.stage_label])
  );

  type RawTaskRow = TaskRow & { business_name: string | null };
  const tasksByBusinessId = new Map<string, RawTaskRow[]>();
  const tasksByBusinessName = new Map<string, RawTaskRow[]>();
  for (const t of (taskRowsResult.rows ?? []) as RawTaskRow[]) {
    if (t.business_id) {
      const list = tasksByBusinessId.get(t.business_id) ?? [];
      list.push(t);
      tasksByBusinessId.set(t.business_id, list);
    } else if (t.business_name) {
      const list = tasksByBusinessName.get(t.business_name) ?? [];
      list.push(t);
      tasksByBusinessName.set(t.business_name, list);
    }
  }

  const taskTypeFilter = criteria.task_type
    ? (TASK_TYPE_KR_TO_CODE[criteria.task_type] ?? criteria.task_type)
    : null;

  const matches: { business_name: string; 현재단계: string }[] = [];
  for (const biz of (bizRowsResult.rows ?? []) as { id: string; business_name: string }[]) {
    const tasks = tasksByBusinessId.get(biz.id) ?? tasksByBusinessName.get(biz.business_name) ?? [];
    const detail = computeCurrentStageDetail(tasks, stageLabels);
    if (criteria.stage_keyword && !detail.label.includes(criteria.stage_keyword)) continue;
    if (taskTypeFilter && detail.taskType !== taskTypeFilter) continue;
    matches.push({ business_name: biz.business_name, 현재단계: detail.label });
  }

  return {
    found: true,
    count: Math.min(matches.length, limit),
    truncated: matches.length > limit,
    results: matches.slice(0, limit),
  };
}
