/**
 * HTML rendering.
 *
 * Plain template strings, no framework. The hub is a handful of documents whose
 * content changes when a human edits src/businesses.ts — shipping a client-side
 * framework to render that would add a build step, a bundle, and a hydration
 * pass to produce markup that was already static.
 */

import {
  BUSINESSES,
  PUBLIC_BUSINESSES,
  APEX,
  SUPPORT_EMAIL,
  CONTACT_EMAIL,
  INSTAGRAM_URL,
  INSTAGRAM_HANDLE,
  destination,
  businessById,
} from './businesses';
import type { Business } from './businesses';
import { signalField, rule, bullet, bulletStop, icon, CARD_ART } from './motifs';
import { STYLES } from './styles';

/**
 * Escapes text for HTML.
 *
 * Everything interpolated into a template below goes through this. Today every
 * value comes from a TypeScript file in this repo and none of it is hostile —
 * but "the data is trusted" is a property of the current code, not of the
 * template, and the day someone renders a query parameter is the day the
 * missing escape becomes an XSS.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The waveform mark.
 *
 * Inlined rather than <img src="…animated.svg">, which is what the kit's README
 * suggests. Those files reference the keyframes but never define them — only
 * the HTML wrappers carry the @keyframes block — so an <img> embed renders a
 * completely static logo. Inlining also lets the bars take a theme token
 * instead of shipping a light copy and a dark copy.
 *
 * `animated` runs the kit's ambient loop; the timings live in src/styles.ts.
 */
function mark(className: string, animated = false): string {
  // Coordinates from bba-logo-animated-ambient-for-dark.svg. Symmetric about
  // y=48, which is where the blue rail sits.
  //
  // The per-bar delays are the kit's own, expressed as a fraction of the cycle:
  // its ambient (10s) and active (3.6s) files use identical fractions, so
  // --cycle alone switches speed and nothing here has to change.
  const bars: Array<[y: number, x1: number, x2: number, delay: number]> = [
    [20, 33.2, 54.8, 0],
    [27, 22.6, 65.4, -0.09],
    [34, 17.5, 70.5, -0.18],
    [41, 14.8, 73.2, -0.27],
    [55, 14.8, 73.2, -0.45],
    [62, 17.5, 70.5, -0.54],
    [69, 22.6, 65.4, -0.63],
    [76, 33.2, 54.8, -0.72],
  ];

  const lines = bars
    .map(
      ([y, x1, x2, d]) =>
        `<line class="bar" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" style="--d:${d}"/>`,
    )
    .join('');

  const classes = ['mark', className, animated ? 'mark-animated' : ''].filter(Boolean).join(' ');

  return `<svg class="${classes}" viewBox="12 16 114 64" fill="none" role="img" aria-label="BBA Network" xmlns="http://www.w3.org/2000/svg">
  <g class="mark-bars" stroke="currentColor" stroke-width="3.4">${lines}</g>
  <line x1="14" y1="48" x2="112" y2="48" stroke="#2B5CE6" stroke-width="3.4"/>
  <line class="mark-beam" x1="14" y1="48" x2="112" y2="48" stroke="var(--mark-beam)" stroke-width="3.4" pathLength="100" stroke-dasharray="14 86"/>
  <rect class="mark-node" x="116" y="44" width="8" height="8" fill="#2B5CE6"/>
</svg>`;
}

const STATUS_LABEL: Record<Business['status'], string> = {
  live: 'Live',
  building: 'Building',
  planned: 'Planned',
};

/**
 * A business named in running text or in the footer.
 *
 * `destination()` is the single source of truth for whether a host may be
 * linked, and this is the only way prose and the footer are allowed to reach
 * it. A `building` business renders as its name plus where it is going, not as
 * an anchor.
 *
 * This exists because the rule was previously enforced in `card()` alone. The
 * footer linked `https://${host}/` for every business unconditionally, and the
 * license page hard-coded both hosts — so `audit.bbanetwork.org`, which has no
 * DNS record, was a live dead link on every page of the site. The register's
 * own comment already said why that is worse than an absent link: it looks like
 * the whole network is broken, not one business that has not opened yet.
 */
function businessLink(business: Business): string {
  const url = destination(business);
  return url
    ? `<a href="${esc(url)}">${esc(business.name)}</a>`
    : `<span class="pending-ref">${esc(business.name)} <small>(${STATUS_LABEL[
        business.status
      ].toLowerCase()})</small></span>`;
}

/**
 * The same, by id, for prose that names one business.
 *
 * Throws on an unknown id rather than rendering nothing: a typo here is a
 * sentence with a hole in it, and the tests run this on every page.
 */
function businessLinkById(id: string): string {
  const business = businessById(id);
  if (!business) throw new Error(`No business with id "${id}" — check src/businesses.ts`);
  return businessLink(business);
}

/**
 * A business card.
 *
 * The status drives everything: a `live` business gets a real link and a
 * hoverable card; anything else gets a plain statement of where it is. There is
 * no version of this that renders a button to a host that does not resolve.
 */
function card(business: Business): string {
  const live = business.status === 'live';

  const highlights = business.highlights.length
    ? `<ul>${business.highlights
        .map((h) => `<li>${bullet()}<span>${esc(h)}</span></li>`)
        .join('')}</ul>`
    : '';

  // The click is counted server-side via /go/:id rather than with an inline
  // handler, so it works with JavaScript disabled and needs no consent banner —
  // nothing is stored about the visitor, only that the link was followed.
  const action = live
    ? `<a class="cta" href="/go/${esc(business.id)}">Visit ${esc(business.name)} ${icon('arrow-right')}</a>`
    : `<p class="pending-note">Opening at <code>${esc(business.host)}</code> shortly.</p>`;

  // Custom artwork per business, drawn in the mark's own language. A business
  // without one still renders — it just leads with the heading instead of a
  // band, which is better than a broken or generic placeholder.
  const art = CARD_ART[business.id];
  const band = art ? `<div class="card-art-band">${art()}</div>` : '';

  return `<article class="card ${live ? 'is-live' : 'is-pending'}">
  ${band}
  <div class="card-body">
    <div class="card-top">
      <h3>${esc(business.name)}</h3>
      <span class="pill ${business.status}"><span class="dot"></span>${STATUS_LABEL[business.status]}</span>
    </div>
    <p class="tagline">${esc(business.tagline)}</p>
    <p class="blurb">${esc(business.blurb)}</p>
    ${highlights}
    <div class="card-foot">
      ${action}
      ${business.priceHint ? `<span class="price">${esc(business.priceHint)}</span>` : ''}
    </div>
  </div>
</article>`;
}

interface PageOptions {
  title: string;
  description: string;
  path: string;
  body: string;
}

function layout({ title, description, path, body }: PageOptions): string {
  const canonical = `https://${APEX}${path}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="https://${APEX}/assets/png/bba-logo-stacked-for-dark.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B0F16" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#FAFAF8" media="(prefers-color-scheme: light)">
<link rel="icon" href="/assets/svg/bba-favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/png/bba-app-icon.png">
<!-- Preloaded because the stylesheet is inline: without this the browser does
     not discover the fonts until it has parsed the whole head, and the
     headline flashes in a system face first. -->
<link rel="preload" href="/fonts/space-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>${STYLES}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="wrap">
    <a class="brand" href="/">
      ${mark('')}
      <span class="brand-name">BBA <span class="thin">Network</span></span>
    </a>
    <nav aria-label="Primary">
      <a href="/#businesses">Businesses</a>
      <a href="/about">About</a>
      <a href="/license">License</a>
      <a href="mailto:${CONTACT_EMAIL}">Contact</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <h4>Businesses</h4>
        <ul>${PUBLIC_BUSINESSES.map((b) => `<li>${businessLink(b)}</li>`).join('')}</ul>
      </div>
      <div>
        <h4>Support</h4>
        <ul>
          <li><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></li>
        </ul>
      </div>
      <div>
        <h4>Network</h4>
        <ul>
          <li><a href="/about">About BBA Network</a></li>
          <li><a href="/license">License &amp; refunds</a></li>
          <li><a href="/api/stats">Network status</a></li>
        </ul>
      </div>
    </div>
    <div class="colophon">
      <span>&copy; ${new Date().getUTCFullYear()} BBA Network</span>
    </div>
  </div>
</footer>
</body>
</html>`;
}

export function renderHome(): string {
  const body = `
<section class="hero">
  ${signalField()}
  <div class="wrap">
    ${mark('hero-mark', true)}
    <h1>One network. Separate businesses.</h1>
    <p class="lede">
      BBA Network builds small, self-contained products that solve one problem properly.
    </p>
    <div class="hero-meta">
      <span>${icon('lock')} Payments handled by Stripe</span>
      <span>${icon('envelope')} <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></span>
    </div>
  </div>
</section>

${rule()}

<section class="section" id="businesses">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">The businesses</p>
      <h2>What BBA Network sells</h2>
    </div>
    <div class="cards">
      ${PUBLIC_BUSINESSES.map(card).join('\n')}
    </div>
  </div>
</section>`;

  return layout({
    title: 'BBA Network — small products that solve one problem properly',
    description:
      'BBA Network builds small, self-contained products: plain-English website health ' +
      'checks, and finished software you own outright. Each runs on its own domain.',
    path: '/',
    body,
  });
}

export function renderAbout(): string {
  const body = `
<section class="section">
  <div class="wrap">
    <div class="prose">
    <p class="eyebrow">About BBA Network</p>
    <h1>Small businesses. Useful products. Built with care.</h1>

    <p class="lead">
      BBA Network is a collection of independent businesses and products built to solve
      specific problems well.
    </p>
    <p>
      Rather than trying to build one company that does everything, each business has its own
      purpose, audience, and identity. That means you can find exactly what you&rsquo;re looking
      for without sorting through a collection of things that don&rsquo;t apply to you.
    </p>

    <h2>What we believe</h2>
    <p>
      The internet is full of products that are overcomplicated, overpromised, and difficult
      to use.
    </p>
    <p>We take a different approach.</p>
    <p>
      We build things that are clear, useful, straightforward, and worth paying for.
    </p>
    <p>
      That means putting time into the details that actually matter: making products easy to
      understand, making the buying experience simple, and making sure customers can get help
      when they need it.
    </p>

    <h2>Different businesses, one standard</h2>
    <p>
      The businesses within BBA Network may be completely different from one another. What
      connects them is the standard behind them.
    </p>
    <p>Every product should:</p>
    <ul class="checklist">
      <li>${bullet()}<span>Have a clear reason to exist.</span></li>
      <li>${bullet()}<span>Deliver what it promises.</span></li>
      <li>${bullet()}<span>Be simple to purchase and use.</span></li>
      <li>${bullet()}<span>Respect the customer&rsquo;s time and information.</span></li>
      <li>${bullet()}<span>Be supported by a real person when help is needed.</span></li>
    </ul>
    <p>
      Whether you&rsquo;re buying a digital product, using a service, or discovering something
      new, the goal is the same: make it useful and make it worth your time.
    </p>

    <h2>Built for customers</h2>
    <p>BBA Network is intentionally made up of independent businesses.</p>
    <p>
      Each one has its own website, products, support, and customer experience. This lets each
      business stay focused on the people it serves instead of becoming part of a large,
      complicated platform.
    </p>
    <p>You don&rsquo;t need to know how everything behind the scenes works.</p>
    <p>
      You just need to know that when you find something here that&rsquo;s useful to you,
      there&rsquo;s a real business behind it and someone who cares about making it better.
    </p>

    <h2>Have a question?</h2>
    <p>
      If you have a question about a product or purchase, contact the business directly through
      its support information.
    </p>
    <p>For general questions about BBA Network:</p>
    <p class="contact-line">
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
    </p>

    <a class="follow" href="${INSTAGRAM_URL}" rel="me noopener">
      <span class="follow-icon">${icon('instagram', 'icon')}</span>
      <span class="follow-text">
        <strong>${INSTAGRAM_HANDLE}</strong>
        <span>Follow BBA Network on Instagram</span>
      </span>
      <span class="follow-go">${icon('arrow-right')}</span>
    </a>
    </div>
  </div>
</section>`;

  return layout({
    title: 'About — BBA Network',
    description:
      'BBA Network is a collection of independent businesses and products built to solve ' +
      'specific problems well. Different businesses, one standard.',
    path: '/about',
    body,
  });
}

/** Allowed / not-allowed lists, using the mark's own bullet and its negative. */
function permissions(allowed: string[], refused: string[]): string {
  const list = (items: string[], marker: () => string, kind: string) =>
    `<ul class="checklist ${kind}">${items
      .map((t) => `<li>${marker()}<span>${esc(t)}</span></li>`)
      .join('')}</ul>`;

  return `<h3>What you may do</h3>
    ${list(allowed, bullet, 'may')}
    <h3>What you may not do</h3>
    ${list(refused, bulletStop, 'may-not')}`;
}

export function renderLicense(): string {
  const body = `
<section class="section">
  <div class="wrap">
    <div class="prose">
      <p class="eyebrow">License &amp; refunds</p>
      <h1>License &amp; refunds</h1>
      <p class="lead">
        What you can do with what you buy, and how to get your money back if it was not
        worth it. Three businesses, three sets of terms &mdash; they sell different things.
      </p>
      <nav class="jump" aria-label="On this page">
        <a href="#guides">Printable guides</a>
        <a href="#audit">Website Health Check</a>
        <a href="#production">BBA Production</a>
      </nav>

      <h2 id="guides">Printable guides</h2>
      <p class="applies">
        Applies to anything bought from ${businessLinkById('guides')}
        &mdash; the downloadable PDFs.
      </p>

      ${permissions(
        [
          'Print as many copies as you like, for as long as you like, for your own use.',
          'Photocopy the log sheets and blank templates — several are designed for it.',
          'Pin them up at home, in a shared workshop, or at your desk at work.',
          'Write on them, laminate them, mark them up.',
        ],
        [
          'Resell or redistribute the files, free or paid.',
          'Upload them to a file-sharing site, Discord, or a public drive.',
          'Sell printed copies.',
          'Republish the content as your own, in whole or in part.',
        ],
      )}

      <h3>Refunds</h3>
      <p>
        These are digital files delivered immediately, so the usual right to cancel does not
        apply once the download has started. That said &mdash; if a file is broken, will not
        open, or is plainly not what the listing described, email
        <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and you will get a refund. No
        form to fill in.
      </p>

      <h3>Download links</h3>
      <p>
        Links expire 72 hours after purchase. That is a security measure, not a limit on what
        you bought &mdash; email support with your order reference and you will get fresh
        links. Keep the receipt email; it is the proof of purchase.
      </p>

      <h3>Updates</h3>
      <p>
        When a guide is corrected or expanded, buyers get the new version at no cost. Email
        support with your order reference.
      </p>

      <h3>Payment and data</h3>
      <p>
        Payments are processed by Stripe. We never see or store your card details. The only
        thing this store keeps is what Stripe records about the order &mdash; your email
        address, so the files can be delivered, and what you bought.
      </p>
    </div>
  </div>
</section>

${rule()}

<section class="section">
  <div class="wrap">
    <div class="prose">
      <h2 id="audit">Website Health Check</h2>
      <p class="applies">
        Applies to the ${businessLinkById('audit')}
        &mdash; a report written for you, not a file off a shelf.
      </p>

      ${permissions(
        [
          'Use the report inside your business, for as long as you like.',
          'Send it to your developer, designer, or whoever does the work.',
          'Print it, copy it, and paste from it into your own tickets and briefs.',
          'Act on every recommendation in it. That is what it is for.',
        ],
        [
          'Resell the report, or pass it off as your own audit of someone else.',
          'Publish it in full, or quote it as an endorsement of your site.',
          'Order one report and share it across several unrelated businesses.',
        ],
      )}

      <h3>Refunds</h3>
      <p>
        This is a service, so nothing is delivered until a person has looked at your site.
        If the report is not useful &mdash; including the case where your site turns out to be
        fine and there is little to say &mdash; email
        <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and you will get a refund.
        Charging $100 to say &ldquo;looks good&rdquo; is not a business worth running.
      </p>

      <h3>Delivery</h3>
      <p>
        One working day from the point you have paid and sent the address of the site.
        Ordered on a Tuesday morning, you have it by Wednesday; ordered on a Friday evening,
        you have it by Monday. If something is going to take longer than that, you will hear
        why before the day is out rather than after it.
      </p>

      <h3>What the report is</h3>
      <p>
        Billy is a trained engineer who builds &amp; uses his own AI tools to inspect websites,
        detect issues, and uncover opportunities for improvement. Each review combines
        intelligent automation, technical measurements, and experienced human judgment to give
        you a clear picture of how your site is performing &mdash; and where it can be made
        better.
      </p>

      <h3>Payment and data</h3>
      <p>
        Payments are processed by Stripe. We never see or store your card details. What is
        kept is the order Stripe records, your email address so the report can be sent, and
        the address of the site you asked about. Nothing about your site is published or
        passed on.
      </p>

    </div>
  </div>
</section>

${rule()}

<section class="section">
  <div class="wrap">
    <div class="prose">
      <h2 id="production">BBA Production</h2>
      <p class="applies">
        Applies to a build bought from ${businessLinkById('production')}
        &mdash; software handed over as a repository, not a license to use ours.
      </p>

      ${permissions(
        [
          'Use it in your business, change it, extend it, and keep it for as long as you like.',
          'Run it on your own domain, your own hosting and your own payment account.',
          'Hire any developer you like to work on it. It is yours; you are not tied to us.',
          'Sell the business it runs, with the code included.',
        ],
        [
          'Resell or redistribute the build itself as a product or a template.',
          'Deploy one build for several unrelated businesses.',
          'Use our name, our sites, or our other clients&rsquo; work as a portfolio of your own.',
        ],
      )}

      <h3>The scope is agreed before anything starts</h3>
      <p>
        You get a fixed price and a written list of exactly what is included, and nothing is
        built until you have both. That is a protection in your direction as much as ours:
        &ldquo;minor adjustments&rdquo; is the whole idea, and the only way it stays minor for
        the money is if both of us can point at the same list afterwards. Anything outside it
        gets quoted separately rather than absorbed quietly or dropped quietly.
      </p>

      <h3>Refunds</h3>
      <p>
        If what is handed over does not do what the agreed scope says, it gets fixed, and if it
        cannot be fixed you get your money back. Email
        <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. What is not a refund is a
        change of mind about the scope after the work is done &mdash; that is new work, and it
        gets quoted like new work.
      </p>

      <h3>After handover</h3>
      <p>
        One round of fixes is included, and the window is stated in writing when the work is
        agreed rather than left vague here. After that, the repository is yours and you are
        free to take it to anyone; further work from us is quoted per job. Nothing expires,
        nothing phones home, and there is no subscription to cancel.
      </p>

      <h3>What arrives</h3>
      <p>
        The repository, with the setup written for someone who is not a developer. Every copy
        is searched before it is sent for anything of ours left inside it &mdash; our domains,
        our accounts, our keys. What you receive should mention your business and nobody
        else&rsquo;s.
      </p>

      <h3>Payment and data</h3>
      <p>
        There is no checkout here, because there is nothing on a shelf to buy: the price
        depends on the changes you want, so it is quoted and invoiced per project. The enquiry
        form keeps what you send it &mdash; your name, your address, and what you asked about
        &mdash; in our own database. It is not sold, and it is not passed to anyone.
      </p>

      <p class="note-small">
        Questions about any of this before you buy:
        <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
      </p>
    </div>
  </div>
</section>`;

  return layout({
    title: 'License & refunds — BBA Network',
    description:
      'What you can do with what you buy from BBA Network, and how refunds work — for the ' +
      'printable guides, the Website Health Check, and a build from BBA Production.',
    path: '/license',
    body,
  });
}

export function renderNotFound(): string {
  const body = `
<section class="section">
  <div class="wrap">
    <div class="prose">
    <p class="eyebrow">404</p>
    <h1>That page is not here.</h1>
    <p>
      If you followed a link to a product or a download, it has moved to its own site. The
      businesses are listed below.
    </p>
    </div>
  </div>
  <div class="wrap" style="margin-top:2.5rem">
    <div class="cards">
      ${PUBLIC_BUSINESSES.map(card).join('\n')}
    </div>
  </div>
</section>`;

  return layout({
    title: 'Not found — BBA Network',
    description: 'That page is not here.',
    path: '/404',
    body,
  });
}

/** Only live, listed businesses belong in a sitemap. */
export function renderSitemap(): string {
  const urls = ['/', '/about', '/license']
    .map((p) => `  <url><loc>https://${APEX}${p}</loc></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export { BUSINESSES, PUBLIC_BUSINESSES };
