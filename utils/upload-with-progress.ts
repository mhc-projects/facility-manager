// utils/upload-with-progress.ts
// XMLHttpRequest 기반 파일 업로드 (진행률 추적 지원)

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadResponse {
  success: boolean;
  message?: string;
  uploadedFiles?: any[];
  files?: any[]; // 추가: API 응답에서 files 속성도 지원
  error?: string;
  isDuplicate?: boolean;
  duplicateInfo?: {
    existingFile: string;
    uploadDate: string;
    hash: string;
  };
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal; // 업로드 취소 지원
}

/**
 * 재시도 기능이 포함된 파일 업로드 (지수 백오프 재시도)
 * @param file 업로드할 파일
 * @param additionalData 추가 폼 데이터
 * @param options 업로드 옵션 (진행률 콜백 등)
 * @returns Promise<UploadResponse>
 */
export async function uploadWithProgress(
  file: File,
  additionalData: Record<string, string>,
  options: UploadOptions = {}
): Promise<UploadResponse> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1초
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 [UPLOAD-RETRY] ${file.name} 시도 ${attempt + 1}/${maxRetries}`);
      }

      const result = await uploadWithProgressInternal(file, additionalData, options);

      if (attempt > 0) {
        console.log(`✅ [UPLOAD-RETRY-SUCCESS] ${file.name} ${attempt + 1}번째 시도에서 성공`);
      }

      return result;

    } catch (error) {
      lastError = error as Error;
      const errorMessage = (error as Error).message || '';

      // 네트워크 오류인지 확인
      const isRetriableError =
        errorMessage.includes('network') ||
        errorMessage.includes('네트워크') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('연결') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT');

      // 재시도 불가능한 오류이거나 마지막 시도인 경우
      if (!isRetriableError || attempt === maxRetries - 1) {
        if (attempt === maxRetries - 1 && isRetriableError) {
          console.error(`❌ [UPLOAD-RETRY-FAILED] ${file.name} 최대 재시도 횟수 도달 (${maxRetries}회)`);
        }
        throw error;
      }

      // 지수 백오프 대기 (1초, 2초, 4초)
      const backoffDelay = baseDelay * Math.pow(2, attempt);
      console.log(`⏳ [UPLOAD-RETRY] ${file.name} ${backoffDelay}ms 후 재시도... (${attempt + 1}/${maxRetries - 1})`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw lastError || new Error('Upload failed after retries');
}

/**
 * 내부 업로드 함수 (재시도 없음)
 * XMLHttpRequest 기반 파일 업로드 (진행률 추적)
 * @param file 업로드할 파일
 * @param additionalData 추가 폼 데이터
 * @param options 업로드 옵션 (진행률 콜백 등)
 * @returns Promise<UploadResponse>
 */
function uploadWithProgressInternal(
  file: File,
  additionalData: Record<string, string>,
  options: UploadOptions = {}
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    // 파일 및 추가 데이터 추가
    formData.append('file', file);
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    // 🔍 FormData 내용 출력 (디버깅용)
    console.log(`📋 [FORMDATA-DEBUG] ${file.name} FormData 내용:`, {
      파일명: file.name,
      파일크기: file.size,
      추가데이터: additionalData
    });

    // 업로드 진행률 추적
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && options.onProgress) {
        const progress: UploadProgress = {
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100)
        };
        options.onProgress(progress);

        console.log(`📊 [UPLOAD-PROGRESS] ${file.name}: ${progress.percent}% (${progress.loaded}/${progress.total} bytes)`);
      }
    });

    // 업로드 완료 처리
    xhr.addEventListener('load', () => {
      try {
        const response = JSON.parse(xhr.responseText) as UploadResponse;

        if (xhr.status === 200 && response.success) {
          console.log(`✅ [UPLOAD-SUCCESS] ${file.name} 업로드 완료`);
          options.onSuccess?.(response);
          resolve(response);
        } else {
          const error = new Error(response.message || `HTTP ${xhr.status}: 업로드 실패`);
          console.error(`❌ [UPLOAD-ERROR] ${file.name} 업로드 실패:`, error.message);
          options.onError?.(error);
          reject(error);
        }
      } catch (parseError) {
        // 파싱 실패 시 원본 응답에서 Vercel 페이로드 에러 감지
        const responseText = xhr.responseText || '';
        let errorMessage = `응답 파싱 실패: ${responseText}`;

        // Vercel Function Payload 에러 감지
        if (responseText.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
            responseText.includes('Request Entity Too Large') ||
            responseText.includes('FunctionPayloadTooLargeError')) {
          errorMessage = `파일 크기 초과: 업로드하려는 파일이 너무 큽니다. 파일 수를 줄이거나 이미지 해상도를 낮춰주세요. (제한: 4MB)`;
          console.error(`🚨 [PAYLOAD-TOO-LARGE] ${file.name}: Vercel 페이로드 제한 초과`);
        }

        const error = new Error(errorMessage);
        console.error(`❌ [UPLOAD-PARSE-ERROR] ${file.name}:`, parseError);
        options.onError?.(error);
        reject(error);
      }
    });

    // 네트워크 오류 처리
    xhr.addEventListener('error', () => {
      // XHR 응답 확인 (페이로드 에러가 error 이벤트로 올 수 있음)
      const responseText = xhr.responseText || '';
      let errorMessage = `네트워크 오류: ${file.name} 업로드 중 연결 문제 발생`;

      // Vercel Function Payload 에러 감지
      if (responseText.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
          responseText.includes('Request Entity Too Large') ||
          responseText.includes('FunctionPayloadTooLargeError') ||
          xhr.status === 413) { // HTTP 413 Payload Too Large
        errorMessage = `파일 크기 초과: 업로드하려는 파일이 너무 큽니다. 파일 수를 줄이거나 이미지 해상도를 낮춰주세요. (제한: 4MB)`;
        console.error(`🚨 [PAYLOAD-TOO-LARGE] ${file.name}: Vercel 페이로드 제한 초과 (HTTP ${xhr.status})`);
      } else {
        console.error(`❌ [UPLOAD-NETWORK-ERROR] ${file.name}:`, errorMessage);
      }

      const error = new Error(errorMessage);
      options.onError?.(error);
      reject(error);
    });

    // 업로드 취소 처리
    xhr.addEventListener('abort', () => {
      const error = new Error(`업로드 취소됨: ${file.name}`);
      console.log(`🚫 [UPLOAD-CANCELLED] ${file.name}`);
      options.onError?.(error);
      reject(error);
    });

    // 취소 신호 처리
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    // 요청 시작
    console.log(`🚀 [UPLOAD-START] ${file.name} 업로드 시작 (${file.size} bytes)`);
    xhr.open('POST', '/api/upload-supabase');
    xhr.send(formData);
  });
}

/**
 * 여러 파일 병렬 업로드 (동시 업로드 수 제한)
 * @param files 업로드할 파일들
 * @param additionalDataFactory 각 파일별 추가 데이터 생성 함수
 * @param concurrency 동시 업로드 수 (기본: 3)
 * @param onFileProgress 개별 파일 진행률 콜백
 * @returns Promise<UploadResponse[]>
 */
/**
 * 네트워크 상태 기반 최적 동시성 계산
 */
function getOptimalConcurrency(): number {
  // 브라우저 연결 정보 확인
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  
  if (connection) {
    const { effectiveType, downlink } = connection;
    
    // 네트워크 타입별 최적 동시성
    if (effectiveType === '4g' && downlink > 10) return 8; // 고속 4G
    if (effectiveType === '4g') return 6; // 일반 4G
    if (effectiveType === '3g') return 4; // 3G
    if (effectiveType === '2g') return 2; // 저속 연결
  }
  
  // CPU 코어 기반 fallback (최대 8개로 제한)
  const cores = navigator.hardwareConcurrency || 4;
  return Math.min(Math.max(cores - 1, 3), 8);
}

export async function uploadMultipleWithProgress(
  files: File[],
  additionalDataFactory: (file: File, index: number) => Record<string, string>,
  concurrency?: number,
  onFileProgress?: (fileIndex: number, progress: UploadProgress) => void,
  onFileComplete?: (fileIndex: number, response: UploadResponse) => void,
  onFileError?: (fileIndex: number, error: Error) => void
): Promise<UploadResponse[]> {
  const results: UploadResponse[] = [];
  const errors: Error[] = [];
  
  // 동적 동시성 계산
  const optimalConcurrency = concurrency || getOptimalConcurrency();
  
  console.log(`🔥 [BATCH-UPLOAD] ${files.length}개 파일 병렬 업로드 시작 (동시: ${optimalConcurrency}개)`);
  
  // 병렬 처리를 위한 청크 단위 처리
  for (let i = 0; i < files.length; i += optimalConcurrency) {
    const chunk = files.slice(i, i + optimalConcurrency);
    const chunkPromises = chunk.map(async (file, chunkIndex) => {
      const globalIndex = i + chunkIndex;
      
      try {
        const response = await uploadWithProgress(
          file,
          additionalDataFactory(file, globalIndex),
          {
            onProgress: (progress) => onFileProgress?.(globalIndex, progress),
            onSuccess: (response) => onFileComplete?.(globalIndex, response),
            onError: (error) => onFileError?.(globalIndex, error)
          }
        );
        return { index: globalIndex, response, error: null };
      } catch (error) {
        const uploadError = error instanceof Error ? error : new Error(String(error));
        onFileError?.(globalIndex, uploadError);
        return { index: globalIndex, response: null, error: uploadError };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    
    // 결과 정리
    chunkResults.forEach(({ index, response, error }) => {
      if (response) {
        results[index] = response;
      } else if (error) {
        errors.push(error);
        console.error(`❌ [BATCH-UPLOAD-ERROR] 파일 ${index + 1}/${files.length}: ${error.message}`);
      }
    });
  }
  
  console.log(`📊 [BATCH-UPLOAD-COMPLETE] 완료: ${results.filter(r => r).length}개, 실패: ${errors.length}개`);
  
  return results;
}

/**
 * 이미지 파일 미리보기 생성
 * @param file 이미지 파일
 * @returns Promise<string> blob URL
 */
export function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('이미지 파일이 아닙니다'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('미리보기 생성 실패'));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

/**
 * 파일 크기 포맷팅
 * @param bytes 바이트 크기
 * @returns 포맷된 문자열 (예: "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}