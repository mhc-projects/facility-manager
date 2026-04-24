'use client';

import { useState, useRef } from 'react';
import { transformDpfRow } from '@/lib/dpf-column-map';

interface ImportStats {
  totalRows: number;
  processedCount: number;
  errorCount: number;
  errors: Array<{ rowIndex: number; vin?: string; message: string }>;
}

interface Props {
  onComplete?: (stats: ImportStats) => void;
}

const CHUNK_SIZE = 1000;

export default function DpfImportUploader({ onComplete }: Props) {
  const [status, setStatus] = useState<'idle' | 'parsing' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [stats, setStats] = useState<ImportStats | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('parsing');
    setProgress(0);
    setStats(null);
    setStatusText('엑셀 파일 파싱 중...');

    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: Record<string, unknown>[] = utils.sheet_to_json(ws, { defval: null });

      const totalRows = rawRows.length;
      if (totalRows === 0) {
        setStatus('error');
        setStatusText('데이터가 없습니다.');
        return;
      }

      setStatusText(`총 ${totalRows.toLocaleString()}행 변환 중...`);

      // 컬럼 매핑 변환
      const transformed = rawRows.map(transformDpfRow);

      // vin 없는 행 제거
      const validRows = transformed.filter(r => r.vin && r.vin.length > 0);
      const skippedCount = totalRows - validRows.length;

      const batchId = crypto.randomUUID();
      const chunks = [];
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        chunks.push(validRows.slice(i, i + CHUNK_SIZE));
      }

      setStatus('uploading');
      setStatusText(`0 / ${chunks.length} 청크 업로드 중...`);

      // 청크별 순차 업로드
      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch('/api/dpf/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            rows: chunks[i],
            chunkIndex: i,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? '업로드 실패');
        }

        setProgress(Math.round(((i + 1) / chunks.length) * 80));
        setStatusText(`${i + 1} / ${chunks.length} 청크 업로드 완료`);
      }

      // 스테이징 → 본 테이블 처리
      setStatus('processing');
      setStatusText('데이터 처리 중 (잠시 기다려주세요)...');
      setProgress(85);

      const processRes = await fetch('/api/dpf/import/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.error ?? '처리 실패');
      }

      const result = await processRes.json();
      setProgress(100);
      setStatus('done');

      const finalStats: ImportStats = {
        totalRows: validRows.length,
        processedCount: result.processedCount,
        errorCount: result.errorCount + skippedCount,
        errors: result.errors ?? [],
      };

      if (skippedCount > 0) {
        finalStats.errors.push({
          rowIndex: -1,
          message: `차대번호가 없는 행 ${skippedCount}건 제외됨`,
        });
      }

      setStats(finalStats);
      setStatusText(`완료: ${finalStats.processedCount.toLocaleString()}건 처리, ${finalStats.errorCount}건 오류`);
      onComplete?.(finalStats);

    } catch (err) {
      setStatus('error');
      setStatusText(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const isWorking = status === 'parsing' || status === 'uploading' || status === 'processing';

  return (
    <div className="space-y-4">
      {/* 파일 선택 */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          disabled={isWorking}
          className="hidden"
          id="dpf-import-file"
        />
        <label
          htmlFor="dpf-import-file"
          className={`cursor-pointer flex flex-col items-center gap-2 ${isWorking ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            {isWorking ? '처리 중...' : '엑셀 파일 선택 (.xlsx)'}
          </span>
          <span className="text-xs text-gray-500">후지노 차량정보 파일을 선택하세요</span>
        </label>
      </div>

      {/* 진행률 */}
      {(isWorking || status === 'done') && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{statusText}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                status === 'done' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 결과 요약 */}
      {stats && status === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-2">임포트 완료</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-700">{stats.totalRows.toLocaleString()}</div>
              <div className="text-gray-600">전체 행</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-700">{stats.processedCount.toLocaleString()}</div>
              <div className="text-gray-600">처리 완료</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${stats.errorCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {stats.errorCount}
              </div>
              <div className="text-gray-600">오류/제외</div>
            </div>
          </div>

          {stats.errors.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm text-red-600 cursor-pointer">
                오류 내역 ({stats.errors.length}건)
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto text-xs text-gray-600 space-y-1">
                {stats.errors.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-400 w-12">행 {e.rowIndex < 0 ? '-' : e.rowIndex}</span>
                    {e.vin && <span className="text-gray-500">[{e.vin}]</span>}
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 오류 */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm font-medium">{statusText}</p>
          <button
            onClick={() => { setStatus('idle'); setStatusText(''); setProgress(0); }}
            className="mt-2 text-xs text-red-600 underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 주의사항 */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• 차대번호(VIN)가 같으면 기존 데이터를 덮어씁니다 (upsert)</p>
        <p>• 노란색 헤더 9개 컬럼만 표시됩니다. 나머지는 내부 보관됩니다.</p>
        <p>• 18,789건 기준 약 30~60초 소요됩니다.</p>
      </div>
    </div>
  );
}
