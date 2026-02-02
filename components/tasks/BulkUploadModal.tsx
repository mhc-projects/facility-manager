'use client'

import { useState, useRef } from 'react'
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { TokenManager } from '@/lib/api-client'
// 🔧 Phase 4: 공통 매핑 모듈 import
import { isValidTaskType, EXCEL_ALLOWED_TASK_TYPES, getInvalidTaskTypeMessage } from '@/lib/task-type-mappings'

interface BulkUploadModalProps {
  onClose: () => void
  onSuccess: () => void
}

interface ParsedTask {
  businessName: string
  taskType: string
  currentStatus: string
  assignee: string
  memo: string
  rowNumber: number
  validationErrors: string[]
}

export default function BulkUploadModal({ onClose, onSuccess }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 엑셀 템플릿 다운로드 함수
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()

    // Sheet 1: 데이터 입력 시트
    const dataSheet = [
      ['사업장명', '업무타입', '현재단계', '담당자', '메모'],
      ['예시사업장', '자비', '고객 상담', '김철수', '첫 번째 업무 등록'],
      ['', '', '', '', '']
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(dataSheet)

    // 컬럼 너비 설정
    ws1['!cols'] = [
      { wch: 20 }, // 사업장명
      { wch: 10 }, // 업무타입
      { wch: 15 }, // 현재단계
      { wch: 10 }, // 담당자
      { wch: 30 }  // 메모
    ]

    // Sheet 2: 입력 가이드
    const guideSheet = [
      ['📋 업무 일괄 등록 템플릿 - 입력 가이드'],
      [''],
      ['1. 사업장명'],
      ['  - 시스템에 등록된 정확한 사업장명을 입력하세요'],
      ['  - 예: "서울지점", "부산센터" 등'],
      [''],
      ['2. 업무타입 (선택사항)'],
      ['  - 다음 중 하나를 정확히 입력하세요:'],
      ['    • 자비 (자비시설 업무)'],
      ['    • 보조금 (보조금 업무)'],
      ['    • AS (A/S 업무)'],
      ['    • 대리점 (대리점 업무)'],
      ['    • 외주설치 (외주설치 업무)'],
      ['    • 기타 (기타 업무)'],
      [''],
      ['  ⚠️ 주의: "자가"와 "자비"는 동일하게 처리됩니다'],
      [''],
      ['3. 현재단계'],
      ['  - 업무타입에 따라 유효한 단계명을 입력하세요:'],
      [''],
      ['  ⚠️ 모든 업무 타입에서 "확인필요"를 첫 단계로 사용 가능'],
      ['  💡 신규 업무 등록 시 "확인필요" 사용을 권장합니다'],
      [''],
      ['  [자가시설 단계]'],
      ['  • 확인필요 (신규 업무 등록 시 권장)'],
      ['  • 고객 상담, 현장 실사, 견적서 작성, 계약 체결, 계약금 확인'],
      ['  • 제품 발주, 제품 출고, 설치예정, 설치완료, 잔금 입금, 서류 발송 완료'],
      [''],
      ['  [보조금 단계]'],
      ['  • 확인필요 (신규 업무 등록 시 권장)'],
      ['  • 신청서 작성 필요, 신청서 제출, 보조금 승인대기, 보조금 승인, 보조금 탈락'],
      ['  • 신청서 보완, 착공 전 실사, 착공 보완 1차, 착공 보완 2차, 착공신고서 제출'],
      ['  • 준공도서 작성 필요, 준공 실사, 준공 보완 1차, 준공 보완 2차, 준공 보완 3차'],
      ['  • 보조금지급신청서 제출, 보조금 입금'],
      [''],
      ['  [A/S 단계]'],
      ['  • 확인필요 (신규 업무 등록 시 권장)'],
      ['  • AS 고객 상담, AS 현장 확인, AS 견적 작성'],
      ['  • AS 계약 체결, AS 부품 발주, AS 완료'],
      [''],
      ['  [대리점 단계]'],
      ['  • 확인필요 (신규 업무 등록 시 권장)'],
      ['  • 발주 수신, 계산서 발행, 입금 확인, 제품 발주'],
      [''],
      ['  [외주설치 단계]'],
      ['  • 확인필요 (신규 업무 등록 시 권장)'],
      ['  • 외주 발주, 일정 조율, 설치 진행중, 설치 완료'],
      [''],
      ['  [기타 단계]'],
      ['  • 확인필요 (신규 업무 등록 시 권장)'],
      ['  • 기타'],
      [''],
      ['4. 담당자'],
      ['  - 시스템에 등록된 사용자명을 입력하세요'],
      ['  - 예: "김철수", "이영희" 등'],
      [''],
      ['5. 메모 (선택사항)'],
      ['  - 업무에 대한 추가 메모를 자유롭게 입력하세요'],
      [''],
      ['⚠️ 주의사항'],
      ['  - 첫 번째 행(헤더)은 삭제하지 마세요'],
      ['  - 예시 행은 삭제하고 실제 데이터를 입력하세요'],
      ['  - 각 항목은 정확히 입력해야 합니다 (띄어쓰기, 오타 주의)'],
      ['  - 사업장명과 담당자는 시스템에 등록된 정확한 이름이어야 합니다']
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(guideSheet)
    ws2['!cols'] = [{ wch: 80 }]

    XLSX.utils.book_append_sheet(wb, ws1, '데이터 입력')
    XLSX.utils.book_append_sheet(wb, ws2, '입력 가이드')

    XLSX.writeFile(wb, 'task-bulk-upload-template.xlsx')
  }

  // 파일 선택 핸들러
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setParseError(null)
      parseExcelFile(selectedFile)
    }
  }

  // 엑셀 파일 파싱
  const parseExcelFile = (file: File) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        if (jsonData.length < 2) {
          setParseError('엑셀 파일에 데이터가 없습니다.')
          return
        }

        // 헤더 검증
        const header = jsonData[0]
        const expectedHeader = ['사업장명', '업무타입', '현재단계', '담당자', '메모']
        const isValidHeader = expectedHeader.every((col, idx) => header[idx] === col)

        if (!isValidHeader) {
          setParseError('엑셀 템플릿 형식이 올바르지 않습니다. 템플릿을 다시 다운로드하세요.')
          return
        }

        // 데이터 파싱 (헤더 제외)
        const tasks: ParsedTask[] = []
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i]

          // 빈 행 건너뛰기
          if (!row || row.every(cell => !cell)) continue

          const task: ParsedTask = {
            businessName: row[0]?.toString().trim() || '',
            taskType: row[1]?.toString().trim() || '',
            currentStatus: row[2]?.toString().trim() || '',
            assignee: row[3]?.toString().trim() || '',
            memo: row[4]?.toString().trim() || '',
            rowNumber: i + 1,
            validationErrors: []
          }

          // 기본 유효성 검사 - 사업장명만 필수
          if (!task.businessName) {
            task.validationErrors.push('사업장명 필수')
          }

          // 🔧 Phase 4: 공통 매핑 모듈 사용
          if (task.taskType && !isValidTaskType(task.taskType)) {
            task.validationErrors.push(getInvalidTaskTypeMessage(task.taskType))
          }

          tasks.push(task)
        }

        if (tasks.length === 0) {
          setParseError('유효한 데이터가 없습니다.')
          return
        }

        setParsedTasks(tasks)
        setParseError(null)
      } catch (error) {
        console.error('Excel parsing error:', error)
        setParseError('엑셀 파일을 읽는 중 오류가 발생했습니다.')
      }
    }

    reader.onerror = () => {
      setParseError('파일을 읽을 수 없습니다.')
    }

    reader.readAsBinaryString(file)
  }

  // 업로드 실행
  const handleUpload = async () => {
    if (parsedTasks.length === 0) return

    // 유효성 오류가 있는 항목 체크
    const hasErrors = parsedTasks.some(task => task.validationErrors.length > 0)
    if (hasErrors) {
      alert('유효성 오류가 있는 항목이 있습니다. 수정 후 다시 시도하세요.')
      return
    }

    setIsUploading(true)

    try {
      const token = TokenManager.getToken()
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // 🔧 Phase 6: 청크 단위 업로드 (50개씩 분할)
      const CHUNK_SIZE = 50
      const chunks: ParsedTask[][] = []
      for (let i = 0; i < parsedTasks.length; i += CHUNK_SIZE) {
        chunks.push(parsedTasks.slice(i, i + CHUNK_SIZE))
      }

      console.log(`📦 [BULK-UPLOAD] 총 ${parsedTasks.length}개 업무를 ${chunks.length}개 청크로 분할 처리`)

      // 전체 결과 누적
      let totalResults = {
        totalCount: 0,
        successCount: 0,
        newCount: 0,
        updateCount: 0,
        skipCount: 0,
        failCount: 0,
        results: [] as any[]
      }

      // 청크별 순차 처리
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const chunkNumber = i + 1

        // 진행률 표시
        setIsUploading(`업로드 중... (${chunkNumber}/${chunks.length})`)
        console.log(`📤 [BULK-UPLOAD] Chunk ${chunkNumber}/${chunks.length} 처리 중 (${chunk.length}개)`)

        const response = await fetch('/api/admin/tasks/bulk-upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({ tasks: chunk })
        })

        const result = await response.json()

        if (!response.ok) {
          console.error(`❌ [BULK-UPLOAD] Chunk ${chunkNumber} 실패:`, result)
          throw new Error(result.error || `Chunk ${chunkNumber} 업로드 실패`)
        }

        // 🔧 Phase 5: result.data로 접근 (createSuccessResponse가 data로 감쌈)
        const chunkResult = result.data || result

        // 디버깅: 응답 구조 확인
        if (chunkNumber === 1) {
          console.log('📥 [BULK-UPLOAD] API 응답 구조:', result)
          console.log('📥 [BULK-UPLOAD] 파싱된 데이터:', chunkResult)
        }

        // 결과 누적
        totalResults.totalCount += chunkResult.totalCount || 0
        totalResults.successCount += chunkResult.successCount || 0
        totalResults.newCount += chunkResult.newCount || 0
        totalResults.updateCount += chunkResult.updateCount || 0
        totalResults.skipCount += chunkResult.skipCount || 0
        totalResults.failCount += chunkResult.failCount || 0
        totalResults.results.push(...(chunkResult.results || []))

        console.log(`✅ [BULK-UPLOAD] Chunk ${chunkNumber} 완료: 성공 ${chunkResult.successCount}개, 실패 ${chunkResult.failCount}개`)
      }

      console.log('🎉 [BULK-UPLOAD] 전체 업로드 완료:', totalResults)

      // 🔧 Phase 3: 상세한 결과 메시지 생성
      const successMessage = [
        `📊 업로드 결과 (총 ${totalResults.totalCount}개)`,
        '',
        `✅ 성공: ${totalResults.successCount}개`,
        totalResults.newCount > 0 ? `   └─ 신규 생성: ${totalResults.newCount}개` : null,
        totalResults.updateCount > 0 ? `   └─ 업데이트: ${totalResults.updateCount}개` : null,
        totalResults.skipCount > 0 ? `⏭️  건너뛰기: ${totalResults.skipCount}개 (이미 등록됨)` : null,
        totalResults.failCount > 0 ? `❌ 실패: ${totalResults.failCount}개` : null,
        '',
        totalResults.failCount > 0 ? `⚠️ 실패한 항목은 개발자 도구(F12) 콘솔에서 확인하세요` : null
      ].filter(Boolean).join('\n')

      // 🔧 Phase 3: 실패 항목 상세 정보를 콘솔에 출력
      if (totalResults.failCount > 0 && totalResults.results) {
        const failedItems = totalResults.results
          .filter((r: any) => r.action === 'failed')
          .map((item: any) => ({
            행번호: item.row,
            사업장: item.businessName,
            업무타입: item.taskType || '-',
            현재단계: item.currentStatus || '-',
            담당자: item.assignee || '-',
            오류내용: Array.isArray(item.errors) ? item.errors.join(', ') : (item.error || '알 수 없는 오류')
          }));

        console.group('❌ 업로드 실패 항목 상세');
        console.table(failedItems);
        console.groupEnd();

        console.log('💡 실패 원인 해결 방법:');
        console.log('1. 사업장명: DB에 등록된 정확한 이름 확인');
        console.log('2. 업무타입: "자비", "보조금", "AS", "대리점", "외주설치", "기타" 중 하나');
        console.log('3. 담당자: 선택사항 (비어있어도 됨)');
        console.log('4. 현재단계: 업무타입에 맞는 올바른 단계명 입력');
      }

      alert(successMessage)
      onSuccess()
      onClose()
    } catch (error: any) {
      console.error('❌ [BULK-UPLOAD] 업로드 오류:', error)
      alert(`업로드 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  const validTasks = parsedTasks.filter(task => task.validationErrors.length === 0)
  const invalidTasks = parsedTasks.filter(task => task.validationErrors.length > 0)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">업무 일괄 등록</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 1단계: 템플릿 다운로드 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">1단계: 템플릿 다운로드</h3>
            <p className="text-sm text-gray-600 mb-3">
              엑셀 템플릿을 다운로드하여 업무 정보를 입력하세요.
            </p>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>템플릿 다운로드</span>
            </button>
          </div>

          {/* 2단계: 파일 업로드 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">2단계: 작성한 파일 업로드</h3>
            <p className="text-sm text-gray-600 mb-3">
              작성이 완료된 엑셀 파일을 업로드하세요.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>{file ? file.name : '파일 선택'}</span>
            </button>
            {parseError && (
              <div className="mt-3 flex items-start gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* 3단계: 미리보기 */}
          {parsedTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">3단계: 데이터 확인</h3>

              {/* 통계 */}
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">유효: <strong className="text-green-600">{validTasks.length}개</strong></span>
                </div>
                {invalidTasks.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700">오류: <strong className="text-red-600">{invalidTasks.length}개</strong></span>
                  </div>
                )}
              </div>

              {/* 테이블 */}
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">행</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">사업장명</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">업무타입</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">현재단계</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">담당자</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">메모</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedTasks.map((task, idx) => (
                      <tr key={idx} className={task.validationErrors.length > 0 ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 text-gray-900">{task.rowNumber}</td>
                        <td className="px-3 py-2 text-gray-900">{task.businessName || '-'}</td>
                        <td className="px-3 py-2 text-gray-900">{task.taskType || '-'}</td>
                        <td className="px-3 py-2 text-gray-900">{task.currentStatus || '-'}</td>
                        <td className="px-3 py-2 text-gray-900">{task.assignee || '-'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate">{task.memo || '-'}</td>
                        <td className="px-3 py-2">
                          {task.validationErrors.length === 0 ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-3 h-3" />
                              <span className="text-xs">정상</span>
                            </span>
                          ) : (
                            <div className="flex items-start gap-1 text-red-600">
                              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <div className="text-xs">
                                {/* 🔧 Phase 2: 오류 타입별 아이콘 표시 */}
                                {task.validationErrors.map((err, i) => (
                                  <div key={i} className="mb-1 flex items-start gap-1">
                                    {/* 오류 타입에 따른 아이콘 */}
                                    <span className="flex-shrink-0">
                                      {err.includes('업무타입') && '🏷️'}
                                      {err.includes('사업장') && '🏢'}
                                      {err.includes('담당자') && '👤'}
                                      {err.includes('현재단계') && '📋'}
                                      {err.includes('필수') && '⚠️'}
                                    </span>
                                    <span>{err}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleUpload}
            disabled={parsedTasks.length === 0 || invalidTasks.length > 0 || isUploading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? '업로드 중...' : `${validTasks.length}개 업무 등록`}
          </button>
        </div>
      </div>
    </div>
  )
}
