'use client';
// 소셜 로그인 관리 페이지 - 2026-07-25: 기능 비활성화됨 (아래 사유 참고)

import AdminLayout from '@/components/ui/AdminLayout';
import { ShieldOff } from 'lucide-react';

export default function SocialLoginAdminPage() {
  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">소셜 로그인 관리</h1>
          <p className="mt-2 text-gray-600">소셜 로그인 승인 요청과 도메인 정책을 관리합니다.</p>
        </div>

        <div className="bg-white shadow rounded-lg p-12 text-center">
          <ShieldOff className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">소셜 로그인 기능이 비활성화되어 있습니다</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            현재 로그인/가입 화면에 소셜 로그인 진입 버튼이 없어 실제로 사용되지 않는 기능입니다.
            관련 API(카카오/네이버/구글)도 함께 비활성화되어 있으며, 이 화면은 승인 요청·도메인 정책을
            관리할 데이터가 없어 표시할 내용이 없습니다.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
