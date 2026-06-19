import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initFirebase, isFirebaseEnabled } from './firebase.js';
import { checkYtDlp } from './services/downloader.js';
import { attachUser } from './middleware/auth.js';

import downloadRouter from './routes/download.js';
import licenseRouter from './routes/license.js';
import adminRouter from './routes/admin.js';
import trackRouter from './routes/track.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');

async function main() {
  await initFirebase();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.set('trust proxy', true);

  // Publiczna konfiguracja Firebase + ustawienia dla frontendu.
  app.get('/api/config', (_req, res) => {
    res.json({
      firebase: config.firebaseWeb,
      freeDownloadLimit: config.freeDownloadLimit,
      firebaseEnabled: isFirebaseEnabled(),
    });
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Trasy API (attachUser dekoduje token, jeśli jest obecny).
  app.use('/api/download', attachUser, downloadRouter);
  app.use('/api/license', attachUser, licenseRouter);
  app.use('/api/admin', attachUser, adminRouter);
  app.use('/api/track', trackRouter);

  // Statyczny frontend.
  app.use(express.static(publicDir));
  app.get('/admin', (_req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
  app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  const ytdlp = await checkYtDlp();
  app.listen(config.port, () => {
    console.log(`\n  YTIGDL działa na http://localhost:${config.port}`);
    console.log(`  Firebase: ${isFirebaseEnabled() ? 'połączony' : 'TRYB IN-MEMORY (dev)'}`);
    console.log(
      `  yt-dlp: ${ytdlp.available ? `dostępne (${ytdlp.version})` : 'NIEDOSTĘPNE — pobieranie nie zadziała'}`
    );
    console.log(`  Limit darmowych pobrań: ${config.freeDownloadLimit}`);
    console.log(`  Administratorzy: ${config.adminEmails.join(', ') || '(brak — ustaw ADMIN_EMAILS)'}\n`);
  });
}

main().catch((err) => {
  console.error('Błąd startu serwera:', err);
  process.exit(1);
});
