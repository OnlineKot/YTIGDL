// Synchronizacja struktury: tworzy wszystkie kolekcje w Firestore,
// ustawia admina i zapisuje hasło panelu w osobnej kolekcji (adminPins).
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { initAuthUI, getUser, openLogin, toast } from './ui.js';

const $ = (id) => document.getElementById(id);

initAuthUI();

$('copyRules')?.addEventListener('click', () => {
  navigator.clipboard?.writeText($('tempRules').textContent).then(
    () => toast('Reguły skopiowane — wklej w Firestore → Rules → Publish.', 'ok'),
    () => toast('Nie udało się skopiować — zaznacz ręcznie.', 'error')
  );
});

$('seedBtn').addEventListener('click', async () => {
  const user = getUser();
  const msg = $('seedMsg');
  const log = $('seedLog');
  if (!user) { openLogin(); return; }
  if (!user.email) { msg.className = 'msg error'; msg.textContent = 'Zaloguj się kontem z adresem e-mail (np. Google).'; return; }

  const pin = $('pinSet').value.trim();
  if (!pin) { msg.className = 'msg error'; msg.textContent = 'Podaj hasło do panelu.'; return; }

  const btn = $('seedBtn'); btn.disabled = true; btn.textContent = 'Synchronizuję…';
  log.textContent = '';
  const lines = [];
  const stamp = serverTimestamp();

  // Każdy wpis: [kolekcja, ID dokumentu, dane]
  const items = [
    ['admins', user.email.toLowerCase(), { email: user.email.toLowerCase(), createdAt: stamp }],
    ['adminPins', pin, { createdAt: stamp }],
    ['usage', '__init', { _seed: true, createdAt: stamp }],
    ['ipUsage', '__init', { _seed: true, createdAt: stamp }],
    ['deviceUsage', '__init', { _seed: true, createdAt: stamp }],
    ['events', '__init', { _seed: true, type: 'seed', createdAt: stamp }],
    ['licenses', '__init', { _seed: true, status: 'revoked', activations: [], maxActivations: 1, createdAt: stamp }],
  ];

  let ok = 0;
  for (const [col, id, data] of items) {
    try {
      await setDoc(doc(db, col, id), data, { merge: true });
      lines.push(`✓ ${col}/${id}`);
      ok++;
    } catch (e) {
      lines.push(`✗ ${col}/${id} — ${e.code || e.message}`);
    }
    log.textContent = lines.join('\n');
  }

  btn.disabled = false; btn.textContent = 'Synchronizuj strukturę i ustaw mnie jako admina';
  if (ok === items.length) {
    msg.className = 'msg ok';
    msg.textContent = 'Gotowe! Cała struktura w bazie. Przywróć docelowe reguły. Hasło zmienisz sam w kolekcji adminPins.';
    toast('Struktura zsynchronizowana ✅', 'ok');
  } else {
    msg.className = 'msg error';
    msg.innerHTML = 'Część zapisów odrzucona (<code>permission-denied</code>) — najpierw wklej w Firestore <strong>tymczasowe reguły</strong> z sekcji powyżej (Publish), potem kliknij ponownie.';
  }
});
