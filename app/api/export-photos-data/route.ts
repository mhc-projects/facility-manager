import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  extractFacilityInfoFromFileName,
  extractFacilityInfoFromFolder,
  generateCaption,
  isGatewayOrBasicPhoto,
  generateGatewayCaption,
} from '@/lib/facilityInfoExtractor';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PhotoData {
  id: string;
  file_path: string;
  original_filename: string;
  download_url: string;
  user_caption?: string;
  facility_caption: string;
  facility_info?: string; // DB의 facility_info 컬럼
  created_at: string;
}

interface ExportRequestBody {
  businessName: string;
  sections: ('prevention' | 'discharge')[];
}

/**
 * 사진 데이터 수집
 */
async function collectPhotos(businessName: string, section: 'prevention' | 'discharge'): Promise<PhotoData[]> {
  try {
    // 1. business_name으로 business_id 조회
    const { data: business, error: businessError } = await supabaseAdmin
      .from('business_info')
      .select('id')
      .eq('business_name', businessName)
      .eq('is_deleted', false)
      .single();

    if (businessError || !business) {
      console.error(`[EXPORT-DATA] 사업장 조회 실패:`, businessError);
      throw new Error(`사업장을 찾을 수 없습니다: ${businessName}`);
    }

    // 2. Supabase 쿼리
    let query = supabaseAdmin
      .from('uploaded_files')
      .select('*')
      .eq('business_id', business.id);

    if (section === 'prevention') {
      query = query.or('file_path.like.%/basic/%,file_path.like.%/prevention/%');
    } else {
      query = query.like('file_path', '%/discharge/%');
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      console.error(`[EXPORT-DATA] ${section} 사진 조회 실패:`, error);
      throw new Error(`${section} 사진 조회 실패`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 시설 정보 캡션 생성
    const photosWithCaptions: PhotoData[] = data.map(photo => {
      let facilityCaption = '';

      console.log('[EXPORT-DATA] 파일 정보:', {
        file_path: photo.file_path,
        original_filename: photo.original_filename,
        facility_info: photo.facility_info
      });

      // DB에 저장된 facility_info 컬럼 직접 사용
      if (photo.facility_info) {
        facilityCaption = photo.facility_info;
        console.log('[EXPORT-DATA] DB에서 시설 정보 직접 사용:', facilityCaption);
      } else if (isGatewayOrBasicPhoto(photo.file_path)) {
        facilityCaption = generateGatewayCaption();
      } else {
        // 폴백: 파일명에서 시설 정보 추출
        const facilityInfo = extractFacilityInfoFromFileName(photo.original_filename, photo.file_path);
        console.log('[EXPORT-DATA] 폴백: 파일명에서 추출된 시설 정보:', facilityInfo);
        facilityCaption = generateCaption(facilityInfo);
        console.log('[EXPORT-DATA] 생성된 캡션:', facilityCaption);
      }

      // download_url이 없으면 file_path로부터 생성
      let downloadUrl = photo.download_url;
      if (!downloadUrl || downloadUrl === '') {
        const { data: publicUrl } = supabaseAdmin.storage
          .from('facility-files')
          .getPublicUrl(photo.file_path);
        downloadUrl = publicUrl.publicUrl;
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

    return photosWithCaptions;
  } catch (error) {
    console.error(`[EXPORT-DATA] ${section} 사진 수집 오류:`, error);
    throw error;
  }
}

/**
 * POST /api/export-photos-data
 * 사진 데이터를 JSON으로 반환 (클라이언트에서 PDF 생성용)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[EXPORT-DATA] API 시작');

    // 요청 본문 파싱
    const body: ExportRequestBody = await request.json();
    const { businessName, sections } = body;

    // 유효성 검증
    if (!businessName || !sections) {
      return NextResponse.json(
        { success: false, message: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 사진 데이터 수집
    const preventionPhotos = sections.includes('prevention')
      ? await collectPhotos(businessName, 'prevention')
      : [];

    const dischargePhotos = sections.includes('discharge')
      ? await collectPhotos(businessName, 'discharge')
      : [];

    // 사업장 정보 조회
    const { data: businessData } = await supabaseAdmin
      .from('businesses')
      .select('address')
      .eq('business_name', businessName)
      .single();

    const businessInfo = {
      address: businessData?.address
    };

    console.log('[EXPORT-DATA] 데이터 수집 완료:', {
      prevention: preventionPhotos.length,
      discharge: dischargePhotos.length
    });

    // JSON 응답
    return NextResponse.json({
      success: true,
      data: {
        businessName,
        businessInfo,
        preventionPhotos,
        dischargePhotos
      }
    });

  } catch (error) {
    console.error('[EXPORT-DATA] API 오류:', error);
    const errorMessage = error instanceof Error ? error.message : '서버 오류가 발생했습니다.';

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}
