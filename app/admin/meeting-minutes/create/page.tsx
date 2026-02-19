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
  const [isDirty, setIsDirty] = useState(false)

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
  const [activeEmployees, setActiveEmployees] = useState<any[]>([]) // 활성 내부 직원 (게스트 제외)
  const [externalParticipants, setExternalParticipants] = useState<Array<{id: string, name: string, role: string, attended: boolean}>>([]) // 외부 참석자
  const [departments, setDepartments] = useState<string[]>([]) // 부서 목록 (localStorage)

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

    // localStorage에서 부서 목록 로드
    try {
      const saved = localStorage.getItem('meeting_departments')
      if (saved) setDepartments(JSON.parse(saved))
    } catch {}
  }, [])

  // 폼 변경 감지: 사용자가 내용을 입력하면 isDirty = true
  // meetingDate는 자동 초기화되므로 제외
  useEffect(() => {
    if (!mounted) return
    const hasContent =
      title.trim() !== '' ||
      participants.length > 0 ||
      externalParticipants.length > 0 ||
      agenda.length > 0 ||
      summary.trim() !== '' ||
      businessIssues.length > 0 ||
      location.trim() !== '' ||
      meetingType !== '정기회의' ||
      locationType !== 'offline'
    setIsDirty(hasContent)
  }, [mounted, title, participants, externalParticipants, agenda, summary, businessIssues, location, meetingType, locationType])

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
        const allEmployees = Array.isArray(employeeData.data.employees) ? employeeData.data.employees : []
        setEmployees(allEmployees)

        // 활성 내부 직원만 필터링 (게스트 제외: permission_level !== 0)
        const activeInternalEmployees = allEmployees.filter((emp: any) =>
          emp.is_active === true && (emp.permission_level !== 0)
        )
        setActiveEmployees(activeInternalEmployees)
      } else {
        setEmployees([])
        setActiveEmployees([])
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Failed to load data:', error)
      setBusinesses([])
      setEmployees([])
    }
  }

  // 내부 직원 참석자 토글
  const toggleInternalParticipant = (employeeId: string) => {
    const employee = activeEmployees.find(e => e.id === employeeId)
    if (!employee) return

    const existingIndex = participants.findIndex(p => p.employee_id === employeeId)

    if (existingIndex !== -1) {
      // 이미 선택된 경우 → 제거
      const updated = participants.filter((_, idx) => idx !== existingIndex)
      setParticipants(updated)
    } else {
      // 새로 선택 → 추가
      setParticipants([
        ...participants,
        {
          id: crypto.randomUUID(),
          name: employee.name,
          role: employee.position || employee.department || '',
          employee_id: employee.id,
          attended: true,
          is_internal: true
        }
      ])
    }
  }

  // 외부 참석자 추가
  const handleAddExternalParticipant = () => {
    setExternalParticipants([
      ...externalParticipants,
      {
        id: crypto.randomUUID(),
        name: '',
        role: '',
        attended: true
      }
    ])
  }

  // 외부 참석자 제거
  const handleRemoveExternalParticipant = (index: number) => {
    setExternalParticipants(externalParticipants.filter((_, idx) => idx !== index))
  }

  // 외부 참석자 업데이트
  const handleUpdateExternalParticipant = (index: number, field: 'name' | 'role' | 'attended', value: any) => {
    const updated = [...externalParticipants]
    updated[index] = { ...updated[index], [field]: value }
    setExternalParticipants(updated)
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

  const handleAddAgenda = (department?: string) => {
    setAgenda([
      ...agenda,
      {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        department: department || undefined,
        deadline: '',
        progress: 0 as const,
        assignee_id: undefined,
        assignee_name: undefined,
        assignee_ids: [],
        assignees: []
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

      // 내부 직원 참석자 + 외부 참석자 병합
      const allParticipants = [
        ...participants, // 내부 직원 참석자 (이미 is_internal: true, employee_id 있음)
        ...externalParticipants.map(ext => ({
          id: ext.id,
          name: ext.name,
          role: ext.role,
          attended: ext.attended,
          is_internal: false,
          employee_id: undefined
        }))
      ].filter(p => p.name && p.name.trim()) // 이름이 있는 참석자만 포함

      const data: CreateMeetingMinuteRequest = {
        title,
        meeting_date: new Date(meetingDate).toISOString(),
        meeting_type: meetingType,
        organizer_id: '', // 서버에서 현재 사용자로 설정됨
        participants: allParticipants,
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
        if (status === 'draft') {
          alert('회의록이 임시 저장되었습니다.')
          setIsDirty(false)
          // 임시저장 시 URL을 새로 생성된 회의록 편집 페이지로 교체 (페이지 이동 없음)
          router.replace(`/admin/meeting-minutes/${result.data.id}/edit`)
        } else {
          alert('회의록이 저장되었습니다.')
          router.push(`/admin/meeting-minutes/${result.data.id}`)
        }
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
    if (!isDirty) {
      router.push('/admin/meeting-minutes')
    } else if (confirm('작성 중인 내용이 저장되지 않습니다. 취소하시겠습니까?')) {
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
            <span className="hidden sm:inline">{isDirty ? '취소' : '뒤로가기'}</span>
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
              <h2 className="text-sm font-semibold text-gray-900 mb-3">참석자</h2>

              {/* 내부 직원 섹션 */}
              <div className="mb-4">
                <h3 className="text-xs font-medium text-gray-700 mb-2">내부 직원</h3>
                {activeEmployees.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-xs">
                    활성 직원이 없습니다
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {activeEmployees.map((employee) => {
                      const isSelected = participants.some(p => p.employee_id === employee.id)
                      const participant = participants.find(p => p.employee_id === employee.id)

                      return (
                        <div
                          key={employee.id}
                          className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                            isSelected ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleInternalParticipant(employee.id)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {employee.name}
                              </div>
                              {(employee.department || employee.position) && (
                                <div className="text-xs text-gray-500 truncate">
                                  {[employee.department, employee.position].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 외부 참석자 섹션 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-gray-700">외부 참석자</h3>
                  <button
                    onClick={handleAddExternalParticipant}
                    className="flex items-center gap-1 px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>추가</span>
                  </button>
                </div>

                {externalParticipants.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-xs">
                    외부 참석자를 추가해주세요
                  </div>
                ) : (
                  <div className="space-y-2">
                    {externalParticipants.map((ext, index) => (
                      <div key={ext.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={ext.name}
                            onChange={(e) => handleUpdateExternalParticipant(index, 'name', e.target.value)}
                            placeholder="이름"
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={ext.role}
                            onChange={(e) => handleUpdateExternalParticipant(index, 'role', e.target.value)}
                            placeholder="소속/직책"
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleUpdateExternalParticipant(index, 'attended', true)}
                            className={`px-2 py-0.5 text-xs rounded transition-colors ${
                              ext.attended
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            참석
                          </button>
                          <button
                            onClick={() => handleUpdateExternalParticipant(index, 'attended', false)}
                            className={`px-2 py-0.5 text-xs rounded transition-colors ${
                              !ext.attended
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            불참
                          </button>
                        </div>

                        <button
                          onClick={() => handleRemoveExternalParticipant(index)}
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
            </div>

            {/* 안건 - 부서별 섹션 */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 mb-3">안건</h2>

              {/* 부서가 없으면 공통 섹션 하나, 있으면 부서별 섹션 */}
              {(() => {
                const sections = departments.length > 0
                  ? [...departments, undefined] // undefined = 공통(부서 미지정), 마지막에 위치
                  : [undefined]

                return (
                  <div className="space-y-4">
                    {sections.map((dept) => {
                      const sectionAgenda = agenda.filter(item =>
                        dept === undefined
                          ? !item.department
                          : item.department === dept
                      )
                      const sectionLabel = dept || '부서 미지정'
                      const isCommon = dept === undefined

                      return (
                        <div key={dept || '__common__'} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* 섹션 헤더 */}
                          <div className={`flex items-center justify-between px-3 py-2 ${
                            isCommon
                              ? 'bg-gray-50 border-b border-gray-200'
                              : 'bg-indigo-50 border-b border-indigo-100'
                          }`}>
                            <span className={`text-sm font-medium ${
                              isCommon ? 'text-gray-700' : 'text-indigo-700'
                            }`}>
                              {sectionLabel}
                            </span>
                            <button
                              onClick={() => handleAddAgenda(dept)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                isCommon
                                  ? 'bg-gray-600 text-white hover:bg-gray-700'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              안건 추가
                            </button>
                          </div>

                          {/* 섹션 안건 목록 */}
                          <div className="p-3">
                            {sectionAgenda.length === 0 ? (
                              <div className="text-center py-4 text-gray-400 text-xs">
                                안건을 추가해주세요
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {sectionAgenda.map((item) => {
                                  const index = agenda.indexOf(item)
                                  const sectionIndex = sectionAgenda.indexOf(item)
                                  return (
                                    <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                                      <div className="flex items-start gap-2 mb-2">
                                        <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                                          {sectionIndex + 1}
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
                                            placeholder="안건 설명 (우측 하단을 드래그하여 크기 조정 가능)"
                                            rows={4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                                            style={{ minHeight: '75px' }}
                                          />

                                          {/* 데드라인 + 진행률 + 담당자 */}
                                          <div className="grid grid-cols-3 gap-3">
                                            <div>
                                              <label className="block text-xs font-medium text-gray-700 mb-1">데드라인</label>
                                              <input
                                                type="date"
                                                value={item.deadline || ''}
                                                onChange={(e) => handleUpdateAgenda(index, 'deadline', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-700 mb-1">진행률</label>
                                              <select
                                                value={item.progress ?? 0}
                                                onChange={(e) => handleUpdateAgenda(index, 'progress', Number(e.target.value) as 0 | 25 | 50 | 75 | 100)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                              >
                                                <option value={0}>0% 미착수</option>
                                                <option value={25}>25% 시작</option>
                                                <option value={50}>50% 진행중</option>
                                                <option value={75}>75% 마무리</option>
                                                <option value={100}>100% 완료</option>
                                              </select>
                                              <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                  className={`h-full rounded-full transition-all duration-300 ${
                                                    (item.progress ?? 0) === 0 ? 'bg-gray-400' :
                                                    (item.progress ?? 0) <= 25 ? 'bg-blue-500' :
                                                    (item.progress ?? 0) <= 50 ? 'bg-yellow-500' :
                                                    (item.progress ?? 0) <= 75 ? 'bg-orange-500' :
                                                    'bg-green-500'
                                                  }`}
                                                  style={{ width: `${item.progress ?? 0}%` }}
                                                />
                                              </div>
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-700 mb-1">담당자 (여러명 추가 가능)</label>
                                              <AutocompleteSelectInput
                                                value=""
                                                onChange={(selectedId, _selectedName) => {
                                                  if (!selectedId) return
                                                  const selectedEmployee = activeEmployees.find(e => e.id === selectedId)
                                                  if (!selectedEmployee) return
                                                  const currentIds = item.assignee_ids || []
                                                  if (currentIds.includes(selectedId)) return
                                                  const updated = [...agenda]
                                                  updated[index] = {
                                                    ...updated[index],
                                                    assignee_ids: [...currentIds, selectedId],
                                                    assignees: [...(item.assignees || []), { id: selectedId, name: selectedEmployee.name }]
                                                  }
                                                  setAgenda(updated)
                                                }}
                                                options={activeEmployees
                                                  .filter(e => !(item.assignee_ids || []).includes(e.id))
                                                  .map(e => ({
                                                    id: e.id,
                                                    name: `${e.name}${e.department || e.position ? ` (${[e.department, e.position].filter(Boolean).join(' · ')})` : ''}`
                                                  }))}
                                                placeholder="담당자 입력하여 추가..."
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                              />
                                            </div>
                                          </div>

                                          {/* 선택된 담당자 배지 */}
                                          {(item.assignees && item.assignees.length > 0) && (
                                            <div className="flex flex-wrap gap-1.5">
                                              {item.assignees.map(assignee => (
                                                <span
                                                  key={assignee.id}
                                                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                                                >
                                                  {assignee.name}
                                                  <button
                                                    onClick={() => {
                                                      const updated = [...agenda]
                                                      updated[index] = {
                                                        ...updated[index],
                                                        assignee_ids: (updated[index].assignee_ids || []).filter(id => id !== assignee.id),
                                                        assignees: (updated[index].assignees || []).filter(a => a.id !== assignee.id)
                                                      }
                                                      setAgenda(updated)
                                                    }}
                                                    className="hover:text-blue-900"
                                                  >
                                                    ×
                                                  </button>
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <button
                                          onClick={() => handleRemoveAgenda(index)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
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
                        <textarea
                          value={issue.issue_description}
                          onChange={(e) => handleUpdateBusinessIssue(index, 'issue_description', e.target.value)}
                          placeholder="사업장 이슈 내용 (우측 하단을 드래그하여 크기 조정 가능)"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                          style={{ minHeight: '75px' }}
                        />
                      </div>

                      {/* 담당자 선택 (다중 선택) */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">담당자 (여러명 추가 가능)</label>
                        <AutocompleteSelectInput
                          value=""
                          onChange={(selectedId, selectedName) => {
                            if (!selectedId) return // 빈 선택 무시

                            const selectedEmployee = activeEmployees.find(e => e.id === selectedId)
                            if (!selectedEmployee) return

                            // 이미 선택된 담당자인지 확인
                            const currentIds = issue.assignee_ids || []
                            if (currentIds.includes(selectedId)) {
                              return // 이미 추가된 담당자는 무시
                            }

                            // 담당자 추가
                            const updated = [...businessIssues]
                            updated[index] = {
                              ...updated[index],
                              assignee_ids: [...currentIds, selectedId],
                              assignees: [...(issue.assignees || []), { id: selectedId, name: selectedEmployee.name }]
                            }
                            setBusinessIssues(updated)
                          }}
                          options={activeEmployees
                            .filter(e => !(issue.assignee_ids || []).includes(e.id)) // 이미 선택된 담당자 제외
                            .map(e => ({
                              id: e.id,
                              name: `${e.name}${e.department || e.position ? ` (${[e.department, e.position].filter(Boolean).join(' · ')})` : ''}`
                            }))}
                          placeholder="담당자 입력하여 추가..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* 선택된 담당자 배지 표시 */}
                      {(issue.assignees && issue.assignees.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {issue.assignees.map(assignee => (
                            <span
                              key={assignee.id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                            >
                              {assignee.name}
                              <button
                                onClick={() => {
                                  const updated = [...businessIssues]
                                  updated[index] = {
                                    ...updated[index],
                                    assignee_ids: (issue.assignee_ids || []).filter(id => id !== assignee.id),
                                    assignees: (issue.assignees || []).filter(a => a.id !== assignee.id)
                                  }
                                  setBusinessIssues(updated)
                                }}
                                className="hover:text-blue-900"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

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
            {isDirty ? '취소' : '뒤로가기'}
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
