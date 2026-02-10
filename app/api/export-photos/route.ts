import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
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
    // Supabase 쿼리
    let query = supabaseAdmin
      .from('uploaded_files')
      .select('*')
      .eq('business_name', businessName);

    if (section === 'prevention') {
      // 방지시설: gateway + 방지시설
      query = query.or('file_path.like.%기본사진/gateway%,file_path.like.%방지시설/%');
    } else {
      // 배출시설
      query = query.like('file_path', '%배출시설/%');
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

      if (isGatewayOrBasicPhoto(photo.file_path)) {
        facilityCaption = generateGatewayCaption();
      } else {
        const facilityInfo = extractFacilityInfoFromFolder(photo.file_path);
        facilityCaption = generateCaption(facilityInfo);
      }

      return {
        id: photo.id,
        file_path: photo.file_path,
        original_filename: photo.original_filename,
        download_url: photo.download_url,
        user_caption: photo.caption || undefined,
        facility_caption: facilityCaption,
        created_at: photo.created_at
      };
    });

    console.log(`[EXPORT] ${section} 사진 ${photosWithCaptions.length}장 수집 완료`);
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
