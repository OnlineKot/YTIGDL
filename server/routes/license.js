import express from 'express';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { activateLicense, logEvent } from '../store.js';

const router = express.Router();

const REASONS = {
  not_found: 'Nie znaleziono takiego kodu PRO.',
  revoked: 'Ten kod PRO został unieważniony.',
  limit_reached: 'Ten kod PRO osiągnął limit aktywacji.',
};

// Aktywacja kodu licencyjnego (GTID / PRO) dla bieżącego użytkownika.
router.post('/activate', requireAuth, requireVerified, async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Podaj kod PRO.' });

  const result = await activateLicense(key, req.user);
  if (!result.ok) {
    return res.status(400).json({ error: REASONS[result.reason] || 'Nieprawidłowy kod.' });
  }

  await logEvent({
    type: 'license_activate',
    uid: req.user.uid,
    email: req.user.email,
    key: result.license.key,
    plan: result.license.plan,
  });

  res.json({
    ok: true,
    plan: result.license.plan,
    key: result.license.key,
    message: 'Plan PRO aktywowany! Pobierasz teraz bez limitów.',
  });
});

export default router;
