'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UploadedFile } from '@/types';
import { debounce } from 'lodash';

interface PhotoCaptionInputProps {
  photo: UploadedFile;
  onCaptionSaved?: (caption: string | null) => void;
}

/**
 * 사진 설명(Caption) 입력 컴포넌트
 *
 * - 자동 저장 (Debounce 1000ms, 입력 중단 없음)
 * - 글자수 제한 (500자)
 * - 저장 상태 표시 (비간섭적)
 * - 입력 커서 유지 (Optimistic Update)
 * - 모바일 최적화
 */
export const PhotoCaptionInput: React.FC<PhotoCaptionInputProps> = ({
  photo,
  onCaptionSaved
}) => {
  console.log('🎨 [PhotoCaptionInput] 렌더링됨:', { photoId: photo.id, caption: photo.caption });

  const [caption, setCaption] = useState(photo.caption || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Debounced save function (1000ms) - 입력 완료 후 1초 대기
  const debouncedSave = useCallback(
    debounce(async (newCaption: string) => {
      setIsSaving(true);
      setError(null);

      try {
        console.log('🔄 [Caption API] 저장 시작:', { photoId: photo.id, caption: newCaption });

        const response = await fetch(`/api/uploaded-files-supabase/${photo.id}/caption`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ caption: newCaption || null })
        });

        console.log('📡 [Caption API] 응답 상태:', { status: response.status, ok: response.ok });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ [Caption API] 에러 응답:', errorData);
          throw new Error(errorData.error || '저장 실패');
        }

        const result = await response.json();
        console.log('✅ [Caption API] 저장 성공:', result);

        setSavedAt(new Date());

        // 콜백 호출
        if (onCaptionSaved) {
          onCaptionSaved(newCaption || null);
        }

        console.log('✅ Caption saved:', result.data);

      } catch (err) {
        console.error('❌ Caption save failed:', err);
        setError(err instanceof Error ? err.message : '저장 실패');
      } finally {
        setIsSaving(false);
      }
    }, 1000),
    [photo.id, onCaptionSaved]
  );

  // 입력 핸들러
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCaption = e.target.value;

    // 500자 제한
    if (newCaption.length > 500) {
      return;
    }

    setCaption(newCaption);
    debouncedSave(newCaption);
  };

  // photo.id가 변경될 때만 caption 초기화 (다른 사진으로 이동할 때)
  // photo.caption 의존성 제거 → 입력 중 자동저장이 state를 덮어쓰지 않음
  useEffect(() => {
    setCaption(photo.caption || '');
  }, [photo.id]);

  // 저장 상태 메시지
  const getSaveStatusMessage = () => {
    if (error) {
      return (
        <span className="text-red-600 flex items-center gap-1 text-xs">
          ⚠️ {error}
        </span>
      );
    }

    if (isSaving) {
      return (
        <span className="text-gray-400 flex items-center gap-1 text-xs">
          <span className="inline-block animate-pulse">💾</span>
          저장 중
        </span>
      );
    }

    if (savedAt) {
      return (
        <span className="text-green-600 flex items-center gap-1 text-xs">
          ✓ 저장됨
        </span>
      );
    }

    return null;
  };

  // 글자수 카운터 색상
  const getCounterColor = () => {
    if (caption.length >= 500) {
      return 'text-red-600 font-medium';
    }
    if (caption.length >= 480) {
      return 'text-orange-500';
    }
    return 'text-gray-500';
  };

  return (
    <div className="space-y-2">
      {/* 라벨 */}
      <label
        htmlFor={`caption-${photo.id}`}
        className="block text-sm font-medium text-gray-700"
      >
        📝 설명
      </label>

      {/* 입력창 */}
      <textarea
        ref={inputRef}
        id={`caption-${photo.id}`}
        value={caption}
        onChange={handleChange}
        placeholder="사진에 대한 설명을 입력하세요..."
        maxLength={500}
        rows={3}
        className="
          w-full
          min-h-[80px] sm:min-h-[100px]
          px-3 py-2 sm:px-4 sm:py-3
          text-sm sm:text-base
          border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          resize-none
          transition-all duration-200
          placeholder:text-gray-400
        "
        style={{ WebkitTapHighlightColor: 'transparent' }}
      />

      {/* 하단 정보 */}
      <div className="flex items-center justify-between text-xs">
        {/* 저장 상태 */}
        <div className="flex-1">
          {getSaveStatusMessage()}
        </div>

        {/* 글자수 카운터 */}
        <span className={`${getCounterColor()} transition-colors duration-200`}>
          {caption.length} / 500
        </span>
      </div>

      {/* 글자수 초과 경고 */}
      {caption.length >= 500 && (
        <div className="text-xs text-red-600 flex items-center gap-1">
          ⚠️ 최대 글자수에 도달했습니다
        </div>
      )}
    </div>
  );
};

export default PhotoCaptionInput;
