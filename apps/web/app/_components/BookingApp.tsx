'use client';

import { useState } from 'react';
import CustomerBookingApp from './booking/CustomerBookingApp';
import AdminApp from './admin/AdminApp';
import BookingShell from './ui/BookingShell';

export default function BookingApp() {
  const [view, setView] = useState<'booking' | 'admin'>('booking');

  // 管理画面の場合は AdminApp を直接表示（AdminApp は AdminShell でラップされている）
  if (view === 'admin') {
    return <AdminApp />;
  }

  // 予約画面（BookingShell でラップ）
  return (
    <BookingShell>
      <CustomerBookingApp />
    </BookingShell>
  );
}

