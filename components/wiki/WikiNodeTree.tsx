'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WikiNode } from '@/types/dpf';
import { ChevronRight, ChevronDown, FileText, BookOpen, Layers, File } from 'lucide-react';

interface Props {
  nodes: WikiNode[];
  depth?: number;
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  chapter:    <BookOpen className="w-4 h-4 shrink-0" />,
  section:    <Layers className="w-4 h-4 shrink-0" />,
  subsection: <FileText className="w-4 h-4 shrink-0" />,
  form:       <File className="w-4 h-4 shrink-0" />,
};

function TreeNode({ node, depth = 0 }: { node: WikiNode; depth: number }) {
  const pathname = usePathname();
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isActive = pathname.includes(node.slug ?? node.id);
  const [open, setOpen] = useState(depth < 2);

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors
          ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="shrink-0 p-0.5 rounded hover:bg-gray-200">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className="text-gray-400">{NODE_ICONS[node.node_type] ?? <File className="w-4 h-4 shrink-0" />}</span>
        {node.slug ? (
          <Link href={`/dpf/wiki/${node.slug}`} className="flex-1 truncate" onClick={() => {}}>
            {node.title}
          </Link>
        ) : (
          <span className="flex-1 truncate">{node.title}</span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map(child => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WikiNodeTree({ nodes }: Props) {
  return (
    <nav className="space-y-0.5">
      {nodes.map(node => (
        <TreeNode key={node.id} node={node} depth={0} />
      ))}
    </nav>
  );
}
