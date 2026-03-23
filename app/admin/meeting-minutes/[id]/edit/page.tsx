// ============================================
// 회의록 편집 페이지
// ============================================
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  CheckCircle2,
  Lock
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
import { TokenManager } from '@/lib/api-client'
import { useMeetingPresence } from '@/hooks/useMeetingPresence'

export default function EditMeetingMinutePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refresh = searchParams.get('refresh')  // 타임스탬프 파라미터 감지
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const dataLoadedRef = useRef(false)  // 데이터 로드 완료 여부

  // 현재 로그인 사용자 정보 (Presence용)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')

  // 섹션별 변경 추적
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set())
  const markDirty = useCallback((sectionId: string) => {
    setDirtySections(prev => new Set([...prev, sectionId]))
  }, [])

  // Presence: 동시 편집자 감지 및 섹션 잠금
  const {
    otherEditors,
    canLockSection,
    getSectionLocker,
    lockSection,
    unlockSection,
    isConnected: presenceConnected,
  } = useMeetingPresence({
    meetingId: params.id,
    currentUserId,
    currentUserName,
    enabled: !!currentUserId,
  })

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
  const [activeEmployees, setActiveEmployees] = useState<any[]>([]) // 활성 내부 직원 (게스트 제외)
  const [externalParticipants, setExternalParticipants] = useState<Array<{id: string, name: string, role: string, attended: boolean}>>([]) // 외부 참석자
  const [departments, setDepartments] = useState<string[]>([]) // 부서 목록 (localStorage)

  // JWT 토큰에서 현재 사용자 정보 추출
  useEffect(() => {
    const token = TokenManager.getToken()
    if (!token) return
    try {
      // URL-safe Base64 → UTF-8 디코딩 (한글 이름 깨짐 방지)
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const jsonStr = decodeURIComponent(
        atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      )
      const payload = JSON.parse(jsonStr)
      setCurrentUserId(payload.userId || payload.id || '')
      setCurrentUserName(payload.name || payload.email || '알 수 없음')
    } catch {
      // 토큰 파싱 실패 시 무시
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    // API에서 부서 목록 로드
    fetch('/api/meeting-departments', { cache: 'no-store' })
      .then(r => r.json())
      .then(result => { if (result.success) setDepartments(result.data) })
      .catch(() => {})
    // 먼저 사업장과 직원 목록을 로드한 후, 회의록을 로드
    const initializeData = async () => {
      dataLoadedRef.current = false  // 재로드 시 플래그 리셋
      await loadBusinessesAndEmployees()
      await loadMeetingMinute()
    }
    initializeData()
  }, [refresh])  // refresh 파라미터 변경 시 재실행

  // 폼 변경 감지: dirtySections이 비어있지 않으면 isDirty = true
  useEffect(() => {
    if (!dataLoadedRef.current) return
    setIsDirty(dirtySections.size > 0)
  }, [dirtySections])

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
        const allEmployees = Array.isArray(employeeData.data.employees) ? employeeData.data.employees : []
        setEmployees(allEmployees)

        // 활성 내부 직원만 필터링 (게스트 제외: permission_level !== 0)
        const activeInternalEmployees = allEmployees.filter((emp: any) =>
          emp.is_active === true && (emp.permission_level !== 0)
        )
        setActiveEmployees(activeInternalEmployees)

        console.log('👥 직원 목록 로드됨:', allEmployees.length, '명')
        console.log('👥 활성 직원:', activeInternalEmployees.length, '명')
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

        // 참석자를 내부/외부로 분류
        const internalParts: MeetingParticipant[] = []
        const externalParts: Array<{id: string, name: string, role: string, attended: boolean}> = []

        participantsData.forEach(p => {
          if (p.is_internal && p.employee_id) {
            internalParts.push(p)
          } else {
            externalParts.push({
              id: p.id,
              name: p.name,
              role: p.role,
              attended: p.attended
            })
          }
        })

        setParticipants(internalParts)
        setExternalParticipants(externalParts)

        // 안건 데이터 마이그레이션: 단일 담당자 → 다중 담당자
        const migratedAgenda = agendaData.map(item => {
          // 이미 다중 담당자 형식이면 그대로 사용
          if (item.assignees && Array.isArray(item.assignees)) {
            return item
          }
          // 단일 담당자 형식이면 배열로 변환
          if (item.assignee_id && item.assignee_name) {
            return {
              ...item,
              assignee_ids: [item.assignee_id],
              assignees: [{ id: item.assignee_id, name: item.assignee_name }]
            }
          }
          return item
        })

        // 사업장별 이슈 데이터 마이그레이션: 단일 담당자 → 다중 담당자
        const migratedBusinessIssues = businessIssuesData.map(issue => {
          // 이미 다중 담당자 형식이면 그대로 사용
          if (issue.assignees && Array.isArray(issue.assignees)) {
            return issue
          }
          // 단일 담당자 형식이면 배열로 변환
          if (issue.assignee_id && issue.assignee_name) {
            return {
              ...issue,
              assignee_ids: [issue.assignee_id],
              assignees: [{ id: issue.assignee_id, name: issue.assignee_name }]
            }
          }
          return issue
        })

        setAgenda(migratedAgenda)
        setSummary(minute.content?.summary || '')
        setBusinessIssues(migratedBusinessIssues)
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
      // 로드 완료 후 플래그 활성화
      // setTimeout(0): 현재 큐에 쌓인 모든 state 업데이트가 flush된 후
      // isDirty를 false로 고정하고 dataLoadedRef를 활성화
      setTimeout(() => {
        setIsDirty(false)
        dataLoadedRef.current = true
      }, 0)
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
      // 새로 추가
      const newParticipant: MeetingParticipant = {
        id: crypto.randomUUID(),
        name: employee.name,
        role: employee.department || employee.position || '',
        employee_id: employeeId,
        attended: true,
        is_internal: true
      }
      setParticipants([...participants, newParticipant])
    }
    markDirty('participants')
  }

  // 외부 참석자 관리
  const addExternalParticipant = () => {
    setExternalParticipants([
      ...externalParticipants,
      {
        id: crypto.randomUUID(),
        name: '',
        role: '',
        attended: true
      }
    ])
    markDirty('participants')
  }

  const removeExternalParticipant = (index: number) => {
    setExternalParticipants(externalParticipants.filter((_, i) => i !== index))
    markDirty('participants')
  }

  const updateExternalParticipant = (index: number, field: 'name' | 'role' | 'attended', value: string | boolean) => {
    const updated = [...externalParticipants]
    updated[index] = { ...updated[index], [field]: value }
    setExternalParticipants(updated)
    markDirty('participants')
  }

  // 안건 관리
  const handleAddAgenda = (department?: string) => {
    const newItem: AgendaItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      department: department,
      deadline: '',
      progress: 0 as const,
      assignee_id: undefined,
      assignee_name: undefined
    }
    setAgenda([...agenda, newItem])
    markDirty(`agenda-add-${newItem.id}`)
  }

  const handleRemoveAgenda = (index: number) => {
    const item = agenda[index]
    setAgenda(agenda.filter((_, i) => i !== index))
    // 삭제된 항목은 dirtySections에서 제거 후 별도 표시
    setDirtySections(prev => {
      const next = new Set(prev)
      next.delete(`agenda-${item.id}`)
      next.add(`agenda-delete-${item.id}`)
      return next
    })
  }

  const handleUpdateAgenda = (index: number, field: keyof AgendaItem, value: any) => {
    const updated = [...agenda]
    updated[index] = { ...updated[index], [field]: value }
    setAgenda(updated)
    markDirty(`agenda-${agenda[index].id}`)
  }

  // 사업장별 이슈 관리
  const handleAddBusinessIssue = () => {
    const newIssue: BusinessIssue = {
      id: crypto.randomUUID(),
      business_id: '',
      business_name: '',
      issue_description: '',
      assignee_id: '',
      assignee_name: '',
      is_completed: false
    }
    setBusinessIssues([...businessIssues, newIssue])
    markDirty(`business-${newIssue.id}`)
  }

  const handleRemoveBusinessIssue = (index: number) => {
    const issue = businessIssues[index]
    setBusinessIssues(businessIssues.filter((_, i) => i !== index))
    setDirtySections(prev => {
      const next = new Set(prev)
      next.delete(`business-${issue.id}`)
      next.add(`business-delete-${issue.id}`)
      return next
    })
  }

  const handleUpdateBusinessIssue = (index: number, field: keyof BusinessIssue, value: any) => {
    const updated = [...businessIssues]
    updated[index] = { ...updated[index], [field]: value }
    setBusinessIssues(updated)
    markDirty(`business-${businessIssues[index].id}`)
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
    markDirty(`business-${businessIssues[index].id}`)
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

      const sectionUrl = `/api/meeting-minutes/${params.id}/sections`

      // 내부 + 외부 참석자 병합 (participants 섹션용)
      const allParticipants = [
        ...participants,
        ...externalParticipants.map(ext => ({
          id: ext.id,
          name: ext.name,
          role: ext.role,
          attended: ext.attended,
          employee_id: undefined,
          is_internal: false
        }))
      ]

      // 변경된 섹션만 수집해서 병렬 PATCH
      const patches: Promise<Response>[] = []

      const patch = (body: object) =>
        fetch(sectionUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        })

      // meta 섹션 (제목, 날짜, 유형, 장소) — 항상 포함 (필수 필드 포함)
      patches.push(patch({
        section: 'meta',
        data: {
          title,
          meeting_date: new Date(meetingDate).toISOString(),
          meeting_type: meetingType,
          location,
          location_type: locationType,
        }
      }))

      // participants: 변경됐거나 완료 저장 시 항상 전송
      if (dirtySections.has('participants') || newStatus === 'completed') {
        patches.push(patch({ section: 'participants', data: { participants: allParticipants } }))
      }

      // summary: 변경됐거나 완료 저장 시
      if (dirtySections.has('summary') || newStatus === 'completed') {
        patches.push(patch({ section: 'summary', data: { summary } }))
      }

      // 안건 항목: 변경된 것만
      for (const item of agenda) {
        if (dirtySections.has(`agenda-${item.id}`)) {
          patches.push(patch({ section: 'agenda', itemId: item.id, data: item }))
        }
      }
      // 새로 추가된 안건 (add)
      for (const item of agenda) {
        if (dirtySections.has(`agenda-add-${item.id}`)) {
          patches.push(patch({ section: 'agenda-add', data: item }))
        }
      }
      // 삭제된 안건
      for (const sectionId of dirtySections) {
        if (sectionId.startsWith('agenda-delete-')) {
          const itemId = sectionId.replace('agenda-delete-', '')
          patches.push(patch({ section: 'agenda-delete', itemId }))
        }
      }

      // 사업장 이슈: 변경된 것만
      for (const issue of businessIssues) {
        if (dirtySections.has(`business-${issue.id}`)) {
          patches.push(patch({ section: 'business', itemId: issue.id, data: issue }))
        }
      }
      // 삭제된 이슈
      for (const sectionId of dirtySections) {
        if (sectionId.startsWith('business-delete-')) {
          const itemId = sectionId.replace('business-delete-', '')
          patches.push(patch({ section: 'business-delete', itemId }))
        }
      }

      // status 변경
      if (newStatus && newStatus !== status) {
        patches.push(patch({ section: 'status', data: { status: newStatus } }))
      }

      // 완료 저장 시 모든 섹션 강제 포함 (최종 상태 보장)
      if (newStatus === 'completed') {
        // 위에서 participants, summary 이미 포함됨
        // agenda 전체도 포함 (변경 여부 무관)
        for (const item of agenda) {
          if (!dirtySections.has(`agenda-${item.id}`)) {
            patches.push(patch({ section: 'agenda', itemId: item.id, data: item }))
          }
        }
        // 사업장 이슈 전체 포함
        for (const issue of businessIssues) {
          if (!dirtySections.has(`business-${issue.id}`)) {
            patches.push(patch({ section: 'business', itemId: issue.id, data: issue }))
          }
        }
      }

      // 병렬 전송
      const results = await Promise.all(patches)
      const responses = await Promise.all(results.map(r => r.json()))
      const failed = responses.filter(r => !r.success)

      if (failed.length > 0) {
        console.error('[MEETING-MINUTE] Some patches failed:', failed)
        alert(`저장 중 일부 오류가 발생했습니다: ${failed[0].error}`)
        return
      }

      setDirtySections(new Set())

      if (newStatus === 'draft' || !newStatus) {
        alert('임시 저장되었습니다.')
        setIsDirty(false)
      } else {
        alert('회의록이 수정되었습니다.')
        const timestamp = Date.now()
        router.push(`/admin/meeting-minutes/${params.id}?updated=${timestamp}`)
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
      router.push(`/admin/meeting-minutes/${params.id}`)
    } else if (confirm('수정 중인 내용이 저장되지 않습니다. 취소하시겠습니까?')) {
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
        <div className="flex items-center gap-2">
          {/* 동시 편집자 아바타 */}
          {otherEditors.length > 0 && (
            <div className="flex items-center gap-1 mr-2">
              <span className="text-xs text-gray-500 hidden sm:inline">편집 중:</span>
              <div className="flex -space-x-1">
                {otherEditors.map(editor => (
                  <div
                    key={editor.userId}
                    title={`${editor.userName} 편집 중`}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium border-2 border-white"
                    style={{ backgroundColor: editor.color }}
                  >
                    {editor.userName.slice(0, 1)}
                  </div>
                ))}
              </div>
            </div>
          )}
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
      <div className="w-full">
        {/* 2열 그리드 레이아웃 - create 페이지와 동일 */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* 왼쪽 열: 핵심 회의 정보 */}
          <div className="space-y-4">
            {/* 기본 정보 */}
            {(() => {
              const metaLocker = getSectionLocker('meta')
              const metaLocked = !!metaLocker
              return (
            <div
              className={`bg-white p-4 rounded-lg shadow-sm border transition-colors ${metaLocked ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
              onFocus={() => { if (!metaLocked) lockSection('meta') }}
              onBlur={() => unlockSection('meta')}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">기본 정보</h2>
                {metaLocked && (
                  <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                    <Lock className="w-3 h-3" />
                    {metaLocker.userName} 편집 중
                  </span>
                )}
              </div>

              <fieldset disabled={metaLocked} className="space-y-3">
                {/* 제목 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    회의록 제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); markDirty('meta') }}
                    placeholder="예: 2024년 1월 주간 정기 회의"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                    onChange={(e) => { setMeetingDate(e.target.value); markDirty('meta') }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                  onChange={(e) => { setMeetingType(e.target.value as MeetingType); markDirty('meta') }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                        onChange={(e) => { setLocation(e.target.value); markDirty('meta') }}
                        placeholder="예: 본사 회의실 A"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                      onChange={(e) => { setLocationType(e.target.value as LocationType); markDirty('meta') }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="offline">오프라인</option>
                      <option value="online">온라인</option>
                      <option value="hybrid">하이브리드</option>
                    </select>
                  </div>
                </div>
              </fieldset>
            </div>
              )
            })()}

            {/* 참석자 */}
            {(() => {
              const participantsLocker = getSectionLocker('participants')
              const participantsLocked = !!participantsLocker
              return (
            <div
              className={`bg-white p-4 rounded-lg shadow-sm border transition-colors ${participantsLocked ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
              onFocus={() => { if (!participantsLocked) lockSection('participants') }}
              onBlur={() => unlockSection('participants')}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">참석자</h2>
                {participantsLocked && (
                  <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                    <Lock className="w-3 h-3" />
                    {participantsLocker.userName} 편집 중
                  </span>
                )}
              </div>
              <fieldset disabled={participantsLocked}>

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
                    onClick={addExternalParticipant}
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
                      <div key={ext.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <input
                          type="text"
                          value={ext.name}
                          onChange={(e) => updateExternalParticipant(index, 'name', e.target.value)}
                          placeholder="이름"
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={ext.role}
                          onChange={(e) => updateExternalParticipant(index, 'role', e.target.value)}
                          placeholder="소속/역할"
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                        <label className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={ext.attended}
                            onChange={(e) => updateExternalParticipant(index, 'attended', e.target.checked)}
                            className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span>참석</span>
                        </label>
                        <button
                          onClick={() => removeExternalParticipant(index)}
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
              </fieldset>
            </div>
              )
            })()}

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
                                  const agendaSectionId = `agenda-${item.id}`
                                  const agendaLocker = getSectionLocker(agendaSectionId)
                                  const agendaLocked = !!agendaLocker
                                  return (
                                    <div
                                      key={item.id}
                                      className={`p-3 rounded-lg border transition-colors ${agendaLocked ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-transparent'}`}
                                      onFocus={() => { if (!agendaLocked) lockSection(agendaSectionId) }}
                                      onBlur={() => unlockSection(agendaSectionId)}
                                    >
                                      {agendaLocked && (
                                        <div className="flex items-center gap-1 text-xs text-orange-600 font-medium mb-2">
                                          <Lock className="w-3 h-3" />
                                          {agendaLocker.userName} 편집 중
                                        </div>
                                      )}
                                      <fieldset disabled={agendaLocked}>
                                      <div className="flex items-start gap-2 mb-2">
                                        <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                                          {sectionIndex + 1}
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
                                            placeholder="안건 설명 (우측 하단을 드래그하여 크기 조정 가능)"
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
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
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-gray-700 mb-1">진행률</label>
                                              <select
                                                value={item.progress ?? 0}
                                                onChange={(e) => handleUpdateAgenda(index, 'progress', Number(e.target.value) as 0 | 25 | 50 | 75 | 100)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
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
                                                  const updated = [...agenda]
                                                  const currentIds = updated[index].assignee_ids || []
                                                  if (currentIds.includes(selectedId)) return
                                                  const selectedEmployee = activeEmployees.find(emp => emp.id === selectedId)
                                                  updated[index] = {
                                                    ...updated[index],
                                                    assignee_ids: [...currentIds, selectedId],
                                                    assignees: [
                                                      ...(updated[index].assignees || []),
                                                      { id: selectedId, name: selectedEmployee?.name || _selectedName }
                                                    ]
                                                  }
                                                  setAgenda(updated)
                                                }}
                                                options={activeEmployees
                                                  .filter(emp => !(item.assignee_ids || []).includes(emp.id))
                                                  .map(emp => ({
                                                    id: emp.id,
                                                    name: `${emp.name}${emp.department || emp.position ? ` (${[emp.department, emp.position].filter(Boolean).join(' · ')})` : ''}`
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

                                        {/* 삭제 버튼 */}
                                        <button
                                          onClick={() => handleRemoveAgenda(index)}
                                          disabled={agendaLocked}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                      </fieldset>
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

          {/* 오른쪽 열: 요약 및 이슈 */}
          <div className="space-y-4">
            {/* 회의 요약 */}
            {(() => {
              const summaryLocker = getSectionLocker('summary')
              const summaryLocked = !!summaryLocker
              return (
            <div
              className={`bg-white p-4 rounded-lg shadow-sm border transition-colors ${summaryLocked ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
              onFocus={() => { if (!summaryLocked) lockSection('summary') }}
              onBlur={() => unlockSection('summary')}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">회의 요약</h2>
                {summaryLocked && (
                  <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                    <Lock className="w-3 h-3" />
                    {summaryLocker.userName} 편집 중
                  </span>
                )}
              </div>
              <textarea
                value={summary}
                onChange={(e) => { setSummary(e.target.value); markDirty('summary') }}
                disabled={summaryLocked}
                placeholder="회의 전반적인 내용을 요약하여 작성해주세요..."
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
              )
            })()}

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
                    const businessSectionId = `business-${issue.id}`
                    const businessLocker = getSectionLocker(businessSectionId)
                    const businessLocked = !!businessLocker

                    return (
                      <div
                        key={issue.id}
                        className={`p-3 rounded-lg border transition-colors ${businessLocked ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}
                        onFocus={() => { if (!businessLocked) lockSection(businessSectionId) }}
                        onBlur={() => unlockSection(businessSectionId)}
                      >
                        {businessLocked && (
                          <div className="flex items-center gap-1 text-xs text-orange-600 font-medium mb-2">
                            <Lock className="w-3 h-3" />
                            {businessLocker.userName} 편집 중
                          </div>
                        )}
                        <fieldset disabled={businessLocked}>
                        <div className="space-y-2">
                        {/* fieldset wraps all issue content */}
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              allowCustomValue={true}
                            />
                          )}

                        {/* 이슈 설명 */}
                        <textarea
                          value={issue.issue_description}
                          onChange={(e) => handleUpdateBusinessIssue(index, 'issue_description', e.target.value)}
                          placeholder="사업장 이슈 내용 (우측 하단을 드래그하여 크기 조정 가능)"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y text-sm"
                          style={{ minHeight: '75px' }}
                        />

                        {/* 담당자 (다중 선택) */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">담당자 (여러명 추가 가능)</label>
                          <AutocompleteSelectInput
                            value=""
                            onChange={(selectedId, selectedName) => {
                              const updated = [...businessIssues]
                              const currentIds = updated[index].assignee_ids || []

                              // 중복 체크
                              if (currentIds.includes(selectedId)) {
                                return
                              }

                              // 담당자 추가
                              updated[index] = {
                                ...updated[index],
                                assignee_ids: [...currentIds, selectedId],
                                assignees: [
                                  ...(updated[index].assignees || []),
                                  { id: selectedId, name: selectedName }
                                ]
                              }
                              setBusinessIssues(updated)
                            }}
                            options={activeEmployees
                              .filter(emp => !(issue.assignee_ids || []).includes(emp.id))
                              .map(emp => ({
                                id: emp.id,
                                name: emp.name,
                                subtitle: `${emp.department || ''} ${emp.position || ''}`.trim()
                              }))}
                            placeholder="담당자 선택..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        {/* 선택된 담당자 배지 표시 */}
                        {(issue.assignees && issue.assignees.length > 0) && (
                          <div className="flex flex-wrap gap-2">
                            {issue.assignees.map((assignee) => (
                              <span
                                key={assignee.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-sm"
                              >
                                {assignee.name}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...businessIssues]
                                    updated[index] = {
                                      ...updated[index],
                                      assignee_ids: (updated[index].assignee_ids || []).filter(id => id !== assignee.id),
                                      assignees: (updated[index].assignees || []).filter(a => a.id !== assignee.id)
                                    }
                                    setBusinessIssues(updated)
                                  }}
                                  className="hover:bg-blue-200 rounded"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </span>
                            ))}
                          </div>
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
                            disabled={businessLocked}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        </div>{/* space-y-2 */}
                        </fieldset>
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
            {isDirty ? '취소' : '뒤로가기'}
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
