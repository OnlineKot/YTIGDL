import { initAuthUI, getUser, openLogin, toast } from './ui.js';
import { track } from './firebase.js';
import {
  getStatus, canDownload, incrementUsage, incrementIpUsage, incrementDeviceDaily,
  activateLicense, logEvent, addHistory,
} from './db.js';
import { detectPlatform, isSupportedUrl, triggerDownload } from './download.js';

const $ = (id) => document.getElementById(id);

function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }
document.querySelectorAll('[data-close-pro]').forEach((b) => b.addEventListener('click', () => closeModal('proModal')));
$('proModal').addEventListener('click', (e) => { if (e.target.id === 'proModal') closeModal('proModal'); });

// ── Onboarding ↔ aplikacja ─────────────────────────────────
$('onbRegister').addEventListener('click', () => openLogin('register'));
$('onbLogin').addEventListener('click', () => openLogin('login'));

function showApp(user) {
  const logged = !!user;
  $('onboarding').classList.toggle('hidden', logged);
  $('appMain').classList.toggle('hidden', !logged);
  $('proBtn').classList.toggle('hidden', !logged);
  if (logged) refreshStatus(user);
}

// ── Pokazywanie opcji zależnie od formatu ──────────────────
function syncFormat() {
  const isAudio = $('optFormat').value === 'audio';
  $('audioWrap').classList.toggle('hidden', !isAudio);
  $('qualityWrap').classList.toggle('hidden', isAudio);
  $('codecWrap').classList.toggle('hidden', isAudio);
}
$('optFormat').addEventListener('change', syncFormat);
syncFormat();

function collectOptions() {
  return {
    format: $('optFormat').value,
    quality: $('optQuality').value,
    codec: $('optCodec').value,
    audioBitrate: $('optAudio').value,
    audioFormat: 'mp3',
    filenameStyle: $('optFilenameStyle').value,
    title: $('optTitle').value.trim() || null,
    author: 'YTIGDL', // autor zawsze YTIGDL (nie do zmiany)
    trimStart: $('optTrimStart').value.trim() || null,
    trimEnd: $('optTrimEnd').value.trim() || null,
  };
}

// ── Status limitów ─────────────────────────────────────────
async function refreshStatus(user) {
  user = user || getUser();
  if (!user) { $('usageBar').classList.add('hidden'); return; }
  try {
    const s = await getStatus(user);
    $('usageBar').classList.remove('hidden');
    if (s.pro) {
      $('usageText').textContent = '✨ Plan PRO — pobierasz bez limitów';
      $('usageFill').style.width = '100%';
    } else {
      $('usageText').textContent = `Dziś na tym urządzeniu: ${s.used}/${s.limit} darmowych pobrań`;
      $('usageFill').style.width = `${Math.min(100, (s.used / s.limit) * 100)}%`;
    }
  } catch { $('usageBar').classList.add('hidden'); }
}

// ── Pobieranie ─────────────────────────────────────────────
$('downloadBtn').addEventListener('click', handleDownload);
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleDownload(); });

async function handleDownload() {
  const url = $('urlInput').value.trim();
  const result = $('result');
  const user = getUser();
  if (!url) { toast('Wklej najpierw link.', 'error'); return; }
  if (!isSupportedUrl(url)) { toast('Obsługujemy linki z YouTube i Instagrama.', 'error'); return; }
  if (!user) { openLogin('register'); return; }

  const platform = detectPlatform(url);
  const opts = collectOptions();
  const btn = $('downloadBtn');

  let eligibility;
  try { eligibility = await canDownload(user); }
  catch (e) { toast('Błąd sprawdzania limitu: ' + e.message, 'error'); return; }

  if (!eligibility.allowed) {
    // Shadowban — udajemy problem z siecią, nie zdradzamy bana.
    if (eligibility.reason === 'shadow') {
      result.className = 'result show error';
      result.innerHTML = '⚠️ Sprawdź swoje połączenie sieciowe i spróbuj ponownie.';
      return;
    }
    const reasons = {
      device_limit: '🔒 To urządzenie wykorzystało dziś 5 darmowych pobrań. Wróć jutro albo wpisz kod PRO.',
      ip_limit: '🔒 Z tej sieci wykorzystano dziś 5 darmowych pobrań. Wróć jutro albo wpisz kod PRO.',
      account_limit: '🔒 Wykorzystałeś dziś 5 darmowych pobrań. Wróć jutro albo wpisz kod PRO.',
    };
    result.className = 'result show error';
    result.innerHTML = reasons[eligibility.reason] || reasons.device_limit;
    openModal('proModal');
    return;
  }

  btn.disabled = true; btn.textContent = 'Pobieram…';
  result.className = 'result show';
  result.innerHTML = '⏳ Przygotowuję link do pobrania…';

  try {
    const { filename } = await triggerDownload(url, opts);

    if (!eligibility.pro) {
      await incrementUsage(user.uid, platform);
      await incrementIpUsage(platform);
      await incrementDeviceDaily(platform);
    }
    const record = {
      type: 'download', platform, url,
      title: opts.title || filename || null,
      author: opts.author || null,
      format: opts.format, quality: opts.quality,
      trimStart: opts.trimStart, trimEnd: opts.trimEnd,
      pro: !!eligibility.pro,
    };
    try { await addHistory(user.uid, record); } catch {}
    try { await logEvent({ type: 'download', platform, uid: user.uid, email: user.email || null, pro: !!eligibility.pro }); } catch {}

    result.className = 'result show';
    result.innerHTML = `✅ Gotowe! ${filename ? `Plik: <strong>${filename}</strong>` : 'Pobieranie rozpoczęte.'}`;
    track('download', { platform, format: opts.format, quality: opts.quality });
    refreshStatus(user);
  } catch (e) {
    result.className = 'result show error';
    result.innerHTML = `❌ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Pobierz`;
  }
}

// ── Kod PRO ────────────────────────────────────────────────
$('proBtn').addEventListener('click', () => {
  if (!getUser()) { openLogin('login'); return; }
  openModal('proModal');
});
$('activateProBtn').addEventListener('click', async () => {
  const key = $('proInput').value.trim();
  const msg = $('proMsg');
  const user = getUser();
  if (!user) { openLogin('login'); return; }
  if (!key) { msg.className = 'msg error'; msg.textContent = 'Wpisz kod PRO.'; return; }
  try {
    const res = await activateLicense(key, user);
    if (!res.ok) { msg.className = 'msg error'; msg.textContent = res.error; return; }
    msg.className = 'msg ok'; msg.textContent = 'Plan PRO aktywowany! Pobierasz teraz bez limitów.';
    track('pro_activate', { plan: res.plan });
    try { await logEvent({ type: 'license_activate', uid: user.uid, email: user.email || null, key: res.key, plan: res.plan }); } catch {}
    toast('✨ Plan PRO aktywny!', 'ok');
    refreshStatus(user);
    setTimeout(() => closeModal('proModal'), 1400);
  } catch (e) { msg.className = 'msg error'; msg.textContent = e.message; }
});

// ── Start ──────────────────────────────────────────────────
initAuthUI({ onUser: showApp });
