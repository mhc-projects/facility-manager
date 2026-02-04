'use client';

import { useState, useRef, useEffect, memo } from 'react';
import { ImageOptimizer } from '@/utils/image-optimizer';

interface LazyImageProps {
  src: string | string[];
  alt: string;
  className?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  filePath?: string; // Supabase 파일 경로 (URL 재생성용)
  preloadNext?: string[]; // URLs to preload when this image enters viewport
  width?: number;
  height?: number;
  sizes?: string;
}

// Global preload cache to prevent duplicate preloads
const preloadCache = new Set<string>();

// Preload function using resource hints
function preloadImage(url: string) {
  if (preloadCache.has(url)) return;
  preloadCache.add(url);
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

const LazyImage = memo(function LazyImage({
  src,
  alt,
  className = '',
  priority = false,
  quality = 85,
  placeholder = true,
  onLoad,
  onError,
  filePath,
  preloadNext = [],
  width,
  height,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const [currentSrcIndex, setCurrentSrcIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [refreshedUrl, setRefreshedUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Convert src to array for consistent handling
  const srcArray = Array.isArray(src) ? src : [src];
  const currentSrc = refreshedUrl || srcArray[currentSrcIndex];

  // Supabase URL 새로고침 함수
  const refreshSupabaseUrl = async (path: string): Promise<string | null> => {
    try {
      console.log('[LAZY-IMAGE] URL 새로고침 시도:', path);
      const response = await fetch('/api/supabase-url-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.url) {
          console.log('[LAZY-IMAGE] 새 URL 획득:', result.url);
          return result.url;
        }
      }
      
      console.log('[LAZY-IMAGE] URL 새로고침 실패');
      return null;
    } catch (error) {
      console.error('[LAZY-IMAGE] URL 새로고침 오류:', error);
      return null;
    }
  };

  useEffect(() => {
    if (priority) return; // Skip lazy loading for priority images

    const observer = ImageOptimizer.createLazyLoadObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          
          // Preload next images when this one enters viewport
          preloadNext.forEach(url => {
            if (url && !url.includes('undefined')) {
              preloadImage(url);
            }
          });
          
          observer?.unobserve(entry.target);
        }
      });
    });

    observerRef.current = observer;

    if (observer && imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [priority, preloadNext]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = async () => {
    console.log(`[LAZY-IMAGE] 이미지 로드 실패: ${currentSrc} (${currentSrcIndex + 1}/${srcArray.length})`);

    // Supabase URL 새로고침 시도 (filePath가 있고 재시도 횟수가 1회 미만인 경우)
    if (filePath && retryCount < 1 && !refreshedUrl) {
      console.log('[LAZY-IMAGE] Supabase URL 새로고침 시도...');
      const newUrl = await refreshSupabaseUrl(filePath);
      if (newUrl) {
        setRefreshedUrl(newUrl);
        setRetryCount(prev => prev + 1);
        setIsLoaded(false);
        return;
      }
    }

    // Try next URL in array
    if (currentSrcIndex < srcArray.length - 1) {
      console.log(`[LAZY-IMAGE] 다음 URL 시도: ${srcArray[currentSrcIndex + 1]}`);
      setCurrentSrcIndex(prev => prev + 1);
      setIsLoaded(false); // Reset loaded state for new image
    } else {
      console.log('[LAZY-IMAGE] 모든 URL 실패, 에러 상태 설정');

      // 🔧 Orphaned record 자동 정리 요청
      // filePath가 있으면 서버에 파일이 없다는 것을 보고하여 DB 정리 유도
      if (filePath) {
        console.log('[LAZY-IMAGE] Orphaned record 정리 요청:', filePath);
        // 백그라운드에서 실행 (비동기, 에러 무시)
        fetch('/api/uploaded-files-supabase/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath })
        }).catch(err => console.warn('[LAZY-IMAGE] 정리 요청 실패:', err));
      }

      setHasError(true);
      onError?.();
    }
  };

  // Generate optimized image props using current src
  const [imageProps, setImageProps] = useState<any>({
    src: currentSrc,
    alt,
    quality,
    format: 'webp',
    sizes: sizes,
    priority,
    placeholder: 'blur',
    blurDataURL: ImageOptimizer.generateBlurDataURL(),
    style: { maxWidth: '100%', height: 'auto' }
  });

  // 이미지 속성 최적화
  useEffect(() => {
    const optimizeProps = async () => {
      try {
        const optimized = await ImageOptimizer.getOptimizedImageProps(currentSrc, alt, {
          quality,
          priority,
          sizes: [320, 640, 750, 828, 1080, 1200, 1600, 1920],
        });
        setImageProps(optimized);
      } catch (error) {
        console.warn('[LAZY-IMAGE] 이미지 최적화 실패, 기본 설정 사용:', error);
      }
    };

    if (currentSrc) {
      optimizeProps();
    }
  }, [currentSrc, alt, quality, priority, sizes]);

  const shouldShowImage = priority || isInView;

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {/* Placeholder */}
      {placeholder && !isLoaded && !hasError && (
        <div
          className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse"
          style={{
            backgroundImage: `url("${ImageOptimizer.generateBlurDataURL()}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* Actual Image */}
      {shouldShowImage && !hasError && currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          width={width}
          height={height}
          sizes={imageProps.sizes}
          className={`transition-all duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            ...imageProps.style,
            filter: isLoaded ? 'none' : 'blur(3px)',
            transform: isLoaded ? 'scale(1)' : 'scale(1.02)',
          }}
        />
      )}

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center text-gray-500">
            <div className="text-2xl mb-2">📷</div>
            <div className="text-sm">이미지를 불러올 수 없습니다</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default LazyImage;