'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { X, Shield } from 'lucide-react';
import { authAPI, TokenManager } from '@/lib/api-client';
import { Employee } from '@/types';
import { AUTH_LEVEL_DESCRIPTIONS } from '@/lib/auth/AuthLevels';

interface SocialAccount {
  id: string;
  provider: 'kakao' | 'naver' | 'google';
  provider_user_id: string;
  provider_email: string;
  provider_name: string;
  provider_picture_url?: string;
  connected_at: string;
  last_login_at: string;
  is_primary: boolean;
}

interface AuthContextType {
  user: Employee | null;
  socialAccounts: SocialAccount[] | null;
  permissions: {
    // 게스트 관련 권한
    isGuest: boolean;
    canViewSubsidyAnnouncements: boolean;

    // 기존 권한
    canViewAllTasks: boolean;
    canCreateTasks: boolean;
    canEditTasks: boolean;
    canDeleteTasks: boolean;
    canViewReports: boolean;
    canApproveReports: boolean;
    canAccessAdminPages: boolean;
    canViewSensitiveData: boolean;
    canDeleteAutoMemos: boolean; // 시스템 관리자만 자동 메모 삭제 가능
    isSpecialAccount: boolean;   // 특별 접근 제어 계정 (permission_level 변경에 영향받지 않음)
  } | null;
  loading: boolean;
  socialLogin: (token: string, userData: any, isNewUser: boolean) => Promise<{ success: boolean; error?: string }>;
  emailLogin: (token: string, userData: any) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[] | null>(null);
  const [permissions, setPermissions] = useState<AuthContextType['permissions']>(null);
  const [loading, setLoading] = useState(true);

  // 일반 로그인 핸들러
  const emailLogin = async (token: string, userData: any) => {
    try {
      setLoading(true);

      // 토큰을 직접 저장
      TokenManager.setToken(token);

      // 사용자 정보 설정 - setLoading(false)보다 먼저 user를 설정해야
      // AdminLayout의 (!authLoading && !user) 조건이 잘못 발동하지 않음
      setUser(userData.user);
      setPermissions(userData.permissions);
      setSocialAccounts([]); // 일반 로그인은 소셜 계정 없음

      console.log('✅ [AUTH-CONTEXT] 일반 로그인 성공:', {
        user: userData.user
      });

      // loading은 user 설정 이후에 false로 전환
      setLoading(false);
      return { success: true };
    } catch (error) {
      console.error('일반 로그인 오류:', error);
      TokenManager.removeToken();
      setUser(null);
      setPermissions(null);
      setLoading(false);
      return {
        success: false,
        error: '일반 로그인 중 오류가 발생했습니다.'
      };
    }
  };

  const socialLogin = async (token: string, userData: any, isNewUser: boolean) => {
    try {
      setLoading(true);

      // 토큰을 직접 저장
      TokenManager.setToken(token);

      // 토큰 검증을 통해 최신 사용자 정보 가져오기
      const response = await authAPI.verify() as any;

      if (response.success && response.data) {
        setUser(response.data.user);
        setPermissions(response.data.permissions);
        setSocialAccounts(response.data.socialAccounts || []);

        console.log('✅ [AUTH-CONTEXT] 소셜 로그인 성공:', {
          user: response.data.user,
          isNewUser,
          socialAccounts: response.data.socialAccounts?.length || 0
        });

        return { success: true };
      } else {
        // 토큰이 유효하지 않음 - 제거
        TokenManager.removeToken();
        return {
          success: false,
          error: response.error?.message || '소셜 로그인 인증에 실패했습니다.'
        };
      }
    } catch (error) {
      console.error('소셜 로그인 오류:', error);
      TokenManager.removeToken();
      return {
        success: false,
        error: '소셜 로그인 중 오류가 발생했습니다.'
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('로그아웃 오류:', error);
    } finally {
      setUser(null);
      setPermissions(null);
      setSocialAccounts(null);
      TokenManager.removeToken();
    }
  };

  const checkAuth = async () => {
    try {
      setLoading(true);

      const token = TokenManager.getToken();

      if (!token) {
        console.log('🔒 [AUTH-CONTEXT] 토큰 없음 - 공개 페이지 접근');
        setUser(null);
        setPermissions(null);
        setSocialAccounts(null);
        setLoading(false); // 즉시 로딩 완료
        return;
      }

      console.log('🔑 [AUTH-CONTEXT] 토큰 확인 중...');
      const response = await authAPI.verify() as any;

      if (response.success && response.data) {
        setUser(response.data.user);
        setPermissions(response.data.permissions);
        setSocialAccounts(response.data.socialAccounts || []);
        console.log('✅ [AUTH-CONTEXT] 인증 성공:', response.data.user?.name);
      } else {
        // 토큰이 유효하지 않음
        console.warn('⚠️ [AUTH-CONTEXT] 토큰 무효:', response.error?.message);
        TokenManager.removeToken();
        setUser(null);
        setPermissions(null);
        setSocialAccounts(null);
      }
    } catch (error: any) {
      const isUnauthorized = error?.message === 'Unauthorized';
      const isRateLimit = error?.message?.includes('429');
      const isNetworkError = error instanceof TypeError;

      if (isRateLimit) {
        console.warn('⚠️ [AUTH-CONTEXT] 인증 API Rate Limit - 토큰 유지');
        // Rate limit는 일시적 오류 - 토큰 삭제하지 않고 로딩만 완료
      } else if (isNetworkError) {
        console.warn('⚠️ [AUTH-CONTEXT] 네트워크 오류 - 토큰 유지');
        // 네트워크 오류는 일시적 - 토큰 삭제하지 않음
      } else if (isUnauthorized) {
        // 실제 인증 실패 (401) - 토큰 삭제
        console.warn('⚠️ [AUTH-CONTEXT] 토큰 무효 (401) - 로그아웃 처리');
        TokenManager.removeToken();
        setUser(null);
        setPermissions(null);
        setSocialAccounts(null);
      } else {
        console.error('❌ [AUTH-CONTEXT] 인증 확인 오류:', error);
        // 알 수 없는 오류도 토큰은 유지 (서버 오류일 수 있음)
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only run on client side to prevent hydration issues
    if (typeof window !== 'undefined') {
      // URL 파라미터에서 토큰 확인 (카카오 로그인 콜백에서 전달된 토큰)
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token');

      if (tokenFromUrl) {
        console.log('🎯 [AUTH-CONTEXT] URL에서 토큰 발견, localStorage에 저장');
        TokenManager.setToken(tokenFromUrl);

        // URL에서 토큰 파라미터 제거
        urlParams.delete('token');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);

        // 토큰 저장 후 즉시 인증 확인 (레이스 컨디션 방지)
        setTimeout(() => {
          checkAuth();
        }, 100);
      } else {
        // URL에 토큰이 없을 때만 기존 토큰으로 인증 확인
        checkAuth();
      }
    }
  }, []);

  const value: AuthContextType = {
    user,
    socialAccounts,
    permissions,
    loading,
    socialLogin,
    emailLogin,
    logout,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// 권한 확인 훅
export function usePermission() {
  const { permissions } = useAuth();

  return {
    // 게스트 권한
    isGuest: permissions?.isGuest || false,
    canViewSubsidyAnnouncements: permissions?.canViewSubsidyAnnouncements || false,

    // 기존 권한
    canViewAllTasks: permissions?.canViewAllTasks || false,
    canCreateTasks: permissions?.canCreateTasks || false,
    canEditTasks: permissions?.canEditTasks || false,
    canDeleteTasks: permissions?.canDeleteTasks || false,
    canViewReports: permissions?.canViewReports || false,
    canApproveReports: permissions?.canApproveReports || false,
    canAccessAdminPages: permissions?.canAccessAdminPages || false,
    canViewSensitiveData: permissions?.canViewSensitiveData || false,
    canDeleteAutoMemos: permissions?.canDeleteAutoMemos || false,
  };
}

// 인증이 필요한 컴포넌트를 래핑하는 HOC
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  requiredPermission?: keyof AuthContextType['permissions'],
  requiredLevel?: number
) {
  return function AuthenticatedComponent(props: P) {
    const { user, permissions, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!user) {
      // 로그인 페이지로 리다이렉트 (현재 페이지 정보 포함)
      if (typeof window !== 'undefined') {
        const redirectUrl = `/login?redirect=${encodeURIComponent(pathname || '/')}`;
        window.location.href = redirectUrl;
      }
      return null;
    }

    // 권한 레벨 확인
    if (requiredLevel && user.role < requiredLevel) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100">
          <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-gray-200 max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-4">접근 권한 부족</h1>
            <p className="text-gray-600 mb-2">이 페이지는 <strong>{AUTH_LEVEL_DESCRIPTIONS[requiredLevel as keyof typeof AUTH_LEVEL_DESCRIPTIONS]}</strong> 이상의 권한이 필요합니다.</p>
            <p className="text-sm text-gray-500 mb-6">현재 권한: {AUTH_LEVEL_DESCRIPTIONS[user.role as keyof typeof AUTH_LEVEL_DESCRIPTIONS]}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              이전 페이지로
            </button>
          </div>
        </div>
      );
    }

    // 특정 권한 확인
    if (requiredPermission && !permissions?.[requiredPermission]) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-gray-100">
          <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-gray-200 max-w-md">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-4">특별 권한 필요</h1>
            <p className="text-gray-600 mb-2">이 페이지에 접근하기 위한 특별 권한이 없습니다.</p>
            <p className="text-sm text-gray-500 mb-6">필요 권한: {requiredPermission}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              이전 페이지로
            </button>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}