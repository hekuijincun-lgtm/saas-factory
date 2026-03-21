/**
 * Pet Profile Management routes — /admin/pets/*, /pet/profile/:petId
 *
 * CRUD for pet profiles, vaccine records, and grooming history.
 * Auth: tenantId + RBAC (admin role) for admin routes;
 *       public read for /pet/profile/:petId.
 */
import type { Hono } from "hono";
import { getTenantId, checkTenantMismatch, requireRole } from '../helpers';

// =============================================================================
// Pet Profile Management
// =============================================================================

interface VaccineRecord {
  id: string;
  name: string;
  date: string;
  expiresAt?: string;
  vetClinic?: string;
}

interface GroomingNote {
  id: string;
  date: string;
  reservationId?: string;
  course: string;
  cutStyle?: string;
  beforeUrl?: string;
  afterUrl?: string;
  notes?: string;
  weight?: number;
  staffName?: string;
}

interface PetProfile {
  id: string;
  customerKey: string;
  ownerName?: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  size?: 'small' | 'medium' | 'large';
  age?: string;
  weight?: number;
  color?: string;
  gender?: 'male' | 'female' | 'unknown';
  allergies?: string;
  notes?: string;
  photoUrl?: string;
  vaccinations: VaccineRecord[];
  groomingHistory: GroomingNote[];
  createdAt: string;
  updatedAt: string;
}

export function registerPetRoutes(app: Hono<{ Bindings: Record<string, unknown> }>) {

app.get("/admin/pets/expiring-vaccines", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const daysParam = c.req.query("days") || "30";
  const days = parseInt(daysParam, 10) || 30;

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const nowStr = now.toISOString().slice(0, 10);

  const alerts: { pet: PetProfile; vaccine: VaccineRecord }[] = [];
  for (const pet of pets) {
    for (const v of pet.vaccinations || []) {
      if (v.expiresAt && v.expiresAt <= cutoffStr) {
        alerts.push({ pet, vaccine: v });
      }
    }
  }

  return c.json({ ok: true, tenantId, alerts });
});

// GET /pet/profile/:petId?tenantId= — public pet grooming history (shared with owners)
app.get("/pet/profile/:petId", async (c) => {
  const tenantId = (c.req.query("tenantId") || "default").trim();
  const petId = c.req.param("petId");
  const kv = c.env.SAAS_FACTORY;
  const key = `pet:profiles:${tenantId}`;
  const raw = await kv.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];
  const pet = pets.find((p) => p.id === petId);
  if (!pet) return c.json({ ok: false, error: "not_found" }, 404);

  // Return only safe fields (no internal keys)
  const { customerKey, ...safePet } = pet;
  return c.json({ ok: true, tenantId, data: safePet });
});

app.get("/admin/pets", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const customerKey = c.req.query("customerKey");

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  let pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  if (customerKey) {
    pets = pets.filter((p) => p.customerKey === customerKey);
  }

  // Compute lastGroomingDate from groomingHistory for each pet
  const enriched = pets.map((p) => {
    const dates = (p.groomingHistory || []).map((g) => g.date).filter(Boolean).sort();
    const lastGroomingDate = dates.length > 0 ? dates[dates.length - 1] : undefined;
    return { ...p, lastGroomingDate };
  });

  return c.json({ ok: true, tenantId, pets: enriched });
});

// GET /admin/pets/:petId - get single pet
app.get("/admin/pets/:petId", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const pet = pets.find((p) => p.id === petId);
  if (!pet) return c.json({ ok: false, error: "pet_not_found" }, 404);

  return c.json({ ok: true, tenantId, pet });
});

// POST /admin/pets - create new pet
app.post("/admin/pets", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);

  const body = await c.req.json();
  if (!body.name || !body.species) {
    return c.json({ ok: false, error: "name and species are required" }, 400);
  }

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const now = new Date().toISOString();
  const pet: PetProfile = {
    id: `pet_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    customerKey: body.customerKey || "",
    ownerName: body.ownerName,
    name: body.name,
    species: body.species,
    breed: body.breed,
    size: body.size,
    age: body.age,
    weight: body.weight,
    color: body.color,
    gender: body.gender,
    allergies: body.allergies,
    notes: body.notes,
    photoUrl: body.photoUrl,
    vaccinations: [],
    groomingHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  pets.push(pet);
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(pets));

  return c.json({ ok: true, tenantId, pet });
});

// PATCH /admin/pets/:petId - update pet
app.patch("/admin/pets/:petId", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");

  const body = await c.req.json();

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const idx = pets.findIndex((p) => p.id === petId);
  if (idx < 0) return c.json({ ok: false, error: "pet_not_found" }, 404);

  const { id: _id, vaccinations: _v, groomingHistory: _g, createdAt: _ca, ...updatable } = body;
  const updated: PetProfile = {
    ...pets[idx],
    ...updatable,
    id: petId,
    vaccinations: pets[idx].vaccinations,
    groomingHistory: pets[idx].groomingHistory,
    createdAt: pets[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };

  pets[idx] = updated;
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(pets));

  return c.json({ ok: true, tenantId, pet: updated });
});

// DELETE /admin/pets/:petId - delete pet
app.delete("/admin/pets/:petId", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const next = pets.filter((p) => p.id !== petId);
  if (next.length === pets.length) return c.json({ ok: false, error: "pet_not_found" }, 404);

  await c.env.SAAS_FACTORY.put(key, JSON.stringify(next));

  return c.json({ ok: true, tenantId });
});

// POST /admin/pets/:petId/vaccine - add vaccine record
app.post("/admin/pets/:petId/vaccine", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");

  const body = await c.req.json();
  if (!body.name || !body.date) {
    return c.json({ ok: false, error: "name and date are required" }, 400);
  }

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const idx = pets.findIndex((p) => p.id === petId);
  if (idx < 0) return c.json({ ok: false, error: "pet_not_found" }, 404);

  const vaccine: VaccineRecord = {
    id: `vac_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: body.name,
    date: body.date,
    expiresAt: body.expiresAt,
    vetClinic: body.vetClinic,
  };

  pets[idx].vaccinations = [...(pets[idx].vaccinations || []), vaccine];
  pets[idx].updatedAt = new Date().toISOString();
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(pets));

  return c.json({ ok: true, tenantId, vaccine });
});

// DELETE /admin/pets/:petId/vaccine/:vaccineId - remove vaccine record
app.delete("/admin/pets/:petId/vaccine/:vaccineId", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");
  const vaccineId = c.req.param("vaccineId");

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const idx = pets.findIndex((p) => p.id === petId);
  if (idx < 0) return c.json({ ok: false, error: "pet_not_found" }, 404);

  const before = pets[idx].vaccinations?.length || 0;
  pets[idx].vaccinations = (pets[idx].vaccinations || []).filter((v) => v.id !== vaccineId);
  if (pets[idx].vaccinations.length === before) {
    return c.json({ ok: false, error: "vaccine_not_found" }, 404);
  }

  pets[idx].updatedAt = new Date().toISOString();
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(pets));

  return c.json({ ok: true, tenantId });
});

// POST /admin/pets/:petId/grooming - add grooming history entry
app.post("/admin/pets/:petId/grooming", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");

  const body = await c.req.json();
  if (!body.date || !body.course) {
    return c.json({ ok: false, error: "date and course are required" }, 400);
  }

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const idx = pets.findIndex((p) => p.id === petId);
  if (idx < 0) return c.json({ ok: false, error: "pet_not_found" }, 404);

  const note: GroomingNote = {
    id: `groom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    date: body.date,
    reservationId: body.reservationId,
    course: body.course,
    cutStyle: body.cutStyle,
    beforeUrl: body.beforeUrl,
    afterUrl: body.afterUrl,
    notes: body.notes,
    weight: body.weight,
    staffName: body.staffName,
  };

  pets[idx].groomingHistory = [...(pets[idx].groomingHistory || []), note];
  pets[idx].updatedAt = new Date().toISOString();
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(pets));

  return c.json({ ok: true, tenantId, note });
});

// DELETE /admin/pets/:petId/grooming/:groomingId - remove grooming record
app.delete("/admin/pets/:petId/grooming/:groomingId", async (c) => {
  const mismatch = checkTenantMismatch(c); if (mismatch) return mismatch;
  const rbac = await requireRole(c, 'admin'); if (rbac) return rbac;
  const tenantId = getTenantId(c);
  const petId = c.req.param("petId");
  const groomingId = c.req.param("groomingId");

  const key = `pet:profiles:${tenantId}`;
  const raw = await c.env.SAAS_FACTORY.get(key);
  const pets: PetProfile[] = raw ? JSON.parse(raw) : [];

  const idx = pets.findIndex((p) => p.id === petId);
  if (idx < 0) return c.json({ ok: false, error: "pet_not_found" }, 404);

  const before = pets[idx].groomingHistory?.length || 0;
  pets[idx].groomingHistory = (pets[idx].groomingHistory || []).filter((g) => g.id !== groomingId);
  if (pets[idx].groomingHistory.length === before) {
    return c.json({ ok: false, error: "grooming_not_found" }, 404);
  }

  pets[idx].updatedAt = new Date().toISOString();
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(pets));

  return c.json({ ok: true, tenantId });
});

}
