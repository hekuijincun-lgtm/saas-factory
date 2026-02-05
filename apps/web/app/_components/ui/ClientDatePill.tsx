'use client';

import { useState, useEffect } from 'react';

interface ClientDatePillProps {
  className?: string;
  format?: 'full' | 'short'; // full: "2025年1月15日", short: "1/15"
}

/**
 * クライアント側でのみ日付を表示するコンポーネント
 * SSR時は空文字を表示してHydration errorを防ぐ
 */
export default function ClientDatePill({ className = '', format = 'full' }: ClientDatePillProps) {
  const [mounted, setMounted] = useState(false);
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    const now = new Date();
    
    // Asia/Tokyo タイムゾーンで日付を取得
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: format === 'full' ? 'long' : 'numeric',
      day: 'numeric',
    });

    if (format === 'full') {
      const formatted = formatter.format(now);
      setFormattedDate(formatted);
    } else {
      const month = now.getMonth() + 1;
      const day = now.getDate();
      setFormattedDate(`${month}/${day}`);
    }
  }, [format]);

  if (!mounted) {
    // SSR時は空文字を返す（DOM構造は維持）
    return (
      <div className={`px-3 py-1.5 bg-brand-bg rounded-xl border border-brand-border ${className}`}>
        <span className="text-sm font-medium text-brand-text">&nbsp;</span>
      </div>
    );
  }

  return (
    <div className={`px-3 py-1.5 bg-brand-bg rounded-xl border border-brand-border ${className}`}>
      <span className="text-sm font-medium text-brand-text">{formattedDate}</span>
    </div>
  );
}




