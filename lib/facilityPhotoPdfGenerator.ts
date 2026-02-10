// lib/facilityPhotoPdfGenerator.ts - 시설 사진 한글 PDF 생성 (html2canvas 방식)
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface PhotoData {
  id: string;
  file_path: string;
  original_filename: string;
  download_url: string;
  user_caption?: string;
  facility_caption: string;
  created_at: string;
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
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0];

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('[PDF] 이미지 다운로드 오류:', error);
    return '';
  }
}

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';

  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * HTML 콘텐츠 생성 (3열 그리드 레이아웃)
 */
function generateHtmlContent(
  businessName: string,
  businessInfo: { address?: string },
  sectionTitle: string,
  photos: PhotoData[],
  includeUserCaption: boolean,
  imageDataUrls: string[]
): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

  // 3열 그리드로 사진 배치
  const photoRows: Array<PhotoData[]> = [];
  for (let i = 0; i < photos.length; i += 3) {
    photoRows.push(photos.slice(i, i + 3));
  }

  return `
    <div style="font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', '맑은 고딕', Arial, sans-serif; padding: 20px; background-color: #ffffff; color: #000000; width: 794px; box-sizing: border-box;">
      <!-- 헤더 정보 -->
      <div style="margin-bottom: 20px;">
        <h1 style="font-size: 18px; font-weight: bold; margin: 0 0 8px 0; color: #1a1a1a;">
          사업장명: ${escapeHtml(businessName)}
        </h1>
        ${businessInfo.address ? `
          <p style="font-size: 12px; margin: 4px 0; color: #333;">
            주소: ${escapeHtml(businessInfo.address)}
          </p>
        ` : ''}
        <p style="font-size: 12px; margin: 4px 0; color: #333;">
          작성일: ${today}
        </p>
      </div>

      <!-- 섹션 제목 -->
      <div style="margin-bottom: 15px; padding: 10px; background-color: #f0f9ff; border-left: 4px solid #2563eb;">
        <h2 style="font-size: 14px; font-weight: bold; margin: 0; color: #1e40af;">
          ${escapeHtml(sectionTitle)}
        </h2>
      </div>

      <!-- 사진 그리드 (3열) -->
      ${photoRows.map((row, rowIndex) => `
        <div style="display: flex; gap: 10px; margin-bottom: 20px; width: 100%;">
          ${row.map((photo, colIndex) => {
            const photoIndex = rowIndex * 3 + colIndex;
            const imageDataUrl = imageDataUrls[photoIndex] || '';

            return `
              <div style="flex: 1; min-width: 0;">
                <!-- 이미지 -->
                ${imageDataUrl ? `
                  <div style="width: 100%; height: 180px; overflow: hidden; border: 1px solid #ddd; border-radius: 4px; background-color: #f5f5f5; display: flex; align-items: center; justify-content: center;">
                    <img src="${imageDataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                  </div>
                ` : `
                  <div style="width: 100%; height: 180px; border: 1px solid #ddd; border-radius: 4px; background-color: #f5f5f5; display: flex; align-items: center; justify-content: center; color: #999;">
                    <span>이미지 로드 실패</span>
                  </div>
                `}

                <!-- 시설 정보 캡션 -->
                <div style="margin-top: 6px; padding: 6px; background-color: #f8f9fa; border-radius: 3px; min-height: 45px;">
                  <p style="font-size: 9px; margin: 0; color: #333; line-height: 1.4; word-break: keep-all;">
                    ${escapeHtml(photo.facility_caption)}
                  </p>
                </div>

                <!-- 사용자 캡션 (옵션) -->
                ${includeUserCaption && photo.user_caption ? `
                  <div style="margin-top: 4px; padding: 4px; background-color: #fafafa; border-radius: 3px;">
                    <p style="font-size: 8px; margin: 0; color: #666; font-style: italic; line-height: 1.3;">
                      "${escapeHtml(photo.user_caption)}"
                    </p>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}

          <!-- 빈 셀 채우기 (마지막 행이 3개 미만일 때) -->
          ${Array(3 - row.length).fill(0).map(() => `
            <div style="flex: 1; min-width: 0;"></div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * HTML을 Canvas로 렌더링하고 PDF에 추가
 */
async function renderHtmlToPdf(
  doc: jsPDF,
  htmlContent: string,
  pageWidth: number,
  pageHeight: number,
  margin: number
): Promise<void> {
  // 임시 DOM 요소 생성
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  tempDiv.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 794px;
    background-color: #ffffff;
    z-index: -1000;
  `;

  document.body.appendChild(tempDiv);

  // 폰트 로딩 대기
  await new Promise(resolve => setTimeout(resolve, 300));

  // 실제 콘텐츠 높이 측정
  const actualContentHeight = tempDiv.scrollHeight || tempDiv.offsetHeight;

  // Canvas로 변환
  const canvas = await html2canvas(tempDiv, {
    scale: 2,
    useCORS: false,
    backgroundColor: '#ffffff',
    logging: false,
    width: 794,
    height: actualContentHeight,
    allowTaint: false,
    foreignObjectRendering: false,
  });

  // DOM 요소 제거
  document.body.removeChild(tempDiv);

  // PDF에 이미지 추가
  const imgData = canvas.toDataURL('image/jpeg', 0.9);
  const imgWidth = pageWidth - (margin * 2);
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pageContentHeight = pageHeight - (margin * 2);

  // 단일 페이지에 맞는 경우
  if (imgHeight <= pageContentHeight) {
    doc.addImage(
      imgData,
      'JPEG',
      margin,
      margin,
      imgWidth,
      imgHeight
    );
  } else {
    // 여러 페이지로 분할
    let remainingHeight = imgHeight;
    let yPosition = 0;
    let isFirstPage = true;

    while (remainingHeight > 0) {
      const currentPageHeight = Math.min(pageContentHeight, remainingHeight);

      if (currentPageHeight < 5) break;

      if (!isFirstPage) {
        doc.addPage();
      }

      // 이미지 잘라서 현재 페이지에 추가
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');

      if (cropCtx) {
        const sourceY = yPosition * (canvas.height / imgHeight);
        const sourceHeight = currentPageHeight * (canvas.height / imgHeight);

        cropCanvas.width = canvas.width;
        cropCanvas.height = sourceHeight;

        cropCtx.drawImage(
          canvas,
          0, sourceY,
          canvas.width, sourceHeight,
          0, 0,
          canvas.width, sourceHeight
        );

        const cropImgData = cropCanvas.toDataURL('image/jpeg', 0.9);

        doc.addImage(
          cropImgData,
          'JPEG',
          margin,
          margin,
          imgWidth,
          currentPageHeight
        );
      }

      remainingHeight -= currentPageHeight;
      yPosition += currentPageHeight;
      isFirstPage = false;
    }
  }
}

/**
 * 시설 사진 PDF 생성 (한글 지원)
 */
export async function generateFacilityPhotoPDF(
  businessName: string,
  businessInfo: { address?: string },
  preventionPhotos: PhotoData[],
  dischargePhotos: PhotoData[],
  includeUserCaption: boolean
): Promise<Buffer> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210; // A4 width
  const pageHeight = 297; // A4 height
  const margin = 10;

  try {
    // ========== 방지시설 섹션 ==========
    if (preventionPhotos.length > 0) {
      console.log('[PDF] 방지시설 이미지 다운로드 시작...');

      // 이미지 다운로드
      const preventionImageDataUrls = await Promise.all(
        preventionPhotos.map(photo => downloadImageAsBase64(photo.download_url))
      );

      // HTML 콘텐츠 생성
      const htmlContent = generateHtmlContent(
        businessName,
        businessInfo,
        '1) 방지시설-방지시설명(용량) Gate Way, pH계(온도계, 차압계), 전류계(설치예정) 위치',
        preventionPhotos,
        includeUserCaption,
        preventionImageDataUrls
      );

      // HTML을 PDF로 렌더링
      await renderHtmlToPdf(doc, htmlContent, pageWidth, pageHeight, margin);
    }

    // ========== 배출시설 섹션 ==========
    if (dischargePhotos.length > 0) {
      // 새 페이지 추가 (방지시설이 있었다면)
      if (preventionPhotos.length > 0) {
        doc.addPage();
      }

      console.log('[PDF] 배출시설 이미지 다운로드 시작...');

      // 이미지 다운로드
      const dischargeImageDataUrls = await Promise.all(
        dischargePhotos.map(photo => downloadImageAsBase64(photo.download_url))
      );

      // HTML 콘텐츠 생성
      const htmlContent = generateHtmlContent(
        businessName,
        businessInfo,
        '2) 배출시설 전류계(설치예정) 위치',
        dischargePhotos,
        includeUserCaption,
        dischargeImageDataUrls
      );

      // HTML을 PDF로 렌더링
      await renderHtmlToPdf(doc, htmlContent, pageWidth, pageHeight, margin);
    }

    // Buffer로 변환
    const pdfOutput = doc.output('arraybuffer');
    return Buffer.from(pdfOutput);

  } catch (error) {
    console.error('[PDF] 한글 PDF 생성 오류:', error);
    throw error;
  }
}
