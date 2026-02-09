import jsPDF from 'jspdf';

// jsPDF에 한글 폰트 지원을 위한 타입 선언 (필요시 추가)
// import 'jspdf-autotable';

interface PhotoData {
  id: string;
  file_path: string;
  original_file_name: string;
  download_url: string;
  folder_name: string;
  user_caption?: string;
  facility_caption: string;
  uploaded_at: string;
}

const PDF_CONFIG = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 20,
  imageWidth: 56,  // (210 - 40 - 8) / 3
  imageHeight: 42,  // 4:3 비율
  imageGap: 4,
  facilityCaptionHeight: 10,  // 시설 정보 캡션 (2-3줄)
  userCaptionHeight: 6,       // 사용자 입력 캡션 (옵션)
};

/**
 * 이미지 위치 계산
 */
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

/**
 * 시설 정보 캡션 추가
 */
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

  lines.forEach((line: string, index: number) => {
    doc.text(line, x + width / 2, y + 2 + (index * 3), {
      align: 'center'
    });
  });
}

/**
 * 사용자 캡션 추가
 */
function addUserCaption(
  doc: jsPDF,
  caption: string,
  x: number,
  y: number,
  width: number
) {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);

  const lines = doc.splitTextToSize(`"${caption}"`, width);
  lines.forEach((line: string, index: number) => {
    doc.text(line, x + width / 2, y + 2 + (index * 2.5), {
      align: 'center'
    });
  });

  // 색상 초기화
  doc.setTextColor(0, 0, 0);
}

/**
 * 이미지 다운로드 및 Base64 변환
 */
async function downloadImageAsBase64(downloadUrl: string): Promise<string> {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('[PDF] 이미지 다운로드 오류:', error);
    // Placeholder 이미지 반환 (옵션)
    return '';
  }
}

/**
 * PDF 문서 생성
 */
export async function generatePDF(
  businessName: string,
  businessInfo: { address?: string },
  preventionPhotos: PhotoData[],
  dischargePhotos: PhotoData[],
  includeUserCaption: boolean
): Promise<Buffer> {
  const doc = new jsPDF('p', 'mm', 'a4');
  let currentY = PDF_CONFIG.margin;

  // ========== 페이지 헤더 ==========
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`사업장명: ${businessName}`, PDF_CONFIG.margin, currentY);
  currentY += 8;

  if (businessInfo.address) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`주소: ${businessInfo.address}`, PDF_CONFIG.margin, currentY);
    currentY += 6;
  }

  doc.setFontSize(10);
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  doc.text(`작성일: ${today}`, PDF_CONFIG.margin, currentY);
  currentY += 10;

  // ========== 방지시설 섹션 ==========
  if (preventionPhotos.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('1) 방지시설-방지시설명(용량) Gate Way, pH계(온도계, 차압계), 전류계(설치예정) 위치', PDF_CONFIG.margin, currentY);
    currentY += 8;

    // 이미지 다운로드
    console.log('[PDF] 방지시설 이미지 다운로드 시작...');
    const preventionImages = await Promise.all(
      preventionPhotos.map(photo => downloadImageAsBase64(photo.download_url))
    );

    // 이미지 배치
    for (let i = 0; i < preventionImages.length; i++) {
      const imageBase64 = preventionImages[i];
      if (!imageBase64) continue;

      const photo = preventionPhotos[i];
      const { x, y } = calculateImagePosition(i, includeUserCaption);

      // 페이지 넘김 확인
      if (y + PDF_CONFIG.imageHeight + PDF_CONFIG.facilityCaptionHeight > PDF_CONFIG.pageHeight - PDF_CONFIG.margin) {
        doc.addPage();
        currentY = PDF_CONFIG.margin;
      }

      try {
        // 이미지 추가
        doc.addImage(imageBase64, 'JPEG', x, y, PDF_CONFIG.imageWidth, PDF_CONFIG.imageHeight);

        // 시설 정보 캡션
        const captionY = y + PDF_CONFIG.imageHeight;
        addFacilityCaption(doc, photo.facility_caption, x, captionY, PDF_CONFIG.imageWidth);

        // 사용자 캡션 (옵션)
        if (includeUserCaption && photo.user_caption) {
          const userCaptionY = captionY + PDF_CONFIG.facilityCaptionHeight;
          addUserCaption(doc, photo.user_caption, x, userCaptionY, PDF_CONFIG.imageWidth);
        }
      } catch (error) {
        console.error(`[PDF] 이미지 ${i + 1} 추가 실패:`, error);
      }
    }
  }

  // ========== 배출시설 섹션 ==========
  if (dischargePhotos.length > 0) {
    // 새 페이지 시작
    doc.addPage();
    currentY = PDF_CONFIG.margin;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2) 배출시설 전류계(설치예정) 위치', PDF_CONFIG.margin, currentY);
    currentY += 8;

    // 이미지 다운로드
    console.log('[PDF] 배출시설 이미지 다운로드 시작...');
    const dischargeImages = await Promise.all(
      dischargePhotos.map(photo => downloadImageAsBase64(photo.download_url))
    );

    // 이미지 배치
    for (let i = 0; i < dischargeImages.length; i++) {
      const imageBase64 = dischargeImages[i];
      if (!imageBase64) continue;

      const photo = dischargePhotos[i];
      const { x, y } = calculateImagePosition(i, includeUserCaption);

      // 페이지 넘김 확인
      if (y + PDF_CONFIG.imageHeight + PDF_CONFIG.facilityCaptionHeight > PDF_CONFIG.pageHeight - PDF_CONFIG.margin) {
        doc.addPage();
        currentY = PDF_CONFIG.margin;
      }

      try {
        // 이미지 추가
        doc.addImage(imageBase64, 'JPEG', x, y, PDF_CONFIG.imageWidth, PDF_CONFIG.imageHeight);

        // 시설 정보 캡션
        const captionY = y + PDF_CONFIG.imageHeight;
        addFacilityCaption(doc, photo.facility_caption, x, captionY, PDF_CONFIG.imageWidth);

        // 사용자 캡션 (옵션)
        if (includeUserCaption && photo.user_caption) {
          const userCaptionY = captionY + PDF_CONFIG.facilityCaptionHeight;
          addUserCaption(doc, photo.user_caption, x, userCaptionY, PDF_CONFIG.imageWidth);
        }
      } catch (error) {
        console.error(`[PDF] 배출시설 이미지 ${i + 1} 추가 실패:`, error);
      }
    }
  }

  // ========== 페이지 번호 추가 ==========
  const pageCount = doc.internal.pages.length - 1; // 첫 페이지 제외
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `페이지 ${i} / ${pageCount}`,
      PDF_CONFIG.pageWidth / 2,
      PDF_CONFIG.pageHeight - 10,
      { align: 'center' }
    );
  }

  // Buffer로 변환
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}
