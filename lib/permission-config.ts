// 권한별 페이지 접근 제어 설정
import React from 'react';
export interface PagePermission {
  path: string;
  name: string;
  requiredLevel: number;
  requiredPermission?: string;
  description: string;
}

// 권한 레벨 정의
export const PERMISSION_LEVELS = {
  REGULAR: 1,     // 일반사용자
  MANAGER: 2,     // 매니저
  ADMIN: 3,       // 관리자
  SUPER_ADMIN: 4  // 슈퍼관리자
} as const;

// 페이지별 접근 권한 설정
export const PAGE_PERMISSIONS: PagePermission[] = [
  // === 일반 사용자 (레벨 1) 접근 가능 ===
  {
    path: '/profile',
    name: '개인 프로필',
    requiredLevel: PERMISSION_LEVELS.REGULAR,
    description: '개인 정보 및 계정 설정'
  },
  {
    path: '/weekly-reports',
    name: '주간 리포트',
    requiredLevel: PERMISSION_LEVELS.REGULAR,
    description: '개인 주간 업무 성과 리포트'
  },

  // === 매니저 (레벨 2) 이상 접근 가능 ===
  {
    path: '/facility',
    name: '실사 관리',
    requiredLevel: PERMISSION_LEVELS.MANAGER,
    requiredPermission: 'canViewAllTasks',
    description: '사업장 실사 및 파일 관리'
  },
  {
    path: '/admin/tasks',
    name: '업무 관리',
    requiredLevel: PERMISSION_LEVELS.MANAGER,
    requiredPermission: 'canCreateTasks',
    description: '시설 업무 관리 칸반보드'
  },
  {
    path: '/admin/tasks/create',
    name: '업무 생성',
    requiredLevel: PERMISSION_LEVELS.MANAGER,
    requiredPermission: 'canCreateTasks',
    description: '새로운 업무 생성'
  },
  {
    path: '/admin/tasks/[id]/edit',
    name: '업무 수정',
    requiredLevel: PERMISSION_LEVELS.MANAGER,
    requiredPermission: 'canEditTasks',
    description: '기존 업무 수정'
  },

  // === 관리자 (레벨 3) 전용 ===
  {
    path: '/admin',
    name: '관리자 대시보드',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '시스템 전체 현황 대시보드'
  },
  {
    path: '/admin/users',
    name: '사용자 관리',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '직원 계정 및 권한 관리'
  },
  {
    path: '/admin/business',
    name: '사업장 관리',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '사업장 정보 및 등록 관리'
  },
  {
    path: '/admin/air-permit',
    name: '대기필증 관리',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '대기배출시설 허가증 관리'
  },
  {
    path: '/admin/data-history',
    name: '데이터 이력',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '시스템 데이터 변경 이력'
  },
  {
    path: '/admin/document-automation',
    name: '문서 자동화',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '문서 생성 및 자동화 설정'
  },
  {
    path: '/admin/social-login',
    name: '소셜 로그인 관리',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '소셜 로그인 설정 및 승인 관리'
  },
  {
    path: '/admin/first-setup',
    name: '시스템 설정',
    requiredLevel: PERMISSION_LEVELS.ADMIN,
    requiredPermission: 'canAccessAdminPages',
    description: '시스템 초기 설정 및 구성'
  },

  // === 슈퍼관리자 (레벨 4) 전용 ===
  {
    path: '/admin/access-logs',
    name: '접속 감사 로그',
    requiredLevel: PERMISSION_LEVELS.SUPER_ADMIN,
    description: '사용자 접속 IP 및 페이지 이력 감사 (보안 감사 전용)'
  }
];

// 권한별 표시 이름
export const PERMISSION_NAMES = {
  [PERMISSION_LEVELS.REGULAR]: '일반사용자',
  [PERMISSION_LEVELS.MANAGER]: '매니저',
  [PERMISSION_LEVELS.ADMIN]: '관리자',
  [PERMISSION_LEVELS.SUPER_ADMIN]: '슈퍼관리자'
} as const;

// 유틸리티 함수들
export class PermissionChecker {
  // 사용자가 특정 페이지에 접근할 수 있는지 확인
  static canAccessPage(userLevel: number, userPermissions: any, pagePath: string): boolean {
    const pageConfig = PAGE_PERMISSIONS.find(p => {
      // 정확한 경로 매칭 또는 동적 경로 매칭
      return p.path === pagePath || this.matchDynamicPath(p.path, pagePath);
    });

    if (!pageConfig) {
      console.warn(`⚠️ 페이지 권한 설정이 없음: ${pagePath}`);
      return false; // 설정되지 않은 페이지는 기본적으로 차단
    }

    // 레벨 확인
    if (userLevel < pageConfig.requiredLevel) {
      return false;
    }

    // 특정 권한 확인
    if (pageConfig.requiredPermission && userPermissions) {
      return Boolean(userPermissions[pageConfig.requiredPermission]);
    }

    return true;
  }

  // 동적 경로 매칭 ([id] 같은 패턴)
  static matchDynamicPath(configPath: string, actualPath: string): boolean {
    const configParts = configPath.split('/');
    const actualParts = actualPath.split('/');

    if (configParts.length !== actualParts.length) {
      return false;
    }

    return configParts.every((configPart, index) => {
      const actualPart = actualParts[index];

      // 동적 세그먼트 ([id], [slug] 등)
      if (configPart.startsWith('[') && configPart.endsWith(']')) {
        return true;
      }

      // 정확한 매칭
      return configPart === actualPart;
    });
  }

  // 사용자가 접근 가능한 모든 페이지 목록
  static getAccessiblePages(userLevel: number, userPermissions: any): PagePermission[] {
    return PAGE_PERMISSIONS.filter(page =>
      this.canAccessPage(userLevel, userPermissions, page.path)
    );
  }

  // 권한별 페이지 그룹화
  static getPagesByPermissionLevel(): Record<number, PagePermission[]> {
    return PAGE_PERMISSIONS.reduce((acc, page) => {
      if (!acc[page.requiredLevel]) {
        acc[page.requiredLevel] = [];
      }
      acc[page.requiredLevel].push(page);
      return acc;
    }, {} as Record<number, PagePermission[]>);
  }

  // 사용자 권한 레벨 검증
  static validatePermissionLevel(level: number): boolean {
    return Object.values(PERMISSION_LEVELS).includes(level as any);
  }

  // 권한 레벨 이름 조회
  static getPermissionLevelName(level: number): string {
    return PERMISSION_NAMES[level as keyof typeof PERMISSION_NAMES] || '알 수 없음';
  }

  // 페이지 접근 불가 사유 상세 조회
  static getAccessDenialReason(userLevel: number, userPermissions: any, pagePath: string): string {
    const pageConfig = PAGE_PERMISSIONS.find(p =>
      p.path === pagePath || this.matchDynamicPath(p.path, pagePath)
    );

    if (!pageConfig) {
      return '페이지 권한 설정을 찾을 수 없습니다.';
    }

    if (userLevel < pageConfig.requiredLevel) {
      const requiredLevelName = this.getPermissionLevelName(pageConfig.requiredLevel);
      const userLevelName = this.getPermissionLevelName(userLevel);
      return `이 페이지는 ${requiredLevelName} 이상만 접근 가능합니다. (현재: ${userLevelName})`;
    }

    if (pageConfig.requiredPermission && userPermissions && !userPermissions[pageConfig.requiredPermission]) {
      return `이 페이지에 접근하기 위한 권한(${pageConfig.requiredPermission})이 없습니다.`;
    }

    return '알 수 없는 이유로 접근이 거부되었습니다.';
  }
}

// 네비게이션 아이템 필터링 (사이드바용)
export function filterNavigationByPermission(
  navigationItems: any[],
  userLevel: number,
  userPermissions: any
): any[] {
  return navigationItems.filter(item => {
    return PermissionChecker.canAccessPage(userLevel, userPermissions, item.href);
  });
}

// HOC용 권한 검증 설정
export const withPermissionLevel = (requiredLevel: number) => {
  return function<P extends object>(Component: React.ComponentType<P>) {
    return function PermissionComponent(props: P) {
      // 이 함수는 withAuth HOC와 함께 사용될 예정
      return React.createElement(Component, props);
    };
  };
};

// 권한 기반 컴포넌트 표시/숨김 훅
export function usePermissionVisibility() {
  return {
    isVisible: (requiredLevel: number, requiredPermission?: string) => {
      // AuthContext에서 사용자 정보를 가져와서 확인
      // 실제 구현에서는 useAuth 훅을 사용
      return true; // 임시
    }
  };
}