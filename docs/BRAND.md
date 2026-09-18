# The design system

One stylesheet, three sites. `bbanetwork.org`, `guides.bbanetwork.org` and
`audit.bbanetwork.org` are built in three repositories by three different
sessions, and the only realistic way they keep looking like one network is a
single file they all link. A copied stylesheet diverges the first time somebody
nudges a colour, and then the network looks like three unrelated products that
happen to share a logo.

## Adopting it

Two lines in `<head>`:

```html
<link rel="stylesheet" href="https://bbanetwork.org/brand/v1.css">
<link rel="preload" href="https://bbanetwork.org/fonts/space-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="https://bbanetwork.org/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
```

That is the whole integration. No build step, no package, no npm dependency —
and a colour fix reaches every subdomain without any of them redeploying.

**Working templates are in [`templates/`](../templates):**

| File | For | Notes |
| --- | --- | --- |
| `templates/guides.html` | Project 2 | Storefront: product grid, how-it-works, FAQ. Wire the buy buttons to real Checkout sessions and replace the cover images. |
| `templates/audit.html` | Project 1 | Sales page: offer, what-you-get, steps, FAQ. Replace `STRIPE_PAYMENT_LINK` with the real Payment Link. |

Both are complete, valid pages with zero local CSS. Copy one and edit the
content.

## What is in it

### Foundations

- **Colour.** Every brand value is lifted from the kit's own SVGs, not chosen
  to sit near them: `#2B5CE6` blue, `#0B0F16` ink, `#12161F` slate, `#FAFAF8`
  paper, `#C7CCD6` grey.
- **Two themes, both complete.** Dark is the default because the mark is drawn
  for a dark ground. Every token is redefined under
  `prefers-color-scheme: light` — a token defined in only one mode renders as
  an invalid colour in the other and is silently dropped.
- **Type.** Space Grotesk for display, Inter for text. Self-hosted variable
  subsets, 70KB for the pair, served from this origin with `Access-Control-Allow-Origin: *`
  so the other subdomains can use them.

Components should reference the **role** tokens (`--bg`, `--text`, `--accent`,
`--line`), never the raw brand values. That is what makes a theme change one
block rather than a find-and-replace.

### Layout

| Class | Does |
| --- | --- |
| `.wrap` | The page column — `min(100% - 2.5rem, 1140px)`, centred. |
| `.narrow` | Narrows a reading column to 760px **inside** `.wrap`. Use this rather than a max-width on `.wrap` itself, which re-centres the block and breaks the left edge every other section shares. |
| `.section` | Vertical rhythm between blocks. |
| `.band` | A `.section` on the sunken background, for alternating stripes. |

### Components

| Class | Does |
| --- | --- |
| `.masthead` + `.brand` + `.brand-name` | The sticky header and logo lockup. Drop the mark SVG in — see either template. |
| `.hero` / `.hero.compact` | Full-height hero, or the shorter one a storefront wants. |
| `.eyebrow`, `h1`, `.lede` | The hero type stack. |
| `.cards` / `.card` | The panel grid. `.card-art-band` holds an illustration; `.card-body` the text. |
| `.products` / `.product` | Product grid with `.product-cover`, `.amount` and a buy button. |
| `.buy`, `.buy.ghost` | The primary action. Bigger than `.cta` on purpose: on a storefront this is the page's whole point, and a primary action that looks like a nav link loses sales. |
| `.cta` | The secondary/inline action. Inside a `.card` its `::after` makes the whole card clickable while the anchor stays a real anchor. |
| `.reassure` | The row of small promises under a buy button. |
| `.steps` | Auto-numbered "how it works" list. Use an `<ol>`. |
| `.faq` | `<details>`/`<summary>` accordion. Works with no JavaScript. |
| `.pill.live` / `.building` / `.planned` | Status chips. |
| `.quote` | Pull-quote with the blue rule. |

### Motifs

`src/motifs.ts` draws the artwork: `signalField()` for hero backdrops,
`rule()` for the section divider, `guidesArt()` and `auditArt()` for the
product cards, `bullet()` for lists. All derived from the mark — a bar, a line,
a square terminator — so a product illustration and the logo are visibly the
same system.

The interface icons are drawn here too — an arrow, an envelope, a lock, on a
16-unit grid at the same stroke weight as the mark. They were Font Awesome
under CC BY 4.0, which obliges a visible credit on every page; drawing four
simple shapes was the cheaper trade. Nothing on the site is borrowed artwork.

## Rules

1. **Do not copy the stylesheet into another repository.** Link it. That is the
   entire point.
2. **Do not add local CSS that overrides these tokens.** If a subdomain needs
   something the system does not have, add it here so all three get it.
3. **Do not paste in a borrowed icon.** Everything here is original, which is
   why no page carries a third-party credit. A glyph lifted from an icon set
   brings its license with it — and most of them require attribution on every
   page it appears.
4. **Both themes or neither.** A colour defined only in the dark block is a bug.

## Versioning

The path is versioned, not a query string: a breaking change ships as
`/brand/v2.css` while `v1` keeps serving whatever has not migrated. Cached for
an hour at the browser and a day at the edge.
