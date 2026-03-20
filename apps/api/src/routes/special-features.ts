import { getTenantId, checkTenantMismatch, requireRole } from '../helpers';

const VALID_FEATURES = [
  'visitSummary',
  'colorFormula',
  'vaccineRecord',
  'allergyRecord',
  'equipmentCheck',
  'beforeAfterPhoto',
] as const;

type FeatureName = (typeof VALID_FEATURES)[number];

function isValidFeature(f: string): f is FeatureName {
  return (VALID_FEATURES as readonly string[]).includes(f);
}

function kvKey(feature: string, tenantId: string): string {
  return `sf:${feature}:${tenantId}`;
}

function generateId(): string {
  return `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function registerSpecialFeatureRoutes(app: any) {

  // ========================= Before-After Image Upload =========================

  // POST /admin/special-features/before-after/upload?tenantId=&kind=before|after
  // multipart/form-data  field: file (image/*), 3MB limit
  app.post('/admin/special-features/before-after/upload', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const rbac = await requireRole(c, 'admin');
    if (rbac) return rbac;

    try {
      const tenantId = getTenantId(c);
      const kind = c.req.query('kind');
      if (kind !== 'before' && kind !== 'after') {
        return c.json({ ok: false, error: 'invalid_kind', message: 'kind must be "before" or "after"' }, 400);
      }

      const r2 = (c.env as any).MENU_IMAGES;
      if (!r2) return c.json({ ok: false, error: 'R2_not_bound' }, 500);

      const formData = await c.req.formData().catch(() => null);
      if (!formData) return c.json({ ok: false, error: 'invalid_form_data' }, 400);

      const file = formData.get('file') as File | null;
      if (!file) return c.json({ ok: false, error: 'missing_file_field' }, 400);

      if (file.size > 3 * 1024 * 1024) {
        return c.json({ ok: false, error: 'file_too_large', maxBytes: 3145728 }, 413);
      }

      const contentType = file.type || 'application/octet-stream';
      if (!contentType.startsWith('image/')) {
        return c.json({ ok: false, error: 'invalid_file_type', got: contentType }, 400);
      }

      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const rand = Math.random().toString(36).slice(2, 9);
      const imageKey = `before-after/${tenantId}/${Date.now()}-${rand}.${kind}.${ext}`;

      const buf = await file.arrayBuffer();
      await r2.put(imageKey, buf, { httpMetadata: { contentType } });

      const reqUrl = new URL(c.req.url);
      const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
      const imageUrl = `${apiBase}/media/before-after/${imageKey}`;

      return c.json({ ok: true, imageKey, imageUrl });
    } catch (err: any) {
      return c.json({ ok: false, error: 'upload_failed', message: String(err?.message ?? err) }, 500);
    }
  });

  // GET /media/before-after/* — serve before-after images from R2
  app.get('/media/before-after/*', async (c: any) => {
    try {
      const r2 = (c.env as any).MENU_IMAGES;
      if (!r2) return new Response('R2 not configured', { status: 503 });

      const url = new URL(c.req.url);
      const imageKey = decodeURIComponent(url.pathname.replace(/^\/media\/before-after\//, ''));
      if (!imageKey) return new Response('Not Found', { status: 404 });

      const obj = await r2.get(imageKey);
      if (!obj) return new Response('Not Found', { status: 404 });

      const headers = new Headers();
      headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (obj.etag) headers.set('ETag', `"${obj.etag}"`);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(obj.body, { status: 200, headers });
    } catch (err: any) {
      return new Response('Server Error', { status: 500 });
    }
  });

  // GET /admin/special-features/:feature — list all records for tenant
  app.get('/admin/special-features/:feature', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const roleErr = await requireRole(c, 'admin');
    if (roleErr) return roleErr;

    const feature = c.req.param('feature');
    if (!isValidFeature(feature)) {
      return c.json({ ok: false, error: 'invalid_feature', valid: VALID_FEATURES }, 400);
    }

    try {
      const tenantId = getTenantId(c);
      const kv = (c.env as any).SAAS_FACTORY as KVNamespace;
      const raw = await kv.get(kvKey(feature, tenantId));
      let records: any[] = raw ? JSON.parse(raw) : [];

      // Optional filters
      const customerKey = c.req.query('customerKey');
      if (customerKey) {
        records = records.filter((r: any) => r.customerKey === customerKey);
      }

      const date = c.req.query('date');
      if (date) {
        records = records.filter((r: any) => {
          const d = r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '');
          return d === date;
        });
      }

      return c.json({ ok: true, feature, tenantId, records });
    } catch (error) {
      return c.json({ ok: false, error: 'Failed to fetch special feature records', message: String(error) }, 500);
    }
  });

  // POST /admin/special-features/:feature — create a record
  app.post('/admin/special-features/:feature', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const roleErr = await requireRole(c, 'admin');
    if (roleErr) return roleErr;

    const feature = c.req.param('feature');
    if (!isValidFeature(feature)) {
      return c.json({ ok: false, error: 'invalid_feature', valid: VALID_FEATURES }, 400);
    }

    try {
      const tenantId = getTenantId(c);
      const body = await c.req.json();
      const kv = (c.env as any).SAAS_FACTORY as KVNamespace;

      const now = new Date().toISOString();
      const record = {
        ...body,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };

      const raw = await kv.get(kvKey(feature, tenantId));
      const records: any[] = raw ? JSON.parse(raw) : [];
      records.push(record);
      await kv.put(kvKey(feature, tenantId), JSON.stringify(records));

      return c.json({ ok: true, record }, 201);
    } catch (error) {
      return c.json({ ok: false, error: 'Failed to create special feature record', message: String(error) }, 500);
    }
  });

  // PUT /admin/special-features/:feature/:id — update a record
  app.put('/admin/special-features/:feature/:id', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const roleErr = await requireRole(c, 'admin');
    if (roleErr) return roleErr;

    const feature = c.req.param('feature');
    if (!isValidFeature(feature)) {
      return c.json({ ok: false, error: 'invalid_feature', valid: VALID_FEATURES }, 400);
    }

    const id = c.req.param('id');

    try {
      const tenantId = getTenantId(c);
      const body = await c.req.json();
      const kv = (c.env as any).SAAS_FACTORY as KVNamespace;

      const raw = await kv.get(kvKey(feature, tenantId));
      const records: any[] = raw ? JSON.parse(raw) : [];
      const idx = records.findIndex((r: any) => r.id === id);

      if (idx === -1) {
        return c.json({ ok: false, error: 'not_found' }, 404);
      }

      const now = new Date().toISOString();
      records[idx] = { ...records[idx], ...body, id, updatedAt: now };
      await kv.put(kvKey(feature, tenantId), JSON.stringify(records));

      return c.json({ ok: true, record: records[idx] });
    } catch (error) {
      return c.json({ ok: false, error: 'Failed to update special feature record', message: String(error) }, 500);
    }
  });

  // DELETE /admin/special-features/:feature/:id — delete a record
  app.delete('/admin/special-features/:feature/:id', async (c: any) => {
    const mismatch = checkTenantMismatch(c);
    if (mismatch) return mismatch;
    const roleErr = await requireRole(c, 'admin');
    if (roleErr) return roleErr;

    const feature = c.req.param('feature');
    if (!isValidFeature(feature)) {
      return c.json({ ok: false, error: 'invalid_feature', valid: VALID_FEATURES }, 400);
    }

    const id = c.req.param('id');

    try {
      const tenantId = getTenantId(c);
      const kv = (c.env as any).SAAS_FACTORY as KVNamespace;

      const raw = await kv.get(kvKey(feature, tenantId));
      const records: any[] = raw ? JSON.parse(raw) : [];
      const filtered = records.filter((r: any) => r.id !== id);

      if (filtered.length === records.length) {
        return c.json({ ok: false, error: 'not_found' }, 404);
      }

      await kv.put(kvKey(feature, tenantId), JSON.stringify(filtered));

      return c.json({ ok: true });
    } catch (error) {
      return c.json({ ok: false, error: 'Failed to delete special feature record', message: String(error) }, 500);
    }
  });

}
