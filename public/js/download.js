// Klient pobierania zgodny z API Cobalt (https://github.com/imputnet/cobalt).
// GitHub Pages nie pobierze mediów samodzielnie, więc prosimy zewnętrzny serwis o bezpośredni link.
import { DOWNLOAD_API } from './config.js';

export function detectPlatform(url) {
  if (!url) return null;
  const u = String(url).toLowerCase();
  if (/(youtube\.com|youtu\.be|youtube-nocookie\.com)/.test(u)) return 'youtube';
  if (/instagram\.com|instagr\.am/.test(u)) return 'instagram';
  return null; // tu w przyszłości: tiktok, x, facebook...
}

export function isSupportedUrl(url) {
  return detectPlatform(url) !== null;
}

/**
 * Pyta serwis Cobalt o link do pobrania. Zwraca { url, filename }.
 * quality: 'best' (wideo) | 'audio' (mp3).
 */
export async function resolveDownload(url, { quality = 'best' } = {}) {
  if (!DOWNLOAD_API) {
    throw new Error('Brak skonfigurowanego serwisu pobierania (DOWNLOAD_API w js/config.js).');
  }
  const body = {
    url,
    downloadMode: quality === 'audio' ? 'audio' : 'auto',
    audioFormat: 'mp3',
    filenameStyle: 'pretty',
  };

  let res;
  try {
    res = await fetch(DOWNLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Nie udało się połączyć z serwisem pobierania (CORS lub instancja offline).');
  }

  const data = await res.json().catch(() => ({}));
  switch (data.status) {
    case 'tunnel':
    case 'redirect':
    case 'stream':
      return { url: data.url, filename: data.filename || null };
    case 'picker': {
      const item = (data.picker || []).find((p) => p.url) || data.picker?.[0];
      if (item?.url) return { url: item.url, filename: data.filename || null };
      throw new Error('Serwis zwrócił wiele plików, ale bez linku.');
    }
    case 'error':
      throw new Error(data.error?.code || 'Serwis pobierania zwrócił błąd.');
    default:
      throw new Error('Nieoczekiwana odpowiedź serwisu pobierania.');
  }
}

/**
 * Uruchamia pobranie pliku w przeglądarce.
 */
export async function triggerDownload(url, { quality = 'best' } = {}) {
  const { url: fileUrl, filename } = await resolveDownload(url, { quality });
  const a = document.createElement('a');
  a.href = fileUrl;
  if (filename) a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { fileUrl, filename };
}
