'use client';

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Plus, Pencil, Trash2, X, ListOrdered } from 'lucide-react';
import { SortableItem } from './SortableItem';
import { useAdminData, ProgressCategory, TaskStage } from '@/contexts/AdminDataContext';

interface TaskStagesTabProps {
  onMessage: (type: 'success' | 'error', text: string) => void;
}

export default function TaskStagesTab({ onMessage }: TaskStagesTabProps) {
  const { progressCategories, taskStages, refreshTaskStages, isLoading } = useAdminData();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [localStages, setLocalStages] = useState<TaskStage[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingStage, setEditingStage] = useState<TaskStage | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 활성 카테고리 목록
  const activeCategories = progressCategories.filter(c => c.is_active);

  // 첫 카테고리 자동 선택
  useEffect(() => {
    if (activeCategories.length > 0 && selectedCategoryId === null) {
      setSelectedCategoryId(activeCategories[0].id);
    }
  }, [activeCategories, selectedCategoryId]);

  // 선택된 카테고리의 단계 목록 동기화
  useEffect(() => {
    if (selectedCategoryId === null) return;
    const stages = taskStages
      .filter(s => s.progress_category_id === selectedCategoryId)
      .sort((a, b) => a.sort_order - b.sort_order);
    setLocalStages(stages);
  }, [taskStages, selectedCategoryId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localStages.findIndex(s => s.id === active.id);
    const newIndex = localStages.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localStages, oldIndex, newIndex);
    setLocalStages(reordered); // 낙관적 업데이트

    try {
      const res = await fetch('/api/settings/task-stages/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map(s => s.id) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      await refreshTaskStages();
    } catch {
      setLocalStages(localStages); // 롤백
      onMessage('error', '순서 변경 중 오류가 발생했습니다.');
    }
  };

  const handleAdd = async () => {
    const label = newStageName.trim();
    if (!label || selectedCategoryId === null) return;
    setIsAdding(true);
    // 낙관적 업데이트: 임시 항목 즉시 추가
    const tempId = `temp_${Date.now()}`;
    const tempStage: TaskStage = {
      id: tempId,
      progress_category_id: selectedCategoryId,
      stage_key: tempId,
      stage_label: label,
      sort_order: localStages.length + 1,
      is_active: true,
    };
    setLocalStages(prev => [...prev, tempStage]);
    setNewStageName('');
    try {
      const res = await fetch('/api/settings/task-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress_category_id: selectedCategoryId, stage_label: label }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshTaskStages();
        onMessage('success', `'${label}' 단계가 추가되었습니다.`);
      } else {
        // 롤백
        setLocalStages(prev => prev.filter(s => s.id !== tempId));
        setNewStageName(label);
        onMessage('error', data.message || '추가에 실패했습니다.');
      }
    } catch {
      // 롤백
      setLocalStages(prev => prev.filter(s => s.id !== tempId));
      setNewStageName(label);
      onMessage('error', '추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingStage) return;
    const label = editingLabel.trim();
    if (!label) return;
    setIsSaving(true);
    const prevLabel = editingStage.stage_label;
    // 낙관적 업데이트: 즉시 라벨 반영
    setLocalStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, stage_label: label } : s));
    setEditingStage(null);
    setEditingLabel('');
    try {
      const res = await fetch('/api/settings/task-stages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingStage.id, stage_label: label }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshTaskStages();
        onMessage('success', '단계 이름이 수정되었습니다.');
      } else {
        // 롤백
        setLocalStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, stage_label: prevLabel } : s));
        onMessage('error', data.message || '수정에 실패했습니다.');
      }
    } catch {
      // 롤백
      setLocalStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, stage_label: prevLabel } : s));
      onMessage('error', '수정 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (stage: TaskStage) => {
    if (!confirm(`'${stage.stage_label}' 단계를 삭제하시겠습니까?`)) return;
    // 낙관적 업데이트: 즉시 목록에서 제거
    setLocalStages(prev => prev.filter(s => s.id !== stage.id));
    try {
      const res = await fetch(`/api/settings/task-stages?id=${stage.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await refreshTaskStages();
        onMessage('success', `'${stage.stage_label}' 단계가 삭제되었습니다.`);
      } else {
        // 롤백
        setLocalStages(prev => {
          const restored = [...prev, stage].sort((a, b) => a.sort_order - b.sort_order);
          return restored;
        });
        onMessage('error', data.message || '삭제에 실패했습니다.');
      }
    } catch {
      // 롤백
      setLocalStages(prev => {
        const restored = [...prev, stage].sort((a, b) => a.sort_order - b.sort_order);
        return restored;
      });
      onMessage('error', '삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSeed = async () => {
    if (!confirm('기존 업무단계(자비/보조금/AS 등)를 DB로 마이그레이션합니다. 계속하시겠습니까?')) return;
    try {
      const res = await fetch('/api/settings/task-stages/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await refreshTaskStages();
        onMessage('success', data.message);
      } else {
        onMessage('error', data.message || '마이그레이션에 실패했습니다.');
      }
    } catch {
      onMessage('error', '마이그레이션 중 오류가 발생했습니다.');
    }
  };

  if (activeCategories.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="text-sm">먼저 <strong>진행구분 관리</strong> 탭에서 진행구분을 추가해주세요.</p>
      </div>
    );
  }

  const hasNoStagesAtAll = taskStages.length === 0;

  return (
    <div className="p-2 sm:p-6">
      {/* 시드 버튼 (단계가 하나도 없을 때) */}
      {hasNoStagesAtAll && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800 mb-3">
            기존 업무단계(자비, 보조금, AS 등)가 아직 등록되지 않았습니다. 기존 데이터를 불러오세요.
          </p>
          <button
            type="button"
            onClick={handleSeed}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            <ListOrdered className="w-4 h-4" />
            기존 업무단계 불러오기
          </button>
        </div>
      )}

      {/* 진행구분 서브탭 */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {activeCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategoryId(cat.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              selectedCategoryId === cat.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.name}
            <span className="ml-1.5 text-xs opacity-70">
              ({taskStages.filter(s => s.progress_category_id === cat.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* 선택된 카테고리의 단계 목록 */}
      {selectedCategoryId !== null && (
        <div className="max-w-lg">
          {/* 추가 폼 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">새 단계 추가</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="단계 이름 입력 (예: 현장 방문)"
                maxLength={100}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdding || !newStageName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
                {isAdding ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>

          {/* 단계 목록 */}
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : localStages.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              등록된 단계가 없습니다. 위에서 단계를 추가하세요.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localStages.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {localStages.map(stage => (
                    <SortableItem
                      key={stage.id}
                      id={stage.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        stage.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      {editingStage?.id === stage.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={e => setEditingLabel(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleUpdate();
                              if (e.key === 'Escape') { setEditingStage(null); setEditingLabel(''); }
                            }}
                            autoFocus
                            maxLength={100}
                            className="flex-1 px-2 py-1 border border-blue-400 rounded text-sm focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={handleUpdate}
                            disabled={isSaving || !editingLabel.trim()}
                            className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingStage(null); setEditingLabel(''); }}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className={`flex-1 text-sm font-medium ${stage.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                            {stage.stage_label}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setEditingStage(stage); setEditingLabel(stage.stage_label); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="이름 수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(stage)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              📌 단계 이름 수정 시 업무관리, 사업장관리 등 모든 화면에 즉각 반영됩니다. 드래그하여 단계 순서를 변경할 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
