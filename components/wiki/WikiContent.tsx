'use client';

import { WikiNode } from '@/types/dpf';

interface Props {
  node: WikiNode;
}

export default function WikiContent({ node }: Props) {
  const content = node.content_md ?? '';

  // 마크다운 → HTML 간단 변환 (heading, bold, list, paragraph)
  const html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-gray-800 mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-gray-900 mt-6 mb-3 pb-1 border-b border-gray-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-gray-900 mt-2 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, '<br/>');

  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{node.title}</h1>
      {node.tags && node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {node.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{tag}</span>
          ))}
        </div>
      )}
      {content ? (
        <div
          className="text-gray-700 leading-relaxed space-y-2"
          dangerouslySetInnerHTML={{ __html: `<p class="mb-3">${html}</p>` }}
        />
      ) : (
        <p className="text-gray-400 italic">내용이 없습니다.</p>
      )}
    </article>
  );
}
