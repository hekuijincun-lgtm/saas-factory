// route: /booking
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BookingShell from '../_components/ui/BookingShell';
import BookingFlow from './BookingFlow';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
    </div>
  );
}

function BookingPage() {
  const searchParams = useSearchParams();
  const tenantId = searchParams?.get('tenantId') || 'default';

  return (
    <BookingShell key={tenantId}>
      <BookingFlow key={tenantId} />
    </BookingShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BookingPage />
    </Suspense>
  );
}
