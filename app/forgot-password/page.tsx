'use client';
// 비밀번호 찾기 안내 페이지 - 이메일 발송 인프라가 없어 실제 재설정 링크는 보내지 않고 관리자 문의를 안내한다

import Link from 'next/link';
import { Building2, ShieldQuestion, ArrowLeft } from 'lucide-react';

const ADMIN_CONTACT_EMAIL = 'admin@facility.blueon-iot.com';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 및 헤더 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">시설관리 시스템</h1>
          <p className="text-sm text-gray-600 mt-2">주식회사 블루온</p>
        </div>

        {/* 안내 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldQuestion className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">비밀번호를 잊으셨나요?</h2>
            <p className="text-gray-600 mb-6">
              현재 본인 인증을 통한 비밀번호 자동 재설정은 지원하지 않습니다.
              담당 관리자에게 문의하시면 확인 후 비밀번호를 재설정해 드립니다.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-gray-700">
                <span className="font-medium">문의처:</span>{' '}
                <a href={`mailto:${ADMIN_CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
                  {ADMIN_CONTACT_EMAIL}
                </a>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                소속 부서와 계정 이메일을 함께 알려주시면 확인이 빠릅니다.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              로그인 페이지로 돌아가기
            </Link>
          </div>
        </div>

        {/* 푸터 */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-500">
            © 2025 주식회사 블루온. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}