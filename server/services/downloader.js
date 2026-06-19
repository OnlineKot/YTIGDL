import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Wykrywa platformę na podstawie URL-a.
 * Łatwo rozszerzalne o kolejne serwisy ("więcej rzeczy będzie później").
 */
export function detectPlatform(url) {
  if (!url) return null;
  const u = String(url).toLowerCase();
  if (/(youtube\.com|youtu\.be|youtube-nocookie\.com)/.test(u)) return 'youtube';
  if (/instagram\.com|instagr\.am/.test(u)) return 'instagram';
  // Tu w przyszłości: tiktok, twitter/x, facebook, vimeo...
  return null;
}

export function isSupportedUrl(url) {
  return detectPlatform(url) !== null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Sprawdza, czy yt-dlp jest dostępne.
 */
export function checkYtDlp() {
  return new Promise((resolve) => {
    const proc = spawn(config.ytdlpPath, ['--version']);
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('error', () => resolve({ available: false }));
    proc.on('close', (code) => resolve({ available: code === 0, version: out.trim() }));
  });
}

/**
 * Pobiera metadane (tytuł, miniatura, czas trwania) bez ściągania pliku.
 */
export function fetchInfo(url) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-single-json', '--no-warnings', '--no-playlist', url];
    const proc = spawn(config.ytdlpPath, args);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e) => reject(new Error(`yt-dlp niedostępne: ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || 'Nie udało się pobrać informacji o mediach.'));
      try {
        const data = JSON.parse(out);
        resolve({
          title: data.title || 'media',
          thumbnail: data.thumbnail || null,
          duration: data.duration || null,
          uploader: data.uploader || data.channel || null,
          extractor: data.extractor_key || null,
        });
      } catch (e) {
        reject(new Error('Nie udało się odczytać metadanych.'));
      }
    });
  });
}

/**
 * Pobiera media do pliku i zwraca ścieżkę. quality: 'best' | 'audio'.
 */
export function downloadMedia(url, { quality = 'best' } = {}) {
  return new Promise((resolve, reject) => {
    ensureDir(config.downloadDir);
    const id = crypto.randomUUID();
    const workDir = path.join(config.downloadDir, id);
    ensureDir(workDir);

    const outTemplate = path.join(workDir, '%(title).80s.%(ext)s');
    const args = ['--no-playlist', '--no-warnings', '-o', outTemplate];

    if (quality === 'audio') {
      args.push('-x', '--audio-format', 'mp3');
    } else {
      // Najlepsza jakość mp4 jeśli możliwe
      args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
    }
    args.push(url);

    const proc = spawn(config.ytdlpPath, args);
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e) => reject(new Error(`yt-dlp niedostępne: ${e.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(err || 'Pobieranie nie powiodło się.'));
      }
      const files = fs.readdirSync(workDir);
      if (!files.length) return reject(new Error('Brak pliku wynikowego.'));
      resolve({ filePath: path.join(workDir, files[0]), fileName: files[0], workDir });
    });
  });
}
