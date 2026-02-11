'use client'

import React, { useState, useCallback } from 'react';
import BusinessDetailModal from './BusinessDetailModal';

// Simplified props that Revenue page can provide
interface BusinessDetailModalAdapterProps {
  isOpen: boolean;
  business: any;
  onClose: () => void;
  onEdit: (business: any) => void;
  memos: any[];
  businessTasks: any[];
  facilityData: any;
  isLoadingMemos?: boolean;
  isLoadingTasks?: boolean;
  onAddMemo?: (input: any) => Promise<void>;
  onEditMemo?: (id: string, input: any) => Promise<void>;
  onDeleteMemo?: (id: string) => Promise<void>;
  onUpdateTaskStatus?: (taskId: string, newStatus: string) => Promise<void>;
  onAddTaskNote?: (taskId: string, note: string) => Promise<void>;
  invoiceAmounts?: Record<string, number>;
  onUpdateInvoiceDate?: (key: string, date: string) => Promise<void>;
  onUpdateInvoiceAmount?: (key: string, amount: number) => Promise<void>;
  mapCategoryToInvoiceType?: (category: string) => string;
  userPermission?: number;
}

/**
 * Adapter component that wraps BusinessDetailModal with state management
 * for contexts where the full Business page state is not available (e.g., Revenue page)
 */
export default function BusinessDetailModalAdapter({
  isOpen,
  business,
  onClose,
  onEdit,
  memos = [],
  businessTasks = [],
  facilityData,
  isLoadingMemos = false,
  isLoadingTasks = false,
  onAddMemo,
  onEditMemo,
  onDeleteMemo,
  onUpdateTaskStatus,
  onAddTaskNote,
  invoiceAmounts = {},
  onUpdateInvoiceDate,
  onUpdateInvoiceAmount,
  mapCategoryToInvoiceType = (category) => category,
  userPermission = 0
}: BusinessDetailModalAdapterProps) {

  // Internal state for memo management
  const [isAddingMemo, setIsAddingMemo] = useState(false);
  const [editingMemo, setEditingMemo] = useState<any | null>(null);
  const [memoForm, setMemoForm] = useState({ title: '', content: '' });

  // Integrated items getter
  const getIntegratedItems = useCallback(() => {
    const items: any[] = [];

    // Add memos
    if (memos && Array.isArray(memos)) {
      memos.forEach(memo => {
        items.push({
          id: memo.id,
          type: 'memo',
          created_at: memo.created_at,
          updated_at: memo.updated_at,
          data: memo
        });
      });
    }

    // Add tasks
    if (businessTasks && Array.isArray(businessTasks)) {
      businessTasks.forEach(task => {
        items.push({
          id: task.task_id,
          type: 'task',
          created_at: task.created_at,
          updated_at: task.updated_at,
          status: task.status,
          task_type: task.task_type,
          assignee: task.assignee,
          data: task
        });
      });
    }

    // Sort by created_at descending
    return items.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [memos, businessTasks]);

  // Memo handlers
  const startEditMemo = (memo: any) => {
    setEditingMemo(memo);
    setMemoForm({
      title: memo.title || '',
      content: memo.content || ''
    });
  };

  const handleAddMemo = async () => {
    if (!onAddMemo) {
      console.warn('⚠️ [ADAPTER] onAddMemo not provided');
      return;
    }

    try {
      await onAddMemo({
        business_id: business.id,
        title: memoForm.title,
        content: memoForm.content
      });

      // Reset form
      setMemoForm({ title: '', content: '' });
      setIsAddingMemo(false);
    } catch (error) {
      console.error('❌ [ADAPTER] handleAddMemo failed:', error);
      throw error;
    }
  };

  const handleEditMemo = async () => {
    if (!onEditMemo || !editingMemo) {
      console.warn('⚠️ [ADAPTER] onEditMemo not provided or no editing memo');
      return;
    }

    try {
      await onEditMemo(editingMemo.id, {
        title: memoForm.title,
        content: memoForm.content
      });

      // Reset form
      setMemoForm({ title: '', content: '' });
      setEditingMemo(null);
    } catch (error) {
      console.error('❌ [ADAPTER] handleEditMemo failed:', error);
      throw error;
    }
  };

  const handleDeleteMemo = async (memo: any) => {
    if (!onDeleteMemo) {
      console.warn('⚠️ [ADAPTER] onDeleteMemo not provided');
      return;
    }

    if (!confirm('이 메모를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await onDeleteMemo(memo.id);
    } catch (error) {
      console.error('❌ [ADAPTER] handleDeleteMemo failed:', error);
      throw error;
    }
  };

  // Task status helpers
  const getStatusColor = (status: string) => {
    switch (status) {
      case '완료':
        return { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-800', text: 'text-green-700' };
      case '진행중':
        return { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800', text: 'text-blue-700' };
      case '대기':
        return { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-800', text: 'text-yellow-700' };
      case '보류':
        return { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-800', text: 'text-gray-700' };
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-800', text: 'text-gray-700' };
    }
  };

  const getStatusDisplayName = (status: string) => {
    return status || '미정';
  };

  // Revenue handlers (simplified)
  const setSelectedRevenueBusiness = (business: any) => {
    console.log('📊 [ADAPTER] Revenue business selected:', business.business_name);
    // Could potentially open another modal or navigate
  };

  const setShowRevenueModal = (show: boolean) => {
    console.log('📊 [ADAPTER] Show revenue modal:', show);
    // Not implemented in adapter context
  };

  // Facility update handler
  const onFacilityUpdate = (businessName: string) => {
    console.log('🏭 [ADAPTER] Facility update:', businessName);
    // Could trigger a refresh if needed
  };

  return (
    <BusinessDetailModal
      isOpen={isOpen}
      business={business}
      onClose={onClose}
      onEdit={onEdit}
      // Memo state
      isAddingMemo={isAddingMemo}
      setIsAddingMemo={setIsAddingMemo}
      businessMemos={memos}
      businessTasks={businessTasks}
      getIntegratedItems={getIntegratedItems}
      canDeleteAutoMemos={true}  // Allow all deletes in adapter context
      startEditMemo={startEditMemo}
      handleDeleteMemo={handleDeleteMemo}
      editingMemo={editingMemo}
      setEditingMemo={setEditingMemo}
      memoForm={memoForm}
      setMemoForm={setMemoForm}
      handleAddMemo={handleAddMemo}
      handleEditMemo={handleEditMemo}
      // Task state
      getStatusColor={getStatusColor}
      getStatusDisplayName={getStatusDisplayName}
      // Facility props
      facilityDeviceCounts={null}
      facilityLoading={isLoadingMemos || isLoadingTasks}
      facilityData={facilityData}
      airPermitData={null}
      // Revenue props
      setSelectedRevenueBusiness={setSelectedRevenueBusiness}
      setShowRevenueModal={setShowRevenueModal}
      mapCategoryToInvoiceType={mapCategoryToInvoiceType}
      // Optional handlers
      onFacilityUpdate={onFacilityUpdate}
    />
  );
}
