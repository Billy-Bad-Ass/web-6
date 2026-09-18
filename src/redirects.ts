/**
 * Legacy apex paths.
 *
 * The store used to BE `bbanetwork.org`. Moving it to `guides.bbanetwork.org`
 * means every URL a customer bookmarked, every link Google has indexed, and
 * every download link in a sent receipt now points at a host that no longer
 * serves the store.
 *
 * ## How much this currently protects
 *
 * Be honest about it: at the time of writing the live Stripe account has taken
 * no charges, so nobody is holding a store download link yet, and the store has
 * no accumulated search authority for a 301 to carry. Project 4 read the same
 * facts and concluded a redirect layer protects nothing today. That is a fair
 * reading of today.
 *
 * It is kept anyway, for two reasons that outlast today:
 *
 *   - The window this covers opens on the first sale, not on the deploy. A
 *     download link lives in an inbox for months. Adding these rules costs a
 *     few lines and one test file; adding them *after* the first customer
 *     cannot reach their file costs a refund and the trust behind it.
 *   - `HUB_OWNED` below is load-bearing regardless of sales: without it the
 *     hub forwards its own `/api/health` to the store, and Project 4's watchdog
 *     silently monitors the wrong service.
 *
 * So this module is insurance, not a live rescue. Do not weaken it on the
 * grounds that nothing has broken yet — that is the point of insurance.
 *
 * ## Why two different status codes
 *
 * `301` for pages: it is the code search engines treat as "move the ranking",
 * and browsers cache it hard. Correct for content that moved.
 *
 * `308` for `/api/*`: a 301 or 302 permits a client to rewrite a POST into a
 * GET when it follows the redirect. For `/api/stripe/webhook` and
 * `/api/checkout` that would silently turn a payment into a no-op. 308 is the
 * permanent redirect that *requires* the method and body to be preserved.
 *
 * ## The webhook still needs a human
 *
 * 308 makes download links keep working, because browsers follow redirects.
 * It does NOT reliably save the Stripe webhook: Stripe treats a 3xx response
 * as a failed delivery rather than following it. The endpoint URL has to be
 * repointed in the Stripe dashboard to `https://guides.bbanetwork.org/api/stripe/webhook`.
 * Until that is done, this redirect is a safety net for customer traffic and
 * nothing more. See docs/DOMAINS.md, "Before you move the apex".
 */

const GUIDES = 'https://guides.bbanetwork.org';

interface Rule {
  /** Matches when the request path equals this, or starts with it plus `/`. */
  prefix: string;
  /** Where it goes. The matched suffix and the query string are carried over. */
  target: string;
  status: 301 | 308;
  why: string;
}

/**
 * Ordered: the first matching rule wins, so put the more specific prefix first.
 * `/api` sits above nothing else today, but the ordering guarantee is what lets
 * a future `/api/download/bulk` rule be added above it without surprises.
 */
export const LEGACY_RULES: Rule[] = [
  {
    prefix: '/api',
    target: `${GUIDES}/api`,
    status: 308,
    why: 'Checkout, webhook and the signed download links already in inboxes. Method-preserving.',
  },
  {
    prefix: '/products',
    target: `${GUIDES}/products`,
    status: 301,
    why: 'Indexed product pages. This is where the store’s search authority lives.',
  },
  {
    prefix: '/success',
    target: `${GUIDES}/success`,
    status: 301,
    why: 'Post-checkout landing. Reached mid-purchase, so it must not 404.',
  },
];

/**
 * Paths under a redirected prefix that the hub serves itself.
 *
 * `/api` is forwarded wholesale to the store, which is correct for checkout,
 * the webhook and download links — but the hub has its own `/api/stats` and
 * `/api/health`, and without this exception list it would forward its own
 * status endpoints to a store that has never heard of them. Project 4's
 * heartbeat-watchdog polls `/api/health`; a 308 to another host is exactly the
 * kind of "monitoring that monitors the wrong thing" that hides an outage.
 *
 * `/license` was forwarded to the store until the hub grew a license page of
 * its own. It now covers both businesses — the guides and the health check —
 * so the apex serving it is not a regression on the redirect it replaces: a
 * receipt linking to bbanetwork.org/license lands on terms that still describe
 * what was bought, and now describes the other business too. The store keeps
 * its own copy at guides.bbanetwork.org/licence; this is the network's.
 *
 * `/licence` is the same path's old spelling, kept for the receipts issued
 * while the page lived there. The hub answers it with a 301 to `/license`,
 * which it can only do if the store's `/api`-era rules never get to see it.
 */
const HUB_OWNED = new Set(['/api/stats', '/api/health', '/license', '/licence']);

export interface Redirect {
  location: string;
  status: 301 | 308;
}

/**
 * Resolves a legacy apex path, or null when the hub should serve it itself.
 *
 * Note what is deliberately absent: `/about`. The store had one, and so does
 * the network — at the apex, "about" now means the network. An inbound link
 * lands on a related page rather than a 404, which is the right trade for a
 * page that carries no purchase intent.
 */
export function legacyRedirect(url: URL): Redirect | null {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (HUB_OWNED.has(path)) return null;

  for (const rule of LEGACY_RULES) {
    if (path !== rule.prefix && !path.startsWith(`${rule.prefix}/`)) continue;

    const suffix = path.slice(rule.prefix.length);
    return {
      location: `${rule.target}${suffix}${url.search}`,
      status: rule.status,
    };
  }

  return null;
}
