/**
 * The business register.
 *
 * This is the one file you edit when a business is added, renamed, moved to a
 * different host, or starts actually selling something. The hub page, the
 * redirect map, the sitemap and /api/stats all read from here.
 *
 * What is deliberately NOT here: any claim that changes on its own. Whether a
 * business is *earning* is Stripe's business and Project 4's dashboard shows
 * it. This file records what a business IS and WHERE it lives — facts that
 * only change when a human changes them.
 *
 * The honesty rule, inherited from Project 4: a status of `live` is a promise
 * that a customer can reach that host and give you money today. If that is not
 * true, the correct value is `building`, and the hub renders it as such rather
 * than shipping a card that leads to a dead link.
 */

/** How a business takes money. Drives which call-to-action the card renders. */
export type RevenueModel =
  | 'stripe-checkout' // self-serve — Stripe Checkout, instant delivery
  | 'stripe-payment-link' // self-serve — a hosted Payment Link, delivery by hand
  | 'enquiry' // not self-serve — an enquiry form, then a scope, then a quote
  | 'internal'; // not for sale; internal tooling

export type Status =
  | 'live' // reachable, and a customer can buy today
  | 'building' // exists, not yet reachable at its host
  | 'planned'; // named and reserved, nothing built

export interface Business {
  /** URL-safe id. Stable — the redirect map and KV click counters key on it. */
  id: string;
  /** The subdomain this business owns. The whole point of the split. */
  host: string;
  name: string;
  /** What it sells, in the customer's words. One line, no hype. */
  tagline: string;
  /**
   * The longer pitch. Two or three sentences — this is a hub, not a landing
   * page; the business's own site does the selling.
   */
  blurb: string;
  status: Status;
  revenueModel: RevenueModel;
  /** Which repo builds and deploys this. Not this one, for every entry below. */
  repo: string;
  /** Project 4's portfolio slug, so its runs and this hub agree on names. */
  portfolioSlug: string;
  /**
   * Shown on the card. Kept vague on purpose: exact prices live on the sites.
   *
   * Vague about the *amount*, never about the currency. This read "From a few
   * pounds" for the store while `network-store-2/catalog/products.json` had
   * `"currency": "usd"` and every guide priced at 945 minor units — so the hub
   * quoted a currency the checkout does not take, on the one line a visitor
   * reads before deciding whether they can afford it. The network sells in
   * USD. Write the symbol.
   */
  priceHint?: string;
  /** Listed on the card so a visitor knows what they are getting before a click. */
  highlights: string[];
  /** Excluded from the public hub and from the sitemap. */
  unlisted?: boolean;
  /**
   * A site this hub serves on the business's own hostname, by fetching it from
   * somewhere else. The exception to "the hub is a signpost", and it is here
   * with its reason attached rather than buried in the router.
   *
   * Only `audit` uses it. Project 1's sales site is built and published — it
   * has been live and taking Stripe payments at
   * `billy-bad-ass.github.io/sitecheck-1/audit/` — but it is published to
   * *GitHub* Pages, whose custom domains map to the repository root, and that
   * root serves a different product entirely. So the one free route to
   * `audit.bbanetwork.org` would have shown the wrong business.
   *
   * The intended route is Cloudflare Pages, and it needs a Cloudflare API
   * token that only an account holder can mint. Rather than leave a finished,
   * paid-for product unreachable at its own address while waiting on a
   * credential, the hub — which already answers on that hostname — fetches it
   * and serves it. The visitor sees `audit.bbanetwork.org` throughout.
   *
   * **This is a bridge, and it should be dismantled.** When the Cloudflare
   * Pages project exists and owns the hostname, delete this field: the router
   * stops matching, `destination()` is unchanged, and nothing else moves.
   */
  upstream?: string;
}

export const APEX = 'bbanetwork.org';
export const SUPPORT_EMAIL = `support@${APEX}`;
export const CONTACT_EMAIL = `hello@${APEX}`;

/**
 * The network's Instagram.
 *
 * Stored without the query string it was shared with. That link carried
 * `igsi=` — a share-session identifier Instagram mints per share — and
 * `utm_source=qr`, which would have tagged every visitor arriving from this
 * site as a QR scan in Instagram's own analytics. Neither belongs in a link
 * published on a website.
 */
export const INSTAGRAM_URL = 'https://www.instagram.com/bba.network';
export const INSTAGRAM_HANDLE = '@bba.network';

/**
 * Note on hosts: nothing here is pointed automatically. Adding a custom domain
 * to a Worker is done in the Cloudflare dashboard, on purpose — a `routes`
 * entry in wrangler.jsonc makes the deploy responsible for creating DNS
 * records, and the deploy token does not have that permission. See
 * docs/DOMAINS.md.
 */
export const BUSINESSES: Business[] = [
  {
    id: 'guides',
    host: `guides.${APEX}`,
    name: 'BBA Guides',
    tagline:
      'Printable reference guides for the hobbies Billy actually cares about \u2014 designed ' +
      'to solve the annoying little problems that usually send you searching through forums, ' +
      'videos, and half-finished notes.',
    blurb:
      'One page, one problem, built around the way the hobby is actually done. Print it, keep ' +
      'it beside your setup, and get back to making things.',
    // Probed from a GitHub runner on 2026-08-29 at 04:59 UTC — 00:59 ET:
    // `guides.bbanetwork.org` answered `200`. The redirect guard has logged the
    // same `200` on every run since 2026-08-24, so this said `building` for
    // five days while the store was open and taking checkout. See the note on
    // `linkWarden` in src/checks.ts for why nothing caught it.
    status: 'live',
    revenueModel: 'stripe-checkout',
    repo: 'Billy-Bad-Ass/network-store-2',
    portfolioSlug: 'project-2',
    /**
     * Off the hub since 2026-09-04, at Billy's request, and going back on
     * later. `unlisted` rather than deleting the entry, because the store is
     * still open and still taking checkout: /go/guides, the receipt redirects
     * in src/redirects.ts and the license terms all keep working, and a
     * customer holding an old download link is not stranded. Putting it back
     * is deleting this one line.
     */
    unlisted: true,
    priceHint: 'From $9.45',
    highlights: [
      'Espresso dial-in troubleshooting card',
      'Keyboard sound & mod chart',
      'Miniature speed-paint recipe sheet',
      'A4 and US Letter, instant download',
    ],
  },
  {
    id: 'audit',
    host: `audit.${APEX}`,
    name: 'Website Health Check',
    tagline: "A plain-English review of what's broken on your website.",
    blurb:
      'Billy is a trained engineer who builds & uses his own AI tools to inspect websites, ' +
      'detect issues, and uncover opportunities for improvement. Each review combines ' +
      'intelligent automation, technical measurements, and experienced human judgment to give ' +
      'you a clear picture of how your site is performing \u2014 and where it can be made better.',
    // `live`, and this time the word was earned before it was written.
    //
    // The hostname was attached to `bba-network-hub` on 2026-09-03, and the
    // guard found it within the minute — its drift check reported "marked
    // building but answered 200. The bridge is working." Probed for content
    // rather than status, from a runner, before this line changed:
    //
    //     served-by  bba-network-hub (bridge)
    //     title      Website Health Check — find what's costing you customers
    //     buy link   YES
    //     hub page?  no
    //     /legal.html                → 200 text/html
    //     /assets/report-preview.png → 200 image/png
    //
    // That last pair matters as much as the first: a `200` alone was what this
    // hostname returned on 2026-08-29 while serving the hub's own homepage, so
    // "it answers" was never the question. What the page says is.
    status: 'live',
    revenueModel: 'stripe-payment-link',
    repo: 'Billy-Bad-Ass/sitecheck-1',
    portfolioSlug: 'project-1',
    upstream: 'https://billy-bad-ass.github.io/sitecheck-1/audit/',
    priceHint: '$100 one-off',
    highlights: [
      'Every issue ranked by what it costs you',
      'Plain English — no jargon, no dashboard to learn',
      'Fixes you can hand straight to a developer',
      'One working day',
    ],
  },
  {
    id: 'production',
    host: `production.${APEX}`,
    name: 'BBA Production',
    tagline:
      'Working software you own outright \u2014 built here, then handed over with the keys.',
    blurb:
      'Pick something already built and running, name the parts to change to your business, and ' +
      'the whole thing becomes yours: your repository, your content, your domain, your accounts. ' +
      'Websites are sold the same way, using ours as the reference.',
    /**
     * `live`, and the word was earned before it was written.
     *
     * The hostname was attached to `bba-production-form` on 2026-09-03 and
     * probed from a GitHub runner at 18:59 UTC — 2:59 PM ET — before this line
     * changed. Probed for *content*, not status, because a `200` alone has
     * already lied to this repository once: `audit.bbanetwork.org` returned
     * `200` for five days in August while serving the hub's own homepage.
     *
     *     production (production.bbanetwork.org, building) → 200
     *     production (production.bbanetwork.org) → 200 — BBA Production — We build it. You own it.
     *
     * The second line is the one that matters. That is BBA Production's own
     * page title, so the hostname is serving the business this entry claims it
     * is, and not the hub, and not a placeholder.
     *
     * The site is the `bba-production-form` Worker, built from
     * `bba-production/form/` in `Billy-Bad-Ass/Code`. Not bridged: a Worker on
     * this account owns a custom domain directly, so there is nothing here to
     * dismantle later.
     */
    status: 'live',
    revenueModel: 'enquiry',
    repo: 'Billy-Bad-Ass/Code',
    /**
     * Not `project-N`. The numbered slugs match the numbered repositories, and
     * BBA Production does not have one \u2014 it is a business that lives inside
     * `Code`, and every number up to 6 is already taken by a repo it is not.
     * Inventing one would put a name in Project 4's portfolio that points at
     * the wrong thing.
     */
    portfolioSlug: 'bba-production',
    /**
     * Deliberately not an amount, and not "from" an amount either.
     *
     * Every other card can name a price because it sells a fixed thing. This
     * sells an adjustment to a build, and the size of the adjustment is the
     * whole variable \u2014 quoting before it is scoped is how "minor changes"
     * quietly becomes a rewrite that was priced as a rename. The rule is in
     * `Code/CLAUDE.md`; this line is what it looks like on a card.
     */
    priceHint: 'Quoted per project',
    highlights: [
      'A clean repository, yours to keep',
      'Your branding, your content, your domain',
      'Setup instructions written for a non-developer',
      'One round of fixes after handover',
    ],
  },
  {
    id: 'heartbeat',
    host: `heartbeat.${APEX}`,
    name: 'Heartbeat',
    tagline: 'The instrument panel for the portfolio.',
    blurb:
      'Internal. Live numbers for every project — what it earns, what it costs, and what the ' +
      'agent fleet did about any of it. Behind Cloudflare Access.',
    status: 'live',
    revenueModel: 'internal',
    repo: 'Billy-Bad-Ass/dashboard-4',
    portfolioSlug: 'project-4',
    highlights: [],
    unlisted: true,
  },
];

/** The businesses the public hub renders, in the order it renders them. */
export const PUBLIC_BUSINESSES = BUSINESSES.filter((b) => !b.unlisted);

export function businessById(id: string): Business | undefined {
  return BUSINESSES.find((b) => b.id === id);
}

/**
 * A business is only linked as a destination once it is reachable. `building`
 * renders as a disabled card with an honest label rather than a link to a host
 * that does not resolve yet — a dead link on the hub is worse than an absent
 * one, because it looks like the whole network is broken.
 */
export function destination(business: Business): string | null {
  return business.status === 'live' ? `https://${business.host}/` : null;
}

/**
 * The businesses this Worker answers for on their own hostname.
 *
 * Used by two callers that must not disagree: the router, which decides what
 * to proxy, and `linkWarden`, which must not probe them — a Worker's
 * subrequest to a hostname it serves is answered `522` by Cloudflare, so a
 * warden that checked these would report a daily outage that is not happening.
 * That trap has already cost this repository one silent fortnight; see the
 * note above `SCHEDULE` in src/index.ts.
 */
export const BRIDGED = BUSINESSES.filter((b) => b.upstream);

/** The bridged business serving this hostname, if any. */
export function bridgeFor(hostname: string): Business | undefined {
  return BRIDGED.find((b) => b.host === hostname.toLowerCase());
}
