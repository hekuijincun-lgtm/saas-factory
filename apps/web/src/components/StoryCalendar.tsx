'use client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimeBlock {
  id: string;
  date: string;       // "YYYY-MM-DD"
  blockType: 'full' | 'closed' | 'partial' | 'open';
  availableSlots?: string[];
  timeRange?: string | null;
  memo?: string;
}

interface StoryCalendarProps {
  yearMonth: string;   // "2026-04"
  shopName: string;
  blocks: TimeBlock[];
}

// ── Calendar logic ───────────────────────────────────────────────────────────

function buildCalendarWeeks(yearMonth: string, blocks: TimeBlock[]) {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  // Monday-based offset: 0=Mon … 6=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const blockMap = new Map(blocks.map(b => [b.date, b]));

  type Cell = { day: number | null; block?: TimeBlock; dow: number };
  const cells: Cell[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, dow: i });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = (startOffset + d - 1) % 7;
    cells.push({ day: d, block: blockMap.get(dateStr), dow });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dow: cells.length % 7 });

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── SVG Constants ────────────────────────────────────────────────────────────

const W = 1080;
const H = 1920;
const PAD = 48;
const HEADER_H = 300;
const DOW_H = 60;
const TABLE_TOP = HEADER_H + DOW_H;
const FOOTER_H = 120;
const CELL_W = (W - PAD * 2) / 7;

const GOLD = '#C9A96E';
const BG = '#FAFAF7';
const DARK = '#1C1C1C';
const FONT = '"Noto Sans JP", "Hiragino Sans", sans-serif';
const FONT_DISPLAY = '"Playfair Display", "Georgia", serif';

// ── Component ────────────────────────────────────────────────────────────────

export default function StoryCalendar({ yearMonth, shopName, blocks }: StoryCalendarProps) {
  const [year, month] = yearMonth.split('-').map(Number);
  const weeks = buildCalendarWeeks(yearMonth, blocks);
  const CELL_H = Math.min(220, (H - TABLE_TOP - FOOTER_H - PAD) / weeks.length);

  return (
    <div id="story-calendar" style={{ width: W, height: H, background: BG, fontFamily: FONT, position: 'relative', overflow: 'hidden' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
        <rect width={W} height={H} fill={BG} />

        {/* ── Header ── */}
        <rect x={0} y={0} width={W} height={HEADER_H} fill={DARK} />
        {/* Gold accent line */}
        <rect x={PAD} y={HEADER_H - 1} width={W - PAD * 2} height={1} fill={GOLD} opacity={0.6} />

        {/* Shop name */}
        <text
          x={PAD + 8} y={72}
          fill={GOLD} fontSize={26} letterSpacing="0.25em"
          fontFamily={FONT} fontWeight="500"
        >
          {(shopName || 'MY SHOP').toUpperCase()}
        </text>

        {/* Month number (large) */}
        <text
          x={PAD + 8} y={210}
          fill="#fff" fontSize={130} fontWeight="700"
          fontFamily={FONT_DISPLAY} letterSpacing="-0.02em"
        >
          {month}
        </text>

        {/* Year + Month name */}
        <text
          x={PAD + 160} y={160}
          fill="#666" fontSize={28} letterSpacing="0.08em"
          fontFamily={FONT}
        >
          {year}
        </text>
        <text
          x={PAD + 160} y={200}
          fill="#fff" fontSize={42} fontWeight="700"
          fontFamily={FONT}
        >
          {month}月
        </text>

        {/* English month (subtle) */}
        <text
          x={W - PAD - 8} y={72}
          textAnchor="end"
          fill="#555" fontSize={20} letterSpacing="0.15em"
          fontFamily={FONT_DISPLAY}
        >
          {MONTH_EN[month - 1]?.toUpperCase() || ''}
        </text>

        {/* ── Day-of-week header ── */}
        {DOW_LABELS.map((label, i) => (
          <text
            key={`dow-${i}`}
            x={PAD + i * CELL_W + CELL_W / 2}
            y={HEADER_H + DOW_H / 2 + 6}
            textAnchor="middle"
            fill={i === 5 ? '#4A9EDB' : i === 6 ? '#C0392B' : '#999'}
            fontSize={24}
            fontWeight="700"
            letterSpacing="0.08em"
            fontFamily={FONT}
          >
            {label}
          </text>
        ))}

        {/* Subtle separator under dow */}
        <line x1={PAD} y1={TABLE_TOP} x2={W - PAD} y2={TABLE_TOP} stroke="#E8E8E3" strokeWidth={1} />

        {/* ── Calendar cells ── */}
        {weeks.map((week, ri) =>
          week.map((cell, ci) => {
            const x = PAD + ci * CELL_W;
            const y = TABLE_TOP + ri * CELL_H;
            if (cell.day === null) return <g key={`c-${ri}-${ci}`} />;

            const bt = cell.block?.blockType;
            const isSat = cell.dow === 5;
            const isSun = cell.dow === 6;

            // Cell background
            let cellBg = 'transparent';
            if (bt === 'closed') cellBg = '#F0F0ED';
            if (bt === 'full') cellBg = DARK;
            if (bt === 'partial') cellBg = '#FFF8EE';

            // Day number color
            let dayColor = DARK;
            if (isSat) dayColor = '#4A9EDB';
            if (isSun) dayColor = '#C0392B';
            if (bt === 'closed') dayColor = '#bbb';
            if (bt === 'full') dayColor = '#fff';

            const cx = x + CELL_W / 2;
            const cy = y + CELL_H / 2;

            return (
              <g key={`c-${ri}-${ci}`}>
                {/* Cell bg */}
                <rect x={x + 2} y={y + 2} width={CELL_W - 4} height={CELL_H - 4} rx={12} fill={cellBg} />

                {/* Day number */}
                <text
                  x={x + 16} y={y + 34}
                  fill={dayColor} fontSize={28} fontWeight="700"
                  fontFamily={FONT}
                >
                  {cell.day}
                </text>

                {/* ── full: gold badge ── */}
                {bt === 'full' && (
                  <>
                    <circle cx={cx} cy={cy + 14} r={26} fill={GOLD} />
                    <text
                      x={cx} y={cy + 24}
                      textAnchor="middle" fill={DARK}
                      fontSize={24} fontWeight="900" fontFamily={FONT}
                    >
                      満
                    </text>
                  </>
                )}

                {/* ── closed ── */}
                {bt === 'closed' && (
                  <text
                    x={cx} y={cy + 16}
                    textAnchor="middle" fill="#bbb"
                    fontSize={20} fontWeight="700" letterSpacing="0.05em"
                    fontFamily={FONT}
                  >
                    定休
                  </text>
                )}

                {/* ── partial: time display ── */}
                {bt === 'partial' && (
                  cell.block?.timeRange ? (
                    <text
                      x={cx} y={cy + 16}
                      textAnchor="middle" fill="#B8860B"
                      fontSize={20} fontWeight="600"
                      fontFamily={FONT}
                    >
                      {cell.block.timeRange}
                    </text>
                  ) : cell.block?.availableSlots ? (
                    <>
                      {cell.block.availableSlots.map((slot, si) => (
                        <text
                          key={si}
                          x={cx} y={y + 60 + si * 26}
                          textAnchor="middle" fill="#B8860B"
                          fontSize={18} fontWeight="500"
                          fontFamily={FONT}
                        >
                          {slot}○
                        </text>
                      ))}
                    </>
                  ) : null
                )}

                {/* ── open ── */}
                {bt === 'open' && (
                  <text
                    x={cx} y={cy + 16}
                    textAnchor="middle" fill="#27AE60"
                    fontSize={36} fontFamily={FONT}
                  >
                    ○
                  </text>
                )}
              </g>
            );
          })
        )}

        {/* ── Legend ── */}
        {(() => {
          const legendY = TABLE_TOP + weeks.length * CELL_H + 24;
          const items = [
            { label: '満席', bg: DARK, badge: GOLD, type: 'badge' as const },
            { label: '定休日', bg: '#F0F0ED', type: 'rect' as const },
            { label: '空きあり', bg: '#FFF8EE', type: 'rect' as const },
          ];
          const spacing = W / (items.length + 1);
          return items.map((item, i) => (
            <g key={`legend-${i}`}>
              {item.type === 'badge' ? (
                <>
                  <rect x={spacing * (i + 1) - 56} y={legendY - 2} width={24} height={24} rx={6} fill={item.bg} />
                  <circle cx={spacing * (i + 1) - 44} cy={legendY + 10} r={6} fill={item.badge} />
                </>
              ) : (
                <rect x={spacing * (i + 1) - 56} y={legendY - 2} width={24} height={24} rx={6} fill={item.bg} />
              )}
              <text
                x={spacing * (i + 1) - 24} y={legendY + 16}
                fill="#888" fontSize={22} fontFamily={FONT}
              >
                {item.label}
              </text>
            </g>
          ));
        })()}

        {/* ── Footer ── */}
        <rect x={0} y={H - FOOTER_H} width={W} height={FOOTER_H} fill="#F5F5F0" />
        <line x1={PAD} y1={H - FOOTER_H} x2={W - PAD} y2={H - FOOTER_H} stroke="#E8E8E3" strokeWidth={1} />
        <text
          x={W / 2} y={H - FOOTER_H + 50}
          textAnchor="middle" fill="#888"
          fontSize={26} letterSpacing="0.1em"
          fontFamily={FONT}
        >
          ご予約はLINEにて承っております
        </text>
        <text
          x={W / 2} y={H - FOOTER_H + 90}
          textAnchor="middle" fill={GOLD}
          fontSize={22} letterSpacing="0.15em"
          fontFamily={FONT}
        >
          ♪
        </text>
      </svg>
    </div>
  );
}

// ── PNG Download Helper ──────────────────────────────────────────────────────

export async function downloadCalendarPng(yearMonth: string): Promise<void> {
  const node = document.getElementById('story-calendar');
  if (!node) return;

  const domtoimage = (await import('dom-to-image-more')).default;
  const blob = await domtoimage.toBlob(node, {
    width: 1080,
    height: 1920,
    style: {
      transform: 'scale(1)',
      transformOrigin: 'top left',
    },
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calendar-${yearMonth}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
