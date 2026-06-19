// ─────────────────────────────────────────────────────────────
//  YTIGDL — konfiguracja statyczna (działa na GitHub Pages, bez Node).
//  Wszystkie wartości tutaj są PUBLICZNE i bezpieczne do umieszczenia w repo.
//  Prawdziwe bezpieczeństwo zapewniają reguły Firestore (firestore.rules).
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

// Administratorzy NIE są zapisani w kodzie — trzymamy ich w Firebase (Firestore),
// w kolekcji `admins` (ID dokumentu = e-mail admina). Patrz firestore.rules.
// Aby nadać komuś admina: w konsoli Firestore utwórz dokument admins/<email>.

// ── Serwis pobierania mediów ──────────────────────────────────
// GitHub Pages nie pobierze pliku samodzielnie (brak backendu/yt-dlp),
// więc korzystamy z zewnętrznego API zgodnego z Cobalt (https://github.com/imputnet/cobalt).
// Wpisz adres własnej instancji Cobalt LUB własnego backendu (folder server/ hostowany np. na Render).
export const DOWNLOAD_API = 'https://cobalt-api.kwiatekmiki.com';
