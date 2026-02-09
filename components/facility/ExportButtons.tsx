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

      // 1. CSRF 토큰 가져오기
      const csrfResponse = await fetch('/api/csrf-token');
      const csrfToken = csrfResponse.headers.get('X-CSRF-Token');

      if (!csrfToken) {
        throw new Error('CSRF 토큰을 가져올 수 없습니다.');
      }

      // 2. Export API 호출 (CSRF 토큰 포함)
      const response = await fetch('/api/export-photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          businessName,
          format: options.format,
          includeUserCaption: options.includeUserCaption,
          sections: ['prevention', 'discharge'],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '다운로드 실패');
      }

      // Blob으로 변환하여 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `시설사진_${businessName}_${new Date().toISOString().split('T')[0]}.${options.format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onExportComplete?.();
    } catch (error) {
      console.error('Export error:', error);
      onExportError?.(error as Error);
      throw error;
    }
  };

  // 사진이 없으면 버튼 비활성화
  if (photoCount === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          title="PDF로 다운로드"
        >
          <span>📥</span>
          <span>PDF</span>
        </button>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
          title="Excel로 다운로드"
        >
          <span>📊</span>
          <span>Excel</span>
        </button>
      </div>

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
