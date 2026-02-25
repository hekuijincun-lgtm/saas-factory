// route: /booking
import { Suspense } from 'react';
import BookingShell from '../_components/ui/BookingShell';
import BookingFlow from './BookingFlow';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <BookingShell>
        <BookingFlow />
      </BookingShell>
    </Suspense>
  );
}
