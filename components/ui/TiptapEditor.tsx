'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Table as TableIcon,
  Plus,
  Minus,
  Columns,
  Rows,
  Trash2,
} from 'lucide-react'

interface TiptapEditorProps {
  content: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  minHeight?: string
  onFocus?: () => void
  onBlur?: () => void
  /** Ctrl/⌘+Enter 단축키 핸들러 */
  onSubmitShortcut?: () => void
}

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-300 mx-0.5" />
}

export default function TiptapEditor({
  content,
  onChange,
  disabled = false,
  placeholder = '',
  minHeight = '280px',
  onFocus,
  onBlur,
  onSubmitShortcut,
}: TiptapEditorProps) {
  // ref 패턴: 최신 콜백을 ref에 저장하여 editor 이벤트 핸들러 재등록 없이 항상 최신 콜백 호출
  const onFocusRef = useRef<(() => void) | undefined>(onFocus)
  const onBlurRef = useRef<(() => void) | undefined>(onBlur)
  const onSubmitShortcutRef = useRef<(() => void) | undefined>(onSubmitShortcut)
  useEffect(() => { onFocusRef.current = onFocus }, [onFocus])
  useEffect(() => { onBlurRef.current = onBlur }, [onBlur])
  useEffect(() => { onSubmitShortcutRef.current = onSubmitShortcut }, [onSubmitShortcut])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Table.configure({
        resizable: false,
        HTMLAttributes: {
          class: 'tiptap-table',
        },
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: content || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Tiptap returns <p></p> for empty content; normalize to empty string
      if (html === '<p></p>') {
        onChange('')
      } else {
        onChange(html)
      }
    },
    onFocus: () => {
      onFocusRef.current?.()
    },
    onBlur: () => {
      onBlurRef.current?.()
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor-content focus:outline-none',
        style: `min-height: ${minHeight}`,
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          onSubmitShortcutRef.current?.()
          return true
        }
        return false
      },
    },
  })

  // Sync editable state when disabled prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled)
    }
  }, [editor, disabled])

  // Sync content from outside when it changes (e.g., form reset)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Only update if the external content is genuinely different
      const currentHtml = editor.getHTML()
      const normalized = currentHtml === '<p></p>' ? '' : currentHtml
      if (content !== normalized) {
        editor.commands.setContent(content || '')
      }
    }
  }, [content, editor])

  if (!editor) {
    return (
      <div
        className="p-3 text-sm bg-transparent"
        style={{ minHeight }}
      />
    )
  }

  // Disabled / read-only mode: render content without toolbar
  if (disabled) {
    return (
      <div className="tiptap-readonly p-3 text-sm disabled:text-gray-700">
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="tiptap-wrapper">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm sticky top-0 z-10">
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="굵게 (Bold)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="기울임 (Italic)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="제목 2 (H2)"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="제목 3 (H3)"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="글머리 기호 목록"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="번호 매기기 목록"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Table operations */}
        <ToolbarButton
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="표 삽입 (3x3)"
        >
          <TableIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!editor.can().addRowAfter()}
          title="행 추가"
        >
          <div className="flex items-center">
            <Rows className="w-3.5 h-3.5" />
            <Plus className="w-2.5 h-2.5 -ml-0.5" />
          </div>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!editor.can().addColumnAfter()}
          title="열 추가"
        >
          <div className="flex items-center">
            <Columns className="w-3.5 h-3.5" />
            <Plus className="w-2.5 h-2.5 -ml-0.5" />
          </div>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!editor.can().deleteRow()}
          title="행 삭제"
        >
          <div className="flex items-center">
            <Rows className="w-3.5 h-3.5" />
            <Minus className="w-2.5 h-2.5 -ml-0.5" />
          </div>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().deleteColumn().run()}
          disabled={!editor.can().deleteColumn()}
          title="열 삭제"
        >
          <div className="flex items-center">
            <Columns className="w-3.5 h-3.5" />
            <Minus className="w-2.5 h-2.5 -ml-0.5" />
          </div>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().deleteTable().run()}
          disabled={!editor.can().deleteTable()}
          title="표 삭제"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <div className="p-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
