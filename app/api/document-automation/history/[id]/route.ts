// app/api/document-automation/history/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTokenString } from '@/utils/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DELETE: 문서 삭제 (권한 4 이상 필요)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // JWT 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: '인증이 필요합니다.'
      }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);

    if (!decoded) {
      return NextResponse.json({
        success: false,
        error: '유효하지 않은 토큰입니다.'
      }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;

    // 권한 확인: 권한 4 이상 필요
    if (!permissionLevel || permissionLevel < 4) {
      return NextResponse.json({
        success: false,
        error: '문서 삭제 권한이 없습니다. (권한 4 이상 필요)'
      }, { status: 403 });
    }

    const { id } = params;

    // 먼저 문서 정보 조회 (document_type과 document_data 확인용)
    const { data: document, error: fetchError } = await supabase
      .from('document_history')
      .select('document_type, document_data')
      .eq('id', id)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { success: false, error: '문서를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 계약서인 경우, contract_history에서도 삭제 (동기화)
    // document_data에서 contract_id 추출
    if (document.document_type === 'contract' && document.document_data) {
      try {
        const documentData = typeof document.document_data === 'string'
          ? JSON.parse(document.document_data)
          : document.document_data;

        const contractId = documentData.contract_id;

        if (contractId) {
          // contract_id를 사용하여 정확한 계약서 삭제
          await supabase
            .from('contract_history')
            .delete()
            .eq('id', contractId);

          console.log(`[DOCUMENT-HISTORY] 계약서 동기화 삭제 완료: contract_id=${contractId}`);
        } else {
          console.warn(`[DOCUMENT-HISTORY] contract_id가 없어 동기화 삭제 불가`);
        }
      } catch (parseError) {
        console.error(`[DOCUMENT-HISTORY] document_data 파싱 실패:`, parseError);
      }
    }

    // 문서 이력에서 삭제
    const { error: deleteError } = await supabase
      .from('document_history')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '문서가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('문서 삭제 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
