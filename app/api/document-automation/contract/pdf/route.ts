// 계약서 PDF를 Supabase Storage(facility-files)에 저장하고 contract_history/document_history에 경로를 기록하는 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getSupabaseStorageAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth/require-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 실행이력 탭 다운로드 버튼이 facility-files 공개 URL로 여는 기존 규약(발주서와 동일)을 따른다
const BUCKET = 'facility-files';
const MAX_SIZE = 4 * 1024 * 1024; // Vercel 함수 요청 본문 한도(4.5MB) 이내

/**
 * POST /api/document-automation/contract/pdf
 * multipart: file(PDF), contract_id(contract_history.id), document_history_id
 * 권한: 1 이상
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const contractId = formData.get('contract_id') as string | null;
    const documentHistoryId = formData.get('document_history_id') as string | null;

    if (!file || !contractId || !documentHistoryId) {
      return NextResponse.json(
        { success: false, message: 'file, contract_id, document_history_id가 필요합니다.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, message: 'PDF 크기가 4MB를 초과합니다.' }, { status: 400 });
    }

    // 저장 경로는 클라이언트 입력이 아니라 DB의 계약서 정보로 만든다
    const { data: contract } = await supabaseAdmin
      .from('contract_history')
      .select('id, business_id, contract_number, contract_type')
      .eq('id', contractId)
      .maybeSingle();
    if (!contract) {
      return NextResponse.json({ success: false, message: '계약서를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: historyRow } = await supabaseAdmin
      .from('document_history')
      .select('id')
      .eq('id', documentHistoryId)
      .eq('document_type', 'contract')
      .eq('business_id', contract.business_id)
      .maybeSingle();
    if (!historyRow) {
      return NextResponse.json({ success: false, message: '계약서 실행 이력을 찾을 수 없습니다.' }, { status: 404 });
    }

    const filePath = `documents/contracts/${contract.business_id}/${contract.contract_type}_${contract.contract_number}_${Date.now()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // supabaseAdmin의 전역 Content-Type 헤더가 mimetype을 오염시키므로 Storage 전용 클라이언트 사용
    const storage = getSupabaseStorageAdmin().storage;
    const { error: uploadError } = await storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: 'application/pdf', upsert: false });
    if (uploadError) {
      console.error('[CONTRACT-PDF] 업로드 실패:', uploadError);
      return NextResponse.json({ success: false, message: 'PDF 업로드에 실패했습니다.' }, { status: 500 });
    }

    const { data: urlData } = storage.from(BUCKET).getPublicUrl(filePath);
    const now = new Date().toISOString();

    const [contractUpdate, historyUpdate] = await Promise.all([
      supabaseAdmin
        .from('contract_history')
        .update({ pdf_file_url: urlData.publicUrl, updated_at: now })
        .eq('id', contract.id),
      supabaseAdmin
        .from('document_history')
        .update({ file_path: filePath, file_size: buffer.length })
        .eq('id', historyRow.id),
    ]);

    if (contractUpdate.error || historyUpdate.error) {
      console.error('[CONTRACT-PDF] 경로 기록 실패:', contractUpdate.error || historyUpdate.error);
      await storage.from(BUCKET).remove([filePath]);
      return NextResponse.json({ success: false, message: 'PDF 경로 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, path: filePath, url: urlData.publicUrl });
  } catch (error) {
    console.error('[CONTRACT-PDF] API 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
