// lib/getCurrentUser.ts
// 현재 사용자 정보 조회 유틸리티

import { TokenManager } from '@/lib/api-client';

interface UserInfo {
  name: string;
  permission_level: number;
}

let cachedUserInfo: UserInfo | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function getCurrentUserName(): Promise<string> {
  try {
    // 1️⃣ 캐시 확인
    const now = Date.now();
    if (cachedUserInfo && (now - cacheTimestamp < CACHE_TTL)) {
      return cachedUserInfo.name;
    }

    // 2️⃣ localStorage 확인
    const storedName = localStorage.getItem('user_name');
    if (storedName && storedName !== 'undefined') {
      return storedName;
    }

    // 3️⃣ Token에서 디코딩 (fallback) - UTF-8 지원
    const token = TokenManager.getToken();
    if (token) {
      try {
        // 🔧 UTF-8 디코딩: atob() → Base64 decode → UTF-8 decode
        const base64 = token.split('.')[1];
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonPayload);
        const name = payload.name || payload.email || '관리자';

        // 캐시 업데이트
        cachedUserInfo = { name, permission_level: payload.permission_level || 1 };
        cacheTimestamp = now;

        return name;
      } catch (e) {
        console.warn('⚠️ Token 디코딩 실패:', e);
      }
    }

    // 4️⃣ 최종 fallback
    return '시스템';

  } catch (error) {
    console.error('❌ 사용자 정보 조회 실패:', error);
    return '시스템';
  }
}

export async function getCurrentUserPermission(): Promise<number> {
  try {
    const now = Date.now();
    if (cachedUserInfo && (now - cacheTimestamp < CACHE_TTL)) {
      return cachedUserInfo.permission_level;
    }

    const token = TokenManager.getToken();
    if (token) {
      // 🔧 UTF-8 디코딩: atob() → Base64 decode → UTF-8 decode
      const base64 = token.split('.')[1];
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      const permission = payload.permission_level || 1;

      cachedUserInfo = {
        name: payload.name || payload.email || '관리자',
        permission_level: permission
      };
      cacheTimestamp = now;

      return permission;
    }

    return 1; // 기본 권한
  } catch (error) {
    console.error('❌ 권한 정보 조회 실패:', error);
    return 1;
  }
}
