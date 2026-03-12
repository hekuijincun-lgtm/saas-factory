/**
 * スタッフ定義（暫定）
 * 後でAPI化する前提で、定数として管理
 */

export type Staff = {
  id: string;
  name: string;
  role?: string;
};

export const STAFF: Staff[] = [
  { id: 'any', name: '指名なし', role: 'Any' },
  { id: 'ayaka', name: 'AYAKA', role: 'アイブロウリスト' },
  { id: 'mizuki', name: 'MIZUKI', role: 'アイブロウリスト' },
];

// 後方互換性のため
export const STAFF_LIST = STAFF;

