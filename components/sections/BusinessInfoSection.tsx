'use client';

import { useState, useEffect } from 'react';
import { Building2, MapPin, Phone, Calendar, User, Navigation, ExternalLink, X } from 'lucide-react';
import { BusinessInfo } from '@/types';
import { createPhoneLink, createNavigationLinks, startKakaoNavi } from '@/utils/contact';

interface BusinessInfoSectionProps {
  businessInfo: BusinessInfo;
}

export default function BusinessInfoSection({ businessInfo }: BusinessInfoSectionProps) {
  const [contactInfo, setContactInfo] = useState<BusinessInfo>(businessInfo);
  const [loading, setLoading] = useState(false);
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');

  // 연락처 정보 로드 (기본값 사용)
  useEffect(() => {
    setContactInfo(businessInfo);
    setLoading(false);
  }, [businessInfo]);

  // 네비게이션 모달 열기
  const handleNavigationClick = (address: string) => {
    setSelectedAddress(address);
    setShowNavigationModal(true);
  };

  // 네비게이션 앱 열기
  const openNavigationApp = async (app: 'tmap' | 'naver' | 'kakao') => {
    const links = createNavigationLinks(selectedAddress);

    if (!links) {
      alert('주소 정보가 없습니다.');
      return;
    }

    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 카카오내비는 Kakao JavaScript SDK 사용 (공식 방법)
    if (app === 'kakao') {
      try {
        await startKakaoNavi(selectedAddress);
      } catch (error) {
        console.error('카카오내비 실행 오류:', error);
        // 에러는 startKakaoNavi 함수 내부에서 사용자에게 이미 알림
      }
    } else {
      // 티맵, 네이버는 기존 동기 방식
      if (!isMobile && app === 'naver') {
        // PC에서는 네이버 지도 웹 버전으로
        window.open(`https://map.naver.com/v5/search/${encodeURIComponent(selectedAddress)}`, '_blank');
      } else {
        // 모바일에서는 앱 링크로
        window.location.href = links[app];

        // 앱이 없으면 웹 버전으로 fallback (2초 후)
        setTimeout(() => {
          if (app === 'naver') {
            window.open(`https://map.naver.com/v5/search/${encodeURIComponent(selectedAddress)}`, '_blank');
          }
        }, 2000);
      }
    }

    setShowNavigationModal(false);
  };

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-sm border border-gray-100/50">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">사업장 정보</h2>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">연락처 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Building2 className="w-6 h-6 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">사업장 정보</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">사업장명</p>
              <p className="text-lg font-semibold text-gray-800">
                {contactInfo.사업장명 || businessInfo.businessName || businessInfo.사업장명 || '정보 없음'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">주소</p>
              <div className="flex items-center justify-between">
                <p className="text-gray-800 flex-1">{contactInfo.주소 || '정보 없음'}</p>
                {contactInfo.주소 && contactInfo.주소 !== '정보 없음' && (
                  <button
                    onClick={() => handleNavigationClick(contactInfo.주소!)}
                    className="ml-2 p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                    title="네비게이션으로 길찾기"
                  >
                    <Navigation className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">사업장 연락처</p>
              <div className="flex items-center justify-between">
                {contactInfo.사업장연락처 && contactInfo.사업장연락처 !== '정보 없음' ? (
                  <a
                    href={createPhoneLink(contactInfo.사업장연락처)}
                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors flex-1"
                    title="전화걸기"
                    onClick={(e) => {
                      e.stopPropagation();
                      const phoneLink = createPhoneLink(contactInfo.사업장연락처!);
                      if (phoneLink) {
                        // Let the browser handle tel: protocol natively
                        window.location.href = phoneLink;
                      } else {
                        alert('유효하지 않은 전화번호 형식입니다.');
                      }
                      e.preventDefault();
                    }}
                  >
                    {contactInfo.사업장연락처}
                  </a>
                ) : (
                  <p className="text-gray-800 flex-1">정보 없음</p>
                )}
                {contactInfo.사업장연락처 && contactInfo.사업장연락처 !== '정보 없음' && (
                  <Phone className="w-4 h-4 text-blue-600 ml-2" />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">담당자명</p>
              <div className="flex items-center gap-2">
                <div className="flex flex-wrap gap-2">
                {contactInfo.담당자명 && contactInfo.담당자명 !== '정보 없음' ? (
                  contactInfo.담당자명.split(' ').filter(name => name.trim()).map((name, index) => (
                    <span key={index} className="text-gray-800">
                      {name.trim()}
                      {index < contactInfo.담당자명!.split(' ').filter(n => n.trim()).length - 1 && <span className="text-gray-400 ml-1">/</span>}
                    </span>
                  ))
                ) : (
                  <p className="text-gray-800">정보 없음</p>
                )}
              </div>
                {contactInfo.담당자직급 && contactInfo.담당자직급 !== '정보 없음' && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    {contactInfo.담당자직급}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">담당자 연락처</p>
              <div className="flex items-center justify-between">
                {contactInfo.담당자연락처 && contactInfo.담당자연락처 !== '정보 없음' ? (
                  <div className="flex flex-wrap gap-2 flex-1">
                    {contactInfo.담당자연락처.split(' ').filter(contact => contact.trim()).map((contact, index) => (
                      <a
                        key={index}
                        href={createPhoneLink(contact.trim())}
                        className="text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1"
                        title="전화걸기"
                        onClick={(e) => {
                          e.stopPropagation();
                          const phoneLink = createPhoneLink(contact.trim());
                          if (phoneLink) {
                            // Let the browser handle tel: protocol natively
                            window.location.href = phoneLink;
                          } else {
                            alert('유효하지 않은 전화번호 형식입니다.');
                          }
                          e.preventDefault();
                        }}
                      >
                        <Phone className="w-3 h-3" />
                        {contact.trim()}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-800 flex-1">정보 없음</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">대표자</p>
              <p className="text-gray-800">{contactInfo.대표자 || '정보 없음'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">사업자등록번호</p>
              <p className="text-gray-800">{contactInfo.사업자등록번호 || '정보 없음'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-gray-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">업종</p>
              <p className="text-gray-800">{contactInfo.업종 || '정보 없음'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 네비게이션 앱 선택 모달 */}
      {showNavigationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">네비게이션 앱 선택</h3>
                <button
                  onClick={() => setShowNavigationModal(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">목적지:</p>
                <p className="text-gray-800 font-medium bg-gray-50 p-3 rounded-lg">
                  {selectedAddress}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => openNavigationApp('tmap')}
                  className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-red-600 font-bold text-lg">T</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">티맵 (TMAP)</div>
                    <div className="text-sm text-gray-500">SK텔레콤 내비게이션</div>
                  </div>
                </button>

                <button
                  onClick={() => openNavigationApp('naver')}
                  className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <span className="text-green-600 font-bold text-lg">N</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">네이버지도</div>
                    <div className="text-sm text-gray-500">네이버 지도 서비스</div>
                  </div>
                </button>

                <button
                  onClick={() => openNavigationApp('kakao')}
                  className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <span className="text-yellow-600 font-bold text-lg">K</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">카카오내비</div>
                    <div className="text-sm text-gray-500">카카오 내비게이션</div>
                  </div>
                </button>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setShowNavigationModal(false)}
                  className="w-full py-3 px-4 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}