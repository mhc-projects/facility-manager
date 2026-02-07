// hooks/useOptimisticUpload.ts
// Optimistic UI를 위한 업로드 상태 관리 훅

import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadWithProgress, uploadMultipleWithProgress, createImagePreview, UploadProgress } from '@/utils/upload-with-progress';
import { uploadToSupabaseStorage } from '@/utils/supabase-direct-upload';
import { useOptimisticUpdates } from '@/utils/optimistic-updates';

export interface OptimisticPhoto {
  id: string; // temp-${timestamp}-${random}
  status: 'preparing' | 'uploading' | 'uploaded' | 'error' | 'cancelled' | 'duplicate';
  progress: number; // 0-100
  file: File;
  localPreview?: string; // data URL or blob URL
  uploadedData?: any; // 서버에서 반환된 업로드 결과
  error?: string;
  retryCount: number;
  startTime: number;
  endTime?: number;
  abortController?: AbortController;
  duplicateInfo?: {
    existingFile: string;
    uploadDate: string;
    hash: string;
  };
}

export interface UploadQueueStats {
  total: number;
  completed: number;
  uploading: number;
  pending: number;
  failed: number;
  cancelled: number;
  duplicates: number;
}

interface UseOptimisticUploadOptions {
  maxConcurrency?: number; // 동시 업로드 수 (기본: 3)
  maxRetries?: number; // 최대 재시도 횟수 (기본: 2)
  autoRetry?: boolean; // 자동 재시도 여부 (기본: false)
}

export function useOptimisticUpload(options: UseOptimisticUploadOptions = {}) {
  const {
    maxConcurrency = 3,
    maxRetries = 2,
    autoRetry = false
  } = options;

  const [photos, setPhotos] = useState<OptimisticPhoto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<OptimisticPhoto[]>([]);
  const processingRef = useRef<Set<string>>(new Set());

  // 🎯 FIX: 마지막 성공 업로드 카운트 추적 (큐 클리어 후에도 유지)
  const lastSuccessCountRef = useRef<number>(0);
  const lastTotalCountRef = useRef<number>(0);
  
  // 🚀 ENHANCED: 전역 낙관적 업데이트 시스템 통합
  const {
    data: globalPhotos,
    createOptimistic,
    updateOptimistic,
    isPending: isGlobalPending,
    getPendingCount
  } = useOptimisticUpdates<OptimisticPhoto>(photos);

  // 🎯 AUTO-DISMISS: 모든 업로드 완료 후 1초 뒤 자동 제거
  useEffect(() => {
    const completedPhotos = photos.filter(p => p.status === 'uploaded');
    const activePhotos = photos.filter(p =>
      p.status === 'preparing' ||
      p.status === 'uploading'
    );

    // 완료된 파일이 없거나, 아직 업로드 중인 파일이 있으면 대기
    if (completedPhotos.length === 0 || activePhotos.length > 0) {
      return;
    }

    // 모든 업로드가 완료된 경우에만 1초 후 자동 제거
    console.log(`⏱️ [AUTO-DISMISS] 모든 업로드 완료 (${completedPhotos.length}개), 1초 후 자동 제거 예약`);

    const timer = setTimeout(() => {
      console.log(`🗑️ [AUTO-DISMISS] ${completedPhotos.length}개 파일 일괄 자동 제거`);

      // 모든 미리보기 URL 정리
      completedPhotos.forEach(photo => {
        if (photo.localPreview?.startsWith('blob:')) {
          URL.revokeObjectURL(photo.localPreview);
        }
      });

      // 모든 완료된 파일 제거
      const completedIds = new Set(completedPhotos.map(p => p.id));
      setPhotos(prev => prev.filter(p => !completedIds.has(p.id)));
      queueRef.current = queueRef.current.filter(p => !completedIds.has(p.id));
      completedIds.forEach(id => processingRef.current.delete(id));
    }, 1000);

    return () => clearTimeout(timer);
  }, [photos]);

  // 고유 ID 생성
  const generateId = useCallback(() => {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // 큐 통계 계산
  const getQueueStats = useCallback((): UploadQueueStats => {
    const total = photos.length;
    const completed = photos.filter(p => p.status === 'uploaded').length;
    const uploading = photos.filter(p => p.status === 'uploading').length;
    const pending = photos.filter(p => p.status === 'preparing').length;
    const failed = photos.filter(p => p.status === 'error').length;
    const cancelled = photos.filter(p => p.status === 'cancelled').length;
    const duplicates = photos.filter(p => p.status === 'duplicate').length;

    return { total, completed, uploading, pending, failed, cancelled, duplicates };
  }, [photos]);

  // 사진 미리보기 생성
  const createPreview = useCallback(async (file: File): Promise<string | undefined> => {
    try {
      return await createImagePreview(file);
    } catch (error) {
      console.warn(`⚠️ [PREVIEW] 미리보기 생성 실패: ${file.name}`, error);
      return undefined;
    }
  }, []);

  // 파일 추가 (즉시 UI에 표시) - 🚀 ENHANCED: 초고속 반응성
  const addFiles = useCallback(async (
    files: File[],
    additionalDataFactory: (file: File, index: number) => Record<string, string>
  ) => {
    console.log(`📤 [UPLOAD-START] ${files.length}개 파일 업로드 시작`);

    // 🎯 FIX: 새 업로드 시작 시 이전 성공 카운트 초기화
    lastSuccessCountRef.current = 0;
    lastTotalCountRef.current = 0;

    const newPhotos: OptimisticPhoto[] = [];
    
    // 🚀 1단계: 파일 선택 즉시 플레이스홀더로 UI 업데이트 (0ms 지연)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = generateId();
      
      const optimisticPhoto: OptimisticPhoto = {
        id,
        status: 'preparing',
        progress: 0,
        file,
        localPreview: undefined, // 미리보기는 백그라운드에서 생성
        retryCount: 0,
        startTime: Date.now(),
        abortController: new AbortController()
      };
      
      newPhotos.push(optimisticPhoto);
    }

    // UI 즉시 업데이트 (동기적으로)
    setPhotos(prev => [...prev, ...newPhotos]);
    queueRef.current.push(...newPhotos);
    
    console.log(`⚡ [INSTANT-UI] ${files.length}개 파일 0ms 지연으로 UI 반영 완료`);
    
    // 🚀 2단계: 백그라운드에서 미리보기 생성 (병렬 처리)
    const previewPromises = newPhotos.map(async (photo) => {
      try {
        const localPreview = await createPreview(photo.file);
        updatePhoto(photo.id, { localPreview });
        console.log(`🖼️ [PREVIEW-READY] ${photo.file.name} 미리보기 생성 완료`);
      } catch (error) {
        console.warn(`⚠️ [PREVIEW-FAIL] ${photo.file.name} 미리보기 생성 실패:`, error);
      }
    });
    
    // 미리보기는 백그라운드에서 처리 (UI 블로킹 없음)
    Promise.all(previewPromises).then(() => {
      console.log(`🎨 [ALL-PREVIEWS] 모든 미리보기 생성 완료`);
    });
    
    // 🚀 3단계: 업로드 프로세스 즉시 시작 (미리보기 대기 없음)
    setTimeout(() => {
      processQueue(additionalDataFactory);
      console.log(`🚀 [QUEUE-START] 업로드 큐 처리 시작 (대기시간 최소화)`);
    }, 10); // 10ms 후 시작으로 UI 렌더링 완료 후 처리
    
    return newPhotos.map(p => p.id);
  }, [generateId, createPreview]);

  // 큐 처리 (병렬 업로드)
  const processQueue = useCallback(async (
    additionalDataFactory: (file: File, index: number) => Record<string, string>
  ) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    console.log(`🔄 [QUEUE] 큐 처리 시작, 대기중: ${queueRef.current.length}개`);
    
    // 준비 상태인 파일들만 처리
    const readyPhotos = queueRef.current.filter(p => 
      p.status === 'preparing' && !processingRef.current.has(p.id)
    );
    
    if (readyPhotos.length === 0) {
      setIsProcessing(false);
      return;
    }
    
    // 🚀 ENHANCED: 동시 업로드 제한 및 즉시 상태 반영
    const batchSize = Math.min(readyPhotos.length, maxConcurrency);
    const batch = readyPhotos.slice(0, batchSize);
    
    console.log(`⚡ [HYPER-BATCH] ${batch.length}개 파일 초고속 병렬 업로드 시작`);
    
    // 🚀 배치 상태를 즉시 업로드 중으로 변경 (UI 반응성 극대화)
    batch.forEach((photo, index) => {
      processingRef.current.add(photo.id);
      updatePhoto(photo.id, { 
        status: 'uploading', 
        progress: 1, // 0%가 아닌 1%로 시작해서 시작감 제공
        startTime: Date.now() // 업로드 시작 시간 갱신
      });
      
      // 각 파일마다 약간의 시차를 두어 업로드 시작감을 높임
      setTimeout(() => {
        updatePhoto(photo.id, { progress: 2 + index });
      }, 50 * index);
    });
    
    // 병렬 업로드 실행
    const uploadPromises = batch.map(async (photo, index) => {
      try {
        // additionalDataFactory에서 업로드 옵션 추출
        const additionalData = additionalDataFactory(photo.file, index);

        console.log(`📋 [OPTIMISTIC-UPLOAD] additionalData 확인:`, {
          파일: photo.file.name,
          카테고리: additionalData.category,
          배출구번호: additionalData.outletNumber
        });

        // Supabase Storage 직접 업로드 (Progressive Compression 자동 적용)

        // 🔧 fileType 결정 로직 (기본사진은 항상 'basic', 시설사진만 'discharge'/'prevention')
        let fileType: 'basic' | 'discharge' | 'prevention' = 'basic';
        if (additionalData.category === 'discharge' || additionalData.category === 'prevention') {
          fileType = additionalData.category;
        }

        const response = await uploadToSupabaseStorage(
          photo.file,
          {
            businessName: additionalData.businessName,
            systemType: (additionalData.systemType as 'presurvey' | 'completion') || 'completion',
            fileType: fileType, // 🔧 수정: 카테고리가 아닌 올바른 fileType 사용
            facilityInfo: additionalData.facilityInfo,
            facilityId: additionalData.facilityId,
            facilityNumber: additionalData.facilityNumber,
            outletNumber: additionalData.outletNumber, // 🆕 배출구 번호 전달
            onProgress: (percent) => {
              updatePhoto(photo.id, {
                progress: percent
              });
            }
          }
        );

        // 응답 형식을 기존 시스템과 호환되도록 변환
        // ✅ FIX: fallback 객체에도 모든 URL 필드 포함 (ghost 방지)
        const compatibleResponse = {
          success: response.success,
          files: response.success && response.fileData ? [response.fileData] :
                 response.success ? [{
            id: response.fileId,
            name: photo.file.name,
            originalName: photo.file.name,
            mimeType: photo.file.type || 'application/octet-stream',
            size: photo.file.size,
            createdTime: new Date().toISOString(),
            publicUrl: response.publicUrl,
            webViewLink: response.publicUrl,
            downloadUrl: response.publicUrl,
            thumbnailUrl: response.publicUrl,
            filePath: response.filePath,
            folderName: response.filePath?.split('/').slice(-2, -1)[0] || '',
            uploadStatus: 'completed',
            justUploaded: true
          }] : [],
          error: response.error
        };
        
        // 🚀 ENHANCED: 즉시 UI 업데이트 + 백그라운드 동기화

        // 1단계: 즉시 업로드 완료 상태로 UI 업데이트
        updatePhoto(photo.id, {
          status: 'uploaded',
          progress: 100,
          uploadedData: compatibleResponse,
          endTime: Date.now(),
          error: undefined
        });

        console.log(`⚡ [INSTANT-UI-UPDATE] ${photo.file.name} Supabase 직접 업로드 완료`);

        // 2단계: 백그라운드에서 FileContext 동기화
        if (compatibleResponse.files && compatibleResponse.files.length > 0) {
          // 즉시 동기화 시도
          try {
            const fileContextEvent = new CustomEvent('progressiveUploadComplete', {
              detail: {
                uploadedFiles: compatibleResponse.files,
                photoId: photo.id,
                instant: true // 즉시 처리 플래그
              }
            });
            window.dispatchEvent(fileContextEvent);
            console.log(`🔄 [BACKGROUND-SYNC] ${photo.file.name} 백그라운드 동기화 이벤트 발송`);
          } catch (error) {
            console.warn('⚠️ [BACKGROUND-SYNC] 백그라운드 동기화 실패:', error);
          }

          // 3단계: 안전을 위한 지연된 재동기화 (UI는 이미 업데이트됨)
          setTimeout(() => {
            try {
              const retryEvent = new CustomEvent('progressiveUploadComplete', {
                detail: {
                  uploadedFiles: compatibleResponse.files,
                  photoId: photo.id,
                  retry: true
                }
              });
              window.dispatchEvent(retryEvent);
              console.log(`🔄 [DELAYED-SYNC] ${photo.file.name} 지연 동기화 보장`);
            } catch (retryError) {
              console.warn('⚠️ [DELAYED-SYNC] 지연 동기화 실패:', retryError);
            }
          }, 1000); // 3초에서 1초로 단축
        }

        return { photo, response: compatibleResponse, error: null };
        
      } catch (error) {
        const uploadError = error instanceof Error ? error : new Error(String(error));
        
        // 응답 파싱하여 중복 파일 확인
        let isDuplicate = false;
        let duplicateInfo = null;
        
        try {
          if (uploadError.message.includes('동일한 파일이')) {
            const response = await fetch('/api/upload-supabase', {
              method: 'POST', 
              body: new FormData() // 임시로 빈 폼데이터
            });
            const result = await response.json();
            if (result.isDuplicate) {
              isDuplicate = true;
              duplicateInfo = result.duplicateInfo;
            }
          }
        } catch (parseError) {
          // 파싱 실패 시 일반 에러로 처리
        }
        
        if (isDuplicate) {
          // 중복 파일 상태 업데이트
          updatePhoto(photo.id, {
            status: 'duplicate',
            error: undefined,
            duplicateInfo,
            endTime: Date.now()
          });
          
          console.log(`🔄 [DUPLICATE] ${photo.file.name} 중복 파일 감지`);
        } else {
          // 일반 에러 상태 업데이트
          updatePhoto(photo.id, {
            status: 'error',
            error: uploadError.message,
            endTime: Date.now()
          });
          
          console.error(`❌ [UPLOAD-ERROR] ${photo.file.name}:`, uploadError.message);
        }
        
        // 자동 재시도 로직
        if (autoRetry && photo.retryCount < maxRetries) {
          setTimeout(() => {
            retryUpload(photo.id, additionalDataFactory);
          }, Math.pow(2, photo.retryCount) * 1000); // 지수 백오프
        }
        
        return { photo, response: null, error: uploadError };
      } finally {
        processingRef.current.delete(photo.id);
        // 큐에서 제거
        queueRef.current = queueRef.current.filter(p => p.id !== photo.id);
      }
    });
    
    await Promise.all(uploadPromises);
    
    // 🚀 ENHANCED: 다음 배치 즉시 처리 (대기시간 단축)
    if (queueRef.current.length > 0) {
      // 100ms에서 50ms로 단축하여 대기시간 최소화
      setTimeout(() => processQueue(additionalDataFactory), 50);
    } else {
      setIsProcessing(false);
      console.log(`✅ [UPLOAD-COMPLETE] 모든 업로드 완료`);

      // ✅ FIX: 업로드 완료 후 검증 및 정리
      setTimeout(async () => {
        const uploadedCount = photos.filter(p => p.status === 'uploaded').length;
        console.log(`🔍 [VERIFY] ${uploadedCount}개 파일 업로드 검증 시작`);

        // 업로드 검증: 실제로 페이지를 새로고침해서 서버에서 파일을 조회
        // 조회된 파일만 진짜 성공으로 간주
        try {
          // 부모 컴포넌트의 loadUploadedFiles를 호출하도록 이벤트 발생
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('verify-uploads'));
          }
        } catch (error) {
          console.error('업로드 검증 실패:', error);
        }

        console.log(`🧹 [CLEANUP] 상태 정리 시작`);

        // smartUploadQueue 초기화 (상태바 자동 숨김)
        try {
          const { smartUploadQueue } = require('@/utils/smart-upload-queue');
          smartUploadQueue.clearQueue();
          console.log(`✅ [QUEUE-CLEAR] 상태바 초기화 완료`);
        } catch (error) {
          console.error(`❌ [QUEUE-CLEAR-ERROR]`, error);
        }

        // 완료된 파일 정리 (2초 후)
        setTimeout(() => {
          setPhotos(prev => prev.filter(p => p.status !== 'uploaded'));
          console.log(`✅ [CLEANUP-COMPLETE] 완료된 파일 UI에서 제거`);
        }, 2000);
      }, 100);
    }
  }, [isProcessing, maxConcurrency, maxRetries, autoRetry]);

  // 개별 사진 상태 업데이트
  const updatePhoto = useCallback((id: string, updates: Partial<OptimisticPhoto>) => {
    setPhotos(prev => prev.map(photo => 
      photo.id === id ? { ...photo, ...updates } : photo
    ));
  }, []);

  // 업로드 재시도
  const retryUpload = useCallback((id: string, additionalDataFactory: (file: File, index: number) => Record<string, string>) => {
    const photo = photos.find(p => p.id === id);
    if (!photo || photo.retryCount >= maxRetries) return;
    
    console.log(`🔄 [RETRY] ${photo.file.name} 재시도 (${photo.retryCount + 1}/${maxRetries})`);
    
    updatePhoto(id, {
      status: 'preparing',
      progress: 0,
      error: undefined,
      retryCount: photo.retryCount + 1,
      abortController: new AbortController()
    });
    
    queueRef.current.push(photo);
    
    // 🚀 FIX: 재시도 시 큐 프로세싱 시작
    processQueue(additionalDataFactory);
  }, [photos, maxRetries, updatePhoto, processQueue]);

  // 업로드 취소
  const cancelUpload = useCallback((id: string) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    
    console.log(`🚫 [CANCEL] ${photo.file.name} 업로드 취소`);
    
    photo.abortController?.abort();
    updatePhoto(id, { status: 'cancelled' });
    
    // 큐에서 제거
    queueRef.current = queueRef.current.filter(p => p.id !== id);
    processingRef.current.delete(id);
  }, [photos, updatePhoto]);

  // 완료된 업로드 정리
  const clearCompleted = useCallback(() => {
    setPhotos(prev => prev.filter(photo => 
      photo.status !== 'uploaded' && photo.status !== 'cancelled'
    ));
  }, []);

  // 모든 업로드 취소
  const cancelAll = useCallback(() => {
    photos.forEach(photo => {
      if (photo.status === 'uploading' || photo.status === 'preparing') {
        photo.abortController?.abort();
      }
    });
    
    setPhotos([]);
    queueRef.current = [];
    processingRef.current.clear();
    setIsProcessing(false);
  }, [photos]);

  // 강제 업로드 (중복 파일을 무시하고 업로드)
  const forceUpload = useCallback(async (id: string, additionalDataFactory: (file: File, index: number) => Record<string, string>) => {
    const photo = photos.find(p => p.id === id);
    if (!photo || photo.status !== 'duplicate') return;
    
    console.log(`🚀 [FORCE-UPLOAD] ${photo.file.name} 강제 업로드 시작`);
    
    updatePhoto(id, {
      status: 'uploading',
      progress: 0,
      error: undefined,
      duplicateInfo: undefined,
      abortController: new AbortController()
    });
    
    try {
      const response = await uploadWithProgress(
        photo.file,
        { ...additionalDataFactory(photo.file, 0), forceUpload: 'true' },
        {
          onProgress: (progress) => {
            updatePhoto(id, { progress: progress.percent });
          },
          signal: photo.abortController?.signal
        }
      );
      
      // 성공 시 상태 업데이트
      updatePhoto(id, {
        status: 'uploaded',
        progress: 100,
        uploadedData: response,
        endTime: Date.now()
      });
      
      console.log(`✅ [FORCE-UPLOAD-SUCCESS] ${photo.file.name} 강제 업로드 완료`);
    } catch (error) {
      const uploadError = error instanceof Error ? error : new Error(String(error));
      
      updatePhoto(id, {
        status: 'error',
        error: uploadError.message,
        endTime: Date.now()
      });
      
      console.error(`❌ [FORCE-UPLOAD-ERROR] ${photo.file.name}:`, uploadError.message);
    }
  }, [photos, updatePhoto]);

  // 즉시 삭제 (UI에서 제거)
  const removePhoto = useCallback((id: string) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;
    
    console.log(`🗑️ [REMOVE] ${photo.file.name} UI에서 즉시 제거`);
    
    // 업로드 중이면 취소
    if (photo.status === 'uploading') {
      photo.abortController?.abort();
    }
    
    // 미리보기 URL 정리
    if (photo.localPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(photo.localPreview);
    }
    
    setPhotos(prev => prev.filter(p => p.id !== id));
    queueRef.current = queueRef.current.filter(p => p.id !== id);
    processingRef.current.delete(id);
  }, [photos]);

  // SmartFloatingProgress를 위한 데이터 제공
  const getSmartProgressData = useCallback(() => {
    const stats = getQueueStats();
    const uploadingPhoto = photos.find(p => p.status === 'uploading');
    const failedPhotos = photos.filter(p => p.status === 'error');
    const duplicatePhotos = photos.filter(p => p.status === 'duplicate');

    // 🎯 FIX: 성공 카운트 추적 업데이트 (큐 클리어 전)
    if (stats.completed > 0) {
      lastSuccessCountRef.current = stats.completed;
      lastTotalCountRef.current = stats.total;
    }

    // 🎯 FIX: 큐가 비어있지만 최근에 성공한 업로드가 있으면 마지막 성공 카운트 사용
    const displayTotal = stats.total > 0 ? stats.total : lastTotalCountRef.current;
    const displayCompleted = stats.total > 0 ? stats.completed : lastSuccessCountRef.current;

    const overallProgress = displayTotal > 0
      ? Math.round((displayCompleted / displayTotal) * 100)
      : 0;

    // 에러 상세 정보 수집
    const detailedErrors = failedPhotos.map(photo => ({
      fileName: photo.file.name,
      error: photo.error || '알 수 없는 오류',
      timestamp: photo.endTime || Date.now()
    }));

    // 진행 멈춤 감지 (5초 이상 진행이 없는 경우)
    const stuckPhoto = photos.find(p =>
      p.status === 'uploading' &&
      Date.now() - p.startTime > 5000 &&
      p.progress < 100
    );

    // 일반적인 에러 메시지
    let errorMessage = '';
    if (failedPhotos.length > 0) {
      errorMessage = failedPhotos.length === 1
        ? failedPhotos[0].error || '업로드 실패'
        : `${failedPhotos.length}개 파일 업로드 실패`;
    }

    // 🎯 isVisible 로직 수정: 업로드 중이거나 대기 중인 파일이 있을 때만 표시
    // 모든 파일이 완료(uploaded)되면 isVisible을 false로 설정하여 자동 숨김 트리거
    const hasActiveUploads = stats.uploading > 0 || stats.pending > 0;
    const shouldBeVisible = isProcessing || hasActiveUploads || (stats.total > 0 && stats.completed < stats.total);

    return {
      isVisible: shouldBeVisible,
      totalFiles: displayTotal,
      completedFiles: displayCompleted,
      currentFileName: uploadingPhoto?.file.name,
      overallProgress: overallProgress,
      failedFiles: stats.failed,
      errorMessage: errorMessage,
      isStuck: !!stuckPhoto,
      stuckReason: stuckPhoto ? `${stuckPhoto.file.name} 업로드가 지연되고 있습니다` : undefined,
      detailedErrors: detailedErrors
    };
  }, [photos, isProcessing, getQueueStats]);

  return {
    photos,
    queueStats: getQueueStats(),
    isProcessing,
    addFiles,
    retryUpload,
    cancelUpload,
    removePhoto,
    clearCompleted,
    cancelAll,
    forceUpload,
    // SmartFloatingProgress를 위한 데이터
    getSmartProgressData
  };
}