/**
 * These tests exist because of one specific failure mode.
 *
 * The store used to be `bbanetwork.org`. Once it has taken a sale, a customer
 * holds an email with a signed link to `bbanetwork.org/api/download?token=…`
 * and may not click it for months. If the apex move breaks that link, they paid
 * for a file they cannot get, and the first you hear about it is a refund
 * request — or, more likely, silence.
 *
 * The live account has taken no charges yet, so nothing is currently at risk.
 * That is exactly why this is cheap to get right now: the rules and their tests
 * cost minutes today and are already in place when the first sale lands.
 *
 * So: the download path, the method preservation, and the query string are all
 * asserted rather than assumed.
 */

import { describe, it, expect } from 'vitest';
import { legacyRedirect } from '../src/redirects';

const at = (path: string) => legacyRedirect(new URL(`https://bbanetwork.org${path}`));

describe('legacy apex redirects', () => {
  describe('the download link in a paying customer’s inbox', () => {
    it('survives, with its signing token intact', () => {
      const result = at('/api/download?token=abc123&product=espresso-dial-in-card');

      expect(result).not.toBeNull();
      expect(result!.location).toBe(
        'https://guides.bbanetwork.org/api/download?token=abc123&product=espresso-dial-in-card',
      );
    });

    it('uses 308, so a POST cannot be silently downgraded to GET', () => {
      // A 301/302 permits the client to rewrite the method. For /api/checkout
      // and /api/stripe/webhook that turns a payment into a no-op.
      expect(at('/api/checkout')!.status).toBe(308);
      expect(at('/api/stripe/webhook')!.status).toBe(308);
    });
  });

  describe('indexed store pages', () => {
    it('moves a product page with 301 so the ranking transfers', () => {
      const result = at('/products/espresso-dial-in-card');

      expect(result!.status).toBe(301);
      expect(result!.location).toBe('https://guides.bbanetwork.org/products/espresso-dial-in-card');
    });

    it('moves the products index itself, not just pages beneath it', () => {
      expect(at('/products')!.location).toBe('https://guides.bbanetwork.org/products');
    });

    it('carries the post-checkout page across', () => {
      expect(at('/success?session_id=cs_test_1')!.location).toBe(
        'https://guides.bbanetwork.org/success?session_id=cs_test_1',
      );
    });
  });

  describe('paths the hub keeps for itself', () => {
    it('serves the apex, about and /go itself', () => {
      expect(at('/')).toBeNull();
      expect(at('/about')).toBeNull();
      expect(at('/go/guides')).toBeNull();
    });

    it('keeps /license, which the hub now serves for the whole network', () => {
      // It used to 301 to the store. The hub's own license page covers the
      // guides and the health check, so a receipt link to bbanetwork.org/license
      // now lands on terms that describe what was bought rather than being
      // bounced to a page about only half the network.
      expect(at('/license')).toBeNull();
    });

    it('keeps its own /api/stats and /api/health despite the /api rule', () => {
      // The regression this guards: /api is forwarded wholesale to the store,
      // which would take the hub's own status endpoints with it. Project 4's
      // watchdog polls /api/health — pointing it at another host would make it
      // report on the wrong service.
      expect(at('/api/stats')).toBeNull();
      expect(at('/api/health')).toBeNull();
    });

    it('does not hand a lookalike prefix to the store', () => {
      // `/productsomething` is not `/products/…`. Matching on a bare
      // `startsWith` would wrongly redirect it.
      expect(at('/productsomething')).toBeNull();
      expect(at('/apiary')).toBeNull();
    });
  });

  describe('path normalisation', () => {
    it('treats a trailing slash as the same path', () => {
      expect(at('/products/')!.location).toBe('https://guides.bbanetwork.org/products');
    });
  });
});
