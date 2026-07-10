// app/api/business-memos/route.ts - Business Memos CRUD API
import { NextRequest } from 'next/server'
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils'
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct'
import { upsertMemoEmbedding } from '@/lib/memo-embedding'
import type { BusinessMemo, CreateBusinessMemoInput, UpdateBusinessMemoInput } from '@/types/database'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// GET - 특정 사업장의 모든 메모 조회
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')
    const businessName = searchParams.get('businessName')

    if (!businessId && !businessName) {
      return createErrorResponse('사업장 ID 또는 사업장명이 필요합니다.', 400);
    }

    console.log(`🔍 [BUSINESS-MEMOS] 사업장 메모 조회 시작 - businessId: ${businessId}, businessName: ${businessName}`)

    let finalBusinessId = businessId;

    // businessName이 제공된 경우 businessId로 변환 - Direct PostgreSQL
    if (!businessId && businessName) {
      console.log(`🔍 [BUSINESS-MEMOS] businessName으로 business_id 조회: ${businessName}`)

      const businessInfo = await queryOne(
        `SELECT id, business_name FROM business_info
         WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
        [businessName]
      );

      console.log(`🔍 [BUSINESS-MEMOS] business_info 조회 결과:`, businessInfo)

      if (!businessInfo) {
        console.log(`⚠️ [BUSINESS-MEMOS] 사업장을 찾을 수 없음: ${businessName}`);
        // 빈 결과 반환 (에러가 아닌)
        return createSuccessResponse({
          data: [],
          metadata: {
            businessId: null,
            businessName,
            count: 0
          }
        });
      }

      finalBusinessId = businessInfo.id;
      console.log(`✅ [BUSINESS-MEMOS] businessName → businessId 변환: ${businessName} → ${finalBusinessId}`)
    }

    // 메모 조회 - Direct PostgreSQL (related_task 정보 포함)
    const memos = await queryAll(
      `SELECT
        bm.*,
        CASE
          WHEN bm.source_id IS NOT NULL AND bm.source_type = 'task_sync' THEN
            json_build_object(
              'id', ft.id,
              'title', ft.description,
              'status', ft.status,
              'task_type', ft.task_type,
              'priority', ft.priority
            )
          ELSE NULL
        END as related_task
       FROM business_memos bm
       LEFT JOIN facility_tasks ft ON bm.source_id = ft.id AND bm.source_type = 'task_sync'
       WHERE bm.business_id = $1 AND bm.is_active = true AND bm.is_deleted = false
       ORDER BY bm.created_at DESC`,
      [finalBusinessId]
    );

    console.log(`✅ [BUSINESS-MEMOS] 메모 조회 완료 - ${memos?.length || 0}개`)
    console.log(`🔍 [BUSINESS-MEMOS] 조회된 메모 데이터:`, memos?.map(m => ({
      id: m.id,
      title: m.title,
      content: m.content,
      titleLength: m.title?.length,
      contentLength: m.content?.length
    })))

    return createSuccessResponse({
      data: memos || [],
      metadata: {
        businessId,
        businessName,
        count: memos?.length || 0
      }
    });

  } catch (error: any) {
    console.error('❌ [BUSINESS-MEMOS] GET 요청 처리 오류:', error)
    console.error('❌ [BUSINESS-MEMOS] 에러 상세:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return createErrorResponse(
      `메모 조회 실패: ${error.message || '알 수 없는 오류'}`,
      500
    );
  }
}, { logLevel: 'debug' });

// POST - 새 메모 추가
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const body = await request.json()

    console.log(`🔍 [BUSINESS-MEMOS] POST 요청 데이터:`, {
      business_id: body.business_id,
      business_name: body.business_name,
      title: body.title,
      content: body.content,
      titleLength: body.title?.length,
      contentLength: body.content?.length
    })

    if ((!body.business_id && !body.business_name) || !body.title?.trim() || !body.content?.trim()) {
      return createErrorResponse('사업장 ID 또는 사업장명, 제목, 내용은 필수 입력사항입니다.', 400);
    }

    console.log(`📝 [BUSINESS-MEMOS] 새 메모 추가 - businessId: ${body.business_id}, businessName: ${body.business_name}`)

    let finalBusinessId = body.business_id;

    // business_name이 제공된 경우 business_id로 변환 - Direct PostgreSQL
    if (!body.business_id && body.business_name) {
      console.log(`🔍 [BUSINESS-MEMOS] POST - businessName으로 business_id 조회: ${body.business_name}`)

      const businessInfo = await queryOne(
        `SELECT id, business_name FROM business_info
         WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
        [body.business_name]
      );

      console.log(`🔍 [BUSINESS-MEMOS] POST - business_info 조회 결과:`, businessInfo)

      if (!businessInfo) {
        console.error(`❌ [BUSINESS-MEMOS] POST - 사업장을 찾을 수 없음: ${body.business_name}`);
        return createErrorResponse(`사업장을 찾을 수 없습니다: ${body.business_name}`, 404);
      }

      finalBusinessId = businessInfo.id;
      console.log(`✅ [BUSINESS-MEMOS] POST - businessName → businessId 변환: ${body.business_name} → ${finalBusinessId}`)
    }

    // 메모 추가 - Direct PostgreSQL
    const insertQuery = `
      INSERT INTO business_memos (
        business_id, title, content, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const insertResult = await pgQuery(insertQuery, [
      finalBusinessId,
      body.title.trim(),
      body.content.trim(),
      body.created_by || '관리자',
      body.created_by || '관리자'
    ]);

    if (!insertResult.rows || insertResult.rows.length === 0) {
      console.error('❌ [BUSINESS-MEMOS] 메모 추가 실패');
      throw new Error('메모 추가 실패');
    }

    const newMemo = insertResult.rows[0];
    console.log(`✅ [BUSINESS-MEMOS] 새 메모 추가 완료 - ID: ${newMemo.id}`)

    // ✅ 메모 생성 시 사업장 updated_at 업데이트 (리스트 상단 표시) - Direct PostgreSQL
    if (finalBusinessId) {
      try {
        await pgQuery(
          `UPDATE business_info SET updated_at = $1 WHERE id = $2`,
          [new Date().toISOString(), finalBusinessId]
        );
        console.log(`✅ [BUSINESS-MEMOS] 사업장 updated_at 업데이트 완료 - businessId: ${finalBusinessId}`);
      } catch (updateError) {
        console.warn('⚠️ [BUSINESS-MEMOS] 사업장 updated_at 업데이트 실패:', updateError);
        // 메모 생성은 성공했으므로 에러 throw 하지 않음
      }
    }

    // ✅ AI Q&A 검색용 임베딩 생성 (실패해도 메모 생성은 성공 처리)
    try {
      await upsertMemoEmbedding(newMemo.id, newMemo.title, newMemo.content);
    } catch (embedError) {
      console.warn('⚠️ [BUSINESS-MEMOS] 메모 임베딩 생성 실패:', embedError);
    }

    return createSuccessResponse({
      data: newMemo,
      message: '메모가 성공적으로 추가되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ [BUSINESS-MEMOS] POST 요청 처리 오류:', error)
    return createErrorResponse('서버 오류가 발생했습니다.', 500);
  }
}, { logLevel: 'debug' });

// PUT - 기존 메모 수정
export const PUT = withApiHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const memoId = searchParams.get('id')

    if (!memoId) {
      return createErrorResponse('메모 ID가 필요합니다.', 400);
    }

    const body: UpdateBusinessMemoInput = await request.json()

    if (!body.title?.trim() && !body.content?.trim()) {
      return createErrorResponse('제목 또는 내용 중 하나는 필수입니다.', 400);
    }

    console.log(`📝 [BUSINESS-MEMOS] 메모 수정 - ID: ${memoId}`)

    const updateData: any = {
      updated_by: body.updated_by || '관리자'
    }

    if (body.title?.trim()) {
      updateData.title = body.title.trim()
    }

    if (body.content?.trim()) {
      updateData.content = body.content.trim()
    }

    // 메모 수정 - Direct PostgreSQL
    const updateFields = Object.keys(updateData);
    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = updateFields.map(field => updateData[field]);
    values.push(memoId); // Add memoId as the last parameter

    const updateQuery = `
      UPDATE business_memos
      SET ${setClause}
      WHERE id = $${values.length} AND is_active = true AND is_deleted = false
      RETURNING *
    `;

    const updateResult = await pgQuery(updateQuery, values);

    if (!updateResult.rows || updateResult.rows.length === 0) {
      console.error('❌ [BUSINESS-MEMOS] 메모 수정 실패');
      throw new Error('메모 수정 실패');
    }

    const updatedMemo = updateResult.rows[0];
    console.log(`✅ [BUSINESS-MEMOS] 메모 수정 완료 - ID: ${memoId}`)

    // ✅ 메모 수정 시 사업장 updated_at 업데이트 (리스트 상단 표시) - Direct PostgreSQL
    if (updatedMemo?.business_id) {
      try {
        await pgQuery(
          `UPDATE business_info SET updated_at = $1 WHERE id = $2`,
          [new Date().toISOString(), updatedMemo.business_id]
        );
        console.log(`✅ [BUSINESS-MEMOS] 사업장 updated_at 업데이트 완료 - businessId: ${updatedMemo.business_id}`);
      } catch (updateError) {
        console.warn('⚠️ [BUSINESS-MEMOS] 사업장 updated_at 업데이트 실패:', updateError);
        // 메모 수정은 성공했으므로 에러 throw 하지 않음
      }
    }

    // ✅ AI Q&A 검색용 임베딩 갱신 (실패해도 메모 수정은 성공 처리)
    try {
      await upsertMemoEmbedding(updatedMemo.id, updatedMemo.title, updatedMemo.content);
    } catch (embedError) {
      console.warn('⚠️ [BUSINESS-MEMOS] 메모 임베딩 갱신 실패:', embedError);
    }

    return createSuccessResponse({
      data: updatedMemo,
      message: '메모가 성공적으로 수정되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ [BUSINESS-MEMOS] PUT 요청 처리 오류:', error)
    return createErrorResponse('서버 오류가 발생했습니다.', 500);
  }
}, { logLevel: 'debug' });

// DELETE - 메모 소프트 삭제
export const DELETE = withApiHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const memoId = searchParams.get('id')

    if (!memoId) {
      return createErrorResponse('메모 ID가 필요합니다.', 400);
    }

    console.log(`🗑️ [BUSINESS-MEMOS] 메모 삭제 - ID: ${memoId}`)

    // 메모 정보 조회 (자동 메모인지 확인) - Direct PostgreSQL
    const memoInfo = await queryOne(
      `SELECT id, title, business_id FROM business_memos
       WHERE id = $1 AND is_deleted = false`,
      [memoId]
    );

    if (!memoInfo) {
      console.error(`❌ [BUSINESS-MEMOS] 메모 조회 실패: ${memoId}`);
      return createErrorResponse('메모를 찾을 수 없습니다.', 404);
    }

    // 자동 메모인 경우 슈퍼 관리자 권한 확인 필요
    const isAutoMemo = memoInfo.title?.startsWith('[자동]');
    if (isAutoMemo) {
      // 여기서 실제 사용자 권한을 확인해야 하지만, 현재는 임시로 통과
      // TODO: JWT 토큰에서 사용자 권한 추출하여 권한 4(슈퍼 관리자) 확인
      console.log(`⚠️ [BUSINESS-MEMOS] 자동 메모 삭제 시도 - 권한 확인 필요: ${memoId}`);
    }

    // 메모 삭제 (소프트 삭제) - Direct PostgreSQL
    const deleteResult = await pgQuery(
      `UPDATE business_memos
       SET is_deleted = true, updated_by = $1
       WHERE id = $2 AND is_deleted = false
       RETURNING *`,
      ['관리자', memoId]
    );

    if (!deleteResult.rows || deleteResult.rows.length === 0) {
      console.error('❌ [BUSINESS-MEMOS] 메모 삭제 실패');
      throw new Error('메모 삭제 실패');
    }

    const deletedMemo = deleteResult.rows[0];
    console.log(`✅ [BUSINESS-MEMOS] 메모 삭제 완료 - ID: ${memoId}`)

    // ✅ 메모 삭제 시 사업장 updated_at 업데이트 (리스트 상단 표시) - Direct PostgreSQL
    if (memoInfo?.business_id) {
      try {
        await pgQuery(
          `UPDATE business_info SET updated_at = $1 WHERE id = $2`,
          [new Date().toISOString(), memoInfo.business_id]
        );
        console.log(`✅ [BUSINESS-MEMOS] 사업장 updated_at 업데이트 완료 - businessId: ${memoInfo.business_id}`);
      } catch (updateError) {
        console.warn('⚠️ [BUSINESS-MEMOS] 사업장 updated_at 업데이트 실패:', updateError);
        // 메모 삭제는 성공했으므로 에러 throw 하지 않음
      }
    }

    // 자동 메모 삭제 로그 기록 (슈퍼 관리자 전용 기능에 대한 감사 로그) - Direct PostgreSQL
    if (isAutoMemo) {
      try {
        // 사업장 정보 조회
        const businessInfo = await queryOne(
          `SELECT business_name FROM business_info WHERE id = $1`,
          [memoInfo.business_id]
        );

        // 삭제 로그 기록
        await pgQuery(
          `INSERT INTO auto_memo_deletion_logs (
            memo_id, memo_title, business_name, deleted_by, ip_address
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            memoId,
            memoInfo.title,
            businessInfo?.business_name || '알 수 없음',
            '시스템', // TODO: 실제 사용자 ID로 변경
            request.headers.get('x-forwarded-for') ||
              request.headers.get('x-real-ip') ||
              '127.0.0.1'
          ]
        );

        console.log(`📝 [BUSINESS-MEMOS] 자동 메모 삭제 로그 기록 완료 - ${memoInfo.title}`);
      } catch (logError) {
        console.error(`❌ [BUSINESS-MEMOS] 삭제 로그 기록 실패:`, logError);
        // 로그 기록 실패는 메모 삭제 성공에 영향을 주지 않음
      }
    }

    return createSuccessResponse({
      data: deletedMemo,
      message: '메모가 성공적으로 삭제되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ [BUSINESS-MEMOS] DELETE 요청 처리 오류:', error)
    return createErrorResponse('서버 오류가 발생했습니다.', 500);
  }
}, { logLevel: 'debug' });