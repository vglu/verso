/**
 * Product identity in one place — the rebrand seam.
 *
 * The About dialog, the sidebar footer and the window title all read from
 * here, so the brand is stated once and cannot drift between surfaces.
 * Values match the other SIMS tech products (SIS Version Manager, TicketHub).
 */
import { getVersion } from '@tauri-apps/api/app';

export const APP_NAME = 'Verso';
export const APP_SUBTITLE = 'Markdown viewer & editor';
export const APP_AUTHOR = 'SIMS tech';
export const APP_OWNER_URL = 'https://sims-service.com/';
export const APP_OWNER_EMAIL = 'vhlu@sims-service.com';
export const APP_LICENSE = 'MIT';

/** Width below which the sidebar footer condenses to version only. */
export const SIDEBAR_CONDENSE_WIDTH = 230;

let cachedVersion: string | null = null;

/**
 * Version from the bundle. Falls back to a readable placeholder rather than
 * throwing — an About dialog that fails to open is worse than one missing a
 * number.
 */
export async function loadVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = await getVersion();
  } catch {
    cachedVersion = '—';
  }
  return cachedVersion;
}

export function copyrightLine(year = new Date().getFullYear()): string {
  return `© ${year} ${APP_AUTHOR}`;
}

/** The one-line signature shown in the sidebar footer. */
export function signatureLine(version: string): string {
  return `${APP_NAME} ${version} · ${copyrightLine()}`;
}
