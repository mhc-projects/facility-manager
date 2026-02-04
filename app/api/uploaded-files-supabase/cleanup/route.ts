import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Orphaned records 정리 API
export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({
        success: false,
        message: 'filePath가 필요합니다.'
      }, { status: 400 });
    }

    console.log(`🧹 [CLEANUP] Orphaned record 정리 요청: ${filePath}`);

    // 1. Storage에 파일이 실제로 없는지 확인
    const { data: storageFile, error: storageError } = await supabaseAdmin.storage
      .from('facility-files')
      .list(filePath.substring(0, filePath.lastIndexOf('/')), {
        limit: 1000,
        search: filePath.substring(filePath.lastIndexOf('/') + 1)
      });

    // Storage에 파일이 없으면 DB 레코드 삭제
    if (storageError || !storageFile || storageFile.length === 0) {
      console.log(`🧹 [CLEANUP] Storage에 파일 없음, DB 레코드 삭제: ${filePath}`);

      const { error: dbError } = await supabaseAdmin
        .from('uploaded_files')
        .delete()
        .eq('file_path', filePath);

      if (dbError) {
        console.error(`🧹 [CLEANUP] DB 삭제 실패:`, dbError);
        return NextResponse.json({
          success: false,
          message: 'DB 레코드 삭제 실패'
        }, { status: 500 });
      }

      console.log(`✅ [CLEANUP] Orphaned record 정리 완료: ${filePath}`);

      return NextResponse.json({
        success: true,
        message: 'Orphaned record가 삭제되었습니다.',
        filePath
      });
    } else {
      // Storage에 파일이 있으면 문제 없음
      console.log(`✅ [CLEANUP] Storage에 파일 존재, 정리 불필요: ${filePath}`);

      return NextResponse.json({
        success: true,
        message: 'Storage에 파일이 존재합니다.',
        filePath
      });
    }

  } catch (error) {
    console.error('❌ [CLEANUP] 정리 실패:', error);
    return NextResponse.json({
      success: false,
      message: '정리 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}
