'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/ui/AdminLayout';
import WikiContent from '@/components/wiki/WikiContent';
import { WikiNode } from '@/types/dpf';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function WikiSlugPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  const [node, setNode] = useState<WikiNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('wiki_nodes')
      .select('*, children:wiki_nodes(id, title, slug, node_type, sort_order, is_published)')
      .eq('slug', slug)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setError('페이지를 찾을 수 없습니다.');
        else setNode(data);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <AdminLayout title="업무 지침" description="로딩 중...">
        <div className="flex justify-center py-16 text-gray-400">로딩 중...</div>
      </AdminLayout>
    );
  }

  if (error || !node) {
    return (
      <AdminLayout title="업무 지침" description="오류">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <p className="text-red-700">{error}</p>
          <Link href="/wiki" className="mt-2 inline-block text-blue-600 text-sm hover:underline">
            목차로 돌아가기
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const actions = (
    <div className="flex gap-2">
      <Link href="/wiki/qa"
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
        <MessageSquare className="w-4 h-4" /> AI에게 질문
      </Link>
    </div>
  );

  return (
    <AdminLayout title={node.title} description="업무 지침" actions={actions}>
      <div className="flex items-center gap-1 text-sm text-gray-500 mb-4">
        <Link href="/wiki" className="hover:text-blue-600">업무 지침</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-800">{node.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {node.children && node.children.length > 0 && (
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sticky top-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">하위 항목</div>
              <nav className="space-y-0.5">
                {node.children
                  .filter(c => c.is_published)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(child => (
                    <Link key={child.id}
                      href={`/wiki/${child.slug}`}
                      className="block px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors">
                      {child.title}
                    </Link>
                  ))}
              </nav>
            </div>
          </div>
        )}

        <div className={node.children && node.children.length > 0 ? 'lg:col-span-3' : 'lg:col-span-4'}>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <WikiContent node={node} />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
