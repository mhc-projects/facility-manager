'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/contexts/AuthContext';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import AdminLayout from '@/components/ui/AdminLayout';
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Shield,
  Mail,
  Calendar,
  Edit,
  Trash2,
  Search,
  Filter,
  MoreVertical,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Building2,
  User,
  Eye,
  EyeOff,
  Activity,
  Link,
  Unlink,
  Clock,
  Monitor,
  Smartphone,
  MapPin,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { TokenManager } from '@/lib/api-client';

interface Employee {
  id: string;
  name: string;
  email: string;
  employee_id: string;
  department?: string;
  position?: string;
  permission_level: number;
  is_active: boolean;
  is_deleted: boolean;
  created_at: string;
  last_login_at?: string;
  password_changed_at?: string;
}

interface SocialApproval {
  id: string;
  provider: 'kakao' | 'naver' | 'google';
  requester_name: string;
  requester_email: string;
  email_domain: string;
  requested_permission_level: number;
  requested_department: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  processed_at: string | null;
  approved_by: string | null;
  approval_reason: string | null;
}

// 소셜 계정 정보 타입
interface UserSocialAccount {
  id: string;
  user_id: string;
  provider: 'google' | 'kakao' | 'naver';
  provider_user_id: string;
  provider_email: string;
  provider_name: string;
  provider_picture_url?: string;
  connected_at: string;
  last_login_at?: string;
  is_primary: boolean;
  is_active: boolean;
}

// 로그인 이력 정보 타입
interface UserLoginHistory {
  id: string;
  user_id: string;
  login_method: 'google' | 'kakao' | 'naver';
  ip_address: string;
  user_agent: string;
  device_info?: string;
  location_info?: string;
  login_at: string;
  logout_at?: string;
  session_duration?: number;
  is_suspicious: boolean;
}

// 승인 설정 폼 컴포넌트
function ApprovalSettingsForm({ settings, onSave, onTest, isSaving }: {
  settings: any;
  onSave: (settings: any) => void;
  onTest: (email: string, permissionLevel: number) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState({
    auto_approval_enabled: settings.auto_approval_enabled || false,
    auto_approval_domains: settings.auto_approval_domains || [],
    auto_approval_permission_level: settings.auto_approval_permission_level || 1,
    manual_approval_required_for_level_3: settings.manual_approval_required_for_level_3 ?? true,
    notification_emails: settings.notification_emails || [],
    approval_timeout_hours: settings.approval_timeout_hours || 24
  });

  const [newDomain, setNewDomain] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testPermissionLevel, setTestPermissionLevel] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addDomain = () => {
    if (newDomain && !formData.auto_approval_domains.includes(newDomain)) {
      setFormData({
        ...formData,
        auto_approval_domains: [...formData.auto_approval_domains, newDomain]
      });
      setNewDomain('');
    }
  };

  const removeDomain = (domain: string) => {
    setFormData({
      ...formData,
      auto_approval_domains: formData.auto_approval_domains.filter((d: string) => d !== domain)
    });
  };

  const addNotificationEmail = () => {
    if (newEmail && !formData.notification_emails.includes(newEmail)) {
      setFormData({
        ...formData,
        notification_emails: [...formData.notification_emails, newEmail]
      });
      setNewEmail('');
    }
  };

  const removeNotificationEmail = (email: string) => {
    setFormData({
      ...formData,
      notification_emails: formData.notification_emails.filter((e: string) => e !== email)
    });
  };

  const handleTest = () => {
    if (testEmail && testPermissionLevel) {
      onTest(testEmail, testPermissionLevel);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 자동 승인 설정 */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">자동 승인 설정</h3>

        <div className="space-y-6">
          {/* 자동 승인 활성화 */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="auto_approval_enabled"
              checked={formData.auto_approval_enabled}
              onChange={(e) => setFormData({ ...formData, auto_approval_enabled: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="auto_approval_enabled" className="ml-2 text-sm font-medium text-gray-900">
              자동 승인 활성화
            </label>
          </div>

          {/* 자동 승인 도메인 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              자동 승인 허용 도메인
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="@company.com"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addDomain}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
              >
                추가
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.auto_approval_domains.map((domain: string, index: number) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                >
                  {domain}
                  <button
                    type="button"
                    onClick={() => removeDomain(domain)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* 자동 승인 최대 권한 레벨 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              자동 승인 최대 권한 레벨
            </label>
            <select
              value={formData.auto_approval_permission_level}
              onChange={(e) => setFormData({ ...formData, auto_approval_permission_level: parseInt(e.target.value) })}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value={1}>레벨 1 (일반사용자)</option>
              <option value={2}>레벨 2 (매니저)</option>
              <option value={3}>레벨 3 (관리자)</option>
            </select>
          </div>

          {/* 관리자 권한 수동 승인 */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="manual_approval_required_for_level_3"
              checked={formData.manual_approval_required_for_level_3}
              onChange={(e) => setFormData({ ...formData, manual_approval_required_for_level_3: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="manual_approval_required_for_level_3" className="ml-2 text-sm font-medium text-gray-900">
              관리자 권한(레벨 3)은 항상 수동 승인 필요
            </label>
          </div>
        </div>
      </div>

      {/* 알림 설정 */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">알림 설정</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            승인 요청 알림 이메일
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@company.com"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addNotificationEmail}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
            >
              추가
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.notification_emails.map((email: string, index: number) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeNotificationEmail(email)}
                  className="ml-2 text-green-600 hover:text-green-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 타임아웃 설정 */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">타임아웃 설정</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            승인 요청 타임아웃 (시간)
          </label>
          <input
            type="number"
            min="1"
            max="168"
            value={formData.approval_timeout_hours}
            onChange={(e) => setFormData({ ...formData, approval_timeout_hours: parseInt(e.target.value) })}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-32"
          />
          <p className="text-xs text-gray-500 mt-1">1~168시간 (최대 1주일)</p>
        </div>
      </div>

      {/* 테스트 도구 */}
      <div className="bg-yellow-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">자동 승인 테스트</h3>

        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              테스트 이메일
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@company.com"
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              요청 권한 레벨
            </label>
            <select
              value={testPermissionLevel}
              onChange={(e) => setTestPermissionLevel(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value={1}>레벨 1 (일반사용자)</option>
              <option value={2}>레벨 2 (매니저)</option>
              <option value={3}>레벨 3 (관리자)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleTest}
            className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 text-sm"
          >
            테스트 실행
          </button>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end space-x-4">
        <button
          type="submit"
          disabled={isSaving}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </form>
  );
}

function UsersManagementPage() {
  const router = useRouter();
  const { user } = useAuth();

  // 관리자 권한 체크
  useEffect(() => {
    if (user && user.permission_level < 3) {
      router.push('/admin');
      return;
    }
  }, [user, router]);

  const [activeTab, setActiveTab] = useState<'users' | 'approvals' | 'settings'>('users');
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);
  const [userDetailTab, setUserDetailTab] = useState<'info' | 'social' | 'history'>('info');
  const [userSocialAccounts, setUserSocialAccounts] = useState<UserSocialAccount[]>([]);
  const [userLoginHistory, setUserLoginHistory] = useState<UserLoginHistory[]>([]);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);

  // 승인 설정 상태
  const [approvalSettings, setApprovalSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [socialApprovals, setSocialApprovals] = useState<SocialApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [permissionFilter, setPermissionFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // 사용자 편집 모달
  const [editingUser, setEditingUser] = useState<Employee | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // 비밀번호 재설정 모달
  const [resetPasswordUser, setResetPasswordUser] = useState<Employee | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadData();
    loadApprovalSettings();
  }, []);

  const loadData = async () => {
    if (!user || user.permission_level < 3) return;

    try {
      setLoading(true);
      await Promise.all([loadEmployees(), loadSocialApprovals()]);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/employees', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setEmployees(data.data.employees || []);
        }
      } else {
        console.warn('직원 목록 로드 실패');
        setEmployees([]);
      }
    } catch (error) {
      console.error('직원 목록 로드 오류:', error);
      setEmployees([]);
    }
  };

  const loadSocialApprovals = async () => {
    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/social-approvals?status=pending', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSocialApprovals(data.data.approvals || []);
        }
      } else {
        setSocialApprovals([]);
      }
    } catch (error) {
      console.error('승인 요청 로드 오류:', error);
      setSocialApprovals([]);
    }
  };

  const handleUserEdit = async (userData: Partial<Employee>) => {
    if (!editingUser) return;

    try {
      console.log('🔄 사용자 업데이트 시작:', {
        userId: editingUser.id,
        userData
      });

      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/employees/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      console.log('📡 API 응답 상태:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // ✅ Realtime이 자동으로 사용자 정보 업데이트 - loadEmployees() 불필요
          setShowEditModal(false);
          setEditingUser(null);
          alert('사용자 정보가 성공적으로 업데이트되었습니다.');
        } else {
          throw new Error(data.message || '사용자 업데이트 실패');
        }
      } else {
        const errorData = await response.json();

        // 권한 관련 에러 메시지 강조
        if (response.status === 403) {
          alert(`⚠️ 권한 부족\n\n${errorData.message}`);
        } else {
          alert(`❌ 업데이트 실패\n\n${errorData.message || '사용자 업데이트 중 오류가 발생했습니다.'}`);
        }
        return;
      }
    } catch (error) {
      console.error('❌ [USER-EDIT] 사용자 업데이트 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.';
      alert(`❌ 시스템 오류\n\n${errorMessage}`);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetPasswordUser || !newPassword) return;

    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/employees/${resetPasswordUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setShowPasswordModal(false);
          setResetPasswordUser(null);
          setNewPassword('');
          alert('비밀번호가 성공적으로 재설정되었습니다.');
        }
      } else {
        throw new Error('비밀번호 재설정 실패');
      }
    } catch (error) {
      console.error('비밀번호 재설정 오류:', error);
      alert('비밀번호 재설정 중 오류가 발생했습니다.');
    }
  };

  const handleUserToggle = async (userId: string, isActive: boolean) => {
    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/employees/${userId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive })
      });

      if (response.ok) {
        // ✅ Realtime이 자동으로 상태 업데이트 - loadEmployees() 불필요
        alert(`사용자가 ${isActive ? '활성화' : '비활성화'}되었습니다.`);
      }
    } catch (error) {
      console.error('사용자 상태 변경 오류:', error);
      alert('사용자 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleApprovalAction = async (approvalId: string, action: 'approved' | 'rejected', reason?: string) => {
    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/social-approvals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approvalId, action, reason })
      });

      if (response.ok) {
        // ✅ Realtime이 자동으로 승인 상태 업데이트 - loadSocialApprovals() 불필요
        alert(`승인 요청이 ${action === 'approved' ? '승인' : '거부'}되었습니다.`);
      }
    } catch (error) {
      console.error('승인 처리 오류:', error);
      alert('승인 처리 중 오류가 발생했습니다.');
    }
  };

  // 사용자 상세 정보 로드
  const loadUserDetails = async (user: Employee) => {
    try {
      setLoadingUserDetails(true);
      setSelectedUser(user);

      const token = TokenManager.getToken();

      // 소셜 계정 정보 로드
      const socialResponse = await fetch(`/api/admin/user-social-accounts?userId=${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (socialResponse.ok) {
        const socialData = await socialResponse.json();
        if (socialData.success) {
          setUserSocialAccounts(socialData.data.socialAccounts || []);
        }
      }

      // 로그인 이력 로드 (최근 50개)
      const historyResponse = await fetch(`/api/admin/user-login-history?userId=${user.id}&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData.success) {
          setUserLoginHistory(historyData.data.loginHistory || []);
        }
      }
    } catch (error) {
      console.error('사용자 상세 정보 로드 오류:', error);
    } finally {
      setLoadingUserDetails(false);
    }
  };

  // 소셜 계정 연결 해제
  const handleDisconnectSocialAccount = async (socialAccountId: string) => {
    if (!confirm('이 소셜 계정 연결을 해제하시겠습니까?')) return;

    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/user-social-accounts?socialAccountId=${socialAccountId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        if (selectedUser) {
          await loadUserDetails(selectedUser);
        }
        alert('소셜 계정 연결이 해제되었습니다.');
      }
    } catch (error) {
      console.error('소셜 계정 연결 해제 오류:', error);
      alert('소셜 계정 연결 해제 중 오류가 발생했습니다.');
    }
  };

  // 주 소셜 계정 설정
  const handleSetPrimarySocialAccount = async (socialAccountId: string) => {
    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/user-social-accounts', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ socialAccountId, action: 'set_primary' })
      });

      if (response.ok) {
        if (selectedUser) {
          await loadUserDetails(selectedUser);
        }
        alert('주 소셜 계정이 변경되었습니다.');
      }
    } catch (error) {
      console.error('주 소셜 계정 설정 오류:', error);
      alert('주 소셜 계정 설정 중 오류가 발생했습니다.');
    }
  };

  // 세션 강제 종료
  const handleTerminateSession = async (sessionId: string) => {
    if (!confirm('이 세션을 강제로 종료하시겠습니까?')) return;

    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/user-login-history?sessionId=${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        if (selectedUser) {
          await loadUserDetails(selectedUser);
        }
        alert('세션이 강제로 종료되었습니다.');
      }
    } catch (error) {
      console.error('세션 종료 오류:', error);
      alert('세션 종료 중 오류가 발생했습니다.');
    }
  };

  // ==================== 실시간 이벤트 핸들러 ====================

  // employees 테이블 실시간 업데이트 핸들러
  const handleEmployeeUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    console.log('📡 [REALTIME] employees 이벤트:', {
      eventType,
      userId: newRecord?.id || oldRecord?.id,
      changes: {
        is_active: oldRecord?.is_active !== newRecord?.is_active,
        last_login_at: oldRecord?.last_login_at !== newRecord?.last_login_at,
        permission_level: oldRecord?.permission_level !== newRecord?.permission_level
      }
    });

    if (eventType === 'INSERT') {
      // 새 사용자 추가 (승인 대기 목록에 추가)
      setEmployees(prev => [newRecord, ...prev]);
      console.log('✅ [REALTIME] 새 사용자 추가:', newRecord.name);
    }

    if (eventType === 'UPDATE') {
      // 변경사항이 실제로 있는지 확인 (중복 업데이트 방지)
      const hasChanges = Object.keys(newRecord).some(
        key => JSON.stringify(newRecord[key]) !== JSON.stringify(oldRecord?.[key])
      );

      if (!hasChanges) {
        console.log('⚠️ [REALTIME] 변경사항 없음 - 업데이트 스킵');
        return;
      }

      // 사용자 정보 업데이트
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === newRecord.id ? { ...emp, ...newRecord } : emp
        )
      );

      // 현재 선택된 사용자 상세 정보도 업데이트
      if (selectedUser?.id === newRecord.id) {
        setSelectedUser(prev => prev ? { ...prev, ...newRecord } : null);
        console.log('✅ [REALTIME] 선택된 사용자 정보 업데이트:', newRecord.name);
      }

      console.log('✅ [REALTIME] 사용자 정보 업데이트:', newRecord.name);
    }

    if (eventType === 'DELETE') {
      // 사용자 삭제
      setEmployees(prev => prev.filter(emp => emp.id !== oldRecord.id));

      // 삭제된 사용자가 현재 선택되어 있으면 모달 닫기
      if (selectedUser?.id === oldRecord.id) {
        setSelectedUser(null);
      }

      console.log('✅ [REALTIME] 사용자 삭제:', oldRecord.name);
    }
  }, [selectedUser]);

  // social_login_approvals 테이블 실시간 업데이트 핸들러
  const handleApprovalUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    console.log('📡 [REALTIME] social_login_approvals 이벤트:', {
      eventType,
      approvalId: newRecord?.id || oldRecord?.id,
      status: newRecord?.approval_status
    });

    if (eventType === 'INSERT') {
      // 새 승인 요청 추가
      setSocialApprovals(prev => [newRecord, ...prev]);
      console.log('✅ [REALTIME] 새 승인 요청 추가:', newRecord.requester_name);
    }

    if (eventType === 'UPDATE') {
      // 승인 상태 업데이트
      setSocialApprovals(prev =>
        prev.map(approval =>
          approval.id === newRecord.id ? { ...approval, ...newRecord } : approval
        )
      );

      // 승인 완료 시 승인 대기 목록에서 제거
      if (newRecord.approval_status !== 'pending') {
        setSocialApprovals(prev => prev.filter(approval => approval.id !== newRecord.id));
        console.log('✅ [REALTIME] 승인 처리 완료 - 목록에서 제거:', newRecord.requester_name);
      }
    }

    if (eventType === 'DELETE') {
      // 승인 요청 삭제
      setSocialApprovals(prev => prev.filter(approval => approval.id !== oldRecord.id));
      console.log('✅ [REALTIME] 승인 요청 삭제:', oldRecord.requester_name);
    }
  }, []);

  // user_login_history 테이블 실시간 업데이트 핸들러
  const handleLoginHistoryUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord } = payload;

    if (eventType === 'INSERT') {
      console.log('📡 [REALTIME] user_login_history 이벤트:', {
        userId: newRecord.user_id,
        loginAt: newRecord.login_at,
        loginMethod: newRecord.login_method
      });

      // 로그인 이력 추가 (선택된 사용자만)
      if (selectedUser?.id === newRecord.user_id) {
        setUserLoginHistory(prev => [newRecord, ...prev]);
        console.log('✅ [REALTIME] 로그인 이력 추가:', newRecord.login_method);
      }

      // 해당 사용자의 last_login_at 업데이트
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === newRecord.user_id
            ? { ...emp, last_login_at: newRecord.login_at }
            : emp
        )
      );

      // 선택된 사용자 정보도 업데이트
      if (selectedUser?.id === newRecord.user_id) {
        setSelectedUser(prev =>
          prev ? { ...prev, last_login_at: newRecord.login_at } : null
        );
        console.log('✅ [REALTIME] 최근 로그인 시간 업데이트:', newRecord.login_at);
      }
    }
  }, [selectedUser]);

  // ==================== 실시간 구독 설정 ====================

  // employees 테이블 실시간 구독
  useSupabaseRealtime({
    tableName: 'employees',
    eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
    onNotification: handleEmployeeUpdate,
    autoConnect: true
  });

  // social_login_approvals 테이블 실시간 구독
  useSupabaseRealtime({
    tableName: 'social_login_approvals',
    eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
    onNotification: handleApprovalUpdate,
    autoConnect: true
  });

  // user_login_history 테이블 실시간 구독
  useSupabaseRealtime({
    tableName: 'user_login_history',
    eventTypes: ['INSERT'],
    onNotification: handleLoginHistoryUpdate,
    autoConnect: true
  });

  // 승인 설정 로드
  const loadApprovalSettings = async () => {
    try {
      setLoadingSettings(true);
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/approval-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setApprovalSettings(data.data.settings);
        }
      }
    } catch (error) {
      console.error('승인 설정 로드 오류:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  // 승인 설정 저장
  const saveApprovalSettings = async (settings: any) => {
    try {
      setSavingSettings(true);
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/approval-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...settings,
          updated_by: user?.name || 'admin'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setApprovalSettings(data.data.settings);
          alert('승인 설정이 성공적으로 저장되었습니다.');
        }
      } else {
        throw new Error('승인 설정 저장 실패');
      }
    } catch (error) {
      console.error('승인 설정 저장 오류:', error);
      alert('승인 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  // 자동 승인 테스트
  const testAutoApproval = async (email: string, permissionLevel: number) => {
    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/admin/approval-settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          requested_permission_level: permissionLevel
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const result = data.data.canAutoApprove ? '✅ 자동 승인' : '❌ 수동 승인 필요';
          const reasons = Object.entries(data.data.reason)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          alert(`테스트 결과: ${result}\n\n상세 정보:\n${reasons}`);
        }
      }
    } catch (error) {
      console.error('자동 승인 테스트 오류:', error);
      alert('자동 승인 테스트 중 오류가 발생했습니다.');
    }
  };

  const getPermissionLabel = (level: number) => {
    switch (level) {
      case 4: return { text: '시스템', color: 'text-purple-600 bg-purple-50 border-purple-200' };
      case 3: return { text: '관리자', color: 'text-red-600 bg-red-50 border-red-200' };
      case 2: return { text: '매니저', color: 'text-orange-600 bg-orange-50 border-orange-200' };
      case 1: return { text: '일반', color: 'text-blue-600 bg-blue-50 border-blue-200' };
      case 0: return { text: '게스트', color: 'text-gray-600 bg-gray-50 border-gray-200' };
      default: return { text: '사용자', color: 'text-gray-600 bg-gray-50 border-gray-200' };
    }
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'kakao': return '카카오';
      case 'naver': return '네이버';
      case 'google': return '구글';
      default: return provider;
    }
  };

  // 필터링된 사용자 목록
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.employee_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPermission = permissionFilter === 'all' || emp.permission_level === permissionFilter;

    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'active' && emp.is_active && !emp.is_deleted) ||
                         (statusFilter === 'inactive' && (!emp.is_active || emp.is_deleted));

    return matchesSearch && matchesPermission && matchesStatus;
  });

  if (!user || user.permission_level < 3) {
    return (
      <AdminLayout title="접근 권한 없음" description="관리자만 접근할 수 있는 페이지입니다">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">접근 권한이 없습니다</h3>
            <p className="text-gray-600">관리자만 사용자 관리 페이지에 접근할 수 있습니다.</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (loading) {
    return (
      <AdminLayout title="사용자 관리" description="시스템 사용자 및 권한 관리">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">데이터를 불러오는 중...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="사용자 관리" description="시스템 사용자 및 권한 관리">
      <div className="space-y-8">

        {/* 헤더 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-blue-100 rounded">
                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 truncate">전체 사용자</p>
                <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900">{employees.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-green-100 rounded">
                <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 truncate">활성 사용자</p>
                <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900">
                  {employees.filter(emp => emp.is_active && !emp.is_deleted).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-red-100 rounded">
                <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 truncate">관리자</p>
                <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900">
                  {employees.filter(emp => emp.permission_level === 3).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="p-1 sm:p-1.5 bg-orange-100 rounded">
                <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 truncate">승인 대기</p>
                <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900">{socialApprovals.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 탭 메뉴 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-[10px] sm:text-xs md:text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'users'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="hidden sm:inline">등록된 사용자 ({employees.length})</span>
                <span className="sm:hidden">사용자 ({employees.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('approvals')}
                className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-[10px] sm:text-xs md:text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'approvals'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="hidden sm:inline">승인 요청 ({socialApprovals.length})</span>
                <span className="sm:hidden">승인 ({socialApprovals.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-[10px] sm:text-xs md:text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'settings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="hidden sm:inline">승인 설정</span>
                <span className="sm:hidden">설정</span>
              </button>
            </nav>
          </div>

          {/* 사용자 목록 탭 */}
          {activeTab === 'users' && (
            <div className="p-2 sm:p-3 md:p-4">
              {/* 검색 및 필터 */}
              <div className="mb-2 sm:mb-3 md:mb-4 flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="검색..."
                      className="w-full pl-8 sm:pl-10 pr-2 sm:pr-4 py-1.5 sm:py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[10px] sm:text-xs md:text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 sm:gap-2.5 md:gap-3">
                  <select
                    value={permissionFilter}
                    onChange={(e) => setPermissionFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    className="border border-gray-300 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                  >
                    <option value="all">모든 권한</option>
                    {/* 시스템 권한은 시스템 관리자만 필터링 가능 */}
                    {user?.permission_level === 4 && <option value={4}>시스템</option>}
                    <option value={3}>관리자</option>
                    <option value={2}>매니저</option>
                    <option value={1}>일반</option>
                    <option value={0}>게스트</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="border border-gray-300 rounded-md px-2 sm:px-2.5 md:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                  >
                    <option value="all">모든 상태</option>
                    <option value="active">활성</option>
                    <option value="inactive">비활성</option>
                  </select>
                </div>
              </div>

              {/* 사용자 테이블 */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">사용자</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">부서/직급</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">권한</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">상태</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">최근 로그인</th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">관리</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] sm:text-xs md:text-sm font-bold text-white">
                                {employee.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="ml-2 sm:ml-2.5 md:ml-3 min-w-0 flex-1">
                              <div className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 truncate">{employee.name}</div>
                              <div className="text-[10px] sm:text-xs md:text-sm text-gray-500 truncate">{employee.email}</div>
                              {employee.employee_id && (
                                <div className="text-[10px] sm:text-xs text-gray-400 truncate hidden sm:block">ID: {employee.employee_id}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 whitespace-nowrap hidden sm:table-cell">
                          <div className="text-[10px] sm:text-xs md:text-sm text-gray-900">{employee.department || '-'}</div>
                          <div className="text-[10px] sm:text-xs md:text-sm text-gray-500">{employee.position || '-'}</div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 sm:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs md:text-sm font-medium border ${getPermissionLabel(employee.permission_level).color}`}>
                            <span className="hidden sm:inline">{getPermissionLabel(employee.permission_level).text}</span>
                            <span className="sm:hidden">{getPermissionLabel(employee.permission_level).text.slice(0, 2)}</span>
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 sm:px-2 md:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs md:text-sm font-medium ${
                            employee.is_active && !employee.is_deleted
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {employee.is_active && !employee.is_deleted ? '활성' : '비활성'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-gray-500 hidden md:table-cell">
                          {employee.last_login_at
                            ? new Date(employee.last_login_at).toLocaleDateString('ko-KR')
                            : '없음'
                          }
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 whitespace-nowrap text-[10px] sm:text-xs md:text-sm font-medium">
                          <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
                            <button
                              onClick={() => loadUserDetails(employee)}
                              className="text-blue-600 hover:text-blue-900 p-0.5 sm:p-1"
                              title="상세 정보"
                            >
                              <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingUser(employee);
                                setShowEditModal(true);
                              }}
                              className="text-indigo-600 hover:text-indigo-900 p-0.5 sm:p-1"
                              title="정보 수정"
                            >
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setResetPasswordUser(employee);
                                setShowPasswordModal(true);
                              }}
                              className="text-orange-600 hover:text-orange-900 p-0.5 sm:p-1 hidden sm:block"
                              title="비밀번호 재설정"
                            >
                              <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <button
                              onClick={() => handleUserToggle(employee.id, !employee.is_active)}
                              className={`${employee.is_active ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"} p-0.5 sm:p-1`}
                              title={employee.is_active ? "비활성화" : "활성화"}
                            >
                              {employee.is_active ? <UserX className="w-3 h-3 sm:w-4 sm:h-4" /> : <UserCheck className="w-3 h-3 sm:w-4 sm:h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredEmployees.length === 0 && (
                  <div className="text-center py-6 sm:py-8 md:py-12">
                    <Users className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 text-gray-400 mx-auto mb-2 sm:mb-3 md:mb-4" />
                    <h3 className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 mb-1">사용자가 없습니다</h3>
                    <p className="text-[9px] sm:text-[10px] md:text-sm text-gray-500">조건에 맞는 사용자가 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 승인 요청 탭 */}
          {activeTab === 'approvals' && (
            <div className="p-2 sm:p-3 md:p-4 lg:p-6">
              {socialApprovals.length === 0 ? (
                <div className="text-center py-6 sm:py-8 md:py-12">
                  <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 text-green-400 mx-auto mb-2 sm:mb-3 md:mb-4" />
                  <h3 className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 mb-1">자동 승인 시스템 운영 중</h3>
                  <p className="text-[9px] sm:text-[10px] md:text-sm text-gray-500 px-2 sm:px-4">현재 시설관리 시스템은 자동 승인으로 운영됩니다. 회원가입 시 즉시 계정이 생성되며, 별도 승인 과정이 없습니다.</p>
                  <div className="mt-2 sm:mt-3 md:mt-4 p-2 sm:p-3 md:p-4 bg-blue-50 rounded-md sm:rounded-lg mx-2 sm:mx-4">
                    <p className="text-[8px] sm:text-[9px] md:text-xs text-blue-700">
                      💡 <strong>참고:</strong> 승인 설정 탭에서 자동 승인 규칙을 설정할 수 있습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-1 sm:px-2 md:px-4 lg:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wider">요청자</th>
                        <th className="px-1 sm:px-2 md:px-4 lg:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">소셜 로그인</th>
                        <th className="px-1 sm:px-2 md:px-4 lg:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wider">요청 권한</th>
                        <th className="px-1 sm:px-2 md:px-4 lg:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">요청일</th>
                        <th className="px-1 sm:px-2 md:px-4 lg:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {socialApprovals.map((approval) => (
                        <tr key={approval.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{approval.requester_name}</div>
                              <div className="text-sm text-gray-500">{approval.requester_email}</div>
                              <div className="text-xs text-gray-400">{approval.email_domain}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {getProviderLabel(approval.provider)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              레벨 {approval.requested_permission_level}
                            </div>
                            {approval.requested_department && (
                              <div className="text-xs text-gray-500">{approval.requested_department}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(approval.created_at).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleApprovalAction(approval.id, 'approved')}
                                className="bg-green-100 text-green-700 px-3 py-1 rounded-md hover:bg-green-200 transition-colors"
                              >
                                승인
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt('거부 사유를 입력해주세요:');
                                  if (reason) {
                                    handleApprovalAction(approval.id, 'rejected', reason);
                                  }
                                }}
                                className="bg-red-100 text-red-700 px-3 py-1 rounded-md hover:bg-red-200 transition-colors"
                              >
                                거부
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 승인 설정 탭 */}
          {activeTab === 'settings' && (
            <div className="p-2 sm:p-3 md:p-4 lg:p-6">
              {loadingSettings ? (
                <div className="flex items-center justify-center py-6 sm:py-8 md:py-12">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 sm:ml-3 text-[10px] sm:text-xs md:text-sm text-gray-600">설정을 불러오는 중...</span>
                </div>
              ) : approvalSettings ? (
                <ApprovalSettingsForm
                  settings={approvalSettings}
                  onSave={saveApprovalSettings}
                  onTest={testAutoApproval}
                  isSaving={savingSettings}
                />
              ) : (
                <div className="text-center py-6 sm:py-8 md:py-12">
                  <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 text-orange-400 mx-auto mb-2 sm:mb-3 md:mb-4" />
                  <h3 className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 mb-1">설정을 불러올 수 없습니다</h3>
                  <p className="text-[9px] sm:text-[10px] md:text-sm text-gray-500">승인 설정 로드 중 오류가 발생했습니다.</p>
                  <button
                    onClick={loadApprovalSettings}
                    className="mt-2 sm:mt-3 md:mt-4 bg-blue-600 text-white px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-md hover:bg-blue-700 text-[9px] sm:text-[10px] md:text-sm"
                  >
                    다시 시도
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 사용자 편집 모달 */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 p-2 sm:p-4">
          <div className="relative top-4 sm:top-8 md:top-20 mx-auto p-3 sm:p-4 md:p-5 border w-full sm:w-80 md:w-96 max-w-md shadow-lg rounded-lg bg-white">
            <div className="mt-1 sm:mt-2 md:mt-3">
              <h3 className="text-sm sm:text-base md:text-lg font-medium text-gray-900 mb-2 sm:mb-3 md:mb-4">사용자 정보 수정</h3>

              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleUserEdit({
                  name: formData.get('name') as string,
                  email: formData.get('email') as string,
                  department: formData.get('department') as string,
                  position: formData.get('position') as string,
                  permission_level: parseInt(formData.get('permission_level') as string)
                });
              }}>
                <div className="space-y-2 sm:space-y-3 md:space-y-4">
                  <div>
                    <label className="block text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">이름</label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={editingUser.name}
                      required
                      className="w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">이메일</label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={editingUser.email}
                      required
                      className="w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">부서</label>
                    <input
                      type="text"
                      name="department"
                      defaultValue={editingUser.department || ''}
                      className="w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">직급</label>
                    <input
                      type="text"
                      name="position"
                      defaultValue={editingUser.position || ''}
                      className="w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">권한 레벨</label>
                    <select
                      name="permission_level"
                      defaultValue={editingUser.permission_level}
                      className="w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm"
                    >
                      <option value={0}>게스트 (읽기 전용)</option>
                      <option value={1}>일반 (기본 업무)</option>
                      <option value={2}>매니저 (매출관리)</option>
                      <option value={3}>관리자 (사용자 관리)</option>
                      {/* 시스템 권한(4)은 시스템 관리자만 볼 수 있음 */}
                      {user?.permission_level === 4 && (
                        <option value={4}>시스템 (최고 권한)</option>
                      )}
                    </select>

                    {/* 권한 설명 추가 */}
                    <p className="text-[8px] sm:text-[9px] md:text-xs text-gray-500 mt-1">
                      {user?.permission_level === 4
                        ? '시스템 권한은 최고 권한자만 설정 가능합니다.'
                        : '관리자 권한까지 설정할 수 있습니다.'}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 sm:space-x-3 mt-3 sm:mt-4 md:mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingUser(null);
                    }}
                    className="bg-gray-100 text-gray-700 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-md hover:bg-gray-200 text-[10px] sm:text-xs md:text-sm"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-md hover:bg-blue-700 text-[10px] sm:text-xs md:text-sm"
                  >
                    저장
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 재설정 모달 */}
      {showPasswordModal && resetPasswordUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 p-2 sm:p-4">
          <div className="relative top-4 sm:top-8 md:top-20 mx-auto p-3 sm:p-4 md:p-5 border w-full sm:w-80 md:w-96 max-w-md shadow-lg rounded-lg bg-white">
            <div className="mt-1 sm:mt-2 md:mt-3">
              <h3 className="text-sm sm:text-base md:text-lg font-medium text-gray-900 mb-2 sm:mb-3 md:mb-4">비밀번호 재설정</h3>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-2 sm:mb-3 md:mb-4">
                {resetPasswordUser.name}님의 비밀번호를 재설정합니다.
              </p>

              <div className="space-y-2 sm:space-y-3 md:space-y-4">
                <div>
                  <label className="block text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호를 입력하세요"
                      className="w-full border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 pr-8 sm:pr-10 text-[10px] sm:text-xs md:text-sm"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff className="w-3 h-3 sm:w-4 sm:h-4" /> : <Eye className="w-3 h-3 sm:w-4 sm:h-4" />}
                    </button>
                  </div>
                  <p className="text-[8px] sm:text-[9px] md:text-xs text-gray-500 mt-1">최소 8자 이상의 비밀번호를 입력하세요.</p>
                </div>
              </div>

              <div className="flex justify-end space-x-2 sm:space-x-3 mt-3 sm:mt-4 md:mt-6">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setResetPasswordUser(null);
                    setNewPassword('');
                    setShowPassword(false);
                  }}
                  className="bg-gray-100 text-gray-700 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-md hover:bg-gray-200 text-[10px] sm:text-xs md:text-sm"
                >
                  취소
                </button>
                <button
                  onClick={handlePasswordReset}
                  disabled={newPassword.length < 8}
                  className="bg-red-600 text-white px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] sm:text-xs md:text-sm"
                >
                  <span className="hidden sm:inline">비밀번호 재설정</span>
                  <span className="sm:hidden">재설정</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 사용자 상세 정보 모달 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 p-2 sm:p-4">
          <div className="relative top-2 sm:top-4 mx-auto p-3 sm:p-4 md:p-5 border w-full max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-6xl shadow-lg rounded-lg bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-4 md:mb-6 gap-3 sm:gap-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setUserSocialAccounts([]);
                    setUserLoginHistory([]);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                  <span className="text-xs sm:text-sm md:text-lg font-bold text-white">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base md:text-xl font-medium text-gray-900 truncate">{selectedUser.name}</h3>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 truncate">{selectedUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 self-start sm:self-center">
                <span className={`inline-flex items-center px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] md:text-sm font-medium border ${getPermissionLabel(selectedUser.permission_level).color}`}>
                  <span className="hidden sm:inline">{getPermissionLabel(selectedUser.permission_level).text}</span>
                  <span className="sm:hidden">{getPermissionLabel(selectedUser.permission_level).text.slice(0, 2)}</span>
                </span>
                <span className={`inline-flex items-center px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] md:text-sm font-medium ${
                  selectedUser.is_active && !selectedUser.is_deleted
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {selectedUser.is_active && !selectedUser.is_deleted ? '활성' : '비활성'}
                </span>
              </div>
            </div>

            {/* 상세 정보 탭 */}
            <div className="border-b border-gray-200 mb-3 sm:mb-4 md:mb-6">
              <nav className="flex overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setUserDetailTab('info')}
                  className={`px-2 sm:px-3 md:px-6 py-2 sm:py-2.5 md:py-3 text-[9px] sm:text-[10px] md:text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 ${
                    userDetailTab === 'info'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="hidden sm:inline">기본 정보</span>
                  <span className="sm:hidden">기본</span>
                </button>
                <button
                  onClick={() => setUserDetailTab('social')}
                  className={`px-2 sm:px-3 md:px-6 py-2 sm:py-2.5 md:py-3 text-[9px] sm:text-[10px] md:text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 ${
                    userDetailTab === 'social'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="hidden sm:inline">소셜 계정 ({userSocialAccounts.length})</span>
                  <span className="sm:hidden">소셜({userSocialAccounts.length})</span>
                </button>
                <button
                  onClick={() => setUserDetailTab('history')}
                  className={`px-2 sm:px-3 md:px-6 py-2 sm:py-2.5 md:py-3 text-[9px] sm:text-[10px] md:text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 ${
                    userDetailTab === 'history'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="hidden sm:inline">로그인 이력 ({userLoginHistory.length})</span>
                  <span className="sm:hidden">이력({userLoginHistory.length})</span>
                </button>
              </nav>
            </div>

            {loadingUserDetails ? (
              <div className="flex items-center justify-center py-6 sm:py-8 md:py-12">
                <div className="animate-spin rounded-full h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 sm:ml-3 text-[10px] sm:text-xs md:text-sm text-gray-600">데이터를 불러오는 중...</span>
              </div>
            ) : (
              <div className="min-h-48 sm:min-h-64 md:min-h-96">
                {/* 기본 정보 탭 */}
                {userDetailTab === 'info' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                    <div className="space-y-2 sm:space-y-3 md:space-y-4">
                      <div className="bg-gray-50 rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4">
                        <h4 className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 mb-2 sm:mb-3">개인 정보</h4>
                        <div className="space-y-1.5 sm:space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">이름:</span>
                            <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right">{selectedUser.name}</span>
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">이메일:</span>
                            <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right break-all">{selectedUser.email}</span>
                          </div>
                          {selectedUser.employee_id && (
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">직원번호:</span>
                              <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right">{selectedUser.employee_id}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">부서:</span>
                            <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right">{selectedUser.department || '-'}</span>
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">직급:</span>
                            <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right">{selectedUser.position || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3 md:space-y-4">
                      <div className="bg-gray-50 rounded-md sm:rounded-lg p-2 sm:p-3 md:p-4">
                        <h4 className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 mb-2 sm:mb-3">계정 정보</h4>
                        <div className="space-y-1.5 sm:space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">권한 레벨:</span>
                            <span className={`text-[8px] sm:text-[9px] md:text-sm font-medium px-1 sm:px-1.5 md:px-2 py-0.5 sm:py-1 rounded ${getPermissionLabel(selectedUser.permission_level).color}`}>
                              <span className="hidden sm:inline">{getPermissionLabel(selectedUser.permission_level).text}</span>
                              <span className="sm:hidden">{getPermissionLabel(selectedUser.permission_level).text.slice(0, 2)}</span>
                            </span>
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">계정 상태:</span>
                            <span className={`text-[8px] sm:text-[9px] md:text-sm font-medium px-1 sm:px-1.5 md:px-2 py-0.5 sm:py-1 rounded ${
                              selectedUser.is_active && !selectedUser.is_deleted
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {selectedUser.is_active && !selectedUser.is_deleted ? '활성' : '비활성'}
                            </span>
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">가입일:</span>
                            <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right">
                              {new Date(selectedUser.created_at).toLocaleDateString('ko-KR')}
                            </span>
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[9px] sm:text-[10px] md:text-sm text-gray-600 flex-shrink-0">최근 로그인:</span>
                            <span className="text-[9px] sm:text-[10px] md:text-sm font-medium text-gray-900 text-right">
                              {selectedUser.last_login_at
                                ? new Date(selectedUser.last_login_at).toLocaleDateString('ko-KR')
                                : '없음'
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 소셜 계정 탭 */}
                {userDetailTab === 'social' && (
                  <div>
                    {userSocialAccounts.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 md:py-12">
                        <Link className="w-6 h-6 sm:w-8 sm:h-8 md:w-12 md:h-12 text-gray-400 mx-auto mb-2 sm:mb-3 md:mb-4" />
                        <h3 className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 mb-1">연결된 소셜 계정이 없습니다</h3>
                        <p className="text-sm text-gray-500">사용자가 소셜 계정으로 로그인하지 않았습니다.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {userSocialAccounts.map((account) => (
                          <div key={account.id} className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                  <span className="text-sm font-medium text-blue-600">
                                    {getProviderLabel(account.provider)}
                                  </span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">{account.provider_name}</span>
                                    {account.is_primary && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        주 계정
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-500">{account.provider_email}</p>
                                  <p className="text-xs text-gray-400">
                                    연결일: {new Date(account.connected_at).toLocaleDateString('ko-KR')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {!account.is_primary && (
                                  <button
                                    onClick={() => handleSetPrimarySocialAccount(account.id)}
                                    className="text-blue-600 hover:text-blue-900 text-sm"
                                  >
                                    주 계정으로 설정
                                  </button>
                                )}
                                {!account.is_primary && (
                                  <button
                                    onClick={() => handleDisconnectSocialAccount(account.id)}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    <Unlink className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 로그인 이력 탭 */}
                {userDetailTab === 'history' && (
                  <div>
                    {userLoginHistory.length === 0 ? (
                      <div className="text-center py-12">
                        <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-sm font-medium text-gray-900 mb-1">로그인 이력이 없습니다</h3>
                        <p className="text-sm text-gray-500">아직 로그인 기록이 없습니다.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {userLoginHistory.map((history) => (
                          <div key={history.id} className={`bg-white border rounded-lg p-4 ${
                            history.is_suspicious ? 'border-red-200 bg-red-50' : 'border-gray-200'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  history.is_suspicious ? 'bg-red-100' : 'bg-blue-100'
                                }`}>
                                  {history.device_info?.includes('Mobile') ? (
                                    <Smartphone className={`w-5 h-5 ${history.is_suspicious ? 'text-red-600' : 'text-blue-600'}`} />
                                  ) : (
                                    <Monitor className={`w-5 h-5 ${history.is_suspicious ? 'text-red-600' : 'text-blue-600'}`} />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">
                                      {getProviderLabel(history.login_method)} 로그인
                                    </span>
                                    {history.is_suspicious && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                        의심스러움
                                      </span>
                                    )}
                                    {!history.logout_at && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                        활성 세션
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-500">
                                    {new Date(history.login_at).toLocaleString('ko-KR')}
                                  </p>
                                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {history.ip_address}
                                    </span>
                                    {history.device_info && (
                                      <span>{history.device_info}</span>
                                    )}
                                    {history.session_duration && (
                                      <span>
                                        세션: {Math.floor(history.session_duration / 60)}분
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {!history.logout_at && (
                                  <button
                                    onClick={() => handleTerminateSession(history.id)}
                                    className="text-red-600 hover:text-red-900 text-sm"
                                  >
                                    세션 종료
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// 관리자 페이지 접근 권한 필요 (레벨 3: 관리자만)
export default withAuth(UsersManagementPage, 'canAccessAdminPages' as any, 3)