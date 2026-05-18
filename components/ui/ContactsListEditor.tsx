'use client';

import React, { useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import { formatMobilePhone } from '@/utils/phone-formatter';

export interface ContactPerson {
  name: string;
  position: string;
  phone: string;
  email: string;
  comment?: string;
}

interface ContactsListEditorProps {
  value: ContactPerson[];
  onChange: (value: ContactPerson[]) => void;
}

export default function ContactsListEditor({ value, onChange }: ContactsListEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const update = (i: number, field: keyof ContactPerson, val: string) => {
    const next = [...value];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const add = () => {
    onChange([...value, { name: '', position: '', phone: '', email: '', comment: '' }]);
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...value];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">담당자</label>
        <button type="button" onClick={add} className="text-xs text-blue-600 hover:text-blue-800">
          + 추가
        </button>
      </div>
      <div className="space-y-1.5">
        {value.map((c, i) => (
          <div
            key={i}
            draggable={value.length > 1}
            onDragStart={e => handleDragStart(e, i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`rounded-md transition-all ${dragOverIndex === i && dragIndex !== i ? 'ring-2 ring-blue-400 ring-offset-1' : ''} ${dragIndex === i ? 'opacity-40' : ''}`}
          >
            {/* 1행: 기본 정보 */}
            <div className="flex items-center gap-1.5">
              {/* 드래그 핸들 + 순서 표시 */}
              {value.length > 1 && (
                <div className={`flex items-center gap-0.5 shrink-0 ${i === 0 ? 'text-blue-500' : 'text-gray-300'} cursor-grab active:cursor-grabbing`}>
                  <GripVertical className="w-4 h-4" />
                  {i === 0 && (
                    <span className="text-[9px] font-bold leading-none">1st</span>
                  )}
                </div>
              )}
              <input
                type="text"
                lang="ko"
                inputMode="text"
                placeholder="이름"
                value={c.name}
                onChange={e => update(i, 'name', e.target.value)}
                className={`w-20 px-2 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 shrink-0 ${i === 0 ? 'border-blue-300 bg-blue-50/40' : 'border-gray-300'}`}
              />
              <input
                type="text"
                lang="ko"
                inputMode="text"
                placeholder="직급"
                value={c.position}
                onChange={e => update(i, 'position', e.target.value)}
                className="w-16 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 shrink-0"
              />
              <input
                type="tel"
                placeholder="전화번호"
                value={c.phone}
                onChange={e => update(i, 'phone', formatMobilePhone(e.target.value))}
                maxLength={14}
                className="w-32 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 shrink-0"
              />
              <input
                type="email"
                placeholder="이메일"
                value={c.email}
                onChange={e => update(i, 'email', e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-gray-400 hover:text-red-500 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* 2행: 코멘트 */}
            <div className="mt-1" style={{ marginLeft: value.length > 1 ? '1.375rem' : '0' }}>
              <input
                type="text"
                placeholder="코멘트 (예: 오전에만 통화 가능, 이메일보다 전화 선호)"
                value={c.comment || ''}
                onChange={e => update(i, 'comment', e.target.value)}
                maxLength={200}
                className="w-full px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-600 focus:ring-1 focus:ring-blue-400 bg-amber-50/40 placeholder:text-gray-400"
              />
            </div>
          </div>
        ))}
        {value.length === 0 && (
          <p className="text-xs text-gray-400">담당자를 추가하세요</p>
        )}
      </div>
    </div>
  );
}
