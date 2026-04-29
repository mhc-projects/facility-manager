'use client';

import AdminLayout from '@/components/ui/AdminLayout';
import QAChat from '@/components/qa/QAChat';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export default function WikiQAPage() {
  const actions = (
    <Link href="/dpf/wiki"
      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
      <BookOpen className="w-4 h-4" /> 목차 보기
    </Link>
  );

  return (
    <AdminLayout
      title="DPF 업무지침 AI Q&A"
      description="업무처리지침 내용을 AI가 검색하여 답변합니다"
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
