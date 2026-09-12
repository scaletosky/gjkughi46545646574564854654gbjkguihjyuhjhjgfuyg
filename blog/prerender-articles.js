#!/usr/bin/env node
/* ============================================================
   BLOG STATIC PRE-RENDER
   ------------------------------------------------------------
   Problem: each published article's static HTML file only ever
   shipped a "Loading article…" placeholder inside
   #blog-article-root — the real title/body/FAQ was rendered
   entirely client-side by blog.js's renderArticle(). Any crawler
   or fetcher that doesn't execute JS (and even Google, some of
   the time) saw an empty article.

   Fix: run the exact same renderArticle() function used in the
   browser, here in Node, against the real article data, and
   bake the resulting HTML into the static file's
   #blog-article-root div. blog.js still loads and re-renders on
   the client afterwards (same innerHTML replace, so no
   duplication) — this only adds a server-rendered first paint
   that crawlers and non-JS fetchers can actually read.

   Usage: node prerender-articles.js
   ============================================================ */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const ARTICLES_DIR = path.join(ROOT_DIR, "data", "articles");
const INDEX_PATH = path.join(ROOT_DIR, "data", "index.js");
const CATEGORIES_PATH = path.join(ROOT_DIR, "data", "categories.js");
const BLOG_JS_PATH = path.join(ROOT_DIR, "js", "blog.js");

function loadDataFile(filePath, fakeWindow) {
  const src = fs.readFileSync(filePath, "utf8");
  // Same sandboxing pattern already used by validate-seo.js — these
  // data files only ever assign onto `window`, nothing else.
  new Function("window", src)(fakeWindow);
}

function buildSandboxWindow() {
  const fakeWindow = {
    location: { href: "" },
    BLOG_ARTICLES: {},
    BLOG_INDEX: [],
    BLOG_CATEGORIES: [],
  };

  // Load index + categories first (renderArticle/getPrevNext/
  // pickRelatedArticles read these).
  loadDataFile(INDEX_PATH, fakeWindow);
  loadDataFile(CATEGORIES_PATH, fakeWindow);

  // Load every individual article record into window.BLOG_ARTICLES.
  fs.readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".js"))
    .forEach((f) => loadDataFile(path.join(ARTICLES_DIR, f), fakeWindow));

  // Load blog.js itself into the same sandbox so window.BlogRender
  // becomes available. blog.js's renderArticle()/helpers are pure
  // string builders reading only window.BLOG_*, no DOM calls, so
  // this runs fine outside a browser.
  const blogJsSrc = fs.readFileSync(BLOG_JS_PATH, "utf8");
  new Function("window", blogJsSrc)(fakeWindow);

  return fakeWindow;
}

function prerenderAll() {
  const fakeWindow = buildSandboxWindow();
  const render = fakeWindow.BlogRender && fakeWindow.BlogRender.renderArticle;
  if (!render) {
    throw new Error("window.BlogRender.renderArticle not found — check blog.js exports.");
  }

  const published = fakeWindow.BLOG_INDEX.filter((e) => e.status === "published");
  const results = { rendered: [], skipped: [], errors: [] };

  published.forEach((entry) => {
    const slug = entry.slug;
    const htmlPath = path.join(ROOT_DIR, slug + ".html");
    if (!fs.existsSync(htmlPath)) {
      results.skipped.push(slug + " (no HTML file)");
      return;
    }

    try {
      // renderArticle() unconditionally calls enhanceArticlePage()
      // afterwards, which wires up real browser interactivity (event
      // listeners, IntersectionObserver, document.createElement for
      // the progress bar). That's fine — it re-runs for real in the
      // browser once blog.js loads there — but it needs a DOM this
      // Node sandbox doesn't have. Every one of its DOM touches is
      // guarded behind a `containerEl.querySelector(...)` truthy
      // check, so stubbing querySelector/querySelectorAll to report
      // "nothing found" makes it a safe no-op here.
      const container = {
        innerHTML: "",
        querySelector: () => null,
        querySelectorAll: () => [],
      };
      render(container, slug);
      const renderedHtml = container.innerHTML;

      if (!renderedHtml || renderedHtml.indexOf("blog-article-title") === -1) {
        results.errors.push(slug + " (render produced no article title — skipped write)");
        return;
      }

      const html = fs.readFileSync(htmlPath, "utf8");
      const rootDivRe = /<div id="blog-article-root">[\s\S]*?<\/div>\s*(?=<\/article>)/;
      if (!rootDivRe.test(html)) {
        results.errors.push(slug + " (#blog-article-root wrapper not found in HTML)");
        return;
      }
      const newHtml = html.replace(
        rootDivRe,
        '<div id="blog-article-root">' + renderedHtml + "</div>\n    "
      );
      fs.writeFileSync(htmlPath, newHtml, "utf8");
      results.rendered.push(slug);
    } catch (e) {
      results.errors.push(slug + " (" + e.message + ")");
    }
  });

  return results;
}

if (require.main === module) {
  const results = prerenderAll();
  console.log("=== Blog Article Pre-render Report ===\n");
  console.log("Rendered:", results.rendered.length);
  console.log("Skipped:", results.skipped.length, results.skipped.length ? JSON.stringify(results.skipped) : "");
  console.log("Errors:", results.errors.length, results.errors.length ? JSON.stringify(results.errors, null, 2) : "");
  process.exit(results.errors.length ? 1 : 0);
}

module.exports = { prerenderAll };
