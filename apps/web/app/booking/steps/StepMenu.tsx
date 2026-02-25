'use client';

import { useEffect, useState } from 'react';
import { getMenu, type MenuItem } from '@/src/lib/bookingApi';

interface Props {
  tenantId: string;
  onSelect: (menu: MenuItem) => void;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
      {msg}
    </div>
  );
}

export default function StepMenu({ tenantId, onSelect }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMenu(tenantId)
      .then(data =>
        setItems(
          data
            .filter(m => m.active)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        )
      )
      .catch(e => setError(e.message || 'メニューの取得に失敗しました'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-brand-text mb-4">メニューを選択</h2>

      {items.length === 0 ? (
        <p className="text-sm text-brand-muted text-center py-6">
          メニューが登録されていません
        </p>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="w-full text-left p-4 bg-white border border-brand-border rounded-2xl hover:border-brand-primary hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-brand-text group-hover:text-brand-primary transition-colors">
                    {item.name}
                  </p>
                  <p className="text-sm text-brand-muted mt-0.5">{item.durationMin}分</p>
                </div>
                <span className="text-brand-primary font-semibold ml-4 flex-shrink-0">
                  ¥{item.price.toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
