import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  extractFacilityInfoFromFileName,
  extractFacilityInfoFromFolder,
  generateCaption,
  isGatewayOrBasicPhoto,
  generateGatewayCaption,
  FacilityInfo
} from '@/lib/facilityInfoExtractor';
import { generatePDF } from '@/lib/pdfGenerator';
import { generateExcel } from '@/lib/excelGenerator';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PhotoData {
  id: string;
  file_path: string;
  original_filename: string;
  download_url: string;
  user_caption?: string;
  facility_caption: string; // 시설 정보 캡션
  facility_info?: string; // DB의 facility_info 컬럼
  created_at: string;
}

interface ExportRequestBody {
  businessName: string;
  format: 'pdf' | 'excel';
  includeUserCaption: boolean;
  sections: ('prevention' | 'discharge')[];
}

/**
 * 사진 데이터 수집
 */
async function collectPhotos(businessName: string, section: 'prevention' | 'discharge'): Promise<PhotoData[]> {
  try {
    // 1. business_name으로 business_id 조회 (business_info 테이블 사용)
    const { data: business, error: businessError } = await supabaseAdmin
      .from('business_info')
      .select('id')
      .eq('business_name', businessName)
      .eq('is_deleted', false)
      .single();

    if (businessError || !business) {
      console.error(`[EXPORT] 사업장 조회 실패:`, businessError);
      throw new Error(`사업장을 찾을 수 없습니다: ${businessName}`);
    }

    // 2. Supabase 쿼리 (business_id 사용)
    let query = supabaseAdmin
      .from('uploaded_files')
      .select('*')
      .eq('business_id', business.id);

    if (section === 'prevention') {
      // 방지시설: basic + prevention
      query = query.or('file_path.like.%/basic/%,file_path.like.%/prevention/%');
    } else {
      // 배출시설: discharge
      query = query.like('file_path', '%/discharge/%');
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error(`[EXPORT] ${section} 사진 조회 실패:`, error);
      throw new Error(`${section} 사진 조회 실패`);
    }

    if (!data || data.length === 0) {
      console.log(`[EXPORT] ${section} 섹션에 사진이 없습니다.`);
      return [];
    }

    // 시설 정보 캡션 생성
    const photosWithCaptions: PhotoData[] = data.map(photo => {
      let facilityCaption = '';

      // DB에 저장된 facility_info 컬럼 직접 사용
      if (photo.facility_info) {
        facilityCaption = photo.facility_info;
      } else if (isGatewayOrBasicPhoto(photo.file_path)) {
        facilityCaption = generateGatewayCaption();
      } else {
        // 폴백: 파일명에서 시설 정보 추출
        const facilityInfo = extractFacilityInfoFromFileName(photo.original_filename, photo.file_path);
        facilityCaption = generateCaption(facilityInfo);
      }

      // download_url이 없으면 file_path로부터 생성
      let downloadUrl = photo.download_url;
      if (!downloadUrl || downloadUrl === '') {
        const { data: publicUrl } = supabaseAdmin.storage
          .from('facility-files')
          .getPublicUrl(photo.file_path);
        downloadUrl = publicUrl.publicUrl;
        console.log(`[EXPORT] URL 생성: ${photo.file_path} → ${downloadUrl}`);
      }

      return {
        id: photo.id,
        file_path: photo.file_path,
        original_filename: photo.original_filename,
        download_url: downloadUrl,
        user_caption: photo.caption || undefined,
        facility_caption: facilityCaption,
        created_at: photo.created_at
      };
    });

    console.log(`[EXPORT] ${section} 사진 ${photosWithCaptions.length}장 수집 완료`);

    // URL 샘플 로깅 (첫 번째 사진만)
    if (photosWithCaptions.length > 0) {
      console.log(`[EXPORT] 샘플 URL: ${photosWithCaptions[0].download_url}`);
      console.log(`[EXPORT] 샘플 file_path: ${photosWithCaptions[0].file_path}`);
    }

    return photosWithCaptions;
  } catch (error) {
    console.error(`[EXPORT] ${section} 사진 수집 오류:`, error);
    throw error;
  }
}

/**
 * 이미지 다운로드 및 Base64 변환
 */
async function downloadImageAsBase64(downloadUrl: string): Promise<string> {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('[EXPORT] 이미지 다운로드 오류:', error);
    throw error;
  }
}

// PDF 생성 함수는 @/lib/pdfGenerator에서 import

// Excel 생성 함수는 @/lib/excelGenerator에서 import

/**
 * POST /api/export-photos
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[EXPORT] API 시작');

    // 요청 본문 파싱
    const body: ExportRequestBody = await request.json();
    const { businessName, format, includeUserCaption, sections } = body;

    // 유효성 검증
    if (!businessName || !format || !sections) {
      return NextResponse.json(
        { success: false, message: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    console.log('[EXPORT] 요청 정보:', {
      businessName,
      format,
      includeUserCaption,
      sections
    });

    // 사진 데이터 수집
    const preventionPhotos = sections.includes('prevention')
      ? await collectPhotos(businessName, 'prevention')
      : [];

    const dischargePhotos = sections.includes('discharge')
      ? await collectPhotos(businessName, 'discharge')
      : [];

    const totalPhotos = preventionPhotos.length + dischargePhotos.length;

    if (totalPhotos === 0) {
      return NextResponse.json(
        { success: false, message: '다운로드할 사진이 없습니다.' },
        { status: 404 }
      );
    }

    console.log('[EXPORT] 사진 수집 완료:', {
      prevention: preventionPhotos.length,
      discharge: dischargePhotos.length,
      total: totalPhotos
    });

    // 사업장 정보 조회 (주소)
    const { data: businessData } = await supabaseAdmin
      .from('businesses')
      .select('address')
      .eq('business_name', businessName)
      .single();

    const businessInfo = {
      address: businessData?.address
    };

    // 문서 생성
    let fileBuffer: Buffer;
    let fileName: string;
    let mimeType: string;

    if (format === 'pdf') {
      fileBuffer = await generatePDF(
        businessName,
        businessInfo,
        preventionPhotos,
        dischargePhotos,
        includeUserCaption
      );
      fileName = `시설사진_${businessName}_${new Date().toISOString().split('T')[0]}.pdf`;
      mimeType = 'application/pdf';
    } else {
      fileBuffer = await generateExcel(
        businessName,
        businessInfo,
        preventionPhotos,
        dischargePhotos,
        includeUserCaption
      );
      fileName = `시설사진_${businessName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    console.log('[EXPORT] 문서 생성 완료:', {
      format,
      size: fileBuffer.length,
      fileName
    });

    // Blob 응답
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': fileBuffer.length.toString()
      }
    });
  } catch (error) {
    console.error('[EXPORT] API 오류:', error);
    const errorMessage = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}
