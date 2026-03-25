'use client';

import { useState, useEffect } from 'react';
import { FileText, Save } from 'lucide-react';

interface SpecialNotesSectionProps {
  notes: string;
  onUpdate: (notes: string) => void;
  onSave?: (notes?: string) => Promise<void>;
  isSaving?: boolean;
}

export default function SpecialNotesSection({ notes, onUpdate, onSave, isSaving }: SpecialNotesSectionProps) {
  const [editNotes, setEditNotes] = useState(notes);

  // props의 notes가 변경되면 로컬 상태 동기화
  useEffect(() => {
    setEditNotes(notes);
  }, [notes]);

  const handleSave = async () => {
    onUpdate(editNotes);
    if (onSave) {
      await onSave(editNotes);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-gray-200/80 hover:shadow-2xl hover:border-gray-300/80 transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <FileText className="w-6 h-6 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">특이사항</h2>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>
      
      <div className="space-y-4">
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          className="w-full min-h-40 px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y transition-all"
          placeholder="특이사항을 입력하세요. 예: 시설 위치 변경, 추가 점검 필요 사항, 안전 주의사항 등"
          lang="ko"
          autoComplete="off"
        />
      </div>
    </div>
  );
}