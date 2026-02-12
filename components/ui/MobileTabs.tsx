import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: string;
}

export interface MobileTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

/**
 * 모바일 탭 UI 컴포넌트
 * - 접근성 지원 (ARIA attributes, 키보드 네비게이션)
 * - 반응형 디자인
 */
export function MobileTabs({ tabs, activeTab, onTabChange, className = '' }: MobileTabsProps) {
  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      onTabChange(tabs[nextIndex].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      onTabChange(tabs[prevIndex].id);
    }
  };

  return (
    <div
      className={`flex border-b border-gray-200 bg-white sticky top-0 z-10 ${className}`}
      role="tablist"
      aria-label="모달 콘텐츠 탭"
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.id}-panel`}
            id={`${tab.id}-tab`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`
              flex-1 py-3 px-4 text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset
              ${isActive
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300'
              }
            `}
          >
            {tab.icon && <span className="mr-1" aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
