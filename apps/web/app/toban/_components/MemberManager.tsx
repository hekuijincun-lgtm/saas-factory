"use client";

import { useState, useRef } from "react";
import { X, Plus, Users } from "lucide-react";

interface Props {
  members: string[];
  onChange: (members: string[]) => void;
}

export default function MemberManager({ members, onChange }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const name = input.trim();
    if (!name || members.includes(name)) return;
    onChange([...members, name]);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = (name: string) => {
    onChange(members.filter((m) => m !== name));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Users size={16} />
        <span>メンバー名簿</span>
        <span className="text-gray-400">({members.length}名)</span>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="名前を入力して追加"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
        >
          <Plus size={14} />
          追加
        </button>
      </div>

      {members.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {members.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-sm rounded-full"
            >
              {name}
              <button
                onClick={() => remove(name)}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        名簿に登録すると、担当セルでオートコンプリートが使えます。
      </p>
    </div>
  );
}
