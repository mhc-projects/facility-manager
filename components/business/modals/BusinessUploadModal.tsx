'use client'

import { Upload, Download, Database } from 'lucide-react'
import { useState } from 'react'

interface UploadResults {
  total: number
  created: number
  updated: number
  failed: number
  errors: (string | { business: string; error: string })[]
}

interface MigrationResult {
  businesses_migrated: number
  businesses_skipped: number
  records_inserted: number
  errors: number
}

interface ResetMultipleStackResult {
  reset: number
}

interface BusinessUploadModalProps {
  isOpen: boolean
  onClose: () => void
  uploadFile: File | null
  setUploadFile: (file: File | null) => void
  uploadResults: UploadResults | null
  setUploadResults: (results: UploadResults | null) => void
  uploadProgress: number
  setUploadProgress: (progress: number) => void
  isUploading: boolean
  uploadMode: 'overwrite' | 'merge' | 'skip' | 'replaceAll'
  setUploadMode: (mode: 'overwrite' | 'merge' | 'skip' | 'replaceAll') => void
  handleFileUpload: (file: File) => Promise<void>
  downloadExcelTemplate: () => Promise<void>
  userPermission?: number
}

export default function BusinessUploadModal({
  isOpen,
  onClose,
  uploadFile,
  setUploadFile,
  uploadResults,
  setUploadResults,
  uploadProgress,
  setUploadProgress,
  isUploading,
  uploadMode,
  setUploadMode,
  handleFileUpload,
  downloadExcelTemplate,
  userPermission = 0,
}: BusinessUploadModalProps) {
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'previewing' | 'running' | 'done' | 'error'>('idle')
  const [migrationPreview, setMigrationPreview] = useState<{ to_migrate: number; already_in_invoice_records: number; estimated_records_to_insert: number } | null>(null)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [migrationError, setMigrationError] = useState<string | null>(null)

  // 자비 사업장 복수굴뚝 초기화
  const [resetStackStatus, setResetStackStatus] = useState<'idle' | 'previewing' | 'running' | 'done' | 'error'>('idle')
  const [resetStackPreview, setResetStackPreview] = useState<{ summary: { targets_to_reset: number; self_businesses_total: number }; targets: { name: string; current_multiple_stack: number }[] } | null>(null)
  const [resetStackResult, setResetStackResult] = useState<ResetMultipleStackResult | null>(null)
  const [resetStackError, setResetStackError] = useState<string | null>(null)

  const handleMigrationPreview = async () => {
    setMigrationStatus('previewing')
    setMigrationError(null)
    try {
      const res = await fetch('/api/migrations/legacy-invoice-to-records')
      const data = await res.json()
      if (data.success) {
        setMigrationPreview(data.summary)
        setMigrationStatus('idle')
      } else {
        setMigrationError(data.error || '미리보기 실패')
        setMigrationStatus('error')
      }
    } catch (e: any) {
      setMigrationError(e.message)
      setMigrationStatus('error')
    }
  }

  const handleMigrationRun = async () => {
    if (!confirm(`레거시 계산서 데이터 ${migrationPreview?.to_migrate || ''}개 사업장을 invoice_records로 마이그레이션합니다. 계속하시겠습니까?`)) return
    setMigrationStatus('running')
    setMigrationError(null)
    try {
      const res = await fetch('/api/migrations/legacy-invoice-to-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setMigrationResult(data.summary)
        setMigrationStatus('done')
      } else {
        setMigrationError(data.error || '마이그레이션 실패')
        setMigrationStatus('error')
      }
    } catch (e: any) {
      setMigrationError(e.message)
      setMigrationStatus('error')
    }
  }

  const handleResetStackPreview = async () => {
    setResetStackStatus('previewing')
    setResetStackError(null)
    try {
      const res = await fetch('/api/migrations/reset-self-multiple-stack')
      const data = await res.json()
      if (data.success) {
        setResetStackPreview(data)
        setResetStackStatus('idle')
      } else {
        setResetStackError(data.error || '미리보기 실패')
        setResetStackStatus('error')
      }
    } catch (e: any) {
      setResetStackError(e.message)
      setResetStackStatus('error')
    }
  }

  const handleResetStackRun = async () => {
    if (!confirm(`자비 사업장 ${resetStackPreview?.summary?.targets_to_reset || resetStackPreview?.targets?.length || ''}개의 복수굴뚝 수량을 0으로 초기화합니다. 계속하시겠습니까?`)) return
    setResetStackStatus('running')
    setResetStackError(null)
    try {
      const res = await fetch('/api/migrations/reset-self-multiple-stack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        setResetStackResult(data.summary)
        setResetStackStatus('done')
      } else {
        setResetStackError(data.error || '초기화 실패')
        setResetStackStatus('error')
      }
    } catch (e: any) {
      setResetStackError(e.message)
      setResetStackStatus('error')
    }
  }

  if (!isOpen) return null

  const handleClose = () => {
    if (!isUploading) {
      onClose()
      setUploadFile(null)
      setUploadResults(null)
      setUploadProgress(0)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) {
          handleClose()
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">엑셀 파일 업로드</h2>
        </div>

        <div className="p-6">
          {!uploadResults ? (
            <div className="space-y-6">
              {/* 파일 업로드 영역 */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium text-gray-900">엑셀 파일을 선택하세요</p>
                  <p className="text-sm text-gray-500">CSV, XLSX 파일을 지원합니다 (최대 10MB)</p>
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setUploadFile(file)
                    }
                  }}
                  className="mt-4"
                  disabled={isUploading}
                />
              </div>

              {/* 선택된 파일 정보 */}
              {uploadFile && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">선택된 파일</h4>
                  <p className="text-sm text-blue-700">
                    📄 {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                </div>
              )}

              {/* 중복 처리 모드 선택 */}
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="text-blue-600">⚙️</span>
                  중복 사업장 처리 방식
                </h4>

                <div className="space-y-3">
                  <label className="flex items-start cursor-pointer group">
                    <input
                      type="radio"
                      name="uploadMode"
                      value="overwrite"
                      checked={uploadMode === 'overwrite'}
                      onChange={(e) => setUploadMode(e.target.value as any)}
                      className="mt-1 mr-3"
                      disabled={isUploading}
                    />
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-blue-700">덮어쓰기 (권장)</div>
                      <div className="text-xs text-gray-600">
                        엑셀의 모든 값으로 기존 데이터를 완전히 교체합니다.
                        <span className="block text-blue-600 mt-0.5">💡 전체 데이터 동기화에 적합</span>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start cursor-pointer group">
                    <input
                      type="radio"
                      name="uploadMode"
                      value="merge"
                      checked={uploadMode === 'merge'}
                      onChange={(e) => setUploadMode(e.target.value as any)}
                      className="mt-1 mr-3"
                      disabled={isUploading}
                    />
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-green-700">병합 (스마트 업데이트)</div>
                      <div className="text-xs text-gray-600">
                        엑셀에 값이 있는 필드만 업데이트하고, 빈 칸은 기존 값을 유지합니다.
                        <span className="block text-green-600 mt-0.5">💡 일부 필드만 수정할 때 적합</span>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start cursor-pointer group">
                    <input
                      type="radio"
                      name="uploadMode"
                      value="skip"
                      checked={uploadMode === 'skip'}
                      onChange={(e) => setUploadMode(e.target.value as any)}
                      className="mt-1 mr-3"
                      disabled={isUploading}
                    />
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-orange-700">건너뛰기</div>
                      <div className="text-xs text-gray-600">
                        중복된 사업장은 무시하고, 새로운 사업장만 추가합니다.
                        <span className="block text-orange-600 mt-0.5">💡 신규 데이터만 추가할 때 적합</span>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start cursor-pointer group">
                    <input
                      type="radio"
                      name="uploadMode"
                      value="replaceAll"
                      checked={uploadMode === 'replaceAll'}
                      onChange={(e) => setUploadMode(e.target.value as any)}
                      className="mt-1 mr-3"
                      disabled={isUploading}
                    />
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-red-700">전체교체 ⚠️</div>
                      <div className="text-xs text-gray-600">
                        기존 사업장 데이터를 모두 삭제하고 엑셀 데이터로 완전히 교체합니다.
                        <span className="block text-red-600 mt-0.5 font-medium">⚠️ 주의: 기존 데이터가 삭제됩니다. 사진이 등록된 사업장은 삭제 차단됩니다.</span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 템플릿 다운로드 버튼 */}
              <div className="mb-4">
                <button
                  onClick={downloadExcelTemplate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors border-2 border-green-600 hover:border-green-700"
                >
                  <Download className="w-5 h-5" />
                  엑셀 템플릿 다운로드
                </button>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  표준 형식의 엑셀 파일을 다운로드하여 작성 후 업로드하세요
                </p>
              </div>

              {/* 레거시 → invoice_records 마이그레이션 섹션 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  계산서 데이터 마이그레이션
                </h4>
                <p className="text-xs text-amber-800 mb-3">
                  엑셀 업로드로 저장된 계산서 데이터가 UI에 표시되지 않을 경우, 레거시 데이터를 계산서 전용 테이블로 이전합니다.
                </p>

                {migrationStatus === 'done' && migrationResult ? (
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                    <p className="font-semibold text-green-800 mb-1">마이그레이션 완료</p>
                    <p className="text-green-700">사업장: {migrationResult.businesses_migrated}개 이전 / {migrationResult.businesses_skipped}개 스킵</p>
                    <p className="text-green-700">레코드: {migrationResult.records_inserted}개 삽입</p>
                    {migrationResult.errors > 0 && <p className="text-red-600">오류: {migrationResult.errors}개</p>}
                  </div>
                ) : migrationStatus === 'error' ? (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                    오류: {migrationError}
                  </div>
                ) : migrationPreview ? (
                  <div className="space-y-2">
                    <div className="bg-white border border-amber-200 rounded p-3 text-sm">
                      <p className="text-gray-700">이전 대상: <span className="font-bold text-amber-700">{migrationPreview.to_migrate}개</span> 사업장</p>
                      <p className="text-gray-700">이미 이전됨: <span className="font-bold text-green-700">{migrationPreview.already_in_invoice_records}개</span> 사업장</p>
                      <p className="text-gray-700">예상 레코드: <span className="font-bold">{migrationPreview.estimated_records_to_insert}개</span></p>
                    </div>
                    <button
                      onClick={handleMigrationRun}
                      disabled={migrationStatus === 'running' || migrationPreview.to_migrate === 0}
                      className="w-full px-3 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {migrationStatus === 'running' ? '마이그레이션 중...' : migrationPreview.to_migrate === 0 ? '이전할 데이터 없음' : `${migrationPreview.to_migrate}개 사업장 마이그레이션 실행`}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleMigrationPreview}
                    disabled={migrationStatus === 'previewing'}
                    className="w-full px-3 py-2 bg-amber-100 text-amber-800 text-sm rounded border border-amber-300 hover:bg-amber-200 disabled:opacity-50"
                  >
                    {migrationStatus === 'previewing' ? '확인 중...' : '마이그레이션 대상 확인'}
                  </button>
                )}
              </div>

              {/* 자비 사업장 복수굴뚝 초기화 (권한 4 전용) */}
              {userPermission >= 4 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    자비 사업장 복수굴뚝 초기화
                  </h4>
                  <p className="text-xs text-red-800 mb-3">
                    진행구분이 자비인 사업장의 복수굴뚝 수량을 0으로 초기화합니다. 이 작업은 되돌릴 수 없습니다.
                  </p>

                  {resetStackStatus === 'done' && resetStackResult ? (
                    <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                      <p className="font-semibold text-green-800 mb-1">초기화 완료</p>
                      <p className="text-green-700">{resetStackResult.reset}개 사업장의 복수굴뚝 수량을 0으로 초기화했습니다</p>
                    </div>
                  ) : resetStackStatus === 'error' ? (
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                      오류: {resetStackError}
                    </div>
                  ) : resetStackPreview ? (
                    <div className="space-y-2">
                      <div className="bg-white border border-red-200 rounded p-3 text-sm">
                        <p className="text-gray-700">초기화 대상: <span className="font-bold text-red-700">{resetStackPreview.summary.targets_to_reset}개</span> 사업장</p>
                        <p className="text-gray-700">자비 사업장 전체: <span className="font-bold">{resetStackPreview.summary.self_businesses_total}개</span></p>
                        {resetStackPreview.targets?.length > 0 && (
                          <div className="mt-2 max-h-24 overflow-y-auto">
                            <p className="text-xs text-gray-500 mb-1">대상 사업장 목록 (최대 표시):</p>
                            {resetStackPreview.targets.slice(0, 5).map((t, i) => (
                              <p key={i} className="text-xs text-gray-600">{t.name} (현재: {t.current_multiple_stack}개)</p>
                            ))}
                            {resetStackPreview.targets.length > 5 && (
                              <p className="text-xs text-gray-500">... 외 {resetStackPreview.targets.length - 5}개</p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleResetStackRun}
                        disabled={resetStackStatus === 'running' || (resetStackPreview.summary.targets_to_reset) === 0}
                        className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resetStackStatus === 'running' ? '초기화 중...' : (resetStackPreview.summary.targets_to_reset) === 0 ? '초기화할 데이터 없음' : `${resetStackPreview.summary.targets_to_reset}개 사업장 복수굴뚝 초기화`}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleResetStackPreview}
                      disabled={resetStackStatus === 'previewing'}
                      className="w-full px-3 py-2 bg-red-100 text-red-800 text-sm rounded border border-red-300 hover:bg-red-200 disabled:opacity-50"
                    >
                      {resetStackStatus === 'previewing' ? '확인 중...' : '초기화 대상 확인'}
                    </button>
                  )}
                </div>
              )}

              {/* 파일 형식 안내 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">주요 필드 안내</h4>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  <div className="font-semibold text-blue-700">사업장명 * (필수)</div>
                  <div>지자체, 주소, 대표자명</div>
                  <div>사업장담당자, 직급, 연락처</div>
                  <div>사업장연락처, 이메일, 팩스</div>
                  <div>PH센서, 차압계, 온도계</div>
                  <div>배출/송풍/펌프 전류계(CT)</div>
                  <div>게이트웨이, VPN(유/무선)</div>
                  <div>방폭차압계, 방폭온도계</div>
                  <div>확장디바이스, 중계기</div>
                  <div>메인보드교체, 복수굴뚝</div>
                  <div>제조사, 진행구분, 사업연도</div>
                  <div>영업점, 담당부서, 설치팀</div>
                  <div className="font-semibold text-green-700">일정관리: 발주/출고/설치</div>
                  <div className="font-semibold text-green-700">실사관리: 견적/착공/준공</div>
                  <div className="font-semibold text-purple-700">계산서/입금: 보조금(1차/2차/추가)</div>
                  <div className="font-semibold text-purple-700">계산서/입금: 자비(선금/잔금)</div>
                  <div>비용: 추가공사비, 네고</div>
                  <div>그린링크ID/PW, 사업장코드</div>
                </div>
                <p className="text-xs text-gray-500 mt-3 space-y-1">
                  <span className="block">• <strong>기존 사업장</strong>: 사업장명 매칭하여 자동 업데이트</span>
                  <span className="block">• <strong>신규 사업장</strong>: 자동 생성</span>
                  <span className="block">• <strong>날짜 형식</strong>: YYYY-MM-DD (예: 2025-01-15)</span>
                  <span className="block">• <strong>금액</strong>: 숫자만 입력 (예: 5000000)</span>
                  <span className="block">• <strong>VPN타입</strong>: "유선" 또는 "무선" 입력</span>
                  <span className="block">• <strong>보조금/자비</strong>: 진행구분에 따라 해당 계산서 항목 입력</span>
                  <span className="block">• 템플릿 다운로드로 정확한 형식 및 가이드 확인</span>
                </p>
              </div>

              {/* 진행률 표시 */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>업로드 진행률</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 업로드 결과 */
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">업로드 완료</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
                  <div className="bg-blue-50 rounded-lg p-2 sm:p-3 md:p-4">
                    <div className="text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-600">{uploadResults.total}</div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-blue-700">총 처리</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2 sm:p-3 md:p-4">
                    <div className="text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-green-600">{uploadResults.created || 0}</div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-green-700">신규 생성</div>
                  </div>
                  <div className="bg-cyan-50 rounded-lg p-2 sm:p-3 md:p-4">
                    <div className="text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-cyan-600">{uploadResults.updated || 0}</div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-cyan-700">업데이트</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2 sm:p-3 md:p-4">
                    <div className="text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-red-600">{uploadResults.failed}</div>
                    <div className="text-[10px] sm:text-xs md:text-sm text-red-700">실패</div>
                  </div>
                </div>
              </div>

              {/* 오류 목록 */}
              {uploadResults.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-900 mb-2">오류 목록</h4>
                  <div className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {uploadResults.errors.map((error, index) => (
                      <div key={index}>• {typeof error === 'object' ? `${(error as any).business}: ${(error as any).error}` : error}</div>
                    ))}
                    {uploadResults.failed > 10 && (
                      <div className="text-red-600 font-medium">
                        ... 외 {uploadResults.failed - 10}개 오류
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={isUploading}
            >
              {uploadResults ? '닫기' : '취소'}
            </button>
            {!uploadResults && uploadFile && (
              <button
                type="button"
                onClick={() => handleFileUpload(uploadFile)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isUploading}
              >
                {isUploading ? `업로드 중... ${uploadProgress}%` : '업로드 시작'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
