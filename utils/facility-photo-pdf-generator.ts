// utils/facility-photo-pdf-generator.ts - 시설 사진 한글 PDF 생성 (클라이언트 전용)
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

interface FacilityPhotoPdfData {
  businessName: string;
  businessInfo: {
    address?: string;
  };
  preventionPhotos: PhotoData[];
  dischargePhotos: PhotoData[];
}

export class FacilityPhotoPdfGenerator {
  private doc: jsPDF;
  private readonly pageWidth = 210; // A4 width in mm
  private readonly pageHeight = 297; // A4 height in mm
  private readonly margin = 10;

  constructor() {
    this.doc = new jsPDF('p', 'mm', 'a4');
  }

  async generatePdf(
    data: FacilityPhotoPdfData,
    includeUserCaption: boolean
  ): Promise<Blob> {
    try {
      let isFirstSection = true;

      // 방지시설 섹션
      if (data.preventionPhotos.length > 0) {
        const htmlContent = this.generateSectionHtml(
          data.businessName,
          data.businessInfo,
          '1) 방지시설-방지시설명(용량) Gate Way, pH계(온도계, 차압계), 전류계(설치예정) 위치',
          data.preventionPhotos,
          includeUserCaption
        );

        await this.renderHtmlToPdf(htmlContent, !isFirstSection);
        isFirstSection = false;
      }

      // 배출시설 섹션
      if (data.dischargePhotos.length > 0) {
        const htmlContent = this.generateSectionHtml(
          data.businessName,
          data.businessInfo,
          '2) 배출시설 전류계(설치예정) 위치',
          data.dischargePhotos,
          includeUserCaption
        );

        await this.renderHtmlToPdf(htmlContent, !isFirstSection);
      }

      return new Blob([this.doc.output('blob')], { type: 'application/pdf' });
    } catch (error) {
      console.error('한글 PDF 생성 오류:', error);
      throw error;
    }
  }

  private generateSectionHtml(
    businessName: string,
    businessInfo: { address?: string },
    sectionTitle: string,
    photos: PhotoData[],
    includeUserCaption: boolean
  ): string {
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

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
            사업장명: ${this.escapeHtml(businessName)}
          </h1>
          ${businessInfo.address ? `
            <p style="font-size: 12px; margin: 4px 0; color: #333;">
              주소: ${this.escapeHtml(businessInfo.address)}
            </p>
          ` : ''}
          <p style="font-size: 12px; margin: 4px 0; color: #333;">
            작성일: ${today}
          </p>
        </div>

        <!-- 섹션 제목 -->
        <div style="margin-bottom: 15px; padding: 10px; background-color: #f0f9ff; border-left: 4px solid #2563eb;">
          <h2 style="font-size: 14px; font-weight: bold; margin: 0; color: #1e40af;">
            ${this.escapeHtml(sectionTitle)}
          </h2>
        </div>

        <!-- 사진 그리드 (3열) -->
        ${photoRows.map(row => `
          <div style="display: flex; gap: 10px; margin-bottom: 20px; width: 100%;">
            ${row.map(photo => `
              <div style="flex: 1; min-width: 0;">
                <!-- 이미지 -->
                <div style="width: 100%; height: 180px; overflow: hidden; border: 1px solid #ddd; border-radius: 4px; background-color: #f5f5f5; display: flex; align-items: center; justify-content: center;">
                  <img src="${photo.download_url}" style="max-width: 100%; max-height: 100%; object-fit: contain;" crossorigin="anonymous" />
                </div>

                <!-- 시설 정보 캡션 -->
                <div style="margin-top: 6px; padding: 6px; background-color: #f8f9fa; border-radius: 3px; min-height: 45px;">
                  <p style="font-size: 9px; margin: 0; color: #333; line-height: 1.4; word-break: keep-all;">
                    ${this.escapeHtml(photo.facility_caption)}
                  </p>
                </div>

                <!-- 사용자 캡션 (옵션) -->
                ${includeUserCaption && photo.user_caption ? `
                  <div style="margin-top: 4px; padding: 4px; background-color: #fafafa; border-radius: 3px;">
                    <p style="font-size: 8px; margin: 0; color: #666; font-style: italic; line-height: 1.3;">
                      "${this.escapeHtml(photo.user_caption)}"
                    </p>
                  </div>
                ` : ''}
              </div>
            `).join('')}

            <!-- 빈 셀 채우기 (마지막 행이 3개 미만일 때) -->
            ${Array(3 - row.length).fill(0).map(() => `
              <div style="flex: 1; min-width: 0;"></div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  private async renderHtmlToPdf(htmlContent: string, addPage: boolean): Promise<void> {
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
    await new Promise(resolve => setTimeout(resolve, 500));

    // 실제 콘텐츠 높이 측정
    const actualContentHeight = tempDiv.scrollHeight || tempDiv.offsetHeight;

    // Canvas로 변환
    const canvas = await html2canvas(tempDiv, {
      scale: 2,
      useCORS: true, // CORS 이미지 허용
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      height: actualContentHeight,
      allowTaint: true, // Supabase Storage 이미지 허용
    });

    // DOM 요소 제거
    document.body.removeChild(tempDiv);

    // 새 페이지 추가 (첫 섹션이 아닌 경우)
    if (addPage) {
      this.doc.addPage();
    }

    // PDF에 이미지 추가
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    const imgWidth = this.pageWidth - (this.margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageContentHeight = this.pageHeight - (this.margin * 2);

    // 단일 페이지에 맞는 경우
    if (imgHeight <= pageContentHeight) {
      this.doc.addImage(
        imgData,
        'JPEG',
        this.margin,
        this.margin,
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
          this.doc.addPage();
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

          this.doc.addImage(
            cropImgData,
            'JPEG',
            this.margin,
            this.margin,
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

  private escapeHtml(unsafe: string | null | undefined): string {
    if (!unsafe) return '';

    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// 한글 지원 시설 사진 PDF 생성 함수
export async function generateFacilityPhotoPdf(
  data: FacilityPhotoPdfData,
  includeUserCaption: boolean
): Promise<Blob> {
  const generator = new FacilityPhotoPdfGenerator();
  return await generator.generatePdf(data, includeUserCaption);
}
