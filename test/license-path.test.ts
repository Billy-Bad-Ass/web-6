/**
 * The license page moved, and receipts did not.
 *
 * The page lived at `/licence` until the British spelling was corrected. Every
 * receipt issued before that links to the old path, and a receipt is read
 * months later — usually at the moment somebody wants their money back. So the
 * old path is as load-bearing as anything in LEGACY_RULES, and unlike those it
 * lives in the switch, where nothing else would notice it going missing.
 */

import { describe, expect, it } from 'vitest';
import worker from '../src/index';

const env = {} as never;
const ctx = { waitUntil() {}, passThroughOnException() {} } as never;
const call = (u: string) => worker.fetch(new Request(u), env, ctx);

describe('the license page', () => {
  it('serves the terms at /license', async () => {
    const res = await call('https://bbanetwork.org/license');

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('License &amp; refunds');
  });

  it('sends the old /licence link to it rather than a 404', async () => {
    const res = await call('https://bbanetwork.org/licence');

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/license');
  });

  /**
   * The regression that would make the redirect useless: `/api` is forwarded
   * wholesale to the store, and an over-broad rule reclaiming `/licence` would
   * send it to a host that has never served that path.
   */
  it('does not hand the old path to the store', async () => {
    const res = await call('https://bbanetwork.org/licence');

    expect(res.headers.get('location')).not.toContain('guides.bbanetwork.org');
  });

  it('declares /license as the canonical URL, not the old spelling', async () => {
    const body = await (await call('https://bbanetwork.org/license')).text();

    expect(body).toContain('<link rel="canonical" href="https://bbanetwork.org/license">');
  });
});
