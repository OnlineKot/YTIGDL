// ─────────────────────────────────────────────────────────────
//  YTIGDL — konfiguracja statyczna (działa na GitHub Pages, bez Node).
//  Wszystkie wartości tutaj są PUBLICZNE i bezpieczne do umieszczenia w repo.
//  Prawdziwe bezpieczeństwo zapewniają Twoje własne reguły Firestore (zarządzane w Firebase).
// ─────────────────────────────────────────────────────────────

// Konfiguracja Firebase Web SDK (projekt: ytigdl-api).
export const firebaseConfig = {
  apiKey: 'AIzaSyC4wlU-2FK1QHrxhlYyAof5x8S5yOwjFj8',
  authDomain: 'ytigdl-api.firebaseapp.com',
  projectId: 'ytigdl-api',
  storageBucket: 'ytigdl-api.firebasestorage.app',
  messagingSenderId: '304064793778',
  appId: '1:304064793778:web:f1a1926d3bd82ade164dab',
  measurementId: 'G-KYQBH5N4MK',
};

// Limit darmowych pobrań (na konto ORAZ na adres IP) zanim wymagany jest kod PRO.
export const FREE_DOWNLOAD_LIMIT = 5;

// ════════════════════════════════════════════════════════════
//  PIN / HASŁO DO PANELU ADMINA — zmień tutaj.
//  To jest wyraźna zmienna mówiąca, jaki jest PIN do wejścia w panel
//  (5× kliknięcie w „DL" w stopce → wpisz ten PIN).
//  Działa od razu. Dodatkowo akceptowane są też PIN-y z kolekcji `adminPins`.
export const ADMIN_PIN = '159123';
// ════════════════════════════════════════════════════════════

// ── Serwis pobierania mediów ──────────────────────────────────
// GitHub Pages nie pobierze pliku samodzielnie (brak backendu/yt-dlp),
// więc korzystamy z zewnętrznego API zgodnego z Cobalt (https://github.com/imputnet/cobalt).
// Wpisz adres własnej instancji Cobalt LUB własnego backendu (folder server/ hostowany np. na Render).
export const DOWNLOAD_API = 'https://cobalt-api.kwiatekmiki.com';
