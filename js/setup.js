// JEDNORAZOWY kreator: tworzy wszystkie kolekcje w Firestore i ustawia admina + PIN.
// Strona tymczasowa — po użyciu zostanie usunięta.
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { initAuthUI, getUser, openLogin, toast } from './ui.js';

const $ = (id) => document.getElementById(id);

initAuthUI();

$('seedBtn').addEventListener('click', async () => {
  const user = getUser();
  const msg = $('seedMsg');
  const log = $('seedLog');
  if (!user) { openLogin(); return; }
  if (!user.email) { msg.className = 'msg error'; msg.textContent = 'Zaloguj się kontem z adresem e-mail (np. Google).'; return; }

  const pin = $('pinSet').value.trim();
  if (!pin) { msg.className = 'msg error'; msg.textContent = 'Podaj PIN do panelu.'; return; }

  const btn = $('seedBtn'); btn.disabled = true; btn.textContent = 'Tworzę…';
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

  btn.disabled = false; btn.textContent = 'Utwórz strukturę i ustaw mnie jako admina';
  if (ok === items.length) {
    msg.className = 'msg ok';
    msg.textContent = 'Gotowe! Wszystkie kolekcje utworzone. Przywróć docelowe reguły i powiedz, żebym usunął tę stronę.';
    toast('Struktura bazy utworzona ✅', 'ok');
  } else {
    msg.className = 'msg error';
    msg.textContent = 'Część zapisów się nie udała — najpewniej reguły. Wklej tymczasowe reguły i spróbuj ponownie.';
  }
});
