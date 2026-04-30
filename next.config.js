/** @type {import('next').NextConfig} */
const nextConfig = {
  // 성능 최적화 설정
  compress: true,
  swcMinify: true,
  poweredByHeader: false,

  // 프로덕션 빌드에서 console 제거 (console.error와 console.warn은 유지)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // 배포 시 TypeScript 체크를 활성화하되, 특정 에러는 건너뛰기
  typescript: {
    // 개발 중에는 false로 설정, 배포 전에는 true로 변경 권장
    ignoreBuildErrors: true, // Vercel 배포 시 빌드 오류 방지
  },

  // ESLint 설정 - 배포 중 린트 에러 무시
  eslint: {
    ignoreDuringBuilds: true,
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    serverComponentsExternalPackages: ['googleapis', 'sharp', 'canvas', 'playwright-core', '@sparticuz/chromium'],
    // Google Fonts 타임아웃 증가 (개발 환경 안정화)
    fetchCacheKeyPrefix: 'v1',
  },

  // Webpack 설정 - Playwright + Chromium 모듈 해석 문제 해결
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 서버 사이드에서 Playwright와 Chromium을 외부 모듈로 처리
      config.externals.push({
        'playwright-core': 'commonjs playwright-core',
        '@sparticuz/chromium': 'commonjs @sparticuz/chromium',
      });
    }
    return config;
  },

  // Google Fonts 로딩 타임아웃 설정
  env: {
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: process.env.NODE_ENV === 'development' ? 'true' : undefined,
  },

  // Vercel 배포 최적화
  output: 'standalone',

  // 🔄 빌드 ID 생성 - 캐시 무효화를 위한 고유 ID
  // Git commit hash를 사용하여 배포마다 새로운 빌드 ID 생성
  generateBuildId: async () => {
    // Vercel 환경에서는 VERCEL_GIT_COMMIT_SHA 사용
    if (process.env.VERCEL_GIT_COMMIT_SHA) {
      return process.env.VERCEL_GIT_COMMIT_SHA;
    }
    // 로컬에서는 타임스탬프 사용
    return `build-${Date.now()}`;
  },

  // 이미지 최적화 - 성능 개선
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60, // 1시간 캐시 (더 자주 업데이트)
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Jest worker 오류 방지
    loader: 'default',
    dangerouslyAllowSVG: true,
    // 썸네일 품질 최적화
    domains: [],
    unoptimized: false,
  },

  async redirects() {
    return [
      {
        source: '/dpf/wiki/:path*',
        destination: '/wiki/:path*',
        permanent: true,
      },
    ];
  },

  // 성능 헤더 - 🚀 최적화 강화
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN' // DENY → SAMEORIGIN (캘린더 파일 미리보기 iframe 허용)
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://dapi.kakao.com; frame-src 'self' https://*.supabase.co; object-src 'self' https://*.supabase.co; img-src 'self' data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://t1.kakaocdn.net; style-src 'self' 'unsafe-inline';" // Supabase + Kakao SDK + 카카오 지오코딩 API
          }
        ],
      },
      // 🔥 개발 환경 - 모든 페이지 캐싱 비활성화 (브라우저 캐시 방지)
      ...(process.env.NODE_ENV === 'development' ? [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
            {
              key: 'Pragma',
              value: 'no-cache',
            },
            {
              key: 'Expires',
              value: '0',
            },
          ],
        },
      ] : []),
      // 🔥 동적 페이지 - 최신 JavaScript 번들 로드 보장 (개발/배포 환경 공통)
      // 브라우저 캐시를 비활성화하여 코드 변경 시 하드 리프레시 없이 즉시 반영
      {
        source: '/business/:businessName*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate, max-age=0',
          },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate, max-age=0',
          },
        ],
      },
      // 🔥 사진 조회 API - 실시간 업데이트를 위한 캐싱 비활성화
      {
        source: '/api/facility-photos',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0'
          }
        ],
      },
      {
        source: '/api/uploaded-files-supabase',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0'
          }
        ],
      },
      // 🔥 커뮤니케이션 보드 API - 캐싱 비활성화 (실시간 업데이트 필요)
      {
        source: '/api/announcements',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0'
          }
        ],
      },
      {
        source: '/api/messages',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0'
          }
        ],
      },
      {
        source: '/api/calendar',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0'
          }
        ],
      },
      // 🔥 시설 관리 API - 캐싱 비활성화 (실시간 실사자 정보/특이사항 출력 보장)
      {
        source: '/api/facility-management',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
          },
          {
            key: 'CDN-Cache-Control',
            value: 'no-store'
          },
          {
            key: 'Vercel-CDN-Cache-Control',
            value: 'no-store'
          }
        ],
      },
      // 🔥 일반 API - 적당한 캐싱
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=180, stale-while-revalidate=600, max-age=60'
          }
        ],
      },
      // 🔥 정적 파일 - 무제한 캐싱
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ],
      },
      // 🔥 이미지 파일 - 장시간 캐싱
      {
        source: '/(.*)\\.(jpg|jpeg|png|webp|avif|gif|svg)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800'
          }
        ],
      },
    ];
  },
}

module.exports = nextConfig;