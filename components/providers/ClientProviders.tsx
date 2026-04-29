'use client';

import { useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { AdminDataProvider } from '@/contexts/AdminDataContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { Toaster } from 'react-hot-toast';
import ReactQueryProvider from '@/app/providers/ReactQueryProvider';

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hydration 에러 방지: 클라이언트에서만 Toaster 렌더링
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Push 구독 자동 갱신: 세션/로그인 여부와 무관하게 실행
    // iOS APNs endpoint 만료 대응 + Android FCM 구독 유지
    import('@/lib/push-notifications').then(({ pushNotificationManager }) => {
      pushNotificationManager.ensureSubscription();
    }).catch(() => {/* 무시 */});
  }, []);

  return (
    <ErrorBoundary>
      <ReactQueryProvider>
        <AuthProvider>
          <AdminDataProvider>
          <NotificationProvider>
            <ToastProvider>
              {children}
              {mounted && (
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 3000,
                    style: {
                      background: '#363636',
                      color: '#fff',
                      padding: '16px',
                      borderRadius: '8px',
                    },
                    success: {
                      duration: 3000,
                      iconTheme: {
                        primary: '#10b981',
                        secondary: '#fff',
                      },
                    },
                    error: {
                      duration: 4000,
                      iconTheme: {
                        primary: '#ef4444',
                        secondary: '#fff',
                      },
                    },
                  }}
                />
              )}
            </ToastProvider>
          </NotificationProvider>
          </AdminDataProvider>
        </AuthProvider>
      </ReactQueryProvider>
    </ErrorBoundary>
  );
}