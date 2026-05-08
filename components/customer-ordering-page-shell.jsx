'use client';

import { AppLoading } from '@/components/app-loading';
import { lazy, Suspense } from 'react';

const CustomerOrderingApp = lazy(() => import('@/components/customer-ordering-app'));

export default function CustomerOrderingPageShell({ tableNumber }) {
  return (
    <Suspense fallback={<AppLoading label="Loading menu..." />}>
      <CustomerOrderingApp tableNumber={tableNumber} />
    </Suspense>
  );
}
