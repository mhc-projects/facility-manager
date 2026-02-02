// ============================================
// 회의록 작성 페이지
// ============================================
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import AutocompleteSelectInput from '@/components/ui/AutocompleteSelectInput'
import RecurringIssuesPanel from '@/components/admin/meeting-minutes/RecurringIssuesPanel'
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  MapPin
} from 'lucide-react'
import {
  MeetingType,
  LocationType,
  MeetingParticipant,
  AgendaItem,
  BusinessIssue,
  CreateMeetingMinuteRequest
} from '@/types/meeting-minutes'

export default function CreateMeetingMinutePage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
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

  // 자동완성용 데이터
  const [businesses, setBusinesses] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
    // 현재 날짜/시간을 기본값으로 설정
    const now = new Date()
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setMeetingDate(localDateTime)

    // 사업장 목록 및 담당자 목록 로드
    loadBusinessesAndEmployees()
  }, [])

  const loadBusinessesAndEmployees = async () => {
    try {
      // 사업장 목록 로드
      const businessRes = await fetch('/api/business-list?includeAll=true')
      const businessData = await businessRes.json()
      if (businessData.success && businessData.data) {
        // API returns { success: true, data: { businesses: [...], count, metadata } }
        setBusinesses(Array.isArray(businessData.data.businesses) ? businessData.data.businesses : [])
      } else {
        setBusinesses([])
      }

      // 담당자 목록 로드
      const employeeRes = await fetch('/api/users/employees')
      const employeeData = await employeeRes.json()
      if (employeeData.success && employeeData.data && employeeData.data.employees) {
        setEmployees(Array.isArray(employeeData.data.employees) ? employeeData.data.employees : [])
      } else {
        setEmployees([])
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Failed to load data:', error)
      setBusinesses([])
      setEmployees([])
    }
  }

  const handleAddParticipant = () => {
    setParticipants([
      ...participants,
      {
        id: crypto.randomUUID(),
        name: '',
        role: '',
        employee_id: undefined,  // 명시적으로 undefined 설정 (리렌더링 시 상태 안정성 확보)
        attended: true,
        is_internal: false  // 기본값: 외부 참석자
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

  const handleSave = async (status: 'draft' | 'completed' = 'draft') => {
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

      const data: CreateMeetingMinuteRequest = {
        title,
        meeting_date: new Date(meetingDate).toISOString(),
        meeting_type: meetingType,
        organizer_id: '', // 서버에서 현재 사용자로 설정됨
        participants,
        location,
        location_type: locationType,
        agenda,
        content: {
          summary,
          discussions: [], // 빈 배열로 유지 (하위 호환성)
          business_issues: businessIssues
        },
        attachments: [],
        status,
        visibility: 'team'
      }

      const response = await fetch('/api/meeting-minutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (result.success) {
        alert(`회의록이 ${status === 'draft' ? '임시 저장' : '저장'}되었습니다.`)
        router.push(`/admin/meeting-minutes/${result.data.id}`)
      } else {
        alert(`저장 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Save error:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (confirm('작성 중인 내용이 저장되지 않습니다. 취소하시겠습니까?')) {
      router.push('/admin/meeting-minutes')
    }
  }

  if (!mounted) {
    return (
      <AdminLayout title="회의록 작성">
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      title="회의록 작성"
      description="새로운 회의록을 작성합니다"
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
        {/* 2열 그리드 레이아웃 */}
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
                    placeholder="예: 2024년 1월 주간 정기 회의"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
              {/* 회의 날짜 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  회의 날짜 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CalendarIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="datetime-local"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 회의 유형 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  회의 유형
                </label>
                <select
                  value={meetingType}
                  onChange={(e) => setMeetingType(e.target.value as MeetingType)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="정기회의">정기회의</option>
                  <option value="임시회의">임시회의</option>
                  <option value="프로젝트회의">프로젝트회의</option>
                  <option value="고객미팅">고객미팅</option>
                </select>
              </div>
            </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* 장소 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      장소
                    </label>
                    <div className="relative">
                      <MapPin className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="예: 본사 회의실 A"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 장소 유형 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      장소 유형
                    </label>
                    <select
                      value={locationType}
                      onChange={(e) => setLocationType(e.target.value as LocationType)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="offline">오프라인</option>
                      <option value="online">온라인</option>
                      <option value="hybrid">하이브리드</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 미해결 반복 이슈 (정기회의인 경우에만 표시) */}
            {meetingType === '정기회의' && (
              <RecurringIssuesPanel
                onAddIssue={(issue) => {
                  // 이슈를 businessIssues 배열에 추가
                  setBusinessIssues([...businessIssues, issue])
                }}
                addedIssueIds={businessIssues.map(issue => issue.id)}
              />
            )}

            {/* 참석자 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900">참석자</h2>
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
                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      {/* 이름 자동완성 입력 */}
                      <div className="flex-1 min-w-0">
                        <AutocompleteSelectInput
                          value={participant.employee_id || ''}
                          onChange={(selectedId, selectedName) => {
                            const selectedEmployee = employees.find(e => e.id === selectedId)

                            if (selectedEmployee) {
                              // 내부 직원 선택
                              const updated = [...participants]
                              updated[index] = {
                                ...updated[index],
                                name: selectedEmployee.name,
                                role: selectedEmployee.position || selectedEmployee.department || '',
                                employee_id: selectedEmployee.id,
                                is_internal: true
                              }
                              setParticipants(updated)
                            } else {
                              // 수동 입력 (외부 참석자) - employee_id 필드를 삭제
                              const updated = [...participants]
                              const { employee_id, ...restParticipant } = updated[index]
                              updated[index] = {
                                ...restParticipant,
                                name: selectedName,
                                role: '',
                                is_internal: false
                              }
                              setParticipants(updated)
                            }
                          }}
                          options={employees.map(e => ({
                            id: e.id,
                            name: `${e.name} (${e.department || ''} ${e.position || ''})`.trim()
                          }))}
                          placeholder="이름..."
                          allowCustomValue={true}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* 직책/구분 배지 - 컴팩트 */}
                      {participant.name && (
                        <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                          participant.is_internal
                            ? 'text-blue-600 bg-blue-50'
                            : 'text-gray-600 bg-gray-200'
                        }`}>
                          {participant.is_internal ? '내부' : '외부'}
                        </span>
                      )}

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
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>추가</span>
                </button>
              </div>

              {agenda.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  안건을 추가해주세요
                </div>
              ) : (
                <div className="space-y-3">
                  {agenda.map((item, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateAgenda(index, 'title', e.target.value)}
                            placeholder="안건 제목"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <textarea
                            value={item.description}
                            onChange={(e) => handleUpdateAgenda(index, 'description', e.target.value)}
                            placeholder="안건 설명"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />

                          {/* 데드라인 및 담당자 */}
                          <div className="grid grid-cols-2 gap-3">
                            {/* 데드라인 */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                데드라인
                              </label>
                              <input
                                type="date"
                                value={item.deadline || ''}
                                onChange={(e) => handleUpdateAgenda(index, 'deadline', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>

                            {/* 담당자 */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                담당자
                              </label>
                              <AutocompleteSelectInput
                                value={item.assignee_id || ''}
                                onChange={(id, name) => {
                                  const updated = [...agenda]
                                  updated[index] = {
                                    ...updated[index],
                                    assignee_id: id,
                                    assignee_name: name
                                  }
                                  setAgenda(updated)
                                }}
                                options={employees.map(e => ({ id: e.id, name: e.name }))}
                                placeholder="담당자 선택"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveAgenda(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

          {/* 오른쪽 열: 부가 정보 */}
          <div className="space-y-6">
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
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>추가</span>
                </button>
              </div>

              {businessIssues.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  사업장별 이슈를 추가해주세요
                </div>
              ) : (
                <div className="space-y-3">
                  {businessIssues.map((issue, index) => (
                    <div key={index} className="space-y-3 p-3 bg-gray-50 rounded-lg">
                      {/* 사업장 선택 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">사업장</label>
                        {!issue.business_id && issue.business_name ? (
                          // business_id가 없지만 business_name이 있는 경우 (반복 이슈에서 가져온 경우)
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
                          // 일반적인 경우 (AutocompleteSelectInput 사용)
                          <AutocompleteSelectInput
                            value={issue.business_id || ''}
                            onChange={(id, name) => {
                              const updated = [...businessIssues]
                              updated[index] = {
                                ...updated[index],
                                business_id: id,
                                business_name: name
                              }
                              setBusinessIssues(updated)
                            }}
                            options={businesses.map(b => ({ id: b.id, name: b.business_name }))}
                            placeholder="사업장을 검색하세요"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            allowCustomValue={true}
                          />
                        )}
                      </div>

                      {/* 이슈 설명 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">이슈 내용</label>
                        <input
                          type="text"
                          value={issue.issue_description}
                          onChange={(e) => handleUpdateBusinessIssue(index, 'issue_description', e.target.value)}
                          placeholder="사업장 이슈 내용"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* 담당자 선택 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">담당자</label>
                        {!issue.assignee_id && issue.assignee_name ? (
                          // assignee_id가 없지만 assignee_name이 있는 경우 (반복 이슈에서 가져온 경우)
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
                          // 일반적인 경우 (AutocompleteSelectInput 사용)
                          <AutocompleteSelectInput
                            value={issue.assignee_id || ''}
                            onChange={(id, name) => {
                              const updated = [...businessIssues]
                              updated[index] = {
                                ...updated[index],
                                assignee_id: id,
                                assignee_name: name
                              }
                              setBusinessIssues(updated)
                            }}
                            options={employees.map(e => ({ id: e.id, name: e.name }))}
                            placeholder="담당자를 검색하세요"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            allowCustomValue={true}
                          />
                        )}
                      </div>

                      {/* 완료 여부 및 삭제 버튼 */}
                      <div className="flex items-center justify-between pt-2">
                        <button
                          onClick={() => handleToggleComplete(index)}
                          className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                            issue.is_completed
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {issue.is_completed ? '✓ 완료' : '미완료'}
                        </button>

                        <button
                          onClick={() => handleRemoveBusinessIssue(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
        </div>

        {/* 저장 버튼 (하단) - 전체 폭 */}
        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={() => handleSave('completed')}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중...' : '완료'}
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
