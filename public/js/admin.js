import {
  initAuth,
  watchAuth,
  getIdToken,
  loginGoogle,
  loginMicrosoft,
  logout,
} from './firebase.js';

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Błąd'), { status: res.status });
  return data;
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = `toast ${type}`), 3500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Logowanie ──────────────────────────────────────────────
$('googleBtn').addEventListener('click', () => loginGoogle().catch((e) => toast(e.message, 'error')));
$('microsoftBtn').addEventListener('click', () => loginMicrosoft().catch((e) => toast(e.message, 'error')));
$('logoutBtn').addEventListener('click', async () => { await logout(); location.reload(); });

async function onUser(user) {
  if (!user) {
    $('gate').classList.remove('hidden');
    $('panel').classList.add('hidden');
    $('userChip').classList.add('hidden');
    return;
  }
  $('userEmail').textContent = user.email;
  $('userAvatar').src = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email)}`;
  try {
    await api('/api/admin/me'); // sprawdzenie uprawnień
    $('gate').classList.add('hidden');
    $('panel').classList.remove('hidden');
    $('userChip').classList.remove('hidden');
    loadAll();
  } catch (e) {
    $('gate').classList.remove('hidden');
    $('panel').classList.add('hidden');
    $('userChip').classList.remove('hidden');
    $('gateMsg').textContent = `Konto ${user.email} nie ma uprawnień administratora.`;
  }
}

// ── Ładowanie danych ───────────────────────────────────────
async function loadAll() {
  loadLicenses();
  loadUsers();
  loadEvents();
}

async function loadLicenses() {
  const tbody = document.querySelector('#licTable tbody');
  try {
    const list = await api('/api/admin/licenses');
    tbody.innerHTML = list.map((l) => `
      <tr>
        <td><code>${esc(l.key)}</code></td>
        <td>${esc(l.plan)}</td>
        <td><span class="tag ${l.status}">${l.status === 'active' ? 'aktywna' : 'unieważniona'}</span></td>
        <td>${l.activations.length}/${l.maxActivations}</td>
        <td>${esc(l.note || '—')}</td>
        <td>${l.status === 'active'
          ? `<button class="btn btn-ghost" data-revoke="${esc(l.key)}" style="padding:6px 10px">Unieważnij</button>`
          : `<button class="btn btn-ghost" data-restore="${esc(l.key)}" style="padding:6px 10px">Przywróć</button>`}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">Brak licencji.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

async function loadUsers() {
  const tbody = document.querySelector('#usersTable tbody');
  try {
    const list = await api('/api/admin/users');
    tbody.innerHTML = list.map((u) => `
      <tr>
        <td>${esc(u.email || u.uid)}</td>
        <td>${u.youtube || 0}</td>
        <td>${u.instagram || 0}</td>
        <td>${u.total || 0}</td>
        <td>${u.licenseKey ? `<code>${esc(u.licenseKey)}</code>` : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">Brak użytkowników.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

async function loadEvents() {
  const tbody = document.querySelector('#eventsTable tbody');
  try {
    const list = await api('/api/admin/events?limit=80');
    tbody.innerHTML = list.map((ev) => {
      const details = ev.platform || ev.provider || ev.key || ev.plan || '';
      return `<tr>
        <td>${esc(new Date(ev.at).toLocaleString('pl-PL'))}</td>
        <td>${esc(ev.type)}</td>
        <td>${esc(details)}</td>
        <td>${esc(ev.email || '—')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="color:var(--muted)">Brak zdarzeń.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

// ── Generowanie licencji ───────────────────────────────────
$('genBtn').addEventListener('click', async () => {
  const plan = $('planSelect').value;
  const maxActivations = Number($('maxActivations').value) || 1;
  const note = $('note').value.trim();
  try {
    const lic = await api('/api/admin/licenses', {
      method: 'POST',
      body: JSON.stringify({ plan, maxActivations, note }),
    });
    $('genResult').className = 'msg ok';
    $('genResult').innerHTML = `Wygenerowano: <code>${esc(lic.key)}</code> — skopiuj i przekaż klientowi.`;
    $('note').value = '';
    navigator.clipboard?.writeText(lic.key).catch(() => {});
    toast('Kod skopiowany do schowka.', 'ok');
    loadLicenses();
  } catch (e) {
    $('genResult').className = 'msg error';
    $('genResult').textContent = e.message;
  }
});

// Akcje na licencjach (delegacja zdarzeń).
document.querySelector('#licTable').addEventListener('click', async (e) => {
  const revoke = e.target.closest('[data-revoke]');
  const restore = e.target.closest('[data-restore]');
  try {
    if (revoke) { await api(`/api/admin/licenses/${revoke.dataset.revoke}/revoke`, { method: 'POST' }); toast('Unieważniono.', 'ok'); }
    if (restore) { await api(`/api/admin/licenses/${restore.dataset.restore}/restore`, { method: 'POST' }); toast('Przywrócono.', 'ok'); }
    if (revoke || restore) loadLicenses();
  } catch (err) { toast(err.message, 'error'); }
});

// ── Start ──────────────────────────────────────────────────
(async () => {
  const auth = await initAuth();
  if (!auth) { $('gateMsg').textContent = 'Brak konfiguracji Firebase — uzupełnij zmienne FIREBASE_*.'; return; }
  watchAuth(onUser);
})();
