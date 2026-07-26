// app/api/facility-photos/[photoId]/route.ts - 개별 사진 관리 API

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { queryOne, query } from '@/lib/supabase-direct';
import { generatePathVariants } from '@/utils/business-id-generator';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function DELETE(
  request: NextRequest,
  { params }: { params: { photoId: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { photoId } = params;

    console.log('🗑️ [PHOTO-DELETE] 사진 삭제 시작:', { photoId });

    // 1. 데이터베이스에서 파일 정보 조회 (Direct PostgreSQL)
    const fileData = await queryOne(
      `SELECT * FROM uploaded_files WHERE id = $1`,
      [photoId]
    );

    if (!fileData) {
      console.error('❌ [PHOTO-DELETE] 파일 정보 조회 실패: 파일을 찾을 수 없음');
      return NextResponse.json(
        { error: '파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('📄 [PHOTO-DELETE] 파일 정보 조회 완료:', {
      filename: fileData.filename,
      path: fileData.file_path,
      businessId: fileData.business_id
    });

    // 2. Supabase Storage에서 파일 삭제 - facility-files 버킷 사용
    const { error: storageError } = await supabaseAdmin.storage
      .from('facility-files')
      .remove([fileData.file_path]);

    if (storageError) {
      console.error('❌ [PHOTO-DELETE] Storage 삭제 실패:', storageError);
      // Storage 삭제 실패해도 DB 삭제는 진행 (일관성 위해)
    } else {
      console.log('✅ [PHOTO-DELETE] Storage 삭제 완료');
    }

    // 3. 데이터베이스에서 레코드 삭제 (Direct PostgreSQL)
    const deleteResult = await query(
      `DELETE FROM uploaded_files WHERE id = $1`,
      [photoId]
    );

    if (!deleteResult || deleteResult.rowCount === 0) {
      console.error('❌ [PHOTO-DELETE] DB 삭제 실패: 레코드가 없음');
      return NextResponse.json(
        { error: '데이터베이스 삭제 실패' },
        { status: 500 }
      );
    }

    console.log('✅ [PHOTO-DELETE] DB 삭제 완료');

    // 4. 썸네일 파일도 삭제 (있는 경우) - facility-files 버킷 사용
    if (fileData.thumbnail_path) {
      const { error: thumbnailError } = await supabaseAdmin.storage
        .from('facility-files')
        .remove([fileData.thumbnail_path]);
      
      if (thumbnailError) {
        console.warn('⚠️ [PHOTO-DELETE] 썸네일 삭제 실패 (무시):', thumbnailError);
      } else {
        console.log('✅ [PHOTO-DELETE] 썸네일 삭제 완료');
      }
    }

    console.log('🎉 [PHOTO-DELETE] 사진 삭제 완료:', photoId);

    return NextResponse.json({
      success: true,
      message: '사진이 성공적으로 삭제되었습니다.',
      deletedFile: {
        id: photoId,
        filename: fileData.filename
      }
    });

  } catch (error) {
    console.error('❌ [PHOTO-DELETE] 예상치 못한 오류:', error);
    return NextResponse.json(
      { error: '사진 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 개별 사진 다운로드 또는 정보 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { photoId: string } }
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const { photoId } = params;
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';

    console.log('🔍 [PHOTO-GET] 요청:', { photoId, download });

    // 1. 데이터베이스에서 파일 정보 조회 (Direct PostgreSQL)
    const fileData = await queryOne(
      `SELECT * FROM uploaded_files WHERE id = $1`,
      [photoId]
    );

    if (!fileData) {
      console.error('❌ [PHOTO-GET] 파일 조회 실패: 파일을 찾을 수 없음');
      return NextResponse.json(
        { error: '파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2. 다운로드 요청인 경우 파일 스트림 반환
    if (download) {
      console.log('📥 [PHOTO-DOWNLOAD] 파일 다운로드 시작:', fileData.filename);
      
      try {
        let fileBlob: Blob | null = null;
        let downloadError: any = null;

        // 원본 경로로 먼저 시도
        console.log('🔍 [DOWNLOAD-ATTEMPT] 원본 경로 시도:', fileData.file_path);
        const originalAttempt = await supabaseAdmin.storage
          .from('facility-files')
          .download(fileData.file_path);

        if (originalAttempt.data && !originalAttempt.error) {
          fileBlob = originalAttempt.data;
          console.log('✅ [DOWNLOAD-SUCCESS] 원본 경로 다운로드 성공');
        } else {
          console.log('⚠️ [DOWNLOAD-FALLBACK] 원본 경로 실패, Fallback 시도');
          downloadError = originalAttempt.error;

          // 사업장명을 추출하여 다양한 경로 패턴 시도
          const pathParts = fileData.file_path.split('/');
          const fileName = pathParts[pathParts.length - 1];
          const facilityType = pathParts.find((part: string) => 
            part === 'discharge' || part === 'prevention' || part === 'basic'
          ) || 'unknown';

          // 데이터베이스에서 사업장 정보 가져오기 (Direct PostgreSQL)
          const businessData = await queryOne(
            `SELECT business_name as name FROM business_info WHERE id = $1`,
            [fileData.business_id]
          );

          if (businessData) {
            const businessName = businessData.name;
            const pathVariants = generatePathVariants(businessName, facilityType, fileName);

            console.log('🔍 [FALLBACK-PATHS] 다양한 경로 시도:', {
              사업장명: businessName,
              경로수: pathVariants.length
            });

            // 각 경로 변형을 순차적으로 시도
            for (const variantPath of pathVariants) {
              console.log('🔍 [TRYING-PATH]:', variantPath);
              
              const variantAttempt = await supabaseAdmin.storage
                .from('facility-files')
                .download(variantPath);

              if (variantAttempt.data && !variantAttempt.error) {
                fileBlob = variantAttempt.data;
                console.log('✅ [DOWNLOAD-SUCCESS] Fallback 경로 성공:', variantPath);
                break;
              } else {
                console.log('❌ [TRYING-PATH-FAILED]:', variantPath, variantAttempt.error?.message);
              }
            }
          }
        }

        if (!fileBlob) {
          console.error('❌ [PHOTO-DOWNLOAD] 모든 경로 시도 실패:', downloadError);
          return NextResponse.json(
            { error: '파일을 찾을 수 없습니다. 파일이 이동되었거나 삭제되었을 수 있습니다.' },
            { status: 404 }
          );
        }

        // 파일 응답 반환
        const buffer = await fileBlob.arrayBuffer();
        
        console.log('✅ [PHOTO-DOWNLOAD] 다운로드 완료:', {
          filename: fileData.original_filename,
          size: buffer.byteLength
        });

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': fileData.mime_type,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileData.original_filename)}"`,
            'Content-Length': buffer.byteLength.toString(),
          },
        });

      } catch (downloadError) {
        console.error('❌ [PHOTO-DOWNLOAD] 다운로드 중 오류:', downloadError);
        return NextResponse.json(
          { error: '파일 다운로드 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    }

    // 3. 일반 정보 조회
    console.log('✅ [PHOTO-GET] 파일 조회 완료');

    return NextResponse.json({
      success: true,
      file: fileData
    });

  } catch (error) {
    console.error('❌ [PHOTO-GET] 예상치 못한 오류:', error);
    return NextResponse.json(
      { error: '파일 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}