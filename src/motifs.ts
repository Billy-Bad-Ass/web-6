/**
 * The visual language, drawn rather than borrowed.
 *
 * The mark is a waveform: horizontal bars radiating from a blue centre line and
 * terminating in a square. Everything here is built from those three elements —
 * the bar, the line, the terminator — so the artwork on a product card and the
 * logo in the masthead are recognisably the same system rather than a logo
 * sitting next to unrelated stock icons.
 *
 * Icon fonts can only ever give you someone else's silhouettes. These are
 * specific to what this network sells: a printed reference card, and a website
 * being examined. The handful of generic affordances — an arrow, an envelope, a
 * lock — are drawn here too rather than pulled from Font Awesome, which keeps
 * every mark on the site original work and leaves nothing to attribute.
 *
 * Everything uses `currentColor` for structure so the artwork inverts correctly
 * between themes, and the brand blue only where the accent is meant to read as
 * the accent.
 */

const BLUE = '#2B5CE6';

/**
 * The hero backdrop.
 *
 * The mark's silhouette blown up to full width and pushed almost to the
 * threshold of visibility — a texture you notice second, after the headline.
 * The blue line bleeds off both edges deliberately: the mark is a signal
 * passing through, and stopping it at the viewport would make it a diagram.
 *
 * Purely decorative, so it is `aria-hidden` and carries no title.
 */
export function signalField(): string {
  // The viewBox is deliberately near the aspect ratio of the hero it sits
  // behind. An earlier version used a 100x100 box scaled to cover a wide, tall
  // hero: `slice` then magnified everything about fifteen times, and the
  // texture rendered as thick grey bands across the headline. At this
  // resolution a 2-unit stroke stays a hairline at any viewport width.
  const W = 1200;
  const H = 600;
  const rows = 43;
  const bars: string[] = [];

  for (let i = 0; i < rows; i++) {
    const t = (i - (rows - 1) / 2) / ((rows - 1) / 2); // -1 … 1
    const y = H / 2 + t * (H / 2 - 34);
    // Cosine falloff: wide at the centre line, tapering away from it. This is
    // what gives the mark its lens silhouette.
    const half = Math.cos((t * Math.PI) / 2) ** 0.8 * (W / 2 - 70);
    if (half < 12) continue;

    // Fade with distance too, so the shape dissolves rather than ending.
    const opacity = (0.1 + (1 - Math.abs(t)) * 0.26).toFixed(3);
    bars.push(
      `<line x1="${(W / 2 - half).toFixed(1)}" y1="${y.toFixed(1)}" ` +
        `x2="${(W / 2 + half).toFixed(1)}" y2="${y.toFixed(1)}" opacity="${opacity}"/>`,
    );
  }

  return `<svg class="signal-field" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sf-fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0"/>
      <stop offset=".3" stop-color="${BLUE}" stop-opacity=".8"/>
      <stop offset=".7" stop-color="${BLUE}" stop-opacity=".8"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="sf-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${BLUE}" stop-opacity=".20"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sf-glow)"/>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round">${bars.join('')}</g>
  <line class="sf-signal" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="url(#sf-fade)" stroke-width="2.4"/>
</svg>`;
}

/**
 * A hairline that is a signal rather than a border.
 *
 * Used between sections. A flat 1px rule is the default everywhere on the web;
 * this one carries the brand's blue through its middle and fades at both ends,
 * which is the same gesture as the mark at a hundredth of the scale.
 */
export function rule(): string {
  return `<svg class="rule" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rule-fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${BLUE}" stop-opacity=".55"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="0" y1=".5" x2="100" y2=".5" stroke="url(#rule-fade)" stroke-width="1"/>
</svg>`;
}

/** Content bars standing in for text inside an illustration. */
function textLines(
  x: number,
  y: number,
  widths: number[],
  gap: number,
  opacity = 0.34,
): string {
  return widths
    .map(
      (w, i) =>
        `<rect x="${x}" y="${y + i * gap}" width="${w}" height="3" rx="1.5" opacity="${opacity}"/>`,
    )
    .join('');
}

/**
 * The guides business: printed reference cards.
 *
 * Three sheets, fanned. The point the product makes is that the answer is one
 * page you can hold, so the artwork shows paper — and the front sheet carries a
 * blue line where the fix is, which is the same blue line as the mark.
 */
export function guidesArt(): string {
  return `<svg class="card-art" viewBox="0 0 300 150" fill="currentColor" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(150 75)">
    <g transform="rotate(-9) translate(-56 -52)" opacity=".28">
      <rect width="112" height="104" rx="7" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </g>
    <g transform="rotate(-4.5) translate(-56 -52)" opacity=".5">
      <rect width="112" height="104" rx="7" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </g>
    <g transform="translate(-56 -52)">
      <rect width="112" height="104" rx="7" fill="none" stroke="currentColor" stroke-width="1.9" opacity=".9"/>
      ${textLines(16, 20, [46, 62], 9, 0.45)}
      <rect x="16" y="46" width="80" height="3.4" rx="1.7" fill="${BLUE}"/>
      ${textLines(16, 60, [70, 58, 66], 9, 0.3)}
      <rect x="16" y="88" width="9" height="9" rx="2" fill="${BLUE}" opacity=".9"/>
    </g>
  </g>
</svg>`;
}

/**
 * The audit business: a website being examined.
 *
 * A browser frame with its content rendered as bars, two of them flagged. The
 * blue scan line crossing the whole window is the same signal as everywhere
 * else — here it reads as the thing doing the looking.
 */
export function auditArt(): string {
  return `<svg class="card-art" viewBox="0 0 300 150" fill="currentColor" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scan" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${BLUE}" stop-opacity=".95"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g transform="translate(46 24)">
    <rect width="208" height="106" rx="9" fill="none" stroke="currentColor" stroke-width="1.9" opacity=".9"/>
    <line x1="0" y1="24" x2="208" y2="24" stroke="currentColor" stroke-width="1.5" opacity=".45"/>
    <g opacity=".45">
      <circle cx="15" cy="12" r="3.1"/><circle cx="27" cy="12" r="3.1"/><circle cx="39" cy="12" r="3.1"/>
    </g>
    <rect x="58" y="9" width="88" height="6" rx="3" opacity=".22"/>

    ${textLines(18, 40, [104, 132], 11, 0.3)}

    <!-- The two findings. Amber marks a problem; the pill beside it is where
         the report says what it costs you. -->
    <rect x="18" y="62" width="118" height="3.4" rx="1.7" fill="#E0A93B" opacity=".85"/>
    <rect x="142" y="60" width="22" height="7" rx="3.5" fill="#E0A93B" opacity=".28"/>
    <rect x="18" y="76" width="92" height="3.4" rx="1.7" fill="#E0A93B" opacity=".55"/>

    ${textLines(18, 88, [140], 10, 0.24)}
  </g>
  <line x1="18" y1="96" x2="282" y2="96" stroke="url(#scan)" stroke-width="2.2"/>
</svg>`;
}

/**
 * The production business: a finished build, copied, with your name on it.
 *
 * Three app frames stacked \u2014 offset rather than fanned, because the guides
 * card already owns rotation and rotation means paper. Software copies square.
 *
 * The front one is the only one with anything in it, and the one blue element
 * inside it is the nameplate: this is the same build the other two are, with
 * the brand swapped. That is the product in one shape. The terminator sits
 * where it does on the guides card, which is the mark saying the signal landed
 * \u2014 here, that the thing was handed over.
 */
export function productionArt(): string {
  // Three frames, each 10 down and 10 right of the last, so the stack's
  // bounding box lands centred in the 300x150 band the same way the other two
  // artworks do. The solid one is the third, which puts the subject slightly
  // below and right of centre and gives the stack its depth.
  const W = 132;
  const H = 90;
  const ghost = (x: number, y: number, opacity: string) =>
    `<g opacity="${opacity}"><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="7" ` +
    `fill="none" stroke="currentColor" stroke-width="1.6"/>` +
    `<line x1="${x}" y1="${y + 22}" x2="${x + W}" y2="${y + 22}" ` +
    `stroke="currentColor" stroke-width="1.4"/></g>`;

  return `<svg class="card-art" viewBox="0 0 300 150" fill="currentColor" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  ${ghost(74, 20, '.24')}
  ${ghost(84, 30, '.46')}
  <g>
    <rect x="94" y="40" width="${W}" height="${H}" rx="7" fill="none" stroke="currentColor" stroke-width="1.9" opacity=".9"/>
    <line x1="94" y1="62" x2="${94 + W}" y2="62" stroke="currentColor" stroke-width="1.5" opacity=".45"/>
    <!-- The nameplate. The one thing that changes, in the one colour that
         means "this is the accent". -->
    <rect x="106" y="47" width="48" height="7" rx="3.5" fill="${BLUE}" opacity=".9"/>
    ${textLines(106, 76, [96, 72], 12, 0.3)}
    <rect x="106" y="108" width="9" height="9" rx="2" fill="${BLUE}" opacity=".9"/>
  </g>
</svg>`;
}

export const CARD_ART: Record<string, () => string> = {
  guides: guidesArt,
  audit: auditArt,
  production: productionArt,
};

/**
 * The negative of the bullet: the bar, with the terminator missing.
 *
 * Used for the "what you may not do" lists. A red cross would be the obvious
 * choice and the wrong one — these are the terms of a license, not errors the
 * reader has made. The signal simply stops short of landing, which says the
 * same thing without telling somebody off for reading.
 */
export function bulletStop(): string {
  return `<svg class="bullet" viewBox="0 0 12 12" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="5" width="7" height="2" rx="1" fill="currentColor" opacity=".28"/>
  <rect x="9.5" y="5" width="3" height="2" rx="1" fill="currentColor" opacity=".14"/>
</svg>`;
}

/**
 * The square terminator from the mark, used as a list bullet.
 *
 * Replaces a generic tick. A tick says "included"; the terminator says "this is
 * where the signal lands", which is closer to what a line on these cards is.
 */
export function bullet(): string {
  return `<svg class="bullet" viewBox="0 0 12 12" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="5" width="7" height="2" rx="1" fill="currentColor" opacity=".45"/>
  <rect x="8.5" y="3.5" width="5" height="5" rx="1.2" fill="${BLUE}"/>
</svg>`;
}

/* ------------------------------------------------------------------ icons -- */

/**
 * The generic affordances, drawn rather than borrowed.
 *
 * Four simple shapes. Pulling in an icon font for these meant shipping someone
 * else's artwork under CC BY 4.0, which obliges a visible credit on every page
 * — a real constraint to accept in exchange for an arrow and an envelope. Drawn
 * here they are original work, they inherit the same stroke weight and rounding
 * as the mark, and the footer owes nobody anything.
 *
 * Stroked rather than filled, at a 16-unit grid, so they sit beside text at the
 * same optical weight as the bars in the logo.
 */
const GLYPHS: Record<string, string> = {
  'arrow-right': '<path d="M2.5 8h9M8.2 4.6 11.6 8l-3.4 3.4"/>',
  envelope:
    '<rect x="2" y="3.6" width="12" height="8.8" rx="1.6"/><path d="m2.7 4.6 5.3 4.1 5.3-4.1"/>',
  lock: '<rect x="3.2" y="7" width="9.6" height="6.8" rx="1.6"/><path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7"/>',
  // The mark's own terminator, used where something needs a full stop.
  node: '<rect x="5" y="5" width="6" height="6" rx="1.2" fill="currentColor" stroke="none"/>',
  // Drawn to the same grid and stroke weight as the rest, rather than dropping
  // in the official asset: this is a link to a profile, and the generic
  // camera-outline reads as one without shipping anyone's brand file.
  instagram:
    '<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="3.2"/>' +
    '<circle cx="8" cy="8" r="2.7"/>' +
    '<circle cx="11.3" cy="4.7" r=".85" fill="currentColor" stroke="none"/>',
};

/**
 * Renders an icon as inline SVG.
 *
 * `aria-hidden` because every icon on this site sits next to its own visible
 * label. An icon that repeats the text beside it is noise to a screen reader,
 * not an affordance.
 */
export function icon(name: string, className = 'icon'): string {
  const glyph = GLYPHS[name];
  if (!glyph) throw new Error(`Unknown icon: ${name}. Add it to GLYPHS in src/motifs.ts.`);

  return (
    `<svg class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${glyph}</svg>`
  );
}
