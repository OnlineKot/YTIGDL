// Inicjalizacja Firebase Web SDK + funkcje logowania (Google / Microsoft / e-mail).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAnalytics,
  logEvent as logAnalyticsEvent,
  isSupported as analyticsSupported,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

let auth = null;
let analytics = null;
let appConfig = null;

export async function loadConfig() {
  const res = await fetch('/api/config');
  appConfig = await res.json();
  return appConfig;
}

export function getAppConfig() {
  return appConfig;
}

export async function initAuth() {
  if (!appConfig) await loadConfig();
  if (!appConfig.firebase?.apiKey) {
    console.warn('[firebase] Brak konfiguracji Firebase Web — logowanie wyłączone. Ustaw zmienne FIREBASE_* w .env.');
    return null;
  }
  const app = initializeApp(appConfig.firebase);
  auth = getAuth(app);
  auth.useDeviceLanguage();

  // Firebase Analytics — śledzenie ruchu (jeśli przeglądarka wspiera).
  try {
    if (appConfig.firebase.measurementId && (await analyticsSupported())) {
      analytics = getAnalytics(app);
    }
  } catch {
    /* analytics opcjonalne */
  }
  return auth;
}

// Zdarzenie do Firebase Analytics (np. 'download', 'login', 'pro_activate').
export function track(name, params = {}) {
  try {
    if (analytics) logAnalyticsEvent(analytics, name, params);
  } catch {
    /* ignoruj */
  }
}

export function watchAuth(callback) {
  if (!auth) return callback(null);
  onAuthStateChanged(auth, callback);
}

export async function getIdToken() {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function loginMicrosoft() {
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function registerEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function loginEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function resendVerification() {
  if (auth?.currentUser) await sendEmailVerification(auth.currentUser);
}

export async function logout() {
  if (auth) await signOut(auth);
}

export function isReady() {
  return auth !== null;
}
