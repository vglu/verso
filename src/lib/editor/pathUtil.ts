/**
 * Path helpers for resolving document-relative image sources.
 * Kept dependency-free and separate so they can be unit tested without a webview.
 */

const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;

export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || p.startsWith('\\') || WINDOWS_ABS.test(p);
}

export function isRemoteUrl(url: string): boolean {
  return /^(https?:|data:|blob:|asset:|mailto:)/i.test(url);
}

/** Join a base directory with a relative path, resolving `.` and `..`. */
export function joinPath(baseDir: string, relative: string): string {
  if (isAbsolutePath(relative)) return normalizeSeparators(relative);

  const sep = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
  const baseParts = normalizeSeparators(baseDir).split('/').filter(Boolean);
  const isWindowsAbs = WINDOWS_ABS.test(baseDir);
  const leadingSlash = baseDir.startsWith('/') || baseDir.startsWith('\\');

  for (const part of normalizeSeparators(relative).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (baseParts.length > (isWindowsAbs ? 1 : 0)) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  const joined = baseParts.join(sep === '\\' ? '\\' : '/');
  return leadingSlash && !isWindowsAbs ? '/' + joined : joined;
}

function normalizeSeparators(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Strip a URL fragment/query that a filesystem path cannot carry. */
export function stripUrlSuffix(url: string): string {
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const cut = [hash, query].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  return cut === undefined ? url : url.slice(0, cut);
}

/** Percent-decoding for links written with escaped spaces. */
export function decodeUrlPath(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

export function baseName(p: string): string {
  const parts = normalizeSeparators(p).split('/');
  return parts[parts.length - 1] ?? p;
}

export function dirName(p: string): string {
  const normalized = normalizeSeparators(p);
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return normalized;
  const dir = normalized.slice(0, idx);
  return p.includes('\\') ? dir.replace(/\//g, '\\') : dir;
}
