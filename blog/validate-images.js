#!/usr/bin/env node
/* Image QA — verifies featuredImage.src (and og-image PNG variant where
   applicable) resolves to a real file on disk for every publishable
   article, and that alt text is present. Added during Phase 8 Final QA. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ARTICLES_DIR = path.join(__dirname, "data", "articles");

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

  const issues = [];
  let checked = 0;
  let publishableChecked = 0;

  for (const slug of slugs) {
    const a = loadArticle(slug);
    checked++;
    if (!a) {
      issues.push(slug + ": could not load article record");
      continue;
    }
    const isPublishable = a.status === "published";
    if (isPublishable) publishableChecked++;

    const img = a.featuredImage;
    if (!img || !img.src) {
      if (isPublishable) issues.push(slug + ": missing featuredImage.src");
      continue;
    }

    const srcPath = path.join(ROOT, img.src.replace(/^\//, ""));
    if (!fs.existsSync(srcPath)) {
      issues.push(slug + ": featuredImage.src does not resolve to a file: " + img.src);
    }

    // Check for a PNG OG-share variant alongside the WebP, when src is webp
    if (img.src.endsWith(".webp")) {
      const pngPath = srcPath.replace(/\.webp$/, ".png");
      if (!fs.existsSync(pngPath)) {
        if (isPublishable) issues.push(slug + ": no PNG OG-share counterpart for " + img.src);
      }
    }

    if (!img.alt || !img.alt.trim()) {
      if (isPublishable) issues.push(slug + ": featuredImage.alt is missing/empty");
    }
  }

  console.log("=== Scale To Sky — Image QA Report ===\n");
  console.log("Articles checked: " + checked + " (publishable: " + publishableChecked + ")");
  console.log("Issues found: " + issues.length + "\n");

  if (issues.length === 0) {
    console.log("✅ All publishable articles have a resolvable featuredImage.src, a PNG OG counterpart, and alt text.");
  } else {
    for (const i of issues) console.log("❌ " + i);
  }

  console.log("\n=== End of report ===");
  process.exit(issues.length === 0 ? 0 : 1);
}

main();
