/**
 * Vertical Bridge — legacy eyebrow ↔ new vertical data normalizers
 *
 * 責務: legacy data bridge（normalize / dual-write）
 * ※ vertical ごとの差分定義（labels / flags / defaultMenu 等）は verticals/registry.ts が担当
 *
 * Phase 3: index.ts から切り出し。legacy フィールドの読み書き変換を一箇所に集約。
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ CLEANUP READINESS (Phase 4+ で eyebrow 削除を進める際の順序)      │
 * ├──────────────────┬───────────────────────────────────────────────┤
 * │ normalizeMenu    │ KV GET → eyebrow → verticalAttributes 注入   │
 * │ normalizeStaff   │ KV GET → eyebrow → verticalAttributes 注入   │
 * │ normalizeMeta    │ D1 GET → eyebrowDesign → verticalData 注入   │
 * │ dualWriteKV      │ POST/PATCH → eyebrow ↔ verticalAttributes   │
 * │ dualWriteMeta    │ POST/PATCH → eyebrowDesign ↔ verticalData   │
 * ├──────────────────┴───────────────────────────────────────────────┤
 * │ 削除順: ① dualWrite 停止 → ② normalize 停止 → ③ 型削除          │
 * │ 前提: 全 KV/D1 データが new path のみで書かれている状態           │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 新標準パス（今後の正）:
 *   settings  → verticalConfig
 *   menu      → verticalAttributes
 *   staff     → verticalAttributes
 *   reservation meta → verticalData
 *
 * 読み順: new path → legacy path → fallback (undefined)
 * 書き込み: Phase 6 で dual-write 停止 → new path のみ write
 * ※ dualWrite* 関数は legacy client 互換のため残存（Phase 7 で削除予定）
 */

// ── Menu normalizer ─────────────────────────────────────────────────
// CLEANUP(Phase4+): KV 全データが verticalAttributes 持ちになったら削除可能

/**
 * KV 読み出し時に eyebrow-only メニューデータへ verticalAttributes を注入する。
 * 既に verticalAttributes が存在するアイテムはそのまま返す。
 */
export function normalizeMenuItems(items: any[]): any[] {
  return items.map(item => {
    if (item.eyebrow && !item.verticalAttributes) {
      return { ...item, verticalAttributes: { ...item.eyebrow } };
    }
    return item;
  });
}

// ── Staff normalizer ────────────────────────────────────────────────
// CLEANUP(Phase4+): KV 全データが verticalAttributes 持ちになったら削除可能

/**
 * KV 読み出し時に eyebrow-only スタッフデータへ verticalAttributes を注入する。
 */
export function normalizeStaffItems(items: any[]): any[] {
  return items.map(item => {
    if (item.eyebrow && !item.verticalAttributes) {
      return { ...item, verticalAttributes: { ...item.eyebrow } };
    }
    return item;
  });
}

// ── ReservationMeta normalizer ──────────────────────────────────────
// CLEANUP(Phase4+): D1 全データが verticalData 持ちになったら削除可能

/**
 * D1 meta JSON 読み出し時に eyebrowDesign-only データへ verticalData を注入する。
 */
export function normalizeReservationMeta(meta: any): any {
  if (!meta || typeof meta !== 'object') return meta;
  if (meta.eyebrowDesign && !meta.verticalData) {
    return { ...meta, verticalData: { ...meta.eyebrowDesign } };
  }
  return meta;
}

// ── Dual-write helpers (KV entities) ────────────────────────────────
// CLEANUP(Phase4+): 全テナントが new path で保存されたら dualWrite を停止可能

/**
 * KV エンティティ (menu/staff) の eyebrow ↔ verticalAttributes 双方向同期。
 * POST/PATCH 時に呼び出し、片方のみ存在する場合にもう片方を自動生成する。
 */
export function dualWriteVerticalAttributes(item: any): void {
  if (item.eyebrow && !item.verticalAttributes) {
    item.verticalAttributes = { ...item.eyebrow };
  }
  if (item.verticalAttributes && !item.eyebrow) {
    item.eyebrow = { ...item.verticalAttributes };
  }
}

/**
 * KV エンティティの PATCH 時 eyebrow ↔ verticalAttributes 双方向同期。
 * null 削除も処理する。
 */
export function dualWriteVerticalAttributesPatch(updated: any, body: any): void {
  if (body.eyebrow !== undefined) {
    if (body.eyebrow === null) {
      delete updated.eyebrow;
      delete updated.verticalAttributes;
    } else {
      updated.eyebrow = body.eyebrow;
      updated.verticalAttributes = { ...body.eyebrow };
    }
  }
  if (body.verticalAttributes !== undefined) {
    if (body.verticalAttributes === null) {
      delete updated.verticalAttributes;
    } else {
      updated.verticalAttributes = body.verticalAttributes;
      // reverse bridge: verticalAttributes → eyebrow (unless eyebrow explicitly set in same request)
      if (body.eyebrow === undefined) updated.eyebrow = { ...body.verticalAttributes };
    }
  }
}

// ── Dual-write helpers (D1 reservation meta) ────────────────────────
// CLEANUP(Phase4+): 全 D1 データが verticalData 持ちになったら停止可能

/**
 * D1 reservation meta の eyebrowDesign ↔ verticalData 双方向同期。
 * PATCH 時の mergedMeta に対して呼び出す。
 */
export function dualWriteReservationMeta(mergedMeta: any): void {
  // eyebrowDesign → verticalData 自動派生
  if (mergedMeta.eyebrowDesign && !mergedMeta.verticalData) {
    mergedMeta.verticalData = { ...mergedMeta.eyebrowDesign };
  }
  // verticalData → eyebrowDesign 逆方向派生（legacy client 互換）
  if (mergedMeta.verticalData && !mergedMeta.eyebrowDesign) {
    mergedMeta.eyebrowDesign = { ...mergedMeta.verticalData };
  }
}
