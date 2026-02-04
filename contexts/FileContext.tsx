'use client';

// 🚀 간소화된 FileContext - Zustand 기반 Single Source of Truth
// 📡 Supabase Realtime 실시간 동기화 추가 (2025-01)
import { createContext, useContext, ReactNode, useEffect, useCallback, useRef, useState } from 'react';
import { UploadedFile } from '@/types';
import { usePhotoStore } from '@/hooks/usePhotoStore';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';

// ✅ Zustand 상태 직접 조회를 위한 헬퍼 (race condition 방지)
const getPhotosFromStore = () => usePhotoStore.getState().photos;

// 📡 Realtime 이벤트 타입 (모듈 레벨 상수 - 매 렌더링마다 재생성 방지)
const FILE_REALTIME_EVENT_TYPES: ('INSERT' | 'DELETE')[] = ['INSERT', 'DELETE'];

interface FileContextType {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  refreshFiles: () => Promise<void>;
  addFiles: (files: UploadedFile[]) => void;
  removeFile: (fileId: string) => void;
  loading: boolean;
  businessName: string;
  systemType: string;
  setBusinessInfo: (businessName: string, systemType: string) => void;
  realtimeConnected: boolean; // 🔧 REALTIME-SYNC-FIX: 실시간 연결 상태 노출
}

const FileContext = createContext<FileContextType | undefined>(undefined);

// 📂 파일 경로에서 폴더명 추출 헬퍼
function extractFolderName(filePath: string): string {
  if (!filePath) return '';
  const parts = filePath.split('/');
  // 예: business/사업장명/completion/기본사진/파일명.jpg → 기본사진
  if (parts.length >= 4) {
    return parts[parts.length - 2]; // 파일명 바로 앞 폴더
  }
  return '';
}

interface FileProviderProps {
  children: ReactNode;
}

export function FileProvider({ children }: FileProviderProps) {
  // 🚀 Zustand 상태 사용 (Single Source of Truth)
  const {
    photos: uploadedFiles,
    loading,
    businessName,
    systemType,
    setPhotos: setUploadedFiles,
    addPhotos: rawAddFiles,
    removePhoto: rawRemoveFile,
    loadPhotos: rawRefreshFiles,
    setBusinessInfo: rawSetBusinessInfo,
  } = usePhotoStore();

  // 📡 Realtime 동기화를 위한 상태
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null);
  const recentLocalUpdatesRef = useRef<Set<string>>(new Set()); // 로컬 업데이트 추적 (중복 방지)

  // 🔍 사업장 ID 조회 (businessName 변경 시)
  useEffect(() => {
    const fetchBusinessId = async () => {
      if (!businessName) {
        setCurrentBusinessId(null);
        return;
      }

      try {
        const response = await fetch(`/api/business-list?search=${encodeURIComponent(businessName)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.businesses?.length > 0) {
            const matchedBusiness = data.data.businesses.find(
              (b: any) => b.business_name === businessName
            );
            if (matchedBusiness) {
              setCurrentBusinessId(matchedBusiness.id);
              console.log(`📡 [FILE-REALTIME] 사업장 ID 설정: ${matchedBusiness.id} (${businessName})`);
            }
          }
        }
      } catch (error) {
        console.warn('📡 [FILE-REALTIME] 사업장 ID 조회 실패:', error);
      }
    };

    fetchBusinessId();
  }, [businessName]);

  // 📡 Realtime 이벤트 핸들러
  const handleRealtimeNotification = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    // 현재 보고 있는 사업장과 관련된 이벤트인지 확인
    // ⚠️ DELETE 이벤트는 기본 키(id)만 전송되므로 business_id가 없음
    const recordBusinessId = newRecord?.business_id || oldRecord?.business_id;
    const recordId = newRecord?.id || oldRecord?.id;

    console.log(`📡 [FILE-REALTIME] 이벤트 수신됨:`, {
      eventType,
      recordBusinessId,
      recordId,
      currentBusinessId,
      businessName,
      matches: recordBusinessId === currentBusinessId
    });

    // DELETE 이벤트 특별 처리: business_id가 없으므로 로컬 배열에서 확인
    // ✅ FIX: Zustand 상태를 직접 조회 (클로저 stale 문제 방지)
    if (eventType === 'DELETE') {
      const currentPhotos = getPhotosFromStore();
      const existsLocally = currentPhotos.some(f => f.id === recordId);
      if (!existsLocally) {
        console.log(`📡 [FILE-REALTIME] DELETE 무시 - 로컬에 없는 파일: ${recordId}`);
        return;
      }
      // 로컬에 있으면 삭제 진행 (아래 switch 문으로)
    } else {
      // INSERT/UPDATE: business_id로 필터링
      if (!currentBusinessId || recordBusinessId !== currentBusinessId) {
        console.log(`📡 [FILE-REALTIME] 다른 사업장 이벤트 무시 - current: ${currentBusinessId}, record: ${recordBusinessId}`);
        return;
      }
    }

    // 로컬에서 방금 처리한 업데이트인지 확인 (낙관적 업데이트 중복 방지)
    if (recentLocalUpdatesRef.current.has(recordId)) {
      console.log(`📡 [FILE-REALTIME] 로컬 업데이트 중복 무시: ${recordId}`);
      recentLocalUpdatesRef.current.delete(recordId);
      return;
    }

    console.log(`📡 [FILE-REALTIME] ${eventType} 이벤트 수신:`, {
      recordId,
      filename: newRecord?.original_filename || oldRecord?.original_filename
    });

    switch (eventType) {
      case 'INSERT':
        // 새 파일 추가
        if (newRecord && newRecord.file_path) {
          // file_path에서 직접 public URL 생성 (DB에 public_url 컬럼이 없음)
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/facility-files/${newRecord.file_path}`;

          const newFile: UploadedFile = {
            id: newRecord.id,
            name: newRecord.filename || newRecord.original_filename,
            originalName: newRecord.original_filename,
            mimeType: newRecord.mime_type || 'application/octet-stream',
            size: newRecord.file_size || 0,
            createdTime: newRecord.created_at,
            webViewLink: publicUrl,
            downloadUrl: publicUrl,
            thumbnailUrl: publicUrl,
            folderName: extractFolderName(newRecord.file_path),
            uploadStatus: newRecord.upload_status || 'completed',
            facilityInfo: newRecord.facility_info,
            filePath: newRecord.file_path,
          };

          // ✅ FIX: Zustand 상태를 직접 조회 (클로저 stale 문제 방지)
          const currentPhotos = getPhotosFromStore();
          const exists = currentPhotos.some(f => f.id === newFile.id);
          if (!exists) {
            rawAddFiles([newFile]);
            console.log(`📡 [FILE-REALTIME] 새 파일 추가됨: ${newFile.originalName}`, { url: publicUrl });
          } else {
            console.log(`📡 [FILE-REALTIME] 중복 파일 무시 (이미 존재): ${newFile.originalName}`);
          }
        }
        break;

      case 'DELETE':
        // 파일 삭제
        if (oldRecord) {
          rawRemoveFile(oldRecord.id);
          console.log(`📡 [FILE-REALTIME] 파일 삭제됨: ${oldRecord.original_filename}`);
        }
        break;

      case 'UPDATE':
        // 파일 메타데이터 업데이트 (필요 시)
        console.log(`📡 [FILE-REALTIME] 파일 업데이트: ${newRecord?.original_filename}`);
        break;
    }
  // ✅ uploadedFiles 제거: getPhotosFromStore()로 직접 조회하므로 의존성 불필요
  }, [currentBusinessId, rawAddFiles, rawRemoveFile]);

  // 📡 Supabase Realtime 구독
  // ✅ FIX: businessName만으로 즉시 연결 (currentBusinessId 대기 불필요)
  // 🔧 REALTIME-SYNC-FIX: Phase 1-1 - 즉시 연결로 초기 이벤트 손실 방지
  const { isConnected: realtimeConnected } = useSupabaseRealtime({
    tableName: 'uploaded_files',
    eventTypes: FILE_REALTIME_EVENT_TYPES, // 모듈 레벨 상수 사용 (재생성 방지)
    autoConnect: !!businessName, // businessName만 확인 (즉시 연결)
    onNotification: handleRealtimeNotification,
    onConnect: () => {
      console.log(`📡 [FILE-REALTIME] Realtime 연결됨 - 초기 동기화 시작: ${businessName}`);
      // 🔧 REALTIME-SYNC-FIX: Phase 1-3 - 연결 시 초기 동기화
      rawRefreshFiles();
    },
    onDisconnect: () => {
      console.log(`📡 [FILE-REALTIME] Realtime 연결 해제`);
    },
  });

  // Legacy 호환성을 위한 래퍼 함수들 (로컬 업데이트 추적 포함)
  const addFiles = (files: UploadedFile[]) => {
    // 로컬 업데이트 추적 (Realtime 중복 방지)
    files.forEach(file => {
      if (file.id) {
        recentLocalUpdatesRef.current.add(file.id);
        // 5초 후 자동 제거
        setTimeout(() => recentLocalUpdatesRef.current.delete(file.id), 5000);
      }
    });
    rawAddFiles(files);
    console.log(`📎 [FILE-CONTEXT] addFiles: ${files.length}개 추가 (로컬)`);
  };

  const removeFile = (fileId: string) => {
    // 로컬 업데이트 추적 (Realtime 중복 방지)
    recentLocalUpdatesRef.current.add(fileId);
    setTimeout(() => recentLocalUpdatesRef.current.delete(fileId), 5000);

    rawRemoveFile(fileId);
    console.log(`🗑️ [FILE-CONTEXT] removeFile: ${fileId} 제거 (로컬)`);
  };

  const refreshFiles = async () => {
    console.log(`🔄 [FILE-CONTEXT] refreshFiles 호출`);
    await rawRefreshFiles();
  };

  const setBusinessInfo = (name: string, type: string) => {
    rawSetBusinessInfo(name, type);
    console.log(`🏢 [FILE-CONTEXT] setBusinessInfo: ${name}, ${type}`);
  };

  const value: FileContextType = {
    uploadedFiles,
    setUploadedFiles,
    refreshFiles,
    addFiles,
    removeFile,
    loading,
    businessName,
    systemType,
    setBusinessInfo,
    realtimeConnected, // 🔧 REALTIME-SYNC-FIX: 실시간 연결 상태 노출
  };

  return (
    <FileContext.Provider value={value}>
      {children}
    </FileContext.Provider>
  );
}

export function useFileContext() {
  const context = useContext(FileContext);
  if (context === undefined) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
}