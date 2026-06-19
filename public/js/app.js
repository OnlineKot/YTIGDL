import {
  loadConfig,
  initAuth,
  watchAuth,
  getIdToken,
  loginGoogle,
  loginMicrosoft,
  registerEmail,
  loginEmail,
  resendVerification,
  logout,
  track,
} from './firebase.js';

const $ = (id) => document.getElementById(id);
let currentUser = null;
let quality = 'best';
let authMode = 'login';

document.getElementById('year').textContent = new Date().getFullYear();

// ── Pomocnicze: API z tokenem ──────────────────────────────
async function api(path, options = {}) {
  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Błąd'), { data, status: res.status });
  return data;
}

function toast(message, type = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = `toast ${type}`), 3500);
}

// ── Modale ─────────────────────────────────────────────────
function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', (e) => e.target.closest('.modal-backdrop').classList.remove('show'))
);
document.querySelectorAll('.modal-backdrop').forEach((m) =>
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); })
);

// ── Stan UI logowania ──────────────────────────────────────
function renderUser(user) {
  currentUser = user;
  const chip = $('userChip');
  const loginBtn = $('loginBtn');
  const adminLink = $('adminLink');
  if (user) {
    chip.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    $('userEmail').textContent = user.email || 'Konto';
    $('userAvatar').src = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email || 'YT')}`;
    refreshStatus();
    // Pokaż link admina po sprawdzeniu uprawnień.
    api('/api/admin/me').then(() => adminLink.classList.remove('hidden')).catch(() => adminLink.classList.add('hidden'));
    // Ostrzeżenie o niezweryfikowanym e-mailu.
    if (user.providerData?.[0]?.providerId === 'password' && !user.emailVerified) {
      toast('Potwierdź adres e-mail — sprawdź skrzynkę.', 'error');
    }
  } else {
    chip.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    adminLink.classList.add('hidden');
    $('usageBar').classList.add('hidden');
  }
}

// ── Status limitów ─────────────────────────────────────────
async function refreshStatus() {
  try {
    const s = await api('/api/download/status');
    const bar = $('usageBar');
    bar.classList.remove('hidden');
    if (s.pro) {
      $('usageText').textContent = '✨ Plan PRO — pobierasz bez limitów';
      $('usageFill').style.width = '100%';
    } else {
      const used = Math.max(s.accountUsed, s.ipUsed);
      $('usageText').textContent = `Darmowe pobrania: ${used}/${s.limit}`;
      $('usageFill').style.width = `${Math.min(100, (used / s.limit) * 100)}%`;
    }
  } catch {
    $('usageBar').classList.add('hidden');
  }
}

// ── Logowanie ──────────────────────────────────────────────
async function afterLogin(user, provider) {
  closeModal('authModal');
  track('login', { method: provider });
  try {
    const token = await getIdToken();
    await fetch('/api/track/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ provider }),
    });
  } catch { /* śledzenie best-effort */ }
}

$('loginBtn').addEventListener('click', () => openModal('authModal'));
$('logoutBtn').addEventListener('click', async () => { await logout(); toast('Wylogowano.'); });

$('googleBtn').addEventListener('click', async () => {
  try { const u = await loginGoogle(); await afterLogin(u, 'google'); toast(`Cześć, ${u.email}!`, 'ok'); }
  catch (e) { $('authMsg').className = 'msg error'; $('authMsg').textContent = e.message; }
});
$('microsoftBtn').addEventListener('click', async () => {
  try { const u = await loginMicrosoft(); await afterLogin(u, 'microsoft'); toast(`Cześć, ${u.email}!`, 'ok'); }
  catch (e) { $('authMsg').className = 'msg error'; $('authMsg').textContent = e.message; }
});

// Zakładki: logowanie / rejestracja
$('authTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  authMode = btn.dataset.tab;
  document.querySelectorAll('#authTabs button').forEach((b) => b.classList.toggle('active', b === btn));
  $('emailAuthBtn').textContent = authMode === 'register' ? 'Załóż konto' : 'Zaloguj się';
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
      await afterLogin(u, 'email');
      toast(`Cześć, ${u.email}!`, 'ok');
    }
  } catch (e) {
    msg.className = 'msg error';
    msg.textContent = mapAuthError(e.code) || e.message;
  }
});

function mapAuthError(code) {
  const map = {
    'auth/email-already-in-use': 'Ten e-mail jest już zarejestrowany.',
    'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
    'auth/weak-password': 'Hasło jest za słabe (min. 6 znaków).',
    'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
    'auth/user-not-found': 'Nie ma takiego konta.',
    'auth/wrong-password': 'Nieprawidłowe hasło.',
    'auth/popup-closed-by-user': 'Zamknięto okno logowania.',
  };
  return map[code];
}

// ── Wybór jakości ──────────────────────────────────────────
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
  if (!currentUser) { openModal('authModal'); return; }
  if (currentUser.providerData?.[0]?.providerId === 'password' && !currentUser.emailVerified) {
    toast('Najpierw potwierdź adres e-mail.', 'error'); return;
  }

  const btn = $('downloadBtn');
  btn.disabled = true;
  btn.textContent = 'Pobieram…';
  result.className = 'result show';
  result.innerHTML = '⏳ Przygotowuję plik… to może chwilę potrwać.';

  try {
    const token = await getIdToken();
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url, quality }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 402 || err.code === 'license_required') {
        result.className = 'result show error';
        result.innerHTML = `🔒 ${err.error}`;
        openModal('proModal');
        return;
      }
      throw new Error(err.error || 'Pobieranie nie powiodło się.');
    }

    // Pobierz plik jako blob i zapisz.
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    const fileName = match ? decodeURIComponent(match[1]) : 'ytigdl-download';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);

    result.className = 'result show';
    result.innerHTML = `✅ Gotowe! Pobrano: <strong>${fileName}</strong>`;
    track('download', { quality });
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
    const data = await api('/api/license/activate', { method: 'POST', body: JSON.stringify({ key }) });
    msg.className = 'msg ok';
    msg.textContent = data.message;
    track('pro_activate', { plan: data.plan });
    toast('✨ Plan PRO aktywny! Pobierasz bez limitów.', 'ok');
    refreshStatus();
    setTimeout(() => closeModal('proModal'), 1500);
  } catch (e) {
    msg.className = 'msg error';
    msg.textContent = e.message;
  }
});

// ── Start ──────────────────────────────────────────────────
(async () => {
  await loadConfig();
  const auth = await initAuth();
  if (!auth) {
    toast('Logowanie wyłączone — brak konfiguracji Firebase.', 'error');
    return;
  }
  watchAuth(renderUser);
})();
