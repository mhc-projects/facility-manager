'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AdminLayout from '@/components/ui/AdminLayout';
import UrlDataManager from '@/components/admin/UrlDataManager';
import ManualUploadModal from '@/components/subsidy/ManualUploadModal';
import AnnouncementDetailModal from '@/components/subsidy/AnnouncementDetailModal';
import ActiveAnnouncementsModal from '@/components/subsidy/ActiveAnnouncementsModal';
import { useAuth } from '@/contexts/AuthContext';
import { createBrowserClient } from '@supabase/ssr';
import { TokenManager } from '@/lib/api-client';
import type { SubsidyAnnouncement, SubsidyDashboardStats, AnnouncementStatus } from '@/types/subsidy';
import { shouldHideModal } from '@/utils/modalHideControl';

// 상태별 색상
const statusColors: Record<AnnouncementStatus, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-blue-100', text: 'text-blue-800', label: '신규' },
  reviewing: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '검토중' },
  applied: { bg: 'bg-green-100', text: 'text-green-800', label: '신청완료' },
  expired: { bg: 'bg-gray-100', text: 'text-gray-600', label: '마감' },
  not_relevant: { bg: 'bg-red-100', text: 'text-red-800', label: '무관' },
};

export default function SubsidyAnnouncementsPage() {
  const { user, permissions, loading: authLoading } = useAuth();
  const [allAnnouncements, setAllAnnouncements] = useState<SubsidyAnnouncement[]>([]);
  const [stats, setStats] = useState<SubsidyDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<SubsidyAnnouncement | null>(null);
  const [showManualUploadModal, setShowManualUploadModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<SubsidyAnnouncement | null>(null);
  const [showActiveAnnouncementsModal, setShowActiveAnnouncementsModal] = useState(false);
  const [modalOpenMode, setModalOpenMode] = useState<'auto' | 'manual' | null>(null); // 모달 오픈 모드
  const [fromActiveModal, setFromActiveModal] = useState(false); // 신청가능한공고 모달에서 온 것인지 추적
  const [registeredRegions, setRegisteredRegions] = useState<string[]>([]); // URL 관리에 등록된 지역 목록

  // Supabase 클라이언트 (단일 인스턴스, 컴포넌트 최상위에서 생성)
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  // 필터 상태 (기본값: 관련 공고만 표시 - 75% 이상)
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRelevant, setFilterRelevant] = useState('true');
  const [filterManual, setFilterManual] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // 디버깅: 사용자 정보 출력
  useEffect(() => {
    console.log('🔍 [Subsidy] User Info:', {
      user,
      role: user?.role,
      roleType: typeof user?.role,
      authLoading,
      canSeeUrlManager: user && user.role >= 4,
      canSeeManualUpload: user && user.role >= 1,
      roleCheck1: user?.role >= 1,
      roleCheck4: user?.role >= 4
    });
  }, [user, authLoading]);

  // 전체 공고 목록 로드 (필터 없이)
  const loadAllAnnouncements = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '1000', // 충분히 큰 숫자로 전체 로드
        sortBy: 'published_at',
        sortOrder: 'desc',
      });

      const response = await fetch(`/api/subsidy-announcements?${params}`);
      const data = await response.json();

      if (data.success) {
        setAllAnnouncements(data.data.announcements);
      }
    } catch (error) {
      console.error('공고 로드 실패:', error);
    }
  }, []);

  // 통계 로드
  const loadStats = useCallback(async () => {
    try {
      const response = await fetch('/api/subsidy-announcements/stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  }, []);

  // 등록된 지역 목록 로드
  const loadRegisteredRegions = useCallback(async () => {
    try {
      const response = await fetch('/api/subsidy-crawler/registered-regions');
      const data = await response.json();

      if (data.success) {
        setRegisteredRegions(data.data);
        console.log('[Subsidy] 등록된 지역 목록 로드:', data.data.length, '곳');
      }
    } catch (error) {
      console.error('등록된 지역 로드 실패:', error);
    }
  }, []);

  // 데이터 로드 함수 (컴포넌트 레벨)
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAllAnnouncements(), loadStats(), loadRegisteredRegions()]);
    setLoading(false);
  }, [loadAllAnnouncements, loadStats]);

  // 초기 로드
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 자동 팝업 로직 - 오늘 하루 그만보기 설정 확인
  useEffect(() => {
    // 로딩 중이거나 공고가 없으면 실행하지 않음
    if (loading || allAnnouncements.length === 0) return;

    // localStorage에서 오늘 하루 그만보기 설정 확인
    if (shouldHideModal()) {
      console.log('[Subsidy] 오늘 하루 그만보기 설정됨 - 자동 팝업 억제');
      return;
    }

    // 신청 가능한 공고 개수 계산 (마감일이 없거나 오늘 이후인 공고)
    const activeCount = allAnnouncements.filter(a => {
      if (!a.application_period_end) return true;
      return new Date(a.application_period_end) >= new Date();
    }).length;

    // 신청 가능한 공고가 있으면 자동으로 모달 표시
    if (activeCount > 0) {
      console.log('[Subsidy] 신청 가능한 공고 발견 - 자동 팝업 표시:', activeCount, '건');
      setModalOpenMode('auto');
      setShowActiveAnnouncementsModal(true);
    }
  }, [loading, allAnnouncements]);

  // 클라이언트 사이드 필터링 (useMemo로 자동 적용)
  const filteredAnnouncements = useMemo(() => {
    let filtered = allAnnouncements;

    // 상태 필터
    if (filterStatus !== 'all') {
      filtered = filtered.filter(a => a.status === filterStatus);
    }

    // 관련성 필터
    if (filterRelevant === 'true') {
      filtered = filtered.filter(a => a.relevance_score && a.relevance_score >= 0.75);
    } else if (filterRelevant === 'false') {
      filtered = filtered.filter(a => !a.relevance_score || a.relevance_score < 0.75);
    }

    // 수동/자동 필터
    if (filterManual === 'manual') {
      filtered = filtered.filter(a => a.is_manual);
    } else if (filterManual === 'crawled') {
      filtered = filtered.filter(a => !a.is_manual);
    }

    // 검색어 필터 (실시간)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => {
        const searchableText = [
          a.title,
          a.region_name,
          a.target_description,
          a.support_amount,
          ...(a.keywords_matched || [])
        ].join(' ').toLowerCase();
        return searchableText.includes(query);
      });
    }

    return filtered;
  }, [allAnnouncements, filterStatus, filterRelevant, filterManual, searchQuery]);

  // 페이지네이션 적용
  const paginatedAnnouncements = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAnnouncements.slice(startIndex, endIndex);
  }, [filteredAnnouncements, currentPage, pageSize]);

  // 페이지네이션 정보
  const totalPages = Math.ceil(filteredAnnouncements.length / pageSize);
  const hasMore = currentPage < totalPages;

  // 상태 업데이트
  const updateAnnouncementStatus = async (id: string, status: AnnouncementStatus) => {
    try {
      const response = await fetch('/api/subsidy-announcements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });

      if (response.ok) {
        setAllAnnouncements(prev =>
          prev.map(a => (a.id === id ? { ...a, status } : a))
        );
        if (selectedAnnouncement?.id === id) {
          setSelectedAnnouncement(prev => prev ? { ...prev, status } : null);
        }
        loadStats();
      }
    } catch (error) {
      console.error('상태 업데이트 실패:', error);
    }
  };

  // 읽음 처리 (낙관적 업데이트)
  const markAsRead = async (announcement: SubsidyAnnouncement) => {
    if (announcement.is_read) return;

    // 낙관적 업데이트: UI 먼저 업데이트
    setAllAnnouncements(prev =>
      prev.map(a => (a.id === announcement.id ? { ...a, is_read: true } : a))
    );

    // 통계도 즉시 업데이트 (읽지 않은 수 -1)
    setStats(prev => prev ? { ...prev, unread_count: Math.max(0, prev.unread_count - 1) } : prev);

    try {
      const response = await fetch('/api/subsidy-announcements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: announcement.id, is_read: true }),
      });

      const result = await response.json();

      if (!result.success) {
        // 실패 시 롤백
        console.error('읽음 처리 실패:', result.error);
        setAllAnnouncements(prev =>
          prev.map(a => (a.id === announcement.id ? { ...a, is_read: false } : a))
        );
        setStats(prev => prev ? { ...prev, unread_count: prev.unread_count + 1 } : prev);
      }
    } catch (error) {
      // 에러 시 롤백
      console.error('읽음 처리 실패:', error);
      setAllAnnouncements(prev =>
        prev.map(a => (a.id === announcement.id ? { ...a, is_read: false } : a))
      );
      setStats(prev => prev ? { ...prev, unread_count: prev.unread_count + 1 } : prev);
    }
  };

  /**
   * 공고 생성 - 낙관적 업데이트
   * @param newAnnouncement - 생성할 공고 데이터
   * @returns { success: boolean, data?: any, error?: string }
   */
  const createAnnouncement = useCallback(async (newAnnouncement: any) => {
    console.log('➕ [createAnnouncement] 생성 시작');

    // 1. 임시 ID 생성 (실제 ID는 API 응답에서)
    const tempId = `temp-${Date.now()}`;
    const tempAnnouncement: SubsidyAnnouncement = {
      ...newAnnouncement,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_manual: true,
      is_read: false,
      status: 'new' as const,
      relevance_score: null,
      is_relevant: false,
      keywords_matched: [],
      crawled_at: null,
      created_by: user?.id || null,
    };

    // 2. 낙관적 업데이트 (UI에 즉시 추가)
    setAllAnnouncements(prev => [tempAnnouncement, ...prev]);

    try {
      // 3. API 호출
      const token = TokenManager.getToken();
      if (!token) {
        throw new Error('인증 토큰이 없습니다.');
      }

      const response = await fetch('/api/subsidy-announcements/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newAnnouncement)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '공고 등록에 실패했습니다.');
      }

      // 4. 성공: 임시 항목을 실제 데이터로 교체
      setAllAnnouncements(prev =>
        prev.map(a => a.id === tempId ? result.data : a)
      );

      // 5. 통계 새로고침
      loadStats();

      console.log('✅ [createAnnouncement] 생성 성공:', result.data.id);
      return { success: true, data: result.data, duplicate_warning: result.duplicate_warning };

    } catch (error) {
      // 6. 실패: 임시 항목 제거 (롤백)
      console.error('❌ [createAnnouncement] 생성 실패 - 자동 롤백:', error);
      setAllAnnouncements(prev => prev.filter(a => a.id !== tempId));

      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      return { success: false, error: errorMessage };
    }
  }, [user?.id, loadStats]);

  /**
   * 공고 수정 - 낙관적 업데이트
   * @param id - 공고 ID
   * @param updates - 수정할 데이터
   * @returns { success: boolean, error?: string }
   */
  const updateAnnouncement = useCallback(async (id: string, updates: any) => {
    console.log('📝 [updateAnnouncement] 수정 시작:', id);

    // 1. 원본 데이터 백업 (롤백용)
    const originalAnnouncements = [...allAnnouncements];

    try {
      // 2. 낙관적 업데이트 (UI에 즉시 반영)
      setAllAnnouncements(prev =>
        prev.map(a => a.id === id ? { ...a, ...updates, updated_at: new Date().toISOString() } : a)
      );

      // 3. API 호출
      const token = TokenManager.getToken();
      if (!token) {
        throw new Error('인증 토큰이 없습니다.');
      }

      const response = await fetch('/api/subsidy-announcements/manual', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id, ...updates })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '공고 수정에 실패했습니다.');
      }

      console.log('✅ [updateAnnouncement] 수정 성공:', id);
      return { success: true };

    } catch (error) {
      // 4. 실패: 원본 데이터로 롤백
      console.error('❌ [updateAnnouncement] 수정 실패 - 자동 롤백:', id, error);
      setAllAnnouncements(originalAnnouncements);

      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      return { success: false, error: errorMessage };
    }
  }, [allAnnouncements]);

  /**
   * 공고 삭제 - 낙관적 업데이트
   * @param id - 삭제할 공고 ID
   * @returns { success: boolean, message?: string, error?: string }
   */
  const deleteAnnouncement = useCallback(async (id: string) => {
    console.log('🗑️ [deleteAnnouncement] 삭제 시작:', id);

    // 1. 원본 데이터 백업 (롤백용)
    const originalAnnouncements = [...allAnnouncements];

    try {
      // 2. 낙관적 업데이트 (UI에서 즉시 제거)
      setAllAnnouncements(prev => prev.filter(a => a.id !== id));

      // 3. API 호출
      const token = TokenManager.getToken();
      if (!token) {
        throw new Error('인증 토큰이 없습니다.');
      }

      const response = await fetch(`/api/subsidy-announcements/manual?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '삭제에 실패했습니다.');
      }

      // 4. 성공: 통계 새로고침
      console.log('✅ [deleteAnnouncement] 삭제 성공:', id);
      loadStats();

      return { success: true, message: '삭제 완료' };

    } catch (error) {
      // 5. 실패: 원본 데이터로 자동 롤백
      console.error('❌ [deleteAnnouncement] 삭제 실패 - 자동 롤백:', id, error);
      setAllAnnouncements(originalAnnouncements);

      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      return { success: false, error: errorMessage };
    }
  }, [allAnnouncements, loadStats]);

  // 숫자 포맷팅 함수 (천단위 콤마)
  const formatNumber = (value: string | null | undefined): string => {
    if (!value) return '-';
    // 숫자만 추출
    const numbers = value.replace(/[^\d]/g, '');
    if (!numbers) return value; // 숫자가 없으면 원본 반환
    // 천단위 콤마 추가
    const formatted = numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // "원" 문자가 있으면 유지
    return value.includes('원') ? `${formatted}원` : formatted;
  };

  // 제목에서 실제 대상 지역명 추출
  // 패턴: [출처지역] [대상지역] 제목... 또는 [대상지역] 제목...
  // 지역명 추출 (region_name 우선, 없으면 제목에서 추출)
  const extractRegionFromTitle = (title: string, regionName: string): string => {
    // region_name이 있으면 우선 사용 (IoT 같은 잘못된 추출 방지)
    if (regionName && regionName.trim()) {
      return regionName;
    }

    // region_name이 없으면 제목에서 추출
    // 모든 대괄호 내용 추출
    const bracketMatches = title.match(/\[([^\]]+)\]/g);
    if (!bracketMatches || bracketMatches.length === 0) {
      return '미분류';
    }

    // 지역명 매핑 (약어 → 전체 지역명)
    const regionMap: Record<string, string> = {
      '서울': '서울특별시',
      '부산': '부산광역시',
      '대구': '대구광역시',
      '인천': '인천광역시',
      '광주': '광주광역시',
      '대전': '대전광역시',
      '울산': '울산광역시',
      '세종': '세종특별자치시',
      '경기': '경기도',
      '강원': '강원특별자치도',
      '충북': '충청북도',
      '충남': '충청남도',
      '전북': '전북특별자치도',
      '전남': '전라남도',
      '경북': '경상북도',
      '경남': '경상남도',
      '제주': '제주특별자치도',
    };

    // 출처 사이트 패턴 (이것들은 건너뛰어야 함)
    const sourcePatterns = [
      '서울특별시', '부산광역시', '대구광역시', '인천광역시',
      '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
      '경기도', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
    ];

    // 광역시/특별시/도 전체 이름 패턴 (출처로 사용되는 경우가 많음)
    const fullNameSourcePatterns = [
      /^서울특별시$/,
      /^부산광역시$/,
      /^대구광역시$/,
      /^인천광역시$/,
      /^광주광역시$/,
      /^대전광역시$/,
      /^울산광역시$/,
      /^세종특별자치시$/,
    ];

    // 대괄호 내용들을 순회하며 실제 대상 지역 찾기
    const extractedRegions = bracketMatches.map(m => m.replace(/[\[\]]/g, ''));

    // 대괄호가 2개 이상이고 첫 번째가 광역시/특별시 전체명이면 두 번째 사용
    if (extractedRegions.length >= 2) {
      const firstRegion = extractedRegions[0];
      const isFirstSourcePattern = fullNameSourcePatterns.some(p => p.test(firstRegion));

      if (isFirstSourcePattern) {
        // 첫 번째는 출처, 두 번째가 실제 대상 지역
        const targetRegion = extractedRegions[1];
        return regionMap[targetRegion] || targetRegion;
      }
    }

    // 대괄호가 1개이거나 첫 번째가 출처가 아니면 첫 번째 사용
    const region = extractedRegions[0];
    return regionMap[region] || region;
  };

  // 타이틀에서 출처 지역 대괄호 제거
  // 예: "[서울특별시] [전북] 고창군..." → "[전북] 고창군..."
  const cleanTitle = (title: string): string => {
    // 광역시/특별시 전체 이름 패턴 (출처로 사용되는 경우)
    const sourcePatterns = [
      /^\[서울특별시\]\s*/,
      /^\[부산광역시\]\s*/,
      /^\[대구광역시\]\s*/,
      /^\[인천광역시\]\s*/,
      /^\[광주광역시\]\s*/,
      /^\[대전광역시\]\s*/,
      /^\[울산광역시\]\s*/,
      /^\[세종특별자치시\]\s*/,
    ];

    // 출처 패턴으로 시작하면 제거
    for (const pattern of sourcePatterns) {
      if (pattern.test(title)) {
        return title.replace(pattern, '');
      }
    }
    return title;
  };

  // 날짜 포맷
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // D-day 계산
  const getDaysRemaining = (endDate?: string) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading) {
    return (
      <AdminLayout
        title="보조금 공고 모니터링"
        description="IoT 지원사업 관련 공고를 확인하세요"
      >
        <div className="flex items-center justify-center py-8 sm:py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-gray-600">공고 목록을 불러오는 중...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="보조금 공고 모니터링"
      description="IoT 지원사업 관련 공고를 확인하세요"
    >
      <div className="space-y-6">
        {/* 통계 카드 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 md:gap-3 mb-4 sm:mb-6">
            <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-3">
              <div className="text-xs sm:text-xs text-gray-500">관련 공고</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-blue-600">
                {stats.total_announcements}
              </div>
            </div>
            <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-3">
              <div className="text-xs sm:text-xs text-gray-500">높은 관련성</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-blue-700">
                {stats.relevant_announcements}
              </div>
            </div>
            <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-3">
              <div className="text-xs sm:text-xs text-gray-500">읽지 않음</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-red-600">
                {stats.unread_count}
              </div>
            </div>
            <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-3">
              <div className="text-xs sm:text-xs text-gray-500">이번 주 신규</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-green-600">
                {stats.new_this_week}
              </div>
            </div>
            <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-3">
              <div className="text-xs sm:text-xs text-gray-500">마감 임박 (7일)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-orange-600">
                {stats.expiring_soon}
              </div>
            </div>
          </div>
        )}

        {/* URL 데이터 관리 - 권한 4(슈퍼 관리자)만 접근 가능 */}
        {!authLoading && user && user.role >= 4 && (
          <UrlDataManager onUploadComplete={loadStats} user={user} supabase={supabase} />
        )}

        {/* 수동 공고 등록 버튼 - 게스트 제외, 일반 사용자 이상(권한 1~4) 접근 가능 */}
        {!authLoading && user && !permissions?.isGuest && (
          <div className="bg-white rounded-md md:rounded-lg shadow p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm sm:text-base mb-1">✍️ 수동 공고 등록</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  크롤링으로 수집되지 않은 공고를 직접 등록할 수 있습니다.
                </p>
              </div>
              <button
                onClick={() => setShowManualUploadModal(true)}
                className="px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs sm:text-sm font-medium whitespace-nowrap"
              >
                + 수동 등록
              </button>
            </div>
          </div>
        )}

        {/* 디버깅: 권한 정보 표시 (시스템 관리자만) */}
        {process.env.NODE_ENV === 'development' && user?.role === 4 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mb-4 text-xs">
            <strong>🔍 권한 디버그:</strong>
            {authLoading ? ' 로딩 중...' : (
              user ? (
                <>
                  {' '}사용자 Role: {user.role} |
                  URL 관리 접근: {user.role >= 4 ? '✅ 가능' : '❌ 불가능'}
                </>
              ) : ' ⚠️ 사용자 정보 없음'
            )}
          </div>
        )}

        {/* 필터 */}
        <div className="bg-white rounded-md md:rounded-lg shadow mb-4 sm:mb-6 p-2 sm:p-3 md:p-3">
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
            <div>
              <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">상태</label>
              <select
                value={filterStatus}
                onChange={e => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="border rounded px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
              >
                <option value="all">전체</option>
                <option value="new">신규</option>
                <option value="reviewing">검토중</option>
                <option value="applied">신청완료</option>
                <option value="expired">마감</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">관련성</label>
              <select
                value={filterRelevant}
                onChange={e => {
                  setFilterRelevant(e.target.value);
                  setCurrentPage(1);
                }}
                className="border rounded px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
              >
                <option value="true">관련 공고만 (75%↑)</option>
                <option value="all">전체</option>
                <option value="false">무관</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">출처</label>
              <select
                value={filterManual}
                onChange={e => {
                  setFilterManual(e.target.value);
                  setCurrentPage(1);
                }}
                className="border rounded px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
              >
                <option value="all">전체</option>
                <option value="manual">✍️ 수동등록</option>
                <option value="crawled">🤖 자동수집</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] sm:text-xs text-gray-500 mb-1">검색 (실시간 필터링)</label>
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="제목, 지역명으로 검색..."
                className="w-full border rounded px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
              />
            </div>
            {/* 신청 가능한 공고 버튼 */}
            <div>
              <label className="block text-[10px] sm:text-xs text-gray-500 mb-1 opacity-0">버튼</label>
              <button
                onClick={() => {
                  setModalOpenMode('manual');
                  setShowActiveAnnouncementsModal(true);
                }}
                className="px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all text-sm font-medium whitespace-nowrap shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="hidden sm:inline">신청가능 공고</span>
                <span className="sm:hidden">공고</span>
              </button>
            </div>
          </div>
        </div>

        {/* 공고 목록 */}
        <div className="bg-white rounded-md md:rounded-lg shadow">
          {paginatedAnnouncements.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-gray-500">
              <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">📋</div>
              <p className="text-sm sm:text-base">조회된 공고가 없습니다.</p>
              <p className="text-xs sm:text-sm mt-2">
                {searchQuery || filterStatus !== 'all' || filterRelevant !== 'true'
                  ? '필터 조건을 변경해보세요.'
                  : '크롤러가 실행되면 공고가 자동으로 수집됩니다.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {paginatedAnnouncements.map(announcement => {
                const daysRemaining = getDaysRemaining(announcement.application_period_end);
                const isUrgent = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;

                return (
                  <div
                    key={`${announcement.id}-${announcement.is_read}`}
                    className={`p-2 sm:p-3 md:p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !announcement.is_read ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() => {
                      setSelectedAnnouncement(announcement);
                      markAsRead(announcement);
                    }}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      {/* 읽지 않음 표시 */}
                      <div className="flex-shrink-0 pt-1">
                        {!announcement.is_read && (
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-600 rounded-full"></div>
                        )}
                      </div>

                      {/* 메인 콘텐츠 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                          <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded ${statusColors[announcement.status].bg} ${statusColors[announcement.status].text}`}>
                            {statusColors[announcement.status].label}
                          </span>
                          {announcement.is_manual ? (
                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-medium">
                              ✍️ 수동등록
                            </span>
                          ) : (
                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                              🤖 자동수집
                            </span>
                          )}
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            {extractRegionFromTitle(announcement.title, announcement.region_name)}
                          </span>
                          {isUrgent && (
                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                              D-{daysRemaining}
                            </span>
                          )}
                        </div>

                        <h3 className="font-medium text-xs sm:text-sm text-gray-900 truncate">
                          {cleanTitle(announcement.title)}
                        </h3>

                        <div className="flex items-center gap-2 sm:gap-4 mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                          {announcement.application_period_end && (
                            <span>
                              마감: {formatDate(announcement.application_period_end)}
                            </span>
                          )}
                          {announcement.budget && (
                            <span className="hidden sm:inline">예산: {formatNumber(announcement.budget)}</span>
                          )}
                          {announcement.is_manual ? (
                            <span className="text-purple-600 font-semibold">
                              관련도: 100% <span className="text-gray-500 font-normal">(수동등록)</span>
                            </span>
                          ) : (
                            announcement.relevance_score && (
                              <span>
                                관련도: {Math.round(announcement.relevance_score * 100)}%{' '}
                                <span className="text-gray-500">(AI분석)</span>
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      {/* 게시일 */}
                      <div className="flex-shrink-0 text-[10px] sm:text-xs text-gray-400">
                        {formatDate(announcement.published_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 페이지네이션 */}
          {filteredAnnouncements.length > 0 && (
            <div className="flex items-center justify-between border-t pt-2 sm:pt-3 mt-2 sm:mt-3 px-2 sm:px-3 pb-2 sm:pb-3">
              <div className="text-xs sm:text-sm text-gray-600">
                총 <span className="font-medium">{filteredAnnouncements.length}</span>건 중{' '}
                <span className="font-medium">
                  {(currentPage - 1) * pageSize + 1}-
                  {Math.min(currentPage * pageSize, filteredAnnouncements.length)}
                </span>건 표시
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage <= 1}
                  className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← 이전
                </button>
                <span className="text-xs sm:text-sm text-gray-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={!hasMore}
                  className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음 →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 상세 모달 - 새로운 프리미엄 디자인 */}
        {selectedAnnouncement && (
          <AnnouncementDetailModal
            announcement={selectedAnnouncement}
            currentUserId={user?.id}
            userPermissionLevel={user?.role}
            isGuest={permissions?.isGuest || false}
            onClose={() => {
              setSelectedAnnouncement(null);
              // 신청가능한공고 모달에서 왔으면 다시 그 모달로 복귀
              if (fromActiveModal) {
                setShowActiveAnnouncementsModal(true);
                setFromActiveModal(false);
              }
            }}
            onDelete={deleteAnnouncement}
            onEdit={(announcement) => {
              setEditingAnnouncement(announcement);
              setSelectedAnnouncement(null);
            }}
          />
        )}

        {/* 수동 공고 등록/수정 모달 */}
        <ManualUploadModal
          isOpen={showManualUploadModal || editingAnnouncement !== null}
          onClose={() => {
            setShowManualUploadModal(false);
            setEditingAnnouncement(null);
          }}
          editMode={editingAnnouncement !== null}
          existingData={editingAnnouncement}
          onSuccess={async (announcementData, editMode) => {
            if (editMode) {
              // 수정 모드: updateAnnouncement 호출
              return await updateAnnouncement(editingAnnouncement!.id, announcementData);
            } else {
              // 생성 모드: createAnnouncement 호출
              return await createAnnouncement(announcementData);
            }
          }}
        />

        {/* 신청 가능한 공고 모달 */}
        {showActiveAnnouncementsModal && (
          <ActiveAnnouncementsModal
            isOpen={showActiveAnnouncementsModal}
            openMode={modalOpenMode}
            onClose={() => {
              setShowActiveAnnouncementsModal(false);
              setFromActiveModal(false);
              setModalOpenMode(null);
            }}
            announcements={allAnnouncements}
            registeredRegions={registeredRegions}
            onAnnouncementClick={(announcement) => {
              setSelectedAnnouncement(announcement);
              markAsRead(announcement);
              setShowActiveAnnouncementsModal(false);
              setFromActiveModal(true); // 신청가능한공고 모달에서 왔음을 표시
              setModalOpenMode(null);
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}
