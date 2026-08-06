// app/api/business-progress/route.ts - 사업장별 업무 진행 현황 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// 진행 현황 메모 타입 정의
export interface BusinessProgressNote {
  id: string;
  business_name: string;
  task_id?: string;
  content: string;
  note_type: 'auto' | 'manual';
  created_by: string;
  author_name?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

// GET: 특정 사업장의 진행 현황 조회
export const GET = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');
    const limit = parseInt(searchParams.get('limit') || '20');
    const noteType = searchParams.get('type'); // 'auto', 'manual', 또는 null (전체)

    console.log('📋 [BUSINESS-PROGRESS] 진행 현황 조회:', { businessName, limit, noteType });

    if (!businessName) {
      return createErrorResponse('사업장명은 필수입니다', 400);
    }

    let query = supabaseAdmin
      .from('business_progress_notes')
      .select(`
        id,
        business_name,
        task_id,
        content,
        note_type,
        created_by,
        author_name,
        metadata,
        created_at,
        updated_at
      `)
      .eq('business_name', businessName)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    // 타입 필터 적용
    if (noteType && ['auto', 'manual'].includes(noteType)) {
      query = query.eq('note_type', noteType);
    }

    const { data: notes, error } = await query;

    if (error) {
      console.error('🔴 [BUSINESS-PROGRESS] 조회 오류:', error);
      throw error;
    }

    // 관련 업무 정보도 함께 조회 (자동 메모의 경우)
    const taskIds = notes
      ?.filter(note => note.task_id)
      .map(note => note.task_id)
      .filter(Boolean) || [];

    let relatedTasks: any[] = [];
    if (taskIds.length > 0) {
      const { data: tasks } = await supabaseAdmin
        .from('facility_tasks')
        .select('id, title, status, priority')
        .in('id', taskIds);

      relatedTasks = tasks || [];
    }

    // 메모에 관련 업무 정보 추가
    const enrichedNotes = notes?.map(note => ({
      ...note,
      related_task: note.task_id
        ? relatedTasks.find(task => task.id === note.task_id)
        : null
    }));

    console.log('✅ [BUSINESS-PROGRESS] 조회 성공:', enrichedNotes?.length || 0, '개 메모');

    return createSuccessResponse({
      notes: enrichedNotes || [],
      count: enrichedNotes?.length || 0,
      business_name: businessName
    });

  } catch (error: any) {
    console.error('🔴 [BUSINESS-PROGRESS] GET 오류:', error?.message || error);
    return createErrorResponse('진행 현황 조회 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// POST: 새 진행 현황 메모 추가
export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      business_name,
      task_id,
      content,
      note_type = 'manual',
      created_by,
      author_name,
      metadata
    } = body;

    console.log('📝 [BUSINESS-PROGRESS] 새 메모 생성:', { business_name, note_type, created_by });

    // 필수 필드 검증
    if (!business_name || !content || !created_by) {
      return createErrorResponse('사업장명, 내용, 생성자는 필수입니다', 400);
    }

    // note_type 검증
    if (!['auto', 'manual'].includes(note_type)) {
      return createErrorResponse('유효하지 않은 메모 타입입니다', 400);
    }

    const { data: newNote, error } = await supabaseAdmin
      .from('business_progress_notes')
      .insert({
        business_name,
        task_id: task_id || null,
        content,
        note_type,
        created_by,
        author_name: author_name || null,
        metadata: metadata || null
      })
      .select()
      .single();

    if (error) {
      console.error('🔴 [BUSINESS-PROGRESS] 생성 오류:', error);
      throw error;
    }

    console.log('✅ [BUSINESS-PROGRESS] 생성 성공:', newNote.id);

    return createSuccessResponse({
      note: newNote,
      message: '진행 현황 메모가 성공적으로 추가되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [BUSINESS-PROGRESS] POST 오류:', error?.message || error);
    return createErrorResponse('진행 현황 메모 추가 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// PUT: 진행 현황 메모 수정 (수동 메모만)
export const PUT = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { id, content, author_name } = body;

    console.log('📝 [BUSINESS-PROGRESS] 메모 수정:', { id });

    if (!id || !content) {
      return createErrorResponse('메모 ID와 내용은 필수입니다', 400);
    }

    // 수동 메모만 수정 가능
    const { data: existingNote, error: fetchError } = await supabaseAdmin
      .from('business_progress_notes')
      .select('note_type, created_by')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !existingNote) {
      return createErrorResponse('메모를 찾을 수 없습니다', 404);
    }

    if (existingNote.note_type === 'auto') {
      return createErrorResponse('자동 생성된 메모는 수정할 수 없습니다', 403);
    }

    const { data: updatedNote, error } = await supabaseAdmin
      .from('business_progress_notes')
      .update({
        content,
        author_name: author_name || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('is_deleted', false)
      .select()
      .single();

    if (error) {
      console.error('🔴 [BUSINESS-PROGRESS] 수정 오류:', error);
      throw error;
    }

    console.log('✅ [BUSINESS-PROGRESS] 수정 성공:', updatedNote.id);

    return createSuccessResponse({
      note: updatedNote,
      message: '진행 현황 메모가 성공적으로 수정되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [BUSINESS-PROGRESS] PUT 오류:', error?.message || error);
    return createErrorResponse('진행 현황 메모 수정 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// DELETE: 진행 현황 메모 삭제 (소프트 삭제)
export const DELETE = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request, 1);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    console.log('🗑️ [BUSINESS-PROGRESS] 메모 삭제:', id);

    if (!id) {
      return createErrorResponse('메모 ID는 필수입니다', 400);
    }

    // 수동 메모만 삭제 가능
    const { data: existingNote, error: fetchError } = await supabaseAdmin
      .from('business_progress_notes')
      .select('note_type, created_by')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !existingNote) {
      return createErrorResponse('메모를 찾을 수 없습니다', 404);
    }

    if (existingNote.note_type === 'auto') {
      return createErrorResponse('자동 생성된 메모는 삭제할 수 없습니다', 403);
    }

    const { data: deletedNote, error } = await supabaseAdmin
      .from('business_progress_notes')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('is_deleted', false)
      .select()
      .single();

    if (error) {
      console.error('🔴 [BUSINESS-PROGRESS] 삭제 오류:', error);
      throw error;
    }

    console.log('✅ [BUSINESS-PROGRESS] 삭제 성공:', deletedNote.id);

    return createSuccessResponse({
      message: '진행 현황 메모가 성공적으로 삭제되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [BUSINESS-PROGRESS] DELETE 오류:', error?.message || error);
    return createErrorResponse('진행 현황 메모 삭제 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });