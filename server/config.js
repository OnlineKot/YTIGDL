import './env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT) || 3000,
  freeDownloadLimit: Number(process.env.FREE_DOWNLOAD_LIMIT ?? 5),
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  downloadDir: path.resolve(root, process.env.DOWNLOAD_DIR || 'downloads'),
  root,

  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  },

  // Publiczna konfiguracja Firebase Web SDK (frontend).
  // Wartości domyślne to publiczne dane projektu "ytigdl-api"; nadpisywalne przez .env.
  firebaseWeb: {
    apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyC4wlU-2FK1QHrxhlYyAof5x8S5yOwjFj8',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'ytigdl-api.firebaseapp.com',
    projectId: process.env.FIREBASE_PROJECT_ID || 'ytigdl-api',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'ytigdl-api.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '304064793778',
    appId: process.env.FIREBASE_APP_ID || '1:304064793778:web:f1a1926d3bd82ade164dab',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-KYQBH5N4MK',
  },
};

export function isAdminEmail(email) {
  if (!email) return false;
  return config.adminEmails.includes(String(email).toLowerCase());
}
