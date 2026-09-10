#!/usr/bin/env node
/* ============================================================
   DEV-ONLY GENERATOR — NOT part of the deployed static site.
   Fills _article-template.html with a given article's metadata
   to produce /blog/<slug>.html. Run manually whenever an
   article's data record changes (title, meta, canonical, etc.)
   or a new article is published.

   Usage: node blog/generate-article.js <slug>
          node blog/generate-article.js --all
   ============================================================ */

const fs = require("fs");
const path = require("path");

const BLOG_DIR = __dirname;
const ARTICLES_DIR = path.join(BLOG_DIR, "data", "articles");
const TEMPLATE_PATH = path.join(BLOG_DIR, "_article-template.html");
const CATEGORIES_PATH = path.join(BLOG_DIR, "data", "categories.js");
const SITE_URL = "https://scaletosky.com";

function loadCategories() {
  const src = fs.readFileSync(CATEGORIES_PATH, "utf8");
  const sandbox = { window: { BLOG_CATEGORIES: [] } };
  // eslint-disable-next-line no-new-func
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_CATEGORIES;
}

function getCategory(categorySlug) {
  const categories = loadCategories();
  return categories.find((c) => c.slug === categorySlug) || null;
}

function loadArticle(slug) {
  const file = path.join(ARTICLES_DIR, slug + ".js");
  const src = fs.readFileSync(file, "utf8");
  // Data files are `window.BLOG_ARTICLES["<slug>"] = {...};` — sandbox-eval
  // just enough to pull the object out without a real browser global.
  const sandbox = { window: { BLOG_ARTICLES: {} } };
  // eslint-disable-next-line no-new-func
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_ARTICLES[slug];
}

function escapeHtmlAttr(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escapes text for safe inclusion inside a JSON string value that will
// itself sit inside an HTML <script type="application/ld+json"> block.
// JSON.stringify handles the JSON-level escaping; the extra </script>
// guard prevents a literal "</script>" in FAQ text from prematurely
// closing the script tag in the browser's HTML parser.
function jsonForScriptTag(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildFaqSchema(article) {
  const faq = Array.isArray(article.faq) ? article.faq : [];
  const eligible =
    faq.length >= 2 &&
    faq.every((q) => q && q.question && q.answer) &&
    Array.isArray(article.schemaType) &&
    article.schemaType.indexOf("FAQPage") !== -1;

  if (!eligible) return "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map((q) => ({
      "@type": "Question",
      "name": q.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": q.answer,
      },
    })),
  };

  return (
    "\n<!-- FAQ schema — added because this article has genuine, " +
    "already-rendered FAQ content eligible for FAQPage markup. -->\n" +
    '<script type="application/ld+json">\n' +
    jsonForScriptTag(schema) +
    "\n</script>"
  );
}

// Mirrors the visible breadcrumb nav rendered client-side by
// blog.js's renderArticle(): Home > Blog > Category > Article.
// Only emitted with real, resolvable data — no invented hierarchy.
function buildBreadcrumbSchema(article) {
  const cat = getCategory(article.category);
  const items = [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": SITE_URL + "/blog.html" },
  ];
  if (cat) {
    items.push({
      "@type": "ListItem",
      "position": 3,
      "name": cat.name,
      "item": SITE_URL + "/blog.html#" + cat.slug,
    });
  }
  items.push({
    "@type": "ListItem",
    "position": items.length + 1,
    "name": article.title,
    "item": article.canonicalUrl || (SITE_URL + "/blog/" + article.slug + ".html"),
  });

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items,
  };
  return jsonForScriptTag(schema);
}

function generate(slug) {
  const article = loadArticle(slug);
  if (!article) {
    console.error("No article data found for slug:", slug);
    process.exit(1);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  const metaTitle = article.metaTitle || article.title;
  const metaDescription = article.metaDescription || article.excerpt || "";
  const canonicalUrl = article.canonicalUrl ||
    ("https://scaletosky.com/blog/" + article.slug + ".html");
  const ogImage = article.ogImage ||
    (article.featuredImage && article.featuredImage.src) ||
    "https://scaletosky.com/assets/images/logo-mark-full.png";
  // datePublished must never postdate dateModified. Real data was
  // audited and corrected upstream (updatedAt >= publishedAt for every
  // published article) — this is a defensive floor, not a fabrication.
  const datePublished = article.publishedAt || "";
  const dateModified =
    article.updatedAt && article.updatedAt >= datePublished
      ? article.updatedAt
      : datePublished;

  let filled = template
    .replace(/\{\{METATITLE\}\}/g, escapeHtmlAttr(metaTitle))
    .replace(/\{\{METADESCRIPTION\}\}/g, escapeHtmlAttr(metaDescription))
    .replace(/\{\{CANONICALURL\}\}/g, escapeHtmlAttr(canonicalUrl))
    .replace(/\{\{OGIMAGE\}\}/g, escapeHtmlAttr(ogImage))
    .replace(/\{\{TITLE\}\}/g, escapeHtmlAttr(article.title))
    .replace(/\{\{SLUG\}\}/g, article.slug)
    .replace(/\{\{DATEPUBLISHED\}\}/g, escapeHtmlAttr(datePublished))
    .replace(/\{\{DATEMODIFIED\}\}/g, escapeHtmlAttr(dateModified))
    .replace(
      /\{\{BREADCRUMBSCHEMA\}\}/g,
      buildBreadcrumbSchema(article)
    );

  // Insert FAQ schema (when genuinely eligible) right after the
  // existing Article schema block, before </head>.
  const faqSchema = buildFaqSchema(article);
  if (faqSchema) {
    const marker = "</script>\n</head>";
    if (filled.indexOf(marker) !== -1) {
      filled = filled.replace(marker, "</script>" + faqSchema + "\n</head>");
    } else {
      console.warn(
        "Warning:", slug,
        "— could not find Article schema close marker to attach FAQ schema after; skipped."
      );
    }
  }

  const outPath = path.join(BLOG_DIR, article.slug + ".html");
  fs.writeFileSync(outPath, filled, "utf8");
  console.log("Generated:", outPath, faqSchema ? "(with FAQPage schema)" : "");
}

const args = process.argv.slice(2);
if (args[0] === "--all") {
  fs.readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".js"))
    .forEach((f) => generate(f.replace(/\.js$/, "")));
} else if (args[0]) {
  generate(args[0]);
} else {
  console.error("Usage: node blog/generate-article.js <slug> | --all");
  process.exit(1);
}
