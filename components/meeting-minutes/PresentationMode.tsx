'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  Building2,
  ClipboardList,
  MessageSquare,
  FileText,
  CheckSquare,
  AlertCircle
} from 'lucide-react'
import { MeetingMinute, AgendaItem, BusinessIssue } from '@/types/meeting-minutes'

// ─────────────────────────────────────────────
// 슬라이드 타입
// ─────────────────────────────────────────────
type Slide =
  | { type: 'cover' }
  | { type: 'attendees' }
  | { type: 'agenda'; item: AgendaItem; index: number; total: number; dept?: string }
  | { type: 'discussions' }
  | { type: 'business_issues' }
  | { type: 'summary' }

function buildSlides(minute: MeetingMinute, departments: string[] = []): Slide[] {
  const slides: Slide[] = []

  // 1. 표지
  slides.push({ type: 'cover' })

  // 2. 참석자
  if (minute.participants.length > 0) {
    slides.push({ type: 'attendees' })
  }

  // 3. 안건 (각 1슬라이드) — 상세/편집 페이지와 동일한 부서 순서로 정렬
  if (minute.agenda.length > 0) {
    // 부서별 그룹화
    const grouped: Record<string, typeof minute.agenda> = {}
    minute.agenda.forEach(item => {
      const key = (item as any).department || ''
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(item)
    })

    // departments API 순서대로 정렬, 마지막에 부서 미지정('')
    const orderedKeys = departments.length > 0
      ? [...departments, ''].filter(key => grouped[key] && grouped[key].length > 0)
      : Object.keys(grouped).filter(key => grouped[key] && grouped[key].length > 0)

    // 부서 없는 경우 original 순서 유지
    const sortedAgenda = orderedKeys.length > 0
      ? orderedKeys.flatMap(key => grouped[key])
      : minute.agenda

    sortedAgenda.forEach((item, index) => {
      slides.push({
        type: 'agenda',
        item,
        index,
        total: sortedAgenda.length,
        dept: (item as any).department
      })
    })
  }

  // 4. 논의사항
  if (minute.content.discussions && minute.content.discussions.length > 0) {
    slides.push({ type: 'discussions' })
  }

  // 5. 사업장 이슈
  if (minute.content.business_issues && minute.content.business_issues.length > 0) {
    slides.push({ type: 'business_issues' })
  }

  // 6. 요약 / 마무리
  slides.push({ type: 'summary' })

  return slides
}

// ─────────────────────────────────────────────
// 진행률 색상
// ─────────────────────────────────────────────
function progressColor(p: number) {
  if (p === 0) return { bar: 'bg-slate-400', text: 'text-slate-300', label: '미착수' }
  if (p <= 25) return { bar: 'bg-blue-400', text: 'text-blue-300', label: '시작' }
  if (p <= 50) return { bar: 'bg-yellow-400', text: 'text-yellow-300', label: '진행중' }
  if (p <= 75) return { bar: 'bg-orange-400', text: 'text-orange-300', label: '마무리' }
  return { bar: 'bg-emerald-400', text: 'text-emerald-300', label: '완료' }
}

// ─────────────────────────────────────────────
// 슬라이드별 렌더러
// ─────────────────────────────────────────────

function SlideCover({ minute }: { minute: MeetingMinute }) {
  const statusColors: Record<string, string> = {
    draft: 'bg-amber-400/20 text-amber-300 border border-amber-400/30',
    completed: 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30',
    archived: 'bg-slate-400/20 text-slate-300 border border-slate-400/30'
  }
  const statusLabels: Record<string, string> = {
    draft: '작성중', completed: '완료', archived: '보관'
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-12 select-none">
      {/* 회의 유형 + 상태 */}
      <div className="flex items-center gap-3 mb-8">
        <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
          {minute.meeting_type}
        </span>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[minute.status]}`}>
          {statusLabels[minute.status]}
        </span>
      </div>

      {/* 제목 */}
      <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-10 tracking-tight">
        {minute.title}
      </h1>

      {/* 구분선 */}
      <div className="w-24 h-1 rounded-full bg-blue-500/60 mb-10" />

      {/* 메타 정보 */}
      <div className="flex flex-wrap items-center justify-center gap-8 text-slate-300 text-lg">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          <span>
            {new Date(minute.meeting_date).toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
            })}
          </span>
        </div>
        {minute.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-400" />
            <span>{minute.location}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          <span>참석자 {minute.participants.filter(p => p.attended).length}명</span>
        </div>
      </div>
    </div>
  )
}

function SlideAttendees({ minute }: { minute: MeetingMinute }) {
  const attended = minute.participants.filter(p => p.attended)
  const absent = minute.participants.filter(p => !p.attended)

  return (
    <div className="flex flex-col h-full px-12 py-8 select-none">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <Users className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="text-3xl font-bold text-white">참석자</h2>
        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-sm">
          {minute.participants.length}명
        </span>
      </div>

      <div className="flex-1 overflow-hidden">
        {attended.length > 0 && (
          <>
            <p className="text-sm text-slate-400 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              출석 {attended.length}명
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {attended.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 border border-emerald-400/20"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {p.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-medium text-sm truncate">{p.name}</div>
                    <div className="text-slate-400 text-xs truncate">{p.role}</div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-auto" />
                </div>
              ))}
            </div>
          </>
        )}

        {absent.length > 0 && (
          <>
            <p className="text-sm text-slate-400 mb-3 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-slate-500" />
              불참 {absent.length}명
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {absent.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 font-semibold text-sm flex-shrink-0">
                    {p.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-slate-400 font-medium text-sm truncate">{p.name}</div>
                    <div className="text-slate-500 text-xs truncate">{p.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SlideAgenda({ slide }: { slide: Extract<Slide, { type: 'agenda' }> }) {
  const { item, index, total, dept } = slide
  const prog = item.progress
  const pc = prog !== undefined ? progressColor(prog) : null

  return (
    <div className="flex flex-col h-full px-12 py-8 select-none">
      {/* 헤더 */}
      <div className="flex items-start gap-4 mb-8">
        <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/30">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {dept && (
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/30">
                {dept}
              </span>
            )}
            <span className="text-slate-400 text-sm">안건 {index + 1} / {total}</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">{item.title}</h2>
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mb-6" />

      {/* 설명 */}
      <div className="flex-1 overflow-auto">
        {item.description && /<[a-z][\s\S]*>/i.test(item.description) ? (
          <div
            className="tiptap-readonly text-slate-200 text-lg leading-relaxed mb-6"
            dangerouslySetInnerHTML={{ __html: item.description }}
          />
        ) : (
          <p className="text-slate-200 text-lg leading-relaxed whitespace-pre-wrap mb-6">
            {item.description}
          </p>
        )}

        {/* 메타 정보 */}
        <div className="flex flex-wrap gap-4 mb-6">
          {(item.assignees && item.assignees.length > 0) ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">담당자</span>
              <div className="flex flex-wrap gap-1.5">
                {item.assignees.map(a => (
                  <span key={a.id} className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-sm border border-blue-400/30">
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          ) : item.assignee_name ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">담당자</span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-sm border border-blue-400/30">
                {item.assignee_name}
              </span>
            </div>
          ) : null}

          {item.deadline && (
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <Clock className="w-4 h-4 text-orange-400" />
              <span>마감: {new Date(item.deadline).toLocaleDateString('ko-KR')}</span>
            </div>
          )}
        </div>

        {/* 진행률 */}
        {pc && prog !== undefined && (
          <div className="mt-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">진행률</span>
              <span className={`font-semibold text-sm ${pc.text}`}>{prog}% {pc.label}</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${pc.bar}`}
                style={{ width: `${prog}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SlideDiscussions({ minute }: { minute: MeetingMinute }) {
  const discussions = minute.content.discussions ?? []
  return (
    <div className="flex flex-col h-full px-12 py-8 select-none">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-lg bg-purple-500/20">
          <MessageSquare className="w-6 h-6 text-purple-400" />
        </div>
        <h2 className="text-3xl font-bold text-white">논의사항</h2>
        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-sm">
          {discussions.length}건
        </span>
      </div>

      <div className="flex-1 overflow-auto space-y-5">
        {discussions.map((d, i) => (
          <div key={i} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="px-5 py-3 bg-purple-500/10 border-b border-white/10">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <span className="text-purple-400">📌</span>
                {d.topic}
              </h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mb-3">{d.notes}</p>
              {d.decisions.length > 0 && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-400/20 px-4 py-3">
                  <p className="text-blue-300 text-xs font-semibold mb-2">결정사항</p>
                  <ul className="space-y-1">
                    {d.decisions.map((dec, j) => (
                      <li key={j} className="flex items-start gap-2 text-slate-200 text-sm">
                        <span className="text-blue-400 mt-0.5">→</span>
                        <span>{dec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SlideBusinessIssues({ minute }: { minute: MeetingMinute }) {
  const issues = minute.content.business_issues ?? []
  const done = issues.filter(i => i.is_completed).length

  return (
    <div className="flex flex-col h-full px-12 py-8 select-none">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <Building2 className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-3xl font-bold text-white">사업장 이슈</h2>
        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-sm">
          {done}/{issues.length} 완료
        </span>
      </div>

      {/* 전체 진행률 */}
      <div className="mb-6">
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${issues.length > 0 ? (done / issues.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-3">
        {issues.map((issue, i) => (
          <div
            key={issue.id || i}
            className={`flex items-start gap-4 px-5 py-4 rounded-xl border transition-colors ${
              issue.is_completed
                ? 'bg-emerald-500/10 border-emerald-400/20'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
              issue.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'
            }`}>
              {issue.is_completed && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-400/20">
                  {issue.business_name}
                </span>
                {(issue.assignees && issue.assignees.length > 0)
                  ? issue.assignees.map(a => (
                    <span key={a.id} className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-xs">
                      {a.name}
                    </span>
                  ))
                  : issue.assignee_name && (
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-xs">
                      {issue.assignee_name}
                    </span>
                  )
                }
              </div>
              <p className={`text-sm leading-relaxed ${issue.is_completed ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                {issue.issue_description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SlideSummary({ minute }: { minute: MeetingMinute }) {
  const hasSummary = !!minute.content.summary

  return (
    <div className="flex flex-col items-center justify-center h-full px-12 text-center select-none">
      {hasSummary ? (
        <>
          <div className="p-3 rounded-xl bg-blue-500/20 mb-6">
            <FileText className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-8">회의 요약</h2>
          <div className="max-w-2xl bg-white/5 border border-white/10 rounded-2xl px-8 py-6 text-left">
            <p className="text-slate-200 text-lg leading-relaxed whitespace-pre-wrap">
              {minute.content.summary}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="text-4xl font-bold text-white mb-4">고생하셨습니다</h2>
          <p className="text-slate-400 text-lg">{minute.title}</p>
          <div className="w-16 h-1 rounded-full bg-blue-500/60 mt-6" />
        </>
      )}

      {hasSummary && (
        <div className="mt-8 flex items-center gap-2 text-slate-500 text-sm">
          <span>— 이상으로 회의를 마칩니다 —</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 슬라이드 인디케이터 라벨
// ─────────────────────────────────────────────
function slideLabel(slide: Slide, minute: MeetingMinute): string {
  switch (slide.type) {
    case 'cover': return '표지'
    case 'attendees': return '참석자'
    case 'agenda': return `안건 ${slide.index + 1}`
    case 'discussions': return '논의사항'
    case 'business_issues': return '사업장 이슈'
    case 'summary': return minute.content.summary ? '요약' : '마무리'
  }
}

function slideIcon(slide: Slide) {
  switch (slide.type) {
    case 'cover': return <FileText className="w-3 h-3" />
    case 'attendees': return <Users className="w-3 h-3" />
    case 'agenda': return <ClipboardList className="w-3 h-3" />
    case 'discussions': return <MessageSquare className="w-3 h-3" />
    case 'business_issues': return <Building2 className="w-3 h-3" />
    case 'summary': return <CheckSquare className="w-3 h-3" />
  }
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

interface PresentationModeProps {
  minute: MeetingMinute
  onClose: () => void
  departments?: string[]
}

export default function PresentationMode({ minute, onClose, departments = [] }: PresentationModeProps) {
  const slides = buildSlides(minute, departments)
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [animating, setAnimating] = useState(false)
  const [showNav, setShowNav] = useState(true)
  const [navTimeout, setNavTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  const goTo = useCallback((index: number) => {
    if (animating || index === current) return
    setDirection(index > current ? 'forward' : 'backward')
    setAnimating(true)
    setTimeout(() => {
      setCurrent(index)
      setAnimating(false)
    }, 250)
  }, [animating, current])

  const goNext = useCallback(() => { if (current < slides.length - 1) goTo(current + 1) }, [current, slides.length, goTo])
  const goPrev = useCallback(() => { if (current > 0) goTo(current - 1) }, [current, goTo])

  // 키보드 이벤트
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goNext, goPrev])

  // 마우스 움직임 → 네비 표시
  const handleMouseMove = useCallback(() => {
    setShowNav(true)
    if (navTimeout) clearTimeout(navTimeout)
    const t = setTimeout(() => setShowNav(false), 3000)
    setNavTimeout(t)
  }, [navTimeout])

  useEffect(() => {
    return () => { if (navTimeout) clearTimeout(navTimeout) }
  }, [navTimeout])

  // body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const slide = slides[current]

  const slideTransform = animating
    ? direction === 'forward'
      ? 'translate-x-8 opacity-0'
      : '-translate-x-8 opacity-0'
    : 'translate-x-0 opacity-100'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900"
      onMouseMove={handleMouseMove}
    >
      {/* 상단 바 */}
      <div
        className={`flex-shrink-0 flex items-center justify-between px-6 py-3 bg-black/20 border-b border-white/5 transition-opacity duration-300 ${showNav ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm truncate max-w-xs">{minute.title}</span>
          <span className="text-slate-400 text-xs">
            {new Date(minute.meeting_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm tabular-nums">
            {current + 1} <span className="text-slate-600">/</span> {slides.length}
          </span>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>ESC</span>
          </button>
        </div>
      </div>

      {/* 슬라이드 영역 */}
      <div className="flex-1 relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-blue-600/5 blur-3xl" />
          <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-indigo-600/5 blur-3xl" />
        </div>

        {/* 슬라이드 콘텐츠 */}
        <div
          className={`absolute inset-0 transition-all duration-250 ease-out ${slideTransform}`}
          style={{ transitionProperty: 'transform, opacity' }}
        >
          {slide.type === 'cover' && <SlideCover minute={minute} />}
          {slide.type === 'attendees' && <SlideAttendees minute={minute} />}
          {slide.type === 'agenda' && <SlideAgenda slide={slide} />}
          {slide.type === 'discussions' && <SlideDiscussions minute={minute} />}
          {slide.type === 'business_issues' && <SlideBusinessIssues minute={minute} />}
          {slide.type === 'summary' && <SlideSummary minute={minute} />}
        </div>

        {/* 좌우 클릭 영역 (넓은 터치/마우스 영역) */}
        {current > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-0 top-0 bottom-0 w-1/5 group flex items-center justify-start pl-4 cursor-pointer"
            aria-label="이전 슬라이드"
          >
            <div className={`p-3 rounded-full bg-white/5 border border-white/10 text-white/30 group-hover:text-white group-hover:bg-white/15 transition-all duration-200 ${showNav ? 'opacity-100' : 'opacity-0'}`}>
              <ChevronLeft className="w-6 h-6" />
            </div>
          </button>
        )}
        {current < slides.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-0 top-0 bottom-0 w-1/5 group flex items-center justify-end pr-4 cursor-pointer"
            aria-label="다음 슬라이드"
          >
            <div className={`p-3 rounded-full bg-white/5 border border-white/10 text-white/30 group-hover:text-white group-hover:bg-white/15 transition-all duration-200 ${showNav ? 'opacity-100' : 'opacity-0'}`}>
              <ChevronRight className="w-6 h-6" />
            </div>
          </button>
        )}
      </div>

      {/* 하단 바 */}
      <div
        className={`flex-shrink-0 flex items-center justify-between px-6 py-3 bg-black/20 border-t border-white/5 transition-opacity duration-300 ${showNav ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* 이전 버튼 */}
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>

        {/* 슬라이드 점 인디케이터 */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-lg">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              title={slideLabel(s, minute)}
              className={`group relative flex-shrink-0 transition-all duration-200 ${
                i === current
                  ? 'w-8 h-2 bg-blue-400 rounded-full'
                  : 'w-2 h-2 bg-white/20 hover:bg-white/40 rounded-full'
              }`}
            />
          ))}
        </div>

        {/* 다음 버튼 */}
        <button
          onClick={goNext}
          disabled={current === slides.length - 1}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          다음
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
