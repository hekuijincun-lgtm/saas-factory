import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SlotLock as SlotLockDO } from './durable/SlotLock';
import { DEFAULT_ADMIN_SETTINGS, validateAdminSettings, mergeSettings, type AdminSettings } from './settings';
import { getBusinessHoursForDate, generateSlots, getTodayJST, isWorkingTime, timeToMinutes, getNowMinutesJST } from './slotUtils';
import { buildLineAuthUrl, exchangeCodeForToken, verifyAccessToken, sendLineMessage, sendLineNotification, verifyLineWebhookSignature } from './integrations/line';
import { getLineConfig, saveLineConfig, deleteLineConfig, hasLineConfig, logAudit, getMaskedConfig, type LineConfigPlain } from './lineConfig';
import { getLineConfigOrNull, getLineConfigRequired, jsonError } from './line/config';
export { SlotLock } from './durable/SlotLock';
type Env = {
  ENVIRONMENT?: string;
  VERSION?: string;
  SAAS_FACTORY: KVNamespace;
  SLOT_LOCK: DurableObjectNamespace<SlotLockDO>;
  DB: D1Database;
  CONFIG_ENC_KEY?: string; // 暗号化マスターキー（base64 32byte）
  LINE_CLIENT_ID?: string; // LINE Login Client ID
  LINE_LOGIN_CHANNEL_ID?: string; // LINE Login Channel ID
  LINE_LOGIN_CHANNEL_SECRET?: string; // LINE Login Channel Secret
  LINE_LOGIN_REDIRECT_BASE?: string; // LINE Login Redirect Base URL (例: http://localhost:3000)
  LINE_REDIRECT_URI?: string; // LINE OAuth Redirect URI (例: http://localhost:3000/admin/integrations/line/callback)
  LINE_CHANNEL_ACCESS_TOKEN?: string; // 後方互換性のため残す（D1移行後は削除予定）
  LINE_CHANNEL_SECRET?: string; // 後方互換性のため残す（D1移行後は削除予定）
  WEB_BASE_URL?: string; // 例: http://localhost:3000
};

const app = new Hono<{ Bindings: Env }>();

app.get("/__debug/env", (c) => {
  const e: any = (c as any).env;
  return c.json({
    ok: true,
    hasEnv: !!e,
    hasDB: !!(e && e.DB),
    envKeys: e ? Object.keys(e) : [],

});
});
/**
 * テナントIDを取得（暫定: 1テナントのみ対応）
 * 将来的にはリクエストヘッダーやサブドメインから取得する
*/
function getTenantId(c: any): string {
  // 1) query ?tenantId= を最優先（Hono: c.req.query）
  const q = c?.req?.query ? c.req.query("tenantId") : undefined;
  if (q && String(q).trim()) return String(q).trim();

  // 2) header X-Tenant-ID 次点
  const h = c?.req?.header ? c.req.header("X-Tenant-ID") : undefined;
  if (h && String(h).trim()) return String(h).trim();

  // 3) fallback
  return "default";
}

// CORS設定: 開発時のみ http://localhost:3000 を許可
function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
async function importAesKeyFromB64(b64: string) {
  const raw = b64ToBytes(b64);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function aesGcmEncrypt(key: CryptoKey, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(plain);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  const ct = new Uint8Array(ctBuf);
  return bytesToB64(iv) + "." + bytesToB64(ct);
}
app.use('/*', cors({
  origin: (origin, c) => {
    const env = c.env?.ENVIRONMENT || 'development';
    // 開発環境の場合のみCORSを許可
    if (env === 'development' && origin === 'http://localhost:3000') {
      return origin;
    }
    // 本番環境または許可されていないOriginの場合はCORSを付けない
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// GET /ping (依存ゼロの疎通確認ルート)




app.get("/ping", (c) => c.text("pong-stamp-20260205-171753"))

// GET /




app.get('/', (c) => {
  return c.text('API Online');
});

// GET /health




app.get('/health', (c) => {
  const env = c.env;
  return c.json({
    ok: true,
    ts: new Date().toISOString(),
    env: env.ENVIRONMENT || 'development',
    version: env.VERSION || '1.0.0',
  });
});
app.get("/__routes2", (c) => {
  // @ts-ignore
  const routes = (app as any).routes ?? null;
  return c.json({ ok: true, routes });
});
// GET /meta




app.get('/meta', (c) => {
  const env = c.env;
  return c.json({
    service: 'saas-factory-api',
    env: env.ENVIRONMENT || 'development',
    version: env.VERSION || '1.0.0',
    runtime: 'cloudflare-workers',
  });
});
// GET /slots?date=YYYY-MM-DD&staffId=xxx(optional)
app.get('/slots', async (c) => {
  const dateStr = c.req.query('date');
  const staffId = c.req.query('staffId'); // optional
  const debug = c.req.query('debug');
  
  // デバッグモード: debug=1 で依存ゼロで即 return
  if (debug === '1') {
    return c.json({ ok: true, stage: 'entered', date: dateStr, staffId: staffId || null });
  }
  
  // date がない/不正なら 400
  if (!dateStr) {
    return c.json({ ok: false, error: 'invalid date' }, 400);
  }
  
  // 日付形式の検証 (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return c.json({ ok: false, error: 'invalid date' }, 400);
  }
  
  // 日付が有効かチェック
  const date = new Date(dateStr + 'T00:00:00+09:00'); // JSTとして解釈
  if (isNaN(date.getTime())) {
    return c.json({ ok: false, error: 'invalid date' }, 400);
  }
  
  const kv = c.env.SAAS_FACTORY;
  
  // デバッグモード: debug=2 で settings を取得
  if (debug === '2') {
    try {
      const settingsValue = await kv.get('settings:default');
      const hasSettings = !!settingsValue;
      return c.json({ 
        ok: true, 
        stage: 'settings_fetched', 
        date: dateStr,
        hasSettings,
        settingsLength: settingsValue?.length || 0
      });
    } catch (e) {
      return c.json({ 
        ok: false, 
        stage: 'settings_error', 
        error: e instanceof Error ? e.message : String(e) 
      }, 500);
    }
  }
  
  // 設定を取得
  const settingsValue = await kv.get('settings:default');
  const settings: AdminSettings = settingsValue
    ? mergeSettings(DEFAULT_ADMIN_SETTINGS, JSON.parse(settingsValue))
    : DEFAULT_ADMIN_SETTINGS;
  
  // デバッグモード: debug=3 で shift を読む
  if (debug === '3') {
    try {
      let shiftPresent = false;
      let staffListPresent = false;
      
      if (staffId) {
        const shiftKeyNew = `shift:${tenantId}:${staffId}`;
const shiftKeyOld = `shift:${staffId}`;
const shiftValue = (await kv.get(shiftKeyNew)) ?? (await kv.get(shiftKeyOld));
        shiftPresent = !!shiftValue;
      }
      
      // staff list も確認
    const value = await kv.get(`admin:staff:list:${tenantId}`);
      staffListPresent = !!staffListValue;
      
      return c.json({ 
        ok: true, 
        stage: 'shift_fetched', 
        date: dateStr,
        staffId: staffId || null,
        shiftPresent,
        staffListPresent
      });
    } catch (e) {
      return c.json({ 
        ok: false, 
        stage: 'error', 
        error: e instanceof Error ? e.message : String(e) 
      }, 500);
    }
  }
  
  // 営業時間を取得（定休日・例外日を考慮）
  const businessHours = getBusinessHoursForDate(dateStr, settings);
  
  if (!businessHours) {
    // 休業日または定休日
    return c.json({
      ok: true,
      date: dateStr,
      slots: [],
    });
  }
  
  // スロット間隔を取得（デフォルト30分）
  const slotIntervalMin = settings.businessHours.slotIntervalMin || 30;
  
  // staffId がある場合、そのスタッフのシフトを取得
  let staffShift: StaffShift | null = null;
  if (staffId) {
    try {
      const shiftKeyNew = `shift:${tenantId}:${staffId}`;
const shiftKeyOld = `shift:${staffId}`;
const shiftValue = (await kv.get(shiftKeyNew)) ?? (await kv.get(shiftKeyOld));
      if (shiftValue) {
        staffShift = JSON.parse(shiftValue) as StaffShift;
      }
    } catch (e) {
      console.warn(`Failed to load shift for staff ${staffId}:`, e);
    }
  }
  
  // デバッグモード: debug=4 で予約済みキーの参照まで
  if (debug === '4') {
    try {
      // 最初のスロットの予約キーを参照（スロット生成はしない）
      // 仮の時間でキーを構築して参照するだけ
      const testKey = `rsv:${dateStr}:10:00`;
      const existing = await kv.get(testKey);
      const reservedPresent = !!existing;
      return c.json({ 
        ok: true, 
        stage: 'reserved_key_checked', 
        date: dateStr,
        testKey,
        reservedPresent
      });
    } catch (e) {
      return c.json({ 
        ok: false, 
        stage: 'error', 
        error: e instanceof Error ? e.message : String(e) 
      }, 500);
    }
  }
  
  // デバッグモード: debug=5 でスロット生成ロジック直前まで
  if (debug === '5') {
    return c.json({ 
      ok: true, 
      stage: 'before_slot_generation', 
      date: dateStr,
      hasBusinessHours: !!businessHours,
      slotIntervalMin,
      hasShift: !!staffShift,
      staffId: staffId || null
    });
  }
  
  // スロットを生成
  const timeSlots = generateSlots(businessHours.openTime, businessHours.closeTime, slotIntervalMin);
  
  // デバッグモード: debug=6 でスロット生成ロジックを実行して stage=done で返す
  if (debug === '6') {
    try {
      // 無限ループ検知: maxIterations ガード
      const maxIterations = 5000;
      let iterationCount = 0;
      
      // スロット生成後の処理をシミュレート（最初の数個だけ）
      const sampleSlots = timeSlots.slice(0, Math.min(5, timeSlots.length));
      const sampleResults = await Promise.all(
        sampleSlots.map(async (time) => {
          iterationCount++;
          if (iterationCount > maxIterations) {
            throw new Error(`Max iterations (${maxIterations}) exceeded`);
          }
          
          const key = `rsv:${dateStr}:${time}`;
          const existing = await kv.get(key);
          return {
            time,
            key,
            reserved: !!existing
          };
        })
      );
      
      return c.json({ 
        ok: true, 
        stage: 'done', 
        date: dateStr,
        totalSlots: timeSlots.length,
        sampleSlots: sampleResults.length,
        iterationCount,
        firstSlot: timeSlots[0] || null,
        lastSlot: timeSlots[timeSlots.length - 1] || null
      });
    } catch (e) {
      return c.json({ 
        ok: false, 
        stage: 'error', 
        error: e instanceof Error ? e.message : String(e) 
      }, 500);
    }
  }
  
  // KVから予約済みスロットを確認し、cutoffMinutesとshiftを適用
  // reason の優先順位: 1) reserved, 2) cutoff, 3) closed, 4) shift
  // 無限ループ検知: maxIterations ガード
  const maxIterations = 5000;
  let iterationCount = 0;
  
  const slots = await Promise.all(
    timeSlots.map(async (time) => {
      iterationCount++;
      if (iterationCount > maxIterations) {
        throw new Error(`Max iterations (${maxIterations}) exceeded in slot processing`);
      }
      // 理由を優先順位で判定
      const reasons: string[] = [];
      
      // 1. closed チェック（営業時間外）
      if (!businessHours) {
        reasons.push('closed');
      }
      
      // 2. reserved チェック（予約済み、かつstatusがactive）
      const key = `rsv:${dateStr}:${time}`;
      const existing = await kv.get(key);
      if (existing) {
        try {
          const reservation = JSON.parse(existing);
          // statusが"canceled"でない場合のみ予約済みとみなす
          if (reservation.status !== 'canceled') {
            reasons.push('reserved');
          }
        } catch (e) {
          // パースエラーは無視
        }
      }
      
      // 3. cutoff チェック（当日かつcutoffMinutes以内）
      const today = getTodayJST();
      if (dateStr === today) {
        const nowMin = getNowMinutesJST();
        const slotMin = timeToMinutes(time);
        const diffMinutes = slotMin - nowMin;
        if (diffMinutes < settings.rules.cutoffMinutes) {
          reasons.push('cutoff');
        }
      }
      
      // 4. shift チェック（staffIdがある場合、勤務時間外）
      if (staffId && staffShift) {
        const isWorking = isWorkingTime(dateStr, time, staffShift);
        if (!isWorking) {
          reasons.push('shift');
        }
      }
      
      // 優先順位で最初のreasonを採用: reserved > cutoff > closed > shift
      const reasonPriority: Record<string, number> = {
        reserved: 1,
        cutoff: 2,
        closed: 3,
        shift: 4,
      };
      
      let finalReason: string | undefined = undefined;
      if (reasons.length > 0) {
        reasons.sort((a, b) => (reasonPriority[a] || 999) - (reasonPriority[b] || 999));
        finalReason = reasons[0];
      }
      
      // available判定: いずれかの理由があればfalse
      const available = finalReason === undefined;
      
      return {
        time,
        available,
        ...(finalReason ? { reason: finalReason as 'cutoff' | 'reserved' | 'shift' | 'closed' } : {}),
      };
    })
  );
  
  return c.json({
    ok: true,
    date: dateStr,
    ...(staffId ? { staffId } : {}),
    slots,
  });// POST /reserve





  // FIX: close /slots route
});

app.post('/reserve', async (c) => {
  try {
    const body = await c.req.json();
    const { date, time, name, phone } = body;
    
    // validation: date/time/name 必須。phoneは任意
    if (!date || typeof date !== 'string') {
      return c.json({ ok: false, error: 'date is required' }, 400);
    }
    if (!time || typeof time !== 'string') {
      return c.json({ ok: false, error: 'time is required' }, 400);
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return c.json({ ok: false, error: 'name is required' }, 400);
    }
    
    // Durable Object経由で処理（ロックキー: ${date}:${time}）
    const lockKey = `${tenantId}:${date}:${time}`;
    const id = c.env.SLOT_LOCK.idFromName(lockKey);
    const stub = c.env.SLOT_LOCK.get(id);
    
    // Durable Objectにリクエストを転送
    // Durable Objectは同一IDに対して同時に1つのリクエストしか処理しないため、
    // 自然にロックがかかり、二重予約を防ぐ
    const doRequest = new Request('http://slot-lock/reserve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const response = await stub.fetch(doRequest);
    const result = await response.json();
    const status = response.status;
    
    // 予約作成成功時にLINE通知を送信（非同期、エラーは無視）
    if (status === 200 && result.ok) {
      try {
        const kv = c.env.SAAS_FACTORY;
        const tenantId = getTenantId(c);
        
        // settings を取得して通知ルールを確認
        const settingsValue = await kv.get('settings:default');
        const settings: AdminSettings = settingsValue
          ? mergeSettings(DEFAULT_ADMIN_SETTINGS, JSON.parse(settingsValue))
          : DEFAULT_ADMIN_SETTINGS;
        
        // 通知が有効で、LINE連携済みの場合のみ送信
        if (settings.integrations?.line?.connected && settings.integrations.line.notifyOnReservation !== false) {
          const { date, time, name, reservationId, staffId } = result;
          
          // スタッフ名を取得（あれば）
          let staffName = '指名なし';
          if (staffId) {
            try {
              const staffKeyNew = `staff:${tenantId}:${staffId}`;
const staffKeyOld = `staff:${staffId}`;
const staffValue = (await kv.get(staffKeyNew)) ?? (await kv.get(staffKeyOld));
              if (staffValue) {
                const staff = JSON.parse(staffValue);
                staffName = staff.name || staffId;
              }
            } catch (e) {
              // スタッフ取得失敗は無視
            }
          }
          
          // メニュー情報を取得（あれば、bodyにmenuIdがあれば）
          let menuName = 'メニュー未指定';
          if (body.menuId) {
            try {
              const menuKeyNew = `menu:${tenantId}:${body.menuId}`;
const menuKeyOld = `menu:${body.menuId}`;
const menuValue = (await kv.get(menuKeyNew)) ?? (await kv.get(menuKeyOld));
              if (menuValue) {
                const menu = JSON.parse(menuValue);
                menuName = menu.name || body.menuId;
              }
            } catch (e) {
              // メニュー取得失敗は無視
            }
          }
          
          const message = `予約が確定しました ✅\n日時: ${date} ${time}\nメニュー: ${menuName}\nスタッフ: ${staffName}\n予約ID: ${reservationId}`;
          
          // 非同期で通知を送信（エラーは無視）
          // D1から設定を取得（なければ環境変数にフォールバック）
          getLineConfigOrNull({ DB: c.env.DB, CONFIG_ENC_KEY: c.env.CONFIG_ENC_KEY }, tenantId).then(async (config) => {
            let channelAccessToken: string | undefined;
            if (config) {
              channelAccessToken = config.channelAccessToken;
            } else {
              channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
            }
            const userId = settings.integrations.line.userId;
            if (channelAccessToken && userId) {
              sendLineNotification(kv, channelAccessToken, userId, message)
              .then(async () => {
                // 成功時: lastSentAt を記録
                const lastSentAtKey = `line:notify:lastSentAt:${tenantId}`;
                await kv.put(lastSentAtKey, JSON.stringify({
                  message,
                  at: Date.now(),
                }));
              })
              .catch(async (err) => {
                // エラー時: lastError を記録（秘密値はログに出力しない）
                const errorMessage = err instanceof Error ? err.message : String(err);
                // console.error は秘密値を含む可能性があるため使用しない
                const lastErrorKey = `line:notify:lastError:${tenantId}`;
                await kv.put(lastErrorKey, JSON.stringify({
                  message,
                  error: errorMessage,
                  at: Date.now(),
                }));
              });
            }
          }).catch(() => {
            // エラーは無視
          });
        }
      } catch (err) {
        // 通知送信失敗は無視（予約作成は成功しているため）
        // console.error は秘密値を含む可能性があるため使用しない
      }
    }
    
    return c.json(result, status);
  } catch (error) {
    return c.json({ ok: false, error: 'Invalid request body' }, 400);
  }
});

// GET /admin/reservations?date=YYYY-MM-DD




app.get('/admin/reservations', async (c) => {
  const dateStr = c.req.query('date');
  
  // date がない/不正なら 400
  if (!dateStr) {
    return c.json({ ok: false, error: 'date parameter is required' }, 400);
  }
  
  // 日付形式の検証 (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return c.json({ ok: false, error: 'invalid date format' }, 400);
  }
  
  // 日付が有効かチェック
  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) {
    return c.json({ ok: false, error: 'invalid date' }, 400);
  }
  
  const kv = c.env.SAAS_FACTORY;
  const prefix = `rsv:${dateStr}:`;
  
  // KVから指定日付の予約を取得（prefix scan）
  // 注意: Cloudflare KVはprefix scanを直接サポートしていないため、
  // 全キーをリストしてフィルタリングする必要がある
  // 簡易実装として、固定時間帯をスキャンする方法を使用
  const timeSlots = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
  const reservations = [];
  
  for (const time of timeSlots) {
    const key = `${prefix}${time}`;
    const value = await kv.get(key);
    if (value) {
      try {
        const reservation = JSON.parse(value);
        reservations.push(reservation);
      } catch (e) {
        // パースエラーは無視
      }
    }
  }
  
  return c.json({
    ok: true,
    date: dateStr,
    reservations,
  });
// GET /admin/staff
});

app.get('/admin/staff', async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const value = await kv.get(`admin:staff:list:${tenantId}`);

    if (value) {
      const data = JSON.parse(value);
      return c.json({ ok: true, tenantId, data });
    }
// デフォルトデータ
    const defaultStaff = [
      { id: 'sakura', name: 'サクラ', role: 'Top Stylist', active: true, sortOrder: 1 },
      { id: 'kenji', name: 'ケンジ', role: 'Director', active: true, sortOrder: 2 },
      { id: 'rookie', name: 'Rookie', role: 'Staff', active: true, sortOrder: 3 },
    ];
    
    return c.json({ ok: true, tenantId, data: defaultStaff });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to fetch staff', message: String(error) }, 500);
  }
});

// POST /admin/staff




app.post('/admin/staff', async (c) => {
  
    const tenantId = getTenantId(c);
try {
    const body = await c.req.json();
    const { name, role, active, sortOrder } = body;
    
    // validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return c.json({ ok: false, error: 'name is required' }, 400);
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return c.json({ ok: false, error: 'active must be boolean' }, 400);
    }
    if (sortOrder !== undefined && (typeof sortOrder !== 'number' || sortOrder < 0)) {
      return c.json({ ok: false, error: 'sortOrder must be non-negative number' }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    const value = await kv.get(`admin:staff:list:${tenantId}`);
    const staff = value ? JSON.parse(value) : [];
    
    // ID生成
    const id = `staff_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newStaff = {
      id,
      name: name.trim(),
      role: role?.trim() || undefined,
      active: active !== undefined ? active : true,
      sortOrder: sortOrder !== undefined ? sortOrder : staff.length,
    };
    
    staff.push(newStaff);
    await kv.put(`admin:staff:list:${tenantId}`, JSON.stringify(staff));
    
    return c.json({ ok: true, tenantId, data: newStaff }, 201);
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to create staff', message: String(error) }, 500);
  }
});

// PATCH /admin/staff/:id




app.patch('/admin/staff/:id', async (c) => {
  try {
    const tenantId = (getTenantId(c) || 'default');
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, role, active, sortOrder } = body;
    
    const kv = c.env.SAAS_FACTORY;
    const value = await kv.get(`admin:staff:list:${tenantId}`);
let staff = value ? JSON.parse(value) : null;
if (!Array.isArray(staff) || staff.length === 0) {
  staff = [
    { id: 'sakura', name: 'サクラ', role: 'Top Stylist', active: true, sortOrder: 1 },
    { id: 'kenji',  name: 'ケンジ', role: 'Director',    active: true, sortOrder: 2 },
    { id: 'rookie', name: 'Rookie', role: 'Staff',       active: true, sortOrder: 3 },
  ];
}
const index = staff.findIndex((s: any) => s.id === id);
    if (index === -1) {
      return c.json({ ok: false, error: 'Staff not found' }, 404);
    }
    
    // 更新
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return c.json({ ok: false, error: 'name must be non-empty string' }, 400);
      }
      staff[index].name = name.trim();
    }
    if (role !== undefined) {
      staff[index].role = role === null || role === '' ? undefined : role.trim();
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return c.json({ ok: false, error: 'active must be boolean' }, 400);
      }
      staff[index].active = active;
    }
    if (sortOrder !== undefined) {
      if (typeof sortOrder !== 'number' || sortOrder < 0) {
        return c.json({ ok: false, error: 'sortOrder must be non-negative number' }, 400);
      }
      staff[index].sortOrder = sortOrder;
    }
    
    await kv.put(`admin:staff:list:${tenantId}`, JSON.stringify(staff));
    
    return c.json({ ok: true, tenantId, data: staff[index] });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to update staff', message: String(error) }, 500);
  }
});

// GET /admin/menu




app.get('/admin/menu', async (c) => {
  try {
    const tenantId = body?.tenantId ?? getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const value = await kv.get(`admin:staff:list:${tenantId}`);
    
    if (value) {
return c.json({ ok: true, data: menu });
    }
    
    // デフォルトデータ
    const defaultMenu = [
      { id: 'cut', name: 'カット', price: 5000, durationMin: 60, active: true, sortOrder: 1 },
      { id: 'color', name: 'カラー', price: 8000, durationMin: 90, active: true, sortOrder: 2 },
      { id: 'perm', name: 'パーマ', price: 10000, durationMin: 120, active: true, sortOrder: 3 },
    ];
    
    return c.json({ ok: true, data: defaultMenu });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to fetch menu', message: String(error) }, 500);
  }
});

// POST /admin/menu




app.post('/admin/menu', async (c) => {
  try {
    const body = await c.req.json();
    const { name, price, durationMin, active, sortOrder } = body;
    
    // validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return c.json({ ok: false, error: 'name is required' }, 400);
    }
    if (price === undefined || typeof price !== 'number' || price < 0) {
      return c.json({ ok: false, error: 'price must be non-negative number' }, 400);
    }
    if (durationMin === undefined || typeof durationMin !== 'number' || durationMin <= 0) {
      return c.json({ ok: false, error: 'durationMin must be positive number' }, 400);
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return c.json({ ok: false, error: 'active must be boolean' }, 400);
    }
    if (sortOrder !== undefined && (typeof sortOrder !== 'number' || sortOrder < 0)) {
      return c.json({ ok: false, error: 'sortOrder must be non-negative number' }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    const value = await kv.get(`admin:menu:list:${tenantId}`);
    const menu = value ? JSON.parse(value) : [];
    
    // ID生成
    const id = `menu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMenuItem = {
      id,
      name: name.trim(),
      price,
      durationMin,
      active: active !== undefined ? active : true,
      sortOrder: sortOrder !== undefined ? sortOrder : menu.length,
    };
    
    menu.push(newMenuItem);
    await kv.put(`admin:menu:list:${tenantId}`, JSON.stringify(menu));
    
    return c.json({ ok: true, data: newMenuItem }, 201);
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to create menu', message: String(error) }, 500);
  }
});

// PATCH /admin/menu/:id




app.patch('/admin/menu/:id', async (c) => {
  try {
    const tenantId = (getTenantId(c) || 'default');
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, price, durationMin, active, sortOrder } = body;
    
    const kv = c.env.SAAS_FACTORY;
    const value = await kv.get(`admin:menu:list:${tenantId}`);
let menu = value ? JSON.parse(value) : null;
if (!Array.isArray(menu) || menu.length === 0) {
  menu = [
    { id: 'cut',   name: 'カット', price: 5000,  durationMin: 60,  active: true, sortOrder: 1 },
    { id: 'color', name: 'カラー', price: 8000,  durationMin: 90,  active: true, sortOrder: 2 },
    { id: 'perm',  name: 'パーマ', price: 10000, durationMin: 120, active: true, sortOrder: 3 },
  ];
}
const index = menu.findIndex((m: any) => m.id === id);
    if (index === -1) {
      return c.json({ ok: false, error: 'Menu not found' }, 404);
    }
    
    // 更新
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return c.json({ ok: false, error: 'name must be non-empty string' }, 400);
      }
      menu[index].name = name.trim();
    }
    if (price !== undefined) {
      if (typeof price !== 'number' || price < 0) {
        return c.json({ ok: false, error: 'price must be non-negative number' }, 400);
      }
      menu[index].price = price;
    }
    if (durationMin !== undefined) {
      if (typeof durationMin !== 'number' || durationMin <= 0) {
        return c.json({ ok: false, error: 'durationMin must be positive number' }, 400);
      }
      menu[index].durationMin = durationMin;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return c.json({ ok: false, error: 'active must be boolean' }, 400);
      }
      menu[index].active = active;
    }
    if (sortOrder !== undefined) {
      if (typeof sortOrder !== 'number' || sortOrder < 0) {
        return c.json({ ok: false, error: 'sortOrder must be non-negative number' }, 400);
      }
      menu[index].sortOrder = sortOrder;
    }
    
    await kv.put(`admin:menu:list:${tenantId}`, JSON.stringify(menu));
    
    return c.json({ ok: true, data: menu[index] });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to update menu', message: String(error) }, 500);
  }
});

// GET /admin/settings




app.get('/admin/settings', async (c) => {
  try {
    const kv = c.env.SAAS_FACTORY;
    const tenantId = body?.tenantId ?? getTenantId(c);
    const settingsKey = `settings:${tenantId}`;
    const value = (await kv.get(settingsKey)) ?? (await kv.get('settings:default'));
    
    if (value) {
      const partial = JSON.parse(value) as Partial<AdminSettings>;
      // デフォルト値でマージして完全な設定を返す
      const settings = mergeSettings(DEFAULT_ADMIN_SETTINGS, partial);
      return c.json({ ok: true, data: settings });
    }
    
    // デフォルト設定を返す
    return c.json({ ok: true, data: DEFAULT_ADMIN_SETTINGS });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to fetch settings', message: String(error) }, 500);
  }
});

// PUT /admin/settings




app.put('/admin/settings', async (c) => {
  try {
    const body = await c.req.json() as Partial<AdminSettings>;
    
    // バリデーション
    const validation = validateAdminSettings(body);
    if (!validation.valid) {
      return c.json({ ok: false, error: validation.error }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    const tenantId = getTenantId(c);
    const settingsKey = `settings:${tenantId}`;
    const existingValue = (await kv.get(settingsKey)) ?? (await kv.get('settings:default'));
    const existing = existingValue ? (JSON.parse(existingValue) as Partial<AdminSettings>) : {};
    
    // 既存設定とマージ（PUTは全置換だが、欠損フィールドはデフォルトで補完）
    const merged = mergeSettings(DEFAULT_ADMIN_SETTINGS, { ...existing, ...body });
    
    // 再度バリデーション（完全な設定に対して）
    const fullValidation = validateAdminSettings(merged);
    if (!fullValidation.valid) {
      return c.json({ ok: false, error: fullValidation.error }, 400);
    }
    
    // KVに保存
    await kv.put(settingsKey, JSON.stringify(merged));
    
    return c.json({ ok: true, data: merged });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to update settings', message: String(error) }, 500);
  }
});

// PUT /admin/staff/:id/shift




app.put('/admin/staff/:id/shift', async (c) => {
  try {
    const staffId = c.req.param('id');
    const body = await c.req.json() as StaffShift;
    
    // validation
    if (!staffId || typeof staffId !== 'string' || staffId.trim() === '') {
      return c.json({ ok: false, error: 'staffId is required' }, 400);
    }
    if (!body.weekly || !Array.isArray(body.weekly)) {
      return c.json({ ok: false, error: 'weekly is required and must be array' }, 400);
    }
    if (!body.exceptions || !Array.isArray(body.exceptions)) {
      return c.json({ ok: false, error: 'exceptions is required and must be array' }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    const shiftData: StaffShift = {
      staffId,
      weekly: body.weekly,
      exceptions: body.exceptions,
    };
    
    // KVに保存
    await kv.put(`shift:${tenantId}:${staffId}`, JSON.stringify(shiftData));
    
    return c.json({ ok: true, data: shiftData });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to save shift', message: String(error) }, 500);
  }
});

// GET /admin/staff/:id/shift




app.get('/admin/staff/:id/shift', async (c) => {
  try {
    const staffId = c.req.param('id');
    
    if (!staffId || typeof staffId !== 'string' || staffId.trim() === '') {
      return c.json({ ok: false, error: 'staffId is required' }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    const shiftKeyNew = `shift:${tenantId}:${staffId}`;
const shiftKeyOld = `shift:${staffId}`;
const shiftValue = (await kv.get(shiftKeyNew)) ?? (await kv.get(shiftKeyOld));
    
    if (shiftValue) {
      const shift = JSON.parse(shiftValue) as StaffShift;
      return c.json({ ok: true, data: shift });
    }
    
    // デフォルト（空のシフト）
    return c.json({
      ok: true,
      data: {
        staffId,
        weekly: [],
        exceptions: [],
      } as StaffShift,
    });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to fetch shift', message: String(error) }, 500);
  }
});

// PATCH /admin/reservations/:id/assign




app.patch('/admin/reservations/:id', async (c) => {
  try {
    const reservationId = c.req.param('id');
    const body = await c.req.json();
    const { staffId } = body;
    
    // validation
    if (staffId !== undefined && staffId !== null && typeof staffId !== 'string') {
      return c.json({ ok: false, error: 'staffId must be string or null' }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    
    // 予約を検索（全時間帯をスキャン）
    const timeSlots = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    let foundReservation: any = null;
    let foundKey: string | null = null;
    
    // 日付を推測する必要があるが、簡易実装として最近7日間をスキャン
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      for (const time of timeSlots) {
        const key = `rsv:${dateStr}:${time}`;
        const value = await kv.get(key);
        if (value) {
          try {
            const reservation = JSON.parse(value);
            if (reservation.reservationId === reservationId || reservation.id === reservationId) {
              foundReservation = reservation;
              foundKey = key;
              break;
            }
          } catch (e) {
            // パースエラーは無視
          }
        }
      }
      if (foundReservation) break;
    }
    
    if (!foundReservation) {
      return c.json({ ok: false, error: 'Reservation not found' }, 404);
    }
    
    // staffId を更新
    foundReservation.staffId = staffId || null;
    
    await kv.put(foundKey!, JSON.stringify(foundReservation));
    
    return c.json({ ok: true, data: foundReservation });
  } catch (error) {
    return c.json({ ok: false, error: 'Failed to assign staff', message: String(error) }, 500);
  }
});

// DELETE /admin/reservations/:id




app.delete('/admin/reservations/:id', async (c) => {
  try {
    const reservationId = c.req.param('id');
    
    // validation: reservationId 必須
    if (!reservationId || typeof reservationId !== 'string' || reservationId.trim() === '') {
      return c.json({ ok: false, error: 'reservationId is required' }, 400);
    }
    
    const kv = c.env.SAAS_FACTORY;
    
    // 設定を取得してcancelMinutesをチェック
    const settingsValue = await kv.get('settings:default');
    const settings: AdminSettings = settingsValue
      ? mergeSettings(DEFAULT_ADMIN_SETTINGS, JSON.parse(settingsValue))
      : DEFAULT_ADMIN_SETTINGS;
    
    // O(1) 逆引き: rsv:id:${reservationId} から date/time/status を取得
    const reverseKey = `rsv:id:${reservationId}`;
    const reverseValue = await kv.get(reverseKey);
    
    let foundReservation: any = null;
    let foundKey: string | null = null;
    let date: string | null = null;
    let time: string | null = null;
    let reverseStatus: string | null = null;
    
    if (reverseValue) {
      // 逆引きが存在する場合（O(1)）
      try {
        const reverseData = JSON.parse(reverseValue);
        date = reverseData.date;
        time = reverseData.time;
        reverseStatus = reverseData.status || 'active'; // 後方互換性のためデフォルトはactive
        
        // 既にキャンセル済みの場合は冪等エラーを返す
        if (reverseStatus === 'canceled') {
          return c.json({ ok: false, error: 'already canceled' }, 409);
        }
        
        if (date && time) {
          foundKey = `rsv:${date}:${time}`;
          const reservationValue = await kv.get(foundKey);
          if (reservationValue) {
            foundReservation = JSON.parse(reservationValue);
            // 予約本体のstatusもチェック（念のため）
            if (foundReservation.status === 'canceled') {
              return c.json({ ok: false, error: 'already canceled' }, 409);
            }
          }
        }
      } catch (e) {
        // パースエラーは無視してfallbackへ
        console.warn(`Failed to parse reverse index for ${reservationId}:`, e);
      }
    }
    
    // Fallback: 逆引きが存在しない場合（古い予約）
    if (!foundReservation) {
      console.warn(`Reverse index not found for ${reservationId}, falling back to scan`);
      
      // 最近30日間をスキャン
      const today = new Date();
      const timeSlots = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
      
      for (let i = 0; i < 30; i++) {
        const scanDate = new Date(today);
        scanDate.setDate(scanDate.getDate() - i);
        const dateStr = scanDate.toISOString().split('T')[0];
        
        for (const t of timeSlots) {
          const key = `rsv:${dateStr}:${t}`;
          const value = await kv.get(key);
          if (value) {
            try {
              const reservation = JSON.parse(value);
              if (reservation.reservationId === reservationId || reservation.id === reservationId) {
                foundReservation = reservation;
                foundKey = key;
                date = reservation.date;
                time = reservation.time;
                
                // 予約本体のstatusをチェック
                if (foundReservation.status === 'canceled') {
                  return c.json({ ok: false, error: 'already canceled' }, 409);
                }
                
                // Self-heal: 逆引きを補完作成（status: "active"）
                await kv.put(reverseKey, JSON.stringify({ date, time, status: 'active' }));
                // Self-healed reverse index（ログは出力しない）
                break;
              }
            } catch (e) {
              // パースエラーは無視
            }
          }
        }
        if (foundReservation) break;
      }
    }
    
    if (!foundReservation || !date || !time) {
      return c.json({ ok: false, error: 'Reservation not found' }, 404);
    }
    
    // cancelMinutesをチェック
    const reservationDateTime = new Date(`${date}T${time}:00+09:00`);
    const now = new Date();
    const jstOffset = 9 * 60; // 分単位
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowJST = new Date(utc + (jstOffset * 60000));
    
    const diffMinutes = (reservationDateTime.getTime() - nowJST.getTime()) / (1000 * 60);
    if (diffMinutes < settings.rules.cancelMinutes) {
      return c.json({ ok: false, error: 'cancel cutoff passed' }, 409);
    }
    
    // Durable Object経由で処理（ロックキー: ${date}:${time}）
    const lockKey = `${tenantId}:${date}:${time}`;
    const id = c.env.SLOT_LOCK.idFromName(lockKey);
    const stub = c.env.SLOT_LOCK.get(id);
    
    // Durable Objectにリクエストを転送
    // Durable Objectは同一IDに対して同時に1つのリクエストしか処理しないため、
    // 自然にロックがかかり、同時削除を防ぐ
    const doRequest = new Request('http://slot-lock/cancel', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date,
        time,
      }),
    });
    
    const response = await stub.fetch(doRequest);
    const result = await response.json();
    const status = response.status;
    
    // キャンセル成功時にLINE通知を送信（非同期、エラーは無視）
    if (status === 200 && result.ok) {
      try {
        // 通知が有効で、LINE連携済みの場合のみ送信
        if (settings.integrations?.line?.connected && settings.integrations.line.notifyOnCancel !== false) {
          const message = `予約がキャンセルされました 🥲\n予約ID: ${reservationId}`;
          
          // 非同期で通知を送信（エラーは無視）
          // D1から設定を取得（なければ環境変数にフォールバック）
          getLineConfigOrNull({ DB: c.env.DB, CONFIG_ENC_KEY: c.env.CONFIG_ENC_KEY }, tenantId).then(async (config) => {
            let channelAccessToken: string | undefined;
            if (config) {
              channelAccessToken = config.channelAccessToken;
            } else {
              channelAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
            }
            const userId = settings.integrations.line.userId;
            if (channelAccessToken && userId) {
              sendLineNotification(kv, channelAccessToken, userId, message)
              .then(async () => {
                // 成功時: lastSentAt を記録
                const lastSentAtKey = `line:notify:lastSentAt:${tenantId}`;
                await kv.put(lastSentAtKey, JSON.stringify({
                  message,
                  at: Date.now(),
                }));
              })
              .catch(async (err) => {
                // エラー時: lastError を記録（秘密値はログに出力しない）
                const errorMessage = err instanceof Error ? err.message : String(err);
                // console.error は秘密値を含む可能性があるため使用しない
                const lastErrorKey = `line:notify:lastError:${tenantId}`;
                await kv.put(lastErrorKey, JSON.stringify({
                  message,
                  error: errorMessage,
                  at: Date.now(),
                }));
              });
            }
          }).catch(() => {
            // エラーは無視
          });
        }
      } catch (err) {
        // 通知送信失敗は無視（キャンセルは成功しているため）
        // console.error は秘密値を含む可能性があるため使用しない
      }
    }
    
    return c.json(result, status);
  } catch (error) {
    return c.json({ ok: false, error: 'invalid request' }, 400);
  }
});

// POST /admin/settings/test-slack




app.post('/admin/settings/test-slack', async (c) => {
  try {
    const body = await c.req.json();
    const { webhookUrl } = body;
    
    const kv = c.env.SAAS_FACTORY;
    
    // webhookUrlが指定されていない場合は設定から取得
    let targetWebhookUrl = webhookUrl;
    if (!targetWebhookUrl) {
      const settingsValue = await kv.get('settings:default');
      const settings: AdminSettings = settingsValue
        ? mergeSettings(DEFAULT_ADMIN_SETTINGS, JSON.parse(settingsValue))
        : DEFAULT_ADMIN_SETTINGS;
      targetWebhookUrl = settings.notifications.slackWebhookUrl;
    }
    
    if (!targetWebhookUrl || targetWebhookUrl.trim() === '') {
      return c.json({ ok: false, error: 'webhookUrl is required' }, 400);
    }
    
    // Slack Webhook URLの形式チェック
    if (!targetWebhookUrl.startsWith('https://hooks.slack.com/services/')) {
      return c.json({ ok: false, error: 'invalid webhook URL format' }, 400);
    }
    
    // Slackにテストメッセージを送信
    const slackResponse = await fetch(targetWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Lumiere Admin テスト通知: 設定が正常に動作しています ✅',
      }),
    });
    
    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      return c.json({
        ok: false,
        error: `Slack API error: ${slackResponse.status} ${errorText}`,
      }, 500);
    }
    
    return c.json({ ok: true });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to send test notification',
    }, 500);
  }
});

// 404 ハンドラー




app.notFound((c) => {
  return c.json({
    ok: false,
    error: 'Not Found',
  }, 404);
});

// LINE設定管理エンドポイント（D1暗号化保存）
// GET /admin/line/config




app.get('/admin/line/config', async (c) => {
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const masterKey = c.env.CONFIG_ENC_KEY;

    if (!masterKey) {
      return c.json({
        ok: false,
        error: 'CONFIG_ENC_KEY is not configured',
      }, 500);
    }

    const configured = await hasLineConfig(db, tenantId);
    let masked = null;

    if (configured) {
      const config = await getLineConfig(db, tenantId, masterKey);
      masked = getMaskedConfig(config);
    } else {
      masked = getMaskedConfig(null);
    }

    return c.json({
      ok: true,
      configured,
      masked,
    });
  

// alias: integrations API compatibility
app.get('/admin/integrations/line/masked', async (c) => {
  // /admin/line/config と同じレスポンスを返す
  // （フロントが integrations/* を叩く想定の救済）
  return await (async () => {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const masterKey = c.env.CONFIG_ENC_KEY;

    if (!masterKey) {
      return c.json({ ok: false, error: 'CONFIG_ENC_KEY is not configured' }, 500);
    }

    const configured = await hasLineConfig(db, tenantId);
    const masked = configured
      ? getMaskedConfig(await getLineConfig(db, tenantId, masterKey))
      : getMaskedConfig(null);

    return c.json({ ok: true, configured, masked });
  })();
});} catch (err) {
    return c.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to get LINE config',
    }, 500);
  }
});

// GET /admin/line/client-id




app.get('/admin/line/client-id', async (c) => {
  try {
    const tenantId = getTenantId(c);
    
    // D1から設定を取得（なければ環境変数にフォールバック）
    let clientId: string | undefined;
    const config = await getLineConfigOrNull({ DB: c.env.DB, CONFIG_ENC_KEY: c.env.CONFIG_ENC_KEY }, tenantId);
    if (config) {
      clientId = config.clientId;
    } else {
      // 後方互換性: 環境変数から取得
      clientId = c.env.LINE_CLIENT_ID;
    }

    if (!clientId) {
      return c.json({ ok: false, error: 'LINE_CLIENT_ID is not configured' }, 400);
    }

    return c.json({ ok: true, clientId });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'Failed to get client ID' }, 500);
  }
});

// PUT /admin/line/config




app.put('/admin/line/config', async (c) => {
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const masterKey = c.env.CONFIG_ENC_KEY;

    if (!masterKey) {
      return c.json({
        ok: false,
        error: 'CONFIG_ENC_KEY is not configured',
      }, 500);
    }

    // TODO: RBACチェック（Owner/Adminのみ）
    const actorUserId = 'admin'; // 暫定

    const body = await c.req.json<{
      clientId: string;
      channelAccessToken: string;
      channelSecret: string;
    }>();

    // バリデーション
    if (!body.clientId || !body.channelAccessToken || !body.channelSecret) {
      return c.json({
        ok: false,
        error: 'clientId, channelAccessToken, and channelSecret are required',
      }, 400);
    }

    if (!/^\d+$/.test(body.clientId)) {
      return c.json({
        ok: false,
        error: 'clientId must be numeric',
      }, 400);
    }

    if (body.channelAccessToken.length < 10) {
      return c.json({
        ok: false,
        error: 'channelAccessToken is too short',
      }, 400);
    }

    if (body.channelSecret.length < 10) {
      return c.json({
        ok: false,
        error: 'channelSecret is too short',
      }, 400);
    }

    const config: LineConfigPlain = {
      clientId: body.clientId,
      channelAccessToken: body.channelAccessToken,
      channelSecret: body.channelSecret,
    };

    const wasConfigured = await hasLineConfig(db, tenantId);
    await saveLineConfig(db, tenantId, config, actorUserId, masterKey);
    await logAudit(
      db,
      tenantId,
      actorUserId,
      wasConfigured ? 'line_config_updated' : 'line_config_created',
      { clientIdLast4: body.clientId.slice(-4) }
    );

    const masked = getMaskedConfig(config);

    return c.json({
      ok: true,
      configured: true,
      masked,
    });
  } catch (err) {
    return c.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save LINE config',
    }, 500);
  }
});

// DELETE /admin/line/config




app.delete('/admin/line/config', async (c) => {
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // TODO: RBACチェック（Owner/Adminのみ）
    const actorUserId = 'admin'; // 暫定

    const wasConfigured = await hasLineConfig(db, tenantId);
    if (!wasConfigured) {
      return c.json({
        ok: false,
        error: 'LINE config not found',
      }, 404);
    }

    await deleteLineConfig(db, tenantId);
    await logAudit(db, tenantId, actorUserId, 'line_config_deleted');

    return c.json({
      ok: true,
      configured: false,
      masked: getMaskedConfig(null),
    });
  } catch (err) {
    return c.json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to delete LINE config',
    }, 500);
  }
});

// LINE連携エンドポイント
  // GET /admin/integrations/line/auth-url
  // LINE連携エンドポイント: LINEログイン開始用の認可URLを返す
app.get('/admin/integrations/line/auth-url', async (c) => {
  try {
    const tenantId = getTenantId(c);

    // D1から設定を取得（なければ環境変数にフォールバック）
    let clientId: string | undefined;
    const config = await getLineConfigOrNull(
      { DB: c.env.DB, CONFIG_ENC_KEY: c.env.CONFIG_ENC_KEY },
      tenantId,
    );

    if (config) {
      clientId = config.clientId;
    } else {
      clientId = c.env.LINE_CLIENT_ID;
    }

    if (!clientId) {
      return c.json({ ok: false, error: 'LINE_CLIENT_ID is not configured' }, 500);
    }

    // Redirect Base URL を取得（環境変数があればそれを使用、なければリクエストから生成）
    let redirectBase: string;
    if (c.env.LINE_LOGIN_REDIRECT_BASE) {
      redirectBase = c.env.LINE_LOGIN_REDIRECT_BASE.replace(/\/$/, '');
    } else {
      const url = new URL(c.req.url);
      redirectBase = `${url.protocol}//${url.host}`;
    }

    // callback 先は Pages/Workers 側の callback と整合させる（基本は /auth/line/callback）
    let redirectUri = `${redirectBase}/auth/line/callback`;

    // ✅ FORCE redirect_uri (envがあれば最優先)
    const forcedRedirectUri = (c.env.LINE_REDIRECT_URI || '').trim();
    if (forcedRedirectUri) {
      redirectUri = forcedRedirectUri;
    }

    // state = tenantId:nonce を生成して KV に保存（CSRF 対策）
    const nonce = crypto.randomUUID();
    const state = `${tenantId}:${nonce}`;

    const kv = c.env.SAAS_FACTORY;
    await kv.put(
      `line:state:${nonce}`,
      JSON.stringify({ tenantId, createdAt: Date.now() }),
      { expirationTtl: 600 },
    );

    // LINE 認可URLを生成
    const authUrl = buildLineAuthUrl(clientId, redirectUri, state);
    return c.json({ ok: true, url: authUrl });
  } catch (error) {
    return c.json({ ok: false, error: 'internal_error', message: String(error) }, 500);
  }
});

app.get("/admin/integrations/line/callback", async (c:any) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  // ✅ test bypass: allow redirect without token exchange (debug=redir or code=DUMMY)
  const dbg = url.searchParams.get("debug") || "";
  if (dbg === "redir" || code === "DUMMY") {
    const cookies = c.req.header("cookie") || "";
    const m = /sf_returnTo=([^;]+)/.exec(cookies);
    const rtRaw = m ? decodeURIComponent(m[1]) : "/admin/settings";

    // allow only relative path
    const rt = (rtRaw && rtRaw.startsWith("/")) ? rtRaw : "/admin/settings";

    const webBase = String((c.env?.WEB_BASE || c.env?.APP_BASE || "")).replace(/\/$/, "");
const loc = webBase ? `${webBase}${rt}` : rt; // env無ければ相対パスでOK
return new Response(null, { status: 302, headers: { Location: loc } });
  }
if(!code){
    return c.json({ ok:false, error:"missing_code", state }, 400);
  }
  // TODO: exchange token + persist per tenant/state
  return c.json({ ok:true, route:"/admin/integrations/line/callback", codePresent:true, state, at:new Date().toISOString() }, 200);
});
  // GET /admin/integrations/line/status
  app.get('/admin/integrations/line/status', async (c) => {
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;

    // line_credentials に1行でもあれば “configured” 扱い（Messaging API 設定済み）
    const row = await db
      .prepare("SELECT tenant_id, updated_at FROM line_credentials WHERE tenant_id = ? LIMIT 1")
      .bind(tenantId)
      .first();

    const messagingConfigured = !!row;

    return c.json({
      ok: true,
      tenantId,
      kind: messagingConfigured ? "configured" : "unconfigured",
      messagingConfigured,
      messagingUpdatedAt: row?.updated_at ?? null,
    });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "status_failed" }, 500);
  }
});


type Env = {
  ENVIRONMENT?: string;
  VERSION?: string;
  SAAS_FACTORY: KVNamespace;
  SLOT_LOCK: DurableObjectNamespace<SlotLockDO>;
  DB: D1Database;
  CONFIG_ENC_KEY?: string; // 暗号化マスターキー（base64 32byte）
  LINE_CLIENT_ID?: string; // LINE Login Client ID
  LINE_LOGIN_CHANNEL_ID?: string; // LINE Login Channel ID
  LINE_LOGIN_CHANNEL_SECRET?: string; // LINE Login Channel Secret
  LINE_LOGIN_REDIRECT_BASE?: string; // LINE Login Redirect Base URL (例: http://localhost:3000)
  LINE_REDIRECT_URI?: string; // LINE OAuth Redirect URI (例: http://localhost:3000/admin/integrations/line/callback)
  LINE_CHANNEL_ACCESS_TOKEN?: string; // 後方互換性のため残す（D1移行後は削除予定）
  LINE_CHANNEL_SECRET?: string; // 後方互換性のため残す（D1移行後は削除予定）
  WEB_BASE_URL?: string; // 例: http://localhost:3000
};












/** =========================
 * LINE OAuth (Workers side)
 * PagesはUI専念にするため、OAuthは全部こっちへ集約
 * ========================= */




app.get("/auth/line/start", async (c: any) => {
  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get("tenantId") || "default";
  const returnTo = url.searchParams.get("returnTo") || "https://saas-factory-a0y.pages.dev/admin";
  const state = `${tenantId}.${Math.random().toString(36).slice(2)}`;
const LINE_CHANNEL_ID = c.env.LINE_LOGIN_CHANNEL_ID || c.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = c.env.LINE_LOGIN_CHANNEL_SECRET || c.env.LINE_CHANNEL_SECRET;
  const LINE_REDIRECT_URI = c.env.LINE_REDIRECT_URI; // 例: https://saas-factory-api....workers.dev/auth/line/callback

  if(!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET || !LINE_REDIRECT_URI){
    return c.json({ ok:false, error:"missing_line_env", env:{
      LINE_CHANNEL_ID:!!LINE_CHANNEL_ID,
      LINE_CHANNEL_SECRET:!!LINE_CHANNEL_SECRET,
      LINE_REDIRECT_URI:!!LINE_REDIRECT_URI
    }}, 500);
  }

  // TODO: state/returnTo を保存（D1/KV/DO）したいならここで保存
  // まずは導線確認のため、returnTo を state に埋めず cookie に置く（暫定）
  const auth = new URL("https://access.line.me/oauth2/v2.1/authorize");
  auth.searchParams.set("response_type","code");
  auth.searchParams.set("client_id", LINE_CHANNEL_ID);
  auth.searchParams.set("redirect_uri", LINE_REDIRECT_URI);
  auth.searchParams.set("state", state);
  auth.searchParams.set("scope", "profile openid");
  auth.searchParams.set("prompt","consent");

  const res = new Response(null, { status: 302, headers: { Location: auth.toString() } });
  res.headers.append("Set-Cookie", `sf_returnTo=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  res.headers.append("Set-Cookie", `sf_tenantId=${encodeURIComponent(tenantId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  return res;
});
app.get("/auth/line/callback", async (c: any) => {
  const url = new URL(c.req.url);
  const WEB_BASE = (c.env.WEB_BASE || "").replace(/\/+$/, "") || "https://saas-factory-web-v2.pages.dev";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
const LINE_CHANNEL_ID = c.env.LINE_LOGIN_CHANNEL_ID || c.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = c.env.LINE_LOGIN_CHANNEL_SECRET || c.env.LINE_CHANNEL_SECRET;
  const LINE_REDIRECT_URI = c.env.LINE_REDIRECT_URI;
  // DEBUG: inspect redirect_uri used for token exchange (no network call)
  try {
    const u = new URL(c.req.url);
    if (u.searchParams.get("debug") === "1") {
      return c.json({
        ok: true,
        debug: true,
        route: "/auth/line/callback",
        requestUrl: u.toString(),
        origin: u.origin,
        redirect_uri_used: LINE_REDIRECT_URI,
        note: "LINE token exchange requires redirect_uri to EXACTLY match authorize redirect_uri",
        at: new Date().toISOString(),
      }, 200);
    }
      if (u.searchParams.get("debug") === "2") {
      return c.json({
        ok: true,
        debug: true,
        level: 2,
        route: "/auth/line/callback",
        requestUrl: u.toString(),
        code_present: !!u.searchParams.get("code"),
        state: u.searchParams.get("state"),
        redirect_uri_used: LINE_REDIRECT_URI,
        hint: "If code_present is false, you opened callback without completing LINE consent. If invalid_grant persists with fresh code, verify channel secret/id + token endpoint params.",
        at: new Date().toISOString(),
      }, 200);
    }
    if (u.searchParams.get("debug") === "3") {
      const code = u.searchParams.get("code");
      const state = u.searchParams.get("state");

      // NOTE: do NOT reveal secrets; only lengths / booleans
      return c.json({
        ok: true,
        debug: true,
        level: 3,
        route: "/auth/line/callback",
        requestUrl: u.toString(),
        code_present: !!code,
        state,
        redirect_uri_used: LINE_REDIRECT_URI,
        client_id: LINE_CHANNEL_ID,
        client_secret_present: !!LINE_CHANNEL_SECRET,
        client_secret_len: LINE_CHANNEL_SECRET ? String(LINE_CHANNEL_SECRET).length : 0,
        // If you also have LINE_LOGIN_* vars, reveal which one is used
        line_login_channel_id_present: !!(c.env.LINE_LOGIN_CHANNEL_ID),
        line_login_channel_secret_present: !!(c.env.LINE_LOGIN_CHANNEL_SECRET),
        line_login_channel_secret_len: c.env.LINE_LOGIN_CHANNEL_SECRET ? String(c.env.LINE_LOGIN_CHANNEL_SECRET).length : 0,
        note: "If invalid_grant persists with fresh code and matching redirect_uri, mismatch is usually client_id/client_secret (wrong channel) or code already used/expired.",
        at: new Date().toISOString(),
      }, 200);
    }
} catch (e: any) {
    // ignore debug failures
  }
  // ✅ test bypass: allow redirect without token exchange (debug=redir or code=DUMMY)
  const dbg = url.searchParams.get("debug") || "";
  if (dbg === "redir" || code === "DUMMY") {
    const cookies = c.req.header("cookie") || "";
    const m = /sf_returnTo=([^;]+)/.exec(cookies);
    const rtRaw = m ? decodeURIComponent(m[1]) : "/admin/settings";

    // allow only relative path
    const rt = (rtRaw && rtRaw.startsWith("/")) ? rtRaw : "/admin/settings";

    const webBase = String((c.env?.WEB_BASE || c.env?.APP_BASE || "")).replace(/\/$/, "");
const loc = webBase ? `${webBase}${rt}` : rt; // env無ければ相対パスでOK
return new Response(null, { status: 302, headers: { Location: loc } });
  }
if(!code){
    return c.json({ ok:false, error:"missing_code", href:url.toString() }, 400);
  }
  if(!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET || !LINE_REDIRECT_URI){
    return c.json({ ok:false, error:"missing_line_env" }, 500);
  }

  // トークン交換
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:"authorization_code",
      code,
      redirect_uri: LINE_REDIRECT_URI,
      client_id: LINE_CHANNEL_ID,
      client_secret: LINE_CHANNEL_SECRET,
    })
  });

  const tokenJson = await tokenRes.json().catch(()=>null);

  if(!tokenRes.ok){
    return c.json({ ok:false, error:"token_exchange_failed", status:tokenRes.status, body:tokenJson }, 500);
  }

  // TODO: tokenJson を D1/KV/DO に保存して「ログインセッション」作る  // TODO: tokenJson を D1/KV/DO に保存して「ログインセッション」作る
  // まずは導線確認で returnTo へ戻す
  const cookies = c.req.header("cookie") || "";
  const m = /sf_returnTo=([^;]+)/.exec(cookies);
  const returnTo = m ? decodeURIComponent(m[1]) : "https://saas-factory-a0y.pages.dev/admin";

  return new Response(null, { status: 302, headers: { Location: returnTo } });
});

// /** (disabled)
//  * POST /admin/integrations/line/save
//  * body: { tenantId, channelId/clientId/LINE_CHANNEL_ID, channelAccessToken, channelSecret }
// * / (removed)
app.post("/admin/integrations/line/save", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  const tenantId = body?.tenantId ?? "default";

  // UI互換: channelId/clientId/LINE_CHANNEL_ID のどれでもOK
  const clientId =
    body?.channelId ??
    body?.clientId ??
    body?.LINE_CHANNEL_ID ??
    null;

  // UI互換: channelAccessToken / LINE_CHANNEL_ACCESS_TOKEN
  const channelAccessToken =
    body?.channelAccessToken ??
    body?.LINE_CHANNEL_ACCESS_TOKEN ??
    null;

  // UI互換: channelSecret / LINE_CHANNEL_SECRET
  const channelSecret =
    body?.channelSecret ??
    body?.LINE_CHANNEL_SECRET ??
    null;

  if (!clientId || !channelAccessToken || !channelSecret) {
    return c.json({ ok: false, error: "missing_id_token_or_secret" }, 400);
  }

  const keyB64 = (c.env as any).LINE_CRED_KEY_B64;
  if (!keyB64) return c.json({ ok: false, error: "missing_env_LINE_CRED_KEY_B64" }, 500);

  const db = c.env.DB;
  if (!db) return c.json({ ok: false, error: "missing_d1_binding_DB" }, 500);

  const key = await importAesKeyFromB64(keyB64);
  const accessEnc = await aesGcmEncrypt(key, String(channelAccessToken));
  const secretEnc = await aesGcmEncrypt(key, String(channelSecret));
  const now = new Date().toISOString();

  try {
    await db.prepare(
      "INSERT INTO line_credentials (tenant_id, access_token_enc, channel_secret_enc, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(tenant_id) DO UPDATE SET access_token_enc=excluded.access_token_enc, channel_secret_enc=excluded.channel_secret_enc, updated_at=excluded.updated_at"
    ).bind(tenantId, accessEnc, secretEnc, now).run();
  } catch (e: any) {
    return c.json({ ok: false, error: "save_failed", detail: String(e?.message ?? e) }, 500);
  }

  return c.json({ ok: true, tenantId, clientIdLast4: String(clientId).slice(-4), updated_at: now });
});
// * / (removed)
// * / (removed)
// ✅ Module Worker entry (required for Durable Objects)





app.get("/__debug/tenant", (c) => {
  const qTenantId = c.req.query("tenantId") ?? null;
  const hTenantId = c.req.header("X-Tenant-ID") ?? null;
  const tenantId = getTenantId(c);
  return c.json({ ok: true, tenantId, qTenantId, hTenantId });
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env as any, ctx as any);
  },
};
























