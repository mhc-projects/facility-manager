'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { CharacterCount } from '@tiptap/extension-character-count'
import { Indent } from './tiptap-indent-extension'
import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Table as TableIcon,
  Plus,
  Minus,
  Columns,
  Rows,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Indent as IndentIcon,
  Outdent as OutdentIcon,
  Quote,
  Link2,
  Undo2,
  Redo2,
  RemoveFormatting,
  Palette,
  Highlighter,
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

const TEXT_COLORS = [
  { label: '빨강', value: '#ef4444' },
  { label: '주황', value: '#f59e0b' },
  { label: '초록', value: '#22c55e' },
  { label: '파랑', value: '#3b82f6' },
  { label: '보라', value: '#8b5cf6' },
]

const HIGHLIGHT_COLORS = [
  { label: '노랑', value: '#fef08a' },
  { label: '초록', value: '#bbf7d0' },
  { label: '파랑', value: '#bfdbfe' },
  { label: '분홍', value: '#fbcfe8' },
]

function ToolbarColorDropdown({
  title,
  icon,
  colors,
  activeColor,
  onSelect,
  onClear,
}: {
  title: string
  icon: React.ReactNode
  colors: { label: string; value: string }[]
  activeColor?: string
  onSelect: (value: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={() => setOpen((v) => !v)} active={!!activeColor} title={title}>
        {icon}
      </ToolbarButton>
      {open && (
        <div className="absolute top-full left-0 mt-1 flex items-center gap-1.5 p-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          <button
            type="button"
            onClick={() => {
              onClear()
              setOpen(false)
            }}
            title="지우기"
            className="w-5 h-5 rounded-full border border-gray-300 bg-white flex items-center justify-center text-gray-400 hover:border-gray-500 text-[10px] leading-none"
          >
            ✕
          </button>
          {colors.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                onSelect(c.value)
                setOpen(false)
              }}
              title={c.label}
              className={`w-5 h-5 rounded-full border ${
                activeColor === c.value
                  ? 'ring-2 ring-offset-1 ring-blue-500 border-transparent'
                  : 'border-gray-300'
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      )}
    </div>
  )
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
  const onChangeRef = useRef<(html: string) => void>(onChange)
  const onFocusRef = useRef<(() => void) | undefined>(onFocus)
  const onBlurRef = useRef<(() => void) | undefined>(onBlur)
  const onSubmitShortcutRef = useRef<(() => void) | undefined>(onSubmitShortcut)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
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
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: 'tiptap-link',
          },
        },
      }),
      Table.configure({
        resizable: true,
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
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Indent,
      CharacterCount,
    ],
    content: content || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Tiptap returns <p></p> for empty content; normalize to empty string
      if (html === '<p></p>') {
        onChangeRef.current('')
      } else {
        onChangeRef.current(html)
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
  // emitUpdate: false → onUpdate를 트리거하지 않음.
  // resizable:true 일 때 editor.getHTML()이 colgroup을 포함해 저장값과 달라지는데,
  // setContent가 onUpdate를 emit하면 onChange → setAgenda 루프가 발생해 사용자 변경값이 덮어써짐.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      const currentHtml = editor.getHTML()
      const normalized = currentHtml === '<p></p>' ? '' : currentHtml
      if (content !== normalized) {
        editor.commands.setContent(content || '', { emitUpdate: false })
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

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('링크 URL을 입력하세요', previousUrl || 'https://')
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className="tiptap-wrapper">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm sticky top-0 left-0 z-10">
        {/* Undo / redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="밑줄 (Underline)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="취소선 (Strikethrough)"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarColorDropdown
          title="글자 색상"
          icon={<Palette className="w-4 h-4" />}
          colors={TEXT_COLORS}
          activeColor={editor.getAttributes('textStyle').color}
          onSelect={(value) => editor.chain().focus().setColor(value).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
        />
        <ToolbarColorDropdown
          title="형광펜"
          icon={<Highlighter className="w-4 h-4" />}
          colors={HIGHLIGHT_COLORS}
          activeColor={editor.getAttributes('highlight').color}
          onSelect={(value) => editor.chain().focus().toggleHighlight({ color: value }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        />

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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="체크리스트"
        >
          <ListChecks className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().outdent().run()}
          disabled={!editor.can().outdent()}
          title="내어쓰기"
        >
          <OutdentIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().indent().run()}
          disabled={!editor.can().indent()}
          title="들여쓰기"
        >
          <IndentIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="왼쪽 정렬"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="가운데 정렬"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="오른쪽 정렬"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Blockquote / horizontal rule / link */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="인용구"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="링크 삽입/편집">
          <Link2 className="w-4 h-4" />
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
        {/* 표 안에 커서가 있을 때만 행/열 편집 버튼 노출 (표 밖에서는 항상 비활성 상태로 자리만 차지하던 문제 해결) */}
        {editor.isActive('table') && (
          <>
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
              title="표 삭제"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </ToolbarButton>
          </>
        )}

        <ToolbarDivider />

        {/* Clear formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="서식 지우기"
        >
          <RemoveFormatting className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <div className="p-3">
        <EditorContent editor={editor} />
      </div>

      {/* Character count */}
      <div className="px-3 pb-1.5 text-right text-xs text-gray-400">
        {editor.storage.characterCount.characters()}자
      </div>
    </div>
  )
}
