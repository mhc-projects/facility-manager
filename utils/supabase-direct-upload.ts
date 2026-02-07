// utils/supabase-direct-upload.ts
// Supabase Storage 직접 업로드 유틸리티
// Vercel 4.5MB 제한을 우회하고 안정적인 대용량 파일 업로드 지원

import { createClient } from '@supabase/supabase-js';
import { compressImage } from './client-image-processor';
import { generateBusinessId } from './business-id-generator';

// Supabase 클라이언트 생성 (클라이언트 측)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DirectUploadOptions {
  businessName: string;
  systemType: 'presurvey' | 'completion';
  fileType: 'basic' | 'discharge' | 'prevention';
  facilityInfo?: string;
  facilityId?: string;
  facilityNumber?: string;
  outletNumber?: string; // 🆕 배출구 번호 (송풍팬 전용)
  onProgress?: (percent: number) => void;
}

export interface DirectUploadResult {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  fileId?: string;
  fileData?: any;
  error?: string;
}

/**
 * Supabase Storage에 직접 파일 업로드
 * Progressive Compression 자동 적용
 */
export async function uploadToSupabaseStorage(
  file: File,
  options: DirectUploadOptions
): Promise<DirectUploadResult> {
  const startTime = Date.now();

  try {
    console.log(`🚀 [DIRECT-UPLOAD] Supabase Storage 직접 업로드 시작: ${file.name} (${(file.size/1024/1024).toFixed(2)}MB)`);

    // 0단계: 버킷 존재 확인 (권한 에러 시에도 업로드 시도)
    const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();

    if (bucketListError) {
      console.warn('⚠️ [DIRECT-UPLOAD] 버킷 목록 조회 실패 (권한 부족 가능성):', bucketListError);
      console.warn('⚠️ [DIRECT-UPLOAD] 버킷 존재를 가정하고 업로드 시도합니다...');
    } else {
      const bucketExists = buckets?.some(b => b.name === 'facility-files');
      console.log(`🗂️ [DIRECT-UPLOAD] facility-files 버킷 존재 여부: ${bucketExists ? '✅ 존재' : '❌ 없음'}`);

      if (!bucketExists) {
        console.warn('⚠️ [DIRECT-UPLOAD] 버킷 목록에서 facility-files를 찾지 못했지만 업로드를 시도합니다...');
      }
    }

    // 1단계: Progressive Compression (클라이언트 측)
    options.onProgress?.(10);
    console.log(`🗜️ [DIRECT-UPLOAD] Progressive Compression 시작...`);

    const compressedResult = await compressImage(file);
    const compressedFile = compressedResult.file;

    console.log(`✅ [DIRECT-UPLOAD] 압축 완료:`, {
      원본: `${(file.size/1024/1024).toFixed(2)}MB`,
      압축후: `${(compressedFile.size/1024/1024).toFixed(2)}MB`,
      압축률: `${((1 - compressedResult.compressionRatio) * 100).toFixed(1)}% 감소`,
      처리시간: `${compressedResult.processingTime.toFixed(0)}ms`
    });

    options.onProgress?.(30);

    // 2단계: 파일 경로 생성 (해시 기반 사업장 ID 사용)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // ✅ 해시 기반 사업장 ID 생성 (facility-photos API와 동일한 방식)
    const businessId = generateBusinessId(options.businessName);

    console.log(`🏢 [DIRECT-UPLOAD] 해시 기반 경로 생성:`, {
      원본사업장명: options.businessName,
      생성된ID: businessId
    });

    // 파일 확장자 추출
    const fileExtension = compressedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const baseFilename = compressedFile.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

    const filename = `${timestamp}_${baseFilename}.${fileExtension}`;

    // ✅ 시설 정보에 따른 폴더 구조 생성
    let folderPath: string;

    if (options.fileType === 'basic') {
      // 기본사진: businessId/systemType/basic/category
      let category = 'others';

      // facilityInfo JSON 파싱하여 category 추출
      if (options.facilityInfo) {
        try {
          const facilityInfoObj = JSON.parse(options.facilityInfo);
          category = facilityInfoObj.category || 'others';
          console.log(`📋 [DIRECT-UPLOAD] facilityInfo 파싱:`, {
            원본: options.facilityInfo,
            파싱결과: facilityInfoObj,
            추출된카테고리: category
          });
        } catch (e) {
          // JSON 파싱 실패 시 문자열 그대로 사용
          category = options.facilityInfo;
          console.log(`⚠️ [DIRECT-UPLOAD] facilityInfo JSON 파싱 실패, 문자열 사용: ${category}`);
        }
      }

      console.log(`🔍 [DIRECT-UPLOAD] 카테고리 및 배출구 확인:`, {
        category,
        outletNumber: options.outletNumber,
        송풍팬조건: category === 'fan' && options.outletNumber
      });

      // 🆕 송풍팬 + 배출구별 폴더 구조: fan/outlet-N
      if (category === 'fan' && options.outletNumber) {
        folderPath = `${businessId}/${options.systemType}/basic/fan/outlet-${options.outletNumber}`;
        console.log(`🆕 [FAN-OUTLET-DIRECT-PATH] 배출구별 송풍팬 경로 생성: ${folderPath}`);
      } else {
        folderPath = `${businessId}/${options.systemType}/basic/${category}`;
        console.log(`📁 [DIRECT-UPLOAD] 일반 기본사진 경로: ${folderPath}`);
      }
    } else {
      // 배출시설/방지시설: businessId/systemType/fileType/outlet_N/facilityType_N
      const outletNumber = options.facilityNumber || '1';
      const facilityId = options.facilityId || '1';
      folderPath = `${businessId}/${options.systemType}/${options.fileType}/outlet_${outletNumber}/${options.fileType}_${facilityId}`;
    }

    const filePath = `${folderPath}/${filename}`;

    console.log(`📁 [DIRECT-UPLOAD] 업로드 경로: ${filePath}`);

    options.onProgress?.(40);

    // 3단계: Supabase Storage에 직접 업로드
    console.log(`📤 [DIRECT-UPLOAD] Supabase Storage 업로드 중...`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('facility-files')
      .upload(filePath, compressedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: compressedFile.type
      });

    if (uploadError) {
      console.error(`❌ [DIRECT-UPLOAD] Storage 업로드 실패:`, {
        error: uploadError,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        details: uploadError,
        filePath,
        bucketName: 'facility-files'
      });
      throw new Error(`Storage 업로드 실패: ${uploadError.message} (${uploadError.statusCode || 'unknown'})`);
    }

    console.log(`✅ [DIRECT-UPLOAD] Supabase Storage 업로드 완료: ${uploadData.path}`);

    options.onProgress?.(70);

    // 4단계: Public URL 생성
    const { data: publicUrlData } = supabase.storage
      .from('facility-files')
      .getPublicUrl(uploadData.path);

    console.log(`🔗 [DIRECT-UPLOAD] Public URL 생성: ${publicUrlData.publicUrl}`);

    options.onProgress?.(80);

    // 5단계: 메타데이터를 Vercel API로 전송 (DB 저장)
    console.log(`💾 [DIRECT-UPLOAD] 메타데이터 저장 중...`);

    const metadataResponse = await fetch('/api/upload-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: options.businessName,
        systemType: options.systemType,
        fileType: options.fileType,
        facilityInfo: options.facilityInfo,
        facilityId: options.facilityId,
        facilityNumber: options.facilityNumber,
        filename: compressedFile.name,
        originalFilename: file.name,
        filePath: uploadData.path,
        fileSize: compressedFile.size,
        originalSize: file.size,
        mimeType: compressedFile.type,
        publicUrl: publicUrlData.publicUrl
      })
    });

    let fileId: string | undefined;
    let fileData: any = null;

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('❌ [DIRECT-UPLOAD] 메타데이터 저장 실패:', {
        status: metadataResponse.status,
        statusText: metadataResponse.statusText,
        error: errorText
      });
      throw new Error(`메타데이터 저장 실패: ${metadataResponse.status} - ${errorText}`);
    } else {
      const metadataResult = await metadataResponse.json();
      fileId = metadataResult.fileId;
      fileData = metadataResult.fileData;
      console.log(`✅ [DIRECT-UPLOAD] 메타데이터 저장 완료: ${fileId}`);
    }

    options.onProgress?.(100);

    const uploadTime = Date.now() - startTime;
    console.log(`🎉 [DIRECT-UPLOAD] 전체 완료:`, {
      파일: file.name,
      총처리시간: `${uploadTime}ms`,
      최종크기: `${(compressedFile.size/1024/1024).toFixed(2)}MB`,
      URL: publicUrlData.publicUrl
    });

    return {
      success: true,
      filePath: uploadData.path,
      publicUrl: publicUrlData.publicUrl,
      fileId,
      fileData
    };

  } catch (error) {
    console.error('❌ [DIRECT-UPLOAD] 실패:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}

/**
 * 여러 파일 병렬 업로드
 * 안정성을 위해 동시 업로드 수 제한
 */
export async function uploadMultipleToSupabase(
  files: File[],
  options: DirectUploadOptions,
  onFileProgress?: (fileIndex: number, percent: number) => void,
  concurrency: number = 3 // 동시 업로드 수 (기본 3개)
): Promise<DirectUploadResult[]> {
  console.log(`📦 [BATCH-DIRECT-UPLOAD] ${files.length}개 파일 업로드 시작 (동시: ${concurrency}개)`);

  const results: DirectUploadResult[] = [];

  // 청크 단위로 병렬 업로드
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    console.log(`📦 [BATCH-DIRECT-UPLOAD] 청크 ${Math.floor(i / concurrency) + 1}/${Math.ceil(files.length / concurrency)} 처리 중 (${chunk.length}개 파일)`);

    const chunkPromises = chunk.map((file, chunkIndex) => {
      const globalIndex = i + chunkIndex;
      return uploadToSupabaseStorage(file, {
        ...options,
        onProgress: (percent) => onFileProgress?.(globalIndex, percent)
      });
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    const successCount = chunkResults.filter(r => r.success).length;
    console.log(`✅ [BATCH-DIRECT-UPLOAD] 청크 완료: ${successCount}/${chunk.length} 성공`);
  }

  const totalSuccess = results.filter(r => r.success).length;
  console.log(`🎉 [BATCH-DIRECT-UPLOAD] 전체 완료: ${totalSuccess}/${files.length} 성공`);

  return results;
}
