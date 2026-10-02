import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import releases from '../releases.json';
import listing from '../../docs/store-listing.json';

/**
 * The release notes and the Store listing are applied by CI only when a tag is
 * pushed, so a mistake would otherwise surface mid-release. These are the
 * Store's limits and the shape the app and scripts/store-listing.mjs expect.
 */
describe('release notes (src/releases.json)', () => {
  it('starts with the version being built', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(releases[0].version).toBe(pkg.version);
  });

  it('has every field, newest first, and no duplicate versions', () => {
    const versions = releases.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    const num = (v: string) => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0);
    expect([...versions].sort((a, b) => num(b) - num(a))).toEqual(versions);
    for (const r of releases) {
      expect(r.headline, r.version).toBeTruthy();
      expect(r.date, r.version).toBeTruthy();
      expect(r.highlights.length, r.version).toBeGreaterThan(0);
      for (const h of r.highlights) {
        expect(h.title && h.desc, `${r.version}: ${h.title}`).toBeTruthy();
        if ('only' in h) expect(['desktop', 'vscode']).toContain(h.only);
      }
    }
  });
});

describe('Store listing (docs/store-listing.json)', () => {
  it('fits the Store limits', () => {
    expect(listing.description.length).toBeLessThanOrEqual(10000);
    expect(listing.shortDescription.length).toBeLessThanOrEqual(1000);
    expect(listing.features.length).toBeLessThanOrEqual(20);
    for (const f of listing.features) expect(f.length, f).toBeLessThanOrEqual(200);
    expect(listing.keywords.length).toBeLessThanOrEqual(7);
    for (const k of listing.keywords) expect(k.length, k).toBeLessThanOrEqual(30);
  });

  it('has no em dashes', () => {
    const all = [listing.description, listing.shortDescription, ...listing.features, ...listing.keywords].join('\n');
    expect(all.includes('—')).toBe(false);
  });
});
