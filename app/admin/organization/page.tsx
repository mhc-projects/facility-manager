'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OrganizationRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/settings?tab=organization');
  }, [router]);

  return null;
}
