// Service Worker for PWA and caching
// 🔄 버전 업데이트: f7e256b (iOS 알림 아이콘 수정 - favicon.png, 미지원 옵션 제거)
const CACHE_NAME = 'facility-manager-v1.6';
const STATIC_CACHE_NAME = 'facility-static-v1.6';
const DYNAMIC_CACHE_NAME = 'facility-dynamic-v1.6';

// 캐시할 정적 리소스
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.svg',
];

// 캐시 전략별 URL 패턴
const CACHE_STRATEGIES = {
  // 즉시 캐시 (정적 자산)
  CACHE_FIRST: [
    /\/_next\/static\//,
    /\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$/,
  ],
  
  // 네트워크 우선, 실패 시 캐시
  NETWORK_FIRST: [
    /\/api\/facilities/,
    /\/api\/business/,
  ],
  
  // 캐시 우선, 실패 시 네트워크
  CACHE_FIRST_UPDATE: [
    /\/business\//,
  ],
};

// Service Worker 설치
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker 설치 중...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('💾 정적 리소스 캐싱 중...');
      return cache.addAll(STATIC_ASSETS.filter(Boolean));
    }).catch((error) => {
      console.error('❌ 캐시 설치 실패:', error);
    })
  );
  
  // 즉시 활성화
  self.skipWaiting();
});

// Service Worker 활성화
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker 활성화');
  
  event.waitUntil(
    Promise.all([
      // 오래된 캐시 정리
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('🗑️ 오래된 캐시 삭제:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // 모든 클라이언트에서 즉시 제어
      self.clients.claim()
    ])
  );
});

// 네트워크 요청 인터셉트
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 같은 도메인 요청만 처리
  if (url.origin !== location.origin) {
    return;
  }
  
  // GET 요청만 캐싱
  if (request.method !== 'GET') {
    return;
  }
  
  event.respondWith(handleRequest(request));
});

// 요청 처리 로직
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // 캐시 전략 결정
    const strategy = getCacheStrategy(url.pathname);
    
    switch (strategy) {
      case 'CACHE_FIRST':
        return await cacheFirst(request);
      
      case 'NETWORK_FIRST':
        return await networkFirst(request);
      
      case 'CACHE_FIRST_UPDATE':
        return await cacheFirstUpdate(request);
      
      default:
        return await networkFirst(request);
    }
  } catch (error) {
    console.error('❌ 요청 처리 실패:', error);
    
    // 기본 오프라인 페이지 또는 캐시 시도
    return await caches.match(request) || 
           await caches.match('/') ||
           new Response('오프라인 상태입니다.', { 
             status: 503,
             headers: { 'Content-Type': 'text/plain; charset=utf-8' }
           });
  }
}

// 캐시 전략 결정
function getCacheStrategy(pathname) {
  // 정적 자산
  for (const pattern of CACHE_STRATEGIES.CACHE_FIRST) {
    if (pattern.test(pathname)) {
      return 'CACHE_FIRST';
    }
  }
  
  // API 요청
  for (const pattern of CACHE_STRATEGIES.NETWORK_FIRST) {
    if (pattern.test(pathname)) {
      return 'NETWORK_FIRST';
    }
  }
  
  // 페이지
  for (const pattern of CACHE_STRATEGIES.CACHE_FIRST_UPDATE) {
    if (pattern.test(pathname)) {
      return 'CACHE_FIRST_UPDATE';
    }
  }
  
  return 'NETWORK_FIRST';
}

// 캐시 우선 전략
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('💾 캐시에서 반환:', request.url);
    return cached;
  }
  
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    cache.put(request, response.clone());
    console.log('💾 새로 캐싱:', request.url);
  }
  
  return response;
}

// 네트워크 우선 전략
async function networkFirst(request) {
  try {
    const response = await fetch(request, {
      // API 요청 타임아웃 설정
      signal: AbortSignal.timeout(8000)
    });
    
    if (response.ok) {
      // API 응답 캐싱 (짧은 TTL)
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, response.clone());
      console.log('🌐 네트워크에서 가져와서 캐싱:', request.url);
    }
    
    return response;
  } catch (error) {
    console.log('🔄 네트워크 실패, 캐시에서 찾는 중:', request.url);
    
    const cached = await caches.match(request);
    if (cached) {
      console.log('💾 캐시에서 반환 (오프라인):', request.url);
      return cached;
    }
    
    throw error;
  }
}

// 캐시 우선 + 백그라운드 업데이트
async function cacheFirstUpdate(request) {
  const cached = await caches.match(request);
  
  // 백그라운드에서 업데이트
  const updatePromise = fetch(request).then((response) => {
    if (response.ok && response.body) {
      // Response body가 있고 아직 사용되지 않은 경우만 캐시
      try {
        const cache = caches.open(DYNAMIC_CACHE_NAME);
        cache.then(c => c.put(request, response.clone()));
        console.log('🔄 백그라운드 업데이트:', request.url);
      } catch (error) {
        console.warn('⚠️ 캐시 업데이트 실패 (Response 이미 사용됨):', request.url);
      }
    }
    return response;
  }).catch(() => {
    // 업데이트 실패는 무시
  });
  
  if (cached) {
    console.log('💾 캐시에서 즉시 반환:', request.url);
    return cached;
  }
  
  // 캐시가 없으면 네트워크 대기
  return await updatePromise;
}

// 백그라운드 동기화 (향후 확장용)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('🔄 백그라운드 동기화 실행');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // 오프라인 중 저장된 데이터 동기화 로직
  try {
    const pendingRequests = await getPendingRequests();
    for (const request of pendingRequests) {
      await fetch(request);
    }
    console.log('✅ 백그라운드 동기화 완료');
  } catch (error) {
    console.error('❌ 백그라운드 동기화 실패:', error);
  }
}

async function getPendingRequests() {
  // IndexedDB에서 오프라인 중 저장된 요청들 가져오기
  return [];
}

// 푸시 알림 처리
self.addEventListener('push', (event) => {
  console.log('📨 푸시 알림 수신:', event);

  let notificationData = {
    title: '시설 관리 시스템',
    body: '새로운 알림이 도착했습니다.',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: 'facility-notification',
    data: {},
  };

  // 푸시 데이터 파싱
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        ...pushData
      };
      console.log('푸시 데이터:', pushData);
    } catch (error) {
      console.error('푸시 데이터 파싱 실패:', error);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  // 알림 유형별 설정
  // iOS는 actions, vibrate, renotify 미지원 — 포함 시 알림 드롭될 수 있어 제거
  const notificationOptions = {
    body: notificationData.body || '새로운 알림이 도착했습니다.',
    icon: notificationData.icon,
    badge: notificationData.badge,
    tag: notificationData.tag,
    data: notificationData.data,
    requireInteraction: false,
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title || '시설 관리 시스템', notificationOptions)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('알림 클릭:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  // 알림 닫기
  notification.close();

  if (action === 'dismiss') {
    // 닫기 액션 - 아무것도 하지 않음
    return;
  }

  // 페이지 열기 URL 결정
  let urlToOpen = '/';
  if (data.url) {
    urlToOpen = data.url;
  } else if (data.taskId) {
    urlToOpen = `/admin/tasks?task=${data.taskId}`;
  }

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clients => {
      // 이미 열린 탭이 있는지 확인
      const existingClient = clients.find(client => {
        const clientUrl = new URL(client.url);
        const targetUrl = new URL(urlToOpen, self.location.origin);
        return clientUrl.pathname === targetUrl.pathname;
      });

      if (existingClient) {
        // 기존 탭으로 포커스
        return existingClient.focus();
      } else {
        // 새 탭 열기
        return self.clients.openWindow(new URL(urlToOpen, self.location.origin).href);
      }
    }).catch(error => {
      console.error('알림 클릭 처리 실패:', error);
    })
  );
});

// 알림 닫기 처리
self.addEventListener('notificationclose', (event) => {
  console.log('알림 닫힘:', event);

  const notification = event.notification;
  const data = notification.data || {};

  // 알림 닫기 추적 (필요시)
  if (data.trackClose) {
    event.waitUntil(
      fetch('/api/notifications/track-close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: data.notificationId,
          closedAt: new Date().toISOString()
        })
      }).catch(error => {
        console.error('알림 닫기 추적 실패:', error);
      })
    );
  }
});

// 메시지 처리 (클라이언트와 통신)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATS') {
    getCacheStats().then(stats => {
      event.ports[0].postMessage(stats);
    });
  }
});

// 캐시 통계
async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = {};
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    stats[cacheName] = keys.length;
  }
  
  return stats;
}

// 알림 유형별 액션 정의
function getNotificationActions(type) {
  const baseActions = [
    {
      action: 'view',
      title: '확인',
      icon: '/icon-192.png'
    },
    {
      action: 'dismiss',
      title: '닫기',
      icon: '/icon-192.png'
    }
  ];

  switch (type) {
    case 'task_assigned':
      return [
        {
          action: 'view',
          title: '업무 보기',
          icon: '/icon-192.png'
        },
        {
          action: 'dismiss',
          title: '나중에',
          icon: '/icon-192.png'
        }
      ];

    case 'task_comment':
    case 'mention':
      return [
        {
          action: 'view',
          title: '보기',
          icon: '/icon-192.png'
        },
        {
          action: 'dismiss',
          title: '닫기',
          icon: '/icon-192.png'
        }
      ];

    case 'task_completed':
      return [
        {
          action: 'view',
          title: '확인',
          icon: '/icon-192.png'
        }
      ];

    default:
      return baseActions;
  }
}

console.log('🚀 Service Worker 로드 완료');
