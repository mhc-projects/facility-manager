'use client';

import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, CheckSquare, Square, Search, X } from 'lucide-react';
import { getLabelColor } from '@/lib/label-colors';

// Lazy load modals for better initial load performance
const CalendarModal = lazy(() => import('@/components/modals/CalendarModal'));
const DayEventsModal = lazy(() => import('@/components/modals/DayEventsModal'));
const FilteredEventsListModal = lazy(() => import('@/components/modals/FilteredEventsListModal'));

/**
 * 첨부 파일 메타데이터 타입
 */
interface AttachedFile {
  name: string;
  size: number;
  type: string;
  url: string;
  uploaded_at: string;
}

/**
 * 대한민국 공휴일 타입
 */
interface Holiday {
  date: string;   // YYYY-MM-DD
  name: string;   // 공휴일명
  isHoliday: boolean;
}

/**
 * 캘린더 이벤트 데이터 타입
 */
interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  end_date?: string | null; // 기간 설정용 (nullable)
  start_time?: string | null; // 시작 시간 (HH:MM 형식, nullable)
  end_time?: string | null; // 종료 시간 (HH:MM 형식, nullable)
  event_type: 'todo' | 'schedule';
  is_completed: boolean;
  author_id: string;
  author_name: string;
  attached_files?: AttachedFile[]; // 첨부 파일 배열
  labels?: string[]; // 라벨 배열 (예: ["착공실사", "준공실사"])
  business_id?: string | null; // 연결된 사업장 ID (nullable)
  business_name?: string | null; // 사업장명 (검색 최적화용)
  created_at: string;
  updated_at: string;
}

/**
 * 캘린더 보드 컴포넌트
 * - 월별 캘린더 뷰
 * - todo/schedule 타입 구분
 * - todo 타입은 완료 체크박스
 * - Level 1+ (AUTHENTICATED) 모든 작업 가능
 */
export default function CalendarBoard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLevel, setUserLevel] = useState<number>(1); // TODO: 실제 사용자 권한 레벨 가져오기
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'create' | 'edit'>('view');
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);

  // 일별 이벤트 목록 모달
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 필터 결과 리스트 모달
  const [isListViewOpen, setIsListViewOpen] = useState(false);

  // 검색 및 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);

  // 전체 데이터 검색용 상태
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [allEventsLoaded, setAllEventsLoaded] = useState(false);
  const [allEventsLoading, setAllEventsLoading] = useState(false);

  // 공휴일 상태
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // 스크롤 요청 추적용 ref
  const scrollToBottomRef = React.useRef(false);

  // 캘린더 컨테이너 ref (스크롤 타겟용)
  const calendarRef = React.useRef<HTMLDivElement>(null);

  /**
   * 로컬 타임존에서 날짜를 YYYY-MM-DD 형식으로 변환
   */
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * 오늘 날짜 문자열 (메모이제이션)
   */
  const today = useMemo(() => formatLocalDate(new Date()), []);

  /**
   * 현재 월의 시작/종료일 계산
   */
  const getMonthRange = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const startDate = formatLocalDate(new Date(year, month, 1));
    const endDate = formatLocalDate(new Date(year, month + 1, 0));
    return { startDate, endDate };
  };

  /**
   * 캘린더 이벤트 조회 (일반 이벤트 + 실사 이벤트 통합)
   */
  const fetchEvents = async (scrollToBottom = false) => {
    try {
      setLoading(true);
      const { startDate, endDate } = getMonthRange(currentDate);

      // 병렬로 일반 이벤트와 실사 이벤트 조회
      const [calendarResponse, surveyResponse] = await Promise.all([
        fetch(`/api/calendar?start_date=${startDate}&end_date=${endDate}`),
        fetch(`/api/survey-events?month=${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`)
      ]);

      const calendarResult = await calendarResponse.json();
      const surveyResult = await surveyResponse.json();

      // 두 결과 모두 성공했는지 확인
      if (calendarResult.success && surveyResult.success) {
        // 실사 이벤트를 CalendarEvent 형식으로 변환
        const surveyEvents: CalendarEvent[] = (surveyResult.data || []).map((survey: any) => ({
          id: survey.id,
          title: survey.title,
          description: survey.description || null,
          event_date: survey.event_date,
          start_time: survey.start_time || null,  // ✅ 시간 필드 추가
          end_time: survey.end_time || null,      // ✅ 시간 필드 추가
          event_type: 'schedule' as const, // 실사는 일정 타입으로
          is_completed: false,
          author_id: survey.business_id || '',
          author_name: survey.author_name || '미지정',
          labels: survey.labels || [],
          business_id: survey.business_id,
          business_name: survey.business_name,
          created_at: survey.created_at,
          updated_at: survey.updated_at
        }));

        // 일반 이벤트와 실사 이벤트 통합
        const mergedEvents = [...(calendarResult.data || []), ...surveyEvents];
        setEvents(mergedEvents);

        console.log(`✅ [캘린더] 이벤트 로드 완료 - 일반: ${calendarResult.data?.length || 0}, 실사: ${surveyEvents.length}, 총: ${mergedEvents.length}`);

        // 스크롤 요청 표시
        if (scrollToBottom) {
          console.log('[캘린더] fetchEvents: 스크롤 요청 설정 - scrollToBottom:', scrollToBottom);
          scrollToBottomRef.current = true;
        }
      } else {
        setError(calendarResult.error || surveyResult.error || '캘린더 이벤트를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('[캘린더 조회 오류]', err);
      setError('캘린더 이벤트를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate]);

  /**
   * 공휴일 데이터 조회 (월 변경 시)
   */
  const fetchHolidays = async (date: Date) => {
    try {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const response = await fetch(`/api/holidays?year=${year}&month=${month}`);
      const result = await response.json();
      if (result.success) {
        setHolidays(result.data || []);
      }
    } catch (err) {
      // 공휴일 로드 실패는 조용히 처리 (캘린더 동작에 영향 없음)
      console.warn('[공휴일] 로드 실패:', err);
    }
  };

  useEffect(() => {
    fetchHolidays(currentDate);
  }, [currentDate]);

  /**
   * 사용 가능한 라벨 목록 가져오기
   */
  const fetchAvailableLabels = async () => {
    try {
      // 캐시 방지를 위한 타임스탬프 추가
      const response = await fetch(`/api/calendar/labels?t=${Date.now()}`);
      const result = await response.json();

      if (result.success) {
        setAvailableLabels(result.labels || []);
      }
    } catch (err) {
      console.error('[라벨 목록 조회 오류]', err);
    }
  };

  useEffect(() => {
    fetchAvailableLabels();
  }, []);

  /**
   * 전체 캘린더 이벤트 조회 (검색용 - 날짜 범위 제한 없음)
   */
  const fetchAllEvents = async () => {
    if (allEventsLoaded || allEventsLoading) return;

    try {
      setAllEventsLoading(true);

      // 병렬로 전체 일반 이벤트와 실사 이벤트 조회 (날짜 범위 없이)
      const [calendarResponse, surveyResponse] = await Promise.all([
        fetch('/api/calendar'),  // 날짜 범위 없이 전체 조회
        fetch('/api/survey-events')  // month 파라미터 없이 전체 조회
      ]);

      const calendarResult = await calendarResponse.json();
      const surveyResult = await surveyResponse.json();

      if (calendarResult.success && surveyResult.success) {
        // 실사 이벤트를 CalendarEvent 형식으로 변환
        const surveyEvents: CalendarEvent[] = (surveyResult.data || []).map((survey: any) => ({
          id: survey.id,
          title: survey.title,
          description: survey.description || null,
          event_date: survey.event_date,
          start_time: survey.start_time || null,
          end_time: survey.end_time || null,
          event_type: 'schedule' as const,
          is_completed: false,
          author_id: survey.business_id || '',
          author_name: survey.author_name || '미지정',
          labels: survey.labels || [],
          business_id: survey.business_id,
          business_name: survey.business_name,
          created_at: survey.created_at,
          updated_at: survey.updated_at
        }));

        const mergedEvents = [...(calendarResult.data || []), ...surveyEvents];
        setAllEvents(mergedEvents);
        setAllEventsLoaded(true);
        console.log(`✅ [캘린더] 전체 이벤트 로드 완료 - 총: ${mergedEvents.length}개`);
      }
    } catch (err) {
      console.error('[전체 이벤트 조회 오류]', err);
    } finally {
      setAllEventsLoading(false);
    }
  };

  /**
   * 검색어나 라벨 필터가 활성화되면 전체 데이터 로드
   */
  useEffect(() => {
    if ((searchQuery.trim() || selectedLabels.length > 0) && !allEventsLoaded) {
      fetchAllEvents();
    }
  }, [searchQuery, selectedLabels, allEventsLoaded]);

  /**
   * 사용 가능한 라벨 변경 시 선택된 라벨 정리
   * - 더 이상 존재하지 않는 라벨을 선택 목록에서 제거
   */
  useEffect(() => {
    if (selectedLabels.length > 0) {
      const validLabels = selectedLabels.filter(label => availableLabels.includes(label));
      if (validLabels.length !== selectedLabels.length) {
        setSelectedLabels(validLabels);
        console.log('[캘린더] 존재하지 않는 라벨 제거:', selectedLabels.filter(l => !availableLabels.includes(l)));
      }
    }
  }, [availableLabels]);

  /**
   * 이벤트 목록이 업데이트된 후 스크롤 처리
   */
  useEffect(() => {
    if (scrollToBottomRef.current && !loading && calendarRef.current) {
      console.log('[캘린더 스크롤] 스크롤 시작 - 컴포넌트로 스크롤');

      // 리렌더링 완료 후 스크롤
      setTimeout(() => {
        if (calendarRef.current) {
          console.log('[캘린더 스크롤] scrollIntoView 실행');

          // 캘린더 컴포넌트의 하단으로 스크롤
          calendarRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'end', // 컴포넌트 하단이 뷰포트에 보이도록
            inline: 'nearest'
          });

          scrollToBottomRef.current = false;
          console.log('[캘린더 스크롤] 스크롤 완료');
        }
      }, 300);
    }
  }, [events, loading]);

  /**
   * 이전 월로 이동
   */
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  /**
   * 다음 월로 이동
   */
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  /**
   * 오늘로 이동
   */
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  /**
   * 새 이벤트 작성
   */
  const handleCreateClick = () => {
    setSelectedEvent(null);
    setModalMode('create');
    setInitialDate(formatLocalDate(new Date()));
    setIsModalOpen(true);
  };

  /**
   * 이벤트 클릭 (바로 수정 모드로 열기)
   */
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  /**
   * 모달 닫기
   */
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
    setInitialDate(undefined);
  };

  /**
   * 날짜 클릭 (날짜 영역 클릭 시 해당 날짜의 모든 이벤트 표시)
   */
  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setIsDayModalOpen(true);
  };

  /**
   * 일별 모달 닫기
   */
  const handleDayModalClose = () => {
    setIsDayModalOpen(false);
    setSelectedDate(null);
  };

  /**
   * 일별 모달에서 이벤트 클릭 (바로 수정 모드로 전환)
   */
  const handleDayModalEventClick = (event: CalendarEvent) => {
    setIsDayModalOpen(false);
    setSelectedEvent(event);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  /**
   * 모달 성공 처리 (생성/수정/삭제 후)
   */
  const handleModalSuccess = async () => {
    fetchEvents(true); // 페이지 하단으로 스크롤

    // 전체 데이터 캐시 무효화 (다음 검색 시 새로 로드)
    setAllEventsLoaded(false);
    setAllEvents([]);

    // 즉시 라벨 갱신 시도 (빠른 피드백)
    fetchAvailableLabels();

    // 데이터베이스 트랜잭션 완료를 위해 지연 후 재갱신 (이중 안전장치)
    // Supabase 트랜잭션 커밋 및 복제 시간 고려
    setTimeout(() => {
      fetchAvailableLabels();
    }, 500);
  };

  /**
   * 라벨 필터 토글
   */
  const handleToggleLabel = (label: string) => {
    setSelectedLabels(prev =>
      prev.includes(label)
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  /**
   * 모든 필터 초기화
   */
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedLabels([]);
  };

  /**
   * Todo 완료 상태 토글
   */
  const handleToggleComplete = async (e: React.MouseEvent, eventId: string, currentStatus: boolean) => {
    e.stopPropagation();

    try {
      const response = await fetch(`/api/calendar/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: !currentStatus })
      });

      const result = await response.json();

      if (result.success) {
        // 목록 업데이트
        setEvents(events.map(event =>
          event.id === eventId ? { ...event, is_completed: !currentStatus } : event
        ));

        // 스크롤 요청 표시
        scrollToBottomRef.current = true;
      } else {
        alert(result.error || '상태 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error('[완료 상태 변경 오류]', err);
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  /**
   * 이벤트 삭제 (일별 모달에서 호출)
   */
  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    if (!confirm(`"${eventTitle}" 일정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      // 실사 이벤트 감지 (estimate-survey-, pre-construction-survey-, completion-survey-)
      const isSurveyEvent =
        eventId.startsWith('estimate-survey-') ||
        eventId.startsWith('pre-construction-survey-') ||
        eventId.startsWith('completion-survey-');

      let response;
      if (isSurveyEvent) {
        // 실사 이벤트는 survey-events API 사용
        response = await fetch(`/api/survey-events?id=${eventId}`, {
          method: 'DELETE'
        });
      } else {
        // 일반 일정은 calendar API 사용
        response = await fetch(`/api/calendar/${eventId}`, {
          method: 'DELETE'
        });
      }

      const result = await response.json();

      if (result.success) {
        // 목록에서 제거
        setEvents(events.filter(event => event.id !== eventId));

        // 전체 데이터 캐시 무효화 (다음 검색 시 새로 로드)
        setAllEventsLoaded(false);
        setAllEvents([]);

        // 즉시 라벨 갱신 시도 (빠른 피드백)
        fetchAvailableLabels();

        // 데이터베이스 트랜잭션 완료를 위해 지연 후 재갱신 (이중 안전장치)
        setTimeout(() => {
          fetchAvailableLabels();
        }, 500);

        console.log(`✅ [캘린더] 일정 삭제 완료: ${eventTitle}`);
      } else {
        alert(result.error || '일정 삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('[일정 삭제 오류]', err);
      alert('일정 삭제 중 오류가 발생했습니다.');
    }
  };

  /**
   * 검색/필터 활성화 여부
   */
  const isFilterActive = searchQuery.trim() !== '' || selectedLabels.length > 0;

  /**
   * 검색 및 라벨 필터링된 이벤트 목록 (메모이제이션)
   * - 필터가 활성화되면 전체 데이터(allEvents)에서 검색
   * - 필터가 없으면 현재 월 데이터(events)만 사용
   */
  const filteredEvents = useMemo(() => {
    // 필터가 활성화되고 전체 데이터가 로드되었으면 전체 데이터에서 검색
    const sourceEvents = (isFilterActive && allEventsLoaded) ? allEvents : events;
    let filtered = sourceEvents;

    // 검색어 필터링
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(event =>
        event.title.toLowerCase().includes(query) ||
        (event.description && event.description.toLowerCase().includes(query)) ||
        (event.business_name && event.business_name.toLowerCase().includes(query))
      );
    }

    // 라벨 필터링 (선택된 라벨 중 하나라도 포함하면 표시)
    if (selectedLabels.length > 0) {
      filtered = filtered.filter(event => {
        // NULL 또는 undefined 방어: labels가 없으면 빈 배열로 처리
        const eventLabels = event.labels || [];
        return eventLabels.some(label => selectedLabels.includes(label));
      });
    }

    return filtered;
  }, [events, allEvents, allEventsLoaded, isFilterActive, searchQuery, selectedLabels]);

  /**
   * 이벤트를 날짜별로 인덱싱 (메모이제이션으로 성능 최적화)
   * 각 날짜마다 해당하는 이벤트 배열을 미리 계산하여 Map으로 저장
   * 이를 통해 42개 셀에서 매번 필터링하는 대신 O(1) 조회 가능
   */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    filteredEvents.forEach(event => {
      const startDate = new Date(event.event_date);
      const endDate = new Date(event.end_date || event.event_date);

      // 이벤트 기간의 모든 날짜에 대해 매핑
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateKey = formatLocalDate(current);
        const existing = map.get(dateKey) || [];
        existing.push(event);
        map.set(dateKey, existing);
        current.setDate(current.getDate() + 1);
      }
    });

    return map;
  }, [filteredEvents]);

  /**
   * 특정 날짜의 이벤트 가져오기 (O(1) 조회)
   */
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateString = formatLocalDate(date);
    return eventsByDate.get(dateString) || [];
  };

  /**
   * 기간 이벤트인지 확인
   */
  const isPeriodEvent = (event: CalendarEvent) => {
    return event.end_date && event.end_date !== event.event_date;
  };

  /**
   * 해당 날짜가 기간 이벤트의 어느 위치인지 확인
   */
  const getPeriodPosition = (event: CalendarEvent, date: Date): 'start' | 'middle' | 'end' | 'single' => {
    if (!isPeriodEvent(event)) return 'single';

    const dateString = formatLocalDate(date);
    if (dateString === event.event_date) return 'start';
    if (dateString === event.end_date) return 'end';
    return 'middle';
  };

  /**
   * 기간 이벤트의 총 일수 계산
   */
  const getPeriodDays = (event: CalendarEvent): number => {
    if (!isPeriodEvent(event)) return 1;

    const start = new Date(event.event_date);
    const end = new Date(event.end_date!);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  /**
   * 공휴일을 날짜별로 인덱싱 (O(1) 조회)
   */
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach(holiday => {
      map.set(holiday.date, holiday);
    });
    return map;
  }, [holidays]);

  /**
   * 캘린더 날짜 배열 생성 (메모이제이션)
   * currentDate가 변경될 때만 재계산
   */
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // 일요일부터 시작

    const days: Date[] = [];
    const current = new Date(startDate);

    // 6주 표시 (42일)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [currentDate]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">캘린더</h2>
          </div>
        </div>
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold">캘린더</h2>
          </div>
        </div>
        <div className="text-center py-8 text-red-500">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div ref={calendarRef} className="bg-white rounded-md md:rounded-lg shadow">
      {/* 헤더 */}
      <div className="p-3 sm:p-4 md:p-6 border-b space-y-2 sm:space-y-3">
        {/* 모바일: 세로 레이아웃, 데스크톱: 가로 레이아웃 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3">
          {/* 타이틀 */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            <h2 className="text-base sm:text-lg font-semibold">캘린더</h2>
          </div>

          {/* 네비게이션 컨트롤 */}
          <div className="flex items-center justify-between md:justify-start gap-2 md:gap-4">
            {/* 월 네비게이션 */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 sm:p-2 md:p-1 hover:bg-gray-100 rounded transition-colors touch-manipulation"
                aria-label="이전 달"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <span className="text-xs sm:text-sm md:text-base font-medium min-w-[90px] sm:min-w-[100px] md:min-w-[120px] text-center">
                {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 sm:p-2 md:p-1 hover:bg-gray-100 rounded transition-colors touch-manipulation"
                aria-label="다음 달"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* 오늘/일정 추가 버튼 */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleToday}
                className="px-2 py-1 sm:px-2.5 sm:py-1.5 md:px-3 md:py-1 text-[10px] sm:text-xs md:text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors touch-manipulation"
              >
                오늘
              </button>
              {userLevel >= 1 && (
                <button
                  onClick={handleCreateClick}
                  className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 md:px-3 md:py-1.5 text-[10px] sm:text-xs md:text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors touch-manipulation"
                >
                  <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">일정 추가</span>
                  <span className="sm:hidden">추가</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 검색 및 필터 섹션 */}
        <div className="space-y-2">
          {/* 검색 입력 */}
          <div className="relative">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="일정 검색 (제목, 설명)..."
              className="w-full pl-9 pr-9 sm:pl-10 sm:pr-10 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 p-0.5 sm:p-1 hover:bg-gray-100 rounded transition-colors"
                aria-label="검색어 지우기"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* 라벨 필터 */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-xs text-gray-600 font-medium">라벨:</span>
            {availableLabels.length > 0 ? (
              <>
                {availableLabels.map(label => {
                  const isSelected = selectedLabels.includes(label);
                  const labelColors = getLabelColor(label);
                  return (
                    <button
                      key={label}
                      onClick={() => handleToggleLabel(label)}
                      className={`
                        px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium transition-all
                        ${isSelected
                          ? `${labelColors.bg} ${labelColors.text} ring-2 ring-offset-1 ring-purple-500`
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }
                      `}
                    >
                      {label}
                    </button>
                  );
                })}
                {(searchQuery || selectedLabels.length > 0) && (
                  <button
                    onClick={handleClearFilters}
                    className="ml-1.5 sm:ml-2 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  >
                    필터 초기화
                  </button>
                )}
              </>
            ) : (
              <span className="text-[10px] sm:text-xs text-gray-400 italic">라벨이 없습니다. 일정에 라벨을 추가해보세요.</span>
            )}
          </div>

          {/* 필터 결과 표시 */}
          {(searchQuery || selectedLabels.length > 0) && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="text-[10px] sm:text-xs text-gray-500">
                {allEventsLoading ? (
                  <span className="text-purple-600">🔍 전체 일정 검색 중...</span>
                ) : (
                  <>
                    <span className="font-medium text-purple-600">{filteredEvents.length}개</span>의 일정
                    {allEventsLoaded && (
                      <span className="text-gray-400"> (전체 {allEvents.length}개 중)</span>
                    )}
                  </>
                )}
              </div>
              {filteredEvents.length > 0 && !allEventsLoading && (
                <button
                  onClick={() => setIsListViewOpen(true)}
                  className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded transition-colors font-medium whitespace-nowrap"
                >
                  📋 리스트 보기
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 캘린더 그리드 */}
      <div className="p-2 sm:p-3 md:p-6">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-0.5 md:gap-1 mb-1 sm:mb-2">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
            <div
              key={day}
              className={`text-center text-[10px] sm:text-xs md:text-sm font-medium py-0.5 sm:py-1 md:py-2 ${
                index === 0 ? 'text-red-600' : index === 6 ? 'text-blue-600' : 'text-gray-700'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-0.5 md:gap-1">
          {calendarDays.map((day, index) => {
            const dateString = formatLocalDate(day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = dateString === today;
            const dayEvents = getEventsForDate(day);
            const holiday = holidaysByDate.get(dateString);

            // 기간 이벤트 우선 정렬 (기간 이벤트를 먼저 표시)
            const sortedDayEvents = [...dayEvents].sort((a, b) => {
              const aPeriod = isPeriodEvent(a) ? 1 : 0;
              const bPeriod = isPeriodEvent(b) ? 1 : 0;
              return bPeriod - aPeriod;
            });

            return (
              <div
                key={index}
                onClick={() => handleDayClick(day)}
                className={`
                  h-[65px] sm:h-[70px] md:h-[110px] p-0.5 sm:p-1 md:p-2 border rounded cursor-pointer flex flex-col touch-manipulation
                  ${isCurrentMonth
                    ? holiday ? 'bg-red-50 hover:bg-red-100' : 'bg-white hover:bg-gray-50'
                    : 'bg-gray-50 hover:bg-gray-100'}
                  ${isToday ? 'ring-2 ring-purple-500' : ''}
                  transition-colors
                `}
              >
                <div className={`text-[10px] sm:text-xs md:text-sm font-medium mb-0.5 flex-shrink-0 ${
                  !isCurrentMonth ? 'text-gray-400' :
                  holiday || index % 7 === 0 ? 'text-red-600' :
                  index % 7 === 6 ? 'text-blue-600' :
                  'text-gray-900'
                }`}>
                  {day.getDate()}
                </div>
                {/* 공휴일명 (데스크톱) */}
                {holiday && isCurrentMonth && (
                  <div className="hidden md:block text-[9px] leading-tight text-red-500 font-medium truncate mb-0.5" title={holiday.name}>
                    {holiday.name}
                  </div>
                )}
                {/* 공휴일 도트 (모바일) */}
                {holiday && isCurrentMonth && (
                  <div className="md:hidden w-1 h-1 rounded-full bg-red-400 mb-0.5" title={holiday.name} />
                )}

                {/* 데스크톱: 이벤트 박스 표시 */}
                <div className="hidden md:flex flex-1 flex-col overflow-hidden space-y-0">
                  {sortedDayEvents.slice(0, 2).map(event => {
                    const position = getPeriodPosition(event, day);
                    const periodDays = getPeriodDays(event);
                    const isPeriod = isPeriodEvent(event);

                    return (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event);
                        }}
                        className={`
                          text-xs px-1 py-px rounded cursor-pointer relative
                          ${event.event_type === 'todo'
                            ? event.is_completed
                              ? 'bg-gray-100 text-gray-500 line-through'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          }
                          ${isPeriod && position === 'start' ? 'border-l-2 border-l-orange-400' : ''}
                          ${isPeriod && position === 'middle' ? 'border-l-2 border-l-orange-300 opacity-75' : ''}
                          ${isPeriod && position === 'end' ? 'border-l-2 border-l-orange-400 opacity-75' : ''}
                        `}
                      >
                        <div className="flex items-center gap-1">
                          {event.event_type === 'todo' && (
                            <span
                              onClick={(e) => handleToggleComplete(e, event.id, event.is_completed)}
                              className="inline-block flex-shrink-0"
                            >
                              {event.is_completed ? (
                                <CheckSquare className="w-3 h-3 inline" />
                              ) : (
                                <Square className="w-3 h-3 inline" />
                              )}
                            </span>
                          )}
                          <span className="truncate flex-1" title={event.business_name ? `${event.business_name}` : undefined}>
                            {event.start_time && (
                              <span className="text-[10px] font-medium text-gray-700 mr-1">
                                {event.start_time.substring(0, 5)}
                              </span>
                            )}
                            {event.business_name && (
                              <span className="text-[10px] mr-0.5" title={event.business_name}>
                                🏢
                              </span>
                            )}
                            {event.title}
                            {isPeriod && position === 'start' && (
                              <span className="ml-1 text-[10px] text-orange-600 font-semibold">
                                📅{periodDays}일
                              </span>
                            )}
                          </span>
                          {event.labels && event.labels.length > 0 && (() => {
                            const labelColors = getLabelColor(event.labels[0]);
                            return (
                              <span className={`
                                flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium
                                ${labelColors.bg} ${labelColors.text}
                              `}>
                                {event.labels[0]}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                  {sortedDayEvents.length > 2 && (
                    <div className="text-[10px] sm:text-xs text-gray-600 font-semibold pl-0.5 sm:pl-1">
                      +{sortedDayEvents.length - 2}
                    </div>
                  )}
                </div>

                {/* 모바일: 이벤트 도트 표시 */}
                <div className="md:hidden flex flex-1 items-center justify-center gap-0.5">
                  {dayEvents.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 justify-center items-center">
                      {dayEvents.slice(0, 3).map((event) => {
                        const isPeriod = isPeriodEvent(event);
                        const position = getPeriodPosition(event, day);

                        return (
                          <div
                            key={event.id}
                            className={`
                              ${isPeriod ? 'w-2 h-1.5 rounded-sm' : 'w-1.5 h-1.5 rounded-full'}
                              ${event.event_type === 'todo'
                                ? event.is_completed
                                  ? 'bg-gray-400'
                                  : isPeriod && position === 'start'
                                    ? 'bg-blue-500 ring-1 ring-orange-400'
                                    : 'bg-blue-500'
                                : isPeriod && position === 'start'
                                  ? 'bg-purple-500 ring-1 ring-orange-400'
                                  : 'bg-purple-500'
                              }
                            `}
                            title={event.title}
                          />
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] sm:text-[10px] text-gray-600 ml-0.5">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 mt-2 sm:mt-3 md:mt-4 text-[10px] sm:text-xs text-gray-600">
          {/* 데스크톱: 박스 표시 */}
          <div className="hidden md:flex items-center gap-1">
            <div className="w-3 h-3 bg-red-50 rounded border border-red-200"></div>
            <span className="text-red-600">공휴일</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-100 rounded"></div>
            <span>할일</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-100 rounded"></div>
            <span>일정</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-100 rounded"></div>
            <span>완료</span>
          </div>
          <div className="hidden md:flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-100 rounded border-l-2 border-l-orange-400"></div>
            <span>기간 이벤트</span>
          </div>

          {/* 모바일: 도트 표시 */}
          <div className="md:hidden flex items-center gap-1">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            <span className="text-red-600">공휴일</span>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>할일</span>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span>일정</span>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <span>완료</span>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <div className="w-2 h-1.5 bg-blue-500 rounded-sm ring-1 ring-orange-400"></div>
            <span>기간</span>
          </div>
        </div>
      </div>

      {/* 캘린더 모달 - Lazy loading with Suspense */}
      {isModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <CalendarModal
            isOpen={isModalOpen}
            onClose={handleModalClose}
            event={selectedEvent}
            mode={modalMode}
            initialDate={initialDate}
            onSuccess={handleModalSuccess}
          />
        </Suspense>
      )}

      {/* 일별 이벤트 목록 모달 - Lazy loading with Suspense */}
      {isDayModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <DayEventsModal
            isOpen={isDayModalOpen}
            onClose={handleDayModalClose}
            date={selectedDate}
            events={selectedDate ? getEventsForDate(selectedDate) : []}
            onEventClick={handleDayModalEventClick}
            onToggleComplete={async (eventId, currentStatus) => {
              try {
                const response = await fetch(`/api/calendar/${eventId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_completed: !currentStatus })
                });

                const result = await response.json();

                if (result.success) {
                  setEvents(events.map(event =>
                    event.id === eventId ? { ...event, is_completed: !currentStatus } : event
                  ));

                  // 스크롤 요청 표시
                  scrollToBottomRef.current = true;
                } else {
                  alert(result.error || '상태 변경에 실패했습니다.');
                }
              } catch (err) {
                console.error('[완료 상태 변경 오류]', err);
                alert('상태 변경 중 오류가 발생했습니다.');
              }
            }}
            onCreateEvent={() => {
              // 일별 모달 닫기
              setIsDayModalOpen(false);

              // 캘린더 모달을 생성 모드로 열기 (선택된 날짜로)
              setSelectedEvent(null);
              setModalMode('create');
              setInitialDate(selectedDate ? formatLocalDate(selectedDate) : undefined);
              setIsModalOpen(true);
            }}
            onDelete={handleDeleteEvent}
          />
        </Suspense>
      )}

      {/* 필터 결과 리스트 모달 - Lazy loading with Suspense */}
      {isListViewOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <FilteredEventsListModal
            isOpen={isListViewOpen}
            onClose={() => setIsListViewOpen(false)}
            events={filteredEvents}
            onEventClick={(event) => {
              setIsListViewOpen(false);
              setSelectedEvent(event);
              setModalMode('edit');
              setIsModalOpen(true);
            }}
            onToggleComplete={async (eventId, currentStatus) => {
              try {
                const response = await fetch(`/api/calendar/${eventId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ is_completed: !currentStatus })
                });

                const result = await response.json();

                if (result.success) {
                  setEvents(events.map(event =>
                    event.id === eventId ? { ...event, is_completed: !currentStatus } : event
                  ));

                  // 스크롤 요청 표시
                  scrollToBottomRef.current = true;
                } else {
                  alert(result.error || '상태 변경에 실패했습니다.');
                }
              } catch (err) {
                console.error('[완료 상태 변경 오류]', err);
                alert('상태 변경 중 오류가 발생했습니다.');
              }
            }}
            searchQuery={searchQuery}
            selectedLabels={selectedLabels}
          />
        </Suspense>
      )}
    </div>
  );
}
