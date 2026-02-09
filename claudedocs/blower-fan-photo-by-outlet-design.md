# 배출구별 송풍팬 사진 업로드 기능 설계

**작성일**: 2026-02-06
**상태**: 설계 완료 → 구현 대기

---

## 📋 요구사항

### 사용자 요청
> "business/[사업장명] 페이지에서 기본사진 영역에 송풍팬 섹션이 있는데 배출구 별로 송풍팬 사진을 올릴 수 있는 섹션이 있어야할거같아."

### 핵심 기능
1. **배출구별 송풍팬 구분**: 각 배출구마다 독립적인 송풍팬 사진 업로드 섹션
2. **기본사진 영역 내 배치**: 기존 "기본사진" 카테고리 내에서 송풍팬 하위 섹션 구성
3. **배출구 식별**: 배출구 번호와 연결하여 사진 관리
4. **일관된 UX**: 기존 시설 사진 업로드와 동일한 사용자 경험

---

## 🎨 UI 설계

### 현재 구조 (Before)
```
┌─ 기본사진 ──────────────────────────────┐
│                                          │
│  [게이트웨이 사진 업로드]                │
│  - 게이트웨이 1 (3장)                   │
│  - 게이트웨이 2 (2장)                   │
│                                          │
│  [송풍팬 사진 업로드]                    │
│  - 송풍팬 전체 (5장)  ← 🔴 배출구 구분 없음 │
│                                          │
│  [기타 사진 업로드]                      │
│  - 기타 (1장)                            │
│                                          │
└──────────────────────────────────────────┘
```

### 개선 구조 (After)
```
┌─ 기본사진 ──────────────────────────────┐
│                                          │
│  [게이트웨이 사진 업로드]                │
│  - 게이트웨이 1 (3장)                   │
│  - 게이트웨이 2 (2장)                   │
│                                          │
│  [송풍팬 사진 업로드] 🆕                 │
│  ┌─────────────────────────────────┐    │
│  │ 📍 배출구 1번 송풍팬              │    │
│  │ [📷 사진 선택] (2장)             │    │
│  │ ├─ 송풍팬-배1-1.jpg             │    │
│  │ └─ 송풍팬-배1-2.jpg             │    │
│  └─────────────────────────────────┘    │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │ 📍 배출구 2번 송풍팬              │    │
│  │ [📷 사진 선택] (1장)             │    │
│  │ └─ 송풍팬-배2-1.jpg             │    │
│  └─────────────────────────────────┘    │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │ 📍 배출구 3번 송풍팬              │    │
│  │ [📷 사진 선택] (0장)             │    │
│  │ (사진이 없습니다)                │    │
│  └─────────────────────────────────┘    │
│                                          │
│  [기타 사진 업로드]                      │
│  - 기타 (1장)                            │
│                                          │
└──────────────────────────────────────────┘
```

---

## 🏗️ 기술 구조

### 1. 데이터 구조

#### 파일 경로 규칙 (현재)
```
business/
  {사업장명}/
    기본사진/
      gateway/
        게이트웨이-1-1.jpg
        게이트웨이-2-1.jpg
      fan/
        송풍팬-1.jpg  ← 🔴 배출구 구분 없음
        송풍팬-2.jpg
      others/
        기타-1.jpg
```

#### 파일 경로 규칙 (개선)
```
business/
  {사업장명}/
    기본사진/
      gateway/
        게이트웨이-1-1.jpg
        게이트웨이-2-1.jpg
      fan/
        outlet-1/  🆕 배출구별 하위 폴더
          송풍팬-배1-1.jpg
          송풍팬-배1-2.jpg
        outlet-2/
          송풍팬-배2-1.jpg
        outlet-3/
          (비어있음)
      others/
        기타-1.jpg
```

### 2. TypeScript 인터페이스 확장

#### FacilityPhotoInfo 확장
```typescript
export interface FacilityPhotoInfo {
  facilityId: string
  facilityType: 'discharge' | 'prevention' | 'basic'
  facilityNumber: number
  outletNumber?: number  // 🆕 송풍팬의 경우 배출구 번호 포함
  displayName: string
  photos: FacilityPhoto[]
  totalPhotoCount: number
  maxPhotoIndex: number
}
```

#### 파일명 패턴
```typescript
// 기존 (배출구 구분 없음)
송풍팬-1.jpg
송풍팬-2.jpg

// 개선 (배출구 포함)
송풍팬-배1-1.jpg  // 배출구 1번의 1번째 사진
송풍팬-배1-2.jpg  // 배출구 1번의 2번째 사진
송풍팬-배2-1.jpg  // 배출구 2번의 1번째 사진
```

---

## 📊 데이터 플로우

### 업로드 플로우
```
┌──────────────┐
│ 사용자       │ 배출구 2번 송풍팬 사진 선택
│              │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ UI Component │ outletNumber: 2, category: 'fan'
│              │ fileName: "송풍팬-배2-1.jpg"
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Upload API   │ POST /api/upload-supabase
│              │ folderPath: "business/군양/기본사진/fan/outlet-2/"
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Supabase     │ uploaded_files 테이블
│ Storage      │ - folder_name: "기본사진/fan/outlet-2"
│              │ - file_path: "business/군양/기본사진/fan/outlet-2/송풍팬-배2-1.jpg"
└──────────────┘
```

### 조회 플로우
```
┌──────────────┐
│ UI 렌더링    │ 배출구별 송풍팬 섹션 표시
│              │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ FileContext  │ photos 배열에서 fan 카테고리 필터링
│              │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ PhotoTracker │ buildFromUploadedFiles()
│              │ - folder_name에서 "outlet-{N}" 추출
│              │ - 배출구별로 그룹화
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ UI 표시      │ 배출구 1번: 2장
│              │ 배출구 2번: 1장
│              │ 배출구 3번: 0장
└──────────────┘
```

---

## ✅ 구현 단계

### Phase 1: FacilityPhotoTracker 확장 (30분)

**파일**: `utils/facility-photo-tracker.ts`

#### 1.1 extractFacilityInfo 함수 수정
```typescript
private extractFacilityInfo(file: UploadedFile): FacilityInfo | null {
  const folderName = file.folderName || '';

  // 송풍팬 + 배출구 패턴 매칭 🆕
  if (folderName.includes('fan/outlet-')) {
    const outletMatch = folderName.match(/outlet-(\d+)/);
    if (outletMatch) {
      const outletNumber = parseInt(outletMatch[1], 10);
      return {
        facilityId: `fan-outlet-${outletNumber}`,
        facilityType: 'basic',
        facilityNumber: 0, // 송풍팬은 시설번호 없음
        outletNumber: outletNumber, // 🆕 배출구 번호
        displayName: `배출구 ${outletNumber}번 송풍팬`
      };
    }
  }

  // 기존 로직 유지 (게이트웨이, 기타 등)
  // ...
}
```

#### 1.2 extractFacilityKey 함수 수정
```typescript
private extractFacilityKey(file: UploadedFile): string | null {
  const folderName = file.folderName || '';

  // 송풍팬 + 배출구 키 생성 🆕
  if (folderName.includes('fan/outlet-')) {
    const outletMatch = folderName.match(/outlet-(\d+)/);
    if (outletMatch) {
      return `fan-outlet-${outletMatch[1]}`;
    }
  }

  // 기존 로직 유지
  // ...
}
```

**체크리스트**:
- [ ] extractFacilityInfo 함수에 outlet 패턴 추가
- [ ] extractFacilityKey 함수에 outlet 키 생성 추가
- [ ] TypeScript 컴파일 확인
- [ ] 단위 테스트 작성

---

### Phase 2: 파일명 생성 로직 수정 (15분)

**파일**: `utils/filename-generator.ts` 또는 `utils/enhanced-filename-generator.ts`

#### 2.1 송풍팬 파일명 패턴 추가
```typescript
export function generateFileName(
  category: string,
  outletNumber?: number, // 🆕 배출구 번호 파라미터
  photoIndex: number = 1
): string {
  if (category === 'fan' && outletNumber) {
    return `송풍팬-배${outletNumber}-${photoIndex}.jpg`;
  }

  // 기존 로직
  // ...
}
```

**체크리스트**:
- [ ] generateFileName 함수에 outletNumber 파라미터 추가
- [ ] 송풍팬 파일명 패턴 구현
- [ ] 기존 기능 호환성 확인

---

### Phase 3: Upload API 수정 (30분)

**파일**: `app/api/upload-supabase/route.ts`

#### 3.1 폴더 경로 생성 로직
```typescript
function getFolderPath(
  businessName: string,
  category: string,
  outletNumber?: number
): string {
  const baseCategory = category === 'gateway' ? '기본사진/gateway'
    : category === 'fan' ? '기본사진/fan'
    : category === 'others' ? '기본사진/others'
    : '기본사진';

  // 송풍팬 + 배출구 경로 🆕
  if (category === 'fan' && outletNumber) {
    return `business/${businessName}/${baseCategory}/outlet-${outletNumber}`;
  }

  return `business/${businessName}/${baseCategory}`;
}
```

#### 3.2 요청 파라미터 확장
```typescript
// POST 요청 body
{
  "files": [...],
  "businessName": "군양",
  "category": "fan",
  "outletNumber": 2,  // 🆕 배출구 번호
  "systemType": "air-permit"
}
```

**체크리스트**:
- [ ] getFolderPath 함수에 outletNumber 처리 추가
- [ ] POST 요청 body에 outletNumber 파라미터 추가
- [ ] folder_name 필드에 "기본사진/fan/outlet-{N}" 저장
- [ ] API 테스트 (Postman)

---

### Phase 4: UI 컴포넌트 수정 (1시간)

**파일**: `components/ImprovedFacilityPhotoSection.tsx`

#### 4.1 배출구 목록 가져오기
```typescript
// facilityNumbering에서 배출구 목록 추출
const outlets = useMemo(() => {
  if (!facilityNumbering?.outlets) return [];

  return facilityNumbering.outlets.map((outlet: any) => ({
    outletNumber: outlet.outletNumber,
    outletName: outlet.outletName || `배출구 ${outlet.outletNumber}번`
  }));
}, [facilityNumbering]);
```

#### 4.2 배출구별 송풍팬 섹션 렌더링
```tsx
{/* 송풍팬 섹션 - 배출구별 구분 */}
<div className="space-y-4">
  <h3 className="text-lg font-semibold">송풍팬 사진</h3>

  {outlets.map((outlet) => {
    // 해당 배출구의 송풍팬 사진 필터링
    const outletFanPhotos = facilityPhotos.filter(
      (facility) =>
        facility.facilityType === 'basic' &&
        facility.facilityId.startsWith('fan-outlet-') &&
        facility.outletNumber === outlet.outletNumber
    );

    const photoCount = outletFanPhotos.reduce(
      (sum, f) => sum + f.totalPhotoCount,
      0
    );

    return (
      <div key={outlet.outletNumber} className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">
            📍 {outlet.outletName}
          </span>
          <span className="text-sm text-gray-600">
            {photoCount}장
          </span>
        </div>

        {/* 파일 업로드 버튼 */}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFanUpload(e, outlet.outletNumber)}
          className="hidden"
          id={`fan-upload-${outlet.outletNumber}`}
        />
        <label
          htmlFor={`fan-upload-${outlet.outletNumber}`}
          className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          <Camera className="w-4 h-4" />
          사진 선택
        </label>

        {/* 업로드된 사진 그리드 */}
        {photoCount > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {outletFanPhotos.flatMap(f => f.photos).map(photo => (
              <div key={photo.id} className="relative">
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.originalFileName}
                  className="w-full h-24 object-cover rounded"
                />
                {/* 삭제 버튼, 확대보기 등 */}
              </div>
            ))}
          </div>
        )}

        {photoCount === 0 && (
          <p className="text-gray-500 text-sm mt-2">
            사진이 없습니다
          </p>
        )}
      </div>
    );
  })}
</div>
```

#### 4.3 업로드 핸들러
```typescript
const handleFanUpload = useCallback(
  async (e: React.ChangeEvent<HTMLInputElement>, outletNumber: number) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // SmartUploadQueue에 추가
    await smartUploadQueue.addFiles(
      files,
      businessName,
      'fan', // category
      'air-permit', // systemType
      outletNumber // 🆕 배출구 번호 전달
    );
  },
  [businessName]
);
```

**체크리스트**:
- [ ] 배출구 목록 추출 로직 구현
- [ ] 배출구별 섹션 렌더링
- [ ] 업로드 핸들러 구현 (outletNumber 전달)
- [ ] 사진 그리드 표시
- [ ] 모바일 반응형 확인

---

### Phase 5: SmartUploadQueue 확장 (20분)

**파일**: `utils/smart-upload-queue.ts`

#### 5.1 addFiles 함수에 outletNumber 추가
```typescript
async addFiles(
  files: File[],
  businessName: string,
  category: string,
  systemType: string,
  outletNumber?: number // 🆕
) {
  // FormData 생성
  formData.append('outletNumber', outletNumber?.toString() || '');

  // 파일명 생성 시 outletNumber 전달
  const fileName = generateFileName(category, outletNumber, photoIndex);

  // ...
}
```

**체크리스트**:
- [ ] addFiles 파라미터에 outletNumber 추가
- [ ] FormData에 outletNumber 추가
- [ ] generateFileName 호출 시 outletNumber 전달

---

### Phase 6: 기존 송풍팬 사진 마이그레이션 (선택사항)

**배경**: 기존에 업로드된 송풍팬 사진들이 배출구 구분 없이 저장되어 있음

**옵션 1**: 수동 재분류
- 관리자가 기존 사진을 보고 각 배출구로 수동 이동

**옵션 2**: 자동 마이그레이션 스크립트
```sql
-- 기존 송풍팬 사진을 배출구 1번으로 일괄 이동
UPDATE uploaded_files
SET
  folder_name = '기본사진/fan/outlet-1',
  file_path = REPLACE(file_path, '/fan/', '/fan/outlet-1/')
WHERE
  folder_name = '기본사진/fan'
  AND business_name = '군양';
```

**옵션 3**: 병행 운영
- 기존 사진은 "배출구 구분 없음" 섹션으로 표시
- 신규 업로드부터 배출구별로 관리

**체크리스트**:
- [ ] 마이그레이션 전략 선택
- [ ] 사용자에게 안내
- [ ] 필요시 백업 수행

---

## 🧪 테스트 체크리스트

### 기능 테스트
- [ ] 배출구 1번 송풍팬 사진 업로드 → 정상 저장
- [ ] 배출구 2번 송풍팬 사진 업로드 → 정상 저장
- [ ] 배출구별로 사진 개수 정확히 표시
- [ ] 파일명 패턴 "송풍팬-배{N}-{순번}.jpg" 확인
- [ ] 폴더 경로 "기본사진/fan/outlet-{N}" 확인

### 통합 테스트
- [ ] 다중 배출구 사업장 테스트 (3개 배출구)
- [ ] 단일 배출구 사업장 테스트
- [ ] 배출구별 사진 삭제 동작
- [ ] 배출구별 사진 다운로드 (ZIP)

### 실시간 동기화 테스트
- [ ] Device A → 배출구 1번 사진 업로드
- [ ] Device B → 즉시 반영 확인
- [ ] 배출구별 카운트 실시간 업데이트

### 모바일 테스트
- [ ] iOS Safari: 배출구별 섹션 표시
- [ ] Android Chrome: 파일 선택 및 업로드
- [ ] 반응형 레이아웃 확인

---

## 📁 수정 파일 목록

### 신규 생성
1. `claudedocs/blower-fan-photo-by-outlet-design.md` - 이 설계 문서

### 수정 필요
1. `utils/facility-photo-tracker.ts` - 배출구별 송풍팬 인식 로직
2. `utils/filename-generator.ts` - 송풍팬 파일명 패턴 추가
3. `app/api/upload-supabase/route.ts` - 폴더 경로 생성 로직
4. `components/ImprovedFacilityPhotoSection.tsx` - 배출구별 UI 섹션
5. `utils/smart-upload-queue.ts` - outletNumber 파라미터 전달

---

## 🎯 예상 소요 시간

| Phase | 작업 | 예상 시간 |
|-------|------|-----------|
| 1 | FacilityPhotoTracker 확장 | 30분 |
| 2 | 파일명 생성 로직 수정 | 15분 |
| 3 | Upload API 수정 | 30분 |
| 4 | UI 컴포넌트 수정 | 1시간 |
| 5 | SmartUploadQueue 확장 | 20분 |
| 6 | 테스트 및 디버깅 | 30분 |
| **합계** | | **약 3시간** |

---

## 💡 주요 기술 포인트

### 1. 폴더 계층 구조
- **장점**: 배출구별 명확한 구분, 확장 가능
- **구현**: `fan/outlet-{N}/` 패턴
- **대안**: 파일명에만 배출구 번호 포함 (폴더 구조 평탄화)

### 2. 파일명 패턴
- **채택**: `송풍팬-배{N}-{순번}.jpg`
- **장점**: 사용자 친화적, 한눈에 식별 가능
- **대안**: `fan-outlet{N}-{순번}.jpg` (영문 패턴)

### 3. UI 확장성
- **설계**: 배출구 개수에 따라 동적 섹션 생성
- **확장**: 향후 게이트웨이도 배출구별 구분 가능
- **고려**: 배출구가 많을 경우 (10개 이상) 접을 수 있는 아코디언 UI

---

## 🚀 배포 전략

### 단계적 배포 (Zero-Downtime)

**Step 1**: 백엔드 배포
- API 라우트 수정 (outletNumber 파라미터 추가)
- 기존 API 호환성 유지 (outletNumber 선택적)

**Step 2**: 프론트엔드 배포
- UI에 배출구별 섹션 추가
- 기존 송풍팬 사진 "구분 없음" 섹션으로 표시

**Step 3**: 데이터 마이그레이션 (선택)
- 기존 사진을 배출구별로 재분류
- 또는 병행 운영

**Step 4**: 모니터링
- 업로드 성공률 확인
- 폴더 경로 정확성 검증
- 사용자 피드백 수집

---

## 🔄 향후 확장 가능성

### 1. 게이트웨이도 배출구별 관리
현재 게이트웨이는 배출구별로 구분되지 않음. 동일한 패턴 적용 가능:
```
gateway/
  outlet-1/
    게이트웨이-배1-1.jpg
  outlet-2/
    게이트웨이-배2-1.jpg
```

### 2. 측정기기 사진
각 배출구의 측정기기 사진도 배출구별로 관리:
```
measurement-devices/
  outlet-1/
    측정기-배1-1.jpg
  outlet-2/
    측정기-배2-1.jpg
```

### 3. 시설별 사진 태그
송풍팬뿐 아니라 배출시설, 방지시설도 배출구별 연결 가능

---

**작성**: Claude Sonnet 4.5
**버전**: 1.0
**최종 업데이트**: 2026-02-06
**난이도**: ⭐⭐⭐☆☆ (중)
