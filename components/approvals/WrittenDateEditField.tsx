'use client'

// 전자결재 작성일 한시적 수정 입력 — 평소에는 잠긴 다른 필드와 동일하게 일반 텍스트로 보이다가, 클릭하면 그때만 날짜 입력창으로 바뀐다
import { useEffect, useState } from 'react'
import { TokenManager } from '@/lib/api-client'

interface Props {
  documentId: string
  value: string
  className?: string
  onSaved?: () => void
}

export default function WrittenDateEditField({ documentId, value, className, onSaved }: Props) {
  const [localValue, setLocalValue] = useState(value)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // 문서 전환(다른 id로 이동) 또는 다른 인스턴스(PC/모바일 동시 렌더, 실시간 갱신)에서의 변경을 반영
  useEffect(() => { setLocalValue(value) }, [value])

  const handleChange = async (newDate: string) => {
    if (!newDate || newDate === localValue) return
    const prev = localValue
    setLocalValue(newDate)
    setSaving(true)
    try {
      const res = await fetch(`/api/approvals/${documentId}/written-date`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TokenManager.getToken()}`,
        },
        body: JSON.stringify({ written_date: newDate }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || '작성일 수정에 실패했습니다')
      onSaved?.()
    } catch (err: any) {
      setLocalValue(prev)
      alert(err?.message || '작성일 수정에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`${className} text-left cursor-pointer`}
        title="클릭하면 한시적으로 작성일을 수정할 수 있습니다"
      >
        {localValue || '-'}
      </button>
    )
  }

  return (
    <input
      type="date"
      autoFocus
      className={className}
      value={localValue}
      onChange={e => handleChange(e.target.value)}
      onBlur={() => setEditing(false)}
      disabled={saving}
    />
  )
}
