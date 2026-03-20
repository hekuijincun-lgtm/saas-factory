'use client';

import { useEffect, useState, useRef } from 'react';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  customerKey?: string;
}

interface CustomerPickerProps {
  tenantId: string;
  ownerName: string;
  customerKey: string;
  onChange: (ownerName: string, customerKey: string) => void;
}

export default function CustomerPicker({ tenantId, ownerName, customerKey, onChange }: CustomerPickerProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/proxy/admin/customers?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        const list = json?.data ?? json?.customers ?? [];
        setCustomers(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = search.trim()
    ? customers.filter(c =>
        (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
        (c.phone && c.phone.includes(search)) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
      )
    : customers;

  const handleSelect = (c: Customer) => {
    const key = c.customerKey || c.id;
    onChange(c.name, key);
    setSearch('');
    setOpen(false);
  };

  if (manual) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">飼い主情報（手動入力）</h3>
          <button
            type="button"
            onClick={() => setManual(false)}
            className="text-xs text-orange-600 hover:text-orange-700 font-medium"
          >
            顧客リストから選択
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">飼い主名</label>
            <input
              type="text"
              value={ownerName}
              onChange={e => onChange(e.target.value, customerKey)}
              placeholder="田中太郎"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">顧客キー</label>
            <input
              type="text"
              value={customerKey}
              onChange={e => onChange(ownerName, e.target.value)}
              placeholder="line:Uxxxx / email:xxx@..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">飼い主情報</h3>
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-xs text-orange-600 hover:text-orange-700 font-medium"
        >
          手動入力に切替
        </button>
      </div>

      {/* Selected customer display */}
      {ownerName && (
        <div className="flex items-center gap-3 rounded-lg bg-orange-50 px-4 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{ownerName}</p>
            {customerKey && <p className="text-xs text-gray-400 truncate">{customerKey}</p>}
          </div>
          <button
            type="button"
            onClick={() => onChange('', '')}
            className="text-xs text-gray-400 hover:text-red-500 font-medium"
          >
            解除
          </button>
        </div>
      )}

      {/* Search dropdown */}
      <div ref={wrapperRef} className="relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="顧客名・電話番号で検索..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        {open && filtered.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filtered.slice(0, 20).map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    {[c.phone, c.email].filter(Boolean).join(' / ') || c.customerKey || c.id}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && filtered.length === 0 && customers.length > 0 && search.trim() && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg px-4 py-3 text-sm text-gray-400">
            該当する顧客が見つかりません
          </div>
        )}
      </div>
    </div>
  );
}
