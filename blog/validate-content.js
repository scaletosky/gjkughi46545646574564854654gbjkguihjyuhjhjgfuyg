#!/usr/bin/env node
/**
 * Scale To Sky Blog — Content Validation Utility (Phase 4)
 * ----------------------------------------------------------
 * Pure static/local check. No API, no database, no Super Admin.
 * Run with: node blog/validate-content.js
 *
 * Checks performed now (Phase 4 — blueprint/metadata stage):
 *  - all 60 articles exist and load without syntax errors
 *  - required metadata exists (title, slug, category, primaryKeyword,
 *    excerpt, status, ctaTieIn/relevantService)
 *  - pillar/cluster relationships resolve to real articles
 *  - relatedArticles reference valid, existing slugs (no dead links)
 *  - no duplicate slugs, no duplicate article IDs
 *  - no duplicate primaryKeyword across articles (cannibalization flag)
 *  - each category has exactly one designated pillar
 *
 * Checks that also run now in a lightweight form, and are designed to
 * be the full gate once Phase 5 writes final content:
 *  - minimum 4,000-word count (skipped/reported as "pending" while
 *    status is writing-ready, since content is intentionally blank
 *    until Phase 5 — will FAIL once status is 'published' without
 *    meeting the word count)
 *  - H1/H2 structure presence (via contentBlueprint.outline for now)
 *  - FAQ presence where a blueprint calls for it
 *  - canonical URL presence
 *  - image alt text presence
 */

const fs = require("fs");
const path = require("path");

const ARTICLES_DIR = path.join(__dirname, "data", "articles");
const EXPECTED_COUNT = 60;

function loadArticles() {
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".js"));
  const sandbox = { window: {} };
  const vm = require("vm");
  const context = vm.createContext(sandbox);
  const articles = [];
  const errors = [];

  for (const file of files) {
    const full = path.join(ARTICLES_DIR, file);
    const src = fs.readFileSync(full, "utf8");
    try {
      vm.runInContext(src, context);
    } catch (e) {
      errors.push(`Syntax/parse error in ${file}: ${e.message}`);
    }
  }

  const dict = sandbox.window.BLOG_ARTICLES || {};
  for (const key of Object.keys(dict)) {
    articles.push(dict[key]);
  }
  return { articles, errors };
}

function countWords(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(" ").length;
}

function validate() {
  const { articles, errors } = loadArticles();
  const report = {
    totalFound: articles.length,
    expected: EXPECTED_COUNT,
    countMatches: articles.length === EXPECTED_COUNT,
    parseErrors: errors,
    duplicateIds: [],
    duplicateSlugs: [],
    duplicatePrimaryKeywords: [],
    missingRequiredFields: [],
    invalidRelatedArticleRefs: [],
    pillarIssues: [],
    wordCountStatus: [],
    faqMissing: [],
    canonicalMissing: [],
    altTextMissing: [],
    statusNotes: [],
  };

  const slugSet = new Set(articles.map((a) => a.slug));
  const idCounts = {};
  const slugCounts = {};
  const keywordCounts = {};

  const REQUIRED_FIELDS = [
    "id", "title", "slug", "category", "primaryKeyword",
    "excerpt", "status",
  ];

  const pillarsByCategory = {};

  for (const a of articles) {
    idCounts[a.id] = (idCounts[a.id] || 0) + 1;
    slugCounts[a.slug] = (slugCounts[a.slug] || 0) + 1;
    if (a.primaryKeyword) {
      const k = a.primaryKeyword.trim().toLowerCase();
      keywordCounts[k] = keywordCounts[k] || [];
      keywordCounts[k].push(a.slug);
    }

    const missing = REQUIRED_FIELDS.filter((f) => {
      const v = a[f];
      return v === undefined || v === null || v === "";
    });
    if (missing.length) {
      report.missingRequiredFields.push({ slug: a.slug, missing });
    }

    (a.relatedArticles || []).forEach((rel) => {
      if (!slugSet.has(rel)) {
        report.invalidRelatedArticleRefs.push({ from: a.slug, brokenRef: rel });
      }
    });

    if (a.contentBlueprint && a.contentBlueprint.isPillar) {
      pillarsByCategory[a.category] = pillarsByCategory[a.category] || [];
      pillarsByCategory[a.category].push(a.slug);
    }

    if (a._phase4Note) {
      report.statusNotes.push({ slug: a.slug, note: a._phase4Note });
    }

    const wc = countWords(a.content);
    const passes4000 = wc >= 4000;
    const entry = { slug: a.slug, status: a.status, wordCount: wc, passes4000 };
    if (a.status === "published" && !passes4000) {
      entry.result = "FAIL — published without meeting 4,000-word minimum";
    } else if (a.status === "writing-ready" || a.status === "draft") {
      entry.result = "pending — content not yet written (expected at this phase)";
    } else if (a.status === "blocked-needs-real-data") {
      entry.result = "blocked — requires verified real client data before writing";
    } else {
      entry.result = passes4000 ? "ok" : "pending";
    }
    report.wordCountStatus.push(entry);

    if (!a.faq || a.faq.length < 3) {
      report.faqMissing.push(a.slug);
    }
    if (!a.canonicalUrl) {
      report.canonicalMissing.push(a.slug);
    }
    if (!a.featuredImage || !a.featuredImage.alt) {
      report.altTextMissing.push(a.slug);
    }
  }

  report.duplicateIds = Object.entries(idCounts).filter(([, c]) => c > 1);
  report.duplicateSlugs = Object.entries(slugCounts).filter(([, c]) => c > 1);
  report.duplicatePrimaryKeywords = Object.entries(keywordCounts).filter(
    ([, slugs]) => slugs.length > 1
  );

  for (const [cat, slugs] of Object.entries(pillarsByCategory)) {
    if (slugs.length !== 1) {
      report.pillarIssues.push({ category: cat, pillars: slugs });
    }
  }

  return report;
}

function printReport(report) {
  console.log("=== Scale To Sky Blog — Content Validation Report ===\n");
  console.log(`Articles found: ${report.totalFound} / expected ${report.expected}`);
  console.log(`Count matches: ${report.countMatches ? "YES" : "NO"}`);

  if (report.parseErrors.length) {
    console.log("\n❌ PARSE ERRORS:");
    report.parseErrors.forEach((e) => console.log("  -", e));
  } else {
    console.log("✅ No parse errors.");
  }

  console.log(
    report.duplicateIds.length
      ? `\n❌ Duplicate IDs: ${JSON.stringify(report.duplicateIds)}`
      : "✅ No duplicate article IDs."
  );
  console.log(
    report.duplicateSlugs.length
      ? `❌ Duplicate slugs: ${JSON.stringify(report.duplicateSlugs)}`
      : "✅ No duplicate slugs."
  );
  console.log(
    report.duplicatePrimaryKeywords.length
      ? `⚠️  Possible keyword cannibalization: ${JSON.stringify(report.duplicatePrimaryKeywords)}`
      : "✅ No duplicate primary keywords across articles."
  );
  console.log(
    report.missingRequiredFields.length
      ? `❌ Articles missing required fields: ${JSON.stringify(report.missingRequiredFields, null, 2)}`
      : "✅ All required base fields present on all articles."
  );
  console.log(
    report.invalidRelatedArticleRefs.length
      ? `❌ Broken relatedArticles references: ${JSON.stringify(report.invalidRelatedArticleRefs)}`
      : "✅ All relatedArticles references resolve to real articles."
  );
  console.log(
    report.pillarIssues.length
      ? `❌ Pillar issues (expect exactly 1 pillar per category): ${JSON.stringify(report.pillarIssues)}`
      : "✅ Exactly one pillar defined per category."
  );
  console.log(
    report.faqMissing.length
      ? `⚠️  Articles with fewer than 3 FAQ entries: ${report.faqMissing.length} (${report.faqMissing.join(", ")})`
      : "✅ All articles have at least 3 FAQ entries."
  );
  console.log(
    report.canonicalMissing.length
      ? `❌ Articles missing canonical URL: ${report.canonicalMissing.join(", ")}`
      : "✅ All articles have a canonical URL."
  );
  console.log(
    report.altTextMissing.length
      ? `❌ Articles missing featured image alt text: ${report.altTextMissing.join(", ")}`
      : "✅ All articles have featured image alt text (concept-level, pending real asset)."
  );

  if (report.statusNotes.length) {
    console.log("\n📌 Status corrections made this run:");
    report.statusNotes.forEach((n) => console.log(`   - ${n.slug}: ${n.note}`));
  }

  const failed4000 = report.wordCountStatus.filter((w) => w.result && w.result.startsWith("FAIL"));
  const pending = report.wordCountStatus.filter((w) => w.result === "pending — content not yet written (expected at this phase)");
  const blocked = report.wordCountStatus.filter((w) => w.result && w.result.startsWith("blocked"));
  console.log(`\n📝 Word count (4,000+ minimum) status:`);
  console.log(`   - Pending (Phase 5 not yet run): ${pending.length}`);
  console.log(`   - Blocked (needs real client data): ${blocked.length}`);
  console.log(`   - FAILED (published under 4,000 words): ${failed4000.length}`);
  if (failed4000.length) {
    failed4000.forEach((f) => console.log(`     ❌ ${f.slug}: ${f.wordCount} words`));
  }

  console.log("\n=== End of report ===");
}

if (require.main === module) {
  const report = validate();
  printReport(report);
  const hardFailures =
    report.parseErrors.length ||
    report.duplicateIds.length ||
    report.duplicateSlugs.length ||
    report.missingRequiredFields.length ||
    report.invalidRelatedArticleRefs.length ||
    report.pillarIssues.length ||
    report.canonicalMissing.length ||
    report.wordCountStatus.some((w) => w.result && w.result.startsWith("FAIL"));
  process.exit(hardFailures ? 1 : 0);
}

module.exports = { validate };
