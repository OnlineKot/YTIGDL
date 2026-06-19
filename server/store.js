import crypto from 'node:crypto';
import { isFirebaseEnabled, getFirestore } from './firebase.js';

// ── Magazyn in-memory (fallback deweloperski) ──────────────────
const mem = {
  usage: new Map(), // uid -> { uid, email, youtube, instagram, total, licenseKey }
  ipUsage: new Map(), // ipHash -> { ipHash, total, youtube, instagram }
  licenses: new Map(), // key -> license object
  events: [], // log zdarzeń (logowania, pobrania)
};

function now() {
  return new Date().toISOString();
}

// ── USAGE (śledzenie pobrań na użytkownika) ────────────────────

export async function getUsage(uid) {
  if (isFirebaseEnabled()) {
    const doc = await getFirestore().collection('usage').doc(uid).get();
    return doc.exists ? doc.data() : null;
  }
  return mem.usage.get(uid) || null;
}

export async function ensureUsage(user) {
  const existing = await getUsage(user.uid);
  if (existing) return existing;
  const fresh = {
    uid: user.uid,
    email: user.email || null,
    youtube: 0,
    instagram: 0,
    total: 0,
    licenseKey: null,
    createdAt: now(),
  };
  if (isFirebaseEnabled()) {
    await getFirestore().collection('usage').doc(user.uid).set(fresh);
  } else {
    mem.usage.set(user.uid, fresh);
  }
  return fresh;
}

export async function incrementUsage(uid, platform) {
  const usage = (await getUsage(uid)) || (await ensureUsage({ uid }));
  usage[platform] = (usage[platform] || 0) + 1;
  usage.total = (usage.total || 0) + 1;
  usage.updatedAt = now();
  if (isFirebaseEnabled()) {
    await getFirestore().collection('usage').doc(uid).set(usage, { merge: true });
  } else {
    mem.usage.set(uid, usage);
  }
  return usage;
}

export async function attachLicenseToUser(uid, licenseKey) {
  const usage = (await getUsage(uid)) || (await ensureUsage({ uid }));
  usage.licenseKey = licenseKey;
  usage.updatedAt = now();
  if (isFirebaseEnabled()) {
    await getFirestore().collection('usage').doc(uid).set(usage, { merge: true });
  } else {
    mem.usage.set(uid, usage);
  }
  return usage;
}

// ── USAGE PER IP (limit 5 darmowych pobrań na adres IP) ────────

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 32);
}

export async function getIpUsage(ip) {
  const ipHash = hashIp(ip);
  if (isFirebaseEnabled()) {
    const doc = await getFirestore().collection('ipUsage').doc(ipHash).get();
    return doc.exists ? doc.data() : null;
  }
  return mem.ipUsage.get(ipHash) || null;
}

export async function incrementIpUsage(ip, platform) {
  const ipHash = hashIp(ip);
  const current =
    (await getIpUsage(ip)) || { ipHash, youtube: 0, instagram: 0, total: 0, createdAt: now() };
  current[platform] = (current[platform] || 0) + 1;
  current.total = (current.total || 0) + 1;
  current.updatedAt = now();
  if (isFirebaseEnabled()) {
    await getFirestore().collection('ipUsage').doc(ipHash).set(current, { merge: true });
  } else {
    mem.ipUsage.set(ipHash, current);
  }
  return current;
}

// ── LICENCJE (klucze licencyjne / GTID) ────────────────────────

export function generateLicenseKey() {
  // Format: YTIG-XXXX-XXXX-XXXX
  const seg = () =>
    crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  return `YTIG-${seg()}-${seg()}-${seg()}`;
}

export async function createLicense({ plan = 'pro', maxActivations = 1, note = '', createdBy = '' }) {
  const key = generateLicenseKey();
  const license = {
    key,
    plan,
    status: 'active', // active | revoked
    maxActivations,
    activations: [], // [{ uid, email, activatedAt }]
    note,
    createdBy,
    createdAt: now(),
  };
  if (isFirebaseEnabled()) {
    await getFirestore().collection('licenses').doc(key).set(license);
  } else {
    mem.licenses.set(key, license);
  }
  return license;
}

export async function getLicense(key) {
  if (!key) return null;
  const normalized = String(key).trim().toUpperCase();
  if (isFirebaseEnabled()) {
    const doc = await getFirestore().collection('licenses').doc(normalized).get();
    return doc.exists ? doc.data() : null;
  }
  return mem.licenses.get(normalized) || null;
}

export async function listLicenses() {
  if (isFirebaseEnabled()) {
    const snap = await getFirestore().collection('licenses').orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => d.data());
  }
  return [...mem.licenses.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function saveLicense(license) {
  if (isFirebaseEnabled()) {
    await getFirestore().collection('licenses').doc(license.key).set(license, { merge: true });
  } else {
    mem.licenses.set(license.key, license);
  }
  return license;
}

export async function setLicenseStatus(key, status) {
  const license = await getLicense(key);
  if (!license) return null;
  license.status = status;
  license.updatedAt = now();
  return saveLicense(license);
}

/**
 * Aktywuje licencję dla użytkownika. Zwraca { ok, license, reason }.
 */
export async function activateLicense(key, user) {
  const license = await getLicense(key);
  if (!license) return { ok: false, reason: 'not_found' };
  if (license.status !== 'active') return { ok: false, reason: 'revoked' };

  const already = license.activations.find((a) => a.uid === user.uid);
  if (already) return { ok: true, license };

  if (license.activations.length >= license.maxActivations) {
    return { ok: false, reason: 'limit_reached' };
  }

  license.activations.push({
    uid: user.uid,
    email: user.email || null,
    activatedAt: now(),
  });
  await saveLicense(license);
  await attachLicenseToUser(user.uid, license.key);
  return { ok: true, license };
}

/**
 * Czy użytkownik ma ważną (aktywną) licencję?
 */
export async function userHasValidLicense(uid) {
  const usage = await getUsage(uid);
  if (!usage?.licenseKey) return false;
  const license = await getLicense(usage.licenseKey);
  if (!license || license.status !== 'active') return false;
  return license.activations.some((a) => a.uid === uid);
}

// ── ZDARZENIA / ŚLEDZENIE ──────────────────────────────────────

export async function logEvent(event) {
  const record = { id: crypto.randomUUID(), at: now(), ...event };
  if (isFirebaseEnabled()) {
    await getFirestore().collection('events').doc(record.id).set(record);
  } else {
    mem.events.unshift(record);
    if (mem.events.length > 1000) mem.events.length = 1000;
  }
  return record;
}

export async function listEvents(limit = 100) {
  if (isFirebaseEnabled()) {
    const snap = await getFirestore()
      .collection('events')
      .orderBy('at', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data());
  }
  return mem.events.slice(0, limit);
}

export async function listUsers(limit = 200) {
  if (isFirebaseEnabled()) {
    const snap = await getFirestore().collection('usage').limit(limit).get();
    return snap.docs.map((d) => d.data());
  }
  return [...mem.usage.values()].slice(0, limit);
}
