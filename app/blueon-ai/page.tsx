'use client';

import AdminLayout from '@/components/ui/AdminLayout';
import QAChat from '@/components/qa/QAChat';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export default function BlueonAIPage() {
  const actions = (
    <Link href="/wiki"
      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
      <BookOpen className="w-4 h-4" /> 업무지침 목차 보기
    </Link>
  );

  return (
    <AdminLayout
      title="블루온AI"
      description="업무지침, 공지사항·전달사항, 사업장 메모, 매출·미수금(권한 있는 경우)까지 검색해 답변합니다"
      actions={actions}
    >
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5" style={{ minHeight: '60vh' }}>
          <div className="h-full flex flex-col" style={{ minHeight: '55vh' }}>
            <QAChat />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
