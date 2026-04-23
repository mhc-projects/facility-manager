import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBusinessId } from '@/utils/business-id-generator';
import JSZip from 'jszip';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessName, facilityType, facilityNumber, outletNumber, category } = body;

    console.log('🔍 [ZIP-DOWNLOAD] 요청 파라미터:', { businessName, facilityType, facilityNumber, outletNumber, category });

    if (!businessName) {
      return NextResponse.json(
        { success: false, message: '사업장명이 필요합니다.' },
        { status: 400 }
      );
    }

    // 해시 기반 사업장 ID 생성 (범용)
    const businessId = generateBusinessId(businessName);
    
    console.log('🏢 [ZIP-BUSINESS-ID] 해시 기반 사업장 ID:', {
      원본사업장명: businessName,
      생성된ID: businessId
    });

    // 사업장 조회 - uploaded_files 테이블 사용을 위해 business_id 필요
    const { data: business, error: businessError } = await supabase
      .from('business_info')
      .select('id')
      .eq('business_name', businessName)
      .eq('is_deleted', false)
      .single();

    if (businessError || !business) {
      console.error('❌ [ZIP-DOWNLOAD] 사업장을 찾을 수 없음:', businessName);
      return NextResponse.json(
        { success: false, message: '사업장을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // uploaded_files 테이블에서 사진 목록 조회
    let query = supabase
      .from('uploaded_files')
      .select('*')
      .eq('business_id', business.id);

    // 필터 조건 추가 - uploaded_files 테이블 구조에 맞게 수정
    if (facilityType) {
      // file_path에서 facilityType 기반으로 필터링
      if (facilityType === 'basic') {
        query = query.like('file_path', '%/basic/%');
      } else if (facilityType === 'discharge') {
        query = query.like('file_path', '%/discharge/%');
      } else if (facilityType === 'prevention') {
        query = query.like('file_path', '%/prevention/%');
      }
    }
    
    // 추가 필터는 facility_info나 file_path로 구현 가능
    if (category) {
      query = query.ilike('facility_info', `%${category}%`);
    }

    const { data: photos, error: photosError } = await query;

    if (photosError) {
      console.error('❌ [ZIP-DOWNLOAD] 사진 목록 조회 실패:', photosError);
      return NextResponse.json(
        { success: false, message: '사진 목록을 불러올 수 없습니다.' },
        { status: 500 }
      );
    }

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { success: false, message: '다운로드할 사진이 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`📦 [ZIP-DOWNLOAD] ${photos.length}장의 사진을 ZIP으로 압축 중...`);

    // ZIP 파일 생성
    const zip = new JSZip();
    let successCount = 0;
    let errorCount = 0;

    // 각 사진을 ZIP에 추가
    for (const photo of photos) {
      try {
        // Supabase Storage에서 파일 다운로드 - facility-files 버킷 사용
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('facility-files')
          .download(photo.file_path);

        if (downloadError) {
          console.error(`❌ [ZIP-DOWNLOAD] 파일 다운로드 실패: ${photo.filename}`, downloadError);
          errorCount++;
          continue;
        }

        if (!fileData) {
          console.error(`❌ [ZIP-DOWNLOAD] 파일 데이터 없음: ${photo.filename}`);
          errorCount++;
          continue;
        }

        // 파일 경로에서 폴더 구조 추출
        const pathParts = photo.file_path.split('/');
        let folderPath = '기본사진';
        
        // 경로에서 시설 타입 감지
        if (pathParts.includes('discharge')) {
          folderPath = '배출시설';
        } else if (pathParts.includes('prevention')) {
          folderPath = '방지시설';
        } else if (pathParts.includes('basic')) {
          folderPath = '기본사진';
        }

        // facility_info가 있으면 세부 분류 추가 (JSON 파싱 처리)
        if (photo.facility_info) {
          try {
            // facility_info가 JSON 형태인지 확인
            const facilityInfo = typeof photo.facility_info === 'string' 
              ? JSON.parse(photo.facility_info) 
              : photo.facility_info;
            
            if (facilityInfo && typeof facilityInfo === 'object') {
              // JSON 객체인 경우 outlet과 number 정보로 폴더명 생성
              if (facilityInfo.outlet && facilityInfo.number) {
                folderPath += `/배출구${facilityInfo.outlet}_${facilityInfo.number}번`;
              } else if (facilityInfo.name) {
                folderPath += `/${facilityInfo.name}`;
              }
            } else {
              // 일반 문자열인 경우 그대로 사용
              folderPath += `/${photo.facility_info}`;
            }
          } catch (e) {
            // JSON 파싱 실패시 일반 문자열로 처리
            folderPath += `/${photo.facility_info}`;
          }
        }

        const fileName = `${folderPath}/${photo.original_filename || photo.filename}`;
        
        // ZIP에 파일 추가 - Blob을 ArrayBuffer로 변환
        const arrayBuffer = await fileData.arrayBuffer();
        zip.file(fileName, arrayBuffer);
        successCount++;
        
        console.log(`✅ [ZIP-DOWNLOAD] 추가됨: ${fileName}`);
      } catch (error) {
        console.error(`❌ [ZIP-DOWNLOAD] 파일 처리 실패: ${photo.filename}`, error);
        errorCount++;
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        { success: false, message: '압축할 수 있는 파일이 없습니다.' },
        { status: 500 }
      );
    }

    // ZIP 파일 생성
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // ZIP 파일명 생성
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    let zipFileName = `${businessName}_사진모음`;
    
    if (facilityType === 'basic' && category) {
      zipFileName += `_기본사진_${category}`;
    } else if (facilityType && outletNumber && facilityNumber) {
      const typeKorean = facilityType === 'discharge' ? '배출시설' : '방지시설';
      zipFileName += `_${typeKorean}_배출구${outletNumber}_${facilityNumber}번`;
    } else if (facilityType) {
      const typeKorean = facilityType === 'discharge' ? '배출시설' : facilityType === 'prevention' ? '방지시설' : '기본사진';
      zipFileName += `_${typeKorean}`;
    }
    
    zipFileName += `_${timestamp}.zip`;

    console.log(`🎉 [ZIP-DOWNLOAD] 완료: ${successCount}장 성공, ${errorCount}장 실패`);

    // ZIP 파일 응답
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('❌ [ZIP-DOWNLOAD] 서버 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}