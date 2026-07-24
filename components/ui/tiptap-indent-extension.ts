// 문단/제목 블록에 들여쓰기(margin-left)를 적용하는 커스텀 Tiptap 확장. 목록/체크리스트 항목의 들여쓰기는 sinkListItem/liftListItem이 처리하므로, 그 안에서는 문단 자체에 margin을 적용하지 않는다.
import { Extension } from '@tiptap/core'

export const INDENT_STEP_EM = 1.5
export const MAX_INDENT_LEVEL = 8

const LIST_ITEM_TYPES = ['listItem', 'taskItem']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

function isInsideListItem($from: any): boolean {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (LIST_ITEM_TYPES.includes($from.node(depth).type.name)) return true
  }
  return false
}

export const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const match = /^([\d.]+)em$/.exec((element.style.marginLeft || '').trim())
              if (!match) return 0
              const level = Math.round(parseFloat(match[1]) / INDENT_STEP_EM)
              return Math.min(Math.max(level, 0), MAX_INDENT_LEVEL)
            },
            renderHTML: (attributes: { indent?: number }) => {
              if (!attributes.indent) return {}
              return {
                style: `margin-left: ${attributes.indent * INDENT_STEP_EM}em`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    const types = this.options.types

    return {
      indent:
        () =>
        ({ editor, state, tr, dispatch, chain }: any) => {
          if (editor.can().sinkListItem('listItem')) return chain().sinkListItem('listItem').run()
          if (editor.can().sinkListItem('taskItem')) return chain().sinkListItem('taskItem').run()
          if (isInsideListItem(state.selection.$from)) return false

          const { from, to } = state.selection
          let applied = false
          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (!types.includes(node.type.name)) return
            const current = node.attrs.indent || 0
            if (current >= MAX_INDENT_LEVEL) return
            if (dispatch) tr.setNodeAttribute(pos, 'indent', current + 1)
            applied = true
          })
          if (applied && dispatch) dispatch(tr)
          return applied
        },
      outdent:
        () =>
        ({ editor, state, tr, dispatch, chain }: any) => {
          if (editor.can().liftListItem('listItem')) return chain().liftListItem('listItem').run()
          if (editor.can().liftListItem('taskItem')) return chain().liftListItem('taskItem').run()
          if (isInsideListItem(state.selection.$from)) return false

          const { from, to } = state.selection
          let applied = false
          state.doc.nodesBetween(from, to, (node: any, pos: number) => {
            if (!types.includes(node.type.name)) return
            const current = node.attrs.indent || 0
            if (current <= 0) return
            if (dispatch) tr.setNodeAttribute(pos, 'indent', current - 1)
            applied = true
          })
          if (applied && dispatch) dispatch(tr)
          return applied
        },
    } as any
  },
})
