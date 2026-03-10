'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Download, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { TokenManager } from '@/lib/api-client';
import * as XLSX from 'xlsx';

interface UploadResult {
  row: number;
  success: boolean;
  business_name: string;
  error?: string;
}

interface AsExcelUploadProps {
  onComplete: () => void;
}

export default function AsExcelUpload({ onComplete }: AsExcelUploadProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    successCount: number;
    failCount: number;
    results: UploadResult[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/as-records/bulk-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TokenManager.getToken()}` },
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setResult(json);
        if (json.successCount > 0) {
          onComplete();
        }
      } else {
        alert(json.error || '업로드 실패');
      }
    } catch (e) {
      console.error('엑셀 업로드 실패:', e);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // ── 데이터 시트 ──
    const headers = [
      '사업장관리코드',
      '사업장명',
      '접수일',
      '작업일',
      '접수내용',
      '작업내용',
      '배출구정보',
      'AS담당자',
      '연락처',
      '소속/회사',
      '상태',
      '유상/무상',
    ];

    const examples = [
      ['1001', '홍길동산업', '2026-01-15', '2026-01-20', 'pH계 측정값 이상', '전극 교체 및 보정', '1번 배출구', '김담당', '010-1234-5678', '블루온', '완료', '유상'],
      ['1002', '테스트사업장', '2026-02-10', '', 'DO계 센서 불량', '', '굴뚝 A', '이기사', '010-9876-5432', '외주업체', '진행중', '무상'],
      ['', '샘플공장', '', '', '정기점검 요청', '', '', '', '', '', '접수', ''],
    ];

    const wsData = [headers, ...examples];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 컬럼 너비 설정
    ws['!cols'] = [
      { wch: 16 }, // 사업장관리코드
      { wch: 20 }, // 사업장명
      { wch: 14 }, // 접수일
      { wch: 14 }, // 작업일
      { wch: 30 }, // 접수내용
      { wch: 30 }, // 작업내용
      { wch: 16 }, // 배출구정보
      { wch: 12 }, // AS담당자
      { wch: 16 }, // 연락처
      { wch: 14 }, // 소속/회사
      { wch: 12 }, // 상태
      { wch: 12 }, // 유상/무상
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'AS건_업로드');

    // ── 안내 시트 ──
    const guideData = [
      ['📋 AS 건 엑셀 업로드 안내'],
      [],
      ['컬럼', '필수', '설명', '유효값/형식'],
      ['사업장관리코드', '권장', '사업장 고유 관리코드 (있는 경우 사업장명보다 우선 적용)', '숫자 (예: 1001)'],
      ['사업장명', '조건필수', '사업장관리코드가 없는 경우 필수. 시스템에 등록된 사업장명과 정확히 일치해야 합니다', ''],
      ['접수일', '선택', 'AS 접수 날짜', 'YYYY-MM-DD (예: 2026-01-15)'],
      ['작업일', '선택', 'AS 작업 수행 날짜', 'YYYY-MM-DD (예: 2026-01-20)'],
      ['접수내용', '선택', '접수된 AS 문제/요청 내용', '자유 텍스트'],
      ['작업내용', '선택', '수행한 작업 내용', '자유 텍스트'],
      ['배출구정보', '선택', '배출구 번호/명칭', '자유 텍스트 (예: 1번 배출구)'],
      ['AS담당자', '선택', 'AS 담당자 이름 (외부 인력 포함 가능)', '자유 텍스트'],
      ['연락처', '선택', 'AS 담당자 연락처', '자유 텍스트'],
      ['소속/회사', '선택', 'AS 담당자 소속 또는 회사명', '자유 텍스트'],
      ['상태', '선택', 'AS 진행 상태 (빈칸이면 "접수"로 자동 설정)', '접수 / 일정조율중 / 진행중 / 부품대기 / 보류 / 완료 / 취소'],
      ['유상/무상', '선택', '유상/무상 수동 설정 (빈칸이면 출고일 기준 자동 계산)', '유상 / 무상 / (빈칸=자동)'],
      [],
      ['⚠️ 주의사항'],
      ['• 첫 번째 행은 헤더 행으로 건너뜁니다.'],
      ['• 사업장관리코드와 사업장명이 모두 비어있는 행은 무시됩니다.'],
      ['• 사업장관리코드가 있으면 사업장명보다 우선하여 사업장을 찾습니다.'],
      ['• 사업장을 찾지 못하면 해당 행은 실패 처리됩니다.'],
      ['• 날짜는 YYYY-MM-DD 형식 또는 엑셀 날짜 형식 모두 지원합니다.'],
    ];

    const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
    wsGuide['!cols'] = [
      { wch: 14 },
      { wch: 8 },
      { wch: 45 },
      { wch: 55 },
    ];

    XLSX.utils.book_append_sheet(wb, wsGuide, '작성_안내');

    XLSX.writeFile(wb, 'AS건_업로드_템플릿.xlsx');
  };

  const resetModal = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    setOpen(false);
    resetModal();
  };

  const modal = open ? (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-bold text-gray-900">AS 건 엑셀 일괄 업로드</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 템플릿 다운로드 */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-sm text-blue-800">
              <p className="font-medium">엑셀 템플릿을 다운로드하여 양식에 맞게 작성하세요.</p>
              <p className="text-xs text-blue-600 mt-0.5">사업장관리코드 또는 사업장명으로 사업장을 특정합니다.</p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs whitespace-nowrap ml-3"
            >
              <Download className="w-3.5 h-3.5" />
              템플릿 다운로드
            </button>
          </div>

          {/* 파일 선택 */}
          {!result && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">파일 선택</label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">클릭하여 파일 선택</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv 파일 지원</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* 업로드 결과 */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-6 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-900">{result.total}</div>
                  <div className="text-xs text-gray-500">전체</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-green-600">{result.successCount}</div>
                  <div className="text-xs text-gray-500">성공</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-red-600">{result.failCount}</div>
                  <div className="text-xs text-gray-500">실패</div>
                </div>
              </div>

              {result.failCount > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  <p className="text-xs font-medium text-red-700">실패 항목:</p>
                  {result.results.filter(r => !r.success).map(r => (
                    <div key={r.row} className="flex items-start gap-2 p-2 bg-red-50 rounded text-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <span className="text-red-700">
                        <span className="font-medium">{r.row}행</span> {r.business_name}: {r.error}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {result.successCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  {result.successCount}건이 성공적으로 등록되었습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          {result ? (
            <>
              <button
                onClick={resetModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
              >
                다시 업로드
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                닫기
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                <Upload className="w-4 h-4" />
                {uploading ? '업로드 중...' : '업로드'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 text-xs font-medium transition-colors"
      >
        <Upload className="w-3 h-3" />
        엑셀 일괄 업로드
      </button>

      {mounted && createPortal(modal, document.body)}
    </>
  );
}
