'use client';

import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Bell, Pin, Plus, Calendar, Paperclip } from 'lucide-react';

// Lazy load modals for better performance
const AnnouncementModal = lazy(() => import('@/components/modals/AnnouncementModal'));
const AllAnnouncementsModal = lazy(() => import('@/components/modals/AllAnnouncementsModal'));

/**
 * 공지사항 데이터 타입
 */
interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  attachment_count?: number;
}

/**
 * 공지사항 보드 컴포넌트
 * - 카드 스타일로 동적 개수 표시 (컨테이너 높이 기반)
 * - 상단 고정 게시물 우선 표시
 * - Level 3+ (SUPER_ADMIN) 작성/수정/삭제 가능
 * - Level 1+ (AUTHENTICATED) 읽기 가능
 */
export default function AnnouncementBoard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLevel, setUserLevel] = useState<number>(3); // TODO: 실제 사용자 권한 레벨 가져오기
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'create' | 'edit'>('view');
  const [isAllModalOpen, setIsAllModalOpen] = useState(false);

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 4; // 페이지당 4개 고정

  /**
   * 공지사항 목록 조회
   */
  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/announcements?page=${currentPage}&limit=${itemsPerPage}`);
      const result = await response.json();

      if (result.success) {
        const newTotal = result.pagination?.total || result.data.length;
        const maxPage = Math.max(1, Math.ceil(newTotal / itemsPerPage));

        // 현재 페이지가 유효하지 않으면 첫 페이지로
        if (currentPage > maxPage && newTotal > 0) {
          setCurrentPage(1);
          return;
        }

        setAnnouncements(result.data);
        setTotalCount(newTotal);
      } else {
        setError(result.error || '공지사항을 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('[공지사항 조회 오류]', err);
      setError('공지사항을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [currentPage]);

  /**
   * 공지사항 클릭 핸들러 (바로 수정 모드로 열기)
   */
  const handleAnnouncementClick = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  /**
   * 새 공지사항 작성 버튼 클릭
   */
  const handleCreateClick = () => {
    setSelectedAnnouncement(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  /**
   * 모달 닫기 및 목록 새로고침
   */
  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedAnnouncement(null);
  };

  /**
   * 모달 성공 처리 (생성/수정/삭제 후)
   */
  const handleModalSuccess = () => {
    fetchAnnouncements();
  };

  /**
   * 날짜 포맷팅
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return '오늘';
    } else if (diffDays === 1) {
      return '어제';
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">공지사항</h2>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">공지사항</h2>
          </div>
        </div>
        <div className="text-center py-8 text-red-500">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">공지사항</h2>
          <span className="text-sm text-gray-500">({announcements.length})</span>
        </div>
        {userLevel >= 3 && (
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            작성
          </button>
        )}
      </div>

      {/* 공지사항 목록 */}
      <div className="p-6 h-[calc(100vh-400px)] overflow-y-auto">
        {announcements.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                onClick={() => handleAnnouncementClick(announcement)}
                className={`
                  p-4 rounded-lg border cursor-pointer transition-all
                  hover:shadow-md hover:border-blue-300
                  ${announcement.is_pinned
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {announcement.is_pinned && (
                        <Pin className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      )}
                      <h3 className="font-medium text-gray-900 truncate">
                        {announcement.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {announcement.content}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(announcement.created_at)}
                      </span>
                      <span>·</span>
                      <span>{announcement.author_name}</span>
                      {Number(announcement.attachment_count) > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-blue-500">
                            <Paperclip className="w-3 h-3" />
                            {announcement.attachment_count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {announcements.length > 0 && (
        <div className="p-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              이전
            </button>
            <span className="text-sm text-gray-600">
              {currentPage} / {Math.ceil(totalCount / itemsPerPage) || 1}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / itemsPerPage), prev + 1))}
              disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
          <button
            onClick={() => setIsAllModalOpen(true)}
            className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            전체 공지사항 보기
          </button>
        </div>
      )}

      {/* 공지사항 모달 - Lazy loaded */}
      {isModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <AnnouncementModal
            isOpen={isModalOpen}
            onClose={handleModalClose}
            announcement={selectedAnnouncement}
            mode={modalMode}
            onSuccess={handleModalSuccess}
          />
        </Suspense>
      )}

      {/* 전체 공지사항 모달 - Lazy loaded */}
      {isAllModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <AllAnnouncementsModal
            isOpen={isAllModalOpen}
            onClose={() => setIsAllModalOpen(false)}
            onAnnouncementClick={(announcement) => {
              setSelectedAnnouncement(announcement);
              setModalMode('edit');
              setIsModalOpen(true);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
