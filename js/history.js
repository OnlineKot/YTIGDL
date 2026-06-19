import { initAuthUI, openLogin, toast } from './ui.js';
import { listHistory } from './db.js';

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtTime(at) {
  try { const d = at?.toDate ? at.toDate() : new Date(at); return d.toLocaleString('pl-PL'); } catch { return ''; }
}
const ICON = { youtube: '▶️', instagram: '📸' };

async function render(user) {
  const area = $('historyArea');
  if (!user) {
    area.innerHTML = `<div class="history-empty">Zaloguj się, aby zobaczyć historię.<br><br>
      <button class="btn btn-primary" id="loginCta">Zaloguj się</button></div>`;
    $('loginCta')?.addEventListener('click', openLogin);
    return;
  }
  area.innerHTML = '<div class="history-empty">Wczytuję…</div>';
  try {
    const list = await listHistory(user.uid, 100);
    if (!list.length) {
      area.innerHTML = '<div class="history-empty">Brak pobrań. Zacznij na <a href="../" class="gradient">stronie głównej</a>.</div>';
      return;
    }
    area.innerHTML = list.map((h) => {
      const trim = h.trimStart || h.trimEnd ? ` · ✂️ ${esc(h.trimStart || '00:00')}–${esc(h.trimEnd || 'koniec')}` : '';
      const meta = [h.format?.toUpperCase(), h.quality === 'max' ? 'najwyższa' : h.quality, h.author].filter(Boolean).map(esc).join(' · ');
      return `<div class="history-item">
        <div class="pl">${ICON[h.platform] || '🔗'}</div>
        <div class="meta">
          <div class="t">${esc(h.title || h.url || 'Pobranie')}</div>
          <div class="s">${esc(fmtTime(h.at))} · ${meta}${trim}</div>
        </div>
        ${h.url ? `<a class="btn btn-ghost" href="${esc(h.url)}" target="_blank" rel="noopener" style="padding:8px 12px">Źródło</a>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    area.innerHTML = `<div class="history-empty">Nie udało się wczytać historii.<br><small>${esc(e.message)}</small></div>`;
  }
}

initAuthUI({ onUser: render });
