/**
 * The apex Worker for bbanetwork.org.
 *
 * Three jobs, in this order of importance:
 *
 *   1. Never break a URL that used to work. The store lived here until this
 *      Worker took the apex, and a customer with a download link in their inbox
 *      must still get their file. See src/redirects.ts.
 *   2. Serve the hub — one page that says what the businesses are and sends
 *      people to the right one.
 *   3. Count which business gets clicked, in aggregate, so there is a real
 *      answer to "is the hub doing anything".
 *
 * It is not a store and it never touches Stripe. Money is taken on the
 * businesses' own subdomains, by their own Workers, from their own repos.
 */

import { legacyRedirect } from './redirects';
import { renderHome, renderAbout, renderLicense, renderNotFound, renderSitemap } from './render';
import {
  BUSINESSES,
  PUBLIC_BUSINESSES,
  businessById,
  bridgeFor,
  destination,
  APEX,
  SUPPORT_EMAIL,
} from './businesses';
import { BRAND_CSS } from './styles';
import { linkWarden, type CheckResult } from './checks';
import { reportRun, type ReportEnv } from './report';

export interface Env extends ReportEnv {
  /**
   * Static assets (the brand kit). Bound by wrangler's `assets` config.
   */
  ASSETS: Fetcher;
  /**
   * Aggregate outbound click counts. OPTIONAL on purpose — see `countClick`.
   */
  CLICKS?: KVNamespace;
}

/**
 * Security headers applied to every HTML response.
 *
 * `script-src 'none'` is enforceable because the hub genuinely ships no
 * JavaScript. If that ever changes, this is the line that has to change with
 * it — and having to change it deliberately is the point.
 *
 * `style-src 'unsafe-inline'` is the one concession: the stylesheet is inlined
 * into the head to save a round trip. With no script execution allowed at all,
 * an injected style cannot exfiltrate anything.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
};

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short shared cache with a long stale window: the content changes only
      // when someone edits and redeploys, and serving a slightly stale hub is
      // strictly better than serving an error while revalidating.
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
      ...SECURITY_HEADERS,
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * Records an outbound click.
 *
 * Deliberately tolerant. If `CLICKS` is unbound — a fresh account, a preview
 * deploy, a namespace someone deleted — the visitor still gets sent where they
 * asked to go. A redirect that 500s because an analytics counter was missing
 * would be a self-inflicted outage on the one path that leads to money.
 *
 * What is stored: a per-business integer, and nothing else. No IP, no user
 * agent, no identifier of any kind, which is what lets this run without a
 * consent banner.
 */
async function countClick(env: Env, id: string): Promise<void> {
  if (!env.CLICKS) return;

  try {
    const key = `clicks:${id}`;
    const current = Number((await env.CLICKS.get(key)) ?? '0');
    await env.CLICKS.put(key, String(current + 1));
  } catch {
    // Counting is best-effort. Losing a click is a rounding error; failing the
    // redirect is a lost customer.
  }
}

async function readClicks(env: Env): Promise<Record<string, number | null>> {
  const counts: Record<string, number | null> = {};

  for (const business of BUSINESSES) {
    if (!env.CLICKS) {
      // Project 4's convention, and it matters here too: `null` means nobody
      // measured this, `0` means it was measured and is genuinely zero. A
      // missing KV binding must not read as "nobody has ever clicked".
      counts[business.id] = null;
      continue;
    }
    try {
      const raw = await env.CLICKS.get(`clicks:${business.id}`);
      counts[business.id] = raw === null ? 0 : Number(raw);
    } catch {
      counts[business.id] = null;
    }
  }

  return counts;
}

/**
 * Which check each cron expression runs.
 *
 * One, not two, since 2026-08-26. `redirect-guard` moved out to
 * .github/workflows/agent-redirect-guard.yml and scripts/redirect-guard.ts,
 * and the reason is a rule worth stating rather than a preference:
 *
 *   **A check whose subject is this repo's own hostnames cannot run inside
 *   the Worker that serves them.**
 *
 * `redirect-guard` probes `https://bbanetwork.org/...` nine times. From a
 * Worker that is itself what answers on that hostname, Cloudflare replies
 * `522` to every one, so the check failed every day from 2026-08-24 — and
 * nothing reported, so nobody saw it. It was proved on 2026-08-26 by two
 * requests one second apart: a GitHub runner got `200` from the apex while
 * the Worker's own probes got `522`.
 *
 * `link-warden` stays. Its subject is other people's hostnames — the
 * businesses the register calls `live` — which a Worker can reach perfectly
 * well.
 */
type CheckName = 'link-warden';

const SCHEDULE: Record<string, CheckName> = {
  '20 7 * * *': 'link-warden',
};


/**
 * Run one check, log what it found, and report it. The whole of a scheduled
 * run, minus the deciding which.
 *
 * Split out of `scheduled` so that `POST /__run/<check>` executes the same
 * code rather than a second implementation of it. A verification path that
 * runs different code from the thing it verifies proves nothing about the
 * thing it verifies.
 *
 * Nothing here throws. A check that cannot complete is a finding, not an
 * exception — and an exception in a cron handler is a run that vanishes
 * without saying anything, which is the failure mode this whole layer keeps
 * being rewritten to avoid.
 */
async function runAndReport(which: CheckName, env: Env): Promise<string> {
  const result: CheckResult = await linkWarden(fetch);

  for (const line of result.log) console.log(`  ${line}`);

  // `apexIdentity` used to be appended here, and it is not any more.
  //
  // From inside this Worker it answered "apex answered 522" on every single
  // run — the self-subrequest again — so a passing check reported itself as
  // "All checks passed — apex answered 522." A sentence that reads like an
  // outage on a run that found nothing wrong is worse than no sentence, and
  // it is the same failure this whole layer keeps being rewritten to avoid:
  // something that is not evidence being presented as though it were.
  //
  // The question is still worth asking, so redirect-guard asks it — from a
  // runner, where an answer from the apex is evidence about DNS rather than
  // about the process doing the asking.
  const summary = result.ok
    ? 'All checks passed.'
    : `${result.problems.join('; ')}.`;

  console.log(`${which}: ${result.ok ? 'ok' : 'FAILED'} — ${summary}`);

  const reported = await reportRun(env, {
    agent: which,
    status: result.ok ? 'ok' : 'failed',
    summary,
  });
  console.log(`${which}: ${reported}`);

  return reported;
}

/**
 * Serve a bridged business's site from wherever it is actually published.
 *
 * A fetch and a copy, not a redirect. A `302` to
 * `billy-bad-ass.github.io/sitecheck-1/audit/` would work and would put a
 * stranger's-looking address in the bar of a page asking for $100, which is
 * the kind of detail that quietly costs a sale.
 *
 * Three things this has to get right, and all three are why it is not a
 * one-liner:
 *
 *  - **The path.** The upstream lives in a subdirectory. `/legal.html` here
 *    has to become `.../sitecheck-1/audit/legal.html` there, and `/` has to
 *    resolve to that directory's index rather than 404. The site's own links
 *    are relative (`legal.html`, `assets/…`), so once the prefix is right the
 *    page hangs together on this hostname with nothing rewritten.
 *  - **Not forwarding the Host header.** Passing this request's headers
 *    upstream would send `Host: audit.bbanetwork.org` to GitHub Pages, which
 *    serves a different site — or none — for a host it does not recognise.
 *    Only the method and a couple of safe headers travel.
 *  - **Saying so when the upstream fails.** A blank 502 on a sales page reads
 *    as a dead business. The upstream's own status is passed through, and a
 *    network failure gets a short honest page rather than nothing.
 */
async function serveUpstream(upstream: string, url: URL, request: Request): Promise<Response> {
  // GET and HEAD only. Nothing on this site takes a submission — checkout is
  // Stripe's hosted page on its own domain — so anything else is either a
  // mistake or a probe, and forwarding it would be neither safe nor useful.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const base = new URL(upstream);
  // `/` → the upstream directory itself; `/legal.html` → alongside it. The
  // leading slash is stripped so URL resolution keeps the subdirectory rather
  // than jumping to the upstream's root, which is a different product.
  const target = new URL(url.pathname.replace(/^\/+/, '') + url.search, base);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(target.toString(), {
      method: request.method,
      headers: {
        accept: request.headers.get('accept') ?? '*/*',
        'accept-language': request.headers.get('accept-language') ?? 'en',
        'user-agent': request.headers.get('user-agent') ?? 'bba-network-hub',
      },
      redirect: 'follow',
    });
  } catch {
    return new Response(
      'This page is temporarily unavailable. Please try again shortly, or email ' +
        `${SUPPORT_EMAIL}.`,
      { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  // The upstream's body and content type, this Worker's caching. Hop-by-hop
  // and GitHub's own headers are dropped rather than passed on.
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'public, max-age=300');
  headers.set('x-served-by', 'bba-network-hub (bridge)');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}

export default {
  /**
   * The scheduled checks. See src/checks.ts for what they cover and why.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const which = SCHEDULE[event.cron];
    if (!which) {
      console.log(`No check is mapped to cron "${event.cron}" — nothing ran.`);
      return;
    }

    ctx.waitUntil(runAndReport(which, env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    /**
     * A bridged business, served on its own hostname — before the rest of the
     * router gets a look at the request.
     *
     * First, deliberately. Everything below this line is written about the
     * apex: the legacy redirects, the hub's own pages, the 404. Letting any of
     * it see `audit.bbanetwork.org` would answer a paying visitor with a
     * different business. A bridged hostname is not the hub under another
     * name; it is a separate site this Worker happens to serve.
     *
     * See the `upstream` note in src/businesses.ts for why this exists and for
     * the single line that removes it.
     */
    const bridge = bridgeFor(url.hostname);
    if (bridge?.upstream) {
      return serveUpstream(bridge.upstream, url, request);
    }

    /**
     * Run the check now, instead of waiting for 07:20 UTC.
     *
     * There is no way to make a Cloudflare cron fire on demand, so a change to
     * the reporting path — a new service token, a rotated DASHBOARD_TOKEN —
     * could not be verified until the following morning. "It should work
     * tomorrow" is not a verified fix, and this repository has already learned
     * once what happens when a reporting problem sits unnoticed.
     *
     * Locked behind DASHBOARD_TOKEN, the secret this Worker already holds:
     *
     *  - POST only, so no crawler, prefetch or link can reach it
     *  - no token configured means 404, not 401. An endpoint that announces
     *    itself to anyone who guesses the path is worse than one that does not
     *  - a wrong token gets the same 404, for the same reason
     *  - it runs the check and reports it through `runAndReport`, exactly as
     *    the cron does. A verification path that runs different code from the
     *    thing it verifies proves nothing about the thing it verifies
     *
     * The reply is `reportRun`'s own sentence, which is the fact worth having:
     * `reported (201)`, or the specific reason it was not.
     */
    if (path.startsWith('/__run/') && request.method === 'POST') {
      const which = path.slice('/__run/'.length);
      const offered = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');

      if (!env.DASHBOARD_TOKEN || offered !== env.DASHBOARD_TOKEN) {
        return html(renderNotFound(), 404);
      }
      // Named, not silently absent. Someone reaching for it here — this
      // endpoint ran it until 2026-08-26 — needs to be told where it went and
      // why, not handed a 404 that reads like a typo.
      if (which === 'redirect-guard') {
        return new Response(
          'redirect-guard does not run here. It probes https://bbanetwork.org, which is ' +
            'this Worker, and Cloudflare answers 522 to a Worker subrequest to its own ' +
            'route — so every probe failed and the check reported failed every day from ' +
            '2026-08-24. It runs from a GitHub runner now: Actions -> "Agent · Redirect ' +
            'guard" -> Run workflow, or scripts/redirect-guard.ts locally.\n',
          { status: 409, headers: { 'content-type': 'text/plain; charset=utf-8' } },
        );
      }
      if (which !== 'link-warden') {
        return new Response(`No check called "${which}". Try link-warden.\n`, {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      const reported = await runAndReport(which, env);
      return new Response(`${which}: ${reported}\n`, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    // 1. Legacy apex paths, before anything else can claim them.
    const moved = legacyRedirect(url);
    if (moved) {
      return new Response(null, {
        status: moved.status,
        headers: { location: moved.location, 'cache-control': 'public, max-age=3600' },
      });
    }

    // 2. Outbound click tracking. `ctx.waitUntil` so the write never delays
    //    the redirect the visitor is waiting on.
    if (path.startsWith('/go/')) {
      const id = path.slice('/go/'.length);
      const business = businessById(id);
      const target = business && destination(business);

      if (!target) return html(renderNotFound(), 404);

      ctx.waitUntil(countClick(env, id));
      return new Response(null, {
        status: 302,
        headers: { location: target, 'cache-control': 'no-store' },
      });
    }

    switch (path) {
      case '/':
        return html(renderHome());

      case '/about':
        return html(renderAbout());

      /**
       * The network's license and refund terms, for both businesses.
       *
       * This path used to 301 to the store — see the note on HUB_OWNED in
       * src/redirects.ts for why the hub took it back.
       */
      case '/license':
        return html(renderLicense());

      /**
       * The same page's old spelling. The page was `/licence` until the
       * British spelling was corrected, and every receipt issued before that
       * links here. A 301 is not a nicety: the alternative is a customer
       * following the link on their receipt to a 404 of the terms they agreed
       * to at checkout.
       */
      case '/licence':
        return new Response(null, {
          status: 301,
          headers: { location: '/license' },
        });

      /**
       * The network's own status, as JSON. Public because there is nothing
       * secret in it, and useful because Project 4's dashboard can poll it
       * instead of scraping the page.
       */
      case '/api/stats': {
        const clicks = await readClicks(env);
        return json({
          apex: APEX,
          generated_at: new Date().toISOString(),
          clicks_measured: Boolean(env.CLICKS),
          businesses: BUSINESSES.map((b) => ({
            id: b.id,
            name: b.name,
            host: b.host,
            status: b.status,
            listed: !b.unlisted,
            repo: b.repo,
            portfolio_slug: b.portfolioSlug,
            outbound_clicks: clicks[b.id],
          })),
        });
      }

      case '/robots.txt':
        return new Response(
          `User-agent: *\nAllow: /\nDisallow: /go/\n\nSitemap: https://${APEX}/sitemap.xml\n`,
          { headers: { 'content-type': 'text/plain; charset=utf-8' } },
        );

      case '/sitemap.xml':
        return new Response(renderSitemap(), {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        });

      /**
       * Cheap liveness probe for Project 4's heartbeat-watchdog.
       *
       * `scheduled` lists what this Worker runs on a timer. It is here because
       * there was no way to answer "is the deployed Worker the one with the
       * cron checks in it" without reading the deployed script — and a health
       * endpoint that describes what the service is responsible for is more
       * use than one that only says it is awake.
       */
      case '/api/health':
        return json({
          ok: true,
          service: 'bba-network-hub',
          businesses: PUBLIC_BUSINESSES.length,
          scheduled: Object.values(SCHEDULE),
        });

      /**
       * The design system, for the other subdomains.
       *
       * `guides.`, `audit.` and `production.` are built in different
       * repositories by different sessions. The only way four sites stay
       * looking like one network is a single stylesheet they all link — a copy
       * diverges the first time somebody nudges a colour, and then the network
       * looks like four unrelated products that happen to share a logo.
       *
       * Versioned in the path rather than by a query string so a future
       * breaking change can ship as `/brand/v2.css` while v1 keeps serving the
       * sites that have not migrated. Cached for a day at the edge; a colour
       * fix reaches every subdomain without any of them redeploying.
       */
      case '/brand/v1.css':
        return new Response(BRAND_CSS, {
          headers: {
            'content-type': 'text/css; charset=utf-8',
            'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
            // Read cross-origin by design — that is the entire point of it.
            'access-control-allow-origin': '*',
            'x-content-type-options': 'nosniff',
          },
        });
    }

    // 3. Static assets — the brand kit and the fonts.
    //
    //    In normal operation this block does not run: Cloudflare serves a
    //    matching asset before the Worker is invoked at all, which is also why
    //    their cache and CORS headers live in public/_headers rather than here.
    //    This is the miss path, and it exists so an unmatched /assets/ URL gets
    //    the branded 404 below instead of the platform's bare one.
    if (path.startsWith('/assets/') || path.startsWith('/fonts/')) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }

    return html(renderNotFound(), 404);
  },
};
