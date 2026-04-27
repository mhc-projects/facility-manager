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

type Vendor = 'fujino' | 'mz';

const VENDOR_LABELS: Record<Vendor, { name: string; desc: string; color: string; sheetHint: string }> = {
  fujino: { name: '후지노', desc: '사후관리 + 설치', color: 'blue',   sheetHint: '첫 번째 시트' },
  mz:     { name: '엠즈',   desc: '사후관리만',       color: 'purple', sheetHint: '1종 시트' },
};

/** 엠즈 파일에서 데이터 시트 이름 우선순위 */
const MZ_SHEET_PRIORITY = ['1종', '2종', '3종'];

// 청크 크기: 4MB 제한 고려해 200행으로 제한
const CHUNK_SIZE = 200;

export default function DpfImportUploader({ onComplete }: Props) {
  const [vendor, setVendor] = useState<Vendor>('fujino');
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
      // xlsx 동적 임포트 및 파싱
      const XLSX = await import('xlsx');

      let rawRows: Record<string, unknown>[];
      try {
        const buffer = await file.arrayBuffer();
        // Uint8Array로 변환해서 전달 (ArrayBuffer 호환성 문제 방지)
        const wb = XLSX.read(new Uint8Array(buffer), {
          type: 'array',
          cellDates: false, // Date 객체 대신 문자열로 받음
          raw: false,       // 모든 값을 포맷된 문자열로
          dateNF: 'yyyy-mm-dd',
        });

        // 엠즈: 1종/2종/3종 시트 우선, 없으면 첫 번째 시트
        // 후지노: 첫 번째 시트
        let sheetName = wb.SheetNames[0];
        if (vendor === 'mz') {
          const found = MZ_SHEET_PRIORITY.find(n => wb.SheetNames.includes(n));
          if (found) sheetName = found;
        }

        const ws = wb.Sheets[sheetName];
        rawRows = XLSX.utils.sheet_to_json(ws, {
          defval: null,
          raw: false,       // 날짜·숫자 등 모두 문자열로 통일
        });
      } catch (xlsxErr) {
        throw new Error(`엑셀 파일 파싱 실패: ${xlsxErr instanceof Error ? xlsxErr.message : '파일 형식을 확인하세요'}`);
      }

      const totalRows = rawRows.length;
      if (totalRows === 0) {
        setStatus('error');
        setStatusText('데이터가 없습니다. 파일을 확인하세요.');
        return;
      }

      setStatusText(`총 ${totalRows.toLocaleString()}행 변환 중...`);

      // 컬럼 매핑 변환 (vendor별 다른 매핑 적용)
      const transformed = rawRows.map(row => transformDpfRow(row, vendor));

      // vin 없는 행 제거
      const validRows = transformed.filter(r => r.vin && r.vin.length > 0);
      const skippedCount = totalRows - validRows.length;

      if (validRows.length === 0) {
        setStatus('error');
        setStatusText('차대번호(VIN)가 있는 행이 없습니다. 헤더명을 확인하세요.');
        return;
      }

      const batchId = crypto.randomUUID();
      const chunks: typeof validRows[] = [];
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        chunks.push(validRows.slice(i, i + CHUNK_SIZE));
      }

      setStatus('uploading');
      setStatusText(`0 / ${chunks.length} 청크 업로드 중...`);

      // 청크별 순차 업로드
      for (let i = 0; i < chunks.length; i++) {
        let res: Response;
        try {
          res = await fetch('/api/dpf/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId,
              rows: chunks[i],
              chunkIndex: i,
              vendor,
            }),
          });
        } catch (fetchErr) {
          throw new Error(`네트워크 오류: ${fetchErr instanceof Error ? fetchErr.message : '연결을 확인하세요'}`);
        }

        if (!res.ok) {
          let errMsg = `업로드 실패 (HTTP ${res.status})`;
          try {
            const errData = await res.json();
            if (typeof errData.error === 'string') errMsg = errData.error;
          } catch {
            // JSON 파싱 실패 시 기본 메시지 사용
          }
          throw new Error(errMsg);
        }

        setProgress(Math.round(((i + 1) / chunks.length) * 80));
        setStatusText(`${i + 1} / ${chunks.length} 청크 업로드 완료`);
      }

      // 스테이징 → 본 테이블 처리
      setStatus('processing');
      setStatusText('데이터 처리 중 (잠시 기다려주세요)...');
      setProgress(85);

      let processRes: Response;
      try {
        processRes = await fetch('/api/dpf/import/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId }),
        });
      } catch (fetchErr) {
        throw new Error(`처리 요청 실패: ${fetchErr instanceof Error ? fetchErr.message : '연결을 확인하세요'}`);
      }

      if (!processRes.ok) {
        let errMsg = `처리 실패 (HTTP ${processRes.status})`;
        try {
          const errData = await processRes.json();
          if (typeof errData.error === 'string') errMsg = errData.error;
        } catch {
          // JSON 파싱 실패 시 기본 메시지 사용
        }
        throw new Error(errMsg);
      }

      const result = await processRes.json();
      setProgress(100);
      setStatus('done');

      const finalStats: ImportStats = {
        totalRows: validRows.length,
        processedCount: result.processedCount ?? 0,
        errorCount: (result.errorCount ?? 0) + skippedCount,
        errors: Array.isArray(result.errors) ? result.errors : [],
      };

      if (skippedCount > 0) {
        finalStats.errors.push({
          rowIndex: -1,
          message: `차대번호가 없는 행 ${skippedCount}건 제외됨`,
        });
      }

      setStatusText(`완료: ${finalStats.processedCount.toLocaleString()}건 처리, ${finalStats.errorCount}건 오류`);
      onComplete?.(finalStats);
      setStats(finalStats);

    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(msg || '알 수 없는 오류가 발생했습니다.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const isWorking = status === 'parsing' || status === 'uploading' || status === 'processing';

  return (
    <div className="space-y-4">
      {/* 벤더 선택 */}
      <div className="flex gap-3">
        {(Object.entries(VENDOR_LABELS) as [Vendor, typeof VENDOR_LABELS[Vendor]][]).map(([key, v]) => (
          <button
            key={key}
            onClick={() => !isWorking && setVendor(key)}
            disabled={isWorking}
            className={`flex-1 flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2 transition-all ${
              vendor === key
                ? key === 'fujino'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            } ${isWorking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="font-semibold text-sm">{v.name}</span>
            <span className="text-xs opacity-75">{v.desc}</span>
          </button>
        ))}
      </div>

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
          <span className="text-xs text-gray-500">
            {vendor === 'mz'
              ? '엠즈 DB 파일을 선택하세요 (1종 시트 자동 인식)'
              : '후지노 차량정보 파일을 선택하세요'}
          </span>
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
                    <span className="text-gray-400 w-12 shrink-0">행 {e.rowIndex < 0 ? '-' : e.rowIndex}</span>
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
        {vendor === 'mz' ? (
          <>
            <p>• 엠즈: 현재 차량번호·현재 업체명·지자체(대)·최종연락처·일련번호(후)·구조변경일자 인식</p>
            <p>• 이전 차량번호, 이전 업체명, 제작사 등 나머지 컬럼은 내부 보관됩니다.</p>
          </>
        ) : (
          <>
            <p>• 후지노: 차량번호·소유자성명·접수지자체명·연락처·장치시리얼번호·구변일자 인식</p>
            <p>• 나머지 컬럼은 내부 보관됩니다.</p>
          </>
        )}
        <p>• 대량 데이터 기준 약 2~3분 소요됩니다.</p>
      </div>
    </div>
  );
}
