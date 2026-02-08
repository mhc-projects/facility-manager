// utils/facility-photo-tracker.ts - 시설별 사진 추적 및 관리 시스템
// 데이터베이스 기반 안정적인 시설별 사진 관리

import { UploadedFile } from '@/types'

/**
 * 시설별 사진 정보
 */
export interface FacilityPhotoInfo {
  facilityId: string
  facilityType: 'discharge' | 'prevention' | 'basic'
  facilityNumber: number  // 배1, 배2... 방1, 방2...
  outletNumber?: number   // 배출구 번호 (기본사진에는 없음)
  displayName: string     // 표시용 이름 (배1, 방1, 게이트웨이 등)
  photos: FacilityPhoto[]
  totalPhotoCount: number
  maxPhotoIndex: number
}

/**
 * 개별 사진 정보
 */
export interface FacilityPhoto {
  id: string
  fileName: string
  originalFileName: string
  photoIndex: number      // 해당 시설 내에서의 사진 순번 (1, 2, 3...)
  uploadedAt: string
  fileSize: number
  mimeType: string
  filePath: string
  downloadUrl: string
  thumbnailUrl: string
  caption?: string | null // 사진 설명 (최대 500자)
  isRecent?: boolean      // 최근 업로드된 사진 (깜빡임 효과용)
}

/**
 * 시설별 사진 추적기 클래스
 */
export class FacilityPhotoTracker {
  private facilityPhotos: Map<string, FacilityPhotoInfo> = new Map()
  private businessName: string

  constructor(businessName: string) {
    this.businessName = businessName
  }

  /**
   * 업로드된 파일 목록으로부터 시설별 사진 정보 구성
   */
  public buildFromUploadedFiles(uploadedFiles: UploadedFile[]): void {
    this.facilityPhotos.clear()

    for (const file of uploadedFiles) {
      const facilityKey = this.extractFacilityKey(file)
      if (!facilityKey) continue

      const facilityInfo = this.extractFacilityInfo(file)
      if (!facilityInfo) continue

      // 시설별 사진 그룹 가져오기 또는 생성
      let facilityPhotoInfo = this.facilityPhotos.get(facilityKey)
      if (!facilityPhotoInfo) {
        facilityPhotoInfo = {
          facilityId: facilityInfo.facilityId,
          facilityType: facilityInfo.facilityType,
          facilityNumber: facilityInfo.facilityNumber,
          outletNumber: facilityInfo.outletNumber,
          displayName: facilityInfo.displayName,
          photos: [],
          totalPhotoCount: 0,
          maxPhotoIndex: 0
        }
        this.facilityPhotos.set(facilityKey, facilityPhotoInfo)
      }

      // 사진 정보 추가
      const photo: FacilityPhoto = {
        id: file.id,
        fileName: file.name,
        originalFileName: file.originalName || file.name,
        photoIndex: this.extractPhotoIndex(file),
        uploadedAt: file.createdTime,
        fileSize: file.size,
        mimeType: file.mimeType,
        filePath: file.filePath || '',
        downloadUrl: file.downloadUrl,
        thumbnailUrl: file.thumbnailUrl || file.downloadUrl,
        caption: (file as any).caption || null,
        isRecent: (file as any).justUploaded || false
      }

      facilityPhotoInfo.photos.push(photo)
    }

    // 각 시설별로 사진 정렬 및 통계 계산
    for (const [key, facilityInfo] of this.facilityPhotos) {
      // 사진 순번별로 정렬
      facilityInfo.photos.sort((a, b) => a.photoIndex - b.photoIndex)
      
      // 통계 업데이트
      facilityInfo.totalPhotoCount = facilityInfo.photos.length
      facilityInfo.maxPhotoIndex = Math.max(...facilityInfo.photos.map(p => p.photoIndex), 0)
    }
  }

  /**
   * 특정 시설의 사진 목록 조회
   * 정확한 키 매칭만 사용 (역호환성 로직 제거)
   * 🆕 송풍팬 배출구 1번: 레거시 사진(outletNumber 없음)도 포함
   * 🆕 인스턴스 번호로 다중 시설 구분
   */
  public getFacilityPhotos(facilityType: 'discharge' | 'prevention' | 'basic',
                          facilityNumber?: number,
                          outletNumber?: number,
                          category?: string,
                          instanceNumber?: number): FacilityPhoto[] {  // 🆕 인스턴스 번호 추가
    const facilityKey = this.generateFacilityKey(facilityType, facilityNumber, outletNumber, category, instanceNumber)
    const facilityInfo = this.facilityPhotos.get(facilityKey)

    // 🆕 송풍팬 배출구 1번 요청 시 레거시 사진도 포함
    if (category === 'fan' && outletNumber === 1) {
      const outlet1Photos = facilityInfo?.photos || []
      const legacyKey = 'basic-fan' // 배출구 번호가 없는 기존 송풍팬 키
      const legacyInfo = this.facilityPhotos.get(legacyKey)
      const allLegacyPhotos = legacyInfo?.photos || []

      // 🔧 레거시 사진 필터링: 파일명이나 폴더에 배출구 번호가 명시되지 않은 것만
      const trueLegacyPhotos = allLegacyPhotos.filter(photo => {
        // 파일명에 "송풍팬-배N" 패턴이 있으면 제외 (새로운 형식)
        if (photo.fileName.match(/송풍팬-배\d+/)) {
          return false
        }
        // 폴더명에 "outlet-N" 패턴이 있으면 제외 (새로운 형식)
        if (photo.filePath.match(/fan[\/\\]outlet-\d+/)) {
          return false
        }
        // 위 조건에 해당하지 않으면 진짜 레거시 사진
        return true
      })

      if (trueLegacyPhotos.length > 0) {
        console.log(`🔄 [LEGACY-FAN-PHOTOS] 배출구 1번에 레거시 송풍팬 사진 ${trueLegacyPhotos.length}장 포함 (전체 ${allLegacyPhotos.length}장 중 필터링)`);
        // 배출구 1번 사진 + 진짜 레거시 사진 합치기 (중복 제거)
        const combined = [...outlet1Photos, ...trueLegacyPhotos]
        // filePath 기준으로 중복 제거
        const unique = Array.from(
          new Map(combined.map(photo => [photo.filePath, photo])).values()
        )
        // photoIndex 기준으로 정렬
        return unique.sort((a, b) => a.photoIndex - b.photoIndex)
      }
    }

    if (facilityInfo) {
      return facilityInfo.photos
    }

    // 정확한 키로 찾지 못하면 빈 배열 반환
    return []
  }

  /**
   * 특정 시설의 다음 사진 인덱스 계산
   * 🆕 인스턴스 번호로 다중 시설 구분
   */
  public getNextPhotoIndex(facilityType: 'discharge' | 'prevention' | 'basic',
                          facilityNumber?: number,
                          outletNumber?: number,
                          category?: string,
                          instanceNumber?: number): number {  // 🆕 인스턴스 번호 추가
    const facilityKey = this.generateFacilityKey(facilityType, facilityNumber, outletNumber, category, instanceNumber)
    const facilityInfo = this.facilityPhotos.get(facilityKey)
    return (facilityInfo?.maxPhotoIndex || 0) + 1
  }

  /**
   * 시설별 사진 개수 조회
   * 🆕 인스턴스 번호로 다중 시설 구분
   */
  public getFacilityPhotoCount(facilityType: 'discharge' | 'prevention' | 'basic',
                              facilityNumber?: number,
                              outletNumber?: number,
                              category?: string,
                              instanceNumber?: number): number {  // 🆕 인스턴스 번호 추가
    const facilityKey = this.generateFacilityKey(facilityType, facilityNumber, outletNumber, category, instanceNumber)
    const facilityInfo = this.facilityPhotos.get(facilityKey)
    return facilityInfo?.totalPhotoCount || 0
  }

  /**
   * 모든 시설 정보 조회
   */
  public getAllFacilities(): FacilityPhotoInfo[] {
    return Array.from(this.facilityPhotos.values())
  }

  /**
   * 배출시설 목록 조회 (배출구별 정렬)
   */
  public getDischargeFacilities(): FacilityPhotoInfo[] {
    return Array.from(this.facilityPhotos.values())
      .filter(f => f.facilityType === 'discharge')
      .sort((a, b) => {
        // 배출구 번호 -> 시설 번호 순으로 정렬
        if (a.outletNumber !== b.outletNumber) {
          return (a.outletNumber || 0) - (b.outletNumber || 0)
        }
        return a.facilityNumber - b.facilityNumber
      })
  }

  /**
   * 방지시설 목록 조회 (배출구별 정렬)
   */
  public getPreventionFacilities(): FacilityPhotoInfo[] {
    return Array.from(this.facilityPhotos.values())
      .filter(f => f.facilityType === 'prevention')
      .sort((a, b) => {
        // 배출구 번호 -> 시설 번호 순으로 정렬
        if (a.outletNumber !== b.outletNumber) {
          return (a.outletNumber || 0) - (b.outletNumber || 0)
        }
        return a.facilityNumber - b.facilityNumber
      })
  }

  /**
   * 기본사진 목록 조회 (카테고리별)
   */
  public getBasicFacilities(): FacilityPhotoInfo[] {
    return Array.from(this.facilityPhotos.values())
      .filter(f => f.facilityType === 'basic')
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * 사진 추가 (업로드 후)
   * 🆕 인스턴스 번호로 다중 시설 구분
   */
  public addPhoto(facilityType: 'discharge' | 'prevention' | 'basic',
                 photo: Omit<FacilityPhoto, 'photoIndex'>,
                 facilityNumber?: number,
                 outletNumber?: number,
                 category?: string,
                 instanceNumber?: number): number {  // 🆕 인스턴스 번호 추가
    const facilityKey = this.generateFacilityKey(facilityType, facilityNumber, outletNumber, category, instanceNumber)
    
    // 시설 정보 가져오기 또는 생성
    let facilityInfo = this.facilityPhotos.get(facilityKey)
    if (!facilityInfo) {
      facilityInfo = {
        facilityId: this.generateFacilityId(facilityType, facilityNumber, outletNumber, category),
        facilityType,
        facilityNumber: facilityNumber || 0,
        outletNumber,
        displayName: this.generateDisplayName(facilityType, facilityNumber, category),
        photos: [],
        totalPhotoCount: 0,
        maxPhotoIndex: 0
      }
      this.facilityPhotos.set(facilityKey, facilityInfo)
    }

    // 사진 인덱스 할당
    const photoIndex = facilityInfo.maxPhotoIndex + 1
    const fullPhoto: FacilityPhoto = {
      ...photo,
      photoIndex,
      isRecent: true // 새로 추가된 사진 마킹
    }

    // 사진 추가 및 통계 업데이트
    facilityInfo.photos.push(fullPhoto)
    facilityInfo.photos.sort((a, b) => a.photoIndex - b.photoIndex)
    facilityInfo.totalPhotoCount = facilityInfo.photos.length
    facilityInfo.maxPhotoIndex = Math.max(facilityInfo.maxPhotoIndex, photoIndex)

    return photoIndex
  }

  /**
   * 사진 삭제
   */
  public removePhoto(photoId: string): boolean {
    for (const [key, facilityInfo] of this.facilityPhotos) {
      const photoIndex = facilityInfo.photos.findIndex(p => p.id === photoId)
      if (photoIndex !== -1) {
        facilityInfo.photos.splice(photoIndex, 1)
        
        // 통계 업데이트
        facilityInfo.totalPhotoCount = facilityInfo.photos.length
        facilityInfo.maxPhotoIndex = Math.max(...facilityInfo.photos.map(p => p.photoIndex), 0)
        
        // 빈 시설 정보 제거
        if (facilityInfo.photos.length === 0) {
          this.facilityPhotos.delete(key)
        }
        
        return true
      }
    }
    return false
  }

  // 내부 유틸리티 메서드들

  private extractFacilityKey(file: UploadedFile): string | null {
    const facilityInfo = this.extractFacilityInfo(file)
    if (!facilityInfo) return null

    // 🆕 facilityId에 이미 인스턴스가 포함되어 있으므로 그대로 반환
    return facilityInfo.facilityId
  }

  private extractFacilityInfo(file: UploadedFile): {
    facilityId: string
    facilityType: 'discharge' | 'prevention' | 'basic'
    facilityNumber: number
    outletNumber?: number
    displayName: string
    category?: string
  } | null {
    // 폴더명 기반 타입 판단
    let facilityType: 'discharge' | 'prevention' | 'basic'
    if (file.folderName === '배출시설') {
      facilityType = 'discharge'
    } else if (file.folderName === '방지시설') {
      facilityType = 'prevention'
    } else {
      facilityType = 'basic'
    }

    // facilityInfo JSON 파싱 시도
    try {
      const parsed = JSON.parse(file.facilityInfo || '{}')
      if (parsed.outlet && parsed.number && parsed.type) {
        const instance = parsed.instance || 1  // 🆕 인스턴스 번호 (기본값 1로 하위 호환성 유지)
        return {
          facilityId: `${parsed.type}-${parsed.outlet}-${parsed.number}-${instance}`,  // 🆕 인스턴스 포함
          facilityType: parsed.type,
          facilityNumber: this.calculateSequentialNumber(parsed.type, parsed.outlet, parsed.number),
          outletNumber: parsed.outlet,
          displayName: `${parsed.type === 'discharge' ? '배' : '방'}${this.calculateSequentialNumber(parsed.type, parsed.outlet, parsed.number)}`,
          category: undefined
        };
      }
    } catch (e) {
      // JSON 파싱 실패 시 facilityInfo 문자열 파싱 시도
      if (file.facilityInfo) {
        // "prevention_1_1" 형식 파싱
        const facilityInfoMatch = file.facilityInfo.match(/^(discharge|prevention)_(\d+)_(\d+)$/)
        if (facilityInfoMatch) {
          const [, type, outletStr, numberStr] = facilityInfoMatch
          const outlet = parseInt(outletStr)
          const number = parseInt(numberStr)
          const facilityTypeFromInfo = type as 'discharge' | 'prevention'

          return {
            facilityId: `${type}-${outlet}-${number}`,
            facilityType: facilityTypeFromInfo,
            facilityNumber: number,
            outletNumber: outlet,
            displayName: `${type === 'discharge' ? '배' : '방'}${number}`,
            category: undefined
          };
        }
      }
    }

    // 기본사진인 경우 카테고리 추출
    if (facilityType === 'basic') {
      const category = this.extractBasicCategory(file)

      // 🆕 송풍팬 + 배출구별 패턴 감지: fan/outlet-N 또는 파일명에 송풍팬-배N
      if (category === 'fan') {
        console.log(`🔍 [EXTRACT-FAN] 송풍팬 사진 분석:`, {
          파일명: file.name,
          폴더명: file.folderName,
          전체경로: file.filePath
        });

        // 🔧 filePath에서 outlet-N 패턴 확인 (folderName은 "기본사진"으로만 설정되므로 전체 경로 사용)
        const outletMatch = file.filePath?.match(/fan[\/\\]outlet-(\d+)/)
        if (outletMatch) {
          const outletNumber = parseInt(outletMatch[1], 10)
          console.log(`✅ [EXTRACT-FAN-PATH] 전체 경로에서 배출구 ${outletNumber} 감지 (${file.filePath})`);
          return {
            facilityId: `fan-outlet-${outletNumber}`,
            facilityType: 'basic',
            facilityNumber: 0,
            outletNumber: outletNumber,
            displayName: `배출구 ${outletNumber}번 송풍팬`,
            category: 'fan'
          };
        }

        // 파일명에서 송풍팬-배N 패턴 확인
        const fileOutletMatch = file.name.match(/송풍팬-배(\d+)/)
        if (fileOutletMatch) {
          const outletNumber = parseInt(fileOutletMatch[1], 10)
          console.log(`✅ [EXTRACT-FAN-FILENAME] 파일명에서 배출구 ${outletNumber} 감지`);
          return {
            facilityId: `fan-outlet-${outletNumber}`,
            facilityType: 'basic',
            facilityNumber: 0,
            outletNumber: outletNumber,
            displayName: `배출구 ${outletNumber}번 송풍팬`,
            category: 'fan'
          };
        }

        console.log(`⚠️ [EXTRACT-FAN-LEGACY] 배출구 번호 없음 (레거시 사진)`);
      }

      return {
        facilityId: `basic-${category}`,
        facilityType: 'basic',
        facilityNumber: 0,
        displayName: this.getCategoryDisplayName(category),
        category
      };
    }

    // 파일명에서 시설 번호 추출 시도
    const match = file.name.match(/(배|방)(\d+)_/)
    if (match) {
      const prefix = match[1]
      const number = parseInt(match[2])
      const type = prefix === '배' ? 'discharge' : 'prevention'

      return {
        facilityId: `${type}-${number}`,
        facilityType: type,
        facilityNumber: number,
        displayName: `${prefix}${number}`,
        category: undefined
      };
    }

    return null
  }

  private calculateSequentialNumber(facilityType: string, outletNumber: number, facilityNumber: number): number {
    // 실제 시설 번호 계산 로직
    // 이 부분은 facility-numbering.ts의 로직과 연동되어야 함
    // 지금은 간단히 기본 번호 반환
    return facilityNumber
  }

  private extractBasicCategory(file: UploadedFile): string {
    const fileName = file.name.toLowerCase()
    const facilityInfo = (file.facilityInfo || '').toLowerCase()

    if (fileName.includes('게이트웨이') || fileName.includes('gateway') || facilityInfo.includes('gateway')) {
      return 'gateway'
    }
    if (fileName.includes('송풍') || fileName.includes('fan') || facilityInfo.includes('fan')) {
      return 'fan'
    }
    if (fileName.includes('배전') || fileName.includes('electrical') || facilityInfo.includes('electrical')) {
      return 'electrical'
    }
    return 'others'
  }

  private extractPhotoIndex(file: UploadedFile): number {
    // 파일명에서 사진 순번 추출 시도
    const match = file.name.match(/_(\d+)\./);
    if (match) {
      return parseInt(match[1])
    }
    
    // 기본값: 업로드 시간 기반 순번
    const timestamp = new Date(file.createdTime).getTime()
    return Math.floor(timestamp / 1000) % 10000
  }

  private generateFacilityKey(facilityType: 'discharge' | 'prevention' | 'basic',
                             facilityNumber?: number,
                             outletNumber?: number,
                             category?: string,
                             instanceNumber?: number): string {  // 🆕 인스턴스 번호 추가
    if (facilityType === 'basic') {
      // 🆕 송풍팬 + 배출구별 키 생성
      if (category === 'fan' && outletNumber !== undefined) {
        return `fan-outlet-${outletNumber}`
      }
      return `basic-${category || 'others'}`
    }
    const instance = instanceNumber || 1  // 🆕 기본값 1로 하위 호환성 유지
    return `${facilityType}-${outletNumber || 0}-${facilityNumber || 0}-${instance}`  // 🆕 인스턴스 포함
  }

  private generateFacilityId(facilityType: 'discharge' | 'prevention' | 'basic',
                            facilityNumber?: number,
                            outletNumber?: number,
                            category?: string): string {
    if (facilityType === 'basic') {
      // 🆕 송풍팬 + 배출구별 ID 생성
      if (category === 'fan' && outletNumber !== undefined) {
        return `fan-outlet-${outletNumber}`
      }
      return `basic-${category || 'others'}`
    }
    return `${facilityType}-${outletNumber}-${facilityNumber}`
  }

  private generateDisplayName(facilityType: 'discharge' | 'prevention' | 'basic',
                             facilityNumber?: number,
                             category?: string): string {
    if (facilityType === 'basic') {
      return this.getCategoryDisplayName(category || 'others')
    }
    const prefix = facilityType === 'discharge' ? '배' : '방'
    return `${prefix}${facilityNumber || 0}`
  }

  private getCategoryDisplayName(category: string): string {
    switch (category) {
      case 'gateway': return '게이트웨이'
      case 'fan': return '송풍팬'
      case 'electrical': return '배전함'
      case 'others': return '기타'
      default: return '기타'
    }
  }

  /**
   * 통계 정보 조회
   */
  public getStatistics(): {
    totalFacilities: number
    totalPhotos: number
    dischargeFacilities: number
    preventionFacilities: number
    basicCategories: number
    averagePhotosPerFacility: number
  } {
    const facilities = Array.from(this.facilityPhotos.values())
    const totalPhotos = facilities.reduce((sum, f) => sum + f.totalPhotoCount, 0)
    
    return {
      totalFacilities: facilities.length,
      totalPhotos,
      dischargeFacilities: facilities.filter(f => f.facilityType === 'discharge').reduce((sum, f) => sum + f.totalPhotoCount, 0),
      preventionFacilities: facilities.filter(f => f.facilityType === 'prevention').reduce((sum, f) => sum + f.totalPhotoCount, 0),
      basicCategories: facilities.filter(f => f.facilityType === 'basic').reduce((sum, f) => sum + f.totalPhotoCount, 0),
      averagePhotosPerFacility: facilities.length > 0 ? Math.round((totalPhotos / facilities.length) * 10) / 10 : 0
    }
  }

  /**
   * 디버깅용 정보 출력
   */
  public debugInfo(): any {
    return {
      businessName: this.businessName,
      facilityCount: this.facilityPhotos.size,
      facilities: Array.from(this.facilityPhotos.entries()).map(([key, info]) => ({
        key,
        displayName: info.displayName,
        type: info.facilityType,
        photoCount: info.totalPhotoCount,
        maxIndex: info.maxPhotoIndex
      }))
    }
  }
}

/**
 * 시설별 사진 추적기 팩토리 함수
 */
export function createFacilityPhotoTracker(businessName: string): FacilityPhotoTracker {
  return new FacilityPhotoTracker(businessName)
}

/**
 * 업로드된 파일 목록을 시설별로 그룹화하는 헬퍼 함수
 */
export function groupFilesByFacility(uploadedFiles: UploadedFile[]): Map<string, UploadedFile[]> {
  const groups = new Map<string, UploadedFile[]>()
  
  for (const file of uploadedFiles) {
    let groupKey = 'unknown'
    
    // 폴더명 기반 그룹 키 생성
    if (file.folderName === '배출시설' || file.folderName === '방지시설') {
      // JSON 형식 시설 정보 파싱 시도
      try {
        const parsed = JSON.parse(file.facilityInfo || '{}')
        if (parsed.type && parsed.outlet && parsed.number) {
          groupKey = `${parsed.type}-${parsed.outlet}-${parsed.number}`
        }
      } catch (e) {
        // 파일명에서 추출 시도
        const match = file.name.match(/(배|방)(\d+)_/)
        if (match) {
          const type = match[1] === '배' ? 'discharge' : 'prevention'
          const number = match[2]
          groupKey = `${type}-${number}`
        }
      }
    } else {
      // 기본사진
      const category = extractCategoryFromFileName(file.name, file.facilityInfo || '')
      groupKey = `basic-${category}`
    }
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(file)
  }
  
  return groups
}

// 헬퍼 함수: 파일명에서 카테고리 추출
function extractCategoryFromFileName(fileName: string, facilityInfo: string): string {
  const combined = `${fileName} ${facilityInfo}`.toLowerCase()
  
  if (combined.includes('게이트웨이') || combined.includes('gateway')) return 'gateway'
  if (combined.includes('송풍') || combined.includes('fan')) return 'fan'
  if (combined.includes('배전') || combined.includes('electrical')) return 'electrical'
  return 'others'
}