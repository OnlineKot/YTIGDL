import {
  watchAuth, loginGoogle, registerEmail, loginEmail,
  resendVerification, sendPhoneCode, resetRecaptcha, logout, track,
} from './firebase.js';
import {
  isAdmin, ensureUsage, getStatus, canDownload,
  incrementUsage, incrementIpUsage, activateLicense, logEvent,
} from './db.js';
import { detectPlatform, isSupportedUrl, triggerDownload } from './download.js';

const $ = (id) => document.getElementById(id);
let currentUser = null;
let quality = 'best';
let authMode = 'login';

$('year').textContent = new Date().getFullYear();

function toast(message, type = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = `toast ${type}`), 3500);
}
function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }

document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', (e) => e.target.closest('.modal-backdrop').classList.remove('show'))
);
document.querySelectorAll('.modal-backdrop').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); })
);

function isVerified(user) {
  // Konta telefon/Google są zweryfikowane; e-mail/hasło wymaga potwierdzenia.
  const isPassword = user.providerData?.[0]?.providerId === 'password';
  return !isPassword || user.emailVerified;
}

// ── Stan UI po zalogowaniu ─────────────────────────────────
async function renderUser(user) {
  currentUser = user;
  const chip = $('userChip');
  if (user) {
    chip.classList.remove('hidden');
    $('loginBtn').classList.add('hidden');
    $('userEmail').textContent = user.email || user.phoneNumber || 'Konto';
    $('userAvatar').src = user.photoURL ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email || user.phoneNumber || 'YT')}`;
    $('adminLink').classList.toggle('hidden', !isAdmin(user));
    try { await ensureUsage(user); } catch { /* reguły mogą blokować przed weryfikacją */ }
    refreshStatus();
    if (!isVerified(user)) toast('Potwierdź adres e-mail — sprawdź skrzynkę.', 'error');
  } else {
    chip.classList.add('hidden');
    $('loginBtn').classList.remove('hidden');
    $('adminLink').classList.add('hidden');
    $('usageBar').classList.add('hidden');
  }
}

async function refreshStatus() {
  if (!currentUser) return;
  try {
    const s = await getStatus(currentUser);
    const bar = $('usageBar');
    bar.classList.remove('hidden');
    if (s.pro) {
      $('usageText').textContent = '✨ Plan PRO — pobierasz bez limitów';
      $('usageFill').style.width = '100%';
    } else {
      $('usageText').textContent = `Darmowe pobrania: ${s.used}/${s.limit}`;
      $('usageFill').style.width = `${Math.min(100, (s.used / s.limit) * 100)}%`;
    }
  } catch { $('usageBar').classList.add('hidden'); }
}

// ── Logowanie ──────────────────────────────────────────────
async function afterLogin(user, provider) {
  closeModal('authModal');
  track('login', { method: provider });
  try {
    await logEvent({ type: 'login', provider, uid: user.uid, email: user.email || user.phoneNumber || null });
  } catch { /* best-effort */ }
}

$('loginBtn').addEventListener('click', () => openModal('authModal'));
$('logoutBtn').addEventListener('click', async () => { await logout(); toast('Wylogowano.'); });

$('googleBtn').addEventListener('click', async () => {
  try { const u = await loginGoogle(); await afterLogin(u, 'google'); toast(`Cześć, ${u.email}!`, 'ok'); }
  catch (e) { showAuthError(e); }
});

// Zakładki: logowanie / rejestracja / telefon
$('authTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  authMode = btn.dataset.tab;
  document.querySelectorAll('#authTabs button').forEach((b) => b.classList.toggle('active', b === btn));
  const phone = authMode === 'phone';
  $('emailFields').classList.toggle('hidden', phone);
  $('phoneFields').classList.toggle('hidden', !phone);
  $('authMsg').textContent = '';
  if (!phone) $('emailAuthBtn').textContent = authMode === 'register' ? 'Załóż konto' : 'Zaloguj się';
});

$('emailAuthBtn').addEventListener('click', async () => {
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  const msg = $('authMsg');
  if (!email || password.length < 6) {
    msg.className = 'msg error'; msg.textContent = 'Podaj e-mail i hasło (min. 6 znaków).'; return;
  }
  try {
    if (authMode === 'register') {
      await registerEmail(email, password);
      msg.className = 'msg ok';
      msg.textContent = 'Konto założone! Wysłaliśmy e-mail weryfikacyjny — potwierdź go, aby pobierać.';
      track('sign_up', { method: 'email' });
    } else {
      const u = await loginEmail(email, password);
      if (!u.emailVerified) {
        msg.className = 'msg error';
        msg.innerHTML = 'Potwierdź adres e-mail. <a href="#" id="resendLink">Wyślij ponownie</a>';
        $('resendLink').addEventListener('click', async (ev) => {
          ev.preventDefault(); await resendVerification(); toast('Wysłano e-mail weryfikacyjny.', 'ok');
        });
        return;
      }
      await afterLogin(u, 'email'); toast(`Cześć, ${u.email}!`, 'ok');
    }
  } catch (e) { showAuthError(e); }
});

function showAuthError(e) {
  const msg = $('authMsg');
  msg.className = 'msg error';
  msg.textContent = mapAuthError(e.code) || e.message;
}
function mapAuthError(code) {
  return {
    'auth/email-already-in-use': 'Ten e-mail jest już zarejestrowany.',
    'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
    'auth/weak-password': 'Hasło jest za słabe (min. 6 znaków).',
    'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
    'auth/user-not-found': 'Nie ma takiego konta.',
    'auth/wrong-password': 'Nieprawidłowe hasło.',
    'auth/popup-closed-by-user': 'Zamknięto okno logowania.',
    'auth/invalid-phone-number': 'Nieprawidłowy numer telefonu.',
    'auth/missing-phone-number': 'Podaj numer telefonu.',
    'auth/invalid-verification-code': 'Nieprawidłowy kod SMS.',
    'auth/code-expired': 'Kod SMS wygasł — wyślij nowy.',
    'auth/too-many-requests': 'Za dużo prób. Spróbuj później.',
    'auth/quota-exceeded': 'Przekroczono limit SMS. Spróbuj później.',
    'auth/operation-not-allowed': 'Ta metoda logowania jest wyłączona w Firebase.',
  }[code];
}

// ── Telefon (SMS) ──────────────────────────────────────────
let phoneConfirmation = null;
$('sendCodeBtn').addEventListener('click', async () => {
  const phone = $('phoneInput').value.trim();
  const msg = $('authMsg');
  if (!/^\+\d{8,15}$/.test(phone)) {
    msg.className = 'msg error'; msg.textContent = 'Podaj numer w formacie międzynarodowym, np. +48600000000.'; return;
  }
  const btn = $('sendCodeBtn');
  btn.disabled = true; btn.textContent = 'Wysyłam…';
  try {
    phoneConfirmation = await sendPhoneCode(phone);
    msg.className = 'msg ok'; msg.textContent = 'Wysłaliśmy kod SMS. Wpisz go poniżej.';
    $('codeInput').classList.remove('hidden');
    $('verifyCodeBtn').classList.remove('hidden');
    $('codeInput').focus();
  } catch (e) { resetRecaptcha(); showAuthError(e); }
  finally { btn.disabled = false; btn.textContent = 'Wyślij kod SMS'; }
});
$('verifyCodeBtn').addEventListener('click', async () => {
  const code = $('codeInput').value.trim();
  const msg = $('authMsg');
  if (!phoneConfirmation) { msg.className = 'msg error'; msg.textContent = 'Najpierw wyślij kod SMS.'; return; }
  if (code.length < 6) { msg.className = 'msg error'; msg.textContent = 'Kod ma 6 cyfr.'; return; }
  try {
    const cred = await phoneConfirmation.confirm(code);
    await afterLogin(cred.user, 'phone'); toast('Zalogowano przez telefon!', 'ok');
  } catch (e) { showAuthError(e); }
});

// ── Jakość ─────────────────────────────────────────────────
$('qualitySeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  quality = btn.dataset.q;
  document.querySelectorAll('#qualitySeg button').forEach((b) => b.classList.toggle('active', b === btn));
});

// ── Pobieranie ─────────────────────────────────────────────
$('downloadBtn').addEventListener('click', handleDownload);
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleDownload(); });

async function handleDownload() {
  const url = $('urlInput').value.trim();
  const result = $('result');
  if (!url) { toast('Wklej najpierw link.', 'error'); return; }
  if (!isSupportedUrl(url)) { toast('Obsługujemy linki z YouTube i Instagrama.', 'error'); return; }
  if (!currentUser) { openModal('authModal'); return; }
  if (!isVerified(currentUser)) { toast('Najpierw potwierdź adres e-mail.', 'error'); return; }

  const platform = detectPlatform(url);
  const btn = $('downloadBtn');

  // Sprawdź limit (konto + IP) zanim cokolwiek pobierzemy.
  let eligibility;
  try { eligibility = await canDownload(currentUser); }
  catch (e) { toast('Błąd sprawdzania limitu: ' + e.message, 'error'); return; }

  if (!eligibility.allowed) {
    result.className = 'result show error';
    result.innerHTML = eligibility.reason === 'ip_limit'
      ? '🔒 Z tego adresu IP wykorzystano 5 darmowych pobrań. Wpisz kod PRO, aby kontynuować.'
      : '🔒 Wykorzystano 5 darmowych pobrań na koncie. Wpisz kod PRO, aby kontynuować.';
    openModal('proModal');
    return;
  }

  btn.disabled = true; btn.textContent = 'Pobieram…';
  result.className = 'result show';
  result.innerHTML = '⏳ Przygotowuję link do pobrania…';

  try {
    const { filename } = await triggerDownload(url, { quality });

    if (!eligibility.pro) {
      await incrementUsage(currentUser.uid, platform);
      await incrementIpUsage(platform);
    }
    await logEvent({ type: 'download', platform, uid: currentUser.uid, email: currentUser.email || null, pro: !!eligibility.pro });

    result.className = 'result show';
    result.innerHTML = `✅ Gotowe! ${filename ? `Plik: <strong>${filename}</strong>` : 'Pobieranie rozpoczęte.'}`;
    track('download', { platform, quality });
    refreshStatus();
  } catch (e) {
    result.className = 'result show error';
    result.innerHTML = `❌ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Pobierz`;
  }
}

// ── Kod PRO ────────────────────────────────────────────────
$('proBtn').addEventListener('click', () => {
  if (!currentUser) { openModal('authModal'); return; }
  openModal('proModal');
});
$('activateProBtn').addEventListener('click', async () => {
  const key = $('proInput').value.trim();
  const msg = $('proMsg');
  if (!key) { msg.className = 'msg error'; msg.textContent = 'Wpisz kod PRO.'; return; }
  try {
    const res = await activateLicense(key, currentUser);
    if (!res.ok) { msg.className = 'msg error'; msg.textContent = res.error; return; }
    msg.className = 'msg ok'; msg.textContent = 'Plan PRO aktywowany! Pobierasz teraz bez limitów.';
    track('pro_activate', { plan: res.plan });
    await logEvent({ type: 'license_activate', uid: currentUser.uid, email: currentUser.email || null, key: res.key, plan: res.plan });
    toast('✨ Plan PRO aktywny!', 'ok');
    refreshStatus();
    setTimeout(() => closeModal('proModal'), 1500);
  } catch (e) { msg.className = 'msg error'; msg.textContent = e.message; }
});

// ── Start ──────────────────────────────────────────────────
watchAuth(renderUser);
