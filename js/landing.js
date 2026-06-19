import { initAuthUI } from './ui.js';
import { verifyPin } from './db.js';

const $ = (id) => document.getElementById(id);
$('year').textContent = new Date().getFullYear();

initAuthUI();

// ── Ukryte wejście do panelu admina (PIN): 5 kliknięć w "DL" w stopce ──
let clicks = 0, timer = null;
$('secretSpot')?.addEventListener('click', () => {
  clicks++; clearTimeout(timer); timer = setTimeout(() => (clicks = 0), 1500);
  if (clicks >= 5) { clicks = 0; $('pinInput').value = ''; $('pinMsg').textContent = ''; $('pinModal').classList.add('show'); $('pinInput').focus(); }
});
document.querySelectorAll('[data-close-pin]').forEach((b) => b.addEventListener('click', () => $('pinModal').classList.remove('show')));
$('pinModal').addEventListener('click', (e) => { if (e.target.id === 'pinModal') $('pinModal').classList.remove('show'); });

let pinBusy = false;
async function submitPin() {
  if (pinBusy) return;
  const pin = $('pinInput').value.trim();
  const msg = $('pinMsg');
  if (pin.length < 4) { msg.className = 'msg error'; msg.textContent = 'Wpisz PIN.'; return; }
  pinBusy = true;
  try {
    if (await verifyPin(pin)) { sessionStorage.setItem('ytigdl_admin', '1'); location.href = 'admin/'; }
    else { msg.className = 'msg error'; msg.textContent = 'Błędny PIN.'; $('pinInput').value = ''; }
  } catch (e) { msg.className = 'msg error'; msg.textContent = e.message; }
  finally { pinBusy = false; }
}
$('pinSubmit').addEventListener('click', submitPin);
$('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
// Tylko cyfry; auto-submit po wpisaniu 6.
$('pinInput').addEventListener('input', () => {
  const el = $('pinInput');
  el.value = el.value.replace(/\D/g, '').slice(0, 6);
  $('pinMsg').textContent = '';
  if (el.value.length === 6) submitPin();
});
