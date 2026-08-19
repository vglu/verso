import { describe, expect, it } from 'vitest';
import {
  APP_AUTHOR,
  APP_NAME,
  APP_OWNER_EMAIL,
  APP_OWNER_URL,
  copyrightLine,
  signatureLine
} from '../src/lib/ui/product';

describe('product identity', () => {
  it('matches the umbrella brand used by the sibling products', () => {
    expect(APP_AUTHOR).toBe('SIMS tech');
    expect(APP_OWNER_EMAIL).toBe('vhlu@sims-service.com');
    expect(APP_OWNER_URL).toBe('https://sims-service.com/');
  });

  it('builds the copyright line for a given year', () => {
    expect(copyrightLine(2026)).toBe('© 2026 SIMS tech');
  });

  it('builds the sidebar signature from name, version and copyright', () => {
    expect(signatureLine('0.1.0')).toBe(`${APP_NAME} 0.1.0 · ${copyrightLine()}`);
  });
});
