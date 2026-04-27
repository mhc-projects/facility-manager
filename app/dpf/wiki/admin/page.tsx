'use client';

import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/ui/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { GuidelineUpload } from '@/types/dpf';
import { Upload, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, BookOpen, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function WikiAdminPage() {
  const { user } = useAuth();
  const isSystemAdmin = user?.permission_level === 4;

  const [uploads, setUploads] = useState<GuidelineUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUploads();
    // 분석 중인 항목이 있으면 5초마다 자동 갱신
    const interval = setInterval(async () => {
      const res = await fetch('/api/wiki/guideline-uploads');
      const rows: GuidelineUpload[] = res.ok ? await res.json() : [];
      setUploads(rows);
      if (!rows.some(r => r.status === 'analyzing')) {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadUploads() {
    const res = await fetch('/api/wiki/guideline-uploads');
    if (res.ok) setUploads(await res.json() as GuidelineUpload[]);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !versionLabel.trim()) {
      alert('버전 레이블을 입력하고 파일을 선택하세요.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('version_label', versionLabel);
      const res = await fetch('/api/wiki/upload-guideline', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`업로드 완료!\n${data.message}`);
      setVersionLabel('');
      loadUploads();
    } catch (err) {
      alert(`업로드 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(upload: GuidelineUpload) {
    if (!confirm(`"${upload.version_label}" 업로드 이력을 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속할까요?`)) return;
    setDeletingId(upload.id);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`/api/wiki/guideline-uploads/${upload.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploads(prev => prev.filter(u => u.id !== upload.id));
    } catch (err) {
      alert(`삭제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReindex() {
    if (!confirm('Wiki 전체를 재인덱싱합니다. 시간이 걸릴 수 있습니다. 계속할까요?')) return;
    setReindexing(true);
    setReindexResult('');
    try {
      const res = await fetch('/api/wiki/reindex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReindexResult(`완료: ${data.indexed}개 청크 인덱싱, ${data.errors}개 오류`);
    } catch (err) {
      setReindexResult(`오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setReindexing(false);
    }
  }

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    analyzing:    { icon: <Clock className="w-4 h-4" />, label: 'AI 분석 중', color: 'text-blue-600 bg-blue-50' },
    review_needed:{ icon: <AlertCircle className="w-4 h-4" />, label: '검토 필요', color: 'text-yellow-600 bg-yellow-50' },
    applied:      { icon: <CheckCircle className="w-4 h-4" />, label: '적용 완료', color: 'text-green-600 bg-green-50' },
    rejected:     { icon: <XCircle className="w-4 h-4" />, label: '반려', color: 'text-red-600 bg-red-50' },
  };

  return (
    <AdminLayout title="DPF 지침 관리" description="지침서 업로드, AI 분석, Wiki 재인덱싱">
      <div className="space-y-6 max-w-3xl">
        <div>
          <Link href="/dpf/wiki" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Wiki로 돌아가기
          </Link>
        </div>

        {/* 1. 지침서 업로드 */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" /> 지침서 PDF 업로드
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">버전 레이블</label>
              <input
                type="text"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="예: 2026년 업무처리지침"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">PDF 파일</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                disabled={uploading || !versionLabel.trim()}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 cursor-pointer
                           file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0
                           file:bg-blue-50 file:text-blue-700 file:text-sm file:cursor-pointer
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {uploading && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <RefreshCw className="w-4 h-4 animate-spin" /> 업로드 및 AI 분석 중...
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            업로드 후 AI가 자동으로 변경사항을 분석합니다. 검토 후 적용 여부를 결정하세요.
          </p>
        </div>

        {/* 2. 업로드 이력 */}
        {uploads.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">업로드 이력</h2>
              <button onClick={loadUploads}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                <RefreshCw className="w-3.5 h-3.5" /> 새로고침
              </button>
            </div>
            <div className="space-y-3">
              {uploads.map(upload => {
                const st = statusConfig[upload.status];
                const isDeleting = deletingId === upload.id;
                return (
                  <div key={upload.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-800">{upload.version_label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(upload.created_at).toLocaleString('ko-KR')}
                        </div>
                        {upload.diff_summary && (
                          <p className="mt-2 text-sm text-gray-600">{upload.diff_summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {st && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                            {st.icon} {st.label}
                          </span>
                        )}
                        {isSystemAdmin && (
                          <button
                            onClick={() => handleDelete(upload)}
                            disabled={isDeleting}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="이력 삭제"
                          >
                            {isDeleting
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Wiki 변경사항 미리보기 */}
                    {Array.isArray(upload.wiki_changes) && upload.wiki_changes.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">
                          챕터 정보 ({upload.wiki_changes.length}개)
                        </summary>
                        <div className="mt-1 text-xs text-gray-600 space-y-0.5 pl-2">
                          {(upload.wiki_changes as Array<{ title?: string }>).slice(0, 5).map((ch, i) => (
                            <div key={i}>• {ch?.title ?? '제목 없음'}</div>
                          ))}
                        </div>
                      </details>
                    )}

                    {upload.status === 'review_needed' && (
                      <div className="mt-3 flex gap-2">
                        <a href={upload.file_url} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                          원본 보기
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. AI 임베딩 재인덱싱 */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-purple-600" /> Wiki AI 임베딩 재생성
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Wiki 내용이 변경되면 AI Q&A가 최신 내용을 반영하도록 임베딩을 다시 생성해야 합니다.
          </p>
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm
                       hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${reindexing ? 'animate-spin' : ''}`} />
            {reindexing ? '재인덱싱 중...' : 'Wiki 전체 재인덱싱'}
          </button>
          {reindexResult && (
            <p className={`mt-2 text-sm ${reindexResult.startsWith('오류') ? 'text-red-600' : 'text-green-700'}`}>
              {reindexResult}
            </p>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
