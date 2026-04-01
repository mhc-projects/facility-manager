'use client';

// VERSION: 2025-09-11-12-15-CLEAN-v9 🧹
// 🧹 디버그 로그 정리 완료 - capacity 기반 시설번호 매칭 적용
// LAST MODIFIED: 2025-09-11T12:15:00Z

import React, { useState, useCallback, useEffect, useRef, forwardRef, startTransition, useMemo } from 'react';
import { Camera, Upload, Factory, Shield, Building2, AlertCircle, Eye, Download, Trash2, RefreshCw, X, Zap, Router, Cpu, Plus, Grid, List, ChevronLeft, ChevronRight, Archive } from 'lucide-react';
import { FacilitiesData, Facility, UploadedFile, SystemPhase } from '@/types';
import { createFacilityPhotoTracker, FacilityPhotoInfo, FacilityPhoto } from '@/utils/facility-photo-tracker';
import LazyImage from '@/components/ui/LazyImage';
import { useToast } from '@/contexts/ToastContext';
import { useFileContext } from '@/contexts/FileContext';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { deletedPhotoIdsAtom, deletePhotoAtom, undeletePhotoAtom, clearDeletedPhotosAtom } from '../stores/photo-atoms';
import { getPhaseConfig, mapPhaseToSystemType } from '@/lib/system-config';
import { useOptimisticUpload } from '@/hooks/useOptimisticUpload';
import UploadQueue from '@/components/ui/UploadQueue';
import SmartFloatingProgress from '@/components/ui/SmartFloatingProgress';
import { smartUploadQueue } from '@/utils/smart-upload-queue';
import PhotoCaptionInput from '@/components/PhotoCaptionInput';

interface ImprovedFacilityPhotoSectionProps {
  businessName: string;
  facilities: FacilitiesData | null;
  facilityNumbering?: any; // 🎯 대기필증 관리 시설번호 매핑
  currentPhase: SystemPhase | string;
}

type ViewMode = 'grid' | 'list';

// Performance-optimized animated counter component
function AnimatedCounter({ value, duration = 1000, className = "" }: { 
  value: number; 
  duration?: number; 
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const startValueRef = useRef<number>(0);

  useEffect(() => {
    console.log(`🎬 [ANIMATED-COUNTER] value 변경 감지:`, { value, displayValue, isEqual: value === displayValue });
    if (value === displayValue) return;

    console.log(`🎬 [ANIMATED-COUNTER] 애니메이션 시작:`, { from: displayValue, to: value });
    setIsAnimating(true);
    startValueRef.current = displayValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current!;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function for natural animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(
        startValueRef.current + (value - startValueRef.current) * easeOutCubic
      );

      setDisplayValue(currentValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration, displayValue]);

  return (
    <span className={`${className} ${isAnimating ? 'text-opacity-90' : ''} transition-opacity duration-200`}>
      {displayValue}
    </span>
  );
}

// Helper functions for user-friendly messages
const getUserFriendlyErrorMessage = (serverMessage: string): string => {
  if (serverMessage.includes('파일명: undefined') || serverMessage.includes('files')) {
    return '파일을 읽을 수 없습니다. 파일을 다시 선택해주세요.';
  }
  if (serverMessage.includes('network') || serverMessage.includes('connection')) {
    return '네트워크 연결이 불안정합니다. 인터넷 연결을 확인해주세요.';
  }
  if (serverMessage.includes('size') || serverMessage.includes('용량')) {
    return '파일 크기가 너무 큽니다. 더 작은 파일로 시도해주세요.';
  }
  if (serverMessage.includes('format') || serverMessage.includes('형식')) {
    return '지원하지 않는 파일 형식입니다. JPG, PNG 파일만 업로드 가능합니다.';
  }
  if (serverMessage.includes('permission') || serverMessage.includes('권한')) {
    return '업로드 권한이 없습니다. 관리자에게 문의해주세요.';
  }
  if (serverMessage.includes('storage') || serverMessage.includes('공간')) {
    return '저장 공간이 부족합니다. 관리자에게 문의해주세요.';
  }
  
  // 기본 사용자 친화적 메시지
  return '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
};

const getCategoryDisplayName = (category: string): string => {
  switch (category) {
    case 'gateway': return '게이트웨이';
    case 'fan': return '송풍팬';
    case 'others': return '기타';
    default: return category;
  }
};

export default function ImprovedFacilityPhotoSection({
  businessName,
  facilities,
  facilityNumbering,
  currentPhase
}: ImprovedFacilityPhotoSectionProps) {
  // 디버그 로그 제거 (개발 완료)
  // console.log('🎯 [FACILITY-NUMBERING] 대기필증 관리 시설번호:', facilityNumbering);

  // if (facilityNumbering?.outlets) {
  //   console.log('🎯 [OUTLETS] 배출구 정보:', facilityNumbering.outlets);
  //   facilityNumbering.outlets.forEach((outlet: any, idx: number) => {
  //     console.log(`  배출구 ${outlet.outletNumber}:`, {
  //       배출시설: outlet.dischargeFacilities?.map((f: any) => `${f.displayNumber}(${f.facilityName})`),
  //       방지시설: outlet.preventionFacilities?.map((f: any) => `${f.displayNumber}(${f.facilityName})`)
  //     });
  //   });
  // }

  // 🎯 대기필증 관리 시설번호 조회 헬퍼 함수 (메모이제이션)
  // 🔧 quantity별 개별 번호를 배열로 저장하도록 변경
  const facilityNumberMap = useMemo(() => {
    if (!facilityNumbering?.outlets) {
      return new Map<string, number[]>();
    }

    // ✅ capacity를 포함한 키로 매핑 (같은 이름의 시설 구분)
    // 🔧 각 시설의 quantity별 번호를 배열로 수집
    const map = new Map<string, number[]>();

    for (const outlet of facilityNumbering.outlets) {
      // 배출시설 매핑 (capacity 포함, quantity별 개별 번호 수집)
      const dischargeByFacility = new Map<string, number[]>();
      outlet.dischargeFacilities?.forEach((f: any, idx: number) => {
        const key = `discharge-${outlet.outletNumber}-${f.facilityName}-${f.capacity || 'any'}`;
        if (!dischargeByFacility.has(key)) {
          dischargeByFacility.set(key, []);
        }
        dischargeByFacility.get(key)!.push(f.facilityNumber);

        // 🔧 Also store by array index for easier lookup in rendering
        const idxKey = `discharge-${outlet.outletNumber}-idx${idx}`;
        if (!map.has(idxKey)) {
          map.set(idxKey, []);
        }
        map.get(idxKey)!.push(f.facilityNumber);
      });
      dischargeByFacility.forEach((numbers, key) => {
        map.set(key, numbers);
      });

      // 방지시설 매핑 (facilityId 포함하여 같은 이름의 시설도 개별 구분)
      const preventionByFacility = new Map<string, number[]>();
      outlet.preventionFacilities?.forEach((f: any, idx: number) => {
        // 🔧 FIX: facilityId를 키에 포함시켜 같은 이름/용량의 시설도 구분
        const key = `prevention-${outlet.outletNumber}-${f.facilityId}-${f.capacity || 'any'}`;
        if (!preventionByFacility.has(key)) {
          preventionByFacility.set(key, []);
        }
        preventionByFacility.get(key)!.push(f.facilityNumber);

        // 🔧 Also store by array index for easier lookup in rendering
        const idxKey = `prevention-${outlet.outletNumber}-idx${idx}`;
        if (!map.has(idxKey)) {
          map.set(idxKey, []);
        }
        map.get(idxKey)!.push(f.facilityNumber);
      });
      preventionByFacility.forEach((numbers, key) => {
        map.set(key, numbers);
      });
    }

    return map;
  }, [facilityNumbering]);

  const getCorrectFacilityNumber = useCallback((
    facilityType: 'discharge' | 'prevention',
    facility: Facility,
    quantityIndex: number = 0, // 🔧 quantityIndex 파라미터 추가
    facilityIdx: number = 0 // 🔧 배열 내 위치 (같은 이름의 시설 구분용)
  ): number => {
    // 🔧 FIX: facilityIdx를 키에 사용하여 배열 순서대로 매핑
    // 배출구별로 시설 배열 순서가 보장되므로 idx로 정확한 시설 구분 가능
    const idxKey = `${facilityType}-${facility.outlet}-idx${facilityIdx}`;

    if (facilityNumberMap.has(idxKey)) {
      const numbers = facilityNumberMap.get(idxKey)!;
      // 🔧 quantityIndex에 해당하는 번호 반환 (범위 체크)
      if (quantityIndex >= 0 && quantityIndex < numbers.length) {
        return numbers[quantityIndex];
      }
      // fallback: 첫 번째 번호 반환
      return numbers.length > 0 ? numbers[0] : facility.number;
    }

    // 매칭 실패 시 원래 번호 반환
    return facility.number;
  }, [facilityNumberMap]);

  // 🆕 배출구 번호 목록 추출 (송풍팬 사진 섹션용)
  const outletNumbers = useMemo(() => {
    if (!facilities) return [];

    const outlets = new Set<number>();

    // 배출시설에서 outlet 번호 수집
    facilities.discharge?.forEach(facility => {
      if (facility.outlet) {
        outlets.add(facility.outlet);
      }
    });

    // 방지시설에서 outlet 번호 수집
    facilities.prevention?.forEach(facility => {
      if (facility.outlet) {
        outlets.add(facility.outlet);
      }
    });

    // 정렬된 배열로 반환
    const sorted = Array.from(outlets).sort((a, b) => a - b);
    console.log('🆕 [OUTLET-NUMBERS] 추출된 배출구 번호:', sorted);
    return sorted;
  }, [facilities]);

  const toast = useToast();
  const { addFiles, removeFile, setBusinessInfo, businessName: contextBusinessName, uploadedFiles, realtimeConnected, setUploadedFiles } = useFileContext();

  // 📡 FileContext에 사업장 정보 설정 (Realtime 구독용) - 무한 루프 방지
  useEffect(() => {
    // 이미 같은 사업장이 설정되어 있으면 스킵
    if (businessName && businessName !== contextBusinessName) {
      const systemType = mapPhaseToSystemType(currentPhase);
      setBusinessInfo(businessName, systemType);
      console.log(`📡 [PHOTO-SECTION] setBusinessInfo 호출: ${businessName}, ${systemType}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName, currentPhase, contextBusinessName]);

  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  
  // Progressive Upload 시스템 초기화
  const {
    photos: optimisticPhotos,
    queueStats,
    isProcessing,
    addFiles: addOptimisticFiles,
    retryUpload,
    cancelUpload,
    removePhoto,
    clearCompleted,
    cancelAll,
    forceUpload,
    getSmartProgressData
  } = useOptimisticUpload({
    maxConcurrency: 3,
    maxRetries: 2,
    autoRetry: false
  });
  
  // Individual file upload tracking and cancellation
  const [fileUploadStates, setFileUploadStates] = useState<{
    [fileId: string]: {
      status: 'waiting' | 'uploading' | 'success' | 'error';
      progress: number;
      fileName: string;
      error?: string;
      abortController?: AbortController;
      previewUrl?: string;
    }
  }>({});

  // 🔄 실패한 파일 추적 상태 (재업로드용)
  const [failedFiles, setFailedFiles] = useState<{
    file: File;
    error: string;
    facilityType: 'discharge' | 'prevention' | 'basic' | 'gateway' | 'fan' | 'others';
    facility: Facility;
    uploadKey: string;
  }[]>([]);

  const [activeUploads, setActiveUploads] = useState<Set<string>>(new Set());
  const [isDeletingPhoto, setIsDeletingPhoto] = useState<boolean>(false);
  
  // 🔧 Jotai를 사용한 삭제된 사진 ID 추적 (즉시 UI 숨김용)
  const deletedPhotoIds = useAtomValue(deletedPhotoIdsAtom);
  const markPhotoAsDeleted = useSetAtom(deletePhotoAtom);
  const markPhotoAsUndeleted = useSetAtom(undeletePhotoAtom); // 롤백용
  const clearDeletedPhotos = useSetAtom(clearDeletedPhotosAtom);
  
  // 📷 Jotai로 필터링된 사진 목록을 생성하는 함수
  const getFilteredPhotos = useCallback((originalPhotos: FacilityPhoto[]) => {
    return originalPhotos.filter(photo => !deletedPhotoIds.has(photo.id));
  }, [deletedPhotoIds]);

  // Jotai 상태 변화 추적 (로그 제거)
  
  // Sophisticated drag-and-drop state management
  const [dragStates, setDragStates] = useState<{
    [zoneId: string]: {
      isDragOver: boolean;
      dragDepth: number;
      isValidDrag: boolean;
      draggedFileCount: number;
    }
  }>({});
  
  const [globalDragActive, setGlobalDragActive] = useState(false);
  
  // Auto-refresh with highlighting for new photos
  const [recentPhotoIds, setRecentPhotoIds] = useState<Set<string>>(new Set());
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [photoTracker] = useState(() => createFacilityPhotoTracker(businessName));
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<FacilityPhoto | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [expandedFacilities, setExpandedFacilities] = useState<Set<string>>(new Set());
  const [statistics, setStatistics] = useState({
    totalFacilities: 0,
    totalPhotos: 0,
    totalPhotosAllPhases: 0, // ✅ 전체 phase의 사진 총합 (facility list와 일치)
    dischargeFacilities: 0,
    preventionFacilities: 0,
    basicCategories: 0
  });
  const modalRef = useRef<HTMLDivElement>(null);

  // 업로드된 파일 로드 및 추적기 업데이트 (새 사진 하이라이트 포함)
  const loadUploadedFiles = useCallback(async (forceRefresh = false, highlightNew = false) => {
    if (!businessName) return;

    setLoadingFiles(true);

    // ✅ 서버 데이터를 Source of Truth로 - 강제 새로고침 시 Jotai 상태 초기화
    if (forceRefresh) {
      clearDeletedPhotos();
      console.log('🧹 [FORCE-REFRESH] 삭제 상태 초기화 - 서버 데이터와 완전 동기화');
    }

    try {
      const refreshParam = forceRefresh ? '&refresh=true' : '';
      const phaseParam = `&phase=${currentPhase}`;
      // ✅ 브라우저 캐시 무효화: timestamp + cache headers
      const timestamp = forceRefresh ? `&_t=${Date.now()}` : '';
      const response = await fetch(
        `/api/facility-photos?businessName=${encodeURIComponent(businessName)}${refreshParam}${phaseParam}${timestamp}`,
        {
          cache: 'no-store',  // Next.js 캐시 비활성화
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',  // 브라우저 캐시 비활성화
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const newFiles = result.data.files || [];
          
          // ✅ PERFORMANCE FIX: 추적기 업데이트를 먼저 수행 (단일 패스)
          console.log('🔍 [DEBUG] API 응답 파일들:', newFiles.length);

          // 🔍 각 파일의 상세 정보 로그
          newFiles.forEach((file: any, index: number) => {
            console.log(`📄 [FILE-${index}]`, {
              name: file.name,
              filePath: file.filePath,
              facilityInfo: file.facilityInfo,
              category: file.category,
              metadata: file.metadata
            });
          });

          const startTime = performance.now();

          photoTracker.buildFromUploadedFiles(newFiles);

          const buildTime = performance.now() - startTime;
          console.log(`⚡ [PERF] photoTracker 빌드 완료: ${buildTime.toFixed(2)}ms`);

          // 🔍 빌드 후 각 카테고리별 사진 확인
          const allFacilities = photoTracker.getAllFacilities();
          console.log(`📊 [TRACKER-RESULT] 총 시설: ${allFacilities.length}`);
          allFacilities.forEach(facility => {
            console.log(`  - ${facility.type === 'discharge' ? '배출' : '방지'}시설: ${facility.name} (${facility.photos.length}장)`);
          });

          // 새로 추가된 사진 감지 (하이라이트용) - 최적화: 빌드 후 한 번만 조회
          if (highlightNew && newFiles.length > 0) {
            const currentPhotoIds = new Set(photoTracker.getAllFacilities().flatMap(f => f.photos).map(p => p.id));
            const newPhotoIds = new Set(newFiles.filter((f: any) => !currentPhotoIds.has(f.id)).map((f: any) => f.id));

            if (newPhotoIds.size > 0) {
              setRecentPhotoIds(newPhotoIds);
              console.log(`✨ [NEW-PHOTOS] ${newPhotoIds.size}장 하이라이트`);

              setTimeout(() => setRecentPhotoIds(new Set()), 5000);
            }
          }

          // ✅ 통계 즉시 업데이트 - 실시간 반응성 우선
          const trackerStats = photoTracker.getStatistics();

          console.log('📊 [STATISTICS-DEBUG] API 응답 통계:', {
            fullStatistics: result.data.statistics,
            totalPhotosAllPhases: result.data.statistics?.totalPhotosAllPhases,
            currentPhasePhotos: result.data.statistics?.currentPhasePhotos,
            trackerTotalPhotos: trackerStats.totalPhotos
          });

          setStatistics({
            ...trackerStats,
            totalPhotosAllPhases: result.data.statistics?.totalPhotosAllPhases ?? trackerStats.totalPhotos
          });
          setLastRefreshTime(new Date());

          // 🔥 CRITICAL FIX: FileContext도 업데이트하여 Realtime 이벤트 대기 제거
          // uploadedFiles를 직접 업데이트하면 useEffect (line 501)가 즉시 반응하여
          // Realtime 이벤트 도착 전에도 UI가 업데이트됨
          if (forceRefresh && newFiles.length > 0) {
            console.log(`🔄 [FILECONTEXT-SYNC] FileContext 즉시 동기화: ${newFiles.length}개 파일`);
            setUploadedFiles(newFiles);
          }

          // 성능 로그 (제거)
        }
      }
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    } finally {
      setLoadingFiles(false);
    }
  }, [businessName, currentPhase, photoTracker]);

  useEffect(() => {
    if (businessName && businessName.length > 0) {
      loadUploadedFiles();
    }
  }, [businessName, loadUploadedFiles]);

  // 🔥 CRITICAL FIX: 컴포넌트 마운트 시 항상 최신 데이터 로드
  // Next.js 클라이언트 라우팅으로 인해 컴포넌트가 재사용될 수 있으므로
  // 마운트 시마다 명시적으로 최신 데이터 조회
  useEffect(() => {
    console.log('🔄 [COMPONENT-MOUNT] ImprovedFacilityPhotoSection 마운트됨 - 최신 데이터 조회');
    if (businessName && businessName.length > 0) {
      loadUploadedFiles(true, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 빈 배열: 마운트 시에만 실행

  // 🔧 REALTIME-SYNC-FIX: Phase 1-2 - 하이브리드 폴링 재활성화 (15초 간격으로 단축)
  // Realtime이 연결되어 있으면 가벼운 검증만, 연결 안되면 전체 새로고침
  useEffect(() => {
    const interval = setInterval(() => {
      if (realtimeConnected) {
        // Realtime 연결됨: 가벼운 검증만 (서버 쿼리는 스킵)
        loadUploadedFiles(true, false);
      } else {
        // Realtime 연결 안됨: 전체 새로고침 (폴링 fallback)
        console.log('⚠️ [HYBRID-POLLING] Realtime 연결 끊김, 전체 새로고침 실행');
        loadUploadedFiles(true, true);
      }
    }, 15000); // 15초 간격 (60초 → 15초 단축)
    return () => clearInterval(interval);
  }, [loadUploadedFiles, realtimeConnected]);

  // ✅ FIX: 업로드 검증 이벤트 리스너
  useEffect(() => {
    const handleVerifyUploads = () => {
      console.log('🔍 [VERIFY-EVENT] 업로드 검증 요청 받음, 서버에서 재조회');
      loadUploadedFiles(true, true);
    };

    window.addEventListener('verify-uploads', handleVerifyUploads);
    return () => window.removeEventListener('verify-uploads', handleVerifyUploads);
  }, [loadUploadedFiles]);

  // ✅ NEW: 통계 카드 자동 업데이트 이벤트 리스너
  useEffect(() => {
    const handlePhotoStatsUpdate = (event: any) => {
      console.log('📊 [STATS-UPDATE-EVENT] PhotoStore에서 통계 업데이트 요청:', event.detail);
      // 서버에서 최신 데이터 가져와서 photoTracker 및 통계 재빌드
      loadUploadedFiles(true, false);
    };

    window.addEventListener('photoStatsUpdate', handlePhotoStatsUpdate);
    return () => window.removeEventListener('photoStatsUpdate', handlePhotoStatsUpdate);
  }, [loadUploadedFiles]);

  // 📡 NEW: Realtime으로 추가/삭제된 사진을 photoTracker에 즉시 반영
  const prevUploadedFilesLengthRef = useRef(uploadedFiles.length);
  useEffect(() => {
    const prevLength = prevUploadedFilesLengthRef.current;
    const currentLength = uploadedFiles.length;

    // uploadedFiles 길이가 변경되었을 때 처리 (Realtime INSERT/DELETE)
    if (currentLength !== prevLength) {
      if (currentLength > prevLength) {
        // INSERT: 새 파일 추가
        console.log(`📡 [REALTIME-SYNC] 새 파일 감지: ${currentLength - prevLength}개`);

        // 새 사진 하이라이트
        const newPhotoIds = new Set<string>(
          uploadedFiles.slice(prevLength).map(f => f.id)
        );
        if (newPhotoIds.size > 0) {
          setRecentPhotoIds(newPhotoIds);
          setTimeout(() => setRecentPhotoIds(new Set()), 5000);
        }
      } else {
        // DELETE: 파일 삭제
        console.log(`📡 [REALTIME-SYNC] 파일 삭제 감지: ${prevLength - currentLength}개`);
      }

      // photoTracker 재빌드 (추가/삭제 모두 반영)
      photoTracker.buildFromUploadedFiles(uploadedFiles);

      // 통계 업데이트
      const trackerStats = photoTracker.getStatistics();
      setStatistics(prev => ({
        ...trackerStats,
        totalPhotosAllPhases: prev.totalPhotosAllPhases
      }));

      console.log(`📡 [REALTIME-SYNC] photoTracker 업데이트 완료, 총 ${trackerStats.totalPhotos}장`);
    }
    prevUploadedFilesLengthRef.current = currentLength;
  }, [uploadedFiles, photoTracker]);

  // ✅ 페이지 포커스 복원 시 자동 새로고침 (브라우저 뒤로가기, 탭 전환 등)
  useEffect(() => {
    let refreshTimeout: NodeJS.Timeout | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 🚀 즉시 실행 (debounce 제거) - 페이지 복귀 시 최신 데이터 즉시 표시
        if (refreshTimeout) clearTimeout(refreshTimeout);
        console.log('👁️ [PAGE-VISIBLE] 페이지 포커스 복원 - 즉시 데이터 새로고침');
        loadUploadedFiles(true, false);
      }
    };

    const handleFocus = () => {
      // 🚀 즉시 실행 (debounce 제거) - 윈도우 포커스 시 최신 데이터 즉시 표시
      if (refreshTimeout) clearTimeout(refreshTimeout);
      console.log('🎯 [PAGE-FOCUS] 윈도우 포커스 복원 - 즉시 데이터 새로고침');
      loadUploadedFiles(true, false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadUploadedFiles]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(fileUploadStates).forEach(state => {
        if (state.previewUrl) {
          URL.revokeObjectURL(state.previewUrl);
        }
      });
    };
  }, []);

  // Individual file upload management
  const cancelFileUpload = useCallback((fileId: string) => {
    const fileState = fileUploadStates[fileId];
    if (fileState?.abortController) {
      fileState.abortController.abort();
    }
    
    // 미리보기 URL 정리
    if (fileState?.previewUrl) {
      URL.revokeObjectURL(fileState.previewUrl);
    }
    
    setFileUploadStates(prev => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        status: 'error',
        error: '업로드가 취소되었습니다.',
        previewUrl: undefined
      }
    }));
    
    setActiveUploads(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileId);
      return newSet;
    });
    
    toast.info('업로드 취소됨', `${fileState?.fileName || '파일'}의 업로드가 취소되었습니다.`);
  }, [fileUploadStates, toast]);
  
  const retryFileUpload = useCallback(async (fileId: string, uploadFunction: () => Promise<void>) => {
    setFileUploadStates(prev => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        status: 'waiting',
        error: undefined
      }
    }));

    try {
      await uploadFunction();
    } catch (error) {
      console.error('Retry failed:', error);
    }
  }, []);
  
  const clearCompletedUploads = useCallback(() => {
    setFileUploadStates(prev => {
      const newStates: typeof prev = {};
      Object.keys(prev).forEach(fileId => {
        if (prev[fileId].status === 'uploading' || prev[fileId].status === 'waiting') {
          newStates[fileId] = prev[fileId];
        } else {
          // 완료된 업로드의 미리보기 URL 정리
          if (prev[fileId].previewUrl) {
            URL.revokeObjectURL(prev[fileId].previewUrl);
          }
        }
      });
      return newStates;
    });
  }, []);

  // Sophisticated drag-and-drop handlers
  const createDragHandlers = (zoneId: string, onDrop: (files: FileList) => void) => {
    const updateDragState = (updates: Partial<typeof dragStates[string]>) => {
      setDragStates(prev => ({
        ...prev,
        [zoneId]: { ...prev[zoneId], ...updates }
      }));
    };

    const validateDraggedFiles = (dataTransfer: DataTransfer): { isValid: boolean; fileCount: number } => {
      const items = Array.from(dataTransfer.items || []);
      const files = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
      return { isValid: files.length > 0, fileCount: files.length };
    };

    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const { isValid, fileCount } = validateDraggedFiles(e.dataTransfer);
        
        setGlobalDragActive(true);
        updateDragState({
          isDragOver: true,
          dragDepth: (dragStates[zoneId]?.dragDepth || 0) + 1,
          isValidDrag: isValid,
          draggedFileCount: fileCount
        });
      },

      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const newDepth = (dragStates[zoneId]?.dragDepth || 1) - 1;
        
        if (newDepth <= 0) {
          updateDragState({
            isDragOver: false,
            dragDepth: 0,
            isValidDrag: false,
            draggedFileCount: 0
          });
          
          // Check if any other zones are active
          const hasOtherActiveZones = Object.entries(dragStates).some(([id, state]) => 
            id !== zoneId && state.isDragOver
          );
          if (!hasOtherActiveZones) {
            setGlobalDragActive(false);
          }
        } else {
          updateDragState({ dragDepth: newDepth });
        }
      },

      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const { isValid, fileCount } = validateDraggedFiles(e.dataTransfer);
        updateDragState({ isValidDrag: isValid, draggedFileCount: fileCount });
      },

      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        setGlobalDragActive(false);
        updateDragState({
          isDragOver: false,
          dragDepth: 0,
          isValidDrag: false,
          draggedFileCount: 0
        });

        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
          if (imageFiles.length > 0) {
            const dataTransfer = new DataTransfer();
            imageFiles.forEach(file => dataTransfer.items.add(file));
            onDrop(dataTransfer.files);
          }
        }
      }
    };
  };

  const getDragZoneStyles = (zoneId: string, baseStyles: string = '') => {
    const dragState = dragStates[zoneId];
    if (!dragState?.isDragOver) return baseStyles;

    const validDragStyles = dragState.isValidDrag 
      ? 'border-green-400 bg-green-50 ring-2 ring-green-200 shadow-lg transform scale-[1.02]'
      : 'border-red-400 bg-red-50 ring-2 ring-red-200 shadow-lg';

    return `${baseStyles} ${validDragStyles} transition-all duration-200 ease-out`;
  };

  // Global drag overlay for sophisticated visual feedback
  const DragOverlay = () => {
    if (!globalDragActive) return null;

    return (
      <div className="fixed inset-0 bg-blue-500/10 backdrop-blur-sm z-40 pointer-events-none">
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur-md rounded-lg shadow-lg px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
            <Upload className="w-4 h-4 animate-bounce" />
            이미지를 업로드할 영역으로 드래그하세요
          </div>
        </div>
      </div>
    );
  };

  // Progressive Upload용 추가 데이터 팩토리
  const createAdditionalDataFactory = useCallback((
    facilityType: 'discharge' | 'prevention' | 'basic',
    facility?: Facility,
    instanceIndex?: number,
    category?: string,
    outletNumber?: number // 🆕 배출구 번호 (송풍팬 전용)
  ) => {
    return (file: File, index: number) => {
      const data: Record<string, string> = {
        businessName,
        category: facilityType === 'basic' ? 'basic' : facilityType,
        systemType: mapPhaseToSystemType(currentPhase),
        phase: currentPhase
      };

      if (facility && facilityType !== 'basic') {
        data.facilityId = `${facility.number}`;
        data.facilityType = facilityType;
        data.facilityNumber = `${facility.number}`;

        // ✅ facilityInfo JSON 생성 (photo-tracker가 기대하는 형식)
        data.facilityInfo = JSON.stringify({
          type: facilityType,
          outlet: facility.outlet || 1,  // ✅ outletNumber → outlet 수정
          number: facility.number,
          instance: instanceIndex || 1  // 🆕 인스턴스 번호 추가 (다중 시설 구분용)
        });
      }

      if (category && facilityType === 'basic') {
        data.category = category;
        // ✅ 기본사진도 facilityInfo 추가 (카테고리 정보)
        data.facilityInfo = JSON.stringify({
          type: 'basic',
          category: category
        });

        // 🆕 송풍팬 + 배출구 번호가 있으면 outletNumber 추가
        if (category === 'fan' && outletNumber !== undefined) {
          data.outletNumber = `${outletNumber}`;
        }
      }

      return data;
    };
  }, [businessName]);

  // Progressive Upload 핸들러들
  const handleProgressiveFacilityUpload = useCallback(async (
    files: FileList,
    facilityType: 'discharge' | 'prevention',
    facility: Facility,
    instanceIndex: number = 1
  ) => {
    if (!files.length) return;

    const fileArray = Array.from(files);
    const additionalDataFactory = createAdditionalDataFactory(facilityType, facility, instanceIndex);

    try {
      // Optimistic UI로 즉시 파일 추가 + 실제 업로드 백그라운드 시작
      await addOptimisticFiles(fileArray, additionalDataFactory);

      // ✅ 통계 즉시 업데이트 (optimistic)
      setStatistics(prev => ({
        ...prev,
        totalPhotos: prev.totalPhotos + fileArray.length,
        // 시설 유형에 따라 적절한 카운터 증가
        ...(facilityType === 'discharge' ? {
          dischargeFacilities: prev.dischargeFacilities + fileArray.length
        } : facilityType === 'prevention' ? {
          preventionFacilities: prev.preventionFacilities + fileArray.length
        } : {})
      }));
      console.log(`📊 [STATS-OPTIMISTIC] 통계 즉시 업데이트: +${fileArray.length}장`);

      // 성공된 파일들을 FileContext에도 추가 (기존 시스템과 호환성)
      setTimeout(async () => {
        try {
          await loadUploadedFiles();
        } catch (error) {
          console.warn('파일 목록 새로고침 실패:', error);
        }
      }, 1000);

      toast.success(
        '업로드 시작',
        `${fileArray.length}장의 사진 업로드를 시작했습니다. 진행 상황을 확인하세요.`,
        { duration: 3000 }
      );

    } catch (error) {
      console.error('Progressive Upload 실패:', error);
      toast.error('업로드 시작 실패', error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }, [addOptimisticFiles, createAdditionalDataFactory, loadUploadedFiles, toast]);

  // 기본사진용 Progressive Upload
  const handleProgressiveBasicUpload = useCallback(async (
    files: FileList,
    category: string,
    outletNumber?: number // 🆕 배출구 번호 (송풍팬 전용)
  ) => {
    if (!files.length) return;

    const fileArray = Array.from(files);
    const additionalDataFactory = createAdditionalDataFactory('basic', undefined, undefined, category, outletNumber);

    try {
      await addOptimisticFiles(fileArray, additionalDataFactory);

      // ✅ 통계 즉시 업데이트 (optimistic) - 기본사진
      setStatistics(prev => ({
        ...prev,
        totalPhotos: prev.totalPhotos + fileArray.length,
        basicCategories: prev.basicCategories + fileArray.length
      }));

      const logMessage = outletNumber !== undefined
        ? `📊 [STATS-OPTIMISTIC-BASIC] 통계 즉시 업데이트: +${fileArray.length}장 (송풍팬 배출구 ${outletNumber})`
        : `📊 [STATS-OPTIMISTIC-BASIC] 통계 즉시 업데이트: +${fileArray.length}장 (기본사진)`;
      console.log(logMessage);

      // 기존 시스템과 호환성을 위한 새로고침
      setTimeout(async () => {
        try {
          await loadUploadedFiles();
        } catch (error) {
          console.warn('파일 목록 새로고침 실패:', error);
        }
      }, 1000);

      const successMessage = outletNumber !== undefined
        ? `${fileArray.length}장의 송풍팬 사진(배출구 ${outletNumber}) 업로드를 시작했습니다.`
        : `${fileArray.length}장의 기본사진 업로드를 시작했습니다.`;

      toast.success(
        '업로드 시작',
        successMessage,
        { duration: 3000 }
      );

    } catch (error) {
      console.error('Progressive Basic Upload 실패:', error);
      toast.error('업로드 시작 실패', error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }, [addOptimisticFiles, createAdditionalDataFactory, loadUploadedFiles, toast]);

  // 기존 업로드 핸들러 (Progressive Upload로 교체)
  const handleFacilityUpload = useCallback(async (
    files: FileList, 
    facilityType: 'discharge' | 'prevention',
    facility: Facility,
    instanceIndex: number = 1
  ) => {
    // Progressive Upload로 리다이렉트
    return handleProgressiveFacilityUpload(files, facilityType, facility, instanceIndex);
  }, [handleProgressiveFacilityUpload]);

  // 기존 기본사진 업로드 핸들러도 교체
  const handleBasicUpload = useCallback(async (
    files: FileList,
    category: string,
    outletNumber?: number // 🆕 배출구 번호 (송풍팬 전용)
  ) => {
    // Progressive Upload로 리다이렉트
    return handleProgressiveBasicUpload(files, category, outletNumber);
  }, [handleProgressiveBasicUpload]);

  // 원본 업로드 핸들러 (백업용 - 필요시 사용)
  const handleOriginalFacilityUpload = useCallback(async (
    files: FileList, 
    facilityType: 'discharge' | 'prevention',
    facility: Facility,
    instanceIndex: number = 1
  ) => {
    if (!files.length) return;

    const uploadKey = `${facilityType}-${facility.outlet}-${facility.number}-${instanceIndex}`;
    
    setUploading(prev => ({ ...prev, [uploadKey]: true }));
    setUploadProgress(prev => ({ ...prev, [uploadKey]: 0 }));

    // Initialize individual file states with improved uniqueness
    const fileIds: string[] = [];
    const newFileStates: { [key: string]: any } = {};
    
    // 🔧 모든 파일 정보를 먼저 준비 (배치 처리를 위해)
    Array.from(files).forEach((file, index) => {
      // 🔧 더 강력한 고유성 보장 - 시간, 인덱스, 파일정보 조합
      const timestamp = Date.now().toString(36);
      const performanceTime = performance.now().toString(36);
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      const fileHash = `${file.name}-${file.size}-${file.lastModified}`.replace(/[^a-zA-Z0-9]/g, '_');
      const fileId = `${uploadKey}-${index}-${timestamp}-${performanceTime}-${fileHash}-${randomSuffix}`;
      fileIds.push(fileId);
      
      // 🖼️ 각 파일별 고유 미리보기 URL 생성 - File 객체를 직접 사용하여 고유성 보장
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      
      // 미리보기 URL 추적 (로그 제거)
      
      // 새로운 상태를 미리 준비
      newFileStates[fileId] = {
        status: 'waiting' as const,
        progress: 0,
        fileName: file.name,
        abortController: new AbortController(),
        previewUrl
      };
    });
    
    // 🔧 모든 파일 상태를 한 번에 업데이트 (배치 처리로 상태 경쟁 조건 방지)
    setFileUploadStates(prev => ({
      ...prev,
      ...newFileStates
    }));

    console.log(`📤 [UPLOAD-START] ${files.length}장 업로드 시작 - ${facilityType}`);
    
    // ✅ FIX: 파일을 개별적으로 순차 업로드 (완료 신호 정확히 수신)
    try {
      let successCount = 0;
      const uploadedFiles: any[] = [];
      const currentFailedFiles: typeof failedFiles = []; // 🔄 이번 업로드에서 실패한 파일 추적

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = fileIds[i];

        // 파일 상태를 업로드 중으로 변경
        setFileUploadStates(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], status: 'uploading', progress: 0 }
        }));

        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('businessName', businessName);
          formData.append('facilityType', facilityType);
          formData.append('facilityNumber', facility.number?.toString() || '1');
          formData.append('outletNumber', facility.outlet.toString());
          formData.append('systemType', currentPhase === 'presurvey' ? 'presurvey' : 'completion');
          formData.append('phase', currentPhase);

          // ✅ FIX: /api/upload-supabase 사용하여 안정적인 업로드
          const response = await new Promise<Response>((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                setFileUploadStates(prev => ({
                  ...prev,
                  [fileId]: { ...prev[fileId], progress: percentComplete }
                }));
                setUploadProgress(prev => ({ ...prev, [uploadKey]: Math.round((i + percentComplete / 100) / files.length * 100) }));
              }
            });

            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(new Response(xhr.responseText, {
                  status: xhr.status,
                  statusText: xhr.statusText,
                  headers: new Headers({ 'Content-Type': 'application/json' })
                }));
              } else {
                reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
              }
            });

            xhr.addEventListener('error', () => reject(new Error('네트워크 오류')));
            xhr.addEventListener('abort', () => reject(new Error('업로드 취소됨')));

            xhr.open('POST', '/api/upload-supabase');
            xhr.send(formData);
          });

          const result = await response.json();

          if (result.success && result.files && result.files.length > 0) {
            successCount++;
            uploadedFiles.push(...result.files);

            // 파일 상태를 성공으로 업데이트
            setFileUploadStates(prev => ({
              ...prev,
              [fileId]: {
                ...prev[fileId],
                status: 'success',
                progress: 100,
                previewUrl: undefined
              }
            }));

            // 미리보기 URL 정리
            if (fileUploadStates[fileId]?.previewUrl) {
              URL.revokeObjectURL(fileUploadStates[fileId].previewUrl!);
            }
          } else {
            throw new Error(result.message || '업로드 실패');
          }

        } catch (fileError: any) {
          // 🔄 실패한 파일 추적 목록에 추가
          currentFailedFiles.push({
            file,
            error: fileError.message || '업로드 실패',
            facilityType,
            facility,
            uploadKey
          });

          // 파일 상태를 오류로 업데이트
          setFileUploadStates(prev => ({
            ...prev,
            [fileId]: {
              ...prev[fileId],
              status: 'error',
              error: fileError.message || '업로드 실패',
              previewUrl: undefined
            }
          }));

          // 미리보기 URL 정리
          if (fileUploadStates[fileId]?.previewUrl) {
            URL.revokeObjectURL(fileUploadStates[fileId].previewUrl!);
          }
        }
      }

      console.log(`✅ [UPLOAD] ${successCount}/${files.length}장 완료`);

      // 🔄 실패한 파일이 있으면 failedFiles 상태에 추가
      if (currentFailedFiles.length > 0) {
        setFailedFiles(prev => [...prev, ...currentFailedFiles]);
        console.log(`🔄 [FAILED-FILES] ${currentFailedFiles.length}개 파일 실패 추적 목록에 추가`);
      }

      // ✅ FIX: 업로드 완료 후 즉시 새로고침하여 1분 지연 제거
      if (successCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadUploadedFiles(true, true);
      }

      // 업로드 진행률 최종 업데이트
      setUploadProgress(prev => ({ ...prev, [uploadKey]: 100 }));

      // 성공/실패 알림
      if (successCount === files.length) {
        toast.success(`업로드 완료`, `${successCount}장의 사진이 모두 업로드되었습니다.`);
      } else if (successCount > 0) {
        toast.warning(`부분 업로드`, `${successCount}/${files.length}장의 사진이 업로드되었습니다. ${currentFailedFiles.length}장 실패.`);
      } else {
        toast.error(`업로드 실패`, `모든 파일의 업로드가 실패했습니다.`);
      }

    } catch (error: any) {
      console.error('❌ [UPLOAD-ERROR]', error.message);

      // 모든 파일을 오류 상태로 업데이트
      setFileUploadStates(prev => {
        const newStates = { ...prev };
        fileIds.forEach(fileId => {
          if (newStates[fileId] && newStates[fileId].status !== 'success') {
            // 오류 시 미리보기 URL 정리
            if (newStates[fileId].previewUrl) {
              URL.revokeObjectURL(newStates[fileId].previewUrl);
            }
            newStates[fileId] = {
              ...newStates[fileId],
              status: 'error',
              error: error.message || '업로드 실패',
              previewUrl: undefined
            };
          }
        });
        return newStates;
      });

      throw error;
    } finally {
      console.log(`🏁 [FINALLY-BLOCK] 업로드 종료 - finally 블록 실행됨`);

      setUploading(prev => ({ ...prev, [uploadKey]: false }));
      setTimeout(() => {
        setUploadProgress(prev => ({ ...prev, [uploadKey]: 0 }));
      }, 2000);

      // ✅ FIX: 업로드 완료 후 성공한 파일 상태 자동 정리 (상태바 자동 제거)
      // finally 블록에서 실행하여 성공/실패 관계없이 정리
      setTimeout(() => {
        console.log(`🧹 [CLEANUP-START] 2초 경과, 파일 상태 정리 시작`);

        // smartUploadQueue 초기화 (상태바 자동 숨김)
        try {
          smartUploadQueue.clearQueue();
          console.log(`✅ [QUEUE-CLEAR] smartUploadQueue 초기화 완료`);
        } catch (queueError) {
          console.error(`❌ [QUEUE-CLEAR-ERROR]`, queueError);
        }

        setFileUploadStates(prev => {
          const newStates = { ...prev };
          fileIds.forEach(fileId => {
            if (newStates[fileId]?.status === 'success') {
              delete newStates[fileId];
            }
          });
          console.log(`✅ [CLEANUP] 파일 상태 정리 완료`);
          return newStates;
        });
      }, 2000); // 2초 후 자동 정리
    }
  }, [businessName, loadUploadedFiles]);

  // 🔄 실패한 파일 전체 재업로드 함수
  const retryAllFailedFiles = useCallback(async () => {
    if (failedFiles.length === 0) {
      toast.warning('재업로드 불가', '실패한 파일이 없습니다.');
      return;
    }

    console.log(`🔄 [RETRY-ALL] ${failedFiles.length}개 실패 파일 재업로드 시작`);

    // 시설별로 그룹화
    const groupedByFacility = failedFiles.reduce((acc, item) => {
      const key = `${item.facilityType}-${item.facility.number}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {} as Record<string, typeof failedFiles>);

    // failedFiles 초기화 (재업로드 시작 전)
    setFailedFiles([]);

    // 각 시설별로 재업로드 실행
    for (const [key, items] of Object.entries(groupedByFacility)) {
      const firstItem = items[0];
      const filesArray = items.map(item => item.file);

      console.log(`🔄 [RETRY-GROUP] ${key} - ${filesArray.length}개 파일 재업로드`);

      try {
        // FileList 객체로 변환 (handleOriginalFacilityUpload는 FileList를 요구)
        const dataTransfer = new DataTransfer();
        filesArray.forEach(file => dataTransfer.items.add(file));
        const fileList = dataTransfer.files;

        // 기존 업로드 핸들러 호출
        if (firstItem.facilityType === 'discharge' || firstItem.facilityType === 'prevention') {
          await handleOriginalFacilityUpload(
            fileList,
            firstItem.facilityType,
            firstItem.facility
          );
        } else {
          // 기본사진인 경우 (gateway, fan, others)
          await handleBasicUpload(fileList, firstItem.facilityType);
        }
      } catch (error) {
        console.error(`❌ [RETRY-ERROR] ${key} 재업로드 실패:`, error);
      }
    }

    toast.success('재업로드 완료', '실패한 파일 재업로드를 완료했습니다.');
  }, [failedFiles, toast, handleOriginalFacilityUpload, handleBasicUpload]);

  // 🔧 개선된 사진 삭제 - 즉시 UI 업데이트 + 백그라운드 동기화 + 롤백 처리
  const deletePhoto = useCallback(async (photo: FacilityPhoto) => {
    console.log('🚨 [DEBUG] deletePhoto 함수가 호출되었습니다!', photo);
    if (!confirm(`"${photo.originalFileName}" 파일을 삭제하시겠습니까?`)) {
      console.log('🚫 [DEBUG] 사용자가 삭제를 취소했습니다');
      return;
    }

    try {
      console.log(`🔥🔥🔥 [DELETE-FUNCTION-CALLED] ${photo.fileName} (ID: ${photo.id}) 새로운 삭제 함수 호출됨! 🔥🔥🔥`);
      console.log(`🚀 [DELETE-START] ${photo.fileName} (ID: ${photo.id}) 삭제 시작`);
      
      // 🚨 삭제 작업 시작 - 외부 클릭 차단
      setIsDeletingPhoto(true);
      console.log(`🔒 [DELETE-LOCK] 삭제 작업 중 모달 잠금 활성화 - HOT RELOAD TEST`);
      
      // 1️⃣ 즉시 UI에서 사진 숨기기 (Jotai 사용)
      markPhotoAsDeleted(photo.id);
      console.log(`⚡ [INSTANT-DELETE] ${photo.fileName} - markPhotoAsDeleted 호출완료`);

      // 2️⃣ ✅ FIX: FileContext에서도 즉시 제거 (낙관적 업데이트 - API 호출 전)
      // 이렇게 하면 uploadedFiles 변경 → photoTracker 재빌드 → UI 즉시 업데이트
      removeFile(photo.id);
      console.log(`🗑️ [OPTIMISTIC-DELETE] FileContext.removeFile 즉시 호출 - uploadedFiles 업데이트`);

      // 3️⃣ photoTracker에서도 즉시 제거하여 통계 업데이트
      console.log(`🔍 [BEFORE-REMOVE] 삭제 전 통계:`, photoTracker.getStatistics());
      const removed = photoTracker.removePhoto(photo.id);
      console.log(`🗑️ [TRACKER-REMOVE] photoTracker.removePhoto 결과: ${removed}`);
      console.log(`🔍 [AFTER-REMOVE] 삭제 후 통계:`, photoTracker.getStatistics());

      // 4️⃣ 통계 즉시 업데이트 (optimistic update) - photoTracker에서 최신 통계 가져오기
      if (removed) {
        const updatedStats = photoTracker.getStatistics();
        console.log(`📊 [STATS-UPDATE-START] setStatistics 호출 직전:`, updatedStats);
        // ✅ totalPhotosAllPhases 보존하면서 업데이트 (NaN 방지)
        setStatistics(prev => ({
          ...updatedStats,
          totalPhotosAllPhases: (prev.totalPhotosAllPhases || 0) - 1  // 1장 삭제됨
        }));
        console.log(`📊 [STATS-UPDATE-COMPLETE] setStatistics 호출 완료`);
      } else {
        console.warn(`⚠️ [STATS-SKIP] photoTracker에서 사진을 찾을 수 없어 통계 업데이트 생략`);
      }

      // 5️⃣ React 렌더링을 위한 마이크로태스크 대기 (상태 업데이트 처리 시간)
      await Promise.resolve();
      console.log(`🔄 [UI-SYNC] 상태 업데이트 후 UI 리렌더링 트리거됨`);

      // ✅ 상세보기 창 유지 - 모달 닫지 않음 (사용자 경험 개선)
      console.log(`👁️ [MODAL-KEEP] 상세보기 창 유지 - 삭제 후에도 계속 사용 가능`);
      // setSelectedPhoto(null);   // 주석 처리 - 모달 닫지 않음
      // setModalPosition(null);   // 주석 처리 - 모달 닫지 않음

      // 4️⃣ 백그라운드 API 삭제가 아니라, 먼저 실제 API 삭제 수행
      console.log(`🌐 [API-DELETE-START] 서버 삭제 API 호출 시작: DELETE /api/facility-photos/${photo.id}`);
      const response = await fetch(`/api/facility-photos/${photo.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      console.log(`📡 [API-DELETE-RESPONSE]`, result);

      if (!result.success) {
        // 🔄 API 삭제 실패 시 롤백
        console.error('❌ [DELETE-API-FAILED]', result.message || result.error);

        // Jotai에서 삭제 상태 롤백
        markPhotoAsUndeleted(photo.id);

        // photoTracker에서도 롤백 (전체 새로고침으로 처리)
        loadUploadedFiles(true, false).catch(error => {
          console.warn('롤백 새로고침 실패:', error);
        });

        // 🚨 삭제 실패 시 잠금 해제
        setIsDeletingPhoto(false);
        console.log(`🔓 [DELETE-UNLOCK-FAILURE] API 실패 - 모달 잠금 해제`);

        toast.error('삭제 실패', getUserFriendlyErrorMessage(result.message || result.error));
      } else {
        console.log(`✅ [DELETE-API-SUCCESS] ${photo.fileName} 서버에서도 삭제 완료`);

        // 6️⃣ API 삭제 성공 후 성공 메시지 표시
        toast.success('삭제 완료', '사진이 성공적으로 삭제되었습니다.');

        // ✅ removeFile은 이미 낙관적으로 호출됨 (line 1163) - 중복 호출 불필요
        // Realtime 중복 방지도 이미 적용됨 (recentLocalUpdatesRef)

        // 🚨 삭제 작업 완료 - 외부 클릭 차단 해제
        setIsDeletingPhoto(false);
        console.log(`🔓 [DELETE-UNLOCK] 삭제 작업 완료 - 모달 잠금 해제`);

        console.log(`✅ [DELETE-COMPLETE] 삭제 완료, 낙관적 업데이트로 UI 이미 반영됨`);
      }
      
    } catch (error) {
      console.error('사진 삭제 API 오류:', error);
      
      // 🚨 삭제 실패 시에도 외부 클릭 차단 해제
      setIsDeletingPhoto(false);
      console.log(`🔓 [DELETE-UNLOCK-ERROR] 삭제 실패 - 모달 잠금 해제`);
      
      // 🔄 API 오류 시에도 롤백 처리
      markPhotoAsUndeleted(photo.id);
      
      loadUploadedFiles(true, false).catch(refreshError => {
        console.warn('오류 복구 새로고침 실패:', refreshError);
      });
      
      toast.error('삭제 오류', '사진 삭제 중 문제가 발생했습니다. 다시 시도해주세요.');
    }
  }, [businessName, markPhotoAsDeleted, markPhotoAsUndeleted, removeFile, photoTracker, toast, loadUploadedFiles]);

  // 사진 선택 모달
  const handlePhotoSelect = useCallback((photo: FacilityPhoto, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    const centerX = rect.left + rect.width / 2 + 50;
    const centerY = rect.top + rect.height / 2;
    
    const modalWidth = 600;
    const modalHeight = 500;
    
    const adjustedX = Math.min(Math.max(centerX - modalWidth/2, 20), window.innerWidth - modalWidth - 20);
    const adjustedY = Math.min(Math.max(centerY - modalHeight/2, 20), window.innerHeight - modalHeight - 20);
    
    setModalPosition({ x: adjustedX, y: adjustedY });
    setSelectedPhoto(photo);
  }, []);

  // 시설 확장/축소
  const toggleFacilityExpansion = useCallback((facilityKey: string) => {
    setExpandedFacilities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(facilityKey)) {
        newSet.delete(facilityKey);
      } else {
        newSet.add(facilityKey);
      }
      return newSet;
    });
  }, []);

  // 키보드 및 모달 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedPhoto) {
        console.log(`🔑 [ESC-KEY] ESC 키로 모달 닫기 - 사용자가 직접 종료`);
        setSelectedPhoto(null);
        setModalPosition(null);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      // 🚨 삭제 작업 중일 때는 외부 클릭으로 모달 닫지 않음
      if (isDeletingPhoto) {
        console.log(`🚫 [CLICK-OUTSIDE-BLOCKED] 삭제 작업 중 - 외부 클릭 무시`);
        return;
      }
      
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        console.log(`🖱️ [CLICK-OUTSIDE] 외부 클릭으로 모달 닫기`);
        setSelectedPhoto(null);
        setModalPosition(null);
      }
    };

    if (selectedPhoto) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedPhoto, isDeletingPhoto]);

  if (!facilities) {
    return (
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Camera className="w-6 h-6 text-gray-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">시설별 사진 관리</h2>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">시설 정보를 먼저 불러와주세요.</p>
        </div>
      </div>
    );
  }

  // 시설별 정보 가져오기
  const dischargeFacilities = photoTracker.getDischargeFacilities();
  const preventionFacilities = photoTracker.getPreventionFacilities();
  const basicFacilities = photoTracker.getBasicFacilities();

  // 배출구별 시설 그룹화 (중복 제거 포함)
  const facilitiesByOutlet = () => {
    const grouped: { [outlet: number]: { discharge: Facility[], prevention: Facility[] } } = {};

    if (!facilities || !facilities.discharge || !facilities.prevention) {
      return grouped;
    }

    // ✅ FIX: id 기반 중복 제거 - 각 시설은 고유한 id로 식별
    // outlet-number-capacity가 같아도 id가 다르면 별도 시설로 처리
    const seenDischarge = new Set<string>();
    facilities.discharge.forEach(facility => {
      // id가 있으면 id 기반, 없으면 기존 방식 (하위 호환성)
      const uniqueKey = (facility as any).id
        ? `id-${(facility as any).id}`
        : `${facility.outlet}-${facility.number}-${facility.capacity || 'unknown'}-${facility.name}`;

      if (seenDischarge.has(uniqueKey)) {
        console.warn(`⚠️ [DUPLICATE] 중복 배출시설 제거: ${uniqueKey}`);
        return; // 중복 건너뛰기
      }
      seenDischarge.add(uniqueKey);

      if (!grouped[facility.outlet]) {
        grouped[facility.outlet] = { discharge: [], prevention: [] };
      }
      grouped[facility.outlet].discharge.push(facility);
    });

    const seenPrevention = new Set<string>();
    facilities.prevention.forEach(facility => {
      // id가 있으면 id 기반, 없으면 기존 방식 (하위 호환성)
      const uniqueKey = (facility as any).id
        ? `id-${(facility as any).id}`
        : `${facility.outlet}-${facility.number}-${facility.capacity || 'unknown'}-${facility.name}`;

      if (seenPrevention.has(uniqueKey)) {
        console.warn(`⚠️ [DUPLICATE] 중복 방지시설 제거: ${uniqueKey}`);
        return; // 중복 건너뛰기
      }
      seenPrevention.add(uniqueKey);

      if (!grouped[facility.outlet]) {
        grouped[facility.outlet] = { discharge: [], prevention: [] };
      }
      grouped[facility.outlet].prevention.push(facility);
    });

    return grouped;
  };

  const outletFacilities = facilitiesByOutlet();
  const outlets = Object.keys(outletFacilities).map(Number).sort((a, b) => a - b);

  // Individual file upload status component
  const FileUploadStatus = ({ fileStates }: { fileStates: typeof fileUploadStates }) => {
    const activeFiles = Object.entries(fileStates).filter(([_, state]) =>
      state.status === 'uploading' || state.status === 'waiting' || state.status === 'error'
    );

    if (activeFiles.length === 0 && failedFiles.length === 0) return null;

    const hasActiveUploads = activeFiles.length > 0;
    const hasFailedFiles = failedFiles.length > 0;

    return (
      <div className="mb-4 bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-800">
            파일 업로드 상태
            {hasFailedFiles && (
              <span className="ml-2 text-sm text-red-600">
                (실패: {failedFiles.length}개)
              </span>
            )}
          </h4>
          <div className="flex gap-2">
            {hasFailedFiles && (
              <button
                onClick={retryAllFailedFiles}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                실패한 파일 재업로드 ({failedFiles.length})
              </button>
            )}
            {hasActiveUploads && (
              <button
                onClick={clearCompletedUploads}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                완료된 항목 정리
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {activeFiles.map(([fileId, state]) => (
            <div key={fileId} className="flex items-center gap-3 p-2 bg-white rounded border">
              {/* Preview image - 🔧 각 파일별 고유 미리보기 표시 */}
              {state.previewUrl ? (
                <img 
                  src={state.previewUrl} 
                  alt={state.fileName}
                  className="w-12 h-12 object-cover rounded border flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 bg-gray-200 rounded border flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs text-gray-500">📄</span>
                </div>
              )}
              
              {/* Status indicator */}
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                state.status === 'uploading' ? 'bg-blue-500 animate-pulse' :
                state.status === 'waiting' ? 'bg-yellow-500' :
                state.status === 'success' ? 'bg-green-500' :
                'bg-red-500'
              }`} />

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${
                  state.status === 'success' ? 'text-green-700' :
                  state.status === 'error' ? 'text-red-700' :
                  'text-gray-900'
                }`}>
                  {state.fileName}
                </div>
                <div className={`text-xs ${
                  state.status === 'success' ? 'text-green-600' :
                  state.status === 'error' ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                  {state.status === 'uploading' ? `업로드 중... ${state.progress}%` :
                   state.status === 'waiting' ? '대기 중' :
                   state.status === 'success' ? '✓ 완료' :
                   `✗ ${state.error || '실패'}`}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1">
                {state.status === 'uploading' && (
                  <button
                    onClick={() => cancelFileUpload(fileId)}
                    className="p-1 text-red-500 hover:text-red-700 rounded"
                    title="취소"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {state.status === 'error' && (
                  <button
                    onClick={() => retryFileUpload(fileId, () => Promise.resolve())}
                    className="p-1 text-blue-500 hover:text-blue-700 rounded"
                    title="재시도"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Global drag overlay */}
      <DragOverlay />
      
      {/* Smart Floating Progress - 스마트 호버 진행상황 표시 */}
      <SmartFloatingProgress
        {...getSmartProgressData()}
        autoHideDelay={2000}
        onClose={() => {
          // 🚀 프로그래스 바 수동 닫기 핸들러
          console.log('🔥 [PROGRESS-CLOSE] 사용자가 수동으로 프로그래스 바 닫기');
          // 업로드 큐 강제 숨김 처리
          cancelAll();
        }}
      />
      
      {/* Progressive Upload Queue - REMOVED: 중복 UI 제거, SmartFloatingProgress로 대체 */}
      
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-3 md:p-6 shadow-xl border-2 border-gray-200/80">
        {/* File upload status tracker */}
        <FileUploadStatus fileStates={fileUploadStates} />

      {/* 헤더 - 모바일 최적화 */}
      <div className="flex items-center justify-between mb-3 md:mb-6">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div className="p-1.5 md:p-2 bg-purple-100 rounded-lg flex-shrink-0">
            <Camera className="w-4 h-4 md:w-6 md:h-6 text-purple-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base md:text-xl font-bold text-gray-800 truncate">시설별 사진 관리</h2>
            <p className="text-xs md:text-sm text-gray-600 truncate">
              총 {statistics.totalFacilities}개 시설, 전체 {statistics.totalPhotosAllPhases}장
            </p>
          </div>
        </div>

        {/* 컨트롤 버튼 - 모바일 최적화 */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* 뷰 모드 토글 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 md:p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 md:p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
              aria-label="그리드 뷰"
            >
              <Grid className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 md:p-2 rounded ${viewMode === 'list' ? 'bg-white shadow' : ''}`}
              aria-label="리스트 뷰"
            >
              <List className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>

          <button
            onClick={() => loadUploadedFiles(true)}
            disabled={loadingFiles}
            className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            aria-label="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline text-sm">새로고침</span>
          </button>
        </div>
      </div>

      {/* 통계 대시보드 - 모바일 간격 최적화 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-4 mb-2 md:mb-6">
        <div className="bg-orange-50 p-2 md:p-4 rounded-lg border border-orange-200 hover:bg-orange-100 hover:border-orange-300 active:bg-orange-200 active:border-orange-400 transition-all duration-200 transform hover:scale-105 active:scale-102 touch-manipulation shadow-sm hover:shadow-md">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Factory className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />
            <span className="font-medium text-xs md:text-sm text-orange-800">배출시설</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-orange-900 mt-0.5 md:mt-1">
            <AnimatedCounter
              value={statistics.dischargeFacilities}
              duration={800}
              className="inline-block"
            />
          </div>
        </div>

        <div className="bg-green-50 p-2 md:p-4 rounded-lg border border-green-200 hover:bg-green-100 hover:border-green-300 active:bg-green-200 active:border-green-400 transition-all duration-200 transform hover:scale-105 active:scale-102 touch-manipulation shadow-sm hover:shadow-md">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Shield className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
            <span className="font-medium text-xs md:text-sm text-green-800">방지시설</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-green-900 mt-0.5 md:mt-1">
            <AnimatedCounter
              value={statistics.preventionFacilities}
              duration={800}
              className="inline-block"
            />
          </div>
        </div>

        <div className="bg-blue-50 p-2 md:p-4 rounded-lg border border-blue-200 hover:bg-blue-100 hover:border-blue-300 active:bg-blue-200 active:border-blue-400 transition-all duration-200 transform hover:scale-105 active:scale-102 touch-manipulation shadow-sm hover:shadow-md">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Building2 className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
            <span className="font-medium text-xs md:text-sm text-blue-800">기본사진</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-blue-900 mt-0.5 md:mt-1">
            <AnimatedCounter
              value={statistics.basicCategories}
              duration={800}
              className="inline-block"
            />
          </div>
        </div>

        <div className="bg-purple-50 p-2 md:p-4 rounded-lg border border-purple-200 hover:bg-purple-100 hover:border-purple-300 active:bg-purple-200 active:border-purple-400 transition-all duration-200 transform hover:scale-105 active:scale-102 touch-manipulation shadow-sm hover:shadow-md">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Camera className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
            <span className="font-medium text-xs md:text-sm text-purple-800 truncate">총 사진</span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-purple-900 mt-0.5 md:mt-1">
            <AnimatedCounter
              value={statistics.totalPhotosAllPhases || 0}
              duration={1000}
              className="inline-block"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 md:space-y-6">
        {/* 배출구별 시설 */}
        {outlets.map(outlet => {
          const outletData = outletFacilities[outlet];
          const outletPrevention = outletData.prevention || [];
          const outletDischarge = outletData.discharge || [];

          return (
            <div key={outlet} className="bg-white rounded-lg p-2 md:p-4 border border-gray-200">
              <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-800 px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-medium">
                  배출구 {outlet}
                </span>
              </h3>

              {/* 방지시설 */}
              {outletPrevention.length > 0 && (
                <div className="mb-3 md:mb-6">
                  <h4 className="text-sm md:text-md font-medium text-green-600 mb-2 md:mb-3 flex items-center gap-1.5 md:gap-2">
                    <Shield className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    방지시설 ({outletPrevention.reduce((total, f) => total + f.quantity, 0)}개)
                  </h4>
                  
                  {/* 방지시설 인라인 진행률 표시기 - REMOVED: SmartFloatingProgress로 대체 */}
                  
                  {outletPrevention.map((facility, facilityIdx) =>
                    Array.from({ length: facility.quantity }, (_, quantityIndex) => {
                      const instanceIndex = quantityIndex + 1;

                      // 🎯 대기필증 관리의 올바른 시설번호 적용 (먼저 계산)
                      // 🔧 quantityIndex와 facilityIdx를 전달하여 각 개별 시설의 고유 번호 획득
                      const correctNumber = getCorrectFacilityNumber('prevention', facility, quantityIndex, facilityIdx);
                      const facilityWithCorrectNumber = { ...facility, number: correctNumber };

                      // ✅ correctNumber를 사용하여 키 생성
                      const uploadKey = `prevention-${facility.outlet}-${correctNumber}-${facility.capacity}-${instanceIndex}`;
                      const isUploading = uploading[uploadKey];
                      const progress = uploadProgress[uploadKey] || 0;

                      // ✅ correctNumber와 instanceIndex를 사용하여 사진 조회 (다중 시설 구분)
                      const rawPhotos = photoTracker.getFacilityPhotos('prevention', correctNumber, facility.outlet, undefined, instanceIndex);
                      const facilityPhotos = getFilteredPhotos(rawPhotos);

                      return (
                        <FacilityCard
                          key={`prevention-${facility.outlet}-${correctNumber}-${facility.capacity}-${facilityIdx}-${instanceIndex}`}
                          facility={facilityWithCorrectNumber}
                          facilityType="prevention"
                          instanceIndex={instanceIndex}
                          isUploading={isUploading}
                          progress={progress}
                          photos={facilityPhotos}
                          onUpload={(files) => handleFacilityUpload(files, 'prevention', facilityWithCorrectNumber, instanceIndex)}
                          onPhotoSelect={handlePhotoSelect}
                          viewMode={viewMode}
                          dragHandlers={createDragHandlers(
                            uploadKey,
                            (files) => handleFacilityUpload(files, 'prevention', facilityWithCorrectNumber, instanceIndex)
                          )}
                          dragZoneStyles={getDragZoneStyles}
                          recentPhotoIds={recentPhotoIds}
                          businessName={businessName}
                          loadUploadedFiles={loadUploadedFiles}
                          photoTracker={photoTracker}
                          setStatistics={setStatistics}
                        />
                      );
                    })
                  ).flat()}
                </div>
              )}
              
              {/* 배출시설 */}
              {outletDischarge.length > 0 && (
                <div>
                  <h4 className="text-sm md:text-md font-medium text-orange-600 mb-2 md:mb-3 flex items-center gap-1.5 md:gap-2">
                    <Factory className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    배출시설 ({outletDischarge.reduce((total, f) => total + f.quantity, 0)}개)
                  </h4>
                  
                  {/* 배출시설 인라인 진행률 표시기 - REMOVED: SmartFloatingProgress로 대체 */}
                  
                  {outletDischarge.map((facility, facilityIdx) =>
                    Array.from({ length: facility.quantity }, (_, quantityIndex) => {
                      const instanceIndex = quantityIndex + 1;

                      // 🎯 대기필증 관리의 올바른 시설번호 적용 (먼저 계산)
                      // 🔧 quantityIndex와 facilityIdx를 전달하여 각 개별 시설의 고유 번호 획득
                      const correctNumber = getCorrectFacilityNumber('discharge', facility, quantityIndex, facilityIdx);
                      const facilityWithCorrectNumber = { ...facility, number: correctNumber };

                      // ✅ correctNumber를 사용하여 키 생성
                      const uploadKey = `discharge-${facility.outlet}-${correctNumber}-${facility.capacity}-${instanceIndex}`;
                      const isUploading = uploading[uploadKey];
                      const progress = uploadProgress[uploadKey] || 0;

                      // ✅ correctNumber와 instanceIndex를 사용하여 사진 조회 (다중 시설 구분)
                      const rawPhotos = photoTracker.getFacilityPhotos('discharge', correctNumber, facility.outlet, undefined, instanceIndex);
                      const facilityPhotos = getFilteredPhotos(rawPhotos);

                      return (
                        <FacilityCard
                          key={`discharge-${facility.outlet}-${correctNumber}-${facility.capacity}-${facilityIdx}-${instanceIndex}`}
                          facility={facilityWithCorrectNumber}
                          facilityType="discharge"
                          instanceIndex={instanceIndex}
                          isUploading={isUploading}
                          progress={progress}
                          photos={facilityPhotos}
                          onUpload={(files) => handleFacilityUpload(files, 'discharge', facilityWithCorrectNumber, instanceIndex)}
                          onPhotoSelect={handlePhotoSelect}
                          viewMode={viewMode}
                          dragHandlers={createDragHandlers(
                            uploadKey,
                            (files) => handleFacilityUpload(files, 'discharge', facilityWithCorrectNumber, instanceIndex)
                          )}
                          dragZoneStyles={getDragZoneStyles}
                          recentPhotoIds={recentPhotoIds}
                          businessName={businessName}
                          loadUploadedFiles={loadUploadedFiles}
                          photoTracker={photoTracker}
                          setStatistics={setStatistics}
                        />
                      );
                    })
                  ).flat()}
                </div>
              )}
            </div>
          );
        })}

        {/* 기본사진 섹션 - 모바일 간격 최적화 */}
        <div className="bg-white rounded-lg p-2 md:p-4 border border-gray-200">
          <h3 className="text-base md:text-lg font-semibold text-gray-800 mb-2 md:mb-6 flex items-center gap-1.5 md:gap-2">
            <Building2 className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
            기본사진
          </h3>

          {/* 기본사진 인라인 진행률 표시기 - REMOVED: SmartFloatingProgress로 대체 */}

          <div className="space-y-2 md:space-y-6">
            {/* 게이트웨이 */}
            <BasicPhotoCategory
              category="gateway"
              title="게이트웨이"
              icon={<Router className="w-4 h-4" />}
              color="purple"
              isUploading={uploading['basic-gateway']}
              progress={uploadProgress['basic-gateway'] || 0}
              photos={getFilteredPhotos(photoTracker.getFacilityPhotos('basic', undefined, undefined, 'gateway'))}
              onUpload={(files) => handleBasicUpload(files, 'gateway')}
              onPhotoSelect={handlePhotoSelect}
              viewMode={viewMode}
              dragHandlers={createDragHandlers(
                'basic-gateway',
                (files) => handleBasicUpload(files, 'gateway')
              )}
              dragZoneStyles={getDragZoneStyles}
              recentPhotoIds={recentPhotoIds}
              businessName={businessName}
              loadUploadedFiles={loadUploadedFiles}
              photoTracker={photoTracker}
              setStatistics={setStatistics}
            />

            {/* 송풍팬 - 배출구별 섹션 🆕 */}
            {outletNumbers.length > 0 ? (
              outletNumbers.map((outletNumber) => {
                const outletKey = `fan-outlet-${outletNumber}`;
                // 배출구별 송풍팬 사진 필터링
                const outletFanPhotos = photoTracker.getFacilityPhotos('basic', undefined, outletNumber, 'fan');

                return (
                  <BasicPhotoCategory
                    key={outletKey}
                    category="fan"
                    title={`송풍팬 (배출구 ${outletNumber})`}
                    icon={<Zap className="w-4 h-4" />}
                    color="cyan"
                    isUploading={uploading[outletKey]}
                    progress={uploadProgress[outletKey] || 0}
                    photos={getFilteredPhotos(outletFanPhotos)}
                    onUpload={(files) => handleBasicUpload(files, 'fan', outletNumber)}
                    onPhotoSelect={handlePhotoSelect}
                    viewMode={viewMode}
                    dragHandlers={createDragHandlers(
                      outletKey,
                      (files) => {
                        console.log(`🎯 [UI-DRAG] dragHandlers 호출:`, {
                          배출구번호: outletNumber,
                          파일수: files.length
                        });
                        return handleBasicUpload(files, 'fan', outletNumber);
                      }
                    )}
                    dragZoneStyles={getDragZoneStyles}
                    recentPhotoIds={recentPhotoIds}
                    businessName={businessName}
                    loadUploadedFiles={loadUploadedFiles}
                    photoTracker={photoTracker}
                    setStatistics={setStatistics}
                  />
                );
              })
            ) : (
              /* 배출구 정보가 없을 때 기존 단일 섹션 표시 (하위 호환성) */
              <BasicPhotoCategory
                category="fan"
                title="송풍팬"
                icon={<Zap className="w-4 h-4" />}
                color="cyan"
                isUploading={uploading['basic-fan']}
                progress={uploadProgress['basic-fan'] || 0}
                photos={getFilteredPhotos(photoTracker.getFacilityPhotos('basic', undefined, undefined, 'fan'))}
                onUpload={(files) => handleBasicUpload(files, 'fan')}
                onPhotoSelect={handlePhotoSelect}
                viewMode={viewMode}
                dragHandlers={createDragHandlers(
                  'basic-fan',
                  (files) => handleBasicUpload(files, 'fan')
                )}
                dragZoneStyles={getDragZoneStyles}
                recentPhotoIds={recentPhotoIds}
                businessName={businessName}
                loadUploadedFiles={loadUploadedFiles}
                photoTracker={photoTracker}
                setStatistics={setStatistics}
              />
            )}

            {/* 기타 */}
            <BasicPhotoCategory
              category="others"
              title="기타"
              icon={<Building2 className="w-4 h-4" />}
              color="gray"
              isUploading={uploading['basic-others']}
              progress={uploadProgress['basic-others'] || 0}
              photos={getFilteredPhotos(photoTracker.getFacilityPhotos('basic', undefined, undefined, 'others'))}
              onUpload={(files) => handleBasicUpload(files, 'others')}
              onPhotoSelect={handlePhotoSelect}
              viewMode={viewMode}
              dragHandlers={createDragHandlers(
                'basic-others',
                (files) => handleBasicUpload(files, 'others')
              )}
              dragZoneStyles={getDragZoneStyles}
              recentPhotoIds={recentPhotoIds}
              businessName={businessName}
              loadUploadedFiles={loadUploadedFiles}
              photoTracker={photoTracker}
              setStatistics={setStatistics}
            />
          </div>
        </div>
      </div>

      {/* 사진 상세 모달 */}
      {selectedPhoto && modalPosition && (
        <PhotoDetailModal
          ref={modalRef}
          photo={selectedPhoto}
          position={modalPosition}
          onClose={() => { setSelectedPhoto(null); setModalPosition(null); }}
          onDelete={() => deletePhoto(selectedPhoto)}
        />
      )}
      
      {/* 모바일 스티키 진행률 표시기 - REMOVED: SmartFloatingProgress로 대체 */}
    </div>
    </>
  );
}

// 시설 카드 컴포넌트
interface FacilityCardProps {
  facility: Facility;
  facilityType: 'discharge' | 'prevention';
  instanceIndex: number;
  isUploading: boolean;
  progress: number;
  photos: FacilityPhoto[];
  onUpload: (files: FileList) => void;
  onPhotoSelect: (photo: FacilityPhoto, event: React.MouseEvent) => void;
  viewMode: ViewMode;
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  dragZoneStyles: (zoneId: string, baseStyles?: string) => string;
  recentPhotoIds?: Set<string>;
  businessName: string;
  loadUploadedFiles: (forceRefresh?: boolean, highlightNew?: boolean) => Promise<void>;
  // 통계 업데이트를 위한 props 추가
  photoTracker: ReturnType<typeof createFacilityPhotoTracker>;
  setStatistics: React.Dispatch<React.SetStateAction<{
    totalFacilities: number;
    totalPhotos: number;
    dischargeFacilities: number;
    preventionFacilities: number;
    basicCategories: number;
  }>>;
}

function FacilityCard({
  facility,
  facilityType,
  instanceIndex,
  isUploading,
  progress,
  photos,
  onUpload,
  onPhotoSelect,
  viewMode,
  dragHandlers,
  dragZoneStyles,
  recentPhotoIds,
  businessName,
  loadUploadedFiles,
  photoTracker,
  setStatistics
}: FacilityCardProps) {
  const displayNumber = `${facilityType === 'discharge' ? '배' : '방'}${facility.number}${facility.quantity > 1 ? `-${instanceIndex}` : ''}`;
  const colorScheme = facilityType === 'discharge' ? 'orange' : 'green';

  return (
    <div className={`bg-${colorScheme}-50 border border-${colorScheme}-200 rounded-lg p-4 mb-3`}>
      {/* 시설 정보 */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`bg-${colorScheme}-600 text-white px-2 py-1 rounded text-sm font-medium`}>
          {displayNumber}
        </span>
        <span className="text-gray-600 text-sm">배출구 {facility.outlet}</span>
        {facility.quantity > 1 && (
          <span className={`text-xs bg-${colorScheme}-100 text-${colorScheme}-700 px-2 py-1 rounded`}>
            {instanceIndex}/{facility.quantity}
          </span>
        )}
        <span className={`text-xs bg-${colorScheme}-100 text-${colorScheme}-700 px-2 py-1 rounded ml-auto`}>
          {photos.length}장
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <span className="text-sm text-gray-600 font-medium">시설명:</span>
          <div className="text-gray-900 font-semibold">{facility.name}</div>
        </div>
        <div>
          <span className="text-sm text-gray-600 font-medium">용량:</span>
          <div className="text-gray-900 font-semibold">{facility.capacity}</div>
        </div>
        <div>
          <span className="text-sm text-gray-600 font-medium">수량:</span>
          <div className="text-gray-900 font-semibold">{facility.quantity}개</div>
        </div>
      </div>

      {/* 촬영 가이드 */}
      <div className={`mb-3 p-3 bg-${colorScheme}-50 border border-${colorScheme}-200 rounded-lg`}>
        <p className={`text-xs text-${colorScheme}-700 font-medium mb-1`}>📸 필요 사진:</p>
        {facilityType === 'prevention' && facility.fan ? (
          // 송풍팬 (방지시설 중 fan 필드가 있는 경우)
          <ul className={`text-xs text-${colorScheme}-600 space-y-0.5 ml-4`}>
            <li>• 송풍팬</li>
            <li>• 송풍시설 명판 (문자 식별 가능하도록 촬영)</li>
            <li>• 분전함 외부 (주위가 넓게 보이도록 촬영)</li>
            <li>• 분전함 내부</li>
            <li>• 전류계 (문자 식별 가능하도록 촬영)</li>
          </ul>
        ) : facilityType === 'prevention' ? (
          // 일반 방지시설
          <ul className={`text-xs text-${colorScheme}-600 space-y-0.5 ml-4`}>
            <li>• 방지시설</li>
            <li>• 방지시설 명판 (문자 식별 가능하도록 촬영)</li>
            <li>• 온도계</li>
            <li>• 차압계 (차압값 식별 가능하도록)</li>
          </ul>
        ) : (
          // 배출시설
          <ul className={`text-xs text-${colorScheme}-600 space-y-0.5 ml-4`}>
            <li>• 배출시설</li>
            <li>• 분전함 외부 (동일한 분전함이라도 시설별 각각 첨부)</li>
            <li>• 분전함 내부</li>
            <li>• 전류계 (문자 식별 가능하도록)</li>
          </ul>
        )}
      </div>

      {/* 업로드 진행률 */}
      {isUploading && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>업로드 중...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`bg-${colorScheme}-600 h-2 rounded-full transition-all duration-300`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 파일 업로드 영역 */}
      <div className="relative mb-3">
        <input
          type="file"
          id={`upload-${facilityType}-${facility.outlet}-${facility.number}-${instanceIndex}`}
          multiple
          accept="image/*"
          onChange={(e) => e.target.files && onUpload(e.target.files)}
          disabled={isUploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        />
        <div 
          className={dragZoneStyles(
            `${facilityType}-${facility.outlet}-${facility.number}-${instanceIndex}`,
            `border-2 border-dashed border-${colorScheme}-300 rounded-lg p-4 text-center transition-all duration-200
            ${isUploading ? `bg-${colorScheme}-100 border-${colorScheme}-400` : `hover:border-${colorScheme}-400 hover:bg-${colorScheme}-50 active:bg-${colorScheme}-100 active:border-${colorScheme}-500 active:scale-98`}
            ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}
            touch-manipulation select-none
            min-h-[120px] md:min-h-[100px]
            shadow-sm hover:shadow-md active:shadow-lg
            transform-gpu`
          )}
          {...dragHandlers}
        >
          <Upload className={`w-10 h-10 md:w-8 md:h-8 text-${colorScheme}-600 mx-auto mb-2 transition-transform duration-200 ${isUploading ? 'animate-pulse' : ''}`} />
          <p className={`text-${colorScheme}-700 font-medium text-base md:text-sm`}>
            {isUploading ? '업로드 중...' : '사진 업로드'}
          </p>
          <p className={`text-${colorScheme}-600 text-sm mt-1 leading-relaxed`}>
            {isUploading ? '잠시만 기다려주세요...' : '터치하거나 파일을 끌어다 놓으세요'}
          </p>
        </div>
      </div>

      {/* 업로드된 사진들 */}
      {photos.length > 0 && (
        <InlinePhotoViewer
          photos={photos}
          onPhotoSelect={onPhotoSelect}
          viewMode={viewMode}
          colorScheme={colorScheme}
          recentPhotoIds={recentPhotoIds}
          businessName={businessName}
          facilityType={facilityType}
          facilityNumber={facility.number}
          outletNumber={facility.outlet}
          category={undefined}
          loadUploadedFiles={loadUploadedFiles}
          photoTracker={photoTracker}
          setStatistics={setStatistics}
        />
      )}
    </div>
  );
}

// 기본사진 카테고리 컴포넌트
interface BasicPhotoCategoryProps {
  category: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  isUploading: boolean;
  progress: number;
  photos: FacilityPhoto[];
  onUpload: (files: FileList) => void;
  onPhotoSelect: (photo: FacilityPhoto, event: React.MouseEvent) => void;
  viewMode: ViewMode;
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  dragZoneStyles: (zoneId: string, baseStyles?: string) => string;
  recentPhotoIds?: Set<string>;
  businessName: string;
  loadUploadedFiles: (forceRefresh?: boolean, highlightNew?: boolean) => Promise<void>;
  // 통계 업데이트를 위한 props 추가
  photoTracker: ReturnType<typeof createFacilityPhotoTracker>;
  setStatistics: React.Dispatch<React.SetStateAction<{
    totalFacilities: number;
    totalPhotos: number;
    dischargeFacilities: number;
    preventionFacilities: number;
    basicCategories: number;
  }>>;
}

function BasicPhotoCategory({
  category,
  title,
  icon,
  color,
  isUploading,
  progress,
  photos,
  onUpload,
  onPhotoSelect,
  viewMode,
  dragHandlers,
  dragZoneStyles,
  recentPhotoIds,
  businessName,
  loadUploadedFiles,
  photoTracker,
  setStatistics
}: BasicPhotoCategoryProps) {
  return (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-lg p-4`}>
      <h4 className={`text-md font-medium text-${color}-700 mb-3 flex items-center gap-2`}>
        {icon}
        {title}
        <span className={`text-xs bg-${color}-100 text-${color}-700 px-2 py-1 rounded ml-auto`}>
          {photos.length}장
        </span>
      </h4>
      
      {/* 업로드 진행률 */}
      {isUploading && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>업로드 중...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`bg-${color}-600 h-2 rounded-full transition-all duration-300`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 촬영 가이드 */}
      {category === 'gateway' && (
        <div className={`mb-3 p-3 bg-${color}-50 border border-${color}-200 rounded-lg`}>
          <p className={`text-xs text-${color}-700 font-medium mb-1`}>📸 필요 사진:</p>
          <ul className={`text-xs text-${color}-600 space-y-0.5 ml-4`}>
            <li>• 게이트웨이 인근 (측정기기 주위가 넓게 보이도록 촬영)</li>
            <li>• 게이트웨이 외부</li>
            <li>• 게이트웨이 내부</li>
            <li>• VPN</li>
            <li>• CT포트</li>
            <li>• 내부 패널 뒷면</li>
            <li>• 게이트웨이 화면 (전체)</li>
          </ul>
        </div>
      )}

      {category === 'fan' && (
        <div className={`mb-3 p-3 bg-${color}-50 border border-${color}-200 rounded-lg`}>
          <p className={`text-xs text-${color}-700 font-medium mb-1`}>📸 필요 사진:</p>
          <ul className={`text-xs text-${color}-600 space-y-0.5 ml-4`}>
            <li>• 송풍팬</li>
            <li>• 송풍시설 명판 (문자 식별 가능하도록 촬영)</li>
            <li>• 분전함 외부 (주위가 넓게 보이도록 촬영)</li>
            <li>• 분전함 내부</li>
            <li>• 전류계 (문자 식별 가능하도록 촬영)</li>
          </ul>
        </div>
      )}

      {/* 업로드 영역 */}
      <div className="relative mb-3">
        <input
          type="file"
          id={`upload-${category}`}
          multiple
          accept="image/*"
          onChange={(e) => e.target.files && onUpload(e.target.files)}
          disabled={isUploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        />
        <div
          className={dragZoneStyles(
            `basic-${category}`,
            `border-2 border-dashed border-${color}-300 rounded-lg p-4 text-center transition-all duration-200
            ${isUploading ? `bg-${color}-100 border-${color}-400` : `hover:border-${color}-400 hover:bg-${color}-50`}
            ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}`
          )}
          {...dragHandlers}
        >
          <Upload className={`w-8 h-8 text-${color}-600 mx-auto mb-2 transition-transform duration-200`} />
          <p className={`text-${color}-700 font-medium`}>
            {isUploading ? '업로드 중...' : `${title} 사진 업로드`}
          </p>
          <p className={`text-${color}-600 text-sm mt-1`}>
            클릭하거나 파일을 드래그하여 업로드
          </p>
        </div>
      </div>

      {/* 업로드된 사진들 */}
      {photos.length > 0 && (
        <InlinePhotoViewer
          photos={photos}
          onPhotoSelect={onPhotoSelect}
          viewMode={viewMode}
          colorScheme={color}
          recentPhotoIds={recentPhotoIds}
          businessName={businessName}
          facilityType="basic"
          facilityNumber={undefined}
          outletNumber={undefined}
          category={category}
          loadUploadedFiles={loadUploadedFiles}
          photoTracker={photoTracker}
          setStatistics={setStatistics}
        />
      )}
    </div>
  );
}

// 인라인 확장 사진 뷰어 컴포넌트
interface InlinePhotoViewerProps {
  photos: FacilityPhoto[];
  onPhotoSelect: (photo: FacilityPhoto, event: React.MouseEvent) => void;
  viewMode: ViewMode;
  colorScheme: string;
  recentPhotoIds?: Set<string>;
  // 시설 정보 추가
  businessName: string;
  facilityType?: 'discharge' | 'prevention' | 'basic';
  facilityNumber?: number;
  outletNumber?: number;
  category?: string;
  loadUploadedFiles: (forceRefresh?: boolean, highlightNew?: boolean) => Promise<void>;
  // 통계 업데이트를 위한 props 추가
  photoTracker: ReturnType<typeof createFacilityPhotoTracker>;
  setStatistics: React.Dispatch<React.SetStateAction<{
    totalFacilities: number;
    totalPhotos: number;
    dischargeFacilities: number;
    preventionFacilities: number;
    basicCategories: number;
  }>>;
}

function InlinePhotoViewer({ photos, onPhotoSelect, viewMode, colorScheme, recentPhotoIds, businessName, facilityType, facilityNumber, outletNumber, category, loadUploadedFiles, photoTracker, setStatistics }: InlinePhotoViewerProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const expandedRef = useRef<HTMLDivElement>(null);
  const expandedContentRef = useRef<HTMLDivElement>(null);
  
  // 📷 메인 컴포넌트에서 이미 getFilteredPhotos()로 필터링된 배열을 받음
  // 따라서 추가 필터링 불필요, photos를 직접 사용

  // 사진 클릭 핸들러 - 인라인 확장
  const handlePhotoClick = useCallback((photo: FacilityPhoto, index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (expandedIndex === index) {
      // 이미 확장된 사진을 다시 클릭하면 닫기
      setExpandedIndex(null);
    } else {
      setIsAnimating(true);
      setExpandedIndex(index);
      
      // 확장 애니메이션 후 스크롤
      setTimeout(() => {
        expandedRef.current?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'nearest'
        });
        setIsAnimating(false);
      }, 100);
    }
  }, [expandedIndex]);

  // 키보드 네비게이션 및 외부 클릭 처리
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (expandedIndex === null) return;

      switch (event.key) {
        case 'Escape':
          setExpandedIndex(null);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          setExpandedIndex(prev => prev === null ? null : Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          event.preventDefault();
          setExpandedIndex(prev => prev === null ? null : Math.min(photos.length - 1, prev + 1));
          break;
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (expandedIndex === null) return;
      
      // 확장된 뷰어 내부를 클릭한 경우는 닫지 않음
      if (expandedContentRef.current?.contains(event.target as Node)) {
        return;
      }
      
      // 확장 영역 외부 클릭 시 닫기
      if (expandedRef.current && !expandedRef.current.contains(event.target as Node)) {
        setExpandedIndex(null);
      }
    };

    if (expandedIndex !== null) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedIndex, photos.length]);

  // 🔄 사진 삭제 후 인덱스 자동 조정 (안전망)
  useEffect(() => {
    if (expandedIndex === null) return;

    console.log('🔍 [INDEX-SAFETY-CHECK]', {
      expandedIndex,
      photosLength: photos.length,
      isOutOfBounds: expandedIndex >= photos.length
    });

    // photos 배열 길이가 변경되어 인덱스가 범위를 벗어난 경우
    if (expandedIndex >= photos.length && photos.length > 0) {
      // 마지막 사진으로 자동 조정
      const lastIndex = photos.length - 1;
      console.log(`⚠️ [INDEX-OUT-OF-BOUNDS] 인덱스 범위 초과 - 마지막 사진으로 조정 (${expandedIndex} → ${lastIndex})`);
      setExpandedIndex(lastIndex);
    } else if (photos.length === 0) {
      // 모든 사진이 삭제되면 모달 닫기
      console.log('❌ [ALL-PHOTOS-DELETED] 모든 사진 삭제됨 - 모달 닫기');
      setExpandedIndex(null);
    }
  }, [photos.length, expandedIndex]);

  // 썸네일 그리드 렌더링
  const renderThumbnailGrid = () => {
    if (viewMode === 'list') {
      return (
        <div className="space-y-2">
          {photos.map((photo, index) => {
            const isRecentPhoto = recentPhotoIds?.has(photo.id);
            const isExpanded = expandedIndex === index;
            
            return (
              <div key={photo.id}>
                <div 
                  className={`flex items-center gap-3 p-2 bg-white rounded border cursor-pointer transition-all duration-300 ${
                    isExpanded ? 
                      `border-${colorScheme}-600 bg-${colorScheme}-100 shadow-md` :
                      isRecentPhoto ? 
                        `ring-2 ring-${colorScheme}-400 border-${colorScheme}-400 bg-${colorScheme}-50 animate-pulse shadow-lg` : 
                        `hover:border-${colorScheme}-400 border-gray-200`
                  }`}
                  onClick={(e) => handlePhotoClick(photo, index, e)}
                >
                  <div className={`w-12 h-12 bg-${colorScheme}-100 rounded flex items-center justify-center text-${colorScheme}-600 font-bold text-sm`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{photo.originalFileName}</div>
                    <div className="text-xs text-gray-500">
                      {(photo.fileSize / 1024 / 1024).toFixed(1)}MB • {new Date(photo.uploadedAt).toLocaleString()}
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-gray-400" />
                </div>
                
                {/* 인라인 확장 영역 - 리스트 모드 */}
                {isExpanded && (
                  <div 
                    ref={expandedRef}
                    className={`mt-3 mb-3 bg-white border-2 border-${colorScheme}-200 rounded-lg overflow-hidden transition-all duration-300 ${
                      isAnimating ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'
                    }`}
                  >
                    <div ref={expandedContentRef}>
                      <ExpandedPhotoSection
                        photo={photo}
                        photos={photos}
                        currentIndex={index}
                        colorScheme={colorScheme}
                        onNavigate={setExpandedIndex}
                        onClose={() => setExpandedIndex(null)}
                        onRefresh={() => loadUploadedFiles(true, true)}
                        businessName={businessName}
                        facilityType={facilityType}
                        facilityNumber={facilityNumber}
                        outletNumber={outletNumber}
                        category={category}
                        photoTracker={photoTracker}
                        setStatistics={setStatistics}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // 그리드 모드
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1 md:gap-3">
          {photos.map((photo, index) => {
            const isRecentPhoto = recentPhotoIds?.has(photo.id);
            const isExpanded = expandedIndex === index;
            
            return (
              <div 
                key={photo.id}
                className={`relative group cursor-pointer bg-white rounded-lg border-2 overflow-hidden aspect-[4/3] transition-all duration-300 ${
                  isExpanded ? 
                    `border-${colorScheme}-600 shadow-xl ring-2 ring-${colorScheme}-300` :
                    isRecentPhoto ? 
                      `border-${colorScheme}-400 shadow-xl ring-4 ring-${colorScheme}-200 animate-pulse transform scale-[1.02]` : 
                      `border-gray-200 hover:border-${colorScheme}-400 hover:shadow-md`
                }`}
                onClick={(e) => handlePhotoClick(photo, index, e)}
              >
                <div className={`absolute top-2 left-2 bg-${colorScheme}-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center z-10`}>
                  {index + 1}
                </div>
                
                <LazyImage
                  src={photo.thumbnailUrl}
                  alt={photo.originalFileName}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  filePath={photo.filePath}
                />
                
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                  <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-white text-xs font-medium truncate">
                    {index + 1}번째 - {photo.originalFileName}
                  </p>
                </div>
                
                {photo.isRecent && (
                  <div className={`absolute inset-0 bg-${colorScheme}-400 bg-opacity-20 animate-pulse`} />
                )}
              </div>
            );
          })}
        </div>
        
        {/* 인라인 확장 영역 - 그리드 모드 */}
        {expandedIndex !== null && (
          <div 
            ref={expandedRef}
            className={`bg-white border-2 border-${colorScheme}-200 rounded-lg overflow-hidden transition-all duration-300 ${
              isAnimating ? 'opacity-0 transform scale-95' : 'opacity-100 transform scale-100'
            }`}
          >
            <div ref={expandedContentRef}>
              <ExpandedPhotoSection
                photo={photos[expandedIndex]}
                photos={photos}
                currentIndex={expandedIndex}
                colorScheme={colorScheme}
                onNavigate={setExpandedIndex}
                onClose={() => setExpandedIndex(null)}
                onRefresh={() => loadUploadedFiles(true, true)}
                businessName={businessName}
                facilityType={facilityType}
                facilityNumber={facilityNumber}
                outletNumber={outletNumber}
                category={category}
                photoTracker={photoTracker}
                setStatistics={setStatistics}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return renderThumbnailGrid();
}

// 확장된 사진 섹션 컴포넌트
interface ExpandedPhotoSectionProps {
  photo: FacilityPhoto;
  photos: FacilityPhoto[];
  currentIndex: number;
  colorScheme: string;
  onNavigate: (index: number) => void;
  onClose: () => void;
  onRefresh?: () => Promise<void>; // 삭제 후 새로고침 콜백 추가
  // 시설 정보 추가
  businessName: string;
  facilityType?: 'discharge' | 'prevention' | 'basic';
  facilityNumber?: number;
  // Jotai 삭제 함수들은 컴포넌트 내부에서 직접 사용
  outletNumber?: number;
  category?: string;
  // 통계 업데이트를 위한 props 추가
  photoTracker: ReturnType<typeof createFacilityPhotoTracker>;
  setStatistics: React.Dispatch<React.SetStateAction<{
    totalFacilities: number;
    totalPhotos: number;
    dischargeFacilities: number;
    preventionFacilities: number;
    basicCategories: number;
  }>>;
}

function ExpandedPhotoSection({
  photo,
  photos,
  currentIndex,
  colorScheme,
  onNavigate,
  onClose,
  onRefresh,
  businessName,
  facilityType,
  facilityNumber,
  outletNumber,
  category,
  photoTracker,
  setStatistics
}: ExpandedPhotoSectionProps) {
  const toast = useToast();
  
  // 🔧 ExpandedPhotoSection에서 직접 Jotai 사용
  const markPhotoAsDeleted = useSetAtom(deletePhotoAtom);
  const markPhotoAsUndeleted = useSetAtom(undeletePhotoAtom);
  
  console.log('🔧 [EXPANDED-SCOPE] ExpandedPhotoSection에서 Jotai 함수 직접 정의:', !!markPhotoAsDeleted);

  // 🛡️ 개선된 방어 코드: photo가 undefined인 경우 스마트 복구 시도
  if (!photo) {
    console.warn('⚠️ [EXPANDED-PHOTO] photo 객체가 undefined입니다.');

    // 다음 사진으로 이동 시도
    if (currentIndex < photos.length - 1) {
      console.log(`➡️ [AUTO-RECOVER] 다음 사진으로 자동 복구 (index: ${currentIndex} → ${currentIndex + 1})`);
      onNavigate(currentIndex + 1);
      return null;
    }

    // 이전 사진으로 이동 시도
    if (currentIndex > 0 && photos.length > 0) {
      console.log(`⬅️ [AUTO-RECOVER] 이전 사진으로 자동 복구 (index: ${currentIndex} → ${currentIndex - 1})`);
      onNavigate(currentIndex - 1);
      return null;
    }

    // 남은 사진이 없으면 모달 닫기
    console.log('❌ [NO-RECOVERY] 복구 불가능 - 모달 닫기');
    onClose();
    return null;
  }
  
  // 개별 다운로드
  const handleDownload = async () => {
    try {
      console.log('📥 [INDIVIDUAL-DOWNLOAD] 개별 다운로드 시작:', {
        photoId: photo.id,
        fileName: photo.originalFileName,
        currentIndex,
        totalPhotos: photos.length
      });
      
      // API를 통한 다운로드
      const response = await fetch(`/api/facility-photos/${photo.id}?download=true`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // 파일이 삭제되었을 가능성
          toast.warning('파일 없음', '이 파일은 삭제되었거나 이동되었습니다. 페이지를 새로고침합니다.');
          if (onRefresh) {
            await onRefresh();
          }
          return;
        }
        
        const errorData = await response.json();
        throw new Error(errorData.error || '다운로드 요청 실패');
      }
      
      // Blob으로 파일 데이터 받기
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // 다운로드 링크 생성 및 클릭
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.originalFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 메모리 정리
      window.URL.revokeObjectURL(url);
      
      console.log('✅ [INDIVIDUAL-DOWNLOAD] 다운로드 완료:', photo.originalFileName);
      toast.success('다운로드 완료', `${photo.originalFileName} 파일이 다운로드되었습니다.`);
      
    } catch (error) {
      console.error('❌ [INDIVIDUAL-DOWNLOAD] 다운로드 실패:', error);
      toast.error('다운로드 실패', error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    }
  };

  // 전체 ZIP 다운로드
  const handleDownloadAll = async () => {
    try {
      const requestBody = {
        businessName,
        facilityType,
        facilityNumber,
        outletNumber,
        category
      };

      console.log('📦 [ZIP-DOWNLOAD] 요청 시작:', requestBody);

      const response = await fetch('/api/facility-photos/download-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'ZIP 다운로드 요청 실패');
      }

      // ZIP 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Content-Disposition 헤더에서 파일명 추출
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = '사진모음.zip';
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename\*?=['"]?([^'"]+)['"]?/);
        if (fileNameMatch) {
          fileName = decodeURIComponent(fileNameMatch[1]);
        }
      }

      // 다운로드 링크 생성 및 클릭
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      
      // 정리
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('✅ [ZIP-DOWNLOAD] 다운로드 완료:', fileName);
      
    } catch (error) {
      console.error('❌ [ZIP-DOWNLOAD] 오류:', error);
      alert(`ZIP 다운로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  return (
    <div className="p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`bg-${colorScheme}-600 text-white px-3 py-1 rounded-full text-sm font-medium`}>
            {currentIndex + 1} / {photos.length}
          </span>
          <h3 className="font-semibold text-gray-900 truncate">
            {photo?.originalFileName || photo?.fileName || '파일명 없음'}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="닫기 (ESC)"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* 메인 레이아웃: 좌측 메인사진 + 우측 썸네일 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* 좌측: 메인 사진 */}
        <div className="lg:col-span-2">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: '400px', maxHeight: '600px' }}>
            <LazyImage
              src={photo.downloadUrl}
              alt={photo.originalFileName}
              className="max-w-full max-h-full object-contain"
              filePath={photo.filePath}
            />
            
            {/* 네비게이션 화살표 */}
            {currentIndex > 0 && (
              <button
                onClick={() => onNavigate(currentIndex - 1)}
                className={`absolute left-2 top-1/2 transform -translate-y-1/2 bg-${colorScheme}-600 text-white p-2 rounded-full hover:bg-${colorScheme}-700 transition-colors`}
                title="이전 사진 (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            
            {currentIndex < photos.length - 1 && (
              <button
                onClick={() => onNavigate(currentIndex + 1)}
                className={`absolute right-2 top-1/2 transform -translate-y-1/2 bg-${colorScheme}-600 text-white p-2 rounded-full hover:bg-${colorScheme}-700 transition-colors`}
                title="다음 사진 (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
          
          {/* 사진 정보 */}
          <div className="mt-2 text-sm text-gray-600">
            <div>{(photo.fileSize / 1024 / 1024).toFixed(1)}MB • {new Date(photo.uploadedAt).toLocaleString()}</div>
          </div>

          {/* 사진 설명(Caption) 입력 섹션 🆕 */}
          <div className="mt-4">
            <PhotoCaptionInput
              photo={{
                id: photo.id,
                name: photo.fileName,
                originalName: photo.originalFileName,
                mimeType: 'image/jpeg',
                size: photo.fileSize,
                createdTime: new Date(photo.uploadedAt).toISOString(),
                webViewLink: photo.downloadUrl,
                downloadUrl: photo.downloadUrl,
                thumbnailUrl: photo.downloadUrl,
                folderName: photo.categoryPath,
                uploadStatus: 'uploaded',
                filePath: photo.filePath,
                caption: photo.caption
              }}
              onCaptionSaved={(caption) => {
                console.log('✅ Caption saved in ExpandedPhotoSection:', caption);
              }}
            />
          </div>
        </div>

        {/* 우측: 썸네일 리스트 */}
        <div className="lg:col-span-1">
          <h4 className="font-medium text-gray-900 mb-2">전체 사진</h4>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {photos.map((thumbPhoto, index) => (
              <div 
                key={thumbPhoto.id}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-all duration-200 ${
                  index === currentIndex 
                    ? `bg-${colorScheme}-100 border-2 border-${colorScheme}-400` 
                    : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                }`}
                onClick={() => onNavigate(index)}
              >
                <div className="w-12 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                  <LazyImage
                    src={thumbPhoto.thumbnailUrl}
                    alt={thumbPhoto.originalFileName}
                    className="w-full h-full object-cover"
                    filePath={thumbPhoto.filePath}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">
                    {index + 1}. {thumbPhoto.originalFileName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(thumbPhoto.fileSize / 1024 / 1024).toFixed(1)}MB
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 하단: 액션 버튼들 */}
      <div className="flex flex-col md:flex-row gap-2 md:gap-3 justify-center pt-4 border-t">
        <button
          onClick={handleDownload}
          className={`bg-${colorScheme}-600 text-white px-4 md:px-4 py-3 md:py-2 rounded-lg hover:bg-${colorScheme}-700 active:bg-${colorScheme}-800 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 text-sm md:text-base font-medium touch-manipulation min-h-[44px] shadow-md hover:shadow-lg`}
        >
          <Download className="w-3 md:w-4 h-3 md:h-4" />
          개별 다운로드
        </button>
        
        <button
          onClick={handleDownloadAll}
          className="bg-blue-600 text-white px-4 md:px-4 py-3 md:py-2 rounded-lg hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 text-sm md:text-base font-medium touch-manipulation min-h-[44px] shadow-md hover:shadow-lg"
        >
          <Archive className="w-3 md:w-4 h-3 md:h-4" />
          전체 ZIP
        </button>
        
        <button
          onClick={async () => {
            console.log('🔥🔥 [EXPANDED-VIEWER-DELETE] 확장 뷰어의 삭제 버튼 클릭됨!');
            if (confirm(`"${photo.originalFileName}" 파일을 삭제하시겠습니까?`)) {
              console.log('🚀 [EXPANDED-DELETE-START] 확장 뷰어에서 삭제 진행');

              // 1️⃣ Jotai를 사용한 즉시 UI 업데이트
              markPhotoAsDeleted(photo.id);
              console.log('⚡ [EXPANDED-INSTANT-DELETE] markPhotoAsDeleted 호출완료');

              // 2️⃣ photoTracker에서도 즉시 제거하여 통계 업데이트
              console.log(`🔍 [EXPANDED-BEFORE-REMOVE] 삭제 전 통계:`, photoTracker.getStatistics());
              const removed = photoTracker.removePhoto(photo.id);
              console.log(`🗑️ [EXPANDED-TRACKER-REMOVE] photoTracker.removePhoto 결과: ${removed}`);
              console.log(`🔍 [EXPANDED-AFTER-REMOVE] 삭제 후 통계:`, photoTracker.getStatistics());

              // 3️⃣ 통계 즉시 업데이트 (optimistic update)
              if (removed) {
                const updatedStats = photoTracker.getStatistics();
                console.log(`📊 [EXPANDED-STATS-UPDATE] setStatistics 호출 직전:`, updatedStats);
                setStatistics(updatedStats);
                console.log(`📊 [EXPANDED-STATS-COMPLETE] setStatistics 호출 완료 - 통계카드 즉시 반영!`);
              } else {
                console.warn(`⚠️ [EXPANDED-STATS-SKIP] photoTracker에서 사진을 찾을 수 없어 통계 업데이트 생략`);
              }

              // 4️⃣ 삭제 후 인덱스 자동 조정 로직
              const remainingPhotosCount = photos.length - 1;

              console.log('🔍 [DELETE-INDEX-CHECK]', {
                currentIndex,
                photosLength: photos.length,
                remainingPhotosCount,
                willClose: remainingPhotosCount === 0
              });

              if (remainingPhotosCount === 0) {
                console.log('❌ [NO-PHOTOS] 마지막 사진 삭제 - 모달 닫기');
                onClose();
              } else if (currentIndex >= remainingPhotosCount) {
                const prevIndex = remainingPhotosCount - 1;
                console.log(`⬅️ [AUTO-NAVIGATE] 마지막 사진 삭제 - 이전 사진으로 이동 (index: ${prevIndex})`);
                onNavigate(prevIndex);
              } else {
                console.log(`➡️ [AUTO-NAVIGATE] 중간 사진 삭제 - 현재 인덱스 유지 (다음 사진으로 자동 이동)`);
                onNavigate(currentIndex);
              }

              // 5️⃣ 실제 API 호출 (await로 완료 대기)
              try {
                console.log(`🌐 [EXPANDED-API-DELETE-START] DELETE /api/facility-photos/${photo.id}`);
                const response = await fetch(`/api/facility-photos/${photo.id}`, {
                  method: 'DELETE'
                });

                const result = await response.json();

                if (!result.success) {
                  // API 실패 시 롤백
                  console.error('❌ [EXPANDED-DELETE-API-FAILED]', result.message);
                  markPhotoAsUndeleted(photo.id);

                  // 전체 새로고침으로 복원
                  if (onRefresh) {
                    await onRefresh();
                  }

                  toast.error('삭제 실패', result.message || '삭제 중 오류가 발생했습니다.');
                } else {
                  console.log('✅ [EXPANDED-DELETE-API-SUCCESS] 서버에서도 삭제 완료');

                  // API 성공 시에만 성공 메시지
                  toast.success('삭제 완료', '사진이 성공적으로 삭제되었습니다.');

                  // ✅ 서버 삭제 완료 후 강제 새로고침으로 확실한 동기화
                  if (onRefresh) {
                    await onRefresh();
                    console.log('🔄 [EXPANDED-POST-DELETE-REFRESH] 삭제 후 서버 데이터 재조회 완료');
                  }
                }
              } catch (error) {
                console.error('❌ [EXPANDED-DELETE-API-ERROR]', error);
                markPhotoAsUndeleted(photo.id);

                // 오류 발생 시 전체 새로고침으로 복원
                if (onRefresh) {
                  await onRefresh();
                }

                toast.error('삭제 오류', '사진 삭제 중 문제가 발생했습니다. 다시 시도해주세요.');
              }
            }
          }}
          className="bg-red-600 text-white px-4 md:px-4 py-3 md:py-2 rounded-lg hover:bg-red-700 active:bg-red-800 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 text-sm md:text-base font-medium touch-manipulation min-h-[44px] shadow-md hover:shadow-lg"
        >
          <Trash2 className="w-3 md:w-4 h-3 md:h-4" />
          삭제
        </button>
      </div>
    </div>
  );
}

// 사진 상세 모달 컴포넌트
interface PhotoDetailModalProps {
  photo: FacilityPhoto;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: () => void;
}

const PhotoDetailModal = forwardRef<HTMLDivElement, PhotoDetailModalProps>(
  ({ photo, position, onClose, onDelete }, ref) => {
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <div 
          ref={ref}
          tabIndex={-1}
          className="fixed bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden focus:outline-none"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            maxWidth: '600px',
            maxHeight: '80vh',
            minWidth: '400px',
            transform: 'scale(0.95)',
            animation: 'modalSlideIn 0.2s ease-out forwards'
          }}
        >
          {/* 모달 헤더 */}
          <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
            <div>
              <h3 className="font-semibold text-gray-900 truncate">
                {photo.originalFileName}
              </h3>
              <p className="text-sm text-gray-600">
                {(photo.fileSize / 1024 / 1024).toFixed(1)}MB • {new Date(photo.uploadedAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* 모달 이미지 */}
          <div className="p-4">
            <div className="relative bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: '300px', maxHeight: '70vh' }}>
              <LazyImage
                src={photo.downloadUrl}
                alt={photo.originalFileName}
                className="max-w-full max-h-[70vh] object-contain"
                filePath={photo.filePath}
              />
            </div>

            {/* 사진 설명 섹션 🆕 */}
            <div className="mt-4 border-t pt-4">
              <PhotoCaptionInput
                photo={{
                  id: photo.id,
                  name: photo.fileName,
                  originalName: photo.originalFileName,
                  mimeType: 'image/jpeg',
                  size: photo.fileSize,
                  createdTime: new Date(photo.uploadedAt).toISOString(),
                  webViewLink: photo.downloadUrl,
                  downloadUrl: photo.downloadUrl,
                  thumbnailUrl: photo.downloadUrl,
                  folderName: photo.categoryPath,
                  uploadStatus: 'uploaded',
                  filePath: photo.filePath,
                  caption: photo.caption
                }}
                onCaptionSaved={(caption) => {
                  console.log('✅ Caption saved callback:', caption);
                }}
              />
            </div>

            {/* 액션 버튼 */}
            <div className="flex flex-col md:flex-row gap-2 md:gap-3 justify-center mt-4">
              <a
                href={photo.downloadUrl}
                download={photo.originalFileName}
                className="bg-blue-600 text-white px-6 md:px-6 py-3 md:py-3 rounded-lg hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 text-sm md:text-base font-medium touch-manipulation min-h-[48px] shadow-md hover:shadow-lg"
              >
                <Download className="w-3 md:w-4 h-3 md:h-4" />
                다운로드
              </a>
              
              <button
                onClick={() => {
                  console.log('🔥 [DEBUG] 삭제 버튼이 클릭되었습니다!');
                  onDelete();
                }}
                className="bg-red-600 text-white px-6 md:px-6 py-3 md:py-3 rounded-lg hover:bg-red-700 active:bg-red-800 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 text-sm md:text-base font-medium touch-manipulation min-h-[48px] shadow-md hover:shadow-lg"
              >
                <Trash2 className="w-3 md:w-4 h-3 md:h-4" />
                삭제
              </button>
            </div>
          </div>

          {/* ESC 힌트 */}
          <div className="absolute top-4 right-16 text-xs text-gray-500 bg-white bg-opacity-90 px-2 py-1 rounded">
            ESC 또는 외부 클릭으로 닫기
          </div>
        </div>
      </div>
    );
  }
);

PhotoDetailModal.displayName = 'PhotoDetailModal';