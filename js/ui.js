// Wspólny UI dla wszystkich stron: nawigacja, modal logowania, toast.
import {
  watchAuth, loginGoogle, registerEmail, loginEmail,
  resendVerification, resetPassword, sendPhoneCode, resetRecaptcha, logout, track,
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

export function openLogin(mode) {
  if (mode) setMode(mode);
  $('authModal')?.classList.add('show');
}
function closeLogin() { $('authModal')?.classList.remove('show'); }

const MODAL_HTML = `
<div class="modal-backdrop" id="authModal">
  <div class="modal auth-modal">
    <button class="modal-close" data-close-auth aria-label="Zamknij">&times;</button>
    <div class="auth-head">
      <span class="logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg></span>
      <h2 id="authTitle">Zaloguj się</h2>
      <p class="sub" id="authSub">Miło Cię widzieć — kontynuuj, aby pobierać.</p>
    </div>

    <button class="btn google-btn" id="googleBtn">
      <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      <span>Kontynuuj z Google</span>
    </button>

    <div class="divider"><span>lub e-mailem</span></div>

    <div id="emailBlock">
      <label class="fld-label" for="emailInput">Adres e-mail</label>
      <div class="fld">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
        <input id="emailInput" type="email" autocomplete="email" placeholder="ty@example.com" />
      </div>

      <div class="fld-row">
        <label class="fld-label" for="passwordInput">Hasło</label>
        <a href="#" class="link" id="forgotLink">Nie pamiętasz hasła?</a>
      </div>
      <div class="fld">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <input id="passwordInput" type="password" autocomplete="current-password" placeholder="Twoje hasło" />
        <button type="button" class="pw-toggle" id="pwToggle" aria-label="Pokaż hasło">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>

      <button class="btn btn-primary btn-block btn-lg" id="emailAuthBtn">Zaloguj się</button>
    </div>

    <div id="phoneBlock" class="hidden">
      <label class="fld-label" for="phoneInput">Numer telefonu</label>
      <div class="fld">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l1 4v2a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-1Z"/></svg>
        <input id="phoneInput" type="tel" autocomplete="tel" placeholder="+48 600 000 000" />
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="sendCodeBtn">Wyślij kod SMS</button>
      <div id="codeWrap" class="hidden">
        <label class="fld-label" for="codeInput" style="margin-top:14px">Kod z SMS</label>
        <div class="fld">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3 6-6"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
          <input id="codeInput" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6-cyfrowy kod" />
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="verifyCodeBtn" style="margin-top:10px">Zweryfikuj i zaloguj</button>
      </div>
    </div>

    <div class="msg" id="authMsg"></div>
    <div class="auth-switch" id="authSwitch"></div>
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

// Ustawia tryb okna: 'login' | 'register' | 'phone' i przerysowuje teksty/linki.
function setMode(mode) {
  authMode = mode;
  $('authMsg').textContent = '';
  const phone = mode === 'phone';
  $('emailBlock').classList.toggle('hidden', phone);
  $('phoneBlock').classList.toggle('hidden', !phone);

  const titles = {
    login: ['Zaloguj się', 'Miło Cię widzieć — kontynuuj, aby pobierać.'],
    register: ['Utwórz konto', 'Załóż darmowe konto i pobieraj w sekundę.'],
    phone: ['Logowanie przez telefon', 'Wyślemy Ci kod SMS na podany numer.'],
  };
  $('authTitle').textContent = titles[mode][0];
  $('authSub').textContent = titles[mode][1];
  if (!phone) $('emailAuthBtn').textContent = mode === 'register' ? 'Załóż konto' : 'Zaloguj się';
  $('passwordInput').setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
  $('forgotLink').style.display = mode === 'register' ? 'none' : '';

  const sw = $('authSwitch');
  if (mode === 'login') {
    sw.innerHTML = `Nie masz konta? <a href="#" data-go="register">Zarejestruj się</a> &nbsp;·&nbsp; <a href="#" data-go="phone">Przez telefon</a>`;
  } else if (mode === 'register') {
    sw.innerHTML = `Masz już konto? <a href="#" data-go="login">Zaloguj się</a> &nbsp;·&nbsp; <a href="#" data-go="phone">Przez telefon</a>`;
  } else {
    sw.innerHTML = `<a href="#" data-go="login">← Wróć do logowania e-mailem</a>`;
  }
}

function wireModal() {
  document.querySelectorAll('[data-close-auth]').forEach((b) => b.addEventListener('click', closeLogin));
  $('authModal').addEventListener('click', (e) => { if (e.target.id === 'authModal') closeLogin(); });

  // Przełączanie trybów (linki na dole).
  $('authSwitch').addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]'); if (!a) return;
    e.preventDefault(); setMode(a.dataset.go);
  });

  // Pokaż/ukryj hasło.
  $('pwToggle').addEventListener('click', () => {
    const inp = $('passwordInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    $('pwToggle').classList.toggle('on', inp.type === 'text');
  });

  // Nie pamiętasz hasła.
  $('forgotLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('emailInput').value.trim();
    const msg = $('authMsg');
    if (!email) { msg.className = 'msg error'; msg.textContent = 'Wpisz najpierw swój adres e-mail.'; $('emailInput').focus(); return; }
    try { await resetPassword(email); msg.className = 'msg ok'; msg.textContent = 'Wysłaliśmy link do resetu hasła na Twój e-mail.'; }
    catch (err) { showAuthError(err); }
  });

  $('googleBtn').addEventListener('click', async () => {
    try { const u = await loginGoogle(); await afterLogin(u, 'google'); toast(`Cześć, ${u.email}!`, 'ok'); }
    catch (e) { showAuthError(e); }
  });

  $('emailAuthBtn').addEventListener('click', async () => {
    const email = $('emailInput').value.trim();
    const password = $('passwordInput').value;
    const msg = $('authMsg');
    if (!email || password.length < 6) { msg.className = 'msg error'; msg.textContent = 'Podaj e-mail i hasło (min. 6 znaków).'; return; }
    const btn = $('emailAuthBtn'); btn.disabled = true;
    try {
      if (authMode === 'register') {
        await registerEmail(email, password);
        msg.className = 'msg ok'; msg.textContent = 'Konto założone! Wysłaliśmy link aktywacyjny — potwierdź e-mail, aby pobierać.';
        track('sign_up', { method: 'email' });
      } else {
        const u = await loginEmail(email, password);
        if (!u.emailVerified) {
          msg.className = 'msg error';
          msg.innerHTML = 'Potwierdź adres e-mail. <a href="#" id="resendLink">Wyślij link ponownie</a>';
          $('resendLink').addEventListener('click', async (ev) => { ev.preventDefault(); await resendVerification(); toast('Wysłano e-mail weryfikacyjny.', 'ok'); });
          return;
        }
        await afterLogin(u, 'email'); toast(`Cześć, ${u.email}!`, 'ok');
      }
    } catch (e) { showAuthError(e); }
    finally { btn.disabled = false; }
  });

  $('sendCodeBtn').addEventListener('click', async () => {
    const phone = $('phoneInput').value.trim();
    const msg = $('authMsg');
    if (!/^\+\d{8,15}$/.test(phone)) { msg.className = 'msg error'; msg.textContent = 'Numer w formacie międzynarodowym, np. +48600000000.'; return; }
    const btn = $('sendCodeBtn'); btn.disabled = true; btn.textContent = 'Wysyłam…';
    try {
      phoneConfirmation = await sendPhoneCode(phone);
      msg.className = 'msg ok'; msg.textContent = 'Wysłaliśmy kod SMS. Wpisz go poniżej.';
      $('codeWrap').classList.remove('hidden'); $('codeInput').focus();
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

  setMode('login');
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
