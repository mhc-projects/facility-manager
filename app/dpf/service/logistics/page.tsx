'use client';

// 물류관리(부품전달/요소수) 접수 조회 — 본문은 DpfServiceListView(mode='logistics')에 위임
import AdminLayout from '@/components/ui/AdminLayout';
import DpfServiceListView from '@/components/dpf/DpfServiceListView';

export default function DpfServiceLogisticsPage() {
  return (
    <AdminLayout title="물류관리" description="부품전달/요소수 접수 조회">
      <DpfServiceListView mode="logistics" />
    </AdminLayout>
  );
}
