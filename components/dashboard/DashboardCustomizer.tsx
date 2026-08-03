'use client'

import { useState, useEffect } from 'react'
import { Settings, X, Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'

interface Widget {
  id: string;
  visible: boolean;
  order: number;
}

interface DashboardLayout {
  widgets: Widget[];
}

// 주간 브리핑 계약 지표(자비 계약체결/보조금 신청서접수/보조금 승인)의 업무단계 기준
interface WeeklyBriefingMetricCriteria {
  label: string;
  statusKeys: string[];
}

interface WeeklyBriefingCriteria {
  selfContract: WeeklyBriefingMetricCriteria;
  subsidyReceived: WeeklyBriefingMetricCriteria;
  subsidyApproved: WeeklyBriefingMetricCriteria;
}

interface DashboardCustomizerProps {
  layout: DashboardLayout;
  onSave: (layout: DashboardLayout) => void;
  onReset: () => void;
  // 기준 저장 성공 시 호출 - 부모가 WeeklyScorecard를 재조회시키는 용도
  onCriteriaSaved?: () => void;
}

const WIDGET_LABELS: Record<string, string> = {
  'weekly-scorecard': '주간 브리핑',
  organization: '조직 현황',
  revenue: '매출/매입/이익 현황',
  receivable: '미수금 현황',
  installation: '설치 현황',
  'monthly-leads': '월별 영업 인입 건'
};

const CRITERIA_METRICS: { key: keyof WeeklyBriefingCriteria; defaultTitle: string }[] = [
  { key: 'selfContract', defaultTitle: '자비 계약체결' },
  { key: 'subsidyReceived', defaultTitle: '보조금 신청서접수' },
  { key: 'subsidyApproved', defaultTitle: '보조금 승인' },
];

export default function DashboardCustomizer({
  layout,
  onSave,
  onReset,
  onCriteriaSaved
}: DashboardCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'layout' | 'criteria'>('layout');
  const [widgets, setWidgets] = useState<Widget[]>(layout.widgets);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // 주간 브리핑 기준 설정 - task_stages/progress_categories는 전역에서 이미 로드되는 컨텍스트를 재사용
  const { progressCategories, taskStages } = useAdminData();
  const [criteria, setCriteria] = useState<WeeklyBriefingCriteria | null>(null);
  const [originalCriteria, setOriginalCriteria] = useState<WeeklyBriefingCriteria | null>(null);
  const [loadingCriteria, setLoadingCriteria] = useState(false);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [criteriaSaved, setCriteriaSaved] = useState(false);
  const [activeCategoryByMetric, setActiveCategoryByMetric] = useState<Record<string, number | null>>({});

  // task_status_history.task_type은 'self'/'subsidy'만 허용되어 대리점·외주설치·AS 단계는
  // 이력이 아예 안 쌓인다 (항상 0건). 그래서 기준 선택지도 self/subsidy 진행구분으로 제한한다.
  const relevantCategories = progressCategories.filter(
    c => c.is_active && (c.task_type === 'self' || c.task_type === 'subsidy')
  );

  useEffect(() => {
    if (!isOpen) return;
    loadCriteria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const computeDefaultCategoryId = (metric: WeeklyBriefingMetricCriteria): number | null => {
    const firstKey = metric.statusKeys[0];
    const stage = firstKey ? taskStages.find(s => s.stage_key === firstKey) : undefined;
    return stage?.progress_category_id ?? relevantCategories[0]?.id ?? null;
  };

  const loadCriteria = async () => {
    setLoadingCriteria(true);
    setCriteriaError(null);
    setCriteriaSaved(false);
    try {
      const res = await fetch('/api/settings/weekly-briefing-criteria');
      const result = await res.json();
      if (result.success) {
        setCriteria(result.data);
        setOriginalCriteria(result.data);
        setActiveCategoryByMetric({
          selfContract: computeDefaultCategoryId(result.data.selfContract),
          subsidyReceived: computeDefaultCategoryId(result.data.subsidyReceived),
          subsidyApproved: computeDefaultCategoryId(result.data.subsidyApproved),
        });
      } else {
        setCriteriaError(result.message || '기준을 불러오지 못했습니다.');
      }
    } catch {
      setCriteriaError('기준을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingCriteria(false);
    }
  };

  const updateLabel = (key: keyof WeeklyBriefingCriteria, label: string) => {
    setCriteria(prev => prev ? { ...prev, [key]: { ...prev[key], label } } : prev);
  };

  const toggleStage = (key: keyof WeeklyBriefingCriteria, stageKey: string) => {
    setCriteria(prev => {
      if (!prev) return prev;
      const current = prev[key].statusKeys;
      const nextKeys = current.includes(stageKey)
        ? current.filter(k => k !== stageKey)
        : [...current, stageKey];
      return { ...prev, [key]: { ...prev[key], statusKeys: nextKeys } };
    });
  };

  const handleSaveCriteria = async () => {
    if (!criteria) return;
    setSavingCriteria(true);
    setCriteriaError(null);
    setCriteriaSaved(false);
    try {
      const res = await fetch('/api/settings/weekly-briefing-criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(criteria)
      });
      const result = await res.json();
      if (result.success) {
        setCriteria(result.data);
        setOriginalCriteria(result.data);
        setCriteriaSaved(true);
        onCriteriaSaved?.();
      } else {
        setCriteriaError(result.message || '저장에 실패했습니다.');
      }
    } catch {
      setCriteriaError('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingCriteria(false);
    }
  };

  const handleCancelCriteria = () => {
    setCriteria(originalCriteria);
    setCriteriaError(null);
    setCriteriaSaved(false);
  };

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
    setCriteria(originalCriteria);
    setCriteriaError(null);
    setCriteriaSaved(false);
    setActiveTab('layout');
    setIsOpen(false);
  };

  const criteriaHasEmptyMetric = criteria
    ? CRITERIA_METRICS.some(({ key }) => criteria[key].statusKeys.length === 0)
    : true;

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
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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

            {/* 탭 */}
            <div className="flex border-b border-gray-200 shrink-0">
              <button
                onClick={() => setActiveTab('layout')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'layout'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                위젯 배치
              </button>
              <button
                onClick={() => setActiveTab('criteria')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'criteria'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                주간 브리핑 기준
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'layout' ? (
                <>
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
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    주간 브리핑의 계약 3개 지표가 어떤 업무단계를 셀지 직접 고를 수 있습니다.
                    회사 전체에 공통으로 적용됩니다. 대리점·외주설치·AS 단계는 이력이 쌓이지 않아 목록에서 제외했습니다.
                  </p>

                  {loadingCriteria && (
                    <div className="flex items-center justify-center py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                  )}

                  {!loadingCriteria && criteriaError && !criteria && (
                    <div className="p-4 bg-red-50 rounded-lg text-sm text-red-700">
                      {criteriaError}
                      <button onClick={loadCriteria} className="ml-2 underline">다시 시도</button>
                    </div>
                  )}

                  {!loadingCriteria && criteria && (
                    <div className="space-y-4">
                      {CRITERIA_METRICS.map(({ key, defaultTitle }) => {
                        const metric = criteria[key];
                        const activeCategoryId = activeCategoryByMetric[key] ?? null;
                        const categoryStages = taskStages
                          .filter(s => s.is_active && s.progress_category_id === activeCategoryId)
                          .sort((a, b) => a.sort_order - b.sort_order);

                        return (
                          <div key={key} className="border border-gray-200 rounded-lg p-4">
                            <label className="block text-xs font-medium text-gray-500 mb-1">지표 이름</label>
                            <input
                              type="text"
                              value={metric.label}
                              onChange={e => updateLabel(key, e.target.value)}
                              placeholder={defaultTitle}
                              className="w-full mb-3 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />

                            <label className="block text-xs font-medium text-gray-500 mb-1">선택된 업무단계</label>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {metric.statusKeys.length === 0 && (
                                <span className="text-xs text-red-500">최소 1개 이상 선택해주세요.</span>
                              )}
                              {metric.statusKeys.map(stageKey => {
                                const stage = taskStages.find(s => s.stage_key === stageKey);
                                return (
                                  <span
                                    key={stageKey}
                                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                                  >
                                    {stage?.stage_label || stageKey}
                                    <button
                                      type="button"
                                      onClick={() => toggleStage(key, stageKey)}
                                      className="p-0.5 hover:bg-blue-100 rounded-full"
                                      title="선택 해제"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>

                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {relevantCategories.map(cat => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setActiveCategoryByMetric(prev => ({ ...prev, [key]: cat.id }))}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                                    activeCategoryId === cat.id
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {cat.name}
                                </button>
                              ))}
                            </div>

                            <div className="max-h-36 overflow-y-auto border border-gray-100 rounded p-2 space-y-0.5">
                              {categoryStages.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2 text-center">
                                  해당 진행구분에 업무단계가 없습니다.
                                </p>
                              ) : (
                                categoryStages.map(stage => (
                                  <label
                                    key={stage.id}
                                    className="flex items-center gap-2 text-sm py-0.5 px-1 rounded cursor-pointer hover:bg-gray-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={metric.statusKeys.includes(stage.stage_key)}
                                      onChange={() => toggleStage(key, stage.stage_key)}
                                      className="rounded border-gray-300"
                                    />
                                    <span className="text-gray-700">{stage.stage_label}</span>
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {criteriaError && criteria && (
                    <p className="mt-3 text-sm text-red-600">{criteriaError}</p>
                  )}
                  {criteriaSaved && (
                    <p className="mt-3 text-sm text-green-600">기준이 저장되었습니다.</p>
                  )}
                </>
              )}
            </div>

            {/* 푸터 */}
            <div className="p-6 border-t border-gray-200 space-y-2">
              {activeTab === 'layout' ? (
                <>
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
                </>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveCriteria}
                    disabled={!criteria || savingCriteria || criteriaHasEmptyMetric}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingCriteria ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={handleCancelCriteria}
                    disabled={savingCriteria || !originalCriteria}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                  >
                    되돌리기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
