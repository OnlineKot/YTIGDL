import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  createLicense,
  listLicenses,
  setLicenseStatus,
  listUsers,
  listEvents,
  logEvent,
} from '../store.js';

const router = express.Router();

// Wszystkie trasy admina wymagają uprawnień administratora.
router.use(requireAdmin);

// Kim jestem (do sprawdzenia uprawnień z frontendu).
router.get('/me', (req, res) => {
  res.json({ email: req.user.email, isAdmin: true });
});

// Wydaj nowy kod licencyjny (GTID / PRO).
router.post('/licenses', async (req, res) => {
  const { plan = 'pro', maxActivations = 1, note = '' } = req.body || {};
  const license = await createLicense({
    plan,
    maxActivations: Math.max(1, Number(maxActivations) || 1),
    note: String(note || '').slice(0, 200),
    createdBy: req.user.email,
  });
  await logEvent({ type: 'license_create', key: license.key, by: req.user.email });
  res.status(201).json(license);
});

// Lista wszystkich licencji.
router.get('/licenses', async (_req, res) => {
  res.json(await listLicenses());
});

// Unieważnij / przywróć licencję.
router.post('/licenses/:key/revoke', async (req, res) => {
  const license = await setLicenseStatus(req.params.key, 'revoked');
  if (!license) return res.status(404).json({ error: 'Nie znaleziono licencji.' });
  await logEvent({ type: 'license_revoke', key: license.key, by: req.user.email });
  res.json(license);
});

router.post('/licenses/:key/restore', async (req, res) => {
  const license = await setLicenseStatus(req.params.key, 'active');
  if (!license) return res.status(404).json({ error: 'Nie znaleziono licencji.' });
  res.json(license);
});

// Lista użytkowników i ich zużycia.
router.get('/users', async (_req, res) => {
  res.json(await listUsers());
});

// Dziennik zdarzeń (logowania, pobrania, aktywacje).
router.get('/events', async (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  res.json(await listEvents(limit));
});

export default router;
