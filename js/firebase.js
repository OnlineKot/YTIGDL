// Inicjalizacja Firebase Web SDK + logowanie (Google / e-mail / telefon).
// Działa w 100% w przeglądarce — idealne pod GitHub Pages.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAnalytics,
  logEvent as logAnalyticsEvent,
  isSupported as analyticsSupported,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.useDeviceLanguage();
const db = getFirestore(app);
let analytics = null;

// Firebase Analytics — śledzenie ruchu (jeśli przeglądarka wspiera).
(async () => {
  try {
    if (firebaseConfig.measurementId && (await analyticsSupported())) {
      analytics = getAnalytics(app);
    }
  } catch { /* analytics opcjonalne */ }
})();

export { auth, db };

// Zdarzenie do Firebase Analytics (np. 'download', 'login', 'pro_activate').
export function track(name, params = {}) {
  try { if (analytics) logAnalyticsEvent(analytics, name, params); } catch { /* ignoruj */ }
}

export function watchAuth(callback) {
  onAuthStateChanged(auth, callback);
}

export async function loginGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
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
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Logowanie / weryfikacja telefonem (SMS) ────────────────
let recaptchaVerifier = null;
function ensureRecaptcha(containerId) {
  if (recaptchaVerifier) return recaptchaVerifier;
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  return recaptchaVerifier;
}
export async function sendPhoneCode(phoneNumber, containerId = 'recaptcha-container') {
  const verifier = ensureRecaptcha(containerId);
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}
export function resetRecaptcha() {
  try { recaptchaVerifier?.clear(); } catch { /* ignoruj */ }
  recaptchaVerifier = null;
}

export async function logout() {
  await signOut(auth);
}
