'use client';

import { useState } from 'react';

export interface ExportOptions {
  format: 'pdf' | 'excel';
  includeUserCaption: boolean; // 사용자 입력 설명 포함 여부 (시설 정보는 항상 포함)
}

interface ExportDialogProps {
  isOpen: boolean;
  businessName: string;
  photoCount: number;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
}

export default function ExportDialog({
  isOpen,
  businessName,
  photoCount,
  onClose,
  onExport
}: ExportDialogProps) {
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf');
  const [includeUserCaption, setIncludeUserCaption] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setProgressMessage('다운로드 준비 중...');

    try {
      await onExport({ format, includeUserCaption });
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span>📥</span>
            시설 사진 다운로드
          </h3>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Business Info */}
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              <span className="font-medium">사업장:</span> {businessName}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">사진 개수:</span> {photoCount}장
            </p>
          </div>

          {/* Include Information Section */}
          <div className="space-y-3 pt-2">
            <p className="text-sm font-medium text-gray-900">📋 포함 정보:</p>

            {/* Facility Info (Always Included) */}
            <div className="pl-4 space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✅</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    시설 정보 (시설번호, 시설명, 용량)
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    └─ 항상 포함됨 (필수)
                  </p>
                </div>
              </div>
            </div>

            {/* User Caption (Optional) */}
            <div className="pl-4">
              <label className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={includeUserCaption}
                  onChange={(e) => setIncludeUserCaption(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isExporting}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                    사용자 입력 설명 포함 (선택사항)
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    └─ 사용자가 입력한 추가 설명 텍스트
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Format Selection */}
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium text-gray-900">다운로드 형식:</p>
            <div className="flex gap-4 pl-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  disabled={isExporting}
                />
                <span className="text-sm text-gray-700">PDF</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="excel"
                  checked={format === 'excel'}
                  onChange={() => setFormat('excel')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  disabled={isExporting}
                />
                <span className="text-sm text-gray-700">Excel</span>
              </label>
            </div>
          </div>

          {/* Progress Bar */}
          {isExporting && (
            <div className="space-y-2 pt-4">
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 text-center">
                {progressMessage}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>처리 중...</span>
              </>
            ) : (
              '다운로드'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
