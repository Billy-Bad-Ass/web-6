/**
 * The two scheduled checks. One runs in the Worker, one cannot.
 *
 *   redirect-guard  — the paths a paying customer walks. Someone holding an
 *                     emailed download link must still reach their file.
 *                     Runs from a GitHub runner:
 *                     .github/workflows/agent-redirect-guard.yml.
 *   link-warden     — that every business the register calls `live` actually
 *                     answers. `live` is a promise; this is what keeps it one.
 *                     Runs as a Cloudflare cron on this Worker.
 *
 * Both ran as GitHub Actions until 2026-08-24, when they moved here with the
 * deploy. `redirect-guard` went back on 2026-08-26, and the reason is a rule
 * rather than a preference:
 *
 *   **A check whose subject is this repo's own hostnames cannot run inside
 *   the Worker that serves them.**
 *
 * The note under `apexIdentity` below saw half of this coming and drew the
 * wrong conclusion from it. It says a subrequest to the apex cannot prove the
 * apex is still attached, "if the hostname still points here, the request
 * comes straight back to this same script" — so the result is recorded as a
 * fact rather than a pass. Two things turned out to be wrong with that.
 *
 * The request does not come back to this script. Cloudflare answers a Worker's
 * subrequest to its own route with `522`, so `apexIdentity` returned "apex
 * answered 522" on every run — a sentence that reads like an outage appended
 * to checks that had found nothing wrong.
 *
 * And the mitigation was applied to the wrong thing. `apexIdentity` is one
 * informational line. `redirectGuard` probes that same hostname for all nine
 * of its assertions, and those are asserted as passes. So the check that
 * actually depended on reaching the apex was left asserting failures it could
 * not have avoided, every day, from 2026-08-24 until the reporting gap closed
 * on 2026-08-26 and made it visible.
 *
 * `linkWarden` is unaffected and stays on the Worker: its subject is other
 * people's hostnames, which a Worker reaches perfectly well.
 */

import { APEX, BRIDGED, BUSINESSES, type Business } from './businesses';
import { LEGACY_RULES } from './redirects';

/** The store every legacy rule points at. */
export const STORE = `https://guides.${APEX}`;

export interface CheckResult {
  agent: 'redirect-guard' | 'link-warden';
  ok: boolean;
  /** One line per problem. Empty when everything passed. */
  problems: string[];
  /** Everything probed, pass or fail, for the log. */
  log: string[];
}

/** Injected so the tests can drive these without touching the network. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * A HEAD-like probe that never follows redirects and never throws.
 *
 * `redirect: 'manual'` matters more than it looks: the whole point of the
 * redirect guard is the status code and the Location header, and following
 * them would collapse a `308` into whatever the store answered.
 */
async function probe(
  fetcher: Fetcher,
  url: string,
): Promise<{ status: number; location: string | null }> {
  try {
    const response = await fetcher(url, { redirect: 'manual' });
    return { status: response.status, location: response.headers.get('location') };
  } catch {
    // Nothing answered — DNS, TLS, or a host that is simply gone. `0` is the
    // same convention curl uses for it, and is deliberately distinct from any
    // real status code.
    return { status: 0, location: null };
  }
}

/**
 * Every legacy customer path, plus the destination they all point at.
 *
 * The destination probe is the one that was missing when this lived in
 * Actions: each rule was checked for the right status and the right Location
 * header, and nothing asked whether anything answered at the other end. A
 * guard whose subject is the path a paying customer walks has to walk all of
 * it.
 */
export async function redirectGuard(
  fetcher: Fetcher,
  base: string,
  /**
   * The bridged businesses, by default the real ones. Overridable for the same
   * reason `linkWarden` takes its list: the cases worth testing here are a
   * dormant bridge and a working one, and which of those the register happens
   * to hold today is not something a test should depend on.
   */
  bridged: readonly Business[] = BRIDGED,
): Promise<CheckResult> {
  const problems: string[] = [];
  const log: string[] = [];

  for (const rule of LEGACY_RULES) {
    // A path under the rule rather than the bare prefix, so the suffix-carrying
    // behaviour is exercised too.
    const path = `${rule.prefix}/probe`;
    const { status, location } = await probe(fetcher, `${base}${path}`);
    log.push(`${path} → ${status} → ${location ?? '<none>'}`);

    if (status !== rule.status) {
      problems.push(`${path} expected ${rule.status}, got ${status}`);
      continue;
    }
    const want = `${rule.target}${path.slice(rule.prefix.length)}`;
    if (location !== want) {
      problems.push(`${path} pointed at ${location ?? '<none>'}, expected ${want}`);
    }
  }

  // The hub's own endpoints, which must never be swallowed by a redirect rule.
  // /license is here because it was a 301 to the store until the hub took it
  // back, and a future rule could quietly reclaim it — taking the terms a
  // customer agreed to at checkout with it.
  for (const own of ['/api/health', '/api/stats', '/license']) {
    const { status } = await probe(fetcher, `${base}${own}`);
    log.push(`${own} → ${status}`);
    if (status !== 200) problems.push(`${own} expected 200, got ${status}`);
  }

  // The license page's old spelling. Receipts issued before the page moved
  // link to it, so it is as load-bearing as any rule in LEGACY_RULES — and it
  // lives in the switch rather than in that table, which is exactly the kind
  // of redirect nothing else here would notice going missing.
  {
    const { status, location } = await probe(fetcher, `${base}/licence`);
    log.push(`/licence → ${status} ${location ?? ''}`.trim());
    if (status !== 301) {
      problems.push(`/licence expected 301, got ${status}`);
    } else if (location !== '/license' && location !== `${base}/license`) {
      problems.push(`/licence pointed at ${location ?? '<none>'}, expected /license`);
    }
  }

  // Does the place all of that points to actually exist? Deliberately tolerant
  // of the answer: the store may legitimately say 401, 403 or 404 to a probe
  // with no token and no product id. What is being tested is that the host is
  // there at all.
  const store = await probe(fetcher, `${STORE}/`);
  log.push(`${STORE} → ${store.status}`);
  if (store.status === 0) {
    problems.push(
      `${STORE} did not answer. Every redirect above lands here, so all of them ` +
        `are dead ends however correct their status codes look.`,
    );
  }

  /**
   * `www`, which redirects here.
   *
   * Nothing checked it until 2026-09-03, because until 2026-09-03 there was
   * nothing to check: docs/DOMAINS.md recorded it as having no DNS record at
   * all, and it was the last open gap in that file's running order. It was
   * attached the same day and answers `301` to the apex.
   *
   * Deliberately tolerant of *how* it answers. Either shape is correct and
   * both are written down in docs/DOMAINS.md: a redirect to the apex, or the
   * hub serving it directly — safe because every page declares its canonical
   * URL on the apex regardless of the host it was served from. What is not
   * correct is silence, which is what a lapsed DNS record looks like, and
   * which nobody would notice on a hostname half of visitors type by habit.
   */
  const wwwProbe = await probe(fetcher, `https://www.${APEX}/`);
  log.push(`www.${APEX} → ${wwwProbe.status}${wwwProbe.location ? ` → ${wwwProbe.location}` : ''}`);
  if (wwwProbe.status < 200 || wwwProbe.status >= 400) {
    problems.push(
      `www.${APEX} answered ${wwwProbe.status}. It is the hostname a visitor types from ` +
        `habit, so it failing is a front door nobody is watching.`,
    );
  }

  /**
   * The hostnames the hub serves for another business.
   *
   * `linkWarden` cannot check these — it runs inside the Worker that answers
   * them, and Cloudflare replies `522` to a Worker probing its own route. This
   * guard runs on a GitHub runner, which is genuinely somewhere else, so it is
   * the only check whose answer about them means anything.
   *
   * Asserted, not merely logged. A bridged host that stops answering is a
   * business with a `live` card and a dead front door, which is precisely the
   * failure the register's honesty rule exists to prevent.
   */
  for (const business of bridged) {
    const { status } = await probe(fetcher, `https://${business.host}/`);
    const answered = status >= 200 && status < 400;
    log.push(`${business.host} (bridged, ${business.status}) → ${status}`);

    /**
     * Only a `live` card is a promise, and only a promise can be broken.
     *
     * A bridge can be deployed before its hostname is routed to this Worker —
     * that is the state `audit` is in — and asserting on it then produces a
     * daily failure describing a card that does not exist. The first version
     * of this loop did exactly that: it fired on 2026-09-03 against a business
     * already corrected to `building`, with the words "Its card says live"
     * against a card that said building.
     *
     * An alarm that is wrong every morning is worse than no alarm, because it
     * is the one people learn to scroll past — and this repository has been
     * caught by that twice already.
     */
    if (business.status === 'live' && !answered) {
      problems.push(
        `${business.host} is served by this hub from ${business.upstream} and answered ` +
          `${status}. Its card says live, so a customer is being shown a door that does ` +
          `not open.`,
      );
    }

    // The other direction, and the reason this is not simply skipped: a
    // bridged host that starts answering while its card still says `building`
    // is a finished business nobody has switched on. That is the drift that
    // hid the store for five days.
    if (business.status !== 'live' && answered) {
      problems.push(
        `${business.host} is marked ${business.status} but answered ${status}. The bridge ` +
          `is working — set it to live in src/businesses.ts.`,
      );
    }
  }

  return { agent: 'redirect-guard', ok: problems.length === 0, problems, log };
}

/**
 * Every business in the register, against what its host actually answers.
 *
 * Anything in the 2xx or 3xx range counts as answering. A `3xx` is not a
 * consolation prize here: `heartbeat.` sits behind Cloudflare Access, so a
 * redirect to a login page is exactly what a healthy locked door looks like.
 *
 * This used to `continue` past anything that was not `live`, on the reasoning
 * that only `live` is a promise and only promises are worth checking. Half of
 * that is right and the half that is wrong cost real money.
 *
 * `guides.bbanetwork.org` started serving on 2026-08-24 — the redirect guard
 * logged it `200` the same day and every day after. The register still said
 * `building`, so the hub kept rendering the store as a disabled card reading
 * "Opening at guides.bbanetwork.org shortly" while the store sat there taking
 * checkout. Nothing complained, because the only check that looks at hosts
 * skipped it for being `building`. It went five days.
 *
 * A stale `building` is not the harmless direction of wrong. It is a shop with
 * the lights on and the CLOSED sign still hanging in the door, and it is
 * *quieter* than the failure the warden was built for, because a broken `live`
 * card at least looks broken. So drift is now checked in both directions:
 *
 *   - `live` and the host does not answer  → the promise is broken.
 *   - not `live` and the host does answer  → the register is behind reality.
 *
 * Neither is reported as an outage of the *host*. Both are reported as the
 * register and the infrastructure disagreeing, which is what they are, and the
 * fix for each is a different one-line edit by a human — see rule 2 in
 * CLAUDE.md before reaching for the wrong one.
 */
export async function linkWarden(
  fetcher: Fetcher,
  /**
   * The register, by default. Overridable so the drift cases can be tested
   * with a business of each status.
   *
   * They used to be driven by whatever the real register happened to contain,
   * which worked only while it contained a mixture. On 2026-09-03 the last
   * `building` business went live and two of them started asserting against an
   * empty array — the drift logic was still correct and no longer covered.
   * Coverage that evaporates when the data changes is not coverage.
   */
  businesses: readonly Business[] = BUSINESSES,
  /**
   * Whether to skip the hosts this Worker serves.
   *
   * `true` — the default, and correct for every caller inside the Worker, for
   * the reason spelled out below: Cloudflare answers a Worker's subrequest to
   * its own route with `522`, so probing a bridged host from in there reports
   * a daily outage that is not happening.
   *
   * `false` for scripts/redirect-guard.ts, which runs on a GitHub runner. A
   * runner is genuinely somewhere else, so it can probe every host including
   * the bridged ones — and it is the only place an answer about DNS means
   * anything at all.
   */
  skipBridged = true,
): Promise<CheckResult> {
  const problems: string[] = [];
  const log: string[] = [];

  for (const business of businesses) {
    /**
     * A host this Worker serves cannot be checked from inside this Worker.
     *
     * Cloudflare answers a Worker's subrequest to its own route with `522`, so
     * probing `audit.bbanetwork.org` from here would report a daily outage on
     * a business that is answering perfectly well. That is the same trap that
     * made `redirect-guard` cry wolf every morning from 2026-08-24 until it
     * moved to a GitHub runner, and it arrived here the moment the hub started
     * bridging a business hostname.
     *
     * Skipped, not silently: the run log says which host and why, and
     * `redirect-guard` covers these from outside — which is the only place the
     * answer means anything.
     *
     * That last clause was aspirational when it was written. `redirect-guard`
     * probed the apex and nothing else, so `audit.bbanetwork.org` was skipped
     * here and checked nowhere — the one bridged host in the register was the
     * one host in the network with no automated check on it at all. The
     * runner now runs this same function with `skipBridged` off, which is what
     * the sentence always claimed.
     */
    if (business.upstream && skipBridged) {
      log.push(
        `${business.id} (${business.host}, ${business.status}) → skipped, this Worker serves it; ` +
          `redirect-guard checks it from a runner`,
      );
      continue;
    }

    const { status } = await probe(fetcher, `https://${business.host}/`);
    const answered = status >= 200 && status < 400;
    log.push(`${business.id} (${business.host}, ${business.status}) → ${status}`);

    if (business.status === 'live' && !answered) {
      problems.push(
        `${business.id} is marked live in the register but ${business.host} answered ${status}`,
      );
    }

    // Deliberately not a silent pass. The register is the thing the hub
    // renders, so a business that is up and still marked `building` is a
    // customer being turned away by this repo rather than by its own site.
    if (business.status !== 'live' && answered) {
      problems.push(
        `${business.id} is marked ${business.status} in the register but ${business.host} ` +
          `answered ${status}. The hub is rendering a disabled card for a host that is ` +
          `serving — set it to live in src/businesses.ts.`,
      );
    }
  }

  return { agent: 'link-warden', ok: problems.length === 0, problems, log };
}

/**
 * What each business host is actually serving, reported and never asserted.
 *
 * `linkWarden` asks whether a host answers. This asks what it answered *with*,
 * and the difference has already cost this repository once: on 2026-08-29
 * `audit.bbanetwork.org` returned `200` to every probe while serving the hub's
 * own homepage. Every status check passed. The business behind that hostname
 * was unreachable to a customer for five days, and nothing in this repository
 * could have noticed, because nothing here had ever read the page.
 *
 * So the title of each page is recorded on every run. It is not asserted — a
 * title is copy, and copy changes for good reasons that should not fail a
 * check at three in the morning. It is written down so that a human flipping a
 * register entry to `live`, or reading back a run that looked fine, can see
 * which site actually answered rather than only that something did.
 *
 * Runner-only, like `apexIdentity` and for the same reason: from inside the
 * Worker, a bridged host answers `522` and this would record the outage that
 * is not happening.
 */
export async function hostIdentities(
  fetcher: Fetcher,
  businesses: readonly Business[] = BUSINESSES,
): Promise<string[]> {
  const lines: string[] = [];

  for (const business of businesses) {
    lines.push(`${business.id} (${business.host}) → ${await pageTitle(fetcher, `https://${business.host}/`)}`);
  }

  return lines;
}

/**
 * The `<title>` of a page, or a plain statement of why there isn't one.
 *
 * Redirects are followed here, unlike everywhere else in this file: a hostname
 * behind Cloudflare Access answers `302` to a login page, and "what is serving
 * this host" is better answered by the page a visitor lands on than by the
 * hop that got them there.
 */
async function pageTitle(fetcher: Fetcher, url: string): Promise<string> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return `answered ${response.status}, no page read`;

    const body = await response.text();
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
    if (!match) return `${response.status}, page has no title`;

    // Collapsed and clipped: a title is for a human reading a run log, and one
    // that wraps across four lines of console output is worse than a short one.
    const title = match[1]!.replace(/\s+/g, ' ').trim();
    return `${response.status} — ${title.length > 90 ? `${title.slice(0, 89)}…` : title}`;
  } catch {
    return 'did not answer';
  }
}

/**
 * What is answering on the apex, reported and never asserted.
 *
 * When this check ran on a GitHub runner it could prove the custom domain was
 * still attached, because the runner was genuinely somewhere else. From inside
 * the Worker that proof is not available — and not for the reason first
 * written here. The subrequest is not served by this same script: Cloudflare
 * answers a Worker's request to its own route with `522`, so from in there
 * this function reports an outage that is not happening.
 *
 * So it is only ever called from scripts/redirect-guard.ts, on a runner. The
 * Worker's own runs no longer append it at all — see the note in
 * src/index.ts.
 *
 * It is still worth asking. If the apex has been reassigned to a different
 * Worker, this returns that Worker's answer, which is a real and useful
 * finding. So the result is recorded in the run summary rather than counted as
 * a pass or a failure.
 */
export async function apexIdentity(fetcher: Fetcher): Promise<string> {
  try {
    const response = await fetcher(`https://${APEX}/api/health`, { redirect: 'manual' });
    if (!response.ok) return `apex answered ${response.status}`;
    const body = (await response.json()) as { service?: string };
    return body.service === 'bba-network-hub'
      ? 'apex serves this hub'
      : `apex serves ${body.service ?? 'something unidentified'}`;
  } catch {
    return 'apex did not answer';
  }
}
