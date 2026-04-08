'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAdminTenantId } from '@/src/lib/useAdminTenantId';
import StoryCalendar, { downloadCalendarPng } from '@/src/components/StoryCalendar';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  '今日の予約を確認',
  'ワクチン期限切れを確認',
  'リピート対象に一括送信',
  '今月の売上を教えて',
];

function extractCalendar(content: string): {
  calendarData: { month: string; shopName: string; blocks: unknown[] } | null;
  cleanContent: string;
} {
  const marker = 'CALENDAR_DATA:';
  const idx = content.indexOf(marker);
  if (idx === -1) return { calendarData: null, cleanContent: content };
  try {
    const rest = content.slice(idx + marker.length);
    const start = rest.indexOf('{');
    if (start === -1) return { calendarData: null, cleanContent: content };
    let depth = 0;
    let end = -1;
    for (let i = start; i < rest.length; i++) {
      if (rest[i] === '{') depth++;
      else if (rest[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) return { calendarData: null, cleanContent: content };
    const jsonStr = rest.slice(start, end + 1);
    const calendarData = JSON.parse(jsonStr);
    const cleanContent = content.slice(0, idx).trim();
    return { calendarData, cleanContent };
  } catch (e) {
    console.error('[extractCalendar] parse error:', e);
    return { calendarData: null, cleanContent: content };
  }
}

export default function AgentChat({ vertical }: { vertical: string }) {
  const { tenantId, status } = useAdminTenantId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading || status !== 'ready') return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/agent/chat?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text.trim(), session_id: sessionId, vertical }),
        }
      );
      const data = await res.json() as any;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'エラーが発生しました' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました' }]);
    } finally {
      setLoading(false);
    }
  };

  if (status !== 'ready') return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col" style={{ height: '480px' }}>
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm">AI</div>
        <div>
          <div className="font-semibold text-sm text-gray-800">AIアシスタント</div>
          <div className="text-xs text-gray-400">話しかけるだけで操作できます</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 text-center">よく使う操作</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-3 py-1 hover:bg-orange-100 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {(() => {
              const { calendarData, cleanContent } = m.role === 'assistant'
                ? extractCalendar(m.content)
                : { calendarData: null, cleanContent: m.content };
              return (
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-orange-500 text-white rounded-br-sm whitespace-pre-wrap'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {m.role === 'assistant' ? (
                    <>
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                        <ReactMarkdown
                          components={{
                            img: ({ src, alt }) => (
                              <div className="mt-2">
                                <img
                                  src={src}
                                  alt={alt ?? '生成画像'}
                                  className="rounded-xl max-w-full border border-gray-200 shadow-sm"
                                  style={{ maxHeight: '300px', objectFit: 'contain' }}
                                />
                                <a
                                  href={src}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-xs text-orange-500 mt-1 hover:underline"
                                >
                                  フルサイズで開く →
                                </a>
                              </div>
                            ),
                          }}
                        >
                          {cleanContent || m.content}
                        </ReactMarkdown>
                      </div>
                      {calendarData && (
                        <div className="mt-3">
                          <div
                            style={{
                              width: '180px',
                              height: '320px',
                              overflow: 'hidden',
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb',
                              position: 'relative',
                            }}
                          >
                            <div style={{ transform: 'scale(0.1667)', transformOrigin: 'top left', width: '1080px', height: '1920px' }}>
                              <StoryCalendar
                                yearMonth={calendarData.month}
                                shopName={calendarData.shopName}
                                blocks={calendarData.blocks as any}
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => downloadCalendarPng(calendarData.month)}
                            className="mt-2 text-xs bg-orange-500 text-white rounded-full px-3 py-1 hover:bg-orange-600 transition"
                          >
                            PNG ダウンロード
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              );
            })()}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-gray-400">考え中...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="例: 今日の予約を確認して"
          className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-orange-400"
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 disabled:opacity-40 transition flex-shrink-0"
        >
          &#x2191;
        </button>
      </div>
    </div>
  );
}
