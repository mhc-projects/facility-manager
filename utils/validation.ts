// utils/validation.ts
import { CONSTANTS } from '@/lib/system-config';

// 파일 검증
export function validateFile(file: File): { valid: boolean; error?: string } {
  // 파일 크기 검증
  if (file.size > CONSTANTS.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `파일 크기가 ${CONSTANTS.MAX_FILE_SIZE / 1024 / 1024}MB를 초과합니다.`
    };
  }

  // 파일 타입 검증
  if (!CONSTANTS.SUPPORTED_FILE_TYPES.includes(file.type as any)) {
    return {
      valid: false,
      error: '지원하지 않는 파일 형식입니다. 이미지 파일만 업로드 가능합니다.'
    };
  }

  return { valid: true };
}

// 다중 파일 검증
export function validateFiles(files: File[]): { valid: boolean; error?: string } {
  if (files.length === 0) {
    return { valid: false, error: '파일을 선택해주세요.' };
  }

  if (files.length > CONSTANTS.MAX_FILES_PER_UPLOAD) {
    return {
      valid: false,
      error: `최대 ${CONSTANTS.MAX_FILES_PER_UPLOAD}개 파일까지 업로드 가능합니다.`
    };
  }

  for (const file of files) {
    const fileValidation = validateFile(file);
    if (!fileValidation.valid) {
      return {
        valid: false,
        error: `${file.name}: ${fileValidation.error}`
      };
    }
  }

  return { valid: true };
}

// 사업장 이름 검증
export function validateBusinessName(businessName: string): { valid: boolean; error?: string } {
  if (!businessName || businessName.trim().length === 0) {
    return { valid: false, error: '사업장명을 입력해주세요.' };
  }

  if (businessName.trim().length < 2) {
    return { valid: false, error: '사업장명은 2자 이상이어야 합니다.' };
  }

  return { valid: true };
}

// 연락처 형식 검증 및 정리
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^\d]/g, '');
  
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  } else if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  
  return phone; // 형식이 맞지 않으면 원본 반환
}

// 파일명 정리 (특수문자 제거)
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\:*?"<>|]/g, '_');
}

// 날짜 형식 생성 (YYYY-MM-DD) - 한국 시간 기준
export function getDateString(): string {
  return new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\./g, '-').replace(/ /g, '').slice(0, -1); // 2024.01.01 → 2024-01-01
}

// 시간 형식 생성 (YYYY-MM-DD HH:mm:ss) - 한국 시간 기준
export function getTimestamp(): string {
  return new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// 한국 날짜/시간 형식
export function getKoreanDateTime(): string {
  return new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// 한국 날짜만 (YYYY-MM-DD)
export function getKoreanDate(): string {
  return new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\./g, '-').replace(/ /g, '').slice(0, -1);
}

// 파일 크기를 읽기 쉬운 형식으로 변환
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 에러 메시지 정리
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

// URL 안전한 문자열 생성
export function createSafeUrl(text: string): string {
  return encodeURIComponent(text.trim());
}

// 콘솔 로그 포맷터 (개발용) - 한국 시간 기준
export function logWithTimestamp(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
  const timestamp = new Date().toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false
  });
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

// 비용 변경 데이터 검증 (useCostChangeLogger용)
export function validateCostChange(params: {
  type: string;
  action: string;
  oldValue?: any;
  newValue?: any;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 비용 타입 검증
  const validTypes = ['operating_cost', 'survey_fee', 'as_cost', 'custom_cost'];
  if (!validTypes.includes(params.type)) {
    errors.push(`Invalid cost type: ${params.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // 액션 검증
  const validActions = ['added', 'updated', 'deleted'];
  if (!validActions.includes(params.action)) {
    errors.push(`Invalid action: ${params.action}. Must be one of: ${validActions.join(', ')}`);
  }

  // 액션별 값 검증
  if (params.action === 'added' || params.action === 'updated') {
    if (params.newValue === undefined || params.newValue === null) {
      errors.push('newValue is required for added/updated actions');
    }
  }

  if (params.action === 'updated' || params.action === 'deleted') {
    if (params.oldValue === undefined || params.oldValue === null) {
      errors.push('oldValue is required for updated/deleted actions');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}