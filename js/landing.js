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
$('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });

// Klawiatura numeryczna
$('keypad')?.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k;
  let v = $('pinInput').value;
  if (k === 'ok') { submitPin(); return; }
  if (k === 'clear') { v = v.slice(0, -1); }
  else if (/^[0-9]$/.test(k) && v.length < 6) { v += k; }
  $('pinInput').value = v;
  $('pinMsg').textContent = '';
  if (v.length === 6) submitPin();
});
