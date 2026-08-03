'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Users, Building2, RotateCcw } from 'lucide-react';
import { ALL_MENU_ITEMS } from '@/components/ui/AdminLayout';
import MultiAssigneeSelector, { type SelectedAssignee } from '@/components/ui/MultiAssigneeSelector';
import { TokenManager } from '@/lib/api-client';
import { AuthLevel, AUTH_LEVEL_DESCRIPTIONS } from '@/lib/auth/AuthLevels';

interface MenuVisibilityTabProps {
  onMessage: (type: 'success' | 'error', text: string) => void;
}

interface MenuVisibilityRule {
  id: string;
  menu_href: string;
  scope_type: 'team' | 'user';
  scope_value: string;
  visible: boolean;
  scope_label: string;
  scope_email: string | null;
}

interface TeamOption {
  id: number;
  name: string;
  department_id: number;
}

function authHeaders(): Record<string, string> {
  const token = TokenManager.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// POST/PUT/DELETE는 middleware의 CSRF 이중제출쿠키 검증을 통과해야 한다 (GET/HEAD/OPTIONS는 면제).
// /api/csrf-token이 httpOnly 쿠키(csrf-token)를 심고 같은 값을 응답 헤더로도 내려주므로,
// 그 값을 그대로 X-CSRF-Token 요청 헤더에 실어 보내면 미들웨어가 쿠키 값과 대조해 통과시킨다.
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/csrf-token');
    return res.headers.get('X-CSRF-Token');
  } catch {
    return null;
  }
}

// API 에러 응답은 라우트마다 { error: string } 또는 { error: { code, message } } 두 형태가 섞여 있어
// (예: requireSystemAdmin의 forbidden()은 후자) 그대로 React 자식으로 렌더하면 객체라 크래시난다.
function extractErrorMessage(data: any, fallback: string): string {
  if (!data) return fallback;
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error.message === 'string') return data.error.message;
  if (typeof data.message === 'string') return data.message;
  return fallback;
}

export default function MenuVisibilityTab({ onMessage }: MenuVisibilityTabProps) {
  const [rules, setRules] = useState<MenuVisibilityRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  // 메뉴별 필요 권한 레벨 재정의 상태 - href가 이 객체에 없으면 코드 기본값을 그대로 쓴다
  const [levelOverrides, setLevelOverrides] = useState<Record<string, number>>({});
  const [isLoadingLevels, setIsLoadingLevels] = useState(true);
  const [savingLevelHref, setSavingLevelHref] = useState<string | null>(null);

  // 새 규칙 입력 폼 상태
  const [menuHref, setMenuHref] = useState(ALL_MENU_ITEMS[0]?.href || '');
  const [scopeType, setScopeType] = useState<'team' | 'user'>('team');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedAssignee[]>([]);
  const [visible, setVisible] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadRules();
    loadTeams();
    loadLevelOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLevelOverrides = async () => {
    setIsLoadingLevels(true);
    try {
      const res = await fetch('/api/admin/menu-required-level', { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        const map: Record<string, number> = {};
        for (const row of data.data) map[row.menu_href] = row.required_level;
        setLevelOverrides(map);
      } else {
        onMessage('error', extractErrorMessage(data, '필요 권한 레벨을 불러오지 못했습니다.'));
      }
    } catch {
      onMessage('error', '필요 권한 레벨을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingLevels(false);
    }
  };

  const handleChangeLevel = async (href: string, newLevel: number) => {
    setSavingLevelHref(href);
    try {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch('/api/admin/menu-required-level', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ menu_href: href, required_level: newLevel }),
      });
      const data = await res.json();
      if (data.success) {
        setLevelOverrides(prev => ({ ...prev, [href]: newLevel }));
        onMessage('success', '필요 권한 레벨이 저장되었습니다.');
      } else {
        onMessage('error', extractErrorMessage(data, '저장에 실패했습니다.'));
      }
    } catch {
      onMessage('error', '저장 중 오류가 발생했습니다.');
    } finally {
      setSavingLevelHref(null);
    }
  };

  const handleResetLevel = async (href: string) => {
    setSavingLevelHref(href);
    try {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/admin/menu-required-level?menu_href=${encodeURIComponent(href)}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        setLevelOverrides(prev => {
          const next = { ...prev };
          delete next[href];
          return next;
        });
        onMessage('success', '기본값으로 되돌렸습니다.');
      } else {
        onMessage('error', extractErrorMessage(data, '초기화에 실패했습니다.'));
      }
    } catch {
      onMessage('error', '초기화 중 오류가 발생했습니다.');
    } finally {
      setSavingLevelHref(null);
    }
  };

  const loadRules = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/menu-visibility', { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setRules(data.data);
      } else {
        onMessage('error', extractErrorMessage(data, '규칙 목록을 불러오지 못했습니다.'));
      }
    } catch {
      onMessage('error', '규칙 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const res = await fetch('/api/organization/departments');
      const data = await res.json();
      if (data.success) {
        const flat: TeamOption[] = (data.data || []).flatMap((d: any) => d.teams || []);
        setTeams(flat);
        setSelectedTeam(prev => prev || flat[0]?.name || '');
      }
    } catch {
      // 팀 드롭다운을 못 불러와도 사용자 대상 규칙은 계속 추가할 수 있어야 하므로 조용히 무시
    }
  };

  const getMenuName = (href: string) => {
    const item = ALL_MENU_ITEMS.find(m => m.href === href);
    if (!item) return href;
    return item.group ? `${item.group} / ${item.name}` : item.name;
  };

  const handleAddRule = async () => {
    const scopeValue = scopeType === 'team' ? selectedTeam : selectedUser[0]?.id;
    if (!menuHref || !scopeValue) {
      onMessage('error', scopeType === 'team' ? '팀을 선택해주세요.' : '사용자를 선택해주세요.');
      return;
    }
    setIsSaving(true);
    try {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch('/api/admin/menu-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ menu_href: menuHref, scope_type: scopeType, scope_value: scopeValue, visible }),
      });
      const data = await res.json();
      if (data.success) {
        onMessage('success', '규칙이 저장되었습니다.');
        setSelectedUser([]);
        await loadRules();
      } else {
        onMessage('error', extractErrorMessage(data, '저장에 실패했습니다.'));
      }
    } catch {
      onMessage('error', '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (rule: MenuVisibilityRule) => {
    if (!confirm(`'${getMenuName(rule.menu_href)}' → '${rule.scope_label}' 규칙을 삭제하시겠습니까?`)) return;
    try {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/admin/menu-visibility?id=${rule.id}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        setRules(prev => prev.filter(r => r.id !== rule.id));
        onMessage('success', '규칙이 삭제되었습니다.');
      } else {
        onMessage('error', extractErrorMessage(data, '삭제에 실패했습니다.'));
      }
    } catch {
      onMessage('error', '삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <p className="text-sm text-gray-600">
        특정 팀 또는 특정 사용자에게 사이드바 메뉴를 강제로 보이거나 숨길 수 있습니다.
        여기서 설정하지 않은 메뉴는 기존 기본 규칙(권한 레벨 등)을 그대로 따르고, 사용자 단위 규칙이 팀 단위 규칙보다 우선 적용됩니다.
        <strong className="font-medium text-gray-700"> "사용자" 규칙은 필요 권한 레벨 자체도 뚫을 수 있어(예: 권한1 계정에 관리자 메뉴 노출) 개인 단위로만 신중하게 사용하세요</strong> —
        "팀" 규칙은 필요 권한 레벨을 통과한 사람에게만 추가로 적용되어 그런 상승은 못 일으킵니다.
        (사이드바 표시 여부만 바뀌며, 페이지 URL 직접 접근 자체를 막지는 않습니다. 단, 메일함처럼 자체 서버 체크가 있는 일부 기능은 "사용자" 규칙이 실제 접근도 같이 허용합니다.)
      </p>

      {/* 규칙 추가 폼 */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">메뉴</label>
          <select
            value={menuHref}
            onChange={e => setMenuHref(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ALL_MENU_ITEMS.map(item => (
              <option key={item.href} value={item.href}>
                {item.group ? `${item.group} / ${item.name}` : item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">대상</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setScopeType('team')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                scopeType === 'team' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              팀
            </button>
            <button
              type="button"
              onClick={() => setScopeType('user')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                scopeType === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              사용자
            </button>
          </div>

          {scopeType === 'team' ? (
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {teams.length === 0 && <option value="">팀 목록을 불러오는 중...</option>}
              {teams.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          ) : (
            <MultiAssigneeSelector
              selectedAssignees={selectedUser}
              onAssigneesChange={setSelectedUser}
              placeholder="메뉴를 적용할 사용자를 검색하세요"
              maxAssignees={1}
              showCurrentUserFirst={false}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">노출 여부</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisible(true)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                visible ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              보이기
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                !visible ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              숨기기
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddRule}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isSaving ? '저장 중...' : '규칙 추가'}
        </button>
      </div>

      {/* 규칙 목록 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">설정된 규칙 ({rules.length}개)</h3>
        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">불러오는 중...</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">설정된 규칙이 없습니다.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-medium text-gray-800">{getMenuName(rule.menu_href)}</span>
                  <span className="text-gray-400">→</span>
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    {rule.scope_type === 'team' ? <Building2 className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                    {rule.scope_label}
                    {rule.scope_type === 'user' && rule.scope_email ? ` (${rule.scope_email})` : ''}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    rule.visible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {rule.visible ? '보이기' : '숨기기'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 메뉴별 필요 권한 레벨 전역 재정의 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">메뉴별 필요 권한 레벨</h3>
        <p className="text-xs text-gray-500 mb-2">
          전사 공통 설정입니다 — 레벨을 낮추면 그 레벨 이상인 모든 직원에게 영향을 줍니다.
          특정 개인 한 명에게만 열어주고 싶다면 위쪽 "사용자" 규칙을 대신 쓰세요.
        </p>
        {isLoadingLevels ? (
          <p className="text-sm text-gray-400 py-4 text-center">불러오는 중...</p>
        ) : (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {ALL_MENU_ITEMS.map(item => {
              const isOverridden = item.href in levelOverrides;
              const currentLevel = isOverridden ? levelOverrides[item.href] : item.requiredLevel;
              return (
                <div key={item.href} className="flex items-center justify-between px-4 py-2 gap-3">
                  <div className="min-w-0 text-sm text-gray-800 truncate">
                    {item.group ? `${item.group} / ${item.name}` : item.name}
                    {isOverridden && (
                      <span className="ml-2 text-xs text-amber-600 whitespace-nowrap">기본값 {item.requiredLevel}에서 재정의됨</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={currentLevel}
                      disabled={savingLevelHref === item.href}
                      onChange={e => handleChangeLevel(item.href, Number(e.target.value))}
                      className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {[0, 1, 2, 3, 4].map(lvl => (
                        <option key={lvl} value={lvl}>{lvl} · {AUTH_LEVEL_DESCRIPTIONS[lvl as AuthLevel]}</option>
                      ))}
                    </select>
                    {isOverridden && (
                      <button
                        type="button"
                        onClick={() => handleResetLevel(item.href)}
                        disabled={savingLevelHref === item.href}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        title="기본값으로 되돌리기"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
