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

async function submitPin() {
  const pin = $('pinInput').value.trim();
  const msg = $('pinMsg');
  if (!pin) { msg.className = 'msg error'; msg.textContent = 'Wpisz PIN.'; return; }
  const btn = $('pinSubmit'); btn.disabled = true;
  try {
    if (await verifyPin(pin)) { sessionStorage.setItem('ytigdl_admin', '1'); location.href = 'admin/'; }
    else { msg.className = 'msg error'; msg.textContent = 'Błędny PIN.'; }
  } catch (e) { msg.className = 'msg error'; msg.textContent = e.message; }
  finally { btn.disabled = false; }
}
$('pinSubmit').addEventListener('click', submitPin);
$('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
