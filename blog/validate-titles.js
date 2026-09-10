#!/usr/bin/env node
/* ============================================================
   TITLE QA — validates <title>, og:title, twitter:title across
   all published articles plus core site pages. Added during
   Phase 8 Final QA to catch title bugs (duplication, empty,
   "undefined"/"null", placeholder text) that validate-seo.js
   did not previously check for.

   Usage: node blog/validate-titles.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BLOG_DIR = __dirname;
const ARTICLES_DIR = path.join(BLOG_DIR, "data", "articles");

const PLACEHOLDER_PATTERNS = [/undefined/i, /\bnull\b/i, /lorem ipsum/i, /TODO/i, /placeholder/i, /\{\{.*?\}\}/];

function readTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1] : null;
}

function readMeta(html, prop) {
  const re = new RegExp(
    '<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']*)["\']',
    "i"
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

function countOccurrences(str, sub) {
  return str.split(sub).length - 1;
}

function checkFile(filePath, label) {
  const issues = [];
  if (!fs.existsSync(filePath)) {
    return { label, issues: ["FILE MISSING: " + filePath] };
  }
  const html = fs.readFileSync(filePath, "utf8");
  const title = readTitle(html);
  const ogTitle = readMeta(html, "og:title");
  const twTitle = readMeta(html, "twitter:title");

  if (title == null || title.trim() === "") {
    issues.push("<title> missing or empty");
  } else {
    for (const pat of PLACEHOLDER_PATTERNS) {
      if (pat.test(title)) issues.push("<title> contains placeholder pattern: " + pat);
    }
    const dupCount = countOccurrences(title, "Scale To Sky");
    if (dupCount > 1) {
      issues.push('<title> contains "Scale To Sky" ' + dupCount + ' times (duplicate brand): "' + title + '"');
    }
    if (dupCount === 0) {
      issues.push('<title> is missing the "Scale To Sky" brand suffix: "' + title + '"');
    }
  }

  // og:title / twitter:title are allowed to be absent on non-article pages,
  // but if present must not be empty/placeholder and must not duplicate brand.
  for (const [name, val] of [["og:title", ogTitle], ["twitter:title", twTitle]]) {
    if (val != null) {
      if (val.trim() === "") issues.push(name + " is empty");
      for (const pat of PLACEHOLDER_PATTERNS) {
        if (pat.test(val)) issues.push(name + " contains placeholder pattern: " + pat);
      }
      const dupCount = countOccurrences(val, "Scale To Sky");
      if (dupCount > 1) issues.push(name + ' contains "Scale To Sky" ' + dupCount + " times: \"" + val + '"');
    }
  }

  return { label, title, ogTitle, twTitle, issues };
}

function main() {
  const results = [];

  // Non-blog pages
  const sitePages = [
    "index.html",
    "about.html",
    "services.html",
    "portfolio.html",
    "contact.html",
    "blog.html",
    "portfolio-project.html",
    "app-development.html",
    "web-development.html",
    "meta-ads.html",
    "social-media-management.html",
    "video-shoot-editing.html",
    "ugc-videos.html",
  ];
  for (const page of sitePages) {
    const p = path.join(ROOT, page);
    if (fs.existsSync(p)) results.push(checkFile(p, page));
  }

  // Article pages — check ALL 60 (including blocked case study, since
  // its static HTML shell also has head metadata even though blog.js
  // blocks it from rendering/being listed).
  const articleFiles = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.replace(/\.js$/, ""));

  for (const slug of articleFiles) {
    const p = path.join(BLOG_DIR, slug + ".html");
    results.push(checkFile(p, "blog/" + slug + ".html"));
  }

  const failed = results.filter((r) => r.issues.length > 0);

  console.log("=== Scale To Sky — Title QA Report ===\n");
  console.log("Pages checked: " + results.length);
  console.log("Pages with issues: " + failed.length + "\n");

  if (failed.length === 0) {
    console.log("✅ All titles present, non-empty, free of duplicate brand suffix, and free of placeholder text.");
  } else {
    for (const f of failed) {
      console.log("❌ " + f.label);
      for (const issue of f.issues) console.log("   - " + issue);
    }
  }

  console.log("\n=== End of report ===");
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
