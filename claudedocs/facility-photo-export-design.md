# 시설 사진 일괄 다운로드 기능 설계

**작성일**: 2026-02-09
**상태**: 설계 완료 → 구현 대기

---

## 📋 요구사항

### 사용자 요청
> "business/[사업장명] 페이지에 올린 사진들을 한번에 다운로드할 수 있는 기능을 만들고 싶어. PDF형태, Excel 형태 두 형태로 다운로드 받고 싶어."

### 핵심 기능

1. **다운로드 위치**: `/facility` 페이지의 사업장 목록에서 다운로드 버튼 제공
2. **다운로드 형식**: PDF 및 Excel 두 가지 형식 지원
3. **섹션별 구성**:
   - **방지시설 섹션**: Gate Way, pH계, 차압계, 전류계 등 방지시설 사진
   - **배출시설 섹션**: 배출시설 전류계 사진
4. **레이아웃**: 3열 그리드 (한 행에 3개 사진)
5. **시설 정보 캡션**: 각 사진 아래에 **시설번호, 시설명, 용량** 표시 (필수)
   - 형식 예시: `<방1>여과집진시설 450㎥/분_송풍`
   - 구조: `<시설번호>시설명 용량_추가정보`
6. **사용자 캡션**: 사용자가 입력한 설명 포함 여부 선택 가능 (옵션)
7. **페이지 분할**: 자동 페이지 분할 (페이지 크기 초과 시)

---

## 🎨 UI/UX 설계

### Facility 페이지 다운로드 버튼 추가

#### 현재 구조
```
┌─ 실사관리 페이지 (/facility) ────────────────┐
│                                              │
│  🔍 [검색창]                    [새로고침]   │
│                                              │
│  251개 결과                                  │
│                                              │
│  📄 다산다구    실사자 미배정  날짜 미정      │
│  📄 대양금속    실사자 미배정  날짜 미정      │
│  📄 (주)거봉   실사자 미배정  날짜 미정      │
│  📄 주식회사 오토크린  👤 염만수  📅 2026.01.28 │
│                                              │
└──────────────────────────────────────────────┘
```

#### 개선 구조 (다운로드 버튼 추가)
```
┌─ 실사관리 페이지 (/facility) ────────────────┐
│                                              │
│  🔍 [검색창]                    [새로고침]   │
│                                              │
│  251개 결과                                  │
│                                              │
│  📄 다산다구                                 │
│      실사자 미배정  날짜 미정                │
│      [→ 상세보기]  [📥 PDF]  [📊 Excel]      │
│                                              │
│  📄 주식회사 오토크린                        │
│      👤 염만수  📅 2026.01.28  📷 사진 18장  │
│      [→ 상세보기]  [📥 PDF]  [📊 Excel]      │
│                                              │
└──────────────────────────────────────────────┘
```

**버튼 위치 옵션**:
- **옵션 A**: 각 사업장 카드 하단에 버튼 배치 (선택됨)
- **옵션 B**: 사업장명 우측에 아이콘 버튼
- **옵션 C**: 마우스 호버 시 나타나는 드롭다운 메뉴

---

## 📄 PDF 출력 형식

### 페이지 구성

```
┌─────────────────────────────────────────────┐
│  [회사 로고]                                 │
│                                              │
│  사업장명: 주식회사 오토크린                 │
│  주소: 서울특별시 노원구 노원로1길 67(공릉동) │
│  작성일: 2026. 02. 09.                      │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  1) 방지시설-방지시설명(용량) Gate Way,      │
│     pH계(온도계, 차압계), 전류계(설치예정) 위치│
│                                              │
│  ┌─────┐  ┌─────┐  ┌─────┐                │
│  │사진1│  │사진2│  │사진3│                │
│  │     │  │     │  │     │                │
│  └─────┘  └─────┘  └─────┘                │
│  <방1>     <방2>     <게이트웨이>           │
│  여과집진   세정집진   설치위치              │
│  450㎥/분  300㎥/분                        │
│                                              │
│  ┌─────┐  ┌─────┐  ┌─────┐                │
│  │사진4│  │사진5│  │사진6│                │
│  │     │  │     │  │     │                │
│  └─────┘  └─────┘  └─────┘                │
│  <방3>     <방4>     <방5>                  │
│  유수분리   냉각장치   집진시설              │
│  200㎥/분  150㎥/분  500㎥/분              │
│                                              │
├─────────────────────────────────────────────┤
│  페이지 1 / 3                                │
└─────────────────────────────────────────────┘
```

### 섹션 구성 규칙

#### 섹션 1: 방지시설
- **제목**: "1) 방지시설-방지시설명(용량) Gate Way, pH계(온도계, 차압계), 전류계(설치예정) 위치"
- **포함 카테고리**:
  - `기본사진/gateway` - Gate Way 사진
  - `방지시설/{시설명}/` - 각 방지시설 사진

#### 섹션 2: 배출시설
- **제목**: "2) 배출시설 전류계(설치예정) 위치"
- **포함 카테고리**:
  - `배출시설/{시설명}/` - 각 배출시설 사진

### PDF 생성 라이브러리
- **jsPDF** + **jsPDF-AutoTable**: PDF 생성 및 테이블 레이아웃
- **html2canvas**: 이미지 캡처 및 변환 (필요 시)

---

## 📊 Excel 출력 형식

### 시트 구성

#### Sheet 1: 방지시설
```
┌─────────────────────────────────────────────┐
│  A1: 사업장명: 주식회사 오토크린             │
│  A2: 주소: 서울특별시 노원구...             │
│  A3: 작성일: 2026. 02. 09.                  │
│                                              │
│  A5: 1) 방지시설-방지시설명(용량)...        │
│                                              │
│     A        B        C        D             │
│  ┌────────┬────────┬────────┬────────┐     │
│6 │ [이미지]│[이미지]│[이미지]│        │     │ ← 이미지 행
│  │        │        │        │        │     │
│  ├────────┼────────┼────────┼────────┤     │
│7 │ <방1>  │ <방2>  │<게이트>│        │     │ ← 시설 정보 캡션
│  │여과집진│세정집진│웨이    │        │     │
│  │450㎥/분│300㎥/분│설치위치│        │     │
│  ├────────┼────────┼────────┼────────┤     │
│8 │사용자  │사용자  │사용자  │        │     │ ← 사용자 캡션 (옵션)
│  │입력설명│입력설명│입력설명│        │     │
│  ├────────┼────────┼────────┼────────┤     │
│9 │ [이미지]│[이미지]│[이미지]│        │     │ ← 다음 행 이미지
│  │        │        │        │        │     │
│  ├────────┼────────┼────────┼────────┤     │
│10│ <방3>  │ <방4>  │ <방5>  │        │     │
│  │유수분리│냉각장치│집진시설│        │     │
│  │200㎥/분│150㎥/분│500㎥/분│        │     │
│  └────────┴────────┴────────┴────────┘     │
└─────────────────────────────────────────────┘
```

#### Sheet 2: 배출시설
```
(동일한 형식으로 배출시설 사진 배치)
```

### Excel 생성 라이브러리
- **ExcelJS**: Excel 파일 생성, 이미지 삽입, 셀 병합, 스타일링
- **이미지 삽입**: `worksheet.addImage()` 메서드 사용

---

## 🏗️ 기술 아키텍처

### 1. 프론트엔드 구조

#### 컴포넌트 계층
```
/app/facility/page.tsx (실사관리 페이지)
  └─ FacilityList (사업장 목록)
      └─ FacilityCard (각 사업장 카드)
          └─ ExportButtons (다운로드 버튼 그룹) 🆕
              ├─ PDFExportButton
              └─ ExcelExportButton
```

#### 새 컴포넌트

**`components/facility/ExportButtons.tsx`**
```tsx
interface ExportButtonsProps {
  businessName: string;
  businessInfo: {
    address: string;
    businessNumber?: string;
  };
  photoCount: number;
  onExportStart?: () => void;
  onExportComplete?: () => void;
  onExportError?: (error: Error) => void;
}

export function ExportButtons({
  businessName,
  businessInfo,
  photoCount,
  onExportStart,
  onExportComplete,
  onExportError
}: ExportButtonsProps) {
  // PDF/Excel 다운로드 핸들러
}
```

### 2. 백엔드 API 구조

#### API 엔드포인트

**`/app/api/export-photos/route.ts`** 🆕
```typescript
POST /api/export-photos
Request Body:
{
  businessName: string;
  format: 'pdf' | 'excel';
  includeUserCaption: boolean;  // 사용자 입력 설명 포함 여부 (시설 정보는 항상 포함)
  sections: ['prevention', 'discharge'];
}

Response:
{
  success: true;
  downloadUrl: string;  // Blob URL 또는 서버 파일 URL
  fileName: string;
  fileSize: number;
  metadata: {
    photoCount: number;
    preventionCount: number;
    dischargeCount: number;
  }
}
```

### 3. 데이터 플로우

```
┌──────────────┐
│  사용자      │ 클릭: [📥 PDF] 버튼
│              │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Frontend     │ 1. 다운로드 옵션 다이얼로그 표시
│ ExportButtons│    - 캡션 포함 여부 선택
│              │ 2. API 호출 준비
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ API Route    │ POST /api/export-photos
│              │ - businessName, format, includeCaption
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Photo Fetch  │ Supabase에서 사진 메타데이터 조회
│ Service      │ - uploaded_files 테이블 쿼리
│              │ - 카테고리별 그룹화
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Image        │ Supabase Storage에서 실제 이미지 다운로드
│ Download     │ - downloadUrl로 이미지 fetch
│              │ - Base64 또는 Buffer로 변환
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ Document     │ PDF 또는 Excel 생성
│ Generator    │ - jsPDF / ExcelJS 사용
│              │ - 섹션별 레이아웃 적용
│              │ - 이미지 삽입 및 캡션 추가
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ File         │ 생성된 파일 다운로드
│ Download     │ - Blob URL 생성
│              │ - 브라우저 다운로드 트리거
└──────────────┘
```

---

## 📦 필요 라이브러리

### PDF 생성
```bash
npm install jspdf jspdf-autotable
```

**사용 예시**:
```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const doc = new jsPDF('p', 'mm', 'a4');

// 헤더
doc.setFontSize(16);
doc.text('사업장명: 주식회사 오토크린', 20, 20);

// 이미지 추가 (3열 그리드)
doc.addImage(imageBase64, 'JPEG', x, y, width, height);

// 자동 테이블
autoTable(doc, {
  head: [['사진1', '사진2', '사진3']],
  body: [[{ content: imageBase64, styles: { cellWidth: 60 } }]],
});

doc.save('시설사진_오토크린.pdf');
```

### Excel 생성
```bash
npm install exceljs
```

**사용 예시**:
```typescript
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('방지시설');

// 헤더
worksheet.getCell('A1').value = '사업장명: 주식회사 오토크린';
worksheet.getCell('A1').font = { size: 14, bold: true };

// 이미지 삽입
const imageId = workbook.addImage({
  base64: imageBase64,
  extension: 'jpeg',
});

worksheet.addImage(imageId, {
  tl: { col: 0, row: 5 },  // top-left
  ext: { width: 200, height: 150 }
});

// 파일 저장
const buffer = await workbook.xlsx.writeBuffer();
const blob = new Blob([buffer], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
```

---

## 🏷️ 시설 정보 캡션 구조

### 캡션 데이터 구성

각 사진 아래에는 **시설 정보**가 반드시 표시되어야 합니다.

#### 캡션 형식
```
<시설번호>시설명 용량_추가정보
```

#### 실제 예시
```
<방1>여과집진시설 450㎥/분_송풍
<방2>세정집진시설 300㎥/분
<게이트웨이>설치위치
<배1>주물제조시설 200㎥/분_전기로
```

### 데이터 소스

#### 1. 시설번호 (Facility Number)
- **출처**: 폴더 구조 또는 파일명에서 추출
- **패턴**: `방지시설/<방1>여과집진시설/` → `<방1>`
- **대체 소스**: `uploaded_files` 테이블의 `folder_name` 컬럼 파싱

```typescript
// 폴더명에서 시설번호 추출 예시
function extractFacilityNumber(folderName: string): string {
  const match = folderName.match(/<(.+?)>/);
  return match ? `<${match[1]}>` : '';
}

// 예시:
// "방지시설/<방1>여과집진시설/" → "<방1>"
// "배출시설/<배2>주물제조/" → "<배2>"
```

#### 2. 시설명 (Facility Name)
- **출처**: 폴더명 또는 데이터베이스
- **추출**: 시설번호 다음의 텍스트 (용량 정보 제외)

```typescript
function extractFacilityName(folderName: string): string {
  // "방지시설/<방1>여과집진시설/" → "여과집진시설"
  const afterNumber = folderName.match(/<.+?>(.+?)(?:\s|\/|$)/);
  return afterNumber ? afterNumber[1].trim() : '';
}
```

#### 3. 용량 (Capacity)
- **출처**: 데이터베이스 또는 폴더명
- **형식**: `450㎥/분`, `200kW`, `300L` 등
- **단위**: ㎥/분 (풍량), kW (전력), L (용량)

**데이터베이스 스키마 (필요 시 추가)**:
```sql
-- facilities 테이블에서 용량 정보 조회
SELECT
  facility_number,
  facility_name,
  capacity,
  capacity_unit,
  additional_info
FROM facilities
WHERE business_name = '주식회사 오토크린';
```

**쿼리 결과 예시**:
```typescript
{
  facility_number: "방1",
  facility_name: "여과집진시설",
  capacity: "450",
  capacity_unit: "㎥/분",
  additional_info: "송풍"
}
```

#### 4. 추가 정보 (Optional)
- **출처**: 데이터베이스 또는 사용자 입력
- **예시**: `송풍`, `전기로`, `설치예정` 등
- **표시**: 용량 뒤에 언더스코어(`_`)로 구분

### 캡션 생성 로직

```typescript
interface FacilityInfo {
  facilityNumber: string;    // "방1"
  facilityName: string;      // "여과집진시설"
  capacity?: string;         // "450"
  capacityUnit?: string;     // "㎥/분"
  additionalInfo?: string;   // "송풍"
}

function generateCaption(info: FacilityInfo): string {
  let caption = `<${info.facilityNumber}>${info.facilityName}`;

  if (info.capacity && info.capacityUnit) {
    caption += ` ${info.capacity}${info.capacityUnit}`;
  }

  if (info.additionalInfo) {
    caption += `_${info.additionalInfo}`;
  }

  return caption;
}

// 사용 예시:
generateCaption({
  facilityNumber: "방1",
  facilityName: "여과집진시설",
  capacity: "450",
  capacityUnit: "㎥/분",
  additionalInfo: "송풍"
});
// 결과: "<방1>여과집진시설 450㎥/분_송풍"
```

### PDF/Excel에서의 캡션 표시

#### PDF 캡션 렌더링
```typescript
// 캡션 위치 계산
const captionY = imageY + PDF_CONFIG.imageHeight + 2; // 이미지 아래 2mm

// 캡션 텍스트 추가
doc.setFontSize(8);
doc.setFont('helvetica', 'normal');
doc.text(caption, imageX, captionY, {
  maxWidth: PDF_CONFIG.imageWidth,
  align: 'center'
});
```

#### Excel 캡션 렌더링
```typescript
// 캡션 셀 설정
const captionCell = worksheet.getCell(row + 1, col);
captionCell.value = caption;
captionCell.font = { size: 9 };
captionCell.alignment = {
  horizontal: 'center',
  vertical: 'top',
  wrapText: true
};
```

### 사용자 입력 캡션과의 구분

사용자가 입력한 설명은 **시설 정보 캡션 아래**에 추가 표시됩니다.

```
┌─────────┐
│  사진   │
└─────────┘
<방1>여과집진시설 450㎥/분_송풍  ← 시설 정보 (필수)
"정상 작동 확인, 필터 교체 필요"  ← 사용자 입력 설명 (옵션)
```

### 특수 케이스 처리

#### 1. 게이트웨이 사진
- 시설번호 없음
- 캡션: `<게이트웨이>설치위치` 또는 `Gate Way 설치 위치`

#### 2. 기본사진
- 시설 정보가 없는 일반 사진
- 캡션: 사진 유형 또는 위치 정보만 표시

#### 3. 용량 정보 없는 시설
- 용량 부분 생략
- 캡션: `<방1>여과집진시설`

---

## 🔄 사진 데이터 수집 로직

### Supabase 쿼리

```typescript
// 1. 방지시설 섹션 사진 조회 (시설 정보 포함)
const preventionPhotos = await supabaseAdmin
  .from('uploaded_files')
  .select(`
    *,
    facility:facilities(
      facility_number,
      facility_name,
      capacity,
      capacity_unit,
      additional_info
    )
  `)
  .eq('business_name', businessName)
  .or('folder_name.like.%기본사진/gateway%,folder_name.like.%방지시설/%')
  .order('uploaded_at', { ascending: true });

// 2. 배출시설 섹션 사진 조회 (시설 정보 포함)
const dischargePhotos = await supabaseAdmin
  .from('uploaded_files')
  .select(`
    *,
    facility:facilities(
      facility_number,
      facility_name,
      capacity,
      capacity_unit,
      additional_info
    )
  `)
  .eq('business_name', businessName)
  .like('folder_name', '%배출시설/%')
  .order('uploaded_at', { ascending: true });

// 3. 시설 정보가 없는 경우 폴더명에서 추출
const photosWithCaptions = preventionPhotos.data?.map(photo => {
  let facilityInfo;

  if (photo.facility) {
    // 데이터베이스에서 시설 정보 가져오기
    facilityInfo = photo.facility;
  } else {
    // 폴더명에서 시설 정보 추출
    facilityInfo = extractFacilityInfoFromFolder(photo.folder_name);
  }

  return {
    ...photo,
    caption: generateCaption(facilityInfo)
  };
});

// 폴더명 파싱 함수
function extractFacilityInfoFromFolder(folderName: string): FacilityInfo {
  // "방지시설/<방1>여과집진시설/" 형식 파싱
  const numberMatch = folderName.match(/<(.+?)>/);
  const nameMatch = folderName.match(/<.+?>(.+?)(?:\/|$)/);

  return {
    facilityNumber: numberMatch ? numberMatch[1] : '',
    facilityName: nameMatch ? nameMatch[1].trim() : '',
    capacity: undefined,
    capacityUnit: undefined,
    additionalInfo: undefined
  };
}
```

### 이미지 다운로드 및 변환

```typescript
async function downloadImageAsBase64(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}
```

---

## 📐 레이아웃 계산

### 3열 그리드 레이아웃

#### PDF (A4 사이즈: 210mm x 297mm)
```typescript
const PDF_CONFIG = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 20,
  imageWidth: 56,  // (210 - 40 - 8) / 3
  imageHeight: 42,  // 4:3 비율
  imageGap: 4,
  facilityCaptionHeight: 10,  // 시설 정보 캡션 (2-3줄)
  userCaptionHeight: 6,       // 사용자 입력 캡션 (옵션)
  rowHeight: 58,  // imageHeight + facilityCaptionHeight + userCaptionHeight (옵션)
};

function calculateImagePosition(index: number, includeUserCaption: boolean = false) {
  const row = Math.floor(index / 3);
  const col = index % 3;

  const x = PDF_CONFIG.margin + col * (PDF_CONFIG.imageWidth + PDF_CONFIG.imageGap);

  const totalCaptionHeight = includeUserCaption
    ? PDF_CONFIG.facilityCaptionHeight + PDF_CONFIG.userCaptionHeight
    : PDF_CONFIG.facilityCaptionHeight;

  const actualRowHeight = PDF_CONFIG.imageHeight + totalCaptionHeight;
  const y = PDF_CONFIG.margin + 60 + row * actualRowHeight;

  return { x, y };
}

function addFacilityCaption(
  doc: jsPDF,
  caption: string,
  x: number,
  y: number,
  width: number
) {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  // 캡션을 여러 줄로 분할
  const lines = doc.splitTextToSize(caption, width);

  lines.forEach((line, index) => {
    doc.text(line, x + width / 2, y + 2 + (index * 3), {
      align: 'center'
    });
  });
}
```

#### Excel (셀 단위)
```typescript
const EXCEL_CONFIG = {
  imageWidth: 200,  // pixels
  imageHeight: 150,
  columnWidth: 25,  // Excel column width units
  imageRowHeight: 120,   // 이미지 행 높이
  facilityCaptionRowHeight: 30,  // 시설 정보 캡션 행 높이
  userCaptionRowHeight: 20,      // 사용자 캡션 행 높이 (옵션)
  rowsPerImage: 3,  // 이미지 + 시설캡션 + 사용자캡션 (옵션)
};

function getExcelCell(index: number, includeUserCaption: boolean = false) {
  const row = Math.floor(index / 3);
  const col = index % 3;

  const rowsPerSet = includeUserCaption ? 3 : 2;  // 이미지 + 캡션(들)

  return {
    imageCell: {
      col: col,
      row: 5 + row * rowsPerSet  // 이미지 위치
    },
    facilityCaptionCell: {
      col: col,
      row: 6 + row * rowsPerSet  // 시설 정보 캡션 위치
    },
    userCaptionCell: includeUserCaption ? {
      col: col,
      row: 7 + row * rowsPerSet  // 사용자 캡션 위치
    } : undefined
  };
}

function addFacilityCaptionToExcel(
  worksheet: ExcelJS.Worksheet,
  caption: string,
  col: number,
  row: number
) {
  const cell = worksheet.getCell(row, col + 1);  // Excel은 1-based
  cell.value = caption;
  cell.font = { size: 9, name: 'Malgun Gothic' };
  cell.alignment = {
    horizontal: 'center',
    vertical: 'top',
    wrapText: true
  };

  // 행 높이 설정
  worksheet.getRow(row).height = EXCEL_CONFIG.facilityCaptionRowHeight;
}
```

---

## 🎛️ 다운로드 옵션 다이얼로그

### UI 디자인

```
┌─────────────────────────────────────────┐
│  📥 시설 사진 다운로드                  │
├─────────────────────────────────────────┤
│                                          │
│  사업장: 주식회사 오토크린               │
│  사진 개수: 18장                         │
│                                          │
│  📋 포함 정보:                           │
│  ✅ 시설 정보 (시설번호, 시설명, 용량)   │
│     └─ 항상 포함됨 (필수)                │
│                                          │
│  ☐ 사용자 입력 설명 포함 (선택사항)      │
│     └─ 사용자가 입력한 추가 설명 텍스트  │
│                                          │
│  다운로드 형식:                          │
│  ◉ PDF  ○ Excel                         │
│                                          │
│  [취소]              [다운로드]          │
│                                          │
└─────────────────────────────────────────┘
```

### 컴포넌트 구현

**`components/facility/ExportDialog.tsx`** 🆕
```tsx
interface ExportDialogProps {
  isOpen: boolean;
  businessName: string;
  photoCount: number;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}

interface ExportOptions {
  format: 'pdf' | 'excel';
  includeUserCaption: boolean;  // 사용자 입력 설명 포함 여부 (시설 정보는 항상 포함)
}
```

---

## 📊 진행 상태 표시

### 다운로드 진행률 UI

```
┌─────────────────────────────────────────┐
│  📥 PDF 생성 중...                      │
├─────────────────────────────────────────┤
│                                          │
│  ██████████░░░░░░░░░░ 50%               │
│                                          │
│  현재: 이미지 다운로드 중 (9/18)         │
│                                          │
└─────────────────────────────────────────┘
```

### 진행 단계
1. **사진 메타데이터 조회** (10%)
2. **이미지 다운로드** (10% → 60%, 각 이미지당 ~3%)
3. **문서 생성** (60% → 90%)
4. **파일 저장** (90% → 100%)

---

## ✅ 구현 체크리스트

### Phase 1: UI 컴포넌트 (2시간)

#### 1.1 Facility 페이지 버튼 추가
- [ ] `app/facility/page.tsx` 수정
- [ ] 각 사업장 카드에 다운로드 버튼 그룹 추가
- [ ] 사진 개수 표시 추가 (예: "📷 사진 18장")

#### 1.2 다운로드 옵션 다이얼로그
- [ ] `components/facility/ExportDialog.tsx` 생성
- [ ] 캡션 포함 여부 체크박스
- [ ] PDF/Excel 형식 선택 라디오 버튼
- [ ] 다운로드 진행률 표시

#### 1.3 다운로드 버튼 컴포넌트
- [ ] `components/facility/ExportButtons.tsx` 생성
- [ ] PDF 다운로드 버튼
- [ ] Excel 다운로드 버튼
- [ ] 로딩 상태 표시

---

### Phase 2: 백엔드 API (3시간)

#### 2.1 Export API Route
- [ ] `app/api/export-photos/route.ts` 생성
- [ ] POST 요청 핸들러
- [ ] 인증 및 권한 검증
- [ ] 에러 핸들링

#### 2.2 사진 데이터 수집
- [ ] Supabase 쿼리 (방지시설 섹션)
- [ ] Supabase 쿼리 (배출시설 섹션)
- [ ] **시설 정보 조인** (facility 테이블)
- [ ] 폴더명에서 시설 정보 추출 (폴백)
- [ ] 시설 캡션 생성 로직 구현
- [ ] 카테고리별 그룹화
- [ ] 사진 정렬 (업로드 날짜 순)

#### 2.3 이미지 다운로드
- [ ] Supabase Storage에서 이미지 fetch
- [ ] Base64 변환
- [ ] 이미지 크기 최적화 (선택)
- [ ] 다운로드 실패 시 재시도 로직

---

### Phase 3: PDF 생성 (3시간)

#### 3.1 PDF 라이브러리 설정
- [ ] jsPDF 및 jspdf-autotable 설치
- [ ] TypeScript 타입 정의 추가
- [ ] 기본 PDF 템플릿 생성

#### 3.2 PDF 레이아웃 구현
- [ ] 페이지 헤더 (사업장 정보)
- [ ] 섹션 제목 렌더링
- [ ] 3열 그리드 이미지 배치
- [ ] **시설 정보 캡션 렌더링** (필수)
  - [ ] 시설번호, 시설명, 용량 표시
  - [ ] 다중 줄 캡션 처리 (splitTextToSize)
  - [ ] 중앙 정렬 및 폰트 설정
- [ ] 사용자 입력 캡션 추가 (옵션)
- [ ] 페이지 번호 추가

#### 3.3 자동 페이지 분할
- [ ] 페이지 높이 계산
- [ ] 이미지 행 개수 제한
- [ ] 새 페이지 자동 생성
- [ ] 섹션 제목 반복 (페이지마다)

---

### Phase 4: Excel 생성 (3시간)

#### 4.1 Excel 라이브러리 설정
- [ ] ExcelJS 설치
- [ ] TypeScript 타입 정의 추가
- [ ] 기본 Excel 워크북 생성

#### 4.2 Excel 레이아웃 구현
- [ ] 시트 생성 (방지시설, 배출시설)
- [ ] 헤더 정보 추가
- [ ] 섹션 제목 셀 병합
- [ ] 3열 그리드 셀 구성
- [ ] 이미지 삽입
- [ ] **시설 정보 캡션 셀 추가** (필수)
  - [ ] 시설번호, 시설명, 용량 표시
  - [ ] 행 높이 자동 조정 (wrapText)
  - [ ] 중앙 정렬 및 폰트 설정
- [ ] 사용자 입력 캡션 추가 (옵션)

#### 4.3 스타일링
- [ ] 폰트 및 크기 설정
- [ ] 셀 테두리
- [ ] 행 높이 및 열 너비 조정
- [ ] 이미지 위치 및 크기 조정

---

### Phase 5: 테스트 및 최적화 (2시간)

#### 5.1 기능 테스트
- [ ] 사진 없는 사업장 처리
- [ ] 사진 1장만 있는 경우
- [ ] 사진 100장 이상 대용량 처리
- [ ] 캡션 포함/미포함 옵션
- [ ] PDF/Excel 형식 전환

#### 5.2 성능 테스트
- [ ] 이미지 다운로드 속도 측정
- [ ] PDF 생성 시간 측정
- [ ] Excel 생성 시간 측정
- [ ] 메모리 사용량 확인

#### 5.3 UX 개선
- [ ] 로딩 스피너 표시
- [ ] 진행률 퍼센티지
- [ ] 성공/실패 토스트 메시지
- [ ] 다운로드 완료 시 자동 다이얼로그 닫기

---

## 🎯 예상 소요 시간

| Phase | 작업 | 예상 시간 |
|-------|------|-----------|
| 1 | UI 컴포넌트 | 2시간 |
| 2 | 백엔드 API | 3시간 |
| 3 | PDF 생성 | 3시간 |
| 4 | Excel 생성 | 3시간 |
| 5 | 테스트 및 최적화 | 2시간 |
| **합계** | | **약 13시간** |

---

## 🗄️ 데이터베이스 스키마 고려사항

### Facilities 테이블 (필요 시 생성)

현재 시스템에 `facilities` 테이블이 없다면, 시설 정보를 저장하기 위해 새 테이블을 생성해야 합니다.

```sql
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name VARCHAR(255) NOT NULL,
  facility_number VARCHAR(50) NOT NULL,  -- "방1", "배1" 등
  facility_name VARCHAR(255) NOT NULL,   -- "여과집진시설"
  facility_type VARCHAR(50),             -- "방지시설", "배출시설"
  capacity VARCHAR(50),                  -- "450"
  capacity_unit VARCHAR(20),             -- "㎥/분", "kW"
  additional_info TEXT,                  -- "송풍", "전기로" 등
  folder_path TEXT,                      -- 연결된 폴더 경로
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(business_name, facility_number)
);

-- 인덱스 생성
CREATE INDEX idx_facilities_business ON facilities(business_name);
CREATE INDEX idx_facilities_type ON facilities(facility_type);
```

### Uploaded Files 테이블 연결

`uploaded_files` 테이블에 시설 ID 외래 키 추가 (선택사항):

```sql
ALTER TABLE uploaded_files
ADD COLUMN facility_id UUID REFERENCES facilities(id);

CREATE INDEX idx_uploaded_files_facility ON uploaded_files(facility_id);
```

### 대안: 폴더명 파싱 방식

데이터베이스 스키마 변경 없이 **폴더명에서 직접 추출**하는 방식도 가능합니다:

**장점**:
- 추가 테이블 불필요
- 기존 데이터 마이그레이션 불필요
- 구현 간단

**단점**:
- 폴더명 형식에 의존적
- 용량 정보 표시 제한적
- 데이터 일관성 관리 어려움

**추천**:
- **단기**: 폴더명 파싱 방식으로 빠르게 구현
- **장기**: Facilities 테이블 추가하여 정확한 정보 관리

---

## 💡 주요 기술 포인트

### 1. 이미지 처리 최적화
- **Base64 vs Blob**: Base64는 jsPDF/ExcelJS와 호환성 좋음
- **이미지 압축**: 큰 이미지는 다운로드 전 리사이즈 고려
- **병렬 다운로드**: Promise.all로 여러 이미지 동시 다운로드

### 2. 페이지 레이아웃 계산
- **동적 행 개수**: 사진 개수에 따라 페이지 수 자동 계산
- **여백 관리**: 일관된 여백으로 깔끔한 레이아웃
- **반응형**: PDF/Excel 모두 동일한 3열 그리드 유지

### 3. 에러 처리
- **이미지 다운로드 실패**: 재시도 또는 플레이스홀더 이미지
- **Supabase 쿼리 실패**: 명확한 에러 메시지
- **파일 생성 실패**: 로그 기록 및 사용자 알림

---

## 🔄 향후 확장 가능성

### 1. 워터마크 추가
PDF/Excel에 사업장명 또는 회사 로고 워터마크 추가

### 2. 커스터마이징 옵션
- 이미지 크기 조절 (소/중/대)
- 페이지 방향 (세로/가로)
- 폰트 선택

### 3. 템플릿 저장
사용자가 선호하는 레이아웃 템플릿 저장 및 재사용

### 4. 일괄 다운로드
여러 사업장을 선택하여 ZIP 파일로 일괄 다운로드

---

**작성**: Claude Sonnet 4.5
**버전**: 1.0
**최종 업데이트**: 2026-02-09
**난이도**: ⭐⭐⭐⭐☆ (높음)
