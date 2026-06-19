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

// Buduje ciało żądania Cobalt na podstawie opcji użytkownika.
function buildBody(url, opts) {
  const body = {
    url,
    filenameStyle: opts.filenameStyle || 'pretty',
    videoQuality: opts.quality || 'max', // 'max' = najwyższa dostępna
  };
  switch (opts.format) {
    case 'audio':
      body.downloadMode = 'audio';
      body.audioFormat = opts.audioFormat || 'mp3';
      body.audioBitrate = opts.audioBitrate || '320';
      break;
    case 'mute':
      body.downloadMode = 'mute';
      body.youtubeVideoCodec = opts.codec || 'h264';
      break;
    case 'webm':
      body.downloadMode = 'auto';
      body.youtubeVideoCodec = 'vp9';
      break;
    default: // 'mp4'
      body.downloadMode = 'auto';
      body.youtubeVideoCodec = opts.codec || 'h264';
  }
  return body;
}

// Pyta serwis Cobalt o link do pobrania. Zwraca { url, filename }.
export async function resolveDownload(url, opts = {}) {
  if (!DOWNLOAD_API) {
    throw new Error('Brak skonfigurowanego serwisu pobierania (DOWNLOAD_API w js/config.js).');
  }
  let res;
  try {
    res = await fetch(DOWNLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildBody(url, opts)),
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

// Uruchamia pobranie w przeglądarce. opts.title → własna nazwa pliku.
export async function triggerDownload(url, opts = {}) {
  const { url: fileUrl, filename } = await resolveDownload(url, opts);

  let name = filename;
  if (opts.title) {
    const ext = filename && filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
    name = opts.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) + ext;
  }

  const a = document.createElement('a');
  a.href = fileUrl;
  if (name) a.download = name;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { fileUrl, filename: name || filename };
}
