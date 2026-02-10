'use client';

import { useState } from 'react';
import ExportDialog, { ExportOptions } from './ExportDialog';

interface ExportButtonsProps {
  businessName: string;
  businessInfo: {
    address?: string;
    businessNumber?: string;
  };
  photoCount: number;
  onExportStart?: () => void;
  onExportComplete?: () => void;
  onExportError?: (error: Error) => void;
}

export default function ExportButtons({
  businessName,
  businessInfo,
  photoCount,
  onExportStart,
  onExportComplete,
  onExportError
}: ExportButtonsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleExport = async (options: ExportOptions) => {
    try {
      onExportStart?.();

      if (options.format === 'pdf') {
        // PDF는 클라이언트에서 생성 (한글 지원)
        await handlePdfExport(options.includeUserCaption);
      } else {
        // Excel은 서버에서 생성
        await handleExcelExport(options.includeUserCaption);
      }

      onExportComplete?.();
    } catch (error) {
      console.error('Export error:', error);
      onExportError?.(error as Error);
      throw error;
    }
  };

  const handlePdfExport = async (includeUserCaption: boolean) => {
    // 1. CSRF 토큰 가져오기
    const csrfResponse = await fetch('/api/csrf-token');
    const csrfToken = csrfResponse.headers.get('X-CSRF-Token');

    if (!csrfToken) {
      throw new Error('CSRF 토큰을 가져올 수 없습니다.');
    }

    // 2. 사진 데이터 가져오기
    const response = await fetch('/api/export-photos-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        businessName,
        sections: ['prevention', 'discharge'],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '데이터 조회 실패');
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('데이터 조회 실패');
    }

    // 3. 클라이언트에서 PDF 생성 (한글 지원)
    const { generateFacilityPhotoPdf } = await import('@/utils/facility-photo-pdf-generator');
    const pdfBlob = await generateFacilityPhotoPdf(result.data, includeUserCaption);

    // 4. 다운로드
    const url = window.URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `시설사진_${businessName}_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleExcelExport = async (includeUserCaption: boolean) => {
    // 1. CSRF 토큰 가져오기
    const csrfResponse = await fetch('/api/csrf-token');
    const csrfToken = csrfResponse.headers.get('X-CSRF-Token');

    if (!csrfToken) {
      throw new Error('CSRF 토큰을 가져올 수 없습니다.');
    }

    // 2. Excel 생성 API 호출
    const response = await fetch('/api/export-photos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        businessName,
        format: 'excel',
        includeUserCaption,
        sections: ['prevention', 'discharge'],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '다운로드 실패');
    }

    // 3. Blob으로 변환하여 다운로드
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `시설사진_${businessName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // 사진이 없으면 버튼 비활성화
  if (photoCount === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsDialogOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
        title="시설사진 다운로드"
      >
        <span>📥</span>
        <span>다운로드</span>
      </button>

      <ExportDialog
        isOpen={isDialogOpen}
        businessName={businessName}
        photoCount={photoCount}
        onClose={() => setIsDialogOpen(false)}
        onExport={handleExport}
      />
    </>
  );
}
