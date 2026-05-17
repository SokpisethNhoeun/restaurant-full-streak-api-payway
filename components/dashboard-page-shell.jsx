'use client';

import { AppLoading } from '@/components/app-loading';
import { AppHeroUIProvider } from '@/components/heroui-provider';
import { lazy, Suspense } from 'react';

const DashboardApp = lazy(() => import('@/components/dashboard-app'));

export default function DashboardPageShell() {
  return (
    <AppHeroUIProvider>
      <Suspense fallback={<AppLoading label="Loading dashboard..." />}>
        <DashboardApp />
      </Suspense>
    </AppHeroUIProvider>
  );
}
