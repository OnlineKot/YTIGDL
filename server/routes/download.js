import express from 'express';
import fs from 'node:fs';
import { config } from '../config.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import {
  detectPlatform,
  isSupportedUrl,
  fetchInfo,
  downloadMedia,
} from '../services/downloader.js';
import {
  ensureUsage,
  getUsage,
  incrementUsage,
  getIpUsage,
  incrementIpUsage,
  userHasValidLicense,
  logEvent,
} from '../store.js';

const router = express.Router();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Sprawdza, czy użytkownik może pobierać:
 *  - z ważną licencją PRO → bez limitu,
 *  - inaczej: limit darmowy na KONTO oraz na ADRES IP.
 */
async function checkEligibility(req) {
  const limit = config.freeDownloadLimit;
  const hasLicense = await userHasValidLicense(req.user.uid);
  if (hasLicense) {
    return { allowed: true, pro: true, limit, remaining: Infinity };
  }

  const usage = (await getUsage(req.user.uid)) || (await ensureUsage(req.user));
  const ipUsage = await getIpUsage(clientIp(req));

  const accountUsed = usage.total || 0;
  const ipUsed = ipUsage?.total || 0;

  if (accountUsed >= limit) {
    return { allowed: false, pro: false, reason: 'account_limit', limit, remaining: 0 };
  }
  if (ipUsed >= limit) {
    return { allowed: false, pro: false, reason: 'ip_limit', limit, remaining: 0 };
  }
  return {
    allowed: true,
    pro: false,
    limit,
    remaining: Math.max(0, limit - Math.max(accountUsed, ipUsed)),
  };
}

// Status pobrań/limitów bieżącego użytkownika.
router.get('/status', requireAuth, async (req, res) => {
  const limit = config.freeDownloadLimit;
  const usage = (await getUsage(req.user.uid)) || (await ensureUsage(req.user));
  const ipUsage = await getIpUsage(clientIp(req));
  const pro = await userHasValidLicense(req.user.uid);
  const accountUsed = usage.total || 0;
  const ipUsed = ipUsage?.total || 0;
  res.json({
    pro,
    limit,
    accountUsed,
    ipUsed,
    remaining: pro ? null : Math.max(0, limit - Math.max(accountUsed, ipUsed)),
    licenseKey: usage.licenseKey || null,
  });
});

// Podgląd metadanych (tytuł, miniatura) — nie liczy się do limitu.
router.post('/info', requireAuth, requireVerified, async (req, res) => {
  const { url } = req.body || {};
  if (!isSupportedUrl(url)) {
    return res.status(400).json({ error: 'Nieobsługiwany lub pusty adres URL.' });
  }
  try {
    const info = await fetchInfo(url);
    res.json({ platform: detectPlatform(url), ...info });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Główny endpoint pobierania — strumieniuje plik do przeglądarki.
router.post('/', requireAuth, requireVerified, async (req, res) => {
  const { url, quality = 'best' } = req.body || {};
  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ error: 'Nieobsługiwany lub pusty adres URL.' });
  }

  const eligibility = await checkEligibility(req);
  if (!eligibility.allowed) {
    return res.status(402).json({
      error:
        eligibility.reason === 'ip_limit'
          ? 'Z tego adresu IP wykorzystano 5 darmowych pobrań. Wprowadź kod PRO, aby kontynuować.'
          : 'Wykorzystano 5 darmowych pobrań na koncie. Wprowadź kod PRO, aby kontynuować.',
      code: 'license_required',
      reason: eligibility.reason,
    });
  }

  try {
    const { filePath, fileName, workDir } = await downloadMedia(url, { quality });

    // Liczymy pobranie tylko dla użytkowników bez licencji PRO.
    if (!eligibility.pro) {
      await incrementUsage(req.user.uid, platform);
      await incrementIpUsage(clientIp(req), platform);
    }
    await logEvent({
      type: 'download',
      platform,
      uid: req.user.uid,
      email: req.user.email,
      pro: eligibility.pro,
      url,
    });

    res.download(filePath, fileName, (err) => {
      // Sprzątanie pliku tymczasowego po wysłaniu.
      fs.rm(workDir, { recursive: true, force: true }, () => {});
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Błąd wysyłania pliku.' });
      }
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
