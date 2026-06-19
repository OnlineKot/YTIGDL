import fs from 'node:fs';
import { config } from './config.js';

let admin = null;
let firestore = null;
let initialized = false;
let usingFirebase = false;

function loadServiceAccount() {
  if (config.firebase.serviceAccountJson) {
    try {
      return JSON.parse(config.firebase.serviceAccountJson);
    } catch {
      console.warn('[firebase] FIREBASE_SERVICE_ACCOUNT_JSON nie jest poprawnym JSON-em.');
    }
  }
  if (config.firebase.serviceAccountPath && fs.existsSync(config.firebase.serviceAccountPath)) {
    try {
      return JSON.parse(fs.readFileSync(config.firebase.serviceAccountPath, 'utf8'));
    } catch {
      console.warn('[firebase] Nie udało się odczytać pliku service account.');
    }
  }
  return null;
}

export async function initFirebase() {
  if (initialized) return;
  initialized = true;

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn(
      '[firebase] Brak danych uwierzytelniających Firebase Admin — używam trybu IN-MEMORY (tylko deweloperski). ' +
        'Ustaw FIREBASE_SERVICE_ACCOUNT_JSON lub FIREBASE_SERVICE_ACCOUNT_PATH, aby włączyć Firestore.'
    );
    return;
  }

  try {
    const mod = await import('firebase-admin');
    admin = mod.default || mod;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || config.firebase.projectId,
    });
    firestore = admin.firestore();
    usingFirebase = true;
    console.log('[firebase] Połączono z Firestore (projekt: %s).', serviceAccount.project_id);
  } catch (err) {
    console.warn('[firebase] Inicjalizacja Firebase nie powiodła się — tryb IN-MEMORY.', err.message);
  }
}

export function isFirebaseEnabled() {
  return usingFirebase;
}

export function getFirestore() {
  return firestore;
}

export function getAdmin() {
  return admin;
}

/**
 * Weryfikuje token ID Firebase z frontendu.
 * W trybie in-memory akceptujemy "fake" tokeny postaci `dev:<email>` do testów.
 */
export async function verifyIdToken(idToken) {
  if (!idToken) return null;

  if (usingFirebase && admin) {
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || null,
        provider: decoded.firebase?.sign_in_provider || null,
        emailVerified: decoded.email_verified === true,
      };
    } catch {
      return null;
    }
  }

  // Tryb deweloperski: token postaci "dev:email@example.com"
  if (idToken.startsWith('dev:')) {
    const email = idToken.slice(4).trim().toLowerCase();
    return { uid: `dev_${email}`, email, name: email, provider: 'dev', emailVerified: true };
  }
  return null;
}
