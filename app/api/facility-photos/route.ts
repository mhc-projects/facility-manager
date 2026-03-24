// app/api/facility-photos/route.ts - 시설별 사진 관리 전용 API
// 개선된 시설별 사진 업로드, 조회, 삭제 기능

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { queryAll, queryOne, query } from '@/lib/supabase-direct';
import { memoryCache } from '@/lib/cache';
import { createHash } from 'crypto';
import { createFacilityPhotoTracker } from '@/utils/facility-photo-tracker';
import { generateFacilityFileName, generateBasicFileName } from '@/utils/filename-generator';
import { generateBusinessId, convertLegacyPath } from '@/utils/business-id-generator';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


interface FacilityPhotoRequest {
  businessName: string;
  facilityType: 'discharge' | 'prevention' | 'basic';
  facilityNumber?: number;
  outletNumber?: number;
  category?: string; // 기본사진용
  files: File[];
}

interface FacilityPhotoResponse {
  success: boolean;
  message: string;
  data?: {
    uploadedPhotos: any[];
    facilityInfo: {
      facilityType: string;
      facilityNumber?: number;
      outletNumber?: number;
      displayName: string;
      totalPhotos: number;
      photoIndices: number[];
    };
  };
  error?: string;
}

// 파일 해시 계산
async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

// 이미지 압축 - 클라이언트(supabase-direct-upload)에서 이미 압축 완료 후 업로드하므로
// 서버에서 재압축 불필요. browser-image-compression은 브라우저 전용 라이브러리라
// 서버 번들에 포함되지 않도록 no-op으로 대체.
async function compressImageFile(file: File): Promise<File> {
  return file;
}

// 사업장 ID 가져오기 또는 생성 - ✅ business_info 테이블 사용 (Direct PostgreSQL)
async function getOrCreateBusiness(businessName: string): Promise<string> {
  // 기존 사업장 조회
  const existingBusiness = await queryOne(
    `SELECT id FROM business_info
     WHERE business_name = $1 AND is_deleted = false`,
    [businessName]
  );

  if (existingBusiness) {
    return existingBusiness.id;
  }

  // 신규 사업장 생성
  try {
    const newBusiness = await queryOne(
      `INSERT INTO business_info (business_name, is_deleted, is_active)
       VALUES ($1, false, true)
       RETURNING id`,
      [businessName]
    );

    return newBusiness.id;
  } catch (error: any) {
    // 중복 키 오류 발생 시 재시도 (동시성 처리)
    if (error.code === '23505') {
      const retryBusiness = await queryOne(
        `SELECT id FROM business_info
         WHERE business_name = $1 AND is_deleted = false`,
        [businessName]
      );

      if (retryBusiness) return retryBusiness.id;
    }
    throw error;
  }
}

// 시설별 파일 경로 생성 (범용 해시 기반)
function generateFacilityPath(
  businessName: string,
  facilityType: 'discharge' | 'prevention' | 'basic',
  filename: string,
  facilityNumber?: number,
  outletNumber?: number,
  category?: string,
  phase?: string
): string {
  // 해시 기반 사업장 ID 생성
  const businessId = generateBusinessId(businessName);
  
  console.log('🏢 [BUSINESS-PATH] 해시 기반 경로 생성:', {
    원본사업장명: businessName,
    생성된ID: businessId,
    파일명: filename
  });

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const phasePrefix = phase || 'presurvey'; // phase가 없으면 기본값으로 presurvey
  
  let folderPath: string;
  
  if (facilityType === 'basic') {
    folderPath = `${businessId}/${phasePrefix}/basic/${category || 'others'}`;
  } else {
    const outletFolder = outletNumber ? `outlet_${outletNumber}` : 'outlet_1';
    const facilityFolder = `${facilityType}_${facilityNumber || 1}`;
    folderPath = `${businessId}/${phasePrefix}/${facilityType}/${outletFolder}/${facilityFolder}`;
  }

  const finalPath = `${folderPath}/${timestamp}_${filename}`;
  
  console.log('🛣️ [HASH-PATH] 최종 경로 생성:', {
    사업장ID: businessId,
    시설유형: facilityType,
    단계: phasePrefix,
    최종경로: finalPath
  });
  
  return finalPath;
}

// 시설별 사진 업로드 (POST)
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`🏗️ [FACILITY-PHOTOS] 시설별 업로드 시작: ${requestId}`);

  try {
    const formData = await request.formData();
    
    // 요청 데이터 파싱
    const businessName = formData.get('businessName') as string;
    const facilityType = formData.get('facilityType') as 'discharge' | 'prevention' | 'basic';
    const facilityNumber = formData.get('facilityNumber') ? parseInt(formData.get('facilityNumber') as string) : undefined;
    const outletNumber = formData.get('outletNumber') ? parseInt(formData.get('outletNumber') as string) : undefined;
    const category = formData.get('category') as string;
    const phase = formData.get('phase') as string || 'presurvey'; // 새로운 phase 파라미터
    
    const files = formData.getAll('files') as File[];

    console.log(`📋 [FACILITY-PHOTOS] 업로드 정보:`, {
      businessName,
      facilityType,
      facilityNumber,
      phase,
      outletNumber,
      category,
      fileCount: files.length
    });

    // 유효성 검사
    if (!businessName || !facilityType || files.length === 0) {
      return NextResponse.json({
        success: false,
        message: '필수 정보가 누락되었습니다. (사업장명, 시설유형, 파일)',
        error: 'MISSING_REQUIRED_FIELDS'
      } as FacilityPhotoResponse, { status: 400 });
    }

    if (facilityType !== 'basic' && (!facilityNumber || !outletNumber)) {
      return NextResponse.json({
        success: false,
        message: '배출/방지시설 업로드 시 시설번호와 배출구번호가 필요합니다.',
        error: 'MISSING_FACILITY_INFO'
      } as FacilityPhotoResponse, { status: 400 });
    }

    // 1. 사업장 ID 가져오기
    const businessId = await getOrCreateBusiness(businessName);

    // 2. 현재 시설별 사진 현황 조회
    const photoTracker = createFacilityPhotoTracker(businessName);

    // 기존 파일 목록 로드 및 추적기 초기화 (Direct PostgreSQL)
    const existingFiles = await queryAll(
      `SELECT * FROM uploaded_files WHERE business_id = $1`,
      [businessId]
    );

    if (existingFiles && existingFiles.length > 0) {
      const formattedFiles = existingFiles.map((file: any) => ({
        id: file.id,
        name: file.filename,
        originalName: file.original_filename,
        size: file.file_size,
        mimeType: file.mime_type,
        createdTime: file.created_at,
        downloadUrl: '',
        webViewLink: '',
        thumbnailUrl: '',
        folderName: file.file_path.includes('discharge') ? '배출시설' :
                   file.file_path.includes('prevention') ? '방지시설' : '기본사진',
        facilityInfo: file.facility_info || '',
        filePath: file.file_path,
        uploadStatus: file.upload_status || 'uploaded',
        caption: file.caption || null
      }));
      
      photoTracker.buildFromUploadedFiles(formattedFiles);
    }

    // 3. 다음 사진 인덱스 계산
    const nextPhotoIndex = photoTracker.getNextPhotoIndex(facilityType, facilityNumber, outletNumber, category);
    
    console.log(`🔢 [PHOTO-INDEX] 시설별 다음 사진 순번: ${nextPhotoIndex}`);

    // 4. 파일별 업로드 처리 (순서 보장)
    const uploadResults: any[] = [];
    const failedUploads: string[] = [];

    // 파일 배열을 정렬하여 순서 보장 (파일명 기준)
    const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));
    
    console.log('📋 [FILE-ORDER] 파일 처리 순서 확인:', {
      원본파일순서: files.map(f => f.name),
      정렬후순서: sortedFiles.map(f => f.name)
    });

    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const photoIndex = nextPhotoIndex + i;

      try {
        console.log(`📤 [FILE-UPLOAD] 파일 업로드 시작: ${file.name} (${i + 1}/${files.length})`);

        // 이미지 압축
        const compressedFile = await compressImageFile(file);
        
        // 파일 해시 계산
        const fileHash = await calculateFileHash(compressedFile);

        // 중복 검사 (Direct PostgreSQL)
        const existingFile = await queryOne(
          `SELECT id, filename FROM uploaded_files
           WHERE business_id = $1 AND file_hash = $2`,
          [businessId, fileHash]
        );

        if (existingFile) {
          console.log(`⚠️ [DUPLICATE] 중복 파일 건너뛰기: ${file.name}`);
          continue;
        }

        // 구조화된 파일명 생성
        let structuredFilename: string;
        if (facilityType === 'basic') {
          structuredFilename = generateBasicFileName(category || 'others', photoIndex, file.name);
        } else {
          // 임시 시설 객체 생성
          const tempFacility = {
            name: `${facilityType === 'discharge' ? '배출' : '방지'}시설`,
            capacity: '',
            outlet: outletNumber || 1,
            number: facilityNumber || 1,
            quantity: 1,
            displayName: `${facilityType === 'discharge' ? '배' : '방'}${facilityNumber}`
          };

          structuredFilename = generateFacilityFileName({
            facility: tempFacility,
            facilityType: facilityType as 'discharge' | 'prevention',
            facilityIndex: facilityNumber || 1,
            photoIndex: photoIndex,
            originalFileName: file.name
          });
        }

        console.log(`📝 [FILENAME] 구조화된 파일명: ${file.name} → ${structuredFilename}`);

        // Storage 경로 생성
        const filePath = generateFacilityPath(
          businessName,
          facilityType,
          structuredFilename,
          facilityNumber,
          outletNumber,
          category,
          phase
        );

        // Supabase Storage 업로드
        const arrayBuffer = await compressedFile.arrayBuffer();
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('facility-files')
          .upload(filePath, arrayBuffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: compressedFile.type
          });

        if (uploadError) {
          throw new Error(`Storage 업로드 실패: ${uploadError.message}`);
        }

        // 시설 정보 JSON 생성
        const facilityInfo = facilityType === 'basic' ? category : JSON.stringify({
          type: facilityType,
          outlet: outletNumber,
          number: facilityNumber,
          name: `${facilityType === 'discharge' ? '배출' : '방지'}시설`,
          photoIndex
        });

        // DB 저장 (Direct PostgreSQL)
        let fileRecord;
        try {
          fileRecord = await queryOne(
            `INSERT INTO uploaded_files (
              business_id, filename, original_filename, file_hash,
              file_path, file_size, mime_type, upload_status, facility_info
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
              businessId,
              structuredFilename,
              file.name,
              fileHash,
              uploadData.path,
              compressedFile.size,
              compressedFile.type,
              'uploaded',
              facilityInfo
            ]
          );
        } catch (dbError: any) {
          // 롤백: Storage에서 파일 삭제
          await supabaseAdmin.storage
            .from('facility-files')
            .remove([uploadData.path]);
          throw new Error(`DB 저장 실패: ${dbError.message}`);
        }

        // 공개 URL 생성
        const { data: publicUrl } = supabaseAdmin.storage
          .from('facility-files')
          .getPublicUrl(uploadData.path);

        const uploadedPhoto = {
          id: fileRecord.id,
          name: structuredFilename,
          originalName: file.name,
          photoIndex,
          size: compressedFile.size,
          mimeType: compressedFile.type,
          uploadedAt: fileRecord.created_at,
          filePath: uploadData.path,
          downloadUrl: publicUrl.publicUrl,
          thumbnailUrl: publicUrl.publicUrl,
          justUploaded: true
        };

        uploadResults.push(uploadedPhoto);
        console.log(`✅ [FILE-SUCCESS] 파일 업로드 완료: ${structuredFilename}`);

      } catch (error) {
        console.error(`❌ [FILE-ERROR] 파일 업로드 실패: ${file.name}`, error);
        failedUploads.push(file.name);
      }
    }

    // 캐시 무효화
    memoryCache.delete(`files_${businessName}_completion`);
    memoryCache.delete(`files_${businessName}_presurvey`);

    console.log(`✅ [FACILITY-PHOTOS] 업로드 완료: ${requestId}, 성공=${uploadResults.length}, 실패=${failedUploads.length}`);

    // 5. 응답 생성
    const displayName = facilityType === 'basic' ? 
      (category === 'gateway' ? '게이트웨이' : 
       category === 'fan' ? '송풍팬' : '기타') :
      `${facilityType === 'discharge' ? '배' : '방'}${facilityNumber}`;

    const response: FacilityPhotoResponse = {
      success: true,
      message: `${uploadResults.length}장의 사진이 업로드되었습니다.${failedUploads.length > 0 ? ` (${failedUploads.length}장 실패)` : ''}`,
      data: {
        uploadedPhotos: uploadResults,
        facilityInfo: {
          facilityType,
          facilityNumber,
          outletNumber,
          displayName,
          totalPhotos: photoTracker.getFacilityPhotoCount(facilityType, facilityNumber, outletNumber, category) + uploadResults.length,
          photoIndices: uploadResults.map(p => p.photoIndex)
        }
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error(`❌ [FACILITY-PHOTOS] 전체 실패: ${requestId}`, error);
    
    const response: FacilityPhotoResponse = {
      success: false,
      message: '시설별 사진 업로드 중 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// 시설별 사진 조회 (GET)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');
    const facilityType = searchParams.get('facilityType') as 'discharge' | 'prevention' | 'basic' | null;
    const facilityNumber = searchParams.get('facilityNumber') ? parseInt(searchParams.get('facilityNumber')!) : undefined;
    const outletNumber = searchParams.get('outletNumber') ? parseInt(searchParams.get('outletNumber')!) : undefined;
    const category = searchParams.get('category');
    const phase = searchParams.get('phase') || 'presurvey'; // 새로운 phase 파라미터

    if (!businessName) {
      return NextResponse.json({
        success: false,
        message: '사업장명이 필요합니다.',
        error: 'MISSING_BUSINESS_NAME'
      }, { status: 400 });
    }

    console.log(`🔍 [FACILITY-PHOTOS-GET] 조회 시작:`, {
      businessName,
      facilityType,
      facilityNumber,
      phase,
      outletNumber,
      category
    });

    // 사업장 조회 (Direct PostgreSQL)
    const business = await queryOne(
      `SELECT id FROM business_info
       WHERE business_name = $1 AND is_deleted = false`,
      [businessName]
    );

    if (!business) {
      return NextResponse.json({
        success: false,
        message: '사업장을 찾을 수 없습니다.',
        error: 'BUSINESS_NOT_FOUND'
      }, { status: 404 });
    }

    // ✅ 전체 사진 개수 조회 (Direct PostgreSQL - phase 무관)
    const allPhotos = await queryAll(
      `SELECT id FROM uploaded_files WHERE business_id = $1`,
      [business.id]
    );

    const totalPhotoCount = allPhotos?.length || 0;

    console.log(`📊 [TOTAL-PHOTOS] 전체 사진 수:`, {
      businessName,
      businessId: business.id,
      totalPhotos: totalPhotoCount
    });

    // 파일 목록 조회 (Direct PostgreSQL with dynamic filters)
    // Phase 필터링 (phase에 따른 스토리지 경로 필터링)
    // ✅ FIX: postinstall과 aftersales는 모두 'completion' 폴더 사용
    const phasePrefix = (phase === 'aftersales' || phase === 'postinstall') ? 'completion' : 'presurvey';

    console.log(`🔍 [PHASE-FILTER] Phase 필터 적용:`, {
      원본phase: phase,
      스토리지경로: phasePrefix,
      쿼리패턴: `%/${phasePrefix}/%`,
      전체사진수: totalPhotoCount
    });

    // 동적 WHERE 조건 생성
    const conditions: string[] = [
      `business_id = $1`,
      `file_path LIKE $2` // phase prefix filter
    ];
    const params: any[] = [business.id, `%/${phasePrefix}/%`];
    let paramIndex = 3;

    // 시설 유형별 필터 추가
    if (facilityType) {
      if (facilityType === 'basic') {
        conditions.push(`file_path LIKE $${paramIndex}`);
        params.push('%/basic/%');
        paramIndex++;

        if (category) {
          conditions.push(`file_path LIKE $${paramIndex}`);
          params.push(`%/${category}/%`);
          paramIndex++;
        }
      } else {
        conditions.push(`file_path LIKE $${paramIndex}`);
        params.push(`%/${facilityType}/%`);
        paramIndex++;

        if (outletNumber) {
          conditions.push(`file_path LIKE $${paramIndex}`);
          params.push(`%/outlet_${outletNumber}/%`);
          paramIndex++;
        }

        if (facilityNumber) {
          conditions.push(`file_path LIKE $${paramIndex}`);
          params.push(`%/${facilityType}_${facilityNumber}/%`);
          paramIndex++;
        }
      }
    }

    const whereClause = conditions.join(' AND ');
    const files = await queryAll(
      `SELECT * FROM uploaded_files
       WHERE ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    // 파일 URL 생성 및 포맷팅
    const formattedFiles = await Promise.all(
      (files || []).map(async (file: any) => {
        const { data: publicUrl } = supabaseAdmin.storage
          .from('facility-files')
          .getPublicUrl(file.file_path);

        return {
          id: file.id,
          name: file.filename,
          originalName: file.original_filename,
          size: file.file_size,
          mimeType: file.mime_type,
          createdTime: file.created_at,
          downloadUrl: publicUrl.publicUrl,
          webViewLink: publicUrl.publicUrl,
          thumbnailUrl: publicUrl.publicUrl,
          folderName: file.file_path.includes('discharge') ? '배출시설' :
                     file.file_path.includes('prevention') ? '방지시설' : '기본사진',
          facilityInfo: file.facility_info || '',
          filePath: file.file_path,
          uploadStatus: file.upload_status || 'uploaded',
          caption: file.caption || null
        };
      })
    );

    // 추적기로 시설별 정보 구성
    const photoTracker = createFacilityPhotoTracker(businessName);
    photoTracker.buildFromUploadedFiles(formattedFiles);

    const statistics = photoTracker.getStatistics();

    // ✅ 전체 사진 수를 statistics에 추가 (facility list와 일치하는 수량)
    const enhancedStatistics = {
      ...statistics,
      totalPhotosAllPhases: totalPhotoCount, // 모든 phase의 사진 총합
      currentPhasePhotos: formattedFiles.length, // 현재 phase의 사진 수
      currentPhase: phase
    };

    console.log(`✅ [FACILITY-PHOTOS-GET] 조회 완료:`, {
      현재phase사진: formattedFiles.length,
      전체사진: totalPhotoCount,
      phase
    });

    return NextResponse.json({
      success: true,
      message: `${formattedFiles.length}장의 사진을 조회했습니다.`,
      data: {
        files: formattedFiles,
        statistics: enhancedStatistics,
        facilities: {
          discharge: photoTracker.getDischargeFacilities(),
          prevention: photoTracker.getPreventionFacilities(),
          basic: photoTracker.getBasicFacilities()
        }
      }
    });

  } catch (error) {
    console.error('❌ [FACILITY-PHOTOS-GET] 조회 실패:', error);
    
    return NextResponse.json({
      success: false,
      message: '시설별 사진 조회 중 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    }, { status: 500 });
  }
}

// 시설별 사진 삭제 (DELETE)
// ⚠️ 이 DELETE 핸들러는 제거되었습니다.
// 개별 사진 삭제는 /api/facility-photos/[photoId]/route.ts의 DELETE 핸들러를 사용하세요.
// 올바른 요청 형식: DELETE /api/facility-photos/{photoId}