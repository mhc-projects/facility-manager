'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FirstAdminSetup from '@/components/admin/FirstAdminSetup';
import { useAuth } from '@/contexts/AuthContext';
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts';

export default function FirstAdminSetupPage() {
  const router = useRouter();
  const { user, permissions } = useAuth();

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/first-setup')) {
      router.replace('/admin/business');
    }
  }, [user, permissions]);

  return <FirstAdminSetup />;
}
