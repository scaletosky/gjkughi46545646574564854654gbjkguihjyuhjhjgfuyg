#!/usr/bin/env node
/* ============================================================
   TECHNICAL SEO VALIDATOR — Phase 7
   ------------------------------------------------------------
   Static/local only — no API, no server. Checks:
   1. Sitemap vs filesystem vs article-record consistency
      (published record with missing HTML, HTML with no record,
      published record missing from sitemap, sitemap URL with no
      HTML, blocked/draft article accidentally in sitemap)
   2. Sitemap XML validity: absolute HTTPS, correct domain, no
      query strings, no duplicates
   3. Structured data in each published article's generated HTML:
      valid JSON, @context/@type present, canonical/OG/breadcrumb/
      Article-schema URL consistency, valid ISO dates with
      datePublished <= dateModified

   Usage: node validate-seo.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const SITE_URL = "https://scaletosky.com";
const SITEMAP_PATH = path.join(ROOT_DIR, "sitemap.xml");
const BLOG_DIR = path.join(ROOT_DIR, "blog");
const ARTICLES_DIR = path.join(BLOG_DIR, "data", "articles");
const INDEX_PATH = path.join(BLOG_DIR, "data", "index.js");

function loadArticleIndex() {
  const src = fs.readFileSync(INDEX_PATH, "utf8");
  const sandbox = { window: { BLOG_INDEX: [] } };
  // eslint-disable-next-line no-new-func
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_INDEX;
}

function loadArticleRecord(slug) {
  const file = path.join(ARTICLES_DIR, slug + ".js");
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");
  const sandbox = { window: { BLOG_ARTICLES: {} } };
  // eslint-disable-next-line no-new-func
  new Function("window", src)(sandbox.window);
  return sandbox.window.BLOG_ARTICLES[slug];
}

function parseSitemapUrls() {
  const xml = fs.readFileSync(SITEMAP_PATH, "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return { xml, locs };
}

function extractJsonLdBlocks(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)]
    .map((m) => m[1]);
  return blocks.map((raw) => {
    try {
      return { raw, parsed: JSON.parse(raw), error: null };
    } catch (e) {
      return { raw, parsed: null, error: e.message };
    }
  });
}

function isIsoDate(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(str);
}

function validate() {
  const report = {
    sitemap: {},
    urlAudit: { nonHttps: [], queryParams: [], duplicates: [] },
    consistency: {
      publishedMissingHtml: [],
      htmlWithNoRecord: [],
      publishedMissingFromSitemap: [],
      sitemapUrlWithNoHtml: [],
      blockedOrDraftInSitemap: [],
    },
    structuredData: {
      articlesChecked: 0,
      invalidJson: [],
      missingArticleSchema: [],
      missingBreadcrumbSchema: [],
      faqSchemaMismatch: [],
      canonicalMismatch: [],
      ogUrlMismatch: [],
      mainEntityMismatch: [],
      breadcrumbUrlMismatch: [],
      dateOrderInvalid: [],
      invalidDates: [],
    },
  };

  // ---- Sitemap parse + URL rules ----
  const { locs } = parseSitemapUrls();
  report.sitemap.totalUrls = locs.length;
  locs.forEach((u) => {
    if (!u.startsWith(SITE_URL)) report.urlAudit.nonHttps.push(u);
    if (u.includes("?")) report.urlAudit.queryParams.push(u);
  });
  const seen = new Set();
  locs.forEach((u) => {
    if (seen.has(u)) report.urlAudit.duplicates.push(u);
    seen.add(u);
  });

  // ---- Sitemap vs filesystem vs records ----
  const index = loadArticleIndex();
  const published = index.filter((e) => e.status === "published");
  const nonPublished = index.filter((e) => e.status !== "published");

  published.forEach((entry) => {
    const htmlPath = path.join(BLOG_DIR, entry.slug + ".html");
    const record = loadArticleRecord(entry.slug);
    if (!record) {
      report.consistency.publishedMissingHtml.push(entry.slug + " (no data record)");
      return;
    }
    if (!fs.existsSync(htmlPath)) {
      report.consistency.publishedMissingHtml.push(entry.slug);
    }
    const canonical = record.canonicalUrl || (SITE_URL + "/blog/" + entry.slug + ".html");
    if (!locs.includes(canonical)) {
      report.consistency.publishedMissingFromSitemap.push(entry.slug);
    }
  });

  nonPublished.forEach((entry) => {
    const record = loadArticleRecord(entry.slug);
    const canonical = record && record.canonicalUrl
      ? record.canonicalUrl
      : SITE_URL + "/blog/" + entry.slug + ".html";
    if (locs.includes(canonical)) {
      report.consistency.blockedOrDraftInSitemap.push(entry.slug + " (" + entry.status + ")");
    }
  });

  // Sitemap article URLs that don't correspond to an actual HTML file
  locs
    .filter((u) => u.startsWith(SITE_URL + "/blog/") && u !== SITE_URL + "/blog.html")
    .forEach((u) => {
      const slug = u.replace(SITE_URL + "/blog/", "").replace(/\.html$/, "");
      const htmlPath = path.join(BLOG_DIR, slug + ".html");
      if (!fs.existsSync(htmlPath)) {
        report.consistency.sitemapUrlWithNoHtml.push(u);
      }
    });

  // HTML files that exist but have no matching article record at all
  // (orphan generated files with no data behind them)
  const allSlugsWithRecords = new Set(index.map((e) => e.slug));
  fs.readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".html") && f !== "_article-template.html")
    .forEach((f) => {
      const slug = f.replace(/\.html$/, "");
      if (!allSlugsWithRecords.has(slug)) {
        report.consistency.htmlWithNoRecord.push(slug);
      }
    });

  // ---- Structured data validation on published article HTML ----
  published.forEach((entry) => {
    const record = loadArticleRecord(entry.slug);
    if (!record) return;
    const htmlPath = path.join(BLOG_DIR, entry.slug + ".html");
    if (!fs.existsSync(htmlPath)) return;

    report.structuredData.articlesChecked++;
    const html = fs.readFileSync(htmlPath, "utf8");
    const blocks = extractJsonLdBlocks(html);

    blocks.forEach((b) => {
      if (b.error) {
        report.structuredData.invalidJson.push({ slug: entry.slug, error: b.error });
      }
    });

    const articleBlock = blocks.find((b) => b.parsed && b.parsed["@type"] === "Article");
    const breadcrumbBlock = blocks.find((b) => b.parsed && b.parsed["@type"] === "BreadcrumbList");
    const faqBlock = blocks.find((b) => b.parsed && b.parsed["@type"] === "FAQPage");

    const canonical = record.canonicalUrl || (SITE_URL + "/blog/" + entry.slug + ".html");
    const canonicalTagMatch = html.match(/<link rel="canonical" href="([^"]+)">/);
    const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)">/);

    if (canonicalTagMatch && canonicalTagMatch[1] !== canonical) {
      report.structuredData.canonicalMismatch.push(entry.slug);
    }
    if (ogUrlMatch && ogUrlMatch[1] !== canonical) {
      report.structuredData.ogUrlMismatch.push(entry.slug);
    }

    if (!articleBlock) {
      report.structuredData.missingArticleSchema.push(entry.slug);
    } else {
      const a = articleBlock.parsed;
      if (a.mainEntityOfPage !== canonical || a.url !== canonical) {
        report.structuredData.mainEntityMismatch.push(entry.slug);
      }
      if (!isIsoDate(a.datePublished) || !isIsoDate(a.dateModified)) {
        report.structuredData.invalidDates.push(entry.slug);
      } else if (a.datePublished > a.dateModified) {
        report.structuredData.dateOrderInvalid.push(entry.slug);
      }
    }

    if (!breadcrumbBlock) {
      report.structuredData.missingBreadcrumbSchema.push(entry.slug);
    } else {
      const items = breadcrumbBlock.parsed.itemListElement || [];
      const last = items[items.length - 1];
      if (!last || last.item !== canonical) {
        report.structuredData.breadcrumbUrlMismatch.push(entry.slug);
      }
    }

    // FAQ schema should exist iff article has genuinely eligible FAQ content
    const faqOk =
      record.faq &&
      record.faq.length >= 2 &&
      record.faq.every((q) => q && q.question && q.answer);
    const schemaHasFaq =
      Array.isArray(record.schemaType) && record.schemaType.indexOf("FAQPage") !== -1;
    if (faqOk !== Boolean(faqBlock) || faqOk !== schemaHasFaq) {
      report.structuredData.faqSchemaMismatch.push(entry.slug);
    }
  });

  return report;
}

function printReport(report) {
  console.log("=== Scale To Sky — Technical SEO Validation Report ===\n");

  console.log("--- SITEMAP ---");
  console.log("Total URLs:", report.sitemap.totalUrls);
  console.log(
    report.urlAudit.nonHttps.length
      ? "❌ Non-HTTPS / wrong-domain URLs: " + JSON.stringify(report.urlAudit.nonHttps)
      : "✅ All sitemap URLs are absolute HTTPS on scaletosky.com."
  );
  console.log(
    report.urlAudit.queryParams.length
      ? "❌ URLs with query params: " + JSON.stringify(report.urlAudit.queryParams)
      : "✅ No sitemap URLs contain query parameters."
  );
  console.log(
    report.urlAudit.duplicates.length
      ? "❌ Duplicate URLs: " + JSON.stringify(report.urlAudit.duplicates)
      : "✅ No duplicate URLs in sitemap."
  );

  console.log("\n--- SITEMAP / FILESYSTEM / RECORD CONSISTENCY ---");
  console.log(
    report.consistency.publishedMissingHtml.length
      ? "❌ Published records missing HTML file: " + report.consistency.publishedMissingHtml.join(", ")
      : "✅ Every published record has a corresponding HTML file."
  );
  console.log(
    report.consistency.htmlWithNoRecord.length
      ? "❌ HTML files with no matching article record: " + report.consistency.htmlWithNoRecord.join(", ")
      : "✅ No orphan HTML files without a matching article record."
  );
  console.log(
    report.consistency.publishedMissingFromSitemap.length
      ? "❌ Published articles missing from sitemap: " + report.consistency.publishedMissingFromSitemap.join(", ")
      : "✅ Every published article is present in the sitemap."
  );
  console.log(
    report.consistency.sitemapUrlWithNoHtml.length
      ? "❌ Sitemap URLs with no matching HTML file: " + report.consistency.sitemapUrlWithNoHtml.join(", ")
      : "✅ Every sitemap blog URL has a matching HTML file."
  );
  console.log(
    report.consistency.blockedOrDraftInSitemap.length
      ? "❌ Blocked/draft articles present in sitemap: " + report.consistency.blockedOrDraftInSitemap.join(", ")
      : "✅ No blocked or draft articles are present in the sitemap."
  );

  console.log("\n--- STRUCTURED DATA (published articles) ---");
  console.log("Articles checked:", report.structuredData.articlesChecked);
  console.log(
    report.structuredData.invalidJson.length
      ? "❌ Invalid JSON-LD: " + JSON.stringify(report.structuredData.invalidJson)
      : "✅ All JSON-LD blocks parse as valid JSON."
  );
  console.log(
    report.structuredData.missingArticleSchema.length
      ? "❌ Missing Article schema: " + report.structuredData.missingArticleSchema.join(", ")
      : "✅ Every published article has Article schema."
  );
  console.log(
    report.structuredData.missingBreadcrumbSchema.length
      ? "❌ Missing BreadcrumbList schema: " + report.structuredData.missingBreadcrumbSchema.join(", ")
      : "✅ Every published article has BreadcrumbList schema."
  );
  console.log(
    report.structuredData.faqSchemaMismatch.length
      ? "❌ FAQ visible/schema mismatch: " + report.structuredData.faqSchemaMismatch.join(", ")
      : "✅ FAQPage schema present exactly where visible FAQ content is eligible."
  );
  console.log(
    report.structuredData.canonicalMismatch.length
      ? "❌ Canonical tag ≠ record canonicalUrl: " + report.structuredData.canonicalMismatch.join(", ")
      : "✅ Canonical tags match article records."
  );
  console.log(
    report.structuredData.ogUrlMismatch.length
      ? "❌ og:url ≠ canonical: " + report.structuredData.ogUrlMismatch.join(", ")
      : "✅ og:url matches canonical on every article."
  );
  console.log(
    report.structuredData.mainEntityMismatch.length
      ? "❌ Article schema url/mainEntityOfPage ≠ canonical: " + report.structuredData.mainEntityMismatch.join(", ")
      : "✅ Article schema url/mainEntityOfPage match canonical on every article."
  );
  console.log(
    report.structuredData.breadcrumbUrlMismatch.length
      ? "❌ BreadcrumbList final item ≠ canonical: " + report.structuredData.breadcrumbUrlMismatch.join(", ")
      : "✅ BreadcrumbList final item matches canonical on every article."
  );
  console.log(
    report.structuredData.invalidDates.length
      ? "❌ Invalid/non-ISO dates in Article schema: " + report.structuredData.invalidDates.join(", ")
      : "✅ All Article schema dates are valid ISO 8601."
  );
  console.log(
    report.structuredData.dateOrderInvalid.length
      ? "❌ datePublished > dateModified: " + report.structuredData.dateOrderInvalid.join(", ")
      : "✅ datePublished <= dateModified on every article."
  );

  console.log("\n=== End of report ===");
}

if (require.main === module) {
  const report = validate();
  printReport(report);
  const hardFailures =
    report.urlAudit.nonHttps.length ||
    report.urlAudit.queryParams.length ||
    report.urlAudit.duplicates.length ||
    report.consistency.publishedMissingHtml.length ||
    report.consistency.publishedMissingFromSitemap.length ||
    report.consistency.sitemapUrlWithNoHtml.length ||
    report.consistency.blockedOrDraftInSitemap.length ||
    report.structuredData.invalidJson.length ||
    report.structuredData.missingArticleSchema.length ||
    report.structuredData.missingBreadcrumbSchema.length ||
    report.structuredData.faqSchemaMismatch.length ||
    report.structuredData.canonicalMismatch.length ||
    report.structuredData.ogUrlMismatch.length ||
    report.structuredData.mainEntityMismatch.length ||
    report.structuredData.breadcrumbUrlMismatch.length ||
    report.structuredData.invalidDates.length ||
    report.structuredData.dateOrderInvalid.length;
  process.exit(hardFailures ? 1 : 0);
}

module.exports = { validate };
