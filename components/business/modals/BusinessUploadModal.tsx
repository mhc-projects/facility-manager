'use client'

import { Upload, Download } from 'lucide-react'

interface UploadResults {
  total: number
  created: number
  updated: number
  failed: number
  errors: (string | { business: string; error: string })[]
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
}: BusinessUploadModalProps) {
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
