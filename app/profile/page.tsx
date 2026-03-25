'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManager } from '@/lib/api-client';
import AdminLayout from '@/components/ui/AdminLayout';
import { formatPhoneNumber } from '@/utils/phoneFormatter';
import {
  User,
  Mail,
  Shield,
  Building2,
  Key,
  Save,
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Clock,
  LogOut,
  RefreshCw,
  Phone,
  Smartphone,
  MessageCircle,
  Link2,
  Link2Off,
  ExternalLink
} from 'lucide-react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  employee_id: string;
  department?: string;
  position?: string;
  phone?: string;
  mobile?: string;
  permission_level: number;
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
  avatar_url?: string;
  social_login_enabled?: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // 프로필 편집 폼
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    department: '',
    position: '',
    phone: '',
    mobile: ''
  });

  // 비밀번호 변경 폼
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false
  });

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // 텔레그램 연결 상태
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramDeepLink, setTelegramDeepLink] = useState('');
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadTelegramStatus();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/employees/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const userProfile = data.data.employee;
          setProfile(userProfile);
          setEditForm({
            name: userProfile.name || '',
            email: userProfile.email || '',
            department: userProfile.department || '',
            position: userProfile.position || '',
            phone: userProfile.phone || '',
            mobile: userProfile.mobile || ''
          });
        }
      } else {
        setErrorMessage('프로필 정보를 불러올 수 없습니다.');
      }
    } catch (error) {
      console.error('프로필 로드 오류:', error);
      setErrorMessage('프로필 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      setSaving(true);
      setErrorMessage('');

      const token = TokenManager.getToken();
      const response = await fetch(`/api/admin/employees/${user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...editForm,
          permission_level: profile.permission_level  // 기존 권한 레벨 유지
        })
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success) {
          // 원래 프로필 값을 먼저 저장 (비교용)
          const originalProfile = { ...profile };

          // 프로필 상태 업데이트
          setProfile({ ...profile, ...editForm, permission_level: profile.permission_level });

          // 저장된 정보를 구체적으로 안내 (원래 값과 비교)
          // undefined/null을 빈 문자열로 정규화하여 비교
          const savedItems = [];
          if (editForm.name !== (originalProfile.name || '')) savedItems.push('이름');
          if (editForm.email !== (originalProfile.email || '')) savedItems.push('이메일');
          if (editForm.department !== (originalProfile.department || '')) savedItems.push('부서');
          if (editForm.position !== (originalProfile.position || '')) savedItems.push('직급');
          if (editForm.phone !== (originalProfile.phone || '')) savedItems.push('사무실 전화번호');
          if (editForm.mobile !== (originalProfile.mobile || '')) savedItems.push('휴대전화');

          const savedInfo = savedItems.length > 0
            ? ` (${savedItems.join(', ')})`
            : '';

          const message = `✅ 프로필이 성공적으로 저장되었습니다!${savedInfo}`;

          setSuccessMessage(message);

          // 메시지를 사용자가 볼 수 있도록 페이지 상단으로 스크롤
          window.scrollTo({ top: 0, behavior: 'smooth' });

          setTimeout(() => {
            setSuccessMessage('');
          }, 5000);
        } else {
          setErrorMessage('프로필 업데이트에 실패했습니다.');
        }
      } else {
        const data = await response.json();
        setErrorMessage(data.message || '프로필 업데이트에 실패했습니다.');
      }
    } catch (error) {
      console.error('프로필 업데이트 오류:', error);
      setErrorMessage('프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrorMessage('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setErrorMessage('새 비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    // 로그인 상태에서는 현재 비밀번호 확인 불필요 (보안상 이유로 주석 처리)

    try {
      setSaving(true);
      setErrorMessage('');

      const token = TokenManager.getToken();

      // 모든 사용자에게 통일된 change-password API 사용
      const apiEndpoint = '/api/auth/change-password';
      const requestBody = { newPassword: passwordForm.newPassword };

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPasswordForm({ newPassword: '', confirmPassword: '' });
          setShowPasswordForm(false);
          setSuccessMessage('비밀번호가 성공적으로 변경되었습니다.');

          // 메시지를 사용자가 볼 수 있도록 페이지 상단으로 스크롤
          window.scrollTo({ top: 0, behavior: 'smooth' });

          setTimeout(() => setSuccessMessage(''), 5000);
        }
      } else {
        const data = await response.json();
        setErrorMessage(data.error?.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('비밀번호 변경 오류:', error);
      setErrorMessage('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      setSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      await logout();

      setSuccessMessage('성공적으로 로그아웃되었습니다.');

      // 잠시 후 로그인 페이지로 이동
      setTimeout(() => {
        router.push('/login');
      }, 1000);

    } catch (error) {
      console.error('로그아웃 오류:', error);
      setErrorMessage('로그아웃 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshPermissions = async () => {
    try {
      setSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      // 강제로 토큰을 제거하고 새로 로그인하도록 유도
      await logout();

      setSuccessMessage('권한 정보가 초기화되었습니다. 다시 로그인해주세요.');

      setTimeout(() => {
        router.push('/login');
      }, 1500);

    } catch (error) {
      console.error('권한 새로고침 오류:', error);
      setErrorMessage('권한 새로고침 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const loadTelegramStatus = async () => {
    const token = TokenManager.getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/telegram/connect', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTelegramConnected(data.connected);
    } catch {}
  };

  const handleTelegramConnect = async () => {
    const token = TokenManager.getToken();
    if (!token) return;
    setTelegramLoading(true);
    try {
      const res = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTelegramToken(data.token);
        setTelegramDeepLink(data.deepLink || '');
        setTelegramBotUsername(data.botUsername || '');
      } else {
        alert(data.error || '코드 발급에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    const token = TokenManager.getToken();
    if (!token) return;
    setTelegramLoading(true);
    try {
      const res = await fetch('/api/telegram/connect', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setTelegramConnected(false);
        setTelegramToken('');
        setTelegramDeepLink('');
      } else {
        alert(data.error || '연결 해제에 실패했습니다.');
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setTelegramLoading(false);
    }
  };

  const getPermissionLabel = (level: number) => {
    switch (level) {
      case 4: return { text: '슈퍼관리자', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 3: return { text: '관리자', color: 'bg-red-100 text-red-800 border-red-200' };
      case 2: return { text: '매니저', color: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 1: return { text: '일반사용자', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      default: return { text: '사용자', color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  if (loading) {
    return (
      <AdminLayout title="계정 설정" description="사용자 프로필 및 계정 정보 관리">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">프로필 정보를 불러오는 중...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!profile) {
    return (
      <AdminLayout title="계정 설정" description="사용자 프로필 및 계정 정보 관리">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">프로필을 불러올 수 없습니다</h3>
            <p className="text-gray-600 mb-4">계정 정보에 접근할 수 없습니다.</p>
            <button
              onClick={() => router.push('/admin')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              돌아가기
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="계정 설정" description="사용자 프로필 및 계정 정보 관리">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* 성공/오류 메시지 */}
        {successMessage && (
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-5 flex items-start gap-3 shadow-md animate-fade-in">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-green-900 font-medium text-base">{successMessage}</p>
              <p className="text-green-700 text-sm mt-1">모든 변경사항이 데이터베이스에 안전하게 저장되었습니다.</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-5 flex items-start gap-3 shadow-md animate-fade-in">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-900 font-medium text-base">{errorMessage}</p>
              <p className="text-red-700 text-sm mt-1">문제가 계속되면 관리자에게 문의해주세요.</p>
            </div>
          </div>
        )}

        {/* 프로필 개요 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-6 mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {profile.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{profile.name}</h2>
              <p className="text-gray-600">{profile.email}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getPermissionLabel(profile.permission_level).color}`}>
                  {getPermissionLabel(profile.permission_level).text}
                </span>
                {profile.social_login_enabled && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800 border border-green-200">
                    소셜 로그인
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">부서</p>
                <p className="font-medium text-gray-900">{profile.department || '미설정'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">직급</p>
                <p className="font-medium text-gray-900">{profile.position || '미설정'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">최근 로그인</p>
                <p className="font-medium text-gray-900">
                  {profile.last_login_at
                    ? new Date(profile.last_login_at).toLocaleDateString('ko-KR')
                    : '없음'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* 연락처 정보 표시 */}
          {(profile.phone || profile.mobile) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 mt-6 border-t border-gray-200">
              {profile.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">사무실 전화</p>
                    <p className="font-medium text-gray-900">{profile.phone}</p>
                  </div>
                </div>
              )}
              {profile.mobile && (
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">휴대전화</p>
                    <p className="font-medium text-gray-900">{profile.mobile}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 프로필 편집 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-3">
            <User className="w-5 h-5" />
            프로필 정보 수정
          </h3>

          <form onSubmit={handleProfileUpdate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">이름</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">이메일</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">부서</label>
                <input
                  type="text"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="부서명을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">직급</label>
                <input
                  type="text"
                  value={editForm.position}
                  onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="직급을 입력하세요"
                />
              </div>
            </div>

            {/* 연락처 정보 섹션 */}
            <div className="pt-6 mt-6 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                연락처 정보
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    사무실 전화번호
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: formatPhoneNumber(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="숫자만 입력하세요 (자동 포맷)"
                    maxLength={13}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    예: 0212345678 → 02-1234-5678
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    휴대전화
                  </label>
                  <input
                    type="tel"
                    value={editForm.mobile}
                    onChange={(e) => setEditForm({ ...editForm, mobile: formatPhoneNumber(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="숫자만 입력하세요 (자동 포맷)"
                    maxLength={13}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    예: 01012345678 → 010-1234-5678
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                프로필 저장
              </button>
            </div>
          </form>
        </div>

        {/* 비밀번호 변경/설정 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-3">
              <Key className="w-5 h-5" />
              비밀번호 변경
            </h3>
            <button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              {showPasswordForm ? '취소' : '비밀번호 변경'}
            </button>
          </div>

            {showPasswordForm && (
              <form onSubmit={handlePasswordChange} className="space-y-6">
                {/* 로그인 상태에서는 현재 비밀번호 입력 불필요 */}

                {/* 간소화된 비밀번호 변경 설명 */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-800">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">비밀번호 변경</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    로그인 상태에서는 새 비밀번호만 입력하면 변경할 수 있습니다.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">새 비밀번호</label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">최소 6자 이상의 비밀번호를 입력하세요.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">새 비밀번호 확인</label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    비밀번호 변경
                  </button>
                </div>
              </form>
            )}
        </div>

        {/* 알림 설정 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-3">
            <MessageCircle className="w-5 h-5" />
            알림 설정
          </h3>

          <div className="border border-blue-200 rounded-lg p-4 md:p-5 bg-blue-50/30">
            <h4 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-500" />
              텔레그램 알림 연결
            </h4>
            <p className="text-xs text-gray-500 mb-4">
              iOS에서 PWA 알림이 불안정할 경우 텔레그램으로 결재 알림을 받을 수 있습니다.
              연결 후 상신·승인·반려 이벤트 발생 시 텔레그램 메시지가 즉시 전송됩니다.
            </p>

            {telegramConnected ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">텔레그램 연결됨</span>
                </div>
                <button
                  onClick={handleTelegramDisconnect}
                  disabled={telegramLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Link2Off className="w-3.5 h-3.5" />
                  연결 해제
                </button>
              </div>
            ) : telegramToken ? (
              <div className="space-y-3">
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-500 mb-2">① 아래 버튼을 눌러 텔레그램 봇을 열거나, 봇에서 아래 명령어를 입력하세요:</p>
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded font-mono text-sm">
                    <code className="flex-1 text-blue-700">/start {telegramToken}</code>
                    <button
                      onClick={() => navigator.clipboard?.writeText(`/start ${telegramToken}`)}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      복사
                    </button>
                  </div>
                </div>
                {telegramDeepLink && (
                  <a
                    href={telegramDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    텔레그램 봇 열기
                  </a>
                )}
                <p className="text-[10px] text-gray-400">
                  봇에서 명령어 입력 후 이 페이지를 새로고침하면 연결 상태가 업데이트됩니다.
                </p>
                <button
                  onClick={loadTelegramStatus}
                  className="text-xs text-blue-600 hover:underline"
                >
                  연결 상태 확인
                </button>
              </div>
            ) : (
              <button
                onClick={handleTelegramConnect}
                disabled={telegramLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {telegramLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                텔레그램 연결하기
              </button>
            )}
          </div>
        </div>

        {/* 계정 정보 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-3">
            <Shield className="w-5 h-5" />
            계정 정보
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">직원 ID</p>
              <p className="font-medium text-gray-900">{profile.employee_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">계정 생성일</p>
              <p className="font-medium text-gray-900">
                {new Date(profile.created_at).toLocaleDateString('ko-KR')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">계정 상태</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                profile.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {profile.is_active ? '활성' : '비활성'}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">권한 레벨</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPermissionLabel(profile.permission_level).color}`}>
                {getPermissionLabel(profile.permission_level).text}
              </span>
            </div>
          </div>
        </div>

        {/* 계정 관리 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-3">
            <LogOut className="w-5 h-5" />
            계정 관리
          </h3>

          <div className="space-y-4">
            {/* 로그아웃 */}
            <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">로그아웃</h4>
                <p className="text-sm text-gray-600 mt-1">
                  현재 계정에서 로그아웃하고 로그인 페이지로 이동합니다.
                </p>
              </div>
              <button
                onClick={handleLogout}
                disabled={saving}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                로그아웃
              </button>
            </div>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}