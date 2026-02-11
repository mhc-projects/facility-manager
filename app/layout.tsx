import { Inter, Noto_Sans_KR } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import ClientProviders from '@/components/providers/ClientProviders';

// 폰트 최적화 - 타임아웃 개선
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false, // 개발 환경 성능 개선
  variable: '--font-inter',
  fallback: ['system-ui', 'arial'],
  adjustFontFallback: false // 빌드 시간 단축
});

// 한글 폰트 추가 - 경량화
const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '700'], // 사용하는 폰트만 로드 (300, 500 제거)
  display: 'swap',
  preload: false, // 개발 환경 성능 개선
  variable: '--font-noto-sans-kr',
  fallback: ['Malgun Gothic', 'Apple SD Gothic Neo', 'sans-serif'],
  adjustFontFallback: false // 빌드 시간 단축
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata = {
  title: {
    template: '%s - 시설 관리 시스템',
    default: '시설 관리 시스템',
  },
  description: '실사관리 시스템 - 시설 정보 관리 및 보고서 작성',
  keywords: '시설관리, 실사, 보고서, 시설정보',
  authors: [{ name: '시설관리팀' }],

  // 파비콘 및 아이콘 설정
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },

  // PWA 설정
  manifest: '/manifest.json',
  
  // 성능 최적화
  other: {
    'theme-color': '#2563eb',
    'msapplication-TileColor': '#2563eb',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'format-detection': 'telephone=no',
  },
  
  // 로봇 설정
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${inter.variable} ${notoSansKR.variable}`}>
      <head>
        {/* DNS Prefetch 최적화 */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//googleapis.com" />
        <link rel="dns-prefetch" href="//t1.kakaocdn.net" />
        
        {/* Preconnect for faster connections */}
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        
        {/* Critical CSS - 인라인으로 포함 */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Critical styles for fast rendering */
            *,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
            html{line-height:1.5;-webkit-text-size-adjust:100%;font-family:${inter.style.fontFamily},ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif}
            body{margin:0;line-height:inherit}
            
            /* Loading states */
            .animate-pulse{animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite}
            @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
            
            .animate-spin{animation:spin 1s linear infinite}
            @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
            
            /* Essential layout */
            .min-h-screen{min-height:100vh}
            .bg-gradient-to-br{background-image:linear-gradient(to bottom right,var(--tw-gradient-stops))}
            .from-blue-600{--tw-gradient-from:#2563eb;--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to,rgb(37 99 235 / 0))}
            .to-blue-800{--tw-gradient-to:#1e40af}
            
            /* Critical button styles */
            .btn-primary{background-color:#2563eb;color:white;padding:0.5rem 1.5rem;border-radius:0.5rem;transition:background-color 0.2s}
            .btn-primary:hover{background-color:#1d4ed8}
            .btn-primary:disabled{background-color:#9ca3af;cursor:not-allowed}
          `
        }} />
        
        {/* Service Worker registration - Only in production */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js')
                      .then(function(registration) {
                        console.log('SW registered: ', registration);
                      })
                      .catch(function(registrationError) {
                        console.log('SW registration failed: ', registrationError);
                      });
                  });
                }
              `,
            }}
          />
        )}
      </head>
      <body className={`${notoSansKR.className} antialiased`}>
        {/* Kakao JavaScript SDK */}
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
          integrity="sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />

        {/* 로딩 성능 모니터링 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                if (window.performance && window.performance.timing) {
                  const perfData = window.performance.timing;
                  const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                  console.log('📊 페이지 로드 시간:', pageLoadTime + 'ms');

                  if (pageLoadTime > 3000) {
                    console.warn('⚠️ 페이지 로딩이 3초를 초과했습니다!');
                  }
                }
              });
            `,
          }}
        />

        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
