# Agent orchestration

Project 6 owns a small slice of the portfolio's automation, and deliberately no
more than that. This is the boundary and the contract.

## Project 4 owns orchestration. This repo reports to it.

`dashboard-4/docs/AGENTS.md` sets the split, and it is worth quoting because it is
the reason this repo has no cron Worker and no agent-run table:

> **Project agents** — "These run from their **own** repositories. This
> dashboard does not schedule them — it shows their runs, because they report
> to `/api/agent-runs`."

So: portfolio-level agents (`portfolio-analyst`, `spend-auditor`,
`pipeline-nudge`, `heartbeat-watchdog`, `mention-router`) belong to Project 4 and
are not duplicated here. This repo runs the two checks that only make sense with
knowledge of the hub, and posts the outcome to Project 4's console.

**Nothing scheduled here may look beyond this repo's own hostnames.** If
something needs to run on a schedule against the whole portfolio, it belongs in
Project 4. That is the line, and it is unchanged.

What changed on 2026-08-24: both checks moved from GitHub Actions to
**Cloudflare Cron Triggers on this Worker**, because the deploy moved to
Cloudflare Workers Builds and leaving two cron workflows behind in a repository
that otherwise no longer used Actions is how you end up with checks nobody
remembers exist.

An earlier version of this file, and rule 4 in `CLAUDE.md`, said "do not add a
Worker cron to this repo" without qualification. That was written to stop two
systems competing over portfolio orchestration, not to stop this repo watching
its own two hostnames — but it did say what it said, so the change was recorded
here rather than quietly made.

**What changed back on 2026-08-26, and the rule it produced.** `redirect-guard`
runs from a GitHub runner again. Not a reversal of the reasoning above — a
constraint that reasoning did not know about:

> A check whose subject is this repo's own hostnames cannot run inside the
> Worker that serves them.

`redirect-guard` probes `https://bbanetwork.org` nine times. Cloudflare answers
a Worker's subrequest to its own route with `522`, so every probe failed and
the check reported `failed` every day from 2026-08-24 — and until 2026-08-26 no
run in this repository reported anything at all, so nobody saw it. Proved
rather than assumed: a GitHub runner got `200` from the apex one second before
the Worker's own probes got `522`.

`link-warden` stays on the Worker. Its subject is *other people's* hostnames —
the businesses the register calls `live` — which a Worker reaches perfectly
well. That is the whole of the difference between the two.

## The agents that run here

| Agent | Owns | Runs | Where |
| --- | --- | --- | --- |
| `link-warden` | Every business the register calls `live` is actually reachable. | Daily 07:20 UTC (03:20 ET) | Worker cron |
| `redirect-guard` | The legacy apex paths that carry paying customers to their downloads. | Daily 07:40 UTC (03:40 ET) | Actions — it must probe the apex from outside it |
| deploy | Builds, tests and deploys. | On push to `main` | Workers Builds |
| mention | Routes an `@claude` mention on an issue or PR here. | On mention | Actions |

The two scheduled checks live in `src/checks.ts`; the mapping from cron
expression to check is in `src/index.ts`, and the expressions themselves are in
`wrangler.jsonc`. An expression added in one place without the other logs that
it ran nothing, rather than silently doing nothing.

### Running one now

**`redirect-guard`** — Actions → *Agent · Redirect guard* → Run workflow. Or
locally, with the same four values in the environment:

```bash
npx --yes tsx@4 scripts/redirect-guard.ts
```

**`link-warden`** — Cloudflare has no way to make a cron fire on demand, so
until 2026-08-26 a change to the reporting path — a new service token, a
rotated `DASHBOARD_TOKEN` — could not be verified until the next morning. "It
should work tomorrow" is not a verified fix.

```bash
curl -sS -X POST https://bbanetwork.org/__run/link-warden \
  -H "authorization: Bearer $DASHBOARD_TOKEN"
```

It answers with `reportRun`'s own sentence — `link-warden: reported (201)`, or
the specific reason it was not — and it runs the same `runAndReport` the cron
does. A verification path that runs different code from the thing it verifies
proves nothing about the thing it verifies.

The lock is `DASHBOARD_TOKEN`, the secret this Worker already holds. `POST`
only, so no crawler, prefetch or pasted link reaches it. A missing token, a
wrong token and an unconfigured `DASHBOARD_TOKEN` all get the ordinary 404
page, not a `401` — a `401` would confirm both that the path is real and that
a token opens it. `test/run-endpoint.test.ts` pins each of those.

`/__run/redirect-guard` answers `409` and says where the check went. It ran
there until 2026-08-26, and running it there is precisely the bug — a `404`
would read like a typo.

Both are **deterministic probes**: they fetch, they compare, they report. No
model is involved on either path, which is why they cost nothing to run daily
and why they can be unit-tested — `test/checks.test.ts` covers the awkward
answers, including the ones that used to be read as passes.

The half that is genuinely gone is the investigation. On GitHub Actions a
failing probe handed its finding to Claude, which opened an issue. A Worker
cannot open a GitHub issue without a GitHub token, so a failing check now
surfaces in two places: the Worker's own logs, and Project 4's console. Neither
of those is a notification. Getting told rather than having to look is the next
thing to build, and email through Cloudflare's own routing is the obvious
candidate.

## Reporting a run

`src/report.ts` posts the outcome of every scheduled run:

```json
{ "agent": "redirect-guard", "project_slug": "project-6", "trigger": "cron",
  "status": "ok", "summary": "All checks passed — apex serves this hub." }
```

Valid `status`: `queued`, `running`, `ok`, `failed`, `skipped`.
Valid `trigger`: `cron`, `manual`, `github`, `webhook`.

**A reporting failure never fails the check that already ran.** The dashboard
being unreachable must not bury a redirect failure behind a logging failure —
losing a log entry is a much smaller problem than losing the finding.

**And a reporting failure is never reported as a success.** That sentence looks
redundant and is not: the previous version of this got it wrong three separate
times in one day. A bare `|| true` made an unset URL indistinguishable from a
successful post. `curl -f` does not fail on a `3xx`, so Cloudflare Access
answering `302` with a login page was logged as a completed write. Both were
written *as* the fix for the previous one.

`reportRun` therefore returns a sentence rather than a boolean, requires a
`2xx`, and names each failure as what it is — a redirect means Access with no
service token, a `401` means a token mismatch, no answer means the host is
gone.

### Project 4's side

`project-6` is registered in `dashboard-4/config/portfolio.ts` (on its
`claude/audit-business` branch, PR #9), with `revenueModel: 'none'` — a visitor
who buys an audit is project-1's revenue, and counting it here too would double
it. Runs posted with `"project_slug":"project-6"` attach to a project page once
that merges.

Flagging Project 1's pivot to Project 4 also surfaced a bug in its own ledger:
`reconcileStripe` attributed every charge to the first project with
`revenueModel: 'stripe'`, which was correct with one seller and silently wrong
with two — the $100 audit would have landed on the store's ROI permanently.
That is fixed on the same branch. Worth knowing, because it is the reason the
hub carries `portfolioSlug` on every business: the two sides must agree on names
for any of this to reconcile.

## What an agent here must never do

Project 4's guardrails apply, plus two specific to this repo:

- **No agent writes to Stripe.** Refunds and price changes are human decisions.
- **No agent marks a business `live`** in `src/businesses.ts` without confirming
  the host resolves. The register's honesty is the hub's only real product.
- **No agent weakens `src/redirects.ts` to make a check pass.** That file is the
  reason a customer who paid last week can still download what they bought.
  A failing redirect check is the system working.
- **Silence is a valid output.** Neither scheduled agent writes anything on a
  clean run.

## Secrets and variables

The same four values, in two places, because the two checks run in two places.

| | Used by | Required? |
| --- | --- | --- |
| `DASHBOARD_URL` | reporting a run | No — unset means the run is not reported, and says so |
| `DASHBOARD_TOKEN` | reporting a run | No, but a set dashboard will answer `401` without it |
| `CF_ACCESS_CLIENT_ID` | reporting through Cloudflare Access | Yes, while the dashboard is behind Access |
| `CF_ACCESS_CLIENT_SECRET` | reporting through Cloudflare Access | Yes, while the dashboard is behind Access |

**As Worker secrets**, for `link-warden` and for `POST /__run/`, which also
checks `DASHBOARD_TOKEN` as its lock. Cloudflare → Compute → `bba-network-hub`
→ Settings → Variables and Secrets, or `npx wrangler secret put NAME`.

**As repository secrets**, for `redirect-guard`, which runs on a GitHub runner.
Settings → Secrets and variables → Actions.

Do not set either by hand. dashboard-4's *Ops · Give the other repos the
credentials they report with* writes both, from the one repository where these
values exist. `DASHBOARD_TOKEN` has to match the `bba-heartbeat` Worker
exactly, and every copy is write-only, so a value typed in three times cannot
be compared — only replaced together.

Every one is optional in the sense that the checks run without them. What
changes is whether anybody is told.

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are not needed for
deploying — Workers Builds holds those on Cloudflare's side — and can be
deleted from this repository.

What is left on GitHub Actions is `ci.yml`, which runs the test suite on every
pull request, and the `@claude` mention router. Neither needs a Cloudflare
credential.

## How a deploy happens now

A push to `main` triggers a Workers Build, which runs two commands in order:

| Step | Command |
| --- | --- |
| Build | `npm run check` |
| Deploy | `npx wrangler deploy` |

**The build command is the gate.** A failing test suite fails the build, and a
failed build never reaches the deploy command — which preserves the rule at the
top of `CLAUDE.md`: the redirect suite is the only thing standing between a
refactor and a customer who cannot download what they paid for.

### What was lost, and it is worth naming

The old workflow ran a **smoke test against the live site after every deploy** —
the download redirect, the 301s, `/license`, `/brand/v1.css`. Workers Builds has
no equivalent hook, so that check is gone from the deploy path.

The redirect guard still covers all of it, but daily rather than per-deploy. So
the window in which a bad deploy could sit unnoticed went from about two
minutes to up to twenty-four hours. On a site that has never taken a payment
that is an acceptable trade; it stops being one on the day the first sale
happens, and the cheap fix then is a second, more frequent cron rather than a
return to Actions.

Prefer `CLAUDE_CODE_OAUTH_TOKEN`: on a Max plan those runs cost nothing, where
an API key bills per token. The action gives the API key precedence when both
are present, so the workflows deliberately blank the key when a subscription
token exists.

Repository **variable**:

| Variable | Used by |
| --- | --- |
| `SITE_URL` | the deploy smoke test and both agent probes (defaults to `https://bbanetwork.org`) |

`GITHUB_TOKEN` is provided automatically by Actions.

### What happens with no Claude credential

Each agent is two halves: a deterministic `curl` probe, and a step that hands
any finding to Claude to investigate and open an issue. Only the second half
needs a credential.

With neither secret set, that step used to start anyway and fail — turning a
probe that had worked into a red X, and burying the finding it was reporting
inside a failed job. Both of the link warden's first two real findings were
reported that way: the probe was right and said so, and the run still showed
as failed for an unrelated reason.

The step is now gated on a credential existing, and when there is none the
finding is emitted as a `::warning` carrying the same detail. You lose the
investigation and the issue; you do not lose the fact. The probe half — the
half that actually knows whether a customer can reach anything — has never
needed a credential and still does not.

### Reporting through Cloudflare Access

`heartbeat.bbanetwork.org` is protected by Cloudflare Access, and the policy is
scoped to the **Worker** rather than to a hostname. That is the right choice for
a dashboard showing revenue — it covers every hostname routed there, including
ones added later — but it also covers `/api/agent-runs`, which is not a page a
human visits. It is the endpoint every project's CI posts to.

So an unauthenticated `POST` from a runner does not reach the API at all. Access
answers first, with a `302` to its login page, and `curl -f` reports failure.
No amount of correct `DASHBOARD_TOKEN` helps: that token is checked by the
application, and the request never gets to the application.

A machine gets through with an **Access service token** — a client ID and
secret sent as headers, which Access checks at the edge before passing the
request on. Set one up once:

1. Zero Trust → **Access controls** → **Service credentials** → **Service
   Tokens** → **Create Service Token**. Copy the Client ID and Client Secret;
   the secret is shown once.
2. Open the `bba-heartbeat` application → **Policies** → add a second policy
   with Action **Service Auth**, Include → **Service Token** → the one you just
   made. Leave the existing "Only me" policy alone: that is what lets *you* in
   from a browser, and Service Auth is what lets the runner in. An application
   needs both.
3. Put the pair in both places named under **Secrets and variables** above —
   on the Worker for `link-warden`, and in this repository's Actions secrets
   for `redirect-guard`.

**Done, 2026-08-26.** Both sets were written by dashboard-4's *Ops · Give the
other repos the credentials they report with*, which fans them out from the one
repository where they exist. Re-run that job rather than setting them by hand,
for the reason given above.

Both `src/report.ts` and `scripts/redirect-guard.ts` send the two headers only
when both are set, so nothing breaks if the dashboard is ever moved out from
behind Access.

### Why the reporting steps warn

Every reporting step ends without failing the job, because losing a log entry
must not fail a deploy that succeeded. For a long time it did that with a bare
`|| true`, which meant an unset URL, a rejected token and a successful post all
looked identical — and the steps reported nothing at all, in every run, for as
long as `DASHBOARD_URL` went unset.

They now distinguish the cases and emit a `::warning` for each one that is not
success. The job still passes; the log says what happened. A silent integration
is worse than a missing one, because a missing one gets noticed.

They also read the **status code** rather than trusting curl's exit code, which
took two attempts to get right. `curl -sf` does not fail on a `3xx` — `-f`
covers 4xx and 5xx only — so the first version of this fix accepted Access's
`302` to its login page as a successful post and printed "Reported to" over a
run that was never recorded. For an API call, a redirect is not a success; it
is the single most likely symptom of the Access problem described above, and
it now says so by name.
