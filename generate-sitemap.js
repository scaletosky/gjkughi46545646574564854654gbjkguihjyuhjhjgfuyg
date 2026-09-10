#!/usr/bin/env node
/* ============================================================
   STATIC SITEMAP GENERATOR — Phase 7 (Technical SEO)
   ------------------------------------------------------------
   Reads the static root-page list plus the blog's article index
   and writes /sitemap.xml directly. No server, no API, no
   runtime dependency — this is a dev-time build script only,
   the same pattern as blog/generate-article.js.

   Usage: node generate-sitemap.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const SITE_URL = "https://scaletosky.com";
const SITEMAP_PATH = path.join(ROOT_DIR, "sitemap.xml");
const ARTICLES_DIR = path.join(ROOT_DIR, "blog", "data", "articles");
const INDEX_PATH = path.join(ROOT_DIR, "blog", "data", "index.js");

// Static public pages. lastmod values are preserved from the existing
// sitemap unless explicitly bumped here when a page's implementation
// actually changed — never set to "today" just to look fresh.
const STATIC_PAGES = [
  { loc: "/", lastmod: "2026-09-06", changefreq: "weekly", priority: "1.0" },
  { loc: "/about.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.8" },
  { loc: "/services.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.8" },
  { loc: "/social-media-management.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.7" },
  { loc: "/web-development.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.7" },
  { loc: "/video-shoot-editing.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.7" },
  { loc: "/meta-ads.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.7" },
  { loc: "/app-development.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.7" },
  { loc: "/ugc-videos.html", lastmod: "2026-09-06", changefreq: "monthly", priority: "0.7" },
  { loc: "/portfolio.html", lastmod: "2026-09-06", changefreq: "weekly", priority: "0.8" },
  { loc: "/contact.html", lastmod: "2026-09-10", changefreq: "monthly", priority: "0.7" },
  // Blog listing — newly added in Phase 7, since the blog previously
  // had zero sitemap presence.
  { loc: "/blog.html", lastmod: "2026-09-10", changefreq: "weekly", priority: "0.8" },
];

function loadArticleIndex() {
  const src = fs.readFileSync(INDEX_PATH, "utf8");
  const sandbox = { window: { BLOG_INDEX: [] } };
  // eslint-disable-next-line no-new-func
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_INDEX;
}

function loadArticleRecord(slug) {
  const file = path.join(ARTICLES_DIR, slug + ".js");
  const src = fs.readFileSync(file, "utf8");
  const sandbox = { window: { BLOG_ARTICLES: {} } };
  // eslint-disable-next-line no-new-func
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_ARTICLES[slug];
}

function buildArticleEntries() {
  const index = loadArticleIndex();
  const entries = [];
  index
    .filter((entry) => entry.status === "published")
    .forEach((entry) => {
      const record = loadArticleRecord(entry.slug);
      if (!record) {
        console.warn("WARNING: no article record found for published slug:", entry.slug);
        return;
      }
      const loc = record.canonicalUrl || (SITE_URL + "/blog/" + entry.slug + ".html");
      // lastmod = most recent of publishedAt/updatedAt. Upstream data has
      // already been corrected so updatedAt is never before publishedAt.
      const lastmod =
        record.updatedAt && record.updatedAt >= record.publishedAt
          ? record.updatedAt
          : record.publishedAt;
      entries.push({
        loc,
        lastmod: lastmod || "",
        changefreq: "monthly",
        priority: "0.6",
      });
    });
  return entries;
}

function urlBlock(entry) {
  const loc = entry.loc.startsWith("http") ? entry.loc : SITE_URL + entry.loc;
  return (
    "  <url>\n" +
    "    <loc>" + loc + "</loc>\n" +
    (entry.lastmod ? "    <lastmod>" + entry.lastmod + "</lastmod>\n" : "") +
    "    <changefreq>" + entry.changefreq + "</changefreq>\n" +
    "    <priority>" + entry.priority + "</priority>\n" +
    "  </url>"
  );
}

function generate() {
  const articleEntries = buildArticleEntries();
  const allEntries = STATIC_PAGES.concat(articleEntries);

  // Duplicate-URL guard before writing.
  const seen = new Set();
  const dupes = [];
  allEntries.forEach((e) => {
    const loc = e.loc.startsWith("http") ? e.loc : SITE_URL + e.loc;
    if (seen.has(loc)) dupes.push(loc);
    seen.add(loc);
  });
  if (dupes.length) {
    console.error("ERROR: duplicate URLs would be written to sitemap:", dupes);
    process.exit(1);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    allEntries.map(urlBlock).join("\n") +
    "\n</urlset>\n";

  fs.writeFileSync(SITEMAP_PATH, xml, "utf8");
  console.log(
    "Wrote sitemap.xml —", allEntries.length, "URLs (",
    STATIC_PAGES.length, "static +", articleEntries.length, "published articles )"
  );
}

if (require.main === module) {
  generate();
}

module.exports = { generate, buildArticleEntries };
