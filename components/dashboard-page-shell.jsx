'use client';

import { AppLoading } from '@/components/app-loading';
import { lazy, Suspense } from 'react';

const DashboardApp = lazy(() => import('@/components/dashboard-app'));

export default function DashboardPageShell() {
  return (
    <Suspense fallback={<AppLoading label="Loading dashboard..." />}>
      <DashboardApp />
    </Suspense>
  );
}
