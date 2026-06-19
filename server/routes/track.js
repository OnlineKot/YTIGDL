import express from 'express';
import { attachUser } from '../middleware/auth.js';
import { logEvent } from '../store.js';

const router = express.Router();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Śledzenie logowań (Google / Microsoft / e-mail) i innych zdarzeń frontendu.
router.post('/login', attachUser, async (req, res) => {
  const { provider } = req.body || {};
  await logEvent({
    type: 'login',
    provider: provider || req.user?.provider || 'unknown',
    uid: req.user?.uid || null,
    email: req.user?.email || null,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] || null,
  });
  res.json({ ok: true });
});

export default router;
