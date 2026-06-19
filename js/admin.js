import { watchAuth, loginGoogle, logout } from './firebase.js';
import { createLicense, listLicenses, setLicenseStatus, listUsers, listEvents } from './db.js';

// Wejście tylko po poprawnym PIN-ie (ustawionym na stronie głównej). Inaczej cicho odsyłamy.
if (sessionStorage.getItem('ytigdl_admin') !== '1') {
  location.replace('../');
}

const $ = (id) => document.getElementById(id);
let currentUser = null;

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = `toast ${type}`), 3500);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtTime(at) {
  try {
    const d = at?.toDate ? at.toDate() : new Date(at);
    return d.toLocaleString('pl-PL');
  } catch { return '—'; }
}

$('googleBtn').addEventListener('click', () => loginGoogle().catch((e) => toast(e.message, 'error')));
$('logoutBtn').addEventListener('click', async () => {
  sessionStorage.removeItem('ytigdl_admin');
  await logout();
  location.replace('../');
});

function onUser(user) {
  currentUser = user;
  // PIN już zweryfikowany (inaczej nie bylibyśmy na tej stronie).
  // Logowanie służy tylko do zapisu w Firestore (jeśli wymagają tego Twoje reguły).
  if (!user) {
    $('gate').classList.remove('hidden');
    $('panel').classList.add('hidden');
    $('userChip').classList.add('hidden');
    $('gateMsg').textContent = 'Zaloguj się, aby zarządzać licencjami.';
    return;
  }
  $('userEmail').textContent = user.email || user.uid;
  $('userAvatar').src = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.email || 'YT')}`;
  $('userChip').classList.remove('hidden');
  $('gate').classList.add('hidden');
  $('panel').classList.remove('hidden');
  loadAll();
}

async function loadAll() { loadLicenses(); loadUsers(); loadEvents(); }

async function loadLicenses() {
  const tbody = document.querySelector('#licTable tbody');
  try {
    const list = await listLicenses();
    tbody.innerHTML = list.map((l) => `
      <tr>
        <td><code>${esc(l.key)}</code></td>
        <td>${esc(l.plan)}</td>
        <td><span class="tag ${l.status}">${l.status === 'active' ? 'aktywna' : 'unieważniona'}</span></td>
        <td>${(l.activations?.length || 0)}/${l.maxActivations}</td>
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
    const list = await listUsers();
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
    const list = await listEvents(80);
    tbody.innerHTML = list.map((ev) => `
      <tr>
        <td>${esc(fmtTime(ev.at))}</td>
        <td>${esc(ev.type)}</td>
        <td>${esc(ev.platform || ev.provider || ev.key || ev.plan || '')}</td>
        <td>${esc(ev.email || '—')}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">Brak zdarzeń.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

$('genBtn').addEventListener('click', async () => {
  try {
    const lic = await createLicense({
      plan: $('planSelect').value,
      maxActivations: Number($('maxActivations').value) || 1,
      note: $('note').value.trim(),
      createdBy: currentUser?.email || '',
    });
    $('genResult').className = 'msg ok';
    $('genResult').innerHTML = `Wygenerowano: <code>${esc(lic.key)}</code> — skopiowano do schowka.`;
    $('note').value = '';
    navigator.clipboard?.writeText(lic.key).catch(() => {});
    toast('Kod skopiowany do schowka.', 'ok');
    loadLicenses();
  } catch (e) { $('genResult').className = 'msg error'; $('genResult').textContent = e.message; }
});

document.querySelector('#licTable').addEventListener('click', async (e) => {
  const revoke = e.target.closest('[data-revoke]');
  const restore = e.target.closest('[data-restore]');
  try {
    if (revoke) { await setLicenseStatus(revoke.dataset.revoke, 'revoked'); toast('Unieważniono.', 'ok'); }
    if (restore) { await setLicenseStatus(restore.dataset.restore, 'active'); toast('Przywrócono.', 'ok'); }
    if (revoke || restore) loadLicenses();
  } catch (err) { toast(err.message, 'error'); }
});

watchAuth(onUser);
