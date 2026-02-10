'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Camera, Upload, Factory, Shield, Building2, AlertCircle, Eye, Download, Trash2, RefreshCw, X, Zap, Router, Cpu } from 'lucide-react';
import { FacilitiesData, Facility, UploadedFile } from '@/types';
import imageCompression from 'browser-image-compression';
import LazyImage from '@/components/ui/LazyImage';
import { generateFacilityNumbering, type FacilityNumberingResult } from '@/utils/facility-numbering';
import { AirPermitWithOutlets } from '@/types/database';
import { 
  generateFacilityFileName, 
  generateBasicFileName, 
  calculateFacilityIndex, 
  calculatePhotoIndex, 
  calculateBasicPhotoIndex 
} from '@/utils/filename-generator';

interface FacilityPhotoUploadSectionProps {
  businessName: string;
  facilities: FacilitiesData | null;
}

const compressImage = async (file: File): Promise<File> => {
  // 속도 최적화: 5MB 이하 파일은 압축 건너뛰기 (더 빠른 업로드)
  if (!file.type.startsWith('image/') || file.size <= 5 * 1024 * 1024) {
    console.log(`⚡ [COMPRESS-SKIP] ${file.name}: ${(file.size/1024/1024).toFixed(1)}MB - 압축 건너뛰기`);
    return file;
  }

  const options = {
    maxSizeMB: 4, // 더 큰 용량 허용으로 압축 시간 최소화
    maxWidthOrHeight: 1600, // 더 높은 해상도 유지
    useWebWorker: true,
    initialQuality: 0.95, // 높은 품질로 압축 시간 단축
    alwaysKeepResolution: false,
    fileType: 'image/webp' // WebP로 더 효율적인 압축
  };

  const startTime = Date.now();
  try {
    const compressedFile = await imageCompression(file, options);
    const compressionTime = Date.now() - startTime;
    
    console.log(`⚡ [COMPRESS] ${file.name}: ${(file.size/1024/1024).toFixed(1)}MB → ${(compressedFile.size/1024/1024).toFixed(1)}MB (${compressionTime}ms)`);
    
    return new File([compressedFile], file.name, {
      type: compressedFile.type,
      lastModified: Date.now()
    });
  } catch (error) {
    console.warn(`⚠️ [COMPRESS] 압축 실패, 원본 사용: ${file.name}`, error);
    return file;
  }
};

export default function FacilityPhotoUploadSection({ 
  businessName, 
  facilities 
}: FacilityPhotoUploadSectionProps) {
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [facilityNumbering, setFacilityNumbering] = useState<FacilityNumberingResult | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // 파일 선택 시 클릭 위치 추적 (개별 시설 정보 기준)
  const handleFileSelect = useCallback((file: UploadedFile, event: React.MouseEvent) => {
    // 이벤트 버블링 방지 (정확한 클릭 위치 확보)
    event.stopPropagation();
    
    // 클릭된 요소의 위치 계산 (개별 시설 카드 기준)
    const target = event.currentTarget as HTMLElement;
    const targetRect = target.getBoundingClientRect();
    
    // 시설 카드 중심에서 약간 우측으로 오프셋하여 모달 위치 계산
    const centerX = targetRect.left + targetRect.width / 2 + 50;
    const centerY = targetRect.top + targetRect.height / 2;
    
    // 모달이 화면 밖으로 나가지 않도록 조정
    const modalWidth = 600; // 예상 모달 너비
    const modalHeight = 500; // 예상 모달 높이
    
    const adjustedX = Math.min(Math.max(centerX - modalWidth/2, 20), window.innerWidth - modalWidth - 20);
    const adjustedY = Math.min(Math.max(centerY - modalHeight/2, 20), window.innerHeight - modalHeight - 20);
    
    console.log(`[MODAL-POSITION] 시설 카드 기준 위치: ${centerX}, ${centerY} → 조정된 위치: ${adjustedX}, ${adjustedY}`);
    
    setModalPosition({ x: adjustedX, y: adjustedY });
    setSelectedFile(file);
  }, []);

  // 업로드된 파일 로드 - 스마트 캐싱 및 병렬 로딩 적용
  const loadUploadedFiles = useCallback(async (forceRefresh = false) => {
    if (!businessName) return;
    
    setLoadingFiles(true);
    try {
      // 병렬 요청: completion과 presurvey 동시에 시도
      const refreshParam = forceRefresh ? '&refresh=true' : '';
      const [completionResponse, presurveyResponse] = await Promise.allSettled([
        fetch(`/api/uploaded-files-supabase?businessName=${encodeURIComponent(businessName)}&systemType=completion${refreshParam}`, {
          headers: { 'Cache-Control': forceRefresh ? 'no-cache' : 'max-age=300' }
        }),
        fetch(`/api/uploaded-files-supabase?businessName=${encodeURIComponent(businessName)}&systemType=presurvey${refreshParam}`, {
          headers: { 'Cache-Control': forceRefresh ? 'no-cache' : 'max-age=300' }
        })
      ]);

      let allFiles: any[] = [];

      // completion 결과 처리
      if (completionResponse.status === 'fulfilled' && completionResponse.value.ok) {
        const result = await completionResponse.value.json();
        if (result.success) {
          allFiles.push(...(result.data?.files || []));
          console.log('[PERFORMANCE] completion 파일 로드:', result.data?.files?.length || 0);
        }
      }

      // presurvey 결과 처리
      if (presurveyResponse.status === 'fulfilled' && presurveyResponse.value.ok) {
        const result = await presurveyResponse.value.json();
        if (result.success) {
          const presurveyFiles = result.data?.files || [];
          // 중복 제거
          const existingIds = new Set(allFiles.map(f => f.id));
          const uniquePresurveyFiles = presurveyFiles.filter((f: any) => !existingIds.has(f.id));
          allFiles.push(...uniquePresurveyFiles);
          console.log('[PERFORMANCE] presurvey 파일 로드:', uniquePresurveyFiles.length);
        }
      }
      
      console.log('[PERFORMANCE] 총 로드된 파일:', allFiles.length);
      setUploadedFiles(allFiles);
      
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    } finally {
      setLoadingFiles(false);
    }
  }, [businessName]);

  useEffect(() => {
    loadUploadedFiles();
  }, [loadUploadedFiles]);

  // 백그라운드 새로고침 (60초마다, optimistic UI 보완용)
  useEffect(() => {
    const interval = setInterval(() => {
      loadUploadedFiles(true);
    }, 60000); // optimistic UI가 주요 방식이므로 백그라운드에서만 동기화

    return () => clearInterval(interval);
  }, [loadUploadedFiles]);

  // 모달 키보드 및 클릭 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedFile) {
        setSelectedFile(null);
        setModalPosition(null);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setSelectedFile(null);
        setModalPosition(null);
      }
    };

    if (selectedFile) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
      // 팝업 스타일에서는 배경 스크롤 허용
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      // 팝업 스타일에서는 스크롤 상태 유지
    };
  }, [selectedFile]);

  // 모달 포커스 관리 (스크롤 강제 이동 제거)
  useEffect(() => {
    if (selectedFile && modalRef.current) {
      // 모달에 포커스만 설정 (자동 스크롤 제거)
      modalRef.current.focus();
    }
  }, [selectedFile]);

  // 시설 번호 생성 (admin 시스템과 동일한 방식)
  useEffect(() => {
    if (facilities && facilities.discharge && facilities.prevention) {
      // facilities 데이터를 AirPermitWithOutlets 형태로 변환
      const mockAirPermit: AirPermitWithOutlets = {
        id: 'mock-permit',
        business_id: 'mock-business',
        business_type: '',
        annual_emission_amount: null,
        pollutants: [],
        emission_limits: {},
        additional_info: {},
        is_active: true,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        outlets: [...new Set([...facilities.discharge.map(f => f.outlet), ...facilities.prevention.map(f => f.outlet)])].map(outletNum => ({
          id: `outlet-${outletNum}`,
          air_permit_id: 'mock-permit',
          outlet_number: outletNum,
          outlet_name: `배출구 ${outletNum}`,
          stack_height: null,
          stack_diameter: null,
          flow_rate: null,
          additional_info: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          discharge_facilities: facilities.discharge
            .filter(f => f.outlet === outletNum)
            .map(f => ({
              id: `discharge-${f.outlet}-${f.number}`,
              outlet_id: `outlet-${outletNum}`,
              facility_name: f.name,
              facility_code: null,
              capacity: f.capacity || '',
              quantity: f.quantity,
              operating_conditions: {},
              measurement_points: [],
              device_ids: [],
              additional_info: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })),
          prevention_facilities: facilities.prevention
            .filter(f => f.outlet === outletNum)
            .map(f => ({
              id: `prevention-${f.outlet}-${f.number}`,
              outlet_id: `outlet-${outletNum}`,
              facility_name: f.name,
              facility_code: null,
              capacity: f.capacity || '',
              quantity: f.quantity,
              efficiency_rating: null,
              media_type: null,
              maintenance_interval: null,
              operating_conditions: {},
              measurement_points: [],
              device_ids: [],
              additional_info: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }))
        }))
      };

      const numbering = generateFacilityNumbering(mockAirPermit);
      setFacilityNumbering(numbering);
      console.log('🔢 [FACILITY-NUMBERING] 생성 완료:', numbering);
    }
  }, [facilities, businessName]);

  // 시설별 파일 업로드
  const handleFacilityUpload = useCallback(async (files: FileList, facility: Facility, facilityType: 'discharge' | 'prevention', facilityInstanceNumber: number = 1) => {
    if (!files.length) return;

    const uploadKey = `${facilityType}-${facility.outlet}-${facility.number || 1}-${facilityInstanceNumber}`;
    
    // 시설 순번 계산
    const allFacilities = facilityType === 'discharge' ? 
      facilities?.discharge || [] : facilities?.prevention || [];
    const facilityIndex = calculateFacilityIndex(allFacilities, facility, facilityType);
    
    // 현재 업로드된 파일들에서 해당 시설의 사진 개수 확인
    const existingFacilityFiles = getFilesForFacility(facility, facilityType, facilityInstanceNumber);
    
    console.log('🔍 [UPLOAD-HANDLER-DEBUG] 파일 업로드 처리 시작:', {
      시설정보: { 
        이름: facility.name, 
        용량: facility.capacity, 
        배출구: facility.outlet, 
        번호: facility.number,
        시설타입: facilityType 
      },
      업로드할파일수: files.length,
      기존시설파일수: existingFacilityFiles.length,
      시설인덱스: facilityIndex
    });
    
    // 모바일 즉시 반응: 파일 선택 즉시 미리보기 생성 (새로운 파일명 적용)
    const basePhotoIndex = calculatePhotoIndex(existingFacilityFiles, facility, facilityType, facilityInstanceNumber);
    const previewFiles = Array.from(files).map((file, index) => {
      const photoIndex = basePhotoIndex + index;
      const newFileName = generateFacilityFileName({
        facility,
        facilityType,
        facilityIndex,
        facilityInstanceNumber,
        photoIndex,
        originalFileName: file.name
      });
      
      // 각 파일별로 하나의 ObjectURL만 생성하여 메모리 효율성 향상
      const objectUrl = URL.createObjectURL(file);
      
      return {
        id: `preview-${Date.now()}-${Math.random()}-${index}`, // 인덱스 추가로 고유성 보장
        name: newFileName, // 새로운 구조화된 파일명 적용
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        webViewLink: objectUrl,
        downloadUrl: objectUrl,
        thumbnailUrl: objectUrl,
        publicUrl: objectUrl,
        directUrl: objectUrl,
        folderName: facilityType === 'discharge' ? '배출시설' : '방지시설',
        uploadStatus: 'uploading',
        syncedAt: null,
        googleFileId: null,
        facilityInfo: JSON.stringify({
          outlet: facility.outlet,
          number: facility.number,
          name: facility.name,
          capacity: facility.capacity,
          type: facilityType
        }),
        filePath: undefined,
        justUploaded: true,
        uploadedAt: Date.now(),
        isPreview: true // 미리보기 표시
      } as unknown as UploadedFile & { isPreview: boolean };
    });
    
    // 즉시 미리보기 파일 추가
    setUploadedFiles(prev => [...previewFiles, ...prev]);
    setUploading(prev => ({ ...prev, [uploadKey]: true }));
    setUploadProgress(prev => ({ ...prev, [uploadKey]: 0 }));

    try {
      // 병렬 이미지 압축으로 성능 개선
      const compressedFiles = await Promise.all(
        Array.from(files).map(file => compressImage(file))
      );
      
      const uploadPromises = compressedFiles.map(async (compressedFile, index) => {
        const originalFile = files[index];
        
        // 새로운 파일명 생성 (순서 보장)
        const photoIndex = basePhotoIndex + index;
        const newFileName = generateFacilityFileName({
          facility,
          facilityType,
          facilityIndex,
          facilityInstanceNumber,
          photoIndex,
          originalFileName: originalFile.name
        });
        
        // 새로운 파일명으로 File 객체 재생성
        const renamedFile = new File([compressedFile], newFileName, {
          type: compressedFile.type,
          lastModified: compressedFile.lastModified
        });
        
        const formData = new FormData();
        formData.append('files', renamedFile); // 새로운 파일명이 적용된 파일 업로드
        formData.append('businessName', businessName);
        formData.append('systemType', 'presurvey');
        formData.append('category', facilityType === 'discharge' ? '배출시설' : '방지시설');
        formData.append('facilityId', `${facilityType}-${facility.outlet}-${facility.number || 1}`);
        formData.append('facilityType', facilityType);
        formData.append('facilityNumber', (facility.number || 1).toString());
        formData.append('facilityInfo', JSON.stringify({
          outlet: facility.outlet,
          number: facility.number, 
          name: facility.name,
          capacity: facility.capacity,
          type: facilityType
        }));

        const response = await fetch('/api/upload-supabase', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        setUploadProgress(prev => ({ 
          ...prev, 
          [uploadKey]: ((index + 1) / compressedFiles.length) * 100 
        }));

        // 업로드 성공 시 미리보기를 실제 파일로 교체
        if (result.success && result.files && result.files.length > 0) {
          const newFile = result.files[0];
          
          // 미리보기 파일을 실제 업로드된 파일로 즉시 교체 (구조화된 파일명 유지)
          setUploadedFiles(prev => prev.map(f => {
            if (f.originalName === originalFile.name && (f as any).isPreview) {
              // 기존 Object URL 정리 (메모리 누수 방지)
              if (f.thumbnailUrl && f.thumbnailUrl.startsWith('blob:')) {
                URL.revokeObjectURL(f.thumbnailUrl);
                URL.revokeObjectURL(f.webViewLink);
                URL.revokeObjectURL(f.downloadUrl);
                if ((f as any).publicUrl) URL.revokeObjectURL((f as any).publicUrl);
                if ((f as any).directUrl) URL.revokeObjectURL((f as any).directUrl);
              }
              
              // 구조화된 파일명과 모든 필수 URL 필드가 포함된 새 파일 객체 생성
              return { 
                ...newFile, 
                justUploaded: true, 
                uploadedAt: Date.now(),
                isPreview: false // 더 이상 미리보기가 아님
              };
            }
            return f;
          }));
          
          console.log(`✅ [UPLOAD-REPLACE] 미리보기를 실제 파일로 교체: ${originalFile.name} → ${newFile.name}`);
          
          // 즉시 업로드 상태 업데이트
          setUploadProgress(prev => ({ ...prev, [uploadKey]: 100 }));
          
          // 5초 후 깜빡임 효과 제거
          setTimeout(() => {
            setUploadedFiles(prev => prev.map(f => 
              f.id === newFile.id ? { ...f, justUploaded: false } : f
            ));
          }, 5000);
        } else {
          // 업로드 실패 시 미리보기 파일 제거
          console.warn(`❌ [UPLOAD-FAILED] 미리보기 파일 제거: ${originalFile.name}`);
          setUploadedFiles(prev => prev.filter(f => 
            !(f.originalName === originalFile.name && (f as any).isPreview)
          ));
        }

        return result;
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter(r => r.success).length;

      console.log(`✅ [UPLOAD-SUCCESS] 시설 업로드 완료: ${successCount}/${compressedFiles.length}`);

      // 🔄 방법 1: 업로드 완료 후 서버에서 최신 데이터 재조회 (캐시 무효화 포함)
      if (successCount > 0) {
        console.log(`🔄 [SERVER-REFRESH] 업로드 완료, 서버 최신 데이터 재조회 시작`);
        await loadUploadedFiles(true); // forceRefresh=true로 캐시 무효화된 최신 데이터 가져오기
        console.log(`✅ [SERVER-REFRESH] 서버 재조회 완료`);
      }

      // 실패한 업로드가 있는 경우 미리보기 파일만 제거
      if (successCount < files.length) {
        console.log(`❌ [UPLOAD-PARTIAL] 부분 실패, 미리보기 파일 정리`);
        // 실패한 미리보기 파일만 제거
        setUploadedFiles(prev => prev.filter(f => !(f as any).isPreview));
      }

    } catch (error) {
      console.error('업로드 오류:', error);
    } finally {
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
      setTimeout(() => {
        setUploadProgress(prev => ({ ...prev, [uploadKey]: 0 }));
      }, 2000);
    }
  }, [businessName, loadUploadedFiles]);

  // 기본사진 업로드 (카테고리별)
  const handleBasicUpload = useCallback(async (files: FileList, category: string) => {
    if (!files.length) return;

    const uploadKey = `basic-${category}`;
    
    // 기존 기본사진들 중 해당 카테고리의 개수 확인
    const existingBasicFiles = getBasicFiles(category);
    
    // 모바일 즉시 반응: 기본사진 선택 즉시 미리보기 생성 (새로운 파일명 적용)
    const basePhotoIndex = calculateBasicPhotoIndex(existingBasicFiles, category);
    const previewFiles = Array.from(files).map((file, index) => {
      const photoIndex = basePhotoIndex + index;
      const newFileName = generateBasicFileName(category, photoIndex, file.name);
      
      // 각 파일별로 하나의 ObjectURL만 생성하여 메모리 효율성 향상
      const objectUrl = URL.createObjectURL(file);
      
      return {
        id: `preview-basic-${Date.now()}-${Math.random()}-${index}`, // 인덱스 추가로 고유성 보장
        name: newFileName, // 새로운 구조화된 파일명 적용
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        webViewLink: objectUrl,
        downloadUrl: objectUrl,
        thumbnailUrl: objectUrl,
        publicUrl: objectUrl,
        directUrl: objectUrl,
        folderName: '기본사진',
        uploadStatus: 'uploading',
        syncedAt: null,
        googleFileId: null,
        facilityInfo: category,
        filePath: undefined,
        justUploaded: true,
        uploadedAt: Date.now(),
        subcategory: category,
        isPreview: true // 미리보기 표시
      } as unknown as UploadedFile & { isPreview: boolean };
    });
    
    // 즉시 미리보기 파일 추가
    setUploadedFiles(prev => [...previewFiles, ...prev]);
    setUploading(prev => ({ ...prev, [uploadKey]: true }));
    setUploadProgress(prev => ({ ...prev, [uploadKey]: 0 }));

    try {
      const uploadPromises = Array.from(files).map(async (file, index) => {
        const compressedFile = await compressImage(file);
        
        // 새로운 파일명 생성 (순서 보장)
        const photoIndex = basePhotoIndex + index;
        const newFileName = generateBasicFileName(category, photoIndex, file.name);
        
        // 새로운 파일명으로 File 객체 재생성
        const renamedFile = new File([compressedFile], newFileName, {
          type: compressedFile.type,
          lastModified: compressedFile.lastModified
        });
        
        const formData = new FormData();
        formData.append('files', renamedFile); // 새로운 파일명이 적용된 파일 업로드
        formData.append('businessName', businessName);
        formData.append('fileType', 'basic');
        formData.append('type', 'completion');
        formData.append('facilityInfo', category);

        const response = await fetch('/api/upload-supabase', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        setUploadProgress(prev => ({ 
          ...prev, 
          [uploadKey]: ((index + 1) / files.length) * 100 
        }));

        // 업로드 성공 시 미리보기를 실제 파일로 교체
        if (result.success && result.files && result.files.length > 0) {
          const newFile = result.files[0];
          // 미리보기 파일을 실제 업로드된 파일로 즉시 교체
          setUploadedFiles(prev => prev.map(f => 
            f.name === file.name && (f as any).isPreview 
              ? { ...newFile, justUploaded: true, uploadedAt: Date.now(), subcategory: category }
              : f
          ));
          
          // 5초 후 깜빡임 효과 제거
          setTimeout(() => {
            setUploadedFiles(prev => prev.map(f => 
              f.id === newFile.id ? { ...f, justUploaded: false } : f
            ));
          }, 5000);
        } else {
          // 업로드 실패 시 미리보기 파일 제거
          console.warn(`❌ [BASIC-UPLOAD-FAILED] 기본사진 미리보기 파일 제거: ${file.name}`);
          setUploadedFiles(prev => prev.filter(f => 
            !(f.originalName === file.name && (f as any).isPreview)
          ));
        }

        return result;
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter(r => r.success).length;

      console.log(`✅ [UPLOAD-SUCCESS] 기본사진 업로드 완료: ${successCount}/${files.length}`);

      // 🔄 방법 1: 업로드 완료 후 서버에서 최신 데이터 재조회 (캐시 무효화 포함)
      if (successCount > 0) {
        console.log(`🔄 [SERVER-REFRESH] 업로드 완료, 서버 최신 데이터 재조회 시작`);
        await loadUploadedFiles(true); // forceRefresh=true로 캐시 무효화된 최신 데이터 가져오기
        console.log(`✅ [SERVER-REFRESH] 서버 재조회 완료`);
      }

      // 실패한 업로드가 있는 경우 미리보기 파일만 제거
      if (successCount < files.length) {
        console.log(`❌ [UPLOAD-PARTIAL] 기본사진 부분 실패, 미리보기 파일 정리`);
        // 실패한 미리보기 파일만 제거
        setUploadedFiles(prev => prev.filter(f => !(f as any).isPreview));
      }

    } catch (error) {
      console.error('업로드 오류:', error);
    } finally {
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
      setTimeout(() => {
        setUploadProgress(prev => ({ ...prev, [uploadKey]: 0 }));
      }, 2000);
    }
  }, [businessName, loadUploadedFiles]);

  // 파일 삭제 - 안정적인 optimistic UI 구현
  const deleteFile = useCallback(async (file: UploadedFile) => {
    if (!confirm(`"${file.name}" 파일을 삭제하시겠습니까?`)) return;

    // 1. 즉시 optimistic 삭제 (UI 반응성 확보)
    setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
    setSelectedFile(null);
    console.log(`🗑️ [OPTIMISTIC-DELETE] 로컬 삭제: ${file.name}`);

    try {
      const response = await fetch('/api/uploaded-files-supabase', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ 
          fileId: file.id, 
          fileName: file.name,
          businessName: businessName
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ [DELETE-SUCCESS] 서버 삭제 완료: ${file.name} (optimistic UI 유지)`);
      } else {
        console.log(`❌ [DELETE-FAILED] 서버 삭제 실패, 롤백: ${file.name}`);
        // 실패 시 즉시 롤백
        setUploadedFiles(prev => [file, ...prev]);
        alert('파일 삭제에 실패했습니다: ' + result.message);
      }
    } catch (error) {
      console.error('파일 삭제 오류:', error);
      // 오류 시 즉시 롤백
      setUploadedFiles(prev => [file, ...prev]);
      alert('파일 삭제 중 오류가 발생했습니다.');
    }
  }, [businessName, loadUploadedFiles]);

  // 파일 크기 포맷팅
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 시설별 업로드된 파일 필터링 - 실제 API 데이터 형식에 맞춘 로직
  const getFilesForFacility = (facility: Facility, facilityType: 'discharge' | 'prevention', facilityInstanceNumber: number = 1) => {
    const expectedFolderName = facilityType === 'discharge' ? '배출시설' : '방지시설';
    
    console.log('🔍 [FACILITY-FILTER-DEBUG] 시설별 파일 필터링 시작:', {
      시설정보: { 
        이름: facility.name, 
        용량: facility.capacity, 
        배출구: facility.outlet, 
        번호: facility.number,
        시설타입: facilityType 
      },
      기대폴더명: expectedFolderName,
      전체파일수: uploadedFiles.length
    });

    const filteredFiles = uploadedFiles.filter(file => {
      console.log('📄 [FILE-CHECK]', {
        fileName: file.name,
        folderName: file.folderName,
        facilityInfo: file.facilityInfo,
        filePath: file.filePath
      });

      // 1차: 폴더명이 맞는지 확인
      if (file.folderName !== expectedFolderName) {
        console.log('❌ [1차-폴더매칭실패]', { expected: expectedFolderName, actual: file.folderName });
        return false;
      }
      
      // 2차: facilityInfo에서 배출구 번호 추출하여 매칭
      if (file.facilityInfo) {
        // "흡착에의한시설 (200㎥/분, 수량: 1개, 배출구: 4번)" 형식에서 배출구 번호 추출
        const outletMatch = file.facilityInfo.match(/배출구[:\s]*(\d+)/);
        if (outletMatch) {
          const fileOutlet = parseInt(outletMatch[1]);
          if (fileOutlet === facility.outlet) {
            console.log('✅ [2차-배출구매칭성공]', { fileOutlet, facilityOutlet: facility.outlet });
            return true;
          } else {
            console.log('❌ [2차-배출구매칭실패]', { fileOutlet, facilityOutlet: facility.outlet });
          }
        }
      }
      
      // 3차: 파일 경로 매칭 (outlet_X 패턴)
      if (file.filePath) {
        const facilityPathType = facilityType === 'discharge' ? 'discharge' : 'prevention';
        const outletPattern = new RegExp(`outlet_${facility.outlet}_.*${facilityPathType}`);
        if (outletPattern.test(file.filePath)) {
          console.log('✅ [3차-경로매칭성공]', { filePath: file.filePath, pattern: outletPattern.source });
          return true;
        } else {
          console.log('❌ [3차-경로매칭실패]', { filePath: file.filePath, pattern: outletPattern.source });
        }
      }
      
      // 4차: JSON 형식 매칭 (새로운 방식)
      try {
        const fileFacilityInfo = JSON.parse(file.facilityInfo || '{}');
        if (fileFacilityInfo.outlet === facility.outlet && 
            fileFacilityInfo.number === facility.number &&
            fileFacilityInfo.type === facilityType) {
          console.log('✅ [4차-JSON매칭성공]', fileFacilityInfo);
          return true;
        } else {
          console.log('❌ [4차-JSON매칭실패]', { 
            파일정보: fileFacilityInfo, 
            시설정보: { outlet: facility.outlet, number: facility.number, type: facilityType }
          });
        }
      } catch (e) {
        // JSON 파싱 실패 시 기존 문자열 방식으로 매칭 (하위 호환성)
        const expectedFacilityInfo = `배출구${facility.outlet}-${facilityType === 'discharge' ? '배출시설' : '방지시설'}${facility.number}`;
        if (file.facilityInfo === expectedFacilityInfo) {
          console.log('✅ [5차-문자열매칭성공]', { expected: expectedFacilityInfo, actual: file.facilityInfo });
          return true;
        } else {
          console.log('❌ [5차-문자열매칭실패]', { expected: expectedFacilityInfo, actual: file.facilityInfo });
        }
      }

      // 6차: 파일명 패턴 매칭 (최종 백업)
      if (file.name) {
        const facilityPrefix = facilityType === 'prevention' ? '방' : '배';
        const facilityName = facility.name.replace(/[()]/g, '').replace(/\s+/g, '');
        const facilityCapacity = facility.capacity.replace(/\s+/g, '');
        
        // 파일명에 시설 정보가 포함되어 있는지 확인
        const hasPrefix = file.name.includes(facilityPrefix);
        const hasName = file.name.includes(facilityName) || file.name.includes(facility.name);
        const hasCapacity = file.name.includes(facilityCapacity) || file.name.includes(facility.capacity);
        
        // 시설 인스턴스 번호 매칭 (방1_, 배2_ 등)
        const facilityInstancePattern = new RegExp(`${facilityPrefix}${facilityInstanceNumber}_`);
        const hasInstanceNumber = facilityInstancePattern.test(file.name);
        
        if (hasPrefix && (hasName || hasCapacity) && hasInstanceNumber) {
          console.log('✅ [6차-파일명패턴매칭성공]', { 
            fileName: file.name,
            hasPrefix,
            hasName,
            hasCapacity,
            hasInstanceNumber,
            facilityInstanceNumber,
            facilityName,
            facilityCapacity
          });
          return true;
        } else {
          console.log('❌ [6차-파일명패턴매칭실패]', { 
            fileName: file.name,
            hasPrefix,
            hasName,
            hasCapacity,
            hasInstanceNumber,
            facilityInstanceNumber
          });
        }
      }
      
      return false;
    });

    console.log(`📊 [FACILITY-FILTER-RESULT] ${facilityType}${facility.number} (outlet ${facility.outlet}): ${filteredFiles.length}개 파일 매칭`);
    console.log('📋 [MATCHED-FILES]', filteredFiles.map(f => ({ name: f.name, facilityInfo: f.facilityInfo })));
    
    return filteredFiles;
  };

  // 기본사진 필터링 (카테고리별) - 단순화된 안정적 로직
  const getBasicFiles = (category?: string) => {
    const basicFiles = uploadedFiles.filter(file => {
      // 기본사진 폴더 확인 (명확한 조건)
      const isBasicFolder = file.folderName === '기본사진' || 
                           file.folderName === 'basic' ||
                           (!file.folderName || file.folderName === '') ||
                           (file.folderName !== '배출시설' && file.folderName !== '방지시설');
      
      if (!isBasicFolder) return false;
      
      // 카테고리별 필터링
      if (category) {
        const fileCategory = (file as any).subcategory || extractCategoryFromFileName(file.name);
        return fileCategory === category;
      }
      
      return true;
    });
    
    console.log(`[BASIC-FILTER] ${category || 'all'}: ${basicFiles.length}개 파일`);
    return basicFiles;
  };

  // 파일명에서 카테고리 추출
  const extractCategoryFromFileName = (fileName: string): string => {
    const name = fileName.toLowerCase();
    if (name.includes('게이트웨이') || name.includes('gateway')) return 'gateway';
    if (name.includes('송풍') || name.includes('fan')) return 'fan';
    if (name.includes('배전') || name.includes('차단기') || name.includes('electrical')) return 'electrical';
    return 'others';
  };

  if (!facilities) {
    return (
      <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Camera className="w-6 h-6 text-gray-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">사진 업로드</h2>
        </div>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">시설 정보를 먼저 불러와주세요.</p>
        </div>
      </div>
    );
  }

  // 🎯 시설별 순번 표시 번호 가져오기 (어드민과 완전히 동일한 방식)
  const getFacilityDisplayNumber = (facility: Facility, facilityType: 'discharge' | 'prevention') => {
    // 🔧 어드민과 동일: 데이터베이스 facility.number 직접 사용
    const facilityNumber = facility.number || 1;
    const prefix = facilityType === 'discharge' ? '배' : '방';
    return `${prefix}${facilityNumber}`;
  };

  // 배출구별 시설 그룹화
  const facilitiesByOutlet = () => {
    const grouped: { [outlet: number]: { discharge: Facility[], prevention: Facility[] } } = {};
    
    if (!facilities || !facilities.discharge || !facilities.prevention) {
      return grouped;
    }
    
    facilities.discharge.forEach(facility => {
      if (!grouped[facility.outlet]) {
        grouped[facility.outlet] = { discharge: [], prevention: [] };
      }
      grouped[facility.outlet].discharge.push(facility);
    });
    
    facilities.prevention.forEach(facility => {
      if (!grouped[facility.outlet]) {
        grouped[facility.outlet] = { discharge: [], prevention: [] };
      }
      grouped[facility.outlet].prevention.push(facility);
    });
    
    return grouped;
  };

  const outletFacilities = facilitiesByOutlet();
  const outlets = Object.keys(outletFacilities).map(Number).sort((a, b) => a - b);

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Camera className="w-6 h-6 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">시설별 사진 업로드</h2>
        </div>
        <button
          onClick={() => loadUploadedFiles(true)}
          disabled={loadingFiles}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="space-y-6">
        {/* 배출구별 시설 */}
        {outlets.map(outlet => {
          const outletData = outletFacilities[outlet];
          const outletPrevention = outletData.prevention || [];
          const outletDischarge = outletData.discharge || [];
          
          return (
            <div key={outlet} className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">
                  배출구 {outlet}
                </span>
              </h3>
              
              {/* 방지시설 */}
              {outletPrevention.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-md font-medium text-green-600 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    방지시설 ({outletPrevention.reduce((total, f) => total + f.quantity, 0)}개)
                  </h4>
                  
                  {outletPrevention.map((facility) => 
                    // 시설 수량만큼 개별 시설 생성
                    Array.from({ length: facility.quantity }, (_, quantityIndex) => {
                      // 데이터베이스 시설 번호를 유지하고 수량 인덱스만 추가
                      const quantityInstanceIndex = quantityIndex + 1;
                      const uploadKey = `prevention-${facility.outlet}-${facility.number}-${quantityInstanceIndex}`;
                      const isUploading = uploading[uploadKey];
                      const progress = uploadProgress[uploadKey] || 0;
                      const facilityFiles = getFilesForFacility(facility, 'prevention', quantityInstanceIndex);

                      return (
                        <div key={`prevention-${facility.outlet}-${facility.number}-${quantityInstanceIndex}`} className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
                          {/* 시설 정보 */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className="bg-green-600 text-white px-2 py-1 rounded text-sm font-medium">
                              {getFacilityDisplayNumber(facility, 'prevention')}{facility.quantity > 1 ? `-${quantityInstanceIndex}` : ''}
                            </span>
                            <span className="text-gray-600 text-sm">배출구 {facility.outlet}</span>
                            {facility.quantity > 1 && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                {quantityInstanceIndex}/{facility.quantity}
                              </span>
                            )}
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

                        {/* 사진 업로드 */}
                        {isUploading && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                              <span>업로드 중...</span>
                              <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="relative mb-3">
                          <input
                            type="file"
                            id={`upload-prevention-${facility.outlet}-${facility.number}-${quantityInstanceIndex}`}
                            multiple
                            accept="image/*"
                            onChange={(e) => e.target.files && handleFacilityUpload(e.target.files, facility, 'prevention', quantityInstanceIndex)}
                            disabled={isUploading}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className={`
                            border-2 border-dashed border-green-300 rounded-lg p-4 text-center transition-colors
                            ${isUploading ? 'bg-green-100 border-green-400' : 'hover:border-green-400 hover:bg-green-50'}
                            ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}
                          `}>
                            <Upload className="w-8 h-8 text-green-600 mx-auto mb-2" />
                            <p className="text-green-700 font-medium">
                              {isUploading ? '업로드 중...' : '사진 업로드 (여러 장 선택 가능)'}
                            </p>
                            <p className="text-green-600 text-sm mt-1">
                              클릭하거나 파일을 드래그하여 업로드
                            </p>
                          </div>
                        </div>

                        {/* 업로드된 사진들 - 배출시설과 동일한 스타일 적용 */}
                        {facilityFiles.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {facilityFiles.map((file, fileIndex) => (
                              <div 
                                key={file.id} 
                                className={`
                                  relative group cursor-pointer bg-white rounded-lg border-2 border-gray-200 
                                  overflow-hidden transition-all duration-300 hover:border-green-400 hover:shadow-md
                                  aspect-[4/3]
                                  ${(file as any).justUploaded ? 'animate-pulse border-green-400 shadow-lg' : ''}
                                `}
                                onClick={(e) => handleFileSelect(file, e)}
                              >
                                {/* 사진 순번 배지 */}
                                <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center z-10">
                                  {fileIndex + 1}
                                </div>
                                
                                <LazyImage
                                  src={file.thumbnailUrl || file.webViewLink}
                                  alt={file.name}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                />
                                
                                {/* 호버 오버레이 */}
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                                  <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                </div>
                                
                                {/* 파일명과 순번 정보 오버레이 */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                  <p className="text-white text-xs font-medium truncate">
                                    {fileIndex + 1}번째 - {file.originalName || file.name}
                                  </p>
                                </div>
                                
                                {/* 업로드 직후 깜빡임 효과 */}
                                {(file as any).justUploaded && (
                                  <div className="absolute inset-0 bg-green-400 bg-opacity-20 animate-pulse" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ).flat()}
                </div>
              )}
              
              {/* 배출시설 */}
              {outletDischarge.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-orange-600 mb-3 flex items-center gap-2">
                    <Factory className="w-4 h-4" />
                    배출시설 ({outletDischarge.reduce((total, f) => total + f.quantity, 0)}개)
                  </h4>
                  
                  {outletDischarge.map((facility) => 
                    // 시설 수량만큼 개별 시설 생성
                    Array.from({ length: facility.quantity }, (_, quantityIndex) => {
                      // 데이터베이스 시설 번호를 유지하고 수량 인덱스만 추가
                      const quantityInstanceIndex = quantityIndex + 1;
                      const uploadKey = `discharge-${facility.outlet}-${facility.number}-${quantityInstanceIndex}`;
                      const isUploading = uploading[uploadKey];
                      const progress = uploadProgress[uploadKey] || 0;
                      const facilityFiles = getFilesForFacility(facility, 'discharge', quantityInstanceIndex);

                      return (
                        <div key={`discharge-${facility.outlet}-${facility.number}-${quantityInstanceIndex}`} className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-3">
                          {/* 시설 정보 */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className="bg-orange-600 text-white px-2 py-1 rounded text-sm font-medium">
                              {getFacilityDisplayNumber(facility, 'discharge')}{facility.quantity > 1 ? `-${quantityInstanceIndex}` : ''}
                            </span>
                            <span className="text-gray-600 text-sm">배출구 {facility.outlet}</span>
                            {facility.quantity > 1 && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                                {quantityInstanceIndex}/{facility.quantity}
                              </span>
                            )}
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

                        {/* 사진 업로드 */}
                        {isUploading && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                              <span>업로드 중...</span>
                              <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="relative mb-3">
                          <input
                            type="file"
                            id={`upload-discharge-${facility.outlet}-${facility.number}-${quantityInstanceIndex}`}
                            multiple
                            accept="image/*"
                            onChange={(e) => e.target.files && handleFacilityUpload(e.target.files, facility, 'discharge', quantityInstanceIndex)}
                            disabled={isUploading}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className={`
                            border-2 border-dashed border-orange-300 rounded-lg p-4 text-center transition-colors
                            ${isUploading ? 'bg-orange-100 border-orange-400' : 'hover:border-orange-400 hover:bg-orange-50'}
                            ${isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}
                          `}>
                            <Upload className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                            <p className="text-orange-700 font-medium">
                              {isUploading ? '업로드 중...' : '사진 업로드 (여러 장 선택 가능)'}
                            </p>
                            <p className="text-orange-600 text-sm mt-1">
                              클릭하거나 파일을 드래그하여 업로드
                            </p>
                          </div>
                        </div>

                        {/* 업로드된 사진들 */}
                        {facilityFiles.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {facilityFiles.map((file, fileIndex) => (
                              <div 
                                key={file.id} 
                                className={`
                                  relative group cursor-pointer bg-white rounded-lg border-2 border-gray-200 
                                  overflow-hidden transition-all duration-300 hover:border-orange-400 hover:shadow-md
                                  aspect-[4/3]
                                  ${(file as any).justUploaded ? 'animate-pulse border-orange-400 shadow-lg' : ''}
                                `}
                                onClick={(e) => handleFileSelect(file, e)}
                              >
                                {/* 사진 순번 배지 */}
                                <div className="absolute top-2 left-2 bg-orange-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center z-10">
                                  {fileIndex + 1}
                                </div>
                                
                                <LazyImage
                                  src={file.thumbnailUrl || file.webViewLink}
                                  alt={file.name}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                />
                                
                                {/* 호버 오버레이 */}
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                                  <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                </div>
                                
                                {/* 파일명과 순번 정보 오버레이 */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                  <p className="text-white text-xs font-medium truncate">
                                    {fileIndex + 1}번째 - {file.originalName || file.name}
                                  </p>
                                </div>
                                
                                {/* 업로드 직후 깜빡임 효과 */}
                                {(file as any).justUploaded && (
                                  <div className="absolute inset-0 bg-orange-400 bg-opacity-20 animate-pulse" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ).flat()}
                </div>
              )}
            </div>
          );
        })}

        {/* 기본사진 섹션 */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            기본사진
          </h3>
          
          <div className="space-y-6">
            {/* 게이트웨이 섹션 */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="text-md font-medium text-purple-700 mb-3 flex items-center gap-2">
                <Router className="w-4 h-4" />
                게이트웨이
              </h4>
              
              {/* 업로드 진행률 (게이트웨이) */}
              {uploading['basic-gateway'] && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                    <span>업로드 중...</span>
                    <span>{Math.round(uploadProgress['basic-gateway'] || 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress['basic-gateway'] || 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="relative mb-3">
                <input
                  type="file"
                  id="upload-gateway"
                  multiple
                  accept="image/*"
                  onChange={(e) => e.target.files && handleBasicUpload(e.target.files, 'gateway')}
                  disabled={uploading['basic-gateway']}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className={`
                  border-2 border-dashed border-purple-300 rounded-lg p-4 text-center transition-colors
                  ${uploading['basic-gateway'] ? 'bg-purple-100 border-purple-400' : 'hover:border-purple-400 hover:bg-purple-50'}
                  ${uploading['basic-gateway'] ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}>
                  <Upload className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                  <p className="text-purple-700 font-medium">
                    {uploading['basic-gateway'] ? '업로드 중...' : '게이트웨이 사진 업로드'}
                  </p>
                  <p className="text-purple-600 text-sm mt-1">
                    클릭하거나 파일을 드래그하여 업로드
                  </p>
                </div>
              </div>

              {/* 게이트웨이 사진들 */}
              {getBasicFiles('gateway').length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {getBasicFiles('gateway').map((file) => (
                    <div 
                      key={file.id} 
                      className={`
                        relative group cursor-pointer bg-white rounded-lg border-2 border-gray-200 
                        overflow-hidden transition-all duration-300 hover:border-purple-400 hover:shadow-md
                        aspect-[4/3]
                        ${(file as any).justUploaded ? 'animate-pulse border-purple-400 shadow-lg' : ''}
                      `}
                      onClick={(e) => handleFileSelect(file, e)}
                    >
                      <LazyImage
                        src={file.thumbnailUrl || file.webViewLink}
                        alt={file.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <p className="text-white text-xs font-medium truncate">
                          {file.originalName || file.name}
                        </p>
                      </div>
                      
                      {(file as any).justUploaded && (
                        <div className="absolute inset-0 bg-purple-400 bg-opacity-20 animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 송풍팬 섹션 */}
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
              <h4 className="text-md font-medium text-cyan-700 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                송풍팬
              </h4>

              {/* 촬영 가이드 */}
              <div className="mb-3 p-3 bg-cyan-100 border border-cyan-300 rounded-lg">
                <p className="text-xs text-cyan-800 font-medium mb-1">📸 필요 사진:</p>
                <ul className="text-xs text-cyan-700 space-y-0.5 ml-4">
                  <li>• 송풍팬</li>
                  <li>• 송풍시설 명판 (문자 식별 가능하도록 촬영)</li>
                  <li>• 분전함 외부 (주위가 넓게 보이도록 촬영)</li>
                  <li>• 분전함 내부</li>
                  <li>• 전류계 (문자 식별 가능하도록 촬영)</li>
                </ul>
              </div>

              {/* 업로드 진행률 (송풍팬) */}
              {uploading['basic-fan'] && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                    <span>업로드 중...</span>
                    <span>{Math.round(uploadProgress['basic-fan'] || 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-cyan-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress['basic-fan'] || 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="relative mb-3">
                <input
                  type="file"
                  id="upload-fan"
                  multiple
                  accept="image/*"
                  onChange={(e) => e.target.files && handleBasicUpload(e.target.files, 'fan')}
                  disabled={uploading['basic-fan']}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className={`
                  border-2 border-dashed border-cyan-300 rounded-lg p-4 text-center transition-colors
                  ${uploading['basic-fan'] ? 'bg-cyan-100 border-cyan-400' : 'hover:border-cyan-400 hover:bg-cyan-50'}
                  ${uploading['basic-fan'] ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}>
                  <Upload className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
                  <p className="text-cyan-700 font-medium">
                    {uploading['basic-fan'] ? '업로드 중...' : '송풍팬 사진 업로드'}
                  </p>
                  <p className="text-cyan-600 text-sm mt-1">
                    클릭하거나 파일을 드래그하여 업로드
                  </p>
                </div>
              </div>

              {/* 송풍팬 사진들 */}
              {getBasicFiles('fan').length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {getBasicFiles('fan').map((file) => (
                    <div 
                      key={file.id} 
                      className={`
                        relative group cursor-pointer bg-white rounded-lg border-2 border-gray-200 
                        overflow-hidden transition-all duration-300 hover:border-cyan-400 hover:shadow-md
                        aspect-[4/3]
                        ${(file as any).justUploaded ? 'animate-pulse border-cyan-400 shadow-lg' : ''}
                      `}
                      onClick={(e) => handleFileSelect(file, e)}
                    >
                      <LazyImage
                        src={file.thumbnailUrl || file.webViewLink}
                        alt={file.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <p className="text-white text-xs font-medium truncate">
                          {file.originalName || file.name}
                        </p>
                      </div>
                      
                      {(file as any).justUploaded && (
                        <div className="absolute inset-0 bg-cyan-400 bg-opacity-20 animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 기타 섹션 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-md font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                기타
              </h4>
              
              {/* 업로드 진행률 (기타) */}
              {uploading['basic-others'] && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                    <span>업로드 중...</span>
                    <span>{Math.round(uploadProgress['basic-others'] || 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gray-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress['basic-others'] || 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="relative mb-3">
                <input
                  type="file"
                  id="upload-others"
                  multiple
                  accept="image/*"
                  onChange={(e) => e.target.files && handleBasicUpload(e.target.files, 'others')}
                  disabled={uploading['basic-others']}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className={`
                  border-2 border-dashed border-gray-300 rounded-lg p-4 text-center transition-colors
                  ${uploading['basic-others'] ? 'bg-gray-100 border-gray-400' : 'hover:border-gray-400 hover:bg-gray-50'}
                  ${uploading['basic-others'] ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}>
                  <Upload className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-700 font-medium">
                    {uploading['basic-others'] ? '업로드 중...' : '기타 사진 업로드'}
                  </p>
                  <p className="text-gray-600 text-sm mt-1">
                    클릭하거나 파일을 드래그하여 업로드
                  </p>
                </div>
              </div>

              {/* 기타 사진들 */}
              {getBasicFiles('others').length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {getBasicFiles('others').map((file) => (
                    <div 
                      key={file.id} 
                      className={`
                        relative group cursor-pointer bg-white rounded-lg border-2 border-gray-200 
                        overflow-hidden transition-all duration-300 hover:border-gray-400 hover:shadow-md
                        aspect-[4/3]
                        ${(file as any).justUploaded ? 'animate-pulse border-gray-400 shadow-lg' : ''}
                      `}
                      onClick={(e) => handleFileSelect(file, e)}
                    >
                      <LazyImage
                        src={file.thumbnailUrl || file.webViewLink}
                        alt={file.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center">
                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <p className="text-white text-xs font-medium truncate">
                          {file.originalName || file.name}
                        </p>
                      </div>
                      
                      {(file as any).justUploaded && (
                        <div className="absolute inset-0 bg-gray-400 bg-opacity-20 animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 사진 미리보기 모달 */}
      {selectedFile && modalPosition && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <div 
            ref={modalRef}
            tabIndex={-1}
            className="fixed bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden focus:outline-none"
            style={{
              left: `${modalPosition.x}px`,
              top: `${modalPosition.y}px`,
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
                  {selectedFile.originalName || selectedFile.name}
                </h3>
                <p className="text-sm text-gray-600">
                  {selectedFile.folderName} • {(selectedFile.size / 1024 / 1024).toFixed(1)}MB
                </p>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* 모달 이미지 */}
            <div className="p-4">
              <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                <LazyImage
                  src={selectedFile.webViewLink}
                  alt={selectedFile.name}
                  className="w-full max-h-96 object-contain"
                />
              </div>
              
              {/* 액션 버튼 */}
              <div className="flex gap-3 justify-center mt-4">
                <a
                  href={selectedFile.downloadUrl}
                  download={selectedFile.name}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
                >
                  <Download className="w-4 h-4" />
                  다운로드
                </a>
                
                <button
                  onClick={() => deleteFile(selectedFile)}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium"
                >
                  <Trash2 className="w-4 h-4" />
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
      )}

      {/* 모달 애니메이션 스타일 */}
      <style jsx>{`
        @keyframes fade-in {
          from { 
            opacity: 0; 
            backdrop-filter: blur(0px);
          }
          to { 
            opacity: 1; 
            backdrop-filter: blur(4px);
          }
        }
        @keyframes modalSlideIn {
          from { 
            transform: scale(0.95) translateY(-10px);
            opacity: 0;
          }
          to { 
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}