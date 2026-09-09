# 업무단계 키 불일치(보조금 vs 보조금(5년경과)) 수정 체크리스트

- [x] AdminDataContext에 `resolveStageKey(status, progressStatus)` 추가 (라벨 기준으로 카테고리 키 매핑)
- [x] 업무관리 칸반: 단일 카테고리/전체 보기 모두 resolve된 키로 배치
- [x] 복수 진행구분 칸반 grouped를 라벨 키로 변경(같은 status 키·다른 라벨 칸 덮어쓰기 수정) + 드롭 시 업무 카테고리 키로 resolve
- [x] 업무관리 목록 뷰 dbStep 조회에 resolve 적용
- [x] 수정 모달 단계 select: value를 resolve된 키로, 없으면 원래 키 option 추가
- [x] 수정 모달 사업장 재선택(881행): 진행구분이 바뀔 때만 라벨 기준으로 단계 이관, 불가 시 첫 단계
- [x] 수정 모달 진행구분 select(3466행): 항상 첫 단계 초기화 → 라벨 기준 이관
- [x] TaskProgressMiniBoard: 단계 버튼/펼침/select 비교에 resolve 적용
- [x] POST /api/settings/task-stages: stage_key 미지정 시 같은 task_type 카테고리의 같은 라벨 키 재사용 (대상 카테고리에 이미 있으면 custom_ 폴백)
- [x] task-management SKILL.md에 키 불일치 주의사항 추가
- [x] tsc --noEmit 통과
- [ ] 브라우저 확인: 보조금(5년경과) 칸반, 전체 보기, 수정 모달, 사업장 상세 미니보드
- [ ] 커밋 + claude-progress.txt 갱신
