import { Suspense } from 'react';
import BookingApp from './_components/BookingApp';

export default function Page() {
  return (
    <Suspense>
      <BookingApp />
    </Suspense>
  );
}
