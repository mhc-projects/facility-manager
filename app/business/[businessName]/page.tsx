import { Metadata } from 'next';
import BusinessContent from './BusinessContent';

type Props = {
  params: { businessName: string };
};

// 🔄 실시간 업데이트를 위한 동적 렌더링 강제
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 🚫 페이지 레벨 캐싱 완전 비활성화
export const fetchCache = 'force-no-store';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const businessName = decodeURIComponent(params.businessName);

  return {
    title: businessName, // 템플릿이 자동으로 " - 시설 관리 시스템" 추가
    description: `${businessName}의 시설 정보 관리 및 보고서`,
    openGraph: {
      title: `${businessName} - 시설 관리 시스템`,
      description: `${businessName}의 시설 정보 관리 및 보고서`,
      url: `https://facility.blueon-iot.com/business/${encodeURIComponent(businessName)}`,
      siteName: '시설 관리 시스템',
      type: 'website',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary',
      title: `${businessName} - 시설 관리 시스템`,
      description: `${businessName}의 시설 정보 관리 및 보고서`,
    },
  };
}

export default function BusinessDetailPage() {
  return <BusinessContent />;
}
