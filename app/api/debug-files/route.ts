// app/api/debug-files/route.ts - 파일 데이터 디버깅용 API
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');

    if (!businessName) {
      return NextResponse.json({
        success: false,
        message: '사업장명이 필요합니다.'
      }, { status: 400 });
    }

    // 사업장 조회
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('name', businessName)
      .single();

    if (businessError) {
      return NextResponse.json({
        success: false,
        message: '사업장을 찾을 수 없습니다.'
      });
    }

    // 모든 파일 정보 조회 (디버깅용)
    const { data: files, error: filesError } = await supabaseAdmin
      .from('uploaded_files')
      .select(`
        id,
        filename,
        original_filename,
        file_path,
        facility_info,
        created_at,
        upload_status
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });

    if (filesError) {
      throw filesError;
    }

    // 파일명에 "배전함" 또는 "배출시설"이 포함된 파일들만 필터링
    const relevantFiles = files?.filter((file: any) => 
      file.original_filename?.includes('배전함') || 
      file.original_filename?.includes('배출') ||
      file.facility_info?.includes('배출시설')
    ) || [];

    return NextResponse.json({
      success: true,
      data: {
        businessName,
        businessId: business.id,
        totalFiles: files?.length || 0,
        relevantFiles: relevantFiles.map((file: any) => ({
          id: file.id,
          originalName: file.original_filename,
          fileName: file.filename,
          filePath: file.file_path,
          facilityInfo: file.facility_info,
          createdAt: file.created_at,
          uploadStatus: file.upload_status
        }))
      }
    });

  } catch (error) {
    console.error('❌ [DEBUG-FILES] 조회 실패:', error);
    return NextResponse.json({
      success: false,
      message: '파일 조회 중 오류가 발생했습니다: ' + (error instanceof Error ? error.message : '알 수 없는 오류')
    }, { status: 500 });
  }
}