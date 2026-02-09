import ExcelJS from 'exceljs';

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

const EXCEL_CONFIG = {
  imageWidth: 200,  // pixels
  imageHeight: 150,
  columnWidth: 25,  // Excel column width units
  imageRowHeight: 120,   // 이미지 행 높이
  facilityCaptionRowHeight: 30,  // 시설 정보 캡션 행 높이
  userCaptionRowHeight: 20,      // 사용자 캡션 행 높이 (옵션)
};

/**
 * Excel 셀 위치 계산
 */
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

/**
 * 시설 정보 캡션 셀 추가
 */
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

/**
 * 사용자 캡션 셀 추가
 */
function addUserCaptionToExcel(
  worksheet: ExcelJS.Worksheet,
  caption: string,
  col: number,
  row: number
) {
  const cell = worksheet.getCell(row, col + 1);
  cell.value = `"${caption}"`;
  cell.font = { size: 8, name: 'Malgun Gothic', italic: true, color: { argb: 'FF666666' } };
  cell.alignment = {
    horizontal: 'center',
    vertical: 'top',
    wrapText: true
  };

  // 행 높이 설정
  worksheet.getRow(row).height = EXCEL_CONFIG.userCaptionRowHeight;
}

/**
 * 이미지 다운로드 및 Buffer 변환
 */
async function downloadImageAsBuffer(downloadUrl: string): Promise<Buffer | null> {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[EXCEL] 이미지 다운로드 오류:', error);
    return null;
  }
}

/**
 * Excel 문서 생성
 */
export async function generateExcel(
  businessName: string,
  businessInfo: { address?: string },
  preventionPhotos: PhotoData[],
  dischargePhotos: PhotoData[],
  includeUserCaption: boolean
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // ========== 방지시설 시트 ==========
  if (preventionPhotos.length > 0) {
    const worksheet = workbook.addWorksheet('방지시설');

    // 열 너비 설정
    worksheet.getColumn(1).width = EXCEL_CONFIG.columnWidth;
    worksheet.getColumn(2).width = EXCEL_CONFIG.columnWidth;
    worksheet.getColumn(3).width = EXCEL_CONFIG.columnWidth;

    // 헤더 정보
    worksheet.getCell('A1').value = `사업장명: ${businessName}`;
    worksheet.getCell('A1').font = { size: 14, bold: true };

    if (businessInfo.address) {
      worksheet.getCell('A2').value = `주소: ${businessInfo.address}`;
      worksheet.getCell('A2').font = { size: 10 };
    }

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    worksheet.getCell('A3').value = `작성일: ${today}`;
    worksheet.getCell('A3').font = { size: 10 };

    // 섹션 제목
    worksheet.getCell('A5').value = '1) 방지시설-방지시설명(용량) Gate Way, pH계(온도계, 차압계), 전류계(설치예정) 위치';
    worksheet.getCell('A5').font = { size: 12, bold: true };
    worksheet.mergeCells('A5:C5');

    // 이미지 다운로드
    console.log('[EXCEL] 방지시설 이미지 다운로드 시작...');
    const preventionImages = await Promise.all(
      preventionPhotos.map(photo => downloadImageAsBuffer(photo.download_url))
    );

    // 이미지 배치
    for (let i = 0; i < preventionImages.length; i++) {
      const imageBuffer = preventionImages[i];
      if (!imageBuffer) continue;

      const photo = preventionPhotos[i];
      const cells = getExcelCell(i, includeUserCaption);

      try {
        // 이미지 추가
        const imageId = workbook.addImage({
          buffer: imageBuffer,
          extension: 'jpeg',
        });

        worksheet.addImage(imageId, {
          tl: { col: cells.imageCell.col, row: cells.imageCell.row },
          ext: { width: EXCEL_CONFIG.imageWidth, height: EXCEL_CONFIG.imageHeight }
        });

        // 이미지 행 높이 설정
        worksheet.getRow(cells.imageCell.row + 1).height = EXCEL_CONFIG.imageRowHeight;

        // 시설 정보 캡션
        addFacilityCaptionToExcel(
          worksheet,
          photo.facility_caption,
          cells.facilityCaptionCell.col,
          cells.facilityCaptionCell.row + 1
        );

        // 사용자 캡션 (옵션)
        if (includeUserCaption && photo.user_caption && cells.userCaptionCell) {
          addUserCaptionToExcel(
            worksheet,
            photo.user_caption,
            cells.userCaptionCell.col,
            cells.userCaptionCell.row + 1
          );
        }
      } catch (error) {
        console.error(`[EXCEL] 방지시설 이미지 ${i + 1} 추가 실패:`, error);
      }
    }
  }

  // ========== 배출시설 시트 ==========
  if (dischargePhotos.length > 0) {
    const worksheet = workbook.addWorksheet('배출시설');

    // 열 너비 설정
    worksheet.getColumn(1).width = EXCEL_CONFIG.columnWidth;
    worksheet.getColumn(2).width = EXCEL_CONFIG.columnWidth;
    worksheet.getColumn(3).width = EXCEL_CONFIG.columnWidth;

    // 헤더 정보
    worksheet.getCell('A1').value = `사업장명: ${businessName}`;
    worksheet.getCell('A1').font = { size: 14, bold: true };

    if (businessInfo.address) {
      worksheet.getCell('A2').value = `주소: ${businessInfo.address}`;
      worksheet.getCell('A2').font = { size: 10 };
    }

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    worksheet.getCell('A3').value = `작성일: ${today}`;
    worksheet.getCell('A3').font = { size: 10 };

    // 섹션 제목
    worksheet.getCell('A5').value = '2) 배출시설 전류계(설치예정) 위치';
    worksheet.getCell('A5').font = { size: 12, bold: true };
    worksheet.mergeCells('A5:C5');

    // 이미지 다운로드
    console.log('[EXCEL] 배출시설 이미지 다운로드 시작...');
    const dischargeImages = await Promise.all(
      dischargePhotos.map(photo => downloadImageAsBuffer(photo.download_url))
    );

    // 이미지 배치
    for (let i = 0; i < dischargeImages.length; i++) {
      const imageBuffer = dischargeImages[i];
      if (!imageBuffer) continue;

      const photo = dischargePhotos[i];
      const cells = getExcelCell(i, includeUserCaption);

      try {
        // 이미지 추가
        const imageId = workbook.addImage({
          buffer: imageBuffer,
          extension: 'jpeg',
        });

        worksheet.addImage(imageId, {
          tl: { col: cells.imageCell.col, row: cells.imageCell.row },
          ext: { width: EXCEL_CONFIG.imageWidth, height: EXCEL_CONFIG.imageHeight }
        });

        // 이미지 행 높이 설정
        worksheet.getRow(cells.imageCell.row + 1).height = EXCEL_CONFIG.imageRowHeight;

        // 시설 정보 캡션
        addFacilityCaptionToExcel(
          worksheet,
          photo.facility_caption,
          cells.facilityCaptionCell.col,
          cells.facilityCaptionCell.row + 1
        );

        // 사용자 캡션 (옵션)
        if (includeUserCaption && photo.user_caption && cells.userCaptionCell) {
          addUserCaptionToExcel(
            worksheet,
            photo.user_caption,
            cells.userCaptionCell.col,
            cells.userCaptionCell.row + 1
          );
        }
      } catch (error) {
        console.error(`[EXCEL] 배출시설 이미지 ${i + 1} 추가 실패:`, error);
      }
    }
  }

  // Buffer로 변환
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
