"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  onKeyNav?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

export default function Autocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  onKeyNav,
  inputRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? suggestions.filter(
        (s) => s.includes(value.trim()) && s !== value.trim()
      )
    : [];

  const showDropdown = open && filtered.length > 0;

  const select = useCallback(
    (name: string) => {
      onChange(name);
      setOpen(false);
      setHighlighted(-1);
    },
    [onChange]
  );

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter" && highlighted >= 0) {
        e.preventDefault();
        select(filtered[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    // 未消費のキーイベントは親に委譲
    onKeyNav?.(e);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
      {showDropdown && (
        <ul className="absolute z-50 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto text-sm">
          {filtered.map((name, i) => (
            <li
              key={name}
              onMouseDown={() => select(name)}
              className={`px-3 py-1.5 cursor-pointer ${
                i === highlighted ? "bg-blue-100" : "hover:bg-gray-50"
              }`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
