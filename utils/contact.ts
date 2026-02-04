// utils/contact.ts - 연락처 관련 유틸리티 함수들

import { addressToCoordinates } from './geocoding';

// 전화번호에서 특수문자 제거하고 전화걸기 링크 생성
export function createPhoneLink(phoneNumber: string): string {
  if (!phoneNumber) return '';

  // 공백, 하이픈, 괄호 등 제거하고 숫자만 남김
  const cleanNumber = phoneNumber.replace(/[^\d]/g, '');

  // 한국 전화번호 형식 지원:
  // - 휴대폰: 010-XXXX-XXXX (11자리)
  // - 서울: 02-XXX-XXXX (9자리)
  // - 지역: 031-XXX-XXXX (10-11자리)
  // - 최소 8자리 이상이면 유효한 전화번호로 간주
  if (cleanNumber.length >= 8) {
    return `tel:${cleanNumber}`;
  }

  return '';
}

// 주소를 각 네비게이션 앱 URL로 변환
export function createNavigationLinks(address: string) {
  if (!address || address.trim() === '' || address === '정보 없음') {
    return null;
  }

  const encodedAddress = encodeURIComponent(address.trim());

  return {
    tmap: `tmap://search?name=${encodedAddress}`,
    naver: `nmap://search?query=${encodedAddress}&appname=com.facility.manager`,
    kakao: `kakaomap://search?q=${encodedAddress}` // 카카오맵으로 변경 (주소 검색 지원)
  };
}

// Kakao SDK를 사용하여 카카오내비 실행 (공식 방법)
export async function startKakaoNavi(address: string): Promise<void> {
  if (!address || address.trim() === '' || address === '정보 없음') {
    alert('주소 정보가 없습니다.');
    return;
  }

  try {
    // 좌표 변환
    const result = await addressToCoordinates(address);

    if (!result.success || !result.coordinates) {
      throw new Error(result.error || '주소를 찾을 수 없습니다.');
    }

    const { lat, lng } = result.coordinates;

    // Kakao SDK 초기화 확인
    if (typeof window !== 'undefined' && window.Kakao && !window.Kakao.isInitialized()) {
      const kakaoClientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
      if (!kakaoClientId) {
        throw new Error('Kakao Client ID가 설정되지 않았습니다. 환경 변수를 확인해주세요.');
      }
      window.Kakao.init(kakaoClientId);
    }

    // 카카오내비 실행 (공식 SDK 사용)
    if (window.Kakao && window.Kakao.Navi) {
      window.Kakao.Navi.start({
        name: address,
        x: lng, // 경도
        y: lat, // 위도
        coordType: 'wgs84'
      });
    } else {
      throw new Error('Kakao SDK가 로드되지 않았습니다.');
    }
  } catch (error) {
    console.error('[startKakaoNavi] 오류:', error);
    alert(`카카오내비 실행 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

// 주소를 좌표로 변환하여 카카오내비 URL 생성 (비동기) - 폴백용
export async function createKakaoNaviLink(address: string): Promise<string | null> {
  if (!address || address.trim() === '' || address === '정보 없음') {
    return null;
  }

  try {
    const result = await addressToCoordinates(address);

    if (result.success && result.coordinates) {
      const { lat, lng } = result.coordinates;
      // 카카오맵 내비게이션 URL Scheme (폴백)
      return `kakaomap://startnavi?type=safedrive&ep=${lat},${lng}`;
    } else {
      console.warn(`[createKakaoNaviLink] 주소 변환 실패: ${result.error}`);
      // 폴백: 카카오맵 검색으로 대체
      return `kakaomap://search?q=${encodeURIComponent(address.trim())}`;
    }
  } catch (error) {
    console.error('[createKakaoNaviLink] 오류:', error);
    // 폴백: 카카오맵 검색으로 대체
    return `kakaomap://search?q=${encodeURIComponent(address.trim())}`;
  }
}

// 네비게이션 앱이 설치되어 있는지 확인하는 함수 (웹에서는 제한적)
export function openNavigation(address: string) {
  const links = createNavigationLinks(address);
  
  if (!links) {
    alert('주소 정보가 없습니다.');
    return;
  }

  // 모바일 환경 체크
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (!isMobile) {
    // PC에서는 네이버 지도 웹 버전으로
    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`, '_blank');
    return;
  }

  // 모바일에서는 선택 다이얼로그 표시
  const choice = confirm('네비게이션 앱을 선택하세요.\n확인: 티맵\n취소: 네이버지도');
  
  if (choice) {
    // 티맵 시도
    window.location.href = links.tmap;
    
    // 티맵이 없으면 카카오맵으로 fallback
    setTimeout(() => {
      window.location.href = links.kakao;
    }, 2000);
  } else {
    // 네이버지도 시도
    window.location.href = links.naver;
    
    // 네이버지도가 없으면 웹 버전으로 fallback
    setTimeout(() => {
      window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`, '_blank');
    }, 2000);
  }
}