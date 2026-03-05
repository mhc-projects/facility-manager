'use client'

import { useState } from 'react'
import { Settings, X, Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react'

interface Widget {
  id: string;
  visible: boolean;
  order: number;
}

interface DashboardLayout {
  widgets: Widget[];
}

interface DashboardCustomizerProps {
  layout: DashboardLayout;
  onSave: (layout: DashboardLayout) => void;
  onReset: () => void;
}

const WIDGET_LABELS: Record<string, string> = {
  organization: '조직 현황',
  revenue: '매출/매입/이익 현황',
  receivable: '미수금 현황',
  installation: '설치 현황',
  'monthly-leads': '월별 영업 인입 건'
};

export default function DashboardCustomizer({
  layout,
  onSave,
  onReset
}: DashboardCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>(layout.widgets);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleToggleVisibility = (id: string) => {
    setWidgets(prev => prev.map(w =>
      w.id === id ? { ...w, visible: !w.visible } : w
    ));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newWidgets = [...widgets];
    const draggedWidget = newWidgets[draggedIndex];
    newWidgets.splice(draggedIndex, 1);
    newWidgets.splice(index, 0, draggedWidget);

    // order 재정렬
    newWidgets.forEach((w, i) => {
      w.order = i + 1;
    });

    setWidgets(newWidgets);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = () => {
    onSave({ widgets });
    setIsOpen(false);
  };

  const handleReset = () => {
    if (confirm('레이아웃을 기본값으로 초기화하시겠습니까?')) {
      onReset();
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setWidgets(layout.widgets); // 원래대로 되돌림
    setIsOpen(false);
  };

  return (
    <>
      {/* 커스터마이징 버튼 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110 z-40"
        title="대시보드 커스터마이징"
      >
        <Settings className="w-6 h-6" />
      </button>

      {/* 커스터마이징 모달 */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold">대시보드 커스터마이징</h2>
              </div>
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-600 mb-4">
                위젯을 드래그하여 순서를 변경하고, 눈 아이콘을 클릭하여 표시/숨김을 설정하세요.
              </p>

              <div className="space-y-2">
                {widgets.map((widget, index) => (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      flex items-center justify-between p-4 rounded-lg border-2
                      ${draggedIndex === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}
                      ${widget.visible ? '' : 'opacity-50'}
                      cursor-move hover:border-blue-300 transition-all
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium">
                          {WIDGET_LABELS[widget.id] || widget.id}
                        </p>
                        <p className="text-xs text-gray-500">순서: {widget.order}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleVisibility(widget.id)}
                      className={`
                        p-2 rounded-full transition-colors
                        ${widget.visible ? 'hover:bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-400'}
                      `}
                      title={widget.visible ? '숨기기' : '표시하기'}
                    >
                      {widget.visible ? (
                        <Eye className="w-5 h-5" />
                      ) : (
                        <EyeOff className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800">
                  💡 팁: 최소 1개 이상의 위젯을 표시해야 합니다.
                </p>
              </div>
            </div>

            {/* 푸터 */}
            <div className="p-6 border-t border-gray-200 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={widgets.filter(w => w.visible).length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  저장
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  취소
                </button>
              </div>
              <button
                onClick={handleReset}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                기본값으로 초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
