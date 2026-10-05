'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  Calendar,
  Clock,
  User,
  Tag,
  FileText,
  Plus
} from 'lucide-react';
import { TokenManager } from '@/lib/api-client';

interface TaskMetadata {
  categories: Array<{
    id: string;
    name: string;
    description: string;
    color: string;
    icon: string;
  }>;
  statuses: Array<{
    id: string;
    name: string;
    status_type: string;
  }>;
  employees: Array<{
    id: string;
    name: string;
    email: string;
    department: string;
    position: string;
  }>;
  priorities: Array<{
    value: number;
    label: string;
    color: string;
  }>;
}

interface TaskFormData {
  title: string;
  description: string;
  category_id: string;
  priority: number;
  start_date: string;
  due_date: string;
  estimated_hours: string;
  assigned_to: string;
  tags: string[];
  is_urgent: boolean;
  is_private: boolean;
}

export default function CreateTaskPage() {
  const router = useRouter();
  const [metadata, setMetadata] = useState<TaskMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    category_id: '',
    priority: 2,
    start_date: new Date().toISOString().split('T')[0], // 오늘 날짜를 기본값으로 설정
    due_date: '',
    estimated_hours: '',
    assigned_to: '',
    tags: [],
    is_urgent: false,
    is_private: false
  });

  const [newTag, setNewTag] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      setLoading(true);
      const token = TokenManager.getToken();

      const response = await fetch('/api/tasks/metadata', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('메타데이터를 불러올 수 없습니다.');
      }

      const result = await response.json();
      if (result.success) {
        setMetadata(result.data);
        // 기본 담당자를 현재 사용자로 설정
        if (result.data.userInfo) {
          setFormData(prev => ({
            ...prev,
            assigned_to: result.data.userInfo.id
          }));
        }
      } else {
        setError(result.message || '메타데이터를 불러올 수 없습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = '업무 제목은 필수입니다.';
    } else if (formData.title.length > 200) {
      errors.title = '업무 제목은 200자 이내여야 합니다.';
    }

    if (!formData.assigned_to) {
      errors.assigned_to = '담당자를 선택해주세요.';
    }

    if (formData.estimated_hours && isNaN(Number(formData.estimated_hours))) {
      errors.estimated_hours = '예상 시간은 숫자여야 합니다.';
    }

    if (formData.due_date && formData.start_date && formData.due_date < formData.start_date) {
      errors.due_date = '마감일은 시작일보다 늦어야 합니다.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const token = TokenManager.getToken();

      const submitData = {
        ...formData,
        estimated_hours: formData.estimated_hours ? Number(formData.estimated_hours) : null,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        category_id: formData.category_id || null
      };

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
      });

      const result = await response.json();

      if (result.success) {
        router.push(`/admin/tasks/${result.data.task.id}`);
      } else {
        setError(result.message || '업무 생성에 실패했습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '업무 생성 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleInputChange = (field: keyof TaskFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // 해당 필드의 검증 오류 제거
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (loading) {
    return (
      <AdminLayout title="업무 생성" description="새로운 업무를 등록합니다">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">메타데이터를 불러오는 중...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !metadata) {
    return (
      <AdminLayout title="업무 생성" description="새로운 업무를 등록합니다">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">오류가 발생했습니다</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              돌아가기
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="업무 생성"
      description="새로운 업무를 등록합니다"
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                저장 중...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                업무 생성
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">오류가 발생했습니다</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* 기본 정보 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              기본 정보
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 업무 제목 */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  업무 제목 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base ${
                    validationErrors.title ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="업무 제목을 입력하세요"
                />
                {validationErrors.title && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.title}</p>
                )}
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => handleInputChange('category_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                >
                  <option value="">카테고리 선택</option>
                  {metadata?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 우선순위 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">우선순위</label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                >
                  {metadata?.priorities.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 담당자 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  담당자 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => handleInputChange('assigned_to', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base ${
                    validationErrors.assigned_to ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="">담당자 선택</option>
                  {metadata?.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.department} • {employee.position})
                    </option>
                  ))}
                </select>
                {validationErrors.assigned_to && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.assigned_to}</p>
                )}
              </div>

              {/* 예상 시간 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">예상 시간 (시간)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.estimated_hours}
                  onChange={(e) => handleInputChange('estimated_hours', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base ${
                    validationErrors.estimated_hours ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="예상 작업 시간"
                />
                {validationErrors.estimated_hours && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.estimated_hours}</p>
                )}
              </div>

              {/* 업무 설명 */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">업무 설명</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  placeholder="업무에 대한 상세한 설명을 입력하세요"
                />
              </div>
            </div>
          </div>

          {/* 일정 정보 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              일정 정보
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 시작일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">시작일</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleInputChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                />
              </div>

              {/* 마감일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">마감일</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => handleInputChange('due_date', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base ${
                    validationErrors.due_date ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {validationErrors.due_date && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.due_date}</p>
                )}
              </div>
            </div>
          </div>

          {/* 추가 설정 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Tag className="w-5 h-5 mr-2" />
              추가 설정
            </h2>

            {/* 태그 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">태그</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  placeholder="태그를 입력하고 Enter를 누르세요"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  aria-label="태그 추가"
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium text-blue-700 bg-blue-100"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 text-blue-500 hover:text-blue-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 체크박스 옵션 */}
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_urgent}
                  onChange={(e) => handleInputChange('is_urgent', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">긴급 업무</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_private}
                  onChange={(e) => handleInputChange('is_private', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">비공개 업무</span>
              </label>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}