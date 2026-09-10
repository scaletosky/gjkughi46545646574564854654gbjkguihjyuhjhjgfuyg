#!/usr/bin/env node
/* Internal link audit — checks relatedArticles, previous/next, and
   inline content links for: broken destinations, self-links, links to
   unpublished/blocked articles, malformed blog URLs, and incorrect
   service URLs. Added during Phase 8 Final QA (Part 13). */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ARTICLES_DIR = path.join(__dirname, "data", "articles");

const KNOWN_SERVICE_PAGES = new Set([
  "index.html",
  "about.html",
  "services.html",
  "portfolio.html",
  "contact.html",
  "blog.html",
  "app-development.html",
  "web-development.html",
  "meta-ads.html",
  "social-media-management.html",
  "video-shoot-editing.html",
  "ugc-videos.html",
]);

function loadArticle(slug) {
  const file = path.join(ARTICLES_DIR, slug + ".js");
  const src = fs.readFileSync(file, "utf8");
  const sandbox = { window: { BLOG_ARTICLES: {} } };
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_ARTICLES[slug];
}

function main() {
  const slugs = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""));

  const articles = {};
  for (const slug of slugs) articles[slug] = loadArticle(slug);

  const issues = [];
  const linkedSlugs = new Set();

  for (const slug of slugs) {
    const a = articles[slug];
    if (!a) continue;
    const isPublished = a.status === "published";

    // relatedArticles
    (a.relatedArticles || []).forEach((rel) => {
      if (rel === slug) issues.push(slug + ": relatedArticles contains a self-link");
      if (!articles[rel]) {
        issues.push(slug + ': relatedArticles references non-existent slug "' + rel + '"');
      } else {
        linkedSlugs.add(rel);
        if (articles[rel].status !== "published" && isPublished) {
          issues.push(slug + ': relatedArticles links to unpublished/blocked article "' + rel + '"');
        }
      }
    });

    // previous/next
    ["previousArticle", "nextArticle"].forEach((field) => {
      const val = a[field];
      if (val) {
        if (val === slug) issues.push(slug + ": " + field + " is a self-link");
        if (!articles[val]) {
          issues.push(slug + ": " + field + ' references non-existent slug "' + val + '"');
        } else {
          linkedSlugs.add(val);
          if (articles[val].status !== "published" && isPublished) {
            issues.push(slug + ": " + field + ' links to unpublished/blocked article "' + val + '"');
          }
        }
      }
    });

    // Inline content links (basic href scan of raw HTML content field)
    if (isPublished && typeof a.content === "string") {
      const hrefRe = /href="([^"]+)"/g;
      let m;
      while ((m = hrefRe.exec(a.content))) {
        const href = m[1];
        if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) continue;

        // /blog/<slug>.html or /blog/<slug>
        const blogMatch = href.match(/^\/blog\/([a-z0-9-]+)(\.html)?$/);
        if (blogMatch) {
          const linkedSlug = blogMatch[1];
          if (linkedSlug === slug) issues.push(slug + ": inline content contains a self-link");
          if (!articles[linkedSlug]) {
            issues.push(slug + ': inline link references non-existent article "' + linkedSlug + '"');
          } else {
            linkedSlugs.add(linkedSlug);
            if (articles[linkedSlug].status !== "published") {
              issues.push(slug + ': inline content links to unpublished/blocked article "' + linkedSlug + '"');
            }
          }
          continue;
        }

        // service/site page links
        const cleaned = href.replace(/^\//, "");
        if (cleaned.endsWith(".html") && !cleaned.startsWith("blog/")) {
          if (!KNOWN_SERVICE_PAGES.has(cleaned)) {
            issues.push(slug + ': inline link points to unknown service/site page "' + href + '"');
          }
        }
      }
    }
  }

  // Orphan check: published articles never linked from relatedArticles/prev/next/inline
  const orphans = slugs.filter((s) => articles[s].status === "published" && !linkedSlugs.has(s));

  console.log("=== Scale To Sky — Internal Link Audit ===\n");
  console.log("Articles checked: " + slugs.length);
  console.log("Issues found: " + issues.length + "\n");

  if (issues.length === 0) {
    console.log("✅ No broken links, self-links, or links to blocked/unpublished articles found.");
  } else {
    for (const i of issues) console.log("❌ " + i);
  }

  console.log("\nOrphan published articles (not linked from any relatedArticles/prev-next/inline link): " + orphans.length);
  if (orphans.length) {
    orphans.forEach((o) => console.log("  - " + o));
  }

  console.log("\n=== End of report ===");
  process.exit(issues.length === 0 ? 0 : 1);
}

main();
