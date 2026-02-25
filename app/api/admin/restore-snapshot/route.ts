// app/api/admin/restore-snapshot/route.ts - 백업 스냅샷 복원 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne, query as pgQuery, transaction } from '@/lib/supabase-direct';
import { verifyTokenHybrid } from '@/lib/secure-jwt';
import { logDebug, logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// UTF-8 정규화
function normalizeUTF8(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.normalize('NFC');
}

// 관리자 권한 확인 (권한 4 이상)
async function checkAdminPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else {
    const cookieToken = request.cookies.get('auth_token')?.value;
    if (cookieToken) token = cookieToken;
  }

  if (!token) return { authorized: false, user: null };

  try {
    const result = await verifyTokenHybrid(token);
    if (!result.user) return { authorized: false, user: null };
    if (result.user.permission_level < 4) return { authorized: false, user: result.user };
    return { authorized: true, user: result.user };
  } catch {
    return { authorized: false, user: null };
  }
}

// POST: 백업 복원
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const { authorized, user } = await checkAdminPermission(request);
    if (!authorized || !user) {
      return createErrorResponse('관리자 권한이 필요합니다 (권한 레벨 4)', 403);
    }

    const body = await request.json();
    const { snapshotId } = body;

    if (!snapshotId) {
      return createErrorResponse('snapshotId가 필요합니다', 400);
    }

    logDebug('RESTORE-SNAPSHOT', '복원 요청', { snapshotId, user: user.name });

    // 스냅샷 조회
    const snapshot = await queryOne(
      `SELECT id, snapshot_type, data, is_restored, expires_at, record_count
       FROM backup_snapshots WHERE id = $1`,
      [snapshotId]
    );

    if (!snapshot) {
      return createErrorResponse('백업 스냅샷을 찾을 수 없습니다', 404);
    }
    if (snapshot.is_restored) {
      return createErrorResponse('이미 복원된 백업입니다', 400);
    }
    if (new Date(snapshot.expires_at) < new Date()) {
      return createErrorResponse('만료된 백업입니다 (7일 보관 기간 초과)', 400);
    }

    logDebug('RESTORE-SNAPSHOT', '스냅샷 확인', {
      type: snapshot.snapshot_type,
      recordCount: snapshot.record_count
    });

    let restoredCount = 0;

    // ─── 사업장 복원 ───────────────────────────────────────────────────────
    if (snapshot.snapshot_type === 'business_replace_all') {
      const backupBusinesses: any[] = snapshot.data?.businesses || [];

      await transaction(async (client) => {
        // NOT NULL no-action FK: 먼저 삭제
        await client.query(`DELETE FROM estimate_history
          WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);
        await client.query(`DELETE FROM operating_cost_adjustments
          WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);

        // nullable no-action FK: NULL 처리
        await client.query(`UPDATE revenue_calculations SET business_id = NULL
          WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);
        await client.query(`UPDATE survey_cost_adjustments SET business_id = NULL
          WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);
        await client.query(`UPDATE calendar_events SET business_id = NULL
          WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);

        // 현재 사업장 전체 삭제
        await client.query(`DELETE FROM business_info WHERE is_deleted = false`);

        // 백업 사업장 재삽입
        for (const b of backupBusinesses) {
          const insertResult = await client.query(
            `INSERT INTO business_info (
              business_name, local_government, address,
              representative_name, business_registration_number, business_type,
              business_contact, manager_name, manager_contact, manager_position,
              fax_number, email,
              ph_meter, differential_pressure_meter, temperature_meter,
              discharge_current_meter, fan_current_meter, pump_current_meter,
              gateway, vpn_wired, vpn_wireless, multiple_stack,
              is_active, is_deleted
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
              true, false
            ) RETURNING id`,
            [
              normalizeUTF8(b.business_name || ''),
              normalizeUTF8(b.local_government || ''),
              normalizeUTF8(b.address || ''),
              normalizeUTF8(b.representative_name || ''),
              normalizeUTF8(b.business_registration_number || ''),
              normalizeUTF8(b.business_type || ''),
              normalizeUTF8(b.business_contact || ''),
              normalizeUTF8(b.manager_name || ''),
              normalizeUTF8(b.manager_contact || ''),
              normalizeUTF8(b.manager_position || ''),
              normalizeUTF8(b.fax_number || ''),
              normalizeUTF8(b.email || ''),
              b.ph_meter || 0,
              b.differential_pressure_meter || 0,
              b.temperature_meter || 0,
              b.discharge_current_meter || 0,
              b.fan_current_meter || 0,
              b.pump_current_meter || 0,
              b.gateway || 0,
              b.vpn_wired || 0,
              b.vpn_wireless || 0,
              b.multiple_stack || 0,
            ]
          );
          const newBizId = insertResult.rows[0].id;
          restoredCount++;

          // air_permit 재삽입
          if (!b.air_permits) continue;
          for (const permit of b.air_permits) {
            const permitResult = await client.query(
              `INSERT INTO air_permit_info (
                business_id, business_type, annual_pollutant_emission,
                first_report_date, operation_start_date, additional_info,
                is_active, is_deleted
              ) VALUES ($1,$2,$3,$4,$5,$6, true, false)
              RETURNING id`,
              [
                newBizId,
                permit.business_type || null,
                permit.annual_pollutant_emission || null,
                permit.first_report_date || null,
                permit.operation_start_date || null,
                JSON.stringify(permit.additional_info || {}),
              ]
            );
            const newPermitId = permitResult.rows[0].id;

            if (!permit.outlets) continue;
            for (const outlet of permit.outlets) {
              const outletResult = await client.query(
                `INSERT INTO discharge_outlets (air_permit_id, outlet_number, outlet_name, additional_info)
                 VALUES ($1,$2,$3,$4) RETURNING id`,
                [newPermitId, outlet.outlet_number, outlet.outlet_name || null, JSON.stringify(outlet.additional_info || {})]
              );
              const newOutletId = outletResult.rows[0].id;

              for (const f of (outlet.facilities || [])) {
                await client.query(
                  `INSERT INTO discharge_facilities (outlet_id, facility_name, capacity, quantity)
                   VALUES ($1,$2,$3,$4)`,
                  [newOutletId, f.facility_name, f.capacity || null, f.quantity || 1]
                );
              }
              for (const pf of (outlet.prevention_facilities || [])) {
                await client.query(
                  `INSERT INTO prevention_facilities (outlet_id, facility_name, capacity, quantity)
                   VALUES ($1,$2,$3,$4)`,
                  [newOutletId, pf.facility_name, pf.capacity || null, pf.quantity || 1]
                );
              }
            }
          }
        }
      });
    }

    // ─── 업무 복원 ─────────────────────────────────────────────────────────
    else if (snapshot.snapshot_type === 'tasks_replace_all') {
      const backupTasks: any[] = snapshot.data?.tasks || [];

      await transaction(async (client) => {
        // 현재 업무 전체 삭제
        await client.query(`DELETE FROM facility_tasks WHERE is_deleted = false AND is_active = true`);

        // 백업 업무 재삽입
        for (const t of backupTasks) {
          await client.query(
            `INSERT INTO facility_tasks (
              title, description, business_name, business_id,
              task_type, status, priority, assignee, assignees,
              notes, due_date, is_active, is_deleted,
              created_by, created_by_name
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, true, false, $12,$13)`,
            [
              t.title,
              t.description || null,
              t.business_name || null,
              t.business_id || null,
              t.task_type,
              t.status,
              t.priority || 'medium',
              t.assignee || null,
              t.assignees ? JSON.stringify(t.assignees) : null,
              t.notes || null,
              t.due_date || null,
              t.created_by || null,
              t.created_by_name || null,
            ]
          );
          restoredCount++;
        }
      });
    } else {
      return createErrorResponse(`알 수 없는 스냅샷 타입: ${snapshot.snapshot_type}`, 400);
    }

    // 복원 완료 표시
    await pgQuery(
      `UPDATE backup_snapshots SET is_restored = true, restored_at = NOW() WHERE id = $1`,
      [snapshotId]
    );

    logDebug('RESTORE-SNAPSHOT', '복원 완료', { snapshotId, restoredCount });

    return createSuccessResponse({
      snapshotType: snapshot.snapshot_type,
      restoredCount,
      message: `${restoredCount}개 레코드가 복원되었습니다.`
    });

  } catch (error: any) {
    logError('RESTORE-SNAPSHOT', 'POST 오류', error);
    return createErrorResponse('복원 중 오류가 발생했습니다. 롤백되었습니다.', 500);
  }
}, { logLevel: 'debug' });

// GET: 복원 가능한 스냅샷 목록 조회
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    const { authorized } = await checkAdminPermission(request);
    if (!authorized) {
      return createErrorResponse('관리자 권한이 필요합니다', 403);
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'business_replace_all' | 'tasks_replace_all'

    const snapshots = await queryOne(
      `SELECT id, snapshot_type, created_at, expires_at, is_restored, record_count
       FROM backup_snapshots
       WHERE expires_at > NOW()
         AND is_restored = false
         ${type ? `AND snapshot_type = '${type}'` : ''}
       ORDER BY created_at DESC
       LIMIT 20`
    ) as any;

    return createSuccessResponse({ snapshots: snapshots ? [snapshots] : [] });
  } catch (error: any) {
    logError('RESTORE-SNAPSHOT', 'GET 오류', error);
    return createErrorResponse('스냅샷 목록 조회 실패', 500);
  }
}, { logLevel: 'debug' });
