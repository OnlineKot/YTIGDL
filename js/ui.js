// Wspólny UI dla wszystkich stron: nawigacja, modal logowania, toast.
import {
  watchAuth, loginGoogle, registerEmail, loginEmail,
  resendVerification, sendPhoneCode, resetRecaptcha, logout, track,
} from './firebase.js';
import { ensureUsage, logEvent } from './db.js';

let currentUser = null;
let onUserCb = null;
let authMode = 'login';
let phoneConfirmation = null;

const $ = (id) => document.getElementById(id);

export function getUser() { return currentUser; }

export function isVerified(user) {
  if (!user) return false;
  const isPassword = user.providerData?.[0]?.providerId === 'password';
  return !isPassword || user.emailVerified;
}

export function toast(message, type = '') {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = `toast ${type}`), 3500);
}

export function openLogin() { $('authModal')?.classList.add('show'); }
function closeLogin() { $('authModal')?.classList.remove('show'); }

const MODAL_HTML = `
<div class="modal-backdrop" id="authModal">
  <div class="modal">
    <button class="modal-close" data-close-auth>&times;</button>
    <h2>Witaj w <span class="logo"><span class="bYT">YT</span><span class="bIG">IG</span><span class="bDL">DL</span></span></h2>
    <p class="sub">Zaloguj się, aby pobierać. Pierwsze 5 pobrań gratis.</p>
    <button class="btn oauth-btn" id="googleBtn">
      <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Kontynuuj z Google
    </button>
    <div class="divider">lub</div>
    <div class="tabs" id="authTabs">
      <button data-tab="login" class="active">Logowanie</button>
      <button data-tab="register">Rejestracja</button>
      <button data-tab="phone">Telefon</button>
    </div>
    <div id="emailFields">
      <input class="input" id="emailInput" type="email" placeholder="Adres e-mail" />
      <input class="input" id="passwordInput" type="password" placeholder="Hasło (min. 6 znaków)" />
      <button class="btn btn-primary btn-block" id="emailAuthBtn">Zaloguj się</button>
    </div>
    <div id="phoneFields" class="hidden">
      <input class="input" id="phoneInput" type="tel" placeholder="+48 600 000 000" />
      <button class="btn btn-primary btn-block" id="sendCodeBtn">Wyślij kod SMS</button>
      <input class="input hidden" id="codeInput" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Kod z SMS (6 cyfr)" style="margin-top:12px" />
      <button class="btn btn-primary btn-block hidden" id="verifyCodeBtn" style="margin-top:10px">Zweryfikuj i zaloguj</button>
    </div>
    <div class="msg" id="authMsg"></div>
    <div id="recaptcha-container"></div>
  </div>
</div>`;

function injectModal() {
  if ($('authModal')) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = MODAL_HTML;
  document.body.appendChild(tpl.firstElementChild);
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
    'auth/invalid-verification-code': 'Nieprawidłowy kod SMS.',
    'auth/code-expired': 'Kod SMS wygasł — wyślij nowy.',
    'auth/too-many-requests': 'Za dużo prób. Spróbuj później.',
    'auth/quota-exceeded': 'Przekroczono limit SMS. Spróbuj później.',
    'auth/operation-not-allowed': 'Ta metoda logowania jest wyłączona w Firebase.',
  }[code];
}
function showAuthError(e) {
  const msg = $('authMsg');
  if (msg) { msg.className = 'msg error'; msg.textContent = mapAuthError(e.code) || e.message; }
}

async function afterLogin(user, provider) {
  closeLogin();
  track('login', { method: provider });
  try { await logEvent({ type: 'login', provider, uid: user.uid, email: user.email || user.phoneNumber || null }); } catch {}
}

function wireModal() {
  document.querySelectorAll('[data-close-auth]').forEach((b) =>
    b.addEventListener('click', closeLogin));
  $('authModal').addEventListener('click', (e) => { if (e.target.id === 'authModal') closeLogin(); });

  $('googleBtn').addEventListener('click', async () => {
    try { const u = await loginGoogle(); await afterLogin(u, 'google'); toast(`Cześć, ${u.email}!`, 'ok'); }
    catch (e) { showAuthError(e); }
  });

  $('authTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
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
    if (!email || password.length < 6) { msg.className = 'msg error'; msg.textContent = 'Podaj e-mail i hasło (min. 6 znaków).'; return; }
    try {
      if (authMode === 'register') {
        await registerEmail(email, password);
        msg.className = 'msg ok'; msg.textContent = 'Konto założone! Potwierdź e-mail (wysłaliśmy link), aby pobierać.';
        track('sign_up', { method: 'email' });
      } else {
        const u = await loginEmail(email, password);
        if (!u.emailVerified) {
          msg.className = 'msg error';
          msg.innerHTML = 'Potwierdź adres e-mail. <a href="#" id="resendLink">Wyślij ponownie</a>';
          $('resendLink').addEventListener('click', async (ev) => { ev.preventDefault(); await resendVerification(); toast('Wysłano e-mail weryfikacyjny.', 'ok'); });
          return;
        }
        await afterLogin(u, 'email'); toast(`Cześć, ${u.email}!`, 'ok');
      }
    } catch (e) { showAuthError(e); }
  });

  $('sendCodeBtn').addEventListener('click', async () => {
    const phone = $('phoneInput').value.trim();
    const msg = $('authMsg');
    if (!/^\+\d{8,15}$/.test(phone)) { msg.className = 'msg error'; msg.textContent = 'Numer w formacie międzynarodowym, np. +48600000000.'; return; }
    const btn = $('sendCodeBtn'); btn.disabled = true; btn.textContent = 'Wysyłam…';
    try {
      phoneConfirmation = await sendPhoneCode(phone);
      msg.className = 'msg ok'; msg.textContent = 'Wysłaliśmy kod SMS. Wpisz go poniżej.';
      $('codeInput').classList.remove('hidden'); $('verifyCodeBtn').classList.remove('hidden'); $('codeInput').focus();
    } catch (e) { resetRecaptcha(); showAuthError(e); }
    finally { btn.disabled = false; btn.textContent = 'Wyślij kod SMS'; }
  });

  $('verifyCodeBtn').addEventListener('click', async () => {
    const code = $('codeInput').value.trim();
    const msg = $('authMsg');
    if (!phoneConfirmation) { msg.className = 'msg error'; msg.textContent = 'Najpierw wyślij kod SMS.'; return; }
    if (code.length < 6) { msg.className = 'msg error'; msg.textContent = 'Kod ma 6 cyfr.'; return; }
    try { const cred = await phoneConfirmation.confirm(code); await afterLogin(cred.user, 'phone'); toast('Zalogowano przez telefon!', 'ok'); }
    catch (e) { showAuthError(e); }
  });
}

function wireNav() {
  $('loginBtn')?.addEventListener('click', openLogin);
  $('logoutBtn')?.addEventListener('click', async () => { await logout(); toast('Wylogowano.'); });
}

async function handleAuth(user) {
  currentUser = user;
  const chip = $('userChip');
  if (user) {
    chip?.classList.remove('hidden');
    $('loginBtn')?.classList.add('hidden');
    if ($('userEmail')) $('userEmail').textContent = user.email || user.phoneNumber || 'Konto';
    if ($('userAvatar')) $('userAvatar').src = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email || user.phoneNumber || 'YT')}`;
    try { await ensureUsage(user); } catch {}
    if (!isVerified(user)) toast('Potwierdź adres e-mail — sprawdź skrzynkę.', 'error');
  } else {
    chip?.classList.add('hidden');
    $('loginBtn')?.classList.remove('hidden');
  }
  if (onUserCb) onUserCb(user);
}

export function initAuthUI({ onUser } = {}) {
  onUserCb = onUser;
  injectModal();
  wireModal();
  wireNav();
  watchAuth(handleAuth);
}
