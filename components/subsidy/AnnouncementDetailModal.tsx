'use client';

import { useState } from 'react';
import { SubsidyAnnouncement, AnnouncementStatus } from '@/types/subsidy';
import { X, Calendar, MapPin, DollarSign, Target, Link as LinkIcon, Edit, Trash2, ExternalLink } from 'lucide-react';
import { TokenManager } from '@/lib/api-client';

interface AnnouncementDetailModalProps {
  announcement: SubsidyAnnouncement;
  currentUserId?: string;
  userPermissionLevel?: number;
  isGuest?: boolean; // 게스트 사용자 여부
  onClose: () => void;
  onDelete: (id: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  onEdit: (announcement: SubsidyAnnouncement) => void;
}

const statusColors: Record<AnnouncementStatus, { bg: string; text: string; border: string; label: string }> = {
  new: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: '신규' },
  reviewing: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', label: '검토중' },
  applied: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: '신청완료' },
  expired: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: '마감' },
  not_relevant: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: '무관' },
};

// 숫자 포맷팅 함수 (천단위 콤마)
const formatNumber = (value: string | null | undefined): string => {
  if (!value) return '-';
  // 숫자만 추출
  const numbers = value.replace(/[^\d]/g, '');
  if (!numbers) return value; // 숫자가 없으면 원본 반환
  // 천단위 콤마 추가
  return numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export default function AnnouncementDetailModal({
  announcement,
  currentUserId,
  userPermissionLevel = 1,
  isGuest = false,
  onClose,
  onDelete,
  onEdit
}: AnnouncementDetailModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  // 수정/삭제 권한 체크 - 게스트는 수정/삭제 불가
  const canEdit = !isGuest && announcement.is_manual && (
    announcement.created_by === currentUserId || userPermissionLevel >= 4
  );

  const handleDelete = async () => {
    if (!confirm('정말 이 공고를 삭제하시겠습니까?')) return;

    setIsDeleting(true);

    // 부모 컴포넌트의 낙관적 삭제 함수 호출
    const result = await onDelete(announcement.id);

    if (result.success) {
      // 성공: 모달 닫고 메시지 표시
      onClose();
      alert(result.message || '공고가 삭제되었습니다.');
    } else {
      // 실패: 에러 메시지 표시 (롤백은 부모가 처리)
      alert(result.error || '삭제 중 오류가 발생했습니다.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden transform transition-all animate-slideUp">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-3 mb-3">
            <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border-2 ${statusColors[announcement.status].bg} ${statusColors[announcement.status].text} ${statusColors[announcement.status].border}`}>
              {statusColors[announcement.status].label}
            </span>
            {announcement.is_manual && (
              <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-purple-100 text-purple-700 border-2 border-purple-200">
                ✍️ 수동등록
              </span>
            )}
            {announcement.is_relevant && (
              <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-white/20 backdrop-blur">
                ✨ 관련 {announcement.relevance_score ? `${Math.round(announcement.relevance_score * 100)}%` : ''}
              </span>
            )}
          </div>

          <h2 className="text-base md:text-lg font-bold leading-tight mb-2">
            {announcement.title}
          </h2>

          <div className="flex items-center gap-2 text-white/90">
            <MapPin className="w-4 h-4" />
            <span className="text-xs sm:text-sm">{announcement.region_name}</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Action buttons for editable announcements */}
          {canEdit && (
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => onEdit(announcement)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm text-xs md:text-xs"
              >
                <Edit className="w-3 h-3 md:w-4 md:h-4" />
                수정
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-sm disabled:opacity-50 text-xs md:text-xs"
              >
                <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          )}

          {/* Application period */}
          {(announcement.application_period_start || announcement.application_period_end) && (
            <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
              <div className="flex items-center gap-2 text-blue-900 font-semibold mb-3">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-sm md:text-base">신청 기간</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                {announcement.application_period_start && (
                  <span className="text-xs sm:text-sm md:text-sm font-medium">{new Date(announcement.application_period_start).toLocaleDateString('ko-KR')}</span>
                )}
                {announcement.application_period_start && announcement.application_period_end && (
                  <span className="text-xs sm:text-sm text-gray-400">~</span>
                )}
                {announcement.application_period_end && (
                  <span className="text-xs sm:text-sm md:text-sm font-medium">{new Date(announcement.application_period_end).toLocaleDateString('ko-KR')}</span>
                )}
              </div>
            </div>
          )}

          {/* Budget & Support amount grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {announcement.budget && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
                <div className="flex items-center gap-2 text-green-900 font-semibold mb-2">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-sm sm:text-sm md:text-base">예산 규모</span>
                </div>
                <div className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                  {formatNumber(announcement.budget)}
                  {announcement.budget.includes('원') ? '' : '원'}
                </div>
              </div>
            )}

            {announcement.support_amount && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
                <div className="flex items-center gap-2 text-amber-900 font-semibold mb-2">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="text-sm sm:text-sm md:text-base">지원 금액</span>
                </div>
                <div className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                  {formatNumber(announcement.support_amount)}
                  {announcement.support_amount.includes('원') ? '' : '원'}
                </div>
              </div>
            )}
          </div>

          {/* Target description */}
          {announcement.target_description && (
            <div className="mb-6 bg-gray-50 rounded-xl p-5 border border-gray-200">
              <div className="flex items-center gap-2 text-gray-900 font-semibold mb-3">
                <Target className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-sm md:text-base">지원 대상</span>
              </div>
              <div className="text-xs sm:text-sm md:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {announcement.target_description}
              </div>
            </div>
          )}

          {/* Content */}
          {announcement.content && (
            <div className="mb-6">
              <div className="text-sm sm:text-sm md:text-base text-gray-900 font-semibold mb-3">공고 내용</div>
              <div className="bg-white rounded-xl p-5 border border-gray-200 text-xs sm:text-sm md:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                {announcement.content}
              </div>
            </div>
          )}

          {/* Keywords */}
          {announcement.keywords_matched && announcement.keywords_matched.length > 0 && (
            <div className="mb-6">
              <div className="text-sm sm:text-sm md:text-base text-gray-900 font-semibold mb-3">매칭 키워드</div>
              <div className="flex flex-wrap gap-2">
                {announcement.keywords_matched.map((kw, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-xs sm:text-xs md:text-xs font-medium border border-blue-200"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {announcement.notes && (
            <div className="mb-6">
              <div className="text-sm sm:text-sm md:text-base text-gray-900 font-semibold mb-3">메모</div>
              <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200 text-xs sm:text-sm md:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {announcement.notes}
              </div>
            </div>
          )}

          {/* Source URL */}
          <div className="flex flex-wrap gap-2">
            <a
              href={announcement.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-md hover:shadow-lg transform hover:scale-105 text-xs md:text-xs"
            >
              <LinkIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>원문 보기</span>
              <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
            </a>
            <a
              href={`https://web.archive.org/web/*/${announcement.source_url}`}
              target="_blank"
              rel="noopener noreferrer"
              title="원문에 접근할 수 없을 때 인터넷 아카이브에서 저장된 페이지를 확인합니다"
              className="inline-flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-200 transition-all font-medium text-xs md:text-xs"
            >
              <span>캐시 보기</span>
              <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
            </a>
          </div>

          {/* Metadata */}
          <div className="mt-6 pt-6 border-t border-gray-200 text-[10px] sm:text-xs text-gray-500 space-y-1">
            {announcement.published_at && (
              <div>공고 게시일: {new Date(announcement.published_at).toLocaleDateString('ko-KR')}</div>
            )}
            {announcement.crawled_at && (
              <div>수집일: {new Date(announcement.crawled_at).toLocaleDateString('ko-KR')}</div>
            )}
            {announcement.created_at && (
              <div>등록일: {new Date(announcement.created_at).toLocaleDateString('ko-KR')}</div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
