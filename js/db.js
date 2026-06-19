// Warstwa danych na Firestore (klient-side). Zastępuje backend Node na GitHub Pages.
import {
  doc, getDoc, setDoc, updateDoc,
  collection, getDocs, query, orderBy, limit as qLimit,
  arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { FREE_DOWNLOAD_LIMIT, ADMIN_PIN } from './config.js';

// Weryfikacja PIN-u admina.
// 1) Pasuje, jeśli równy zmiennej ADMIN_PIN z config.js (wyraźna zmienna — działa od razu).
// 2) Albo jeśli istnieje dokument adminPins/<pin> w Firestore (możesz dodawać kolejne w konsoli).
export async function verifyPin(pin) {
  const clean = String(pin || '').trim();
  if (!clean) return false;
  if (ADMIN_PIN && clean === String(ADMIN_PIN)) return true;
  try {
    const snap = await getDoc(doc(db, 'adminPins', clean));
    return snap.exists();
  } catch {
    return false;
  }
}

// ── Adres IP klienta (do limitu per IP) ────────────────────
let cachedIpHash = null;
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function getIpHash() {
  if (cachedIpHash) return cachedIpHash;
  let ip = 'unknown';
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    ip = (await res.json()).ip || 'unknown';
  } catch { /* offline / zablokowane */ }
  cachedIpHash = (await sha256(ip)).slice(0, 32);
  return cachedIpHash;
}

// Dzisiejsza data (YYYY-MM-DD) — limity resetują się co dobę.
function today() { return new Date().toISOString().slice(0, 10); }
function dailyCountOf(d) { return d && d.dailyDate === today() ? (d.dailyCount || 0) : 0; }

// ── DEVICE LOCK (identyfikator urządzenia + limit dzienny) ──
function getDeviceId() {
  let id = null;
  try { id = localStorage.getItem('ytigdl_device'); } catch {}
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem('ytigdl_device', id); } catch {}
  }
  return id;
}

export async function getDeviceDaily() {
  const id = getDeviceId();
  const snap = await getDoc(doc(db, 'deviceUsage', id));
  return dailyCountOf(snap.exists() ? snap.data() : null);
}

export async function incrementDeviceDaily(platform) {
  const id = getDeviceId();
  const ref = doc(db, 'deviceUsage', id);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const count = d.dailyDate === today() ? (d.dailyCount || 0) + 1 : 1;
  await setDoc(ref, {
    deviceId: id, dailyDate: today(), dailyCount: count,
    [platform]: (d[platform] || 0) + 1, total: (d.total || 0) + 1,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── USAGE (na konto) ───────────────────────────────────────
export async function getUsage(uid) {
  const snap = await getDoc(doc(db, 'usage', uid));
  return snap.exists() ? snap.data() : null;
}

export async function ensureUsage(user) {
  const ref = doc(db, 'usage', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const fresh = {
    uid: user.uid, email: user.email || null,
    youtube: 0, instagram: 0, total: 0, licenseKey: null,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, fresh);
  return fresh;
}

export async function incrementUsage(uid, platform) {
  const ref = doc(db, 'usage', uid);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const count = d.dailyDate === today() ? (d.dailyCount || 0) + 1 : 1;
  await setDoc(ref, {
    [platform]: (d[platform] || 0) + 1, total: (d.total || 0) + 1,
    dailyDate: today(), dailyCount: count, updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── USAGE (na adres IP) ────────────────────────────────────
export async function getIpUsage() {
  const ipHash = await getIpHash();
  const snap = await getDoc(doc(db, 'ipUsage', ipHash));
  return snap.exists() ? snap.data() : null;
}

export async function incrementIpUsage(platform) {
  const ipHash = await getIpHash();
  const ref = doc(db, 'ipUsage', ipHash);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : {};
  const count = d.dailyDate === today() ? (d.dailyCount || 0) + 1 : 1;
  await setDoc(ref, {
    ipHash, [platform]: (d[platform] || 0) + 1, total: (d.total || 0) + 1,
    dailyDate: today(), dailyCount: count, updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── LICENCJE (kody PRO) ────────────────────────────────────
export function generateLicenseKey() {
  const seg = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(2));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  return `YTIG-${seg()}-${seg()}-${seg()}`;
}

export async function createLicense({ plan = 'pro', maxActivations = 1, note = '', createdBy = '' }) {
  const key = generateLicenseKey();
  const license = {
    key, plan, status: 'active',
    maxActivations: Math.max(1, Number(maxActivations) || 1),
    activations: [], note: String(note).slice(0, 200), createdBy,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'licenses', key), license);
  return license;
}

export async function getLicense(key) {
  if (!key) return null;
  const snap = await getDoc(doc(db, 'licenses', String(key).trim().toUpperCase()));
  return snap.exists() ? snap.data() : null;
}

export async function listLicenses() {
  const snap = await getDocs(query(collection(db, 'licenses'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => d.data());
}

export async function setLicenseStatus(key, status) {
  await updateDoc(doc(db, 'licenses', key), { status, updatedAt: serverTimestamp() });
}

const ACTIVATE_REASONS = {
  not_found: 'Nie znaleziono takiego kodu PRO.',
  revoked: 'Ten kod PRO został unieważniony.',
  limit_reached: 'Ten kod PRO osiągnął limit aktywacji.',
};

export async function activateLicense(key, user) {
  const normalized = String(key).trim().toUpperCase();
  const license = await getLicense(normalized);
  if (!license) return { ok: false, error: ACTIVATE_REASONS.not_found };
  if (license.status !== 'active') return { ok: false, error: ACTIVATE_REASONS.revoked };

  const already = license.activations?.some((a) => a.uid === user.uid);
  if (!already) {
    if ((license.activations?.length || 0) >= license.maxActivations) {
      return { ok: false, error: ACTIVATE_REASONS.limit_reached };
    }
    await updateDoc(doc(db, 'licenses', normalized), {
      activations: arrayUnion({ uid: user.uid, email: user.email || null, activatedAt: new Date().toISOString() }),
    });
  }
  await ensureUsage(user);
  await updateDoc(doc(db, 'usage', user.uid), { licenseKey: normalized, updatedAt: serverTimestamp() });
  return { ok: true, plan: license.plan, key: normalized };
}

export async function userHasValidLicense(uid) {
  const usage = await getUsage(uid);
  if (!usage?.licenseKey) return false;
  const license = await getLicense(usage.licenseKey);
  return !!license && license.status === 'active' && license.activations?.some((a) => a.uid === uid);
}

// ── ZDARZENIA / ŚLEDZENIE ──────────────────────────────────
export async function logEvent(event) {
  const id = crypto.randomUUID();
  await setDoc(doc(db, 'events', id), { id, at: serverTimestamp(), ...event });
}

export async function listEvents(max = 80) {
  const snap = await getDocs(query(collection(db, 'events'), orderBy('at', 'desc'), qLimit(max)));
  return snap.docs.map((d) => d.data());
}

export async function listUsers(max = 200) {
  const snap = await getDocs(query(collection(db, 'usage'), qLimit(max)));
  return snap.docs.map((d) => d.data());
}

// ── Historia pobrań (podkolekcja usage/{uid}/history) ──────
export async function addHistory(uid, record) {
  const id = crypto.randomUUID();
  await setDoc(doc(db, 'usage', uid, 'history', id), { id, at: serverTimestamp(), ...record });
}

export async function listHistory(uid, max = 100) {
  const snap = await getDocs(
    query(collection(db, 'usage', uid, 'history'), orderBy('at', 'desc'), qLimit(max))
  );
  return snap.docs.map((d) => d.data());
}

// ── Status limitów bieżącego użytkownika (dziennie, z device lock) ──
export async function getStatus(user) {
  const usage = (await getUsage(user.uid)) || (await ensureUsage(user));
  const ipUsage = await getIpUsage();
  const pro = await userHasValidLicense(user.uid);
  const accountUsed = dailyCountOf(usage);
  const ipUsed = dailyCountOf(ipUsage);
  const deviceUsed = await getDeviceDaily();
  const used = Math.max(accountUsed, ipUsed, deviceUsed);
  return {
    pro, limit: FREE_DOWNLOAD_LIMIT, perDay: true,
    accountUsed, ipUsed, deviceUsed, used,
    remaining: pro ? null : Math.max(0, FREE_DOWNLOAD_LIMIT - used),
    licenseKey: usage.licenseKey || null,
  };
}

export async function canDownload(user) {
  if (await userHasValidLicense(user.uid)) return { allowed: true, pro: true };
  const s = await getStatus(user);
  if (s.deviceUsed >= s.limit) return { allowed: false, pro: false, reason: 'device_limit' };
  if (s.accountUsed >= s.limit) return { allowed: false, pro: false, reason: 'account_limit' };
  if (s.ipUsed >= s.limit) return { allowed: false, pro: false, reason: 'ip_limit' };
  return { allowed: true, pro: false };
}
