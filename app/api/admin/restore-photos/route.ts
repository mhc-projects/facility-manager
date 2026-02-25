// app/api/admin/restore-photos/route.ts
// 전체교체(replaceAll) 이후 orphaned된 uploaded_files.business_id 복원 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenHybrid } from '@/lib/secure-jwt';
import { generateBusinessId } from '@/utils/business-id-generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  const result = await verifyTokenHybrid(token);
  if (!result.user) return { authorized: false, user: null };

  return { authorized: result.user.permission_level >= 4, user: result.user };
}

/**
 * POST /api/admin/restore-photos
 *
 * 전체교체 업로드 이후 business_info가 삭제/재생성되어
 * uploaded_files.business_id가 유효하지 않은(orphaned) 레코드들을
 * file_path의 해시 ID를 통해 현재 유효한 business_id로 복원합니다.
 *
 * dry_run=true 이면 실제 UPDATE 없이 복원 대상만 미리 보여줍니다.
 */
export const POST = withApiHandler(async (request: NextRequest) => {
  const { authorized, user } = await checkAdminPermission(request);
  if (!authorized) {
    return createErrorResponse('관리자 권한이 필요합니다', 403);
  }

  const body = await request.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run === true;

  console.log(`🔧 [RESTORE-PHOTOS] 시작 - 실행자: ${user?.name}, dry_run: ${dryRun}`);

  // 1. 현재 유효한 사업장 목록 조회
  const activeBusinesses = await queryAll(
    `SELECT id, business_name FROM business_info WHERE is_deleted = false AND business_name IS NOT NULL`
  );
  if (!activeBusinesses || activeBusinesses.length === 0) {
    return createErrorResponse('유효한 사업장이 없습니다', 404);
  }

  // 2. 모든 가능한 file_path 첫 세그먼트 → db UUID 룩업맵 생성
  // (biz_XXXX 해시, URL 인코딩, 레거시 하드코딩 이름 등 모든 패턴 포함)
  const segmentToDb = new Map<string, string>(); // segment → db UUID

  // 레거시 하드코딩 매핑 (generatePathVariants와 동일)
  const legacyMappings: Record<string, string> = {
    '스타일웍스': 'styleworks',
    '삼성전자': 'samsung',
    '엘지전자': 'lg',
  };

  for (const biz of activeBusinesses) {
    const name = biz.business_name;
    if (!name) continue;

    // 1. biz_XXXX 해시 경로
    try {
      const hashId = generateBusinessId(name);
      segmentToDb.set(hashId, biz.id);
    } catch { /* ignore */ }

    // 2. URL 인코딩 경로 (%XX → _)
    try {
      const encoded = encodeURIComponent(name).replace(/%/g, '_');
      segmentToDb.set(encoded, biz.id);
    } catch { /* ignore */ }

    // 3. 레거시 하드코딩 경로
    if (legacyMappings[name]) {
      segmentToDb.set(legacyMappings[name], biz.id);
    }
  }

  // 4. default_business는 file_path의 나머지 경로로 사업장명 추측 불가 → 별도 처리
  //    (단독으로는 매칭 불가능하므로 unmatched로 분류)

  console.log(`🗺️  [RESTORE-PHOTOS] 룩업맵 생성 완료: ${segmentToDb.size}개 세그먼트`);

  // 4. sanitizedBusiness 패턴 추가 (upload-supabase/route.ts의 경로 생성 로직과 동일)
  // 한글 사업장명 → 한글 제거 후 남은 영문/숫자 (없으면 'business')
  // 이 때 여러 사업장이 동일한 sanitized 값을 가질 수 있으므로 충돌 시 첫 번째 것만 사용
  const sanitizedToDb = new Map<string, string>(); // sanitizedBusiness → db UUID
  for (const biz of activeBusinesses) {
    const name = biz.business_name;
    if (!name) continue;
    try {
      const sanitized = name
        .replace(/[가-힣]/g, '')
        .replace(/[^\w\-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        || 'business';
      // 충돌 방지: 이미 등록된 세그먼트는 덮어쓰지 않음 (ambiguous)
      if (!sanitizedToDb.has(sanitized)) {
        sanitizedToDb.set(sanitized, biz.id);
      } else {
        // 충돌: 여러 사업장이 동일한 sanitized 값 → ambiguous 마킹
        sanitizedToDb.set(sanitized, '__ambiguous__');
      }
    } catch { /* ignore */ }
  }
  // ambiguous 항목 제거 (매핑 불가)
  for (const [k, v] of sanitizedToDb.entries()) {
    if (v === '__ambiguous__') sanitizedToDb.delete(k);
  }
  console.log(`🔤 [RESTORE-PHOTOS] sanitized 룩업맵: ${sanitizedToDb.size}개 (충돌 제외)`);

  // 3. orphaned uploaded_files 조회 (business_id가 없거나 유효하지 않은 레코드)
  const orphanedFiles = await queryAll(
    `SELECT uf.id, uf.business_id, uf.file_path
     FROM uploaded_files uf
     LEFT JOIN business_info bi ON bi.id = uf.business_id AND bi.is_deleted = false
     WHERE bi.id IS NULL AND uf.file_path IS NOT NULL`
  );

  if (!orphanedFiles || orphanedFiles.length === 0) {
    console.log('✅ [RESTORE-PHOTOS] 복원 대상 없음 - 모든 사진이 유효한 업무와 연결됨');
    return createSuccessResponse({
      restored: 0,
      unmatched: 0,
      message: '복원 대상이 없습니다. 모든 사진이 정상적으로 연결되어 있습니다.',
    });
  }

  console.log(`📷 [RESTORE-PHOTOS] orphaned 파일 수: ${orphanedFiles.length}개`);

  // 5. file_path 첫 세그먼트로 매칭 (모든 레거시 패턴 포함)
  const toRestore: Array<{ fileId: string; oldBizId: string; newBizId: string; filePath: string; hashId: string }> = [];
  const unmatched: Array<{ fileId: string; filePath: string; segment: string }> = [];

  for (const file of orphanedFiles) {
    const filePath: string = file.file_path || '';
    const firstSegment = filePath.split('/')[0];

    // 우선순위: biz_XXXX 해시/URL인코딩/레거시 → sanitizedBusiness 패턴
    const newDbId = segmentToDb.get(firstSegment) ?? sanitizedToDb.get(firstSegment);
    if (newDbId) {
      toRestore.push({
        fileId: file.id,
        oldBizId: file.business_id,
        newBizId: newDbId,
        filePath,
        hashId: firstSegment,
      });
    } else {
      unmatched.push({ fileId: file.id, filePath, segment: firstSegment });
    }
  }

  console.log(`✅ [RESTORE-PHOTOS] 1차 매칭 - 성공: ${toRestore.length}개, 실패: ${unmatched.length}개`);

  // 6. 2차 매핑: 같은 old business_id 그룹에서 이미 매칭된 newBizId 활용
  //    (예: 같은 사업장의 biz_XXXX 파일과 business/ 파일이 같은 업로드 세션에서 생성된 경우)
  if (unmatched.length > 0) {
    // old business_id → newBizId 역맵 (1차에서 매칭된 것들)
    const oldToNew = new Map<string, string>();
    for (const r of toRestore) {
      if (r.oldBizId) oldToNew.set(r.oldBizId, r.newBizId);
    }

    const stillUnmatched: Array<{ fileId: string; filePath: string; segment: string }> = [];
    for (const u of unmatched) {
      // unmatched 파일의 old business_id가 이미 다른 파일에서 매핑됐으면 같은 newBizId 사용
      const file = orphanedFiles.find((f: { id: string }) => f.id === u.fileId);
      const oldBizId = file?.business_id;
      const inferredNewBizId = oldBizId ? oldToNew.get(oldBizId) : undefined;
      if (inferredNewBizId) {
        toRestore.push({
          fileId: u.fileId,
          oldBizId: oldBizId || '',
          newBizId: inferredNewBizId,
          filePath: u.filePath,
          hashId: u.segment + '(inferred)',
        });
      } else {
        stillUnmatched.push(u);
      }
    }
    unmatched.length = 0;
    unmatched.push(...stillUnmatched);
    console.log(`✅ [RESTORE-PHOTOS] 2차 매칭(그룹 추론) - 추가 복원: ${toRestore.length}개 총, 여전히 실패: ${unmatched.length}개`);
  }

  console.log(`✅ [RESTORE-PHOTOS] 최종 매칭 성공: ${toRestore.length}개, 실패: ${unmatched.length}개`);

  if (dryRun) {
    // dry_run: 실제 변경 없이 미리보기만 반환
    // 미매칭 세그먼트별 그룹화 (원인 파악용)
    const unmatchedBySegment: Record<string, number> = {};
    for (const u of unmatched) {
      unmatchedBySegment[u.segment] = (unmatchedBySegment[u.segment] || 0) + 1;
    }
    const preview = toRestore.slice(0, 20).map(r => ({
      fileId: r.fileId,
      filePath: r.filePath,
      hashId: r.hashId,
      newBizId: r.newBizId,
    }));
    return createSuccessResponse({
      dry_run: true,
      toRestore: toRestore.length,
      unmatched: unmatched.length,
      preview,
      unmatchedSample: unmatched.slice(0, 10).map(u => u.filePath),
      unmatchedBySegment,
      // 전체 미매칭 목록 (segment + 대표 파일 경로)
      unmatchedAll: unmatched.map(u => ({ segment: u.segment, filePath: u.filePath })),
    });
  }

  // 5. 실제 복원: business_id 업데이트
  let restoredCount = 0;
  const errors: string[] = [];

  // 동일한 newBizId끼리 묶어서 배치 UPDATE
  const grouped = new Map<string, string[]>(); // newBizId → fileId[]
  for (const r of toRestore) {
    if (!grouped.has(r.newBizId)) grouped.set(r.newBizId, []);
    grouped.get(r.newBizId)!.push(r.fileId);
  }

  for (const [newBizId, fileIds] of grouped.entries()) {
    try {
      const placeholders = fileIds.map((_, i) => `$${i + 2}`).join(', ');
      const result = await pgQuery(
        `UPDATE uploaded_files SET business_id = $1 WHERE id IN (${placeholders})`,
        [newBizId, ...fileIds]
      );
      restoredCount += result.rowCount ?? 0;
      console.log(`📷 [RESTORE-PHOTOS] 복원: biz ${newBizId} → ${fileIds.length}개 파일`);
    } catch (err: any) {
      console.error(`❌ [RESTORE-PHOTOS] 복원 실패 (bizId: ${newBizId}):`, err?.message);
      errors.push(`bizId ${newBizId}: ${err?.message}`);
    }
  }

  // 미매칭 세그먼트 패턴 집계 (디버깅용)
  const unmatchedBySegment: Record<string, number> = {};
  for (const u of unmatched) {
    unmatchedBySegment[u.segment] = (unmatchedBySegment[u.segment] || 0) + 1;
  }
  console.log(`✅ [RESTORE-PHOTOS] 완료 - 복원: ${restoredCount}건, 미매칭: ${unmatched.length}건`);
  if (unmatched.length > 0) {
    console.log(`⚠️  [RESTORE-PHOTOS] 미매칭 세그먼트 패턴:`, unmatchedBySegment);
  }

  return createSuccessResponse({
    restored: restoredCount,
    unmatched: unmatched.length,
    unmatchedBySegment: unmatched.length > 0 ? unmatchedBySegment : undefined,
    errors: errors.length > 0 ? errors : undefined,
    message: `사진 ${restoredCount}건 복원 완료.` +
      (unmatched.length > 0 ? ` (매칭 실패 ${unmatched.length}건)` : ''),
  });
}, { logLevel: 'debug' });

/**
 * GET /api/admin/restore-photos
 * 현재 orphaned 파일 수 조회 (미리보기)
 */
export const GET = withApiHandler(async (request: NextRequest) => {
  const { authorized } = await checkAdminPermission(request);
  if (!authorized) {
    return createErrorResponse('관리자 권한이 필요합니다', 403);
  }

  const countResult = await queryAll(
    `SELECT COUNT(*) as cnt
     FROM uploaded_files uf
     LEFT JOIN business_info bi ON bi.id = uf.business_id AND bi.is_deleted = false
     WHERE bi.id IS NULL`
  );

  const orphanedCount = Number(countResult?.[0]?.cnt ?? 0);

  return createSuccessResponse({
    orphaned_count: orphanedCount,
    message: orphanedCount > 0
      ? `${orphanedCount}개의 사진이 사업장과 연결이 끊어진 상태입니다. POST로 복원하세요.`
      : '모든 사진이 정상적으로 연결되어 있습니다.',
  });
}, { logLevel: 'debug' });
