import { useState, useEffect } from 'react';

/**
 * 모바일 화면 감지 커스텀 훅
 * @param breakpoint - 모바일로 간주할 최대 너비 (기본값: 768px)
 * @returns 현재 화면이 모바일인지 여부
 */
export function useIsMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // 초기 체크
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // 마운트 시 체크
    checkMobile();

    // 리사이즈 이벤트 리스너 등록
    window.addEventListener('resize', checkMobile);

    // 클린업
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [breakpoint]);

  return isMobile;
}
