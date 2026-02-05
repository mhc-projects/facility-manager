'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FolderOpen,
  CheckSquare,
  Users,
  Bell,
  Settings,
  Menu,
  X,
  Building2,
  FileText,
  BarChart3,
  ClipboardList
} from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useAuth } from '@/contexts/AuthContext';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  badge?: number;
  children?: NavigationItem[];
  requiredLevel?: number;
}

const navigationItems: NavigationItem[] = [
  {
    name: '대시보드',
    href: '/',
    icon: Home
  },
  {
    name: '관리자 대시보드',
    href: '/admin',
    icon: BarChart3,
    requiredLevel: 3 // ✅ 슈퍼 관리자(레벨 3) 이상만 표시
  },
  {
    name: '프로젝트',
    href: '/projects',
    icon: FolderOpen,
    children: [
      { name: '프로젝트 목록', href: '/projects', icon: FolderOpen },
      { name: '내 작업', href: '/projects/my-tasks', icon: CheckSquare }
    ]
  },
  {
    name: '사업장',
    href: '/business',
    icon: Building2,
    children: [
      { name: '사업장 목록', href: '/admin/business', icon: Building2 },
      { name: '대기 오염 허가', href: '/admin/air-permit', icon: FileText }
    ]
  },
  {
    name: '관리',
    href: '/management',
    icon: Settings,
    children: [
      { name: '업무 관리', href: '/admin/tasks', icon: ClipboardList },
      { name: '부서 관리', href: '/admin/departments', icon: Users },
      { name: '사용자 승인', href: '/admin/users', icon: Users, requiredLevel: 3 },
      { name: '시설 관리', href: '/facility', icon: Building2 }
    ]
  },
  {
    name: '보고서',
    href: '/reports',
    icon: BarChart3
  }
];

export default function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const pathname = usePathname();
  const { user } = useAuth();

  const toggleExpanded = (href: string) => {
    setExpandedItems(prev =>
      prev.includes(href)
        ? prev.filter(item => item !== href)
        : [...prev, href]
    );
  };

  // 권한 체크 함수
  const hasPermission = (requiredLevel?: number): boolean => {
    if (!requiredLevel) return true; // 권한 요구 없음 → 모두 표시
    if (!user) return false; // 로그인 안 됨 → 숨김
    return user.permission_level >= requiredLevel;
  };

  // 자식 메뉴 필터링 함수
  const filterChildren = (children: NavigationItem[]): NavigationItem[] => {
    return children.filter(child => hasPermission(child.requiredLevel));
  };

  // 상위 메뉴 필터링 함수 (권한 체크 포함)
  const filterNavigationItems = (items: NavigationItem[]): NavigationItem[] => {
    return items.filter(item => hasPermission(item.requiredLevel));
  };

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href) ?? false;
  };

  const NavigationLink = ({ item }: { item: NavigationItem }) => {
    const filteredChildren = item.children ? filterChildren(item.children) : [];
    const hasChildren = filteredChildren.length > 0;
    const isExpanded = expandedItems.includes(item.href);
    const active = isActive(item.href);

    return (
      <div className="space-y-1">
        <div
          className={`
            flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium cursor-pointer
            ${active
              ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.href);
            }
          }}
        >
          <Link
            href={!hasChildren ? item.href : '#'}
            className="flex items-center flex-1"
            onClick={(e) => hasChildren && e.preventDefault()}
          >
            <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
            <span>{item.name}</span>
            {item.badge && (
              <span className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                {item.badge}
              </span>
            )}
          </Link>
          {hasChildren && (
            <div className="ml-2">
              {isExpanded ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </div>
          )}
        </div>

        {/* 하위 메뉴 */}
        {hasChildren && isExpanded && (
          <div className="ml-6 space-y-1">
            {filteredChildren.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={`
                  flex items-center px-3 py-2 rounded-md text-sm font-medium
                  ${isActive(child.href)
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                <child.icon className="mr-3 h-4 w-4 flex-shrink-0" />
                <span>{child.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 border-r border-gray-200 bg-white pt-5 pb-4 overflow-y-auto">
          {/* 로고 */}
          <div className="flex items-center flex-shrink-0 px-4">
            <Building2 className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">시설관리</span>
          </div>

          {/* 알림 버튼 */}
          <div className="mt-6 px-4">
            <div className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 hover:text-gray-900">
              <Bell className="mr-3 h-5 w-5" />
              <span>알림</span>
              <div className="ml-auto">
                <NotificationBell />
              </div>
            </div>
          </div>

          {/* 네비게이션 메뉴 */}
          <nav className="mt-6 flex-1 px-4 space-y-1">
            {filterNavigationItems(navigationItems).map((item) => (
              <NavigationLink key={item.href} item={item} />
            ))}
          </nav>
        </div>
      </div>

      {/* 모바일 메뉴 버튼 */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2">
          <div className="flex items-center">
            <Building2 className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">시설관리</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="pt-2 pb-3 space-y-1 bg-white border-b border-gray-200">
            <nav className="px-4 space-y-1">
              {filterNavigationItems(navigationItems).map((item) => (
                <NavigationLink key={item.href} item={item} />
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}