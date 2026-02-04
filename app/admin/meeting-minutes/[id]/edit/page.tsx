// ============================================
// 회의록 편집 페이지
// ============================================
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import AutocompleteSelectInput from '@/components/ui/AutocompleteSelectInput'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  MapPin,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import {
  MeetingType,
  LocationType,
  MeetingParticipant,
  AgendaItem,
  BusinessIssue,
  UpdateMeetingMinuteRequest,
  MeetingMinute
} from '@/types/meeting-minutes'

export default function EditMeetingMinutePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refresh = searchParams.get('refresh')  // 타임스탬프 파라미터 감지
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 폼 데이터
  const [title, setTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingType, setMeetingType] = useState<MeetingType>('정기회의')
  const [location, setLocation] = useState('')
  const [locationType, setLocationType] = useState<LocationType>('offline')
  const [participants, setParticipants] = useState<MeetingParticipant[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [summary, setSummary] = useState('')
  const [businessIssues, setBusinessIssues] = useState<BusinessIssue[]>([])
  const [status, setStatus] = useState<'draft' | 'completed' | 'archived'>('draft')

  // 자동완성용 데이터
  const [businesses, setBusinesses] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
    // 먼저 사업장과 직원 목록을 로드한 후, 회의록을 로드
    const initializeData = async () => {
      await loadBusinessesAndEmployees()
      await loadMeetingMinute()
    }
    initializeData()
  }, [refresh])  // refresh 파라미터 변경 시 재실행

  const loadBusinessesAndEmployees = async () => {
    try {
      // 사업장 목록 로드
      const businessRes = await fetch('/api/business-list?includeAll=true')
      const businessData = await businessRes.json()
      if (businessData.success && businessData.data) {
        const businessArray = Array.isArray(businessData.data.businesses) ? businessData.data.businesses : []
        setBusinesses(businessArray)
        console.log('🏢 사업장 목록 로드됨:', businessArray.length, '개')
        console.log('첫 번째 사업장:', businessArray[0])
      } else {
        setBusinesses([])
        console.log('⚠️ 사업장 목록 로드 실패')
      }

      // 담당자 목록 로드
      const employeeRes = await fetch('/api/users/employees')
      const employeeData = await employeeRes.json()
      if (employeeData.success && employeeData.data && employeeData.data.employees) {
        const employeeArray = Array.isArray(employeeData.data.employees) ? employeeData.data.employees : []
        setEmployees(employeeArray)
        console.log('👥 직원 목록 로드됨:', employeeArray.length, '명')
        console.log('첫 번째 직원:', employeeArray[0])
      } else {
        setEmployees([])
        console.log('⚠️ 직원 목록 로드 실패')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Failed to load data:', error)
      setBusinesses([])
      setEmployees([])
    }
  }

  const loadMeetingMinute = async () => {
    try {
      setLoading(true)

      const timestamp = Date.now()
      const response = await fetch(`/api/meeting-minutes/${params.id}?_t=${timestamp}`, {
        cache: 'no-store'
      })
      const result = await response.json()

      if (result.success) {
        const minute: MeetingMinute = result.data

        console.log('📋 =====회의록 데이터 로드=====')
        console.log('참석자 원본:', minute.participants)
        console.log('안건 원본:', minute.agenda)
        console.log('사업장별 이슈 원본:', minute.content?.business_issues)

        // 폼 데이터 설정
        setTitle(minute.title)

        // ISO 날짜를 datetime-local 포맷으로 변환
        const date = new Date(minute.meeting_date)
        const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
        setMeetingDate(localDateTime)

        setMeetingType(minute.meeting_type)
        setLocation(minute.location)
        setLocationType(minute.location_type)

        const participantsData = minute.participants || []
        const agendaData = minute.agenda || []
        const businessIssuesData = minute.content?.business_issues || []

        setParticipants(participantsData)
        setAgenda(agendaData)
        setSummary(minute.content?.summary || '')
        setBusinessIssues(businessIssuesData)
        setStatus(minute.status)

        console.log('✅ 상태 설정 완료')
        console.log('참석자 state:', participantsData)
        console.log('안건 state:', agendaData)
        console.log('사업장별 이슈 state:', businessIssuesData)
      } else {
        console.error('[MEETING-MINUTE] Load failed:', result.error)
        alert('회의록을 불러오는데 실패했습니다.')
        router.push('/admin/meeting-minutes')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Load error:', error)
      alert('회의록을 불러오는데 실패했습니다.')
      router.push('/admin/meeting-minutes')
    } finally {
      setLoading(false)
    }
  }

  // 참석자 관리
  const handleAddParticipant = () => {
    setParticipants([
      ...participants,
      {
        id: crypto.randomUUID(),
        name: '',
        role: '',
        employee_id: undefined,  // 명시적으로 undefined 설정 (리렌더링 시 상태 안정성 확보)
        attended: true,
        is_internal: false
      }
    ])
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const handleUpdateParticipant = (index: number, field: keyof MeetingParticipant, value: any) => {
    const updated = [...participants]
    updated[index] = { ...updated[index], [field]: value }
    setParticipants(updated)
  }

  // 안건 관리
  const handleAddAgenda = () => {
    setAgenda([
      ...agenda,
      {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        deadline: '',
        assignee_id: undefined,    // undefined로 초기화 (AutocompleteSelectInput 안정성)
        assignee_name: undefined   // undefined로 초기화
      }
    ])
  }

  const handleRemoveAgenda = (index: number) => {
    setAgenda(agenda.filter((_, i) => i !== index))
  }

  const handleUpdateAgenda = (index: number, field: keyof AgendaItem, value: any) => {
    const updated = [...agenda]
    updated[index] = { ...updated[index], [field]: value }
    setAgenda(updated)
  }

  // 사업장별 이슈 관리
  const handleAddBusinessIssue = () => {
    setBusinessIssues([
      ...businessIssues,
      {
        id: crypto.randomUUID(),
        business_id: '',
        business_name: '',
        issue_description: '',
        assignee_id: '',
        assignee_name: '',
        is_completed: false
      }
    ])
  }

  const handleRemoveBusinessIssue = (index: number) => {
    setBusinessIssues(businessIssues.filter((_, i) => i !== index))
  }

  const handleUpdateBusinessIssue = (index: number, field: keyof BusinessIssue, value: any) => {
    const updated = [...businessIssues]
    updated[index] = { ...updated[index], [field]: value }
    setBusinessIssues(updated)
  }

  const handleToggleComplete = (index: number) => {
    const updated = [...businessIssues]
    updated[index].is_completed = !updated[index].is_completed
    if (updated[index].is_completed) {
      updated[index].completed_at = new Date().toISOString()
    } else {
      delete updated[index].completed_at
    }
    setBusinessIssues(updated)
  }

  const handleSave = async (newStatus?: 'draft' | 'completed' | 'archived') => {
    // 필수 필드 검증
    if (!title.trim()) {
      alert('회의록 제목을 입력해주세요.')
      return
    }
    if (!meetingDate) {
      alert('회의 날짜를 선택해주세요.')
      return
    }

    try {
      setSaving(true)

      const data: UpdateMeetingMinuteRequest = {
        title,
        meeting_date: new Date(meetingDate).toISOString(),
        meeting_type: meetingType,
        participants,
        location,
        location_type: locationType,
        agenda,
        content: {
          summary,
          discussions: [], // 빈 배열로 유지 (하위 호환성)
          business_issues: businessIssues
        },
        status: newStatus || status
      }

      const response = await fetch(`/api/meeting-minutes/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        cache: 'no-store'  // 캐시 비활성화로 항상 최신 데이터 반영
      })

      const result = await response.json()

      if (result.success) {
        alert('회의록이 수정되었습니다.')
        // 타임스탬프 파라미터로 상세 페이지 강제 리로드 트리거
        const timestamp = Date.now()
        router.push(`/admin/meeting-minutes/${params.id}?updated=${timestamp}`)
      } else {
        alert(`수정 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Save error:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (confirm('수정 중인 내용이 저장되지 않습니다. 취소하시겠습니까?')) {
      router.push(`/admin/meeting-minutes/${params.id}`)
    }
  }

  if (!mounted || loading) {
    return (
      <AdminLayout title="회의록 편집">
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">회의록을 불러오는 중...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      title="회의록 편집"
      description="회의록 내용을 수정합니다"
      actions={
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">취소</span>
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">임시저장</span>
          </button>
          <button
            onClick={() => handleSave('completed')}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">완료</span>
          </button>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto">
        {/* 2열 그리드 레이아웃 - create 페이지와 동일 */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* 왼쪽 열: 핵심 회의 정보 */}
          <div className="space-y-4">
            {/* 기본 정보 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 mb-3">기본 정보</h2>

              <div className="space-y-3">
                {/* 제목 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    회의록 제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 2025년 1월 정기 회의"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* 날짜 + 회의 유형 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <CalendarIcon className="w-4 h-4 inline mr-1" />
                      회의 날짜 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      회의 유형
                    </label>
                    <select
                      value={meetingType}
                      onChange={(e) => setMeetingType(e.target.value as MeetingType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="정기회의">정기회의</option>
                      <option value="임시회의">임시회의</option>
                      <option value="프로젝트회의">프로젝트회의</option>
                      <option value="고객미팅">고객미팅</option>
                    </select>
                  </div>
                </div>

                {/* 장소 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    장소
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="예: 본사 3층 회의실"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 참석자 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                  <UsersIcon className="w-4 h-4" />
                  참석자 ({participants.length})
                </h2>
                <button
                  onClick={handleAddParticipant}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>추가</span>
                </button>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-4 text-gray-500 text-sm">
                  참석자를 추가해주세요
                </div>
              ) : (
                <div className="space-y-1.5">
                  {participants.map((participant, index) => (
                    <div key={participant.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      {/* 이름 autocomplete */}
                      <div className="flex-1 min-w-0">
                        {/* employee_id가 없는 경우(기존 데이터) name을 직접 표시 */}
                        {!participant.employee_id && participant.name ? (
                          <input
                            type="text"
                            value={participant.name}
                            onChange={(e) => {
                              const updated = [...participants]
                              updated[index] = {
                                ...updated[index],
                                name: e.target.value
                              }
                              setParticipants(updated)
                            }}
                            placeholder="이름"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <AutocompleteSelectInput
                            value={participant.employee_id || ''}
                            onChange={(id, name) => {
                              const updated = [...participants]
                              const employee = employees.find(emp => emp.id === id)
                              updated[index] = {
                                ...updated[index],
                                name: name,
                                employee_id: id,
                                is_internal: !!id,
                                role: employee?.department || updated[index].role
                              }
                              setParticipants(updated)
                            }}
                            options={employees.map((emp) => ({
                              id: emp.id,
                              name: emp.name
                            }))}
                            placeholder="이름..."
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            allowCustomValue={true}
                          />
                        )}
                      </div>

                      {/* 참석 체크박스 - 컴팩트 */}
                      <label className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={participant.attended}
                          onChange={(e) => handleUpdateParticipant(index, 'attended', e.target.checked)}
                          className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span>참석</span>
                      </label>

                      {/* 삭제 버튼 - 컴팩트 */}
                      <button
                        onClick={() => handleRemoveParticipant(index)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 안건 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">안건</h2>
                <button
                  onClick={handleAddAgenda}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>추가</span>
                </button>
              </div>

              {agenda.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                  안건을 추가해주세요
                </div>
              ) : (
                <div className="space-y-3">
                  {agenda.map((item, index) => (
                    <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          {/* 제목 */}
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateAgenda(index, 'title', e.target.value)}
                            placeholder="안건 제목"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />

                          {/* 설명 */}
                          <textarea
                            value={item.description}
                            onChange={(e) => handleUpdateAgenda(index, 'description', e.target.value)}
                            placeholder="안건 설명"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                          />

                          {/* 마감일 + 담당자 */}
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={item.deadline || ''}
                              onChange={(e) => handleUpdateAgenda(index, 'deadline', e.target.value)}
                              placeholder="마감일"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                            <AutocompleteSelectInput
                              value={item.assignee_id || ''}
                              onChange={(id, name) => {
                                const updated = [...agenda]
                                updated[index] = {
                                  ...updated[index],
                                  assignee_name: name,
                                  assignee_id: id
                                }
                                setAgenda(updated)
                              }}
                              options={employees.map((emp) => ({
                                id: emp.id,
                                name: emp.name
                              }))}
                              placeholder="담당자"
                              className="w-full"
                              allowCustomValue={true}
                            />
                          </div>
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => handleRemoveAgenda(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽 열: 요약 및 이슈 */}
          <div className="space-y-4">
            {/* 회의 요약 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 mb-3">회의 요약</h2>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="회의 전반적인 내용을 요약하여 작성해주세요..."
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
              />
            </div>

            {/* 사업장별 이슈 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">사업장별 이슈</h2>
                <button
                  onClick={handleAddBusinessIssue}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>추가</span>
                </button>
              </div>

              {businessIssues.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                  사업장별 이슈를 추가해주세요
                </div>
              ) : (
                <div className="space-y-3">
                  {businessIssues.map((issue, index) => {
                    // 🔍 디버깅: 사업장별 이슈 렌더링 시 데이터 확인
                    if (index === 0) {
                      console.log(`🏢 사업장별 이슈 #${index} 렌더링:`, {
                        business_id: issue.business_id,
                        business_name: issue.business_name,
                        assignee_id: issue.assignee_id,
                        assignee_name: issue.assignee_name,
                        issue_description: issue.issue_description
                      })
                      console.log('사업장 options 개수:', businesses.length)
                      console.log('직원 options 개수:', employees.length)
                    }

                    return (
                      <div key={issue.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="space-y-2">
                          {/* 사업장 선택 */}
                          {!issue.business_id && issue.business_name ? (
                            <input
                              type="text"
                              value={issue.business_name}
                              onChange={(e) => {
                                const updated = [...businessIssues]
                                updated[index] = {
                                  ...updated[index],
                                  business_name: e.target.value
                                }
                                setBusinessIssues(updated)
                              }}
                              placeholder="사업장명"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          ) : (
                            <AutocompleteSelectInput
                              value={issue.business_id}
                              onChange={(id, name) => {
                                const updated = [...businessIssues]
                                updated[index] = {
                                  ...updated[index],
                                  business_name: name,
                                  business_id: id
                                }
                                setBusinessIssues(updated)
                              }}
                              options={businesses.map((biz) => ({
                                id: biz.id,
                                name: biz.business_name
                              }))}
                              placeholder="사업장 선택"
                              className="w-full"
                              allowCustomValue={true}
                            />
                          )}

                        {/* 이슈 설명 */}
                        <textarea
                          value={issue.issue_description}
                          onChange={(e) => handleUpdateBusinessIssue(index, 'issue_description', e.target.value)}
                          placeholder="이슈 내용을 입력하세요"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
                        />

                        {/* 담당자 */}
                        {!issue.assignee_id && issue.assignee_name ? (
                          <input
                            type="text"
                            value={issue.assignee_name}
                            onChange={(e) => {
                              const updated = [...businessIssues]
                              updated[index] = {
                                ...updated[index],
                                assignee_name: e.target.value
                              }
                              setBusinessIssues(updated)
                            }}
                            placeholder="담당자명"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <AutocompleteSelectInput
                            value={issue.assignee_id}
                            onChange={(id, name) => {
                              const updated = [...businessIssues]
                              updated[index] = {
                                ...updated[index],
                                assignee_name: name,
                                assignee_id: id
                              }
                              setBusinessIssues(updated)
                            }}
                            options={employees.map((emp) => ({
                              id: emp.id,
                              name: emp.name
                            }))}
                            placeholder="담당자 선택"
                            className="w-full"
                            allowCustomValue={true}
                          />
                        )}

                        {/* 하단: 완료 체크 + 삭제 버튼 */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={issue.is_completed}
                              onChange={() => handleToggleComplete(index)}
                              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                            />
                            <span className={issue.is_completed ? 'text-green-600 font-medium' : 'text-gray-700'}>
                              {issue.is_completed ? '완료됨' : '미완료'}
                            </span>
                            {issue.is_completed && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                          </label>

                          <button
                            onClick={() => handleRemoveBusinessIssue(index)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={() => handleSave('completed')}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '저장 중...' : '완료'}
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
