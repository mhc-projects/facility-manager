# Admin Users 페이지 실시간 업데이트 설계

## 📋 요구사항

### 핵심 기능
1. **사용자 승인 시 실시간 상태 업데이트**: 상태 컬럼 값이 즉시 UI에 반영
2. **최근 로그인 정보 실시간 업데이트**: 사용자 로그인 시 last_login_at 필드 자동 업데이트
3. **모든 컬럼 변경 사항 실시간 반영**: 권한, 부서, 활성화 상태 등 모든 변경사항 실시간 동기화

## 🏗️ 시스템 아키텍처

### 데이터 흐름
```
[Supabase Database]
       ↓
[Realtime Event]
       ↓
[useSupabaseRealtime Hook]
       ↓
[Event Handler]
       ↓
[State Update]
       ↓
[UI Re-render]
```

### 관련 테이블
- `employees`: 사용자 정보 (is_active, last_login_at, permission_level, department 등)
- `social_login_approvals`: 소셜 로그인 승인 대기 목록
- `user_social_accounts`: 사용자 소셜 계정 연결 정보
- `user_login_history`: 사용자 로그인 이력

## 🔧 구현 설계

### 1. 실시간 구독 설정

#### employees 테이블 실시간 구독
```typescript
useSupabaseRealtime({
  tableName: 'employees',
  eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
  onNotification: (payload) => {
    handleEmployeeUpdate(payload);
  }
});
```

**감지할 이벤트**:
- **INSERT**: 새 사용자 등록 (소셜 로그인 후 승인 대기)
- **UPDATE**: 사용자 정보 변경
  - `is_active`: 승인/비활성화 상태 변경
  - `last_login_at`: 최근 로그인 시간 업데이트
  - `permission_level`: 권한 레벨 변경
  - `department_id`: 부서 변경
  - `name`, `email`, `position` 등 기본 정보 변경
- **DELETE**: 사용자 삭제 (소프트 삭제 시)

#### social_login_approvals 테이블 실시간 구독
```typescript
useSupabaseRealtime({
  tableName: 'social_login_approvals',
  eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
  onNotification: (payload) => {
    handleApprovalUpdate(payload);
  }
});
```

**감지할 이벤트**:
- **INSERT**: 새 승인 요청 등록
- **UPDATE**: 승인 상태 변경 (pending → approved/rejected)
- **DELETE**: 승인 요청 삭제

#### user_login_history 테이블 실시간 구독
```typescript
useSupabaseRealtime({
  tableName: 'user_login_history',
  eventTypes: ['INSERT'],
  onNotification: (payload) => {
    handleLoginHistoryUpdate(payload);
  }
});
```

**감지할 이벤트**:
- **INSERT**: 새 로그인 기록 추가 시 해당 사용자의 상세 정보 갱신

### 2. 이벤트 핸들러 구현

#### handleEmployeeUpdate
```typescript
const handleEmployeeUpdate = useCallback((payload: RealtimePostgresChangesPayload<Employee>) => {
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
  }

  if (eventType === 'UPDATE') {
    // 사용자 정보 업데이트
    setEmployees(prev =>
      prev.map(emp =>
        emp.id === newRecord.id ? { ...emp, ...newRecord } : emp
      )
    );

    // 현재 선택된 사용자 상세 정보도 업데이트
    if (selectedUser?.id === newRecord.id) {
      setSelectedUser(prev => prev ? { ...prev, ...newRecord } : null);
    }
  }

  if (eventType === 'DELETE') {
    // 사용자 삭제
    setEmployees(prev => prev.filter(emp => emp.id !== oldRecord.id));

    // 삭제된 사용자가 현재 선택되어 있으면 모달 닫기
    if (selectedUser?.id === oldRecord.id) {
      setSelectedUser(null);
    }
  }
}, [selectedUser]);
```

#### handleApprovalUpdate
```typescript
const handleApprovalUpdate = useCallback((payload: RealtimePostgresChangesPayload<SocialApproval>) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  console.log('📡 [REALTIME] social_login_approvals 이벤트:', {
    eventType,
    approvalId: newRecord?.id || oldRecord?.id,
    status: newRecord?.approval_status
  });

  if (eventType === 'INSERT') {
    // 새 승인 요청 추가
    setSocialApprovals(prev => [newRecord, ...prev]);
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
    }
  }

  if (eventType === 'DELETE') {
    // 승인 요청 삭제
    setSocialApprovals(prev => prev.filter(approval => approval.id !== oldRecord.id));
  }
}, []);
```

#### handleLoginHistoryUpdate
```typescript
const handleLoginHistoryUpdate = useCallback((payload: RealtimePostgresChangesPayload<UserLoginHistory>) => {
  const { eventType, new: newRecord } = payload;

  if (eventType === 'INSERT') {
    console.log('📡 [REALTIME] user_login_history 이벤트:', {
      userId: newRecord.user_id,
      loginAt: newRecord.login_at
    });

    // 로그인 이력 추가
    if (selectedUser?.id === newRecord.user_id) {
      setUserLoginHistory(prev => [newRecord, ...prev]);
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
    }
  }
}, [selectedUser]);
```

### 3. 컴포넌트 통합

#### AdminUsersPage 컴포넌트 수정
```typescript
function AdminUsersPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [socialApprovals, setSocialApprovals] = useState<SocialApproval[]>([]);
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);
  const [userLoginHistory, setUserLoginHistory] = useState<UserLoginHistory[]>([]);

  // 초기 데이터 로드
  useEffect(() => {
    loadEmployees();
    loadSocialApprovals();
  }, []);

  // employees 테이블 실시간 구독
  useSupabaseRealtime({
    tableName: 'employees',
    eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
    onNotification: handleEmployeeUpdate
  });

  // social_login_approvals 테이블 실시간 구독
  useSupabaseRealtime({
    tableName: 'social_login_approvals',
    eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
    onNotification: handleApprovalUpdate
  });

  // user_login_history 테이블 실시간 구독
  useSupabaseRealtime({
    tableName: 'user_login_history',
    eventTypes: ['INSERT'],
    onNotification: handleLoginHistoryUpdate
  });

  // ... 나머지 코드
}
```

## 🎯 주요 업데이트 시나리오

### 시나리오 1: 사용자 승인
```
1. 관리자가 승인 버튼 클릭
2. API 호출: POST /api/admin/users/approve
3. DB 업데이트: employees.is_active = true
4. Realtime 이벤트 발생: UPDATE employees
5. handleEmployeeUpdate 호출
6. State 업데이트: setEmployees()
7. UI 자동 리렌더링: 상태 컬럼 변경 반영
```

### 시나리오 2: 사용자 로그인
```
1. 사용자 로그인 성공
2. DB INSERT: user_login_history 새 레코드 추가
3. DB UPDATE: employees.last_login_at 업데이트
4. Realtime 이벤트 발생:
   - INSERT user_login_history
   - UPDATE employees
5. handleLoginHistoryUpdate + handleEmployeeUpdate 호출
6. State 업데이트:
   - setUserLoginHistory()
   - setEmployees()
7. UI 자동 리렌더링: 최근 로그인 시간 업데이트
```

### 시나리오 3: 권한 레벨 변경
```
1. 관리자가 권한 변경
2. API 호출: PUT /api/admin/employees/{id}
3. DB 업데이트: employees.permission_level 변경
4. Realtime 이벤트 발생: UPDATE employees
5. handleEmployeeUpdate 호출
6. State 업데이트: setEmployees()
7. UI 자동 리렌더링: 권한 레벨 컬럼 변경 반영
```

## 🔍 최적화 전략

### 1. 중복 API 호출 제거
**현재 방식** (개선 전):
```typescript
// 승인 후 전체 목록 다시 로드
await handleApprovalAction(id, 'approved');
await loadEmployees(); // ❌ 불필요한 API 호출
```

**개선 방식** (실시간 업데이트):
```typescript
// 승인 후 Realtime이 자동으로 상태 업데이트
await handleApprovalAction(id, 'approved');
// ✅ loadEmployees() 호출 불필요 - Realtime이 자동 처리
```

### 2. 낙관적 업데이트 (Optimistic Update)
```typescript
const handleApprovalAction = async (approvalId: string, action: 'approved' | 'rejected') => {
  // 1. 낙관적 업데이트: UI 즉시 변경
  setEmployees(prev =>
    prev.map(emp =>
      emp.id === approvalId
        ? { ...emp, is_active: action === 'approved' }
        : emp
    )
  );

  try {
    // 2. API 호출
    const response = await fetch('/api/admin/social-approvals', {
      method: 'POST',
      body: JSON.stringify({ approvalId, action })
    });

    if (!response.ok) {
      throw new Error('승인 처리 실패');
    }

    // 3. Realtime이 실제 DB 상태로 최종 업데이트
  } catch (error) {
    // 4. 실패 시 롤백: Realtime이 자동으로 원래 상태 복원
    console.error('승인 처리 오류:', error);
    alert('승인 처리 중 오류가 발생했습니다.');
  }
};
```

### 3. 중복 이벤트 처리 방지
```typescript
const handleEmployeeUpdate = useCallback((payload: RealtimePostgresChangesPayload<Employee>) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  // 중복 업데이트 방지: 실제로 변경된 필드만 확인
  if (eventType === 'UPDATE') {
    const hasChanges = Object.keys(newRecord).some(
      key => newRecord[key] !== oldRecord?.[key]
    );

    if (!hasChanges) {
      console.log('⚠️ [REALTIME] 변경사항 없음 - 업데이트 스킵');
      return;
    }
  }

  // 실제 변경사항이 있을 때만 State 업데이트
  setEmployees(prev =>
    prev.map(emp =>
      emp.id === newRecord.id ? { ...emp, ...newRecord } : emp
    )
  );
}, []);
```

## 📊 성능 고려사항

### 메모리 관리
- `useCallback`으로 핸들러 함수 메모이제이션
- `useRef`로 불필요한 리렌더링 방지
- 컴포넌트 언마운트 시 자동 구독 해제

### 네트워크 효율성
- 단일 Realtime 연결로 여러 테이블 구독
- 변경된 레코드만 전송 (전체 목록 X)
- 자동 재연결 및 오류 복구

### UI 반응성
- 낙관적 업데이트로 즉각적인 피드백
- Realtime 이벤트 기반 정확한 상태 동기화
- 로딩 상태 최소화 (초기 로드만)

## 🧪 테스트 시나리오

### 1. 승인 처리 테스트
```
1. 관리자 A가 사용자 승인
2. 관리자 B의 화면에서 즉시 상태 변경 확인
3. 네트워크 탭에서 API 호출 1회만 확인 (재로드 없음)
```

### 2. 로그인 이력 테스트
```
1. 사용자가 로그인
2. 관리자 화면에서 last_login_at 즉시 업데이트 확인
3. 사용자 상세 모달에서 로그인 이력 자동 추가 확인
```

### 3. 동시 수정 테스트
```
1. 관리자 A가 사용자 권한 변경
2. 동시에 관리자 B가 동일 사용자 부서 변경
3. 두 변경사항 모두 실시간 반영 확인
4. 충돌 없이 최신 상태 유지 확인
```

## 🔐 보안 고려사항

### Row Level Security (RLS)
- Supabase RLS 정책으로 권한별 접근 제어
- 관리자만 employees 테이블 UPDATE 이벤트 구독 가능
- 일반 사용자는 자신의 레코드만 읽기 가능

### 데이터 검증
- 클라이언트 측 Realtime 이벤트는 읽기 전용
- 모든 변경은 API를 통해서만 가능
- API에서 권한 검증 및 데이터 유효성 검사

## 📝 구현 체크리스트

- [ ] useSupabaseRealtime 훅으로 employees 테이블 구독
- [ ] useSupabaseRealtime 훅으로 social_login_approvals 테이블 구독
- [ ] useSupabaseRealtime 훅으로 user_login_history 테이블 구독
- [ ] handleEmployeeUpdate 이벤트 핸들러 구현
- [ ] handleApprovalUpdate 이벤트 핸들러 구현
- [ ] handleLoginHistoryUpdate 이벤트 핸들러 구현
- [ ] 승인 처리 후 불필요한 loadEmployees() 제거
- [ ] 낙관적 업데이트 패턴 적용
- [ ] 중복 이벤트 처리 방지 로직 추가
- [ ] 에러 처리 및 재연결 로직 검증
- [ ] 성능 테스트 (메모리, 네트워크)
- [ ] 다중 관리자 동시 접속 테스트
- [ ] 브라우저 콘솔에서 Realtime 이벤트 로그 확인

## 🚀 배포 계획

### 1단계: 개발 환경 테스트
- localhost에서 기능 검증
- Realtime 이벤트 로그 확인
- 다중 탭에서 동시 테스트

### 2단계: 스테이징 배포
- 실제 데이터로 검증
- 관리자 권한 확인
- 성능 모니터링

### 3단계: 프로덕션 배포
- 점진적 롤아웃
- 사용자 피드백 수집
- 모니터링 및 최적화

## 📖 참고 자료

- [useSupabaseRealtime Hook 문서](../hooks/useSupabaseRealtime.ts)
- [Supabase Realtime 공식 문서](https://supabase.com/docs/guides/realtime)
- [메모 시스템 실시간 동기화 사례](./memo-system-complete-analysis.md)
