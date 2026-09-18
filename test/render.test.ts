/**
 * Render smoke tests.
 *
 * These exist because of a specific near-miss: a backtick inside a CSS comment
 * terminated the STYLES template literal early. TypeScript was happy, the tests
 * were happy, and the only symptom was the dev server refusing to boot. Calling
 * the render functions in a test turns that class of bug — anything that makes
 * a page fail to build — into a red test rather than a broken deploy.
 *
 * They assert the promises the hub makes, not the markup it happens to emit.
 */

import { describe, it, expect } from 'vitest';
import {
  renderHome,
  renderAbout,
  renderLicense,
  renderNotFound,
  renderSitemap,
  esc,
} from '../src/render';
import { PUBLIC_BUSINESSES, BUSINESSES, destination, type Business } from '../src/businesses';
import { STYLES } from '../src/styles';
import { CARD_ART } from '../src/motifs';

describe('the stylesheet', () => {
  it('is whole — not truncated by a stray backtick in a comment', () => {
    expect(STYLES.length).toBeGreaterThan(3000);
    // The last rule in the file. If the template terminated early, this is gone.
    expect(STYLES).toContain('.notice');
    expect(STYLES).toContain(':root');
  });

  it('defines every status colour in both themes', () => {
    // A token defined only in the dark block renders as an invalid colour in
    // light mode, which browsers silently drop.
    for (const token of ['--status-live', '--status-building']) {
      const occurrences = STYLES.split(token).length - 1;
      expect(occurrences, `${token} should be defined twice and used`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the home page', () => {
  const html = renderHome();

  it('renders', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
  });

  it('names every public business', () => {
    for (const business of PUBLIC_BUSINESSES) {
      expect(html).toContain(business.name);
      expect(html).toContain(business.host);
    }
  });

  it('does not link a business that is not reachable yet', () => {
    // The rule the whole card component exists to enforce: no button pointing
    // at a host that does not resolve.
    for (const business of PUBLIC_BUSINESSES) {
      if (business.status !== 'live') {
        expect(html).not.toContain(`href="/go/${business.id}"`);
      }
    }
  });

  /**
   * `card()` renders without artwork rather than breaking, which is the right
   * behaviour for a half-finished entry and the wrong thing to ship. A card
   * with no band beside two that have one does not read as "this one is new",
   * it reads as broken CSS.
   *
   * Keyed on the register so the omission is caught when the business is
   * added, not when someone notices the front page looks lopsided.
   */
  it('draws artwork for every listed business', () => {
    for (const business of PUBLIC_BUSINESSES) {
      expect(CARD_ART[business.id], `no card art for "${business.id}" in src/motifs.ts`).toBeTypeOf(
        'function',
      );
    }
    const bands = html.split('class="card-art-band"').length - 1;
    expect(bands).toBe(PUBLIC_BUSINESSES.length);
  });

  it('keeps the internal dashboard off the public page', () => {
    const heartbeat = BUSINESSES.find((b) => b.id === 'heartbeat')!;
    expect(heartbeat.unlisted).toBe(true);
    expect(html).not.toContain(heartbeat.host);
  });

  it('carries no third-party attribution, because every mark is drawn here', () => {
    // The icons were Font Awesome under CC BY 4.0, which obliges a visible
    // credit on every page. They are original now, so the credit is gone — and
    // this asserts the two cannot come back separately. Re-introducing a
    // borrowed glyph without its attribution is the failure to catch.
    expect(html).not.toContain('Font Awesome');
    expect(html).not.toContain('fontawesome');
    expect(html).not.toContain('CC BY');
  });

  it('ships no JavaScript, which is what lets the CSP forbid it', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/\son(click|load|error)=/);
  });
});

describe('the other pages', () => {
  it('render without throwing', () => {
    expect(renderAbout()).toContain('</html>');
    expect(renderNotFound()).toContain('</html>');
  });

  it('produce a sitemap with a valid namespace', () => {
    const xml = renderSitemap();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('<loc>https://bbanetwork.org/</loc>');
  });
});

describe('escaping', () => {
  it('neutralises markup', () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes the ampersand first, so entities are not double-broken', () => {
    expect(esc('Sound & Mod')).toBe('Sound &amp; Mod');
    expect(esc('a<b&c')).toBe('a&lt;b&amp;c');
  });
});

describe('the animated mark', () => {
  const html = renderHome();

  it('animates in the hero and stays still in the masthead', () => {
    // A logo looping in a sticky header sits in peripheral vision on every
    // page. The hero is where the mark is the subject, so that is where it
    // moves.
    expect(html).toContain('class="mark hero-mark mark-animated"');
    expect(html).toContain('class="mark"');
    const mastheadMark = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(mastheadMark).toContain('<svg class="mark"');
    expect(mastheadMark).not.toContain('mark-animated');
  });

  it("carries the kit's own per-bar delays, as cycle fractions", () => {
    // From bba-logo-animated-*.svg. Both its variants use identical fractions
    // (ambient/10s and active/3.6s), which is why --cycle alone switches speed.
    for (const d of ['--d:0', '--d:-0.09', '--d:-0.27', '--d:-0.45', '--d:-0.72']) {
      expect(html).toContain(d);
    }
  });

  it('draws the travelling beam with the dash geometry from the kit', () => {
    expect(html).toContain('pathLength="100"');
    expect(html).toContain('stroke-dasharray="14 86"');
  });

  it('defines all three of the kit\'s loops', () => {
    for (const name of ['mark-pulse', 'mark-beam', 'mark-node']) {
      expect(STYLES, `@keyframes ${name} should exist`).toContain(`@keyframes ${name}`);
    }
  });

  it('stops every loop under prefers-reduced-motion', () => {
    // An infinitely looping logo is exactly what that setting is for.
    const block = STYLES.slice(STYLES.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('.mark-animated .bar');
    expect(block).toContain('.mark-animated .mark-beam');
    expect(block).toContain('.mark-animated .mark-node');
    expect(block).toContain('animation: none');
  });

  it('takes the bar colour from a token defined in both themes', () => {
    // The kit ships a light and a dark file differing only in this colour.
    // Inlining with a token means one mark instead of two, but only if the
    // token exists in both blocks — one defined solely in dark renders as an
    // invalid colour in light and is silently dropped.
    expect(STYLES.split('--mark-bar:').length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe('rendered markup is well-formed', () => {
  // Nesting broke once already: `.prose` sets a max-width, and putting it on
  // the same element as `.wrap` overrode the wrap's width so the whole column
  // re-centred and stopped lining up with the masthead. Fixing it meant adding
  // a nested div to three pages by hand, which is exactly the edit that leaves
  // a tag unclosed.
  const VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'source', 'track', 'wbr',
  ]);

  function findNestingError(html: string): string | null {
    const stack: Array<{ tag: string; line: number }> = [];
    const pattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(html)) !== null) {
      const [, closing, rawTag, selfClosing] = m;
      const tag = rawTag!.toLowerCase();
      if (VOID.has(tag) || selfClosing === '/') continue;
      const line = html.slice(0, m.index).split('\n').length;

      if (closing === '/') {
        const top = stack.pop();
        if (!top) return `line ${line}: </${tag}> with nothing open`;
        if (top.tag !== tag) {
          return `line ${line}: </${tag}> closes <${top.tag}> opened at line ${top.line}`;
        }
      } else {
        stack.push({ tag, line });
      }
    }

    const unclosed = stack[0];
    return unclosed ? `<${unclosed.tag}> at line ${unclosed.line} is never closed` : null;
  }

  it.each([
    ['home', renderHome],
    ['about', renderAbout],
    ['404', renderNotFound],
  ])('%s', (_name, render) => {
    expect(findNestingError(render())).toBeNull();
  });

  it('keeps the reading column inside .wrap rather than narrowing it', () => {
    // `class="wrap prose"` is the regression: it re-centres the column.
    for (const render of [renderAbout, renderNotFound]) {
      expect(render()).not.toContain('class="wrap prose"');
    }
  });
});

describe('the Instagram link', () => {
  const about = renderAbout();
  const home = renderHome();

  it('lives on the About page, not in every page footer', () => {
    // It belongs with the person the page is about, not as colophon dust
    // repeated on every page of the site.
    expect(about.split('instagram.com/bba.network').length - 1).toBe(1);
    expect(about).toContain('@bba.network');
    expect(home).not.toContain('instagram.com');
  });

  it('carries no share-session or campaign parameters', () => {
    // It was given as a QR share link: `igsi=` is a per-share session
    // identifier, and `utm_source=qr` would tag every visitor arriving from
    // this site as a QR scan in Instagram's analytics. Publishing either is a
    // small, permanent lie about where the traffic came from.
    expect(about).not.toContain('igsi');
    expect(about).not.toContain('utm_source');
    expect(about).toContain('href="https://www.instagram.com/bba.network"');
  });

  it('does not open a hole for tab-nabbing', () => {
    const anchor = about.slice(about.indexOf('class="follow"'));
    expect(anchor.slice(0, 200)).toContain('noopener');
  });

  it('leaves the colophon to the copyright line alone', () => {
    const colophon = home.slice(home.indexOf('class="colophon"'), home.indexOf('</footer>'));
    expect(colophon).not.toContain('hello@bbanetwork.org');
    expect(colophon).not.toContain('instagram');
  });
});

describe('the footer Support column', () => {
  const html = renderHome();
  const support = html.slice(html.indexOf('<h4>Support</h4>'));
  const column = support.slice(0, support.indexOf('</ul>'));

  it('lists the support address only', () => {
    // A buyer with a broken download needs one address, not a choice between
    // two. hello@ is for general enquiries and belongs elsewhere.
    expect(column).toContain('support@bbanetwork.org');
    expect(column).not.toContain('hello@bbanetwork.org');
  });

  it('has not removed the contact address from the site', () => {
    // Still in the nav and on the About page — dropping it from one column
    // should not make it unreachable.
    expect(html).toContain('hello@bbanetwork.org');
    expect(renderAbout()).toContain('hello@bbanetwork.org');
  });
});

describe('the License page', () => {
  const html = renderLicense();
  // The source wraps prose across lines, so a phrase can straddle a newline
  // and several spaces. Assert against the text a reader sees, not the
  // whitespace the template happens to use.
  const flat = html.replace(/\s+/g, ' ');

  /**
   * Named individually AND checked as a set.
   *
   * This used to be the four hard-coded assertions below and nothing else, and
   * that is a test which passes forever while going quietly out of date: a
   * third business was added to the register on 2026-09-03 and every one of
   * those four still passed, on a page whose own opening line said "Two
   * businesses, two sets of terms".
   *
   * A visitor who buys the newest thing and comes here for the refund terms
   * finds terms for the other two. That is the failure worth catching, and it
   * is only catchable by asking the register how many there are.
   */
  it('has a section and a jump link for every listed business', () => {
    const jump = flat.slice(flat.indexOf('<nav class="jump"'));
    const nav = jump.slice(0, jump.indexOf('</nav>'));

    for (const business of PUBLIC_BUSINESSES) {
      expect(html, `no <h2 id="${business.id}"> on the license page`).toContain(
        `id="${business.id}"`,
      );
      expect(nav, `${business.id} missing from the jump nav`).toContain(`href="#${business.id}"`);
    }
  });

  it('covers each business by name, not just the downloads', () => {
    expect(html).toContain('Printable guides');
    expect(html).toContain('Website Health Check');
    expect(html).toContain('BBA Production');
  });

  it('states refund terms for each, because they differ', () => {
    // Files delivered instantly vs a service a person performs — the right to
    // cancel works differently, and one page covering both has to say so twice.
    expect(flat).toContain('the usual right to cancel does not apply');
    expect(flat).toContain('nothing is delivered until a person has looked at your site');
  });

  it('quotes the health check in the currency it is actually sold in', () => {
    // Live Stripe has it at USD 100. A refunds page naming the wrong currency
    // is the kind of small error that becomes an argument later.
    expect(html).toContain('$100');
    expect(html).not.toContain('£100');
  });

  it('points refunds at the support address, not the general one', () => {
    const refunds = flat.slice(flat.indexOf('<h3>Refunds</h3>'));
    expect(refunds.slice(0, 700)).toContain('support@bbanetwork.org');
  });

  it('does not double-escape the ampersand in its title', () => {
    // layout() escapes the title, so an entity written here comes out as
    // "License &amp;amp; refunds" in the browser tab.
    expect(html).toContain('<title>License &amp; refunds — BBA Network</title>');
    expect(html).not.toContain('&amp;amp;');
  });

  it('is linked from the nav, between About and Contact', () => {
    const nav = html.slice(html.indexOf('<nav aria-label="Primary">'));
    const block = nav.slice(0, nav.indexOf('</nav>'));
    expect(block.indexOf('/about')).toBeLessThan(block.indexOf('/license'));
    expect(block.indexOf('/license')).toBeLessThan(block.indexOf('mailto:'));
  });

  it('is in the sitemap', () => {
    expect(renderSitemap()).toContain('<loc>https://bbanetwork.org/license</loc>');
  });

  it('is well-formed', () => {
    // Same check the other pages get; this one is the longest and most hand-written.
    const stack: string[] = [];
    const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
    const pattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
    let m: RegExpExecArray | null;
    let error: string | null = null;
    while ((m = pattern.exec(html)) !== null) {
      const [, closing, raw, self] = m;
      const tag = raw!.toLowerCase();
      if (VOID.has(tag) || self === '/') continue;
      if (closing === '/') {
        const top = stack.pop();
        if (top !== tag) { error = `</${tag}> closes <${top}>`; break; }
      } else stack.push(tag);
    }
    expect(error).toBeNull();
    expect(stack).toEqual([]);
  });
});


/**
 * The register's rule, enforced across every page rather than in one component.
 *
 * `src/businesses.ts` says a business is "only linked as a destination once it
 * is reachable", and explains why: a dead link on the hub looks like the whole
 * network is broken, not like one business that has not opened yet.
 *
 * That rule was real in `card()` and nowhere else. The footer rendered
 * `https://${host}/` for every business on every page, and the license page
 * hard-coded both hosts in prose. `audit.bbanetwork.org` has no DNS record, so
 * it was a dead link sitewide.
 *
 * These tests assert the invariant rather than the three places that broke it,
 * so a fourth place cannot reintroduce it.
 */
describe('links to business hosts', () => {
  const pages: Array<[string, string]> = [
    ['home', renderHome()],
    ['about', renderAbout()],
    ['license', renderLicense()],
    ['404', renderNotFound()],
  ];

  const unreachable = BUSINESSES.filter((b) => b.status !== 'live');

  /**
   * This suite used to open with `expect(unreachable.length).toBeGreaterThan(0)`
   * and the note: *"If every business goes live this suite silently stops
   * testing anything. Better to fail loudly and have someone delete it
   * deliberately."*
   *
   * On 2026-09-03 every business went live, and it failed loudly exactly as
   * intended. This is the deliberate handling it asked for — not a deletion.
   *
   * The parameterised cases below now cover nothing, because there is nothing
   * to cover: no business is unreachable, so no page can link one. They are
   * kept rather than removed, because they re-arm on their own the day a
   * business is added — and a new business is `building` on the day it lands.
   *
   * What replaces the guard is the assertion underneath it, which does not
   * depend on the register's mood: the rule itself, checked against a business
   * that is not live, whether or not one exists today.
   */
  it('does not offer a destination for a business that is not live', () => {
    const pending: Business = {
      id: 'fixture',
      host: 'fixture.example.org',
      name: 'Fixture',
      tagline: '',
      blurb: '',
      status: 'building',
      revenueModel: 'internal',
      repo: 'Billy-Bad-Ass/fixture',
      portfolioSlug: 'project-0',
      highlights: [],
    };

    expect(destination(pending)).toBeNull();
    expect(destination({ ...pending, status: 'planned' })).toBeNull();
    expect(destination({ ...pending, status: 'live' })).toBe('https://fixture.example.org/');
  });

  for (const [name, html] of pages) {
    for (const business of unreachable) {
      it(`${name} does not link to ${business.host} (${business.status})`, () => {
        expect(html).not.toContain(`href="https://${business.host}`);
        expect(html).not.toContain(`href="http://${business.host}`);
      });
    }

    it(`${name} still names every listed business`, () => {
      // Not linking is not the same as hiding. The point is an honest label,
      // not a business that vanishes from the site until its DNS exists.
      for (const business of PUBLIC_BUSINESSES) {
        expect(html).toContain(esc(business.name));
      }
    });
  }

  it('links a live business normally', () => {
    const live = BUSINESSES.find((b) => b.status === 'live' && !b.unlisted);
    if (!live) return; // nothing listed and live today; the card tests cover /go/
    expect(renderHome()).toContain(`href="https://${live.host}/"`);
  });

  it('marks an unreachable business with its status in the footer', () => {
    const html = renderHome();
    const foot = html.slice(html.indexOf('<h4>Businesses</h4>'));
    const column = foot.slice(0, foot.indexOf('</ul>'));
    for (const business of unreachable.filter((b) => !b.unlisted)) {
      expect(column).toContain(esc(business.name));
      expect(column).toContain('pending-ref');
    }
  });
});
