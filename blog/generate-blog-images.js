#!/usr/bin/env node
/* ============================================================
   PHASE 8A — BLOG IMAGE SYSTEM
   Generates original, on-brand SVG featured-image assets for the
   blog, one visual concept per category (per the Phase 8A brief's
   category -> visual mapping), plus a second, deliberately distinct
   variant for the pillar/featured article in each category so the
   blog listing doesn't show two identical hero images side by side.

   These are NOT stock photos and NOT fabricated screenshots/dashboards.
   They are simple, original geometric/iconographic compositions built
   from the site's own brand tokens (see css/style.css :root), sized
   consistently at 1200x675 (16:9) so a single asset can serve the
   article hero, the blog card (object-fit: cover, 5:3 crop), and the
   OG/Twitter share image without distortion.

   Run: node blog/generate-blog-images.js
   Output: /assets/images/blog/<category-slug>[--alt].svg
   ============================================================ */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "assets", "images", "blog");
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1200;
const H = 675;

// Brand tokens (from css/style.css :root) — reused exactly, not reinvented.
const PRIMARY = "#6D3DF5";
const PRIMARY_LIGHT = "#F0EBFF";
const TEXT = "#17151F";
const SURFACE = "#FAF9FC";
const WHITE = "#FFFFFF";
const BORDER = "#E9E5F2";

// A small tonal ladder derived from the single brand purple, used for
// depth/layering instead of introducing off-brand colors.
const PRIMARY_MID = "#8F6BF7"; // lighter step between PRIMARY and PRIMARY_LIGHT
const PRIMARY_DEEP = "#4E22C9"; // darker step for contrast accents

function svgWrap(inner, bg = SURFACE) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img">
<rect width="${W}" height="${H}" fill="${bg}"/>
${inner}
</svg>`;
}

// Shared decorative backdrop: soft diagonal band + dot grid, present on
// every image so the set reads as one consistent system rather than
// unrelated one-off graphics.
function backdrop(seedOffset = 0) {
  const dots = [];
  const cols = 14;
  const rows = 8;
  const spacing = 46;
  const startX = 60 + (seedOffset % 20);
  const startY = 60;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * spacing;
      const y = startY + r * spacing;
      if (x > W - 40 || y > H - 40) continue;
      if ((r + c) % 3 !== 0) continue;
      dots.push(`<circle cx="${x}" cy="${y}" r="2" fill="${BORDER}"/>`);
    }
  }
  return `
<polygon points="${W * 0.62},0 ${W},0 ${W},${H} ${W * 0.34},${H}" fill="${PRIMARY_LIGHT}" opacity="0.55"/>
${dots.join("\n")}
`;
}

function iconBadge(cx, cy, r, iconInner) {
  return `
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${WHITE}" stroke="${BORDER}" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="${r - 10}" fill="${PRIMARY_LIGHT}"/>
<g transform="translate(${cx - 60} ${cy - 60})" stroke="${PRIMARY}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none">
${iconInner}
</g>`;
}

function label(text) {
  return `<text x="90" y="${H - 70}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${TEXT}">${text}</text>`;
}

// ---- Per-category icon compositions (all built from primitive shapes,
// nothing traced/copied) ----

const ICONS = {
  "social-media-marketing": `
    <circle cx="30" cy="30" r="14"/>
    <circle cx="90" cy="18" r="10"/>
    <circle cx="94" cy="82" r="12"/>
    <path d="M42 26 L80 20"/>
    <path d="M40 36 L84 76"/>
  `, // connected nodes -> social graph
  seo: `
    <circle cx="46" cy="46" r="30"/>
    <path d="M68 68 L98 98"/>
  `, // magnifying glass -> search
  "paid-advertising": `
    <path d="M14 70 L14 40 L60 10 L60 100 L14 70 Z"/>
    <path d="M60 40 Q92 40 92 20"/>
    <path d="M60 70 Q92 70 92 90"/>
  `, // megaphone -> ads
  "app-development": `
    <rect x="30" y="6" width="44" height="92" rx="10"/>
    <line x1="30" y1="20" x2="74" y2="20"/>
    <line x1="30" y1="84" x2="74" y2="84"/>
    <circle cx="52" cy="91" r="3" fill="${PRIMARY}" stroke="none"/>
  `, // mobile device
  "website-development": `
    <rect x="8" y="18" width="88" height="66" rx="6"/>
    <line x1="8" y1="34" x2="96" y2="34"/>
    <circle cx="20" cy="26" r="2.4" fill="${PRIMARY}" stroke="none"/>
    <circle cx="30" cy="26" r="2.4" fill="${PRIMARY}" stroke="none"/>
    <circle cx="40" cy="26" r="2.4" fill="${PRIMARY}" stroke="none"/>
    <line x1="24" y1="50" x2="80" y2="50"/>
    <line x1="24" y1="62" x2="64" y2="62"/>
  `, // browser window -> responsive site
  "software-development": `
    <path d="M30 20 L8 52 L30 84"/>
    <path d="M70 20 L92 52 L70 84"/>
    <line x1="58" y1="14" x2="42" y2="90"/>
  `, // code brackets
  "video-editing": `
    <rect x="8" y="24" width="64" height="52" rx="8"/>
    <path d="M72 40 L96 26 L96 74 L72 60 Z"/>
    <line x1="24" y1="24" x2="24" y2="76"/>
    <line x1="42" y1="24" x2="42" y2="76"/>
  `, // filmstrip + play -> editing
  "video-shooting": `
    <rect x="10" y="34" width="58" height="42" rx="8"/>
    <path d="M68 46 L94 32 L94 78 L68 64 Z"/>
    <circle cx="39" cy="55" r="14"/>
  `, // camera
  ugc: `
    <circle cx="34" cy="34" r="20"/>
    <path d="M10 92 Q10 62 34 62 Q58 62 58 92"/>
    <circle cx="78" cy="26" r="12"/>
    <path d="M60 92 Q60 70 78 70 Q96 70 96 92"/>
  `, // two people -> creators/community
  "business-growth": `
    <path d="M8 90 L34 60 L54 76 L96 26"/>
    <path d="M72 26 L96 26 L96 50"/>
  `, // growth arrow chart
};

const CATEGORY_LABELS = {
  "social-media-marketing": "Social Media Marketing",
  seo: "SEO",
  "paid-advertising": "Paid Advertising",
  "app-development": "App Development",
  "website-development": "Website Development",
  "software-development": "Software Development",
  "video-editing": "Video Editing",
  "video-shooting": "Video Shooting",
  ugc: "UGC",
  "business-growth": "Business Growth",
};

function buildPrimary(slug) {
  const icon = ICONS[slug];
  const badge = iconBadge(210, H / 2, 130, icon);
  return svgWrap(`
${backdrop(0)}
${badge}
${label(CATEGORY_LABELS[slug])}
<rect x="90" y="${H - 40}" width="120" height="6" rx="3" fill="${PRIMARY}"/>
`);
}

// Distinct "alt" composition for the featured/pillar article per
// category, so the blog listing's spotlighted card doesn't reuse the
// exact same image as the grid cards below it.
function buildAlt(slug) {
  const icon = ICONS[slug];
  const badge = iconBadge(W - 230, H / 2, 150, icon);
  return svgWrap(`
${backdrop(10)}
${badge}
${label(CATEGORY_LABELS[slug])}
<rect x="90" y="${H - 40}" width="160" height="6" rx="3" fill="${PRIMARY_DEEP}"/>
`, PRIMARY_LIGHT);
}

let count = 0;
for (const slug of Object.keys(CATEGORY_LABELS)) {
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), buildPrimary(slug), "utf8");
  fs.writeFileSync(path.join(OUT_DIR, `${slug}--featured.svg`), buildAlt(slug), "utf8");
  count += 2;
}

console.log(`Generated ${count} SVG assets in ${OUT_DIR}`);
