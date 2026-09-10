/* ============================================================
   BLOG — SHARED LOADER / RENDER HELPERS
   Static, file-based, zero dependency on Super Admin, MongoDB,
   or any backend API. Reads from window.BLOG_ARTICLES and
   window.BLOG_CATEGORIES, both populated by plain <script> tags
   loaded before this file (see blog.html / article pages).

   Phase 1: article page render only.
   Phase 2: adds the full data-driven listing engine — featured
   article, category filtering, search, empty states — used by
   blog.html.
   Phase 3 (this revision): the full individual article template —
   breadcrumbs, article header, featured image, sticky TOC sidebar,
   long-form content typography, callouts/tables/images, inline
   CTA, FAQ, related articles, prev/next nav, share controls, and
   a reading-progress bar. Still zero dependency on any backend —
   everything below reads only window.BLOG_ARTICLES/BLOG_INDEX/
   BLOG_CATEGORIES.
   ============================================================ */

(function () {
  "use strict";

  function getAllArticles() {
    var map = window.BLOG_ARTICLES || {};
    return Object.keys(map).map(function (slug) { return map[slug]; });
  }

  function getArticleBySlug(slug) {
    return (window.BLOG_ARTICLES || {})[slug] || null;
  }

  function getCategoryBySlug(slug) {
    var cats = window.BLOG_CATEGORIES || [];
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].slug === slug) return cats[i];
    }
    return null;
  }

  function getPublishedArticles() {
    // Only articles explicitly marked "published" are ever exposed
    // publicly — status is a content-organization field only, with
    // no connection to any admin/publishing system.
    return getAllArticles().filter(function (a) { return a.status === "published"; });
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  }

  function computeReadingTime(article) {
    if (article.readingTime) return article.readingTime;
    var text = (article.content || "").replace(/<[^>]+>/g, " ");
    var words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    return words ? Math.max(1, Math.round(words / 220)) : null;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Blog category -> most relevant service page, used only for the
  // optional inline CTA (article template, spec section 12/13).
  // Falls back to the general Web Development page when a category
  // has no obvious single service match.
  var CATEGORY_SERVICE_MAP = {
    "social-media-marketing": "/social-media-management.html",
    "seo": "/web-development.html",
    "paid-advertising": "/meta-ads.html",
    "app-development": "/app-development.html",
    "website-development": "/web-development.html",
    "software-development": "/web-development.html",
    "video-editing": "/video-shoot-editing.html",
    "video-shooting": "/video-shoot-editing.html",
    "ugc": "/ugc-videos.html",
    "business-growth": "/services.html"
  };

  function slugifyHeading(text, seen) {
    var base = String(text || "")
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
    var slug = base;
    var i = 2;
    while (seen[slug]) {
      slug = base + "-" + i;
      i++;
    }
    seen[slug] = true;
    return slug;
  }

  // Walks the article's content HTML string, assigns an id="" to
  // every H2/H3 that doesn't already have one, and builds a TOC
  // entry list (H2s as top-level entries, immediately-following H3s
  // nested under the last H2). Returns { html, toc } — html is the
  // content with ids injected, safe to insert as-is since it's the
  // same trusted article HTML, just with attributes added.
  function buildTocAndIds(contentHtml) {
    var seen = {};
    var toc = [];
    var lastH2 = null;

    var html = String(contentHtml || "").replace(
      /<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi,
      function (match, tag, attrs, inner) {
        var hasId = /\sid=/i.test(attrs);
        var id = hasId ? (attrs.match(/\sid=["']([^"']+)["']/i) || [])[1] : null;
        var plainText = inner.replace(/<[^>]+>/g, "").trim();
        if (!plainText) return match; // skip empty/decorative headings

        if (!id) {
          id = slugifyHeading(plainText, seen);
          attrs = attrs + ' id="' + id + '"';
        } else {
          seen[id] = true;
        }

        if (tag.toLowerCase() === "h2") {
          var entry = { id: id, text: plainText, children: [] };
          toc.push(entry);
          lastH2 = entry;
        } else if (tag.toLowerCase() === "h3" && lastH2) {
          lastH2.children.push({ id: id, text: plainText });
        }

        return "<" + tag + attrs + ">" + inner + "</" + tag + ">";
      }
    );

    return { html: html, toc: toc };
  }

  // Wraps every raw <table> in the article HTML with a scroll
  // container so wide comparison tables never cause page-level
  // horizontal overflow on mobile (spec Part 18). Some article
  // content already includes a hand-wrapped .blog-table-wrap div
  // around its table(s) from an earlier phase — this only adds the
  // wrapper where one isn't already present immediately before the
  // <table>, so nothing is ever double-wrapped. Purely structural —
  // does not touch table content, headers, or attributes.
  function wrapTables(contentHtml) {
    var html = String(contentHtml || "");
    var out = "";
    var lastIndex = 0;
    var re = /<table([^>]*)>([\s\S]*?)<\/table>/gi;
    var match;
    while ((match = re.exec(html)) !== null) {
      var precedingChunk = html.slice(Math.max(0, match.index - 40), match.index);
      var alreadyWrapped = /class=["'][^"']*blog-table-wrap[^"']*["']>\s*$/.test(precedingChunk);
      out += html.slice(lastIndex, match.index);
      if (alreadyWrapped) {
        out += match[0];
      } else {
        out += '<div class="blog-table-wrap"><table' + match[1] + '>' + match[2] + '</table></div>';
      }
      lastIndex = re.lastIndex;
    }
    out += html.slice(lastIndex);
    return out;
  }

  // Marks the article's opening paragraph as the visual "lead" so the
  // introduction reads with slightly larger, lighter-weight type
  // before the body settles into normal paragraph size (spec Part 15).
  // Purely a class addition on the existing first <p> — no text is
  // added, removed, or reworded.
  function markLeadParagraph(contentHtml) {
    var applied = false;
    return String(contentHtml || "").replace(/<p(\s[^>]*)?>/i, function (match, attrs) {
      if (applied) return match;
      applied = true;
      attrs = attrs || "";
      if (/\sclass=/.test(attrs)) {
        return match.replace(/\sclass=(["'])([^"']*)\1/i, function (m2, q, cls) {
          return ' class=' + q + cls + ' blog-lead' + q;
        });
      }
      return "<p" + attrs + ' class="blog-lead">';
    });
  }

  function tocHtml(toc) {
    if (!toc.length) return "";
    return toc.map(function (entry) {
      var sub = entry.children.length
        ? '<div class="blog-toc-sub-list">' + entry.children.map(function (c) {
            return '<a href="#' + c.id + '" class="blog-toc-sub">' + escapeHtml(c.text) + '</a>';
          }).join("") + '</div>'
        : '';
      return '<a href="#' + entry.id + '">' + escapeHtml(entry.text) + '</a>' + sub;
    }).join("");
  }

  // Related articles: prefer manually curated a.relatedArticles
  // (array of slugs), falling back to other published articles in
  // the same category. Never includes the current article. Only
  // links to valid, published static article pages.
  function pickRelatedArticles(article, max) {
    max = max || 3;
    var published = getPublishedArticles();
    var bySlug = {};
    published.forEach(function (a) { bySlug[a.slug] = a; });

    var picked = [];
    (article.relatedArticles || []).forEach(function (slug) {
      if (slug === article.slug) return;
      var a = bySlug[slug];
      if (a && picked.indexOf(a) === -1) picked.push(a);
    });

    if (picked.length < max) {
      published
        .filter(function (a) {
          return a.slug !== article.slug &&
            a.category === article.category &&
            picked.indexOf(a) === -1;
        })
        .forEach(function (a) {
          if (picked.length < max) picked.push(a);
        });
    }

    return picked.slice(0, max);
  }

  // Prev/next: derived from BLOG_INDEX's existing order, filtered to
  // published articles only, so it stays a "reliable ordering" per
  // the spec without inventing a new sequencing concept.
  function getPrevNext(article) {
    var index = window.BLOG_INDEX || [];
    var publishedSlugs = getPublishedArticles().map(function (a) { return a.slug; });
    var ordered = index
      .map(function (e) { return e.slug; })
      .filter(function (slug) { return publishedSlugs.indexOf(slug) !== -1; });

    var pos = ordered.indexOf(article.slug);
    if (pos === -1) return { prev: null, next: null };

    var prevSlug = pos > 0 ? ordered[pos - 1] : null;
    var nextSlug = pos < ordered.length - 1 ? ordered[pos + 1] : null;
    return {
      prev: prevSlug ? getArticleBySlug(prevSlug) : null,
      next: nextSlug ? getArticleBySlug(nextSlug) : null
    };
  }

  // Pick a featured article: explicit featured:true first (most
  // recently published), otherwise gracefully fall back to the
  // most recently published article so the section is never empty.
  function pickFeaturedArticle(published) {
    if (!published.length) return null;
    var byDateDesc = published.slice().sort(function (a, b) {
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    });
    var explicit = byDateDesc.filter(function (a) { return a.featured; });
    return explicit[0] || byDateDesc[0];
  }

  function articleCardHtml(a) {
    var cat = getCategoryBySlug(a.category);
    var catName = cat ? cat.name : a.category;
    var readTime = computeReadingTime(a);
    var img = a.featuredImage && a.featuredImage.src;

    return (
      '<article class="blog-card" data-category="' + escapeHtml(a.category) + '">' +
      '<a class="blog-card-link" href="/blog/' + a.slug + '.html">' +
      (img
        ? '<span class="blog-card-media"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml((a.featuredImage && a.featuredImage.alt) || a.title) + '" loading="lazy" width="400" height="240"></span>'
        : '<span class="blog-card-media blog-card-media--empty" aria-hidden="true"></span>') +
      '<span class="blog-card-body">' +
      '<span class="blog-card-category">' + escapeHtml(catName) + '</span>' +
      '<span class="blog-card-title">' + escapeHtml(a.title) + '</span>' +
      (a.excerpt ? '<span class="blog-card-excerpt">' + escapeHtml(a.excerpt) + '</span>' : '') +
      '<span class="blog-card-meta">' +
      (a.publishedAt ? '<span>' + formatDate(a.publishedAt) + '</span>' : '') +
      (readTime ? '<span>' + readTime + ' min read</span>' : '') +
      '</span>' +
      '</span>' +
      '</a>' +
      '</article>'
    );
  }

  function featuredCardHtml(a) {
    var cat = getCategoryBySlug(a.category);
    var catName = cat ? cat.name : a.category;
    var readTime = computeReadingTime(a);
    var img = a.featuredImage && a.featuredImage.src;

    return (
      '<a class="blog-featured-card" href="/blog/' + a.slug + '.html">' +
      (img
        ? '<span class="blog-featured-media"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml((a.featuredImage && a.featuredImage.alt) || a.title) + '" loading="lazy" width="640" height="380"></span>'
        : '<span class="blog-featured-media blog-featured-media--empty" aria-hidden="true"></span>') +
      '<span class="blog-featured-body">' +
      '<span class="blog-featured-category">' + escapeHtml(catName) + '</span>' +
      '<span class="blog-featured-title">' + escapeHtml(a.title) + '</span>' +
      (a.excerpt ? '<span class="blog-featured-excerpt">' + escapeHtml(a.excerpt) + '</span>' : '') +
      '<span class="blog-featured-meta">' +
      (a.publishedAt ? '<span>' + formatDate(a.publishedAt) + '</span>' : '') +
      (readTime ? '<span>' + readTime + ' min read</span>' : '') +
      '</span>' +
      '<span class="blog-featured-cta">Read Article <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '</span>' +
      '</a>'
    );
  }

  function notFoundHtml() {
    return (
      '<div class="blog-article-notfound">' +
      '<h1>Article not found</h1>' +
      '<p>Looks like this article isn\u2019t available.</p>' +
      '<a href="/blog.html" class="btn btn-primary">Back to Blog</a>' +
      '</div>'
    );
  }

  function renderArticle(containerEl, slug) {
    if (!containerEl) return;
    var a = getArticleBySlug(slug);

    if (!a || a.status !== "published") {
      containerEl.innerHTML = notFoundHtml();
      return;
    }

    var cat = getCategoryBySlug(a.category);
    var catName = cat ? cat.name : a.category;
    var readTime = computeReadingTime(a);
    var img = a.featuredImage && a.featuredImage.src;
    var canonicalUrl = a.canonicalUrl || (typeof window !== "undefined" ? window.location.href : "");

    var built = buildTocAndIds(a.content);
    var toc = built.toc;

    // ---- Breadcrumbs ----
    var breadcrumbs =
      '<nav class="blog-breadcrumbs" aria-label="Breadcrumb">' +
      '<a href="/index.html">Home</a> &rsaquo; ' +
      '<a href="/blog.html">Blog</a>' +
      (cat ? ' &rsaquo; <a href="/blog.html#' + escapeHtml(cat.slug) + '">' + escapeHtml(catName) + '</a>' : '') +
      ' &rsaquo; <span aria-current="page">' + escapeHtml(a.title) + '</span>' +
      '</nav>';

    // ---- Article header ----
    var header =
      '<span class="blog-article-category">' + escapeHtml(catName) + '</span>' +
      '<h1 class="blog-article-title">' + escapeHtml(a.title) + '</h1>' +
      (a.excerpt ? '<p class="blog-article-excerpt">' + escapeHtml(a.excerpt) + '</p>' : '') +
      '<p class="blog-article-meta">' +
      '<span>By ' + escapeHtml((a.author && a.author.name) || "Scale To Sky Team") + '</span>' +
      (a.publishedAt ? '<span class="dot">&middot;</span><span>Published ' + formatDate(a.publishedAt) + '</span>' : '') +
      (a.updatedAt && a.publishedAt && a.updatedAt !== a.publishedAt
        ? '<span class="dot">&middot;</span><span class="updated">Updated ' + formatDate(a.updatedAt) + '</span>'
        : '') +
      (readTime ? '<span class="dot">&middot;</span><span>' + readTime + ' min read</span>' : '') +
      '</p>';

    // ---- Featured image ----
    var featuredImage = img
      ? '<div class="blog-article-hero-media"><img src="' + escapeHtml(img) + '" alt="' +
        escapeHtml((a.featuredImage && a.featuredImage.alt) || a.title) +
        '" width="1200" height="675" fetchpriority="high"></div>'
      : '';

    // ---- TOC (sidebar on desktop, collapsible card on mobile) ----
    var tocBlock = toc.length
      ? '<div class="blog-toc" id="blog-toc">' +
        '<button type="button" class="blog-toc-mobile-toggle" aria-expanded="false" aria-controls="blog-toc-list">' +
        'On this page' +
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<span class="blog-toc-label">On this page</span>' +
        '<nav class="blog-toc-list" id="blog-toc-list" aria-label="Table of contents">' +
        '<div class="blog-toc-list-inner">' + tocHtml(toc) + '</div>' +
        '</nav>' +
        '</div>'
      : '';

    // ---- Inline CTA (auto-inserted after the middle H2, content-driven) ----
    var serviceHref = CATEGORY_SERVICE_MAP[a.category] || "/services.html";
    var inlineCtaHtml =
      '<div class="blog-inline-cta">' +
      '<div class="blog-inline-cta-text">' +
      '<h3>Need help putting this into practice?</h3>' +
      '<p>Scale To Sky helps businesses turn digital strategy into websites, content, advertising, and growth systems.</p>' +
      '</div>' +
      '<a href="/contact.html" class="btn btn-primary" data-cta-id="blog-inline-cta-' + escapeHtml(a.slug) + '">Talk to Scale To Sky ' +
      '<svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
      '</div>';

    var contentHtml = built.html || "<p><em>Content coming soon.</em></p>";
    contentHtml = wrapTables(contentHtml);
    contentHtml = markLeadParagraph(contentHtml);
    // Insert the inline CTA right after the middle H2 section, if the
    // article has at least 2 H2s — keeps it out of very short content
    // and avoids it always sitting in the same spot relative to length.
    if (toc.length >= 2) {
      var midIndex = Math.floor(toc.length / 2);
      var midId = toc[midIndex].id;
      var marker = new RegExp('(<h2[^>]*\\sid="' + midId + '"[^>]*>[\\s\\S]*?</h2>)');
      if (marker.test(contentHtml)) {
        contentHtml = contentHtml.replace(marker, "$1" + inlineCtaHtml);
      }
    }

    // ---- FAQ ----
    var faqHtml = "";
    if (a.faq && a.faq.length) {
      faqHtml =
        '<section class="blog-article-faq">' +
        '<span class="kicker">FAQs</span>' +
        '<h2>Frequently Asked Questions</h2>' +
        '<div class="faq-list" data-stagger-group>' +
        a.faq.map(function (item, i) {
          var qid = "blog-faq-q-" + a.slug + "-" + i;
          var aid = "blog-faq-a-" + a.slug + "-" + i;
          return (
            '<div class="faq-item reveal reveal-stagger">' +
            '<button class="faq-question" id="' + qid + '" aria-expanded="false" aria-controls="' + aid + '">' +
            '<span class="faq-num">' + String(i + 1).padStart(2, "0") + '</span>' +
            '<span class="faq-question-text">' + escapeHtml(item.question) + '</span>' +
            '<span class="faq-icon" aria-hidden="true"></span>' +
            '</button>' +
            '<div class="faq-answer" id="' + aid + '" role="region" aria-labelledby="' + qid + '">' +
            '<div class="faq-answer-inner"><p>' + escapeHtml(item.answer) + '</p></div>' +
            '</div>' +
            '</div>'
          );
        }).join("") +
        '</div>' +
        '</section>';
    }

    // ---- Related articles ----
    var related = pickRelatedArticles(a, 3);
    var relatedHtml = related.length
      ? '<section class="blog-related">' +
        '<h2>Related Reading</h2>' +
        '<div class="blog-related-grid">' +
        related.map(function (r) { return articleCardHtml(r); }).join("") +
        '</div>' +
        '</section>'
      : '';

    // ---- Prev / next ----
    var pn = getPrevNext(a);
    var prevNextHtml = (pn.prev || pn.next)
      ? '<nav class="blog-article-nav" aria-label="Article navigation">' +
        (pn.prev
          ? '<a class="blog-article-nav-link blog-article-nav-link--prev" href="/blog/' + pn.prev.slug + '.html">' +
            '<span class="blog-article-nav-direction">&larr; Previous</span>' +
            '<span class="blog-article-nav-title">' + escapeHtml(pn.prev.title) + '</span></a>'
          : '<span></span>') +
        (pn.next
          ? '<a class="blog-article-nav-link blog-article-nav-link--next" href="/blog/' + pn.next.slug + '.html">' +
            '<span class="blog-article-nav-direction">Next &rarr;</span>' +
            '<span class="blog-article-nav-title">' + escapeHtml(pn.next.title) + '</span></a>'
          : '<span></span>') +
        '</nav>'
      : '';

    // ---- Share controls ----
    var shareHtml =
      '<div class="blog-share">' +
      '<span class="blog-share-label">Share</span>' +
      '<button type="button" class="blog-share-btn" id="blog-share-copy" aria-label="Copy link" data-url="' + escapeHtml(canonicalUrl) + '">' +
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l.6-.6a2.5 2.5 0 013.5 3.5l-.6.6M9 11.5l-.6.6a2.5 2.5 0 01-3.5-3.5l.6-.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<a class="blog-share-btn" href="https://wa.me/?text=' + encodeURIComponent(a.title + " " + canonicalUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm5.6 14.3c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1s.8-2.2 1.1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.1.3-.3.5-.1.2-.3.4-.4.5-.1.1-.3.3-.1.6.2.3.9 1.4 1.8 2.3 1.3 1.2 2.3 1.6 2.7 1.8.3.1.5.1.7-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.2.1 1.5.7 1.7.8.2.1.4.2.4.3.1.2.1.7-.1 1.3z"/></svg>' +
      '</a>' +
      '<a class="blog-share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(canonicalUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.94 8.5H3.56V20.5H6.94V8.5zM5.25 3.5a1.96 1.96 0 100 3.92 1.96 1.96 0 000-3.92zM20.44 20.5h-3.37v-6.15c0-1.47-.03-3.36-2.05-3.36-2.05 0-2.37 1.6-2.37 3.25v6.26H9.28V8.5h3.24v1.64h.05c.45-.85 1.55-1.75 3.2-1.75 3.42 0 4.05 2.25 4.05 5.18v6.93z"/></svg>' +
      '</a>' +
      '<a class="blog-share-btn" href="https://twitter.com/intent/tweet?url=' + encodeURIComponent(canonicalUrl) + '&text=' + encodeURIComponent(a.title) + '" target="_blank" rel="noopener noreferrer" aria-label="Share on X">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.7L4.4 22H1.3l8.1-9.3L1 2h7l4.9 6.1L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg>' +
      '</a>' +
      '</div>';

    // ---- Bottom CTA ----
    var finalCta =
      '<section class="blog-article-final-cta">' +
      '<div class="final-cta reveal">' +
      '<h2 class="section-heading" style="margin: 0 auto;">Ready to put the strategy into action?</h2>' +
      '<p>Scale To Sky helps businesses like yours turn ideas into websites, campaigns, and content that actually move the needle.</p>' +
      '<a href="/contact.html" class="btn btn-primary" data-cta-id="blog-final-cta-' + escapeHtml(a.slug) + '">Talk to Scale To Sky ' +
      '<svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
      '</div>' +
      '</section>';

    containerEl.innerHTML =
      breadcrumbs +
      header +
      featuredImage +
      '<div class="blog-article-layout">' +
      '<div class="blog-article-main">' +
      '<div class="blog-article-body">' + contentHtml + '</div>' +
      shareHtml +
      prevNextHtml +
      faqHtml +
      relatedHtml +
      '</div>' +
      '<aside class="blog-article-aside">' + tocBlock + '</aside>' +
      '</div>' +
      finalCta;

    if (window.BlogRender && window.BlogRender.enhanceArticlePage) {
      window.BlogRender.enhanceArticlePage(containerEl, canonicalUrl);
    }
  }

  /**
   * Wires up the interactive bits of a rendered article page that
   * plain innerHTML can't: FAQ accordion is handled globally by
   * initFAQ() in main.js (same .faq-item pattern site-wide), but the
   * rest is article-specific, runs after render, and is safe to call
   * on pages with no article (all queries are guarded).
   */
  function enhanceArticlePage(containerEl, canonicalUrl) {
    // ---- Copy link ----
    var copyBtn = containerEl.querySelector("#blog-share-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var url = copyBtn.getAttribute("data-url") || canonicalUrl || window.location.href;
        var done = function () {
          copyBtn.classList.add("is-copied");
          copyBtn.setAttribute("aria-label", "Link copied");
          setTimeout(function () {
            copyBtn.classList.remove("is-copied");
            copyBtn.setAttribute("aria-label", "Copy link");
          }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, done); });
        } else {
          fallbackCopy(url, done);
        }
      });
    }

    // ---- Mobile TOC collapsible ----
    var toc = containerEl.querySelector("#blog-toc");
    if (toc) {
      var toggle = toc.querySelector(".blog-toc-mobile-toggle");
      if (toggle) {
        toggle.addEventListener("click", function () {
          var isOpen = toc.classList.toggle("is-open");
          toggle.setAttribute("aria-expanded", String(isOpen));
        });
      }

      // ---- TOC active-section highlighting (desktop + mobile) ----
      var links = Array.from(toc.querySelectorAll('a[href^="#"]'));
      var body = containerEl.querySelector(".blog-article-body");
      var headings = body ? Array.from(body.querySelectorAll("h2[id], h3[id]")) : [];

      links.forEach(function (link) {
        link.addEventListener("click", function (e) {
          var id = link.getAttribute("href");
          var target = containerEl.querySelector(id);
          if (!target) return;
          e.preventDefault();
          if (window.__lenis) {
            window.__lenis.scrollTo(target, { offset: -100 });
          } else {
            var top = target.getBoundingClientRect().top + window.pageYOffset - 100;
            window.scrollTo({ top: top, behavior: "smooth" });
          }
          if (toc.classList.contains("is-open")) {
            toc.classList.remove("is-open");
            if (toggle) toggle.setAttribute("aria-expanded", "false");
          }
        });
      });

      if (headings.length && "IntersectionObserver" in window) {
        var setActive = function (id) {
          links.forEach(function (l) {
            l.classList.toggle("is-active", l.getAttribute("href") === "#" + id);
          });
        };
        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) setActive(entry.target.id);
          });
        }, { rootMargin: "-96px 0px -70% 0px", threshold: 0 });
        headings.forEach(function (h) { observer.observe(h); });
      }
    }

    // ---- Reading progress bar ----
    var body = containerEl.querySelector(".blog-article-body");
    if (body) {
      var bar = document.createElement("div");
      bar.className = "blog-progress";
      bar.innerHTML = '<div class="blog-progress-bar" id="blog-progress-bar"></div>';
      document.body.appendChild(bar);
      var fill = bar.querySelector("#blog-progress-bar");

      var update = function () {
        var rect = body.getBoundingClientRect();
        var total = rect.height - window.innerHeight;
        if (total <= 0) {
          fill.style.width = "100%";
          return;
        }
        var scrolled = -rect.top;
        var pct = Math.min(100, Math.max(0, (scrolled / total) * 100));
        fill.style.width = pct + "%";
      };
      update();
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
    }

    // ---- Re-run scroll-reveal for content injected after
    // DOMContentLoaded (main.js's initScrollReveal only observes
    // elements present at load time). ----
    var revealEls = containerEl.querySelectorAll(".reveal:not(.is-visible)");
    if (revealEls.length) {
      if ("IntersectionObserver" in window) {
        var revealObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
        revealEls.forEach(function (el) { revealObserver.observe(el); });
      } else {
        revealEls.forEach(function (el) { el.classList.add("is-visible"); });
      }
    }

    // ---- FAQ accordion: main.js's initFAQ() only wires up items
    // present at DOMContentLoaded, so re-run the same logic for the
    // FAQ items injected here. ----
    var faqItems = containerEl.querySelectorAll(".faq-item");
    faqItems.forEach(function (item) {
      var btn = item.querySelector(".faq-question");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");
        faqItems.forEach(function (other) {
          if (other === item) return;
          other.classList.remove("is-open");
          var otherBtn = other.querySelector(".faq-question");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        });
        item.classList.toggle("is-open", !isOpen);
        btn.setAttribute("aria-expanded", String(!isOpen));
      });
    });
  }

  function fallbackCopy(url, done) {
    var input = document.createElement("input");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* silent — no success state */ }
    document.body.removeChild(input);
  }

  /**
   * Sets up the full listing page: featured article, category
   * filter bar, search box, article grid, and empty states.
   * Everything runs against the static in-memory article list —
   * no network requests of any kind.
   *
   * els = {
   *   featuredEl, filterBarEl, searchInputEl, gridEl, emptyStateEl,
   *   resetBtnEl, categoryListEl (optional "explore by topic" nav)
   * }
   */
  function initBlogListing(els) {
    var published = getPublishedArticles();
    var categories = window.BLOG_CATEGORIES || [];
    var activeCategory = "all";

    // ---- Featured article ----
    if (els.featuredEl) {
      var featured = pickFeaturedArticle(published);
      if (featured) {
        els.featuredEl.innerHTML = featuredCardHtml(featured);
        els.featuredEl.hidden = false;
      } else {
        els.featuredEl.hidden = true;
      }
    }

    // ---- Category filter bar ----
    if (els.filterBarEl) {
      var counts = {};
      published.forEach(function (a) {
        counts[a.category] = (counts[a.category] || 0) + 1;
      });
      var buttons = ['<button type="button" class="filter-btn is-active" data-filter="all">All</button>'];
      categories.forEach(function (c) {
        if (!counts[c.slug]) return; // don't show empty category filters
        buttons.push(
          '<button type="button" class="filter-btn" data-filter="' + escapeHtml(c.slug) + '">' +
          escapeHtml(c.name) +
          '</button>'
        );
      });
      els.filterBarEl.innerHTML = buttons.join("");
    }

    function applyFilters() {
      var query = (els.searchInputEl && els.searchInputEl.value || "").trim().toLowerCase();
      var visible = published.filter(function (a) {
        var matchesCategory = activeCategory === "all" || a.category === activeCategory;
        if (!matchesCategory) return false;
        if (!query) return true;
        var hay = (a.title + " " + (a.primaryKeyword || "") + " " + (a.excerpt || "")).toLowerCase();
        return hay.indexOf(query) !== -1;
      });

      if (els.gridEl) {
        els.gridEl.innerHTML = visible.map(function (a) { return articleCardHtml(a); }).join("");
      }

      if (els.emptyStateEl) {
        if (visible.length === 0) {
          els.emptyStateEl.hidden = false;
          els.emptyStateEl.textContent = query
            ? "No articles matched your search."
            : "No articles found in this category yet.";
        } else {
          els.emptyStateEl.hidden = true;
        }
      }
    }

    if (els.filterBarEl) {
      els.filterBarEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".filter-btn");
        if (!btn) return;
        els.filterBarEl.querySelectorAll(".filter-btn").forEach(function (b) {
          b.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        activeCategory = btn.dataset.filter;
        applyFilters();
      });
    }

    if (els.searchInputEl) {
      els.searchInputEl.addEventListener("input", function () {
        applyFilters();
        if (els.resetBtnEl) els.resetBtnEl.hidden = !els.searchInputEl.value.trim();
      });
    }

    if (els.resetBtnEl) {
      els.resetBtnEl.addEventListener("click", function () {
        if (els.searchInputEl) els.searchInputEl.value = "";
        activeCategory = "all";
        if (els.filterBarEl) {
          els.filterBarEl.querySelectorAll(".filter-btn").forEach(function (b) {
            b.classList.toggle("is-active", b.dataset.filter === "all");
          });
        }
        els.resetBtnEl.hidden = true;
        applyFilters();
      });
      els.resetBtnEl.hidden = true;
    }

    // ---- Explore by topic (category summary nav) ----
    if (els.categoryListEl) {
      var counts2 = {};
      published.forEach(function (a) {
        counts2[a.category] = (counts2[a.category] || 0) + 1;
      });
      els.categoryListEl.innerHTML = categories.map(function (c) {
        var n = counts2[c.slug] || 0;
        return (
          '<button type="button" class="blog-topic-pill" data-filter="' + escapeHtml(c.slug) + '"' + (n === 0 ? " disabled" : "") + '>' +
          '<span class="blog-topic-pill-name">' + escapeHtml(c.name) + '</span>' +
          '<span class="blog-topic-pill-count">' + n + '</span>' +
          '</button>'
        );
      }).join("");

      els.categoryListEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".blog-topic-pill");
        if (!btn || btn.disabled) return;
        var filter = btn.dataset.filter;
        if (els.filterBarEl) {
          var target = els.filterBarEl.querySelector('.filter-btn[data-filter="' + filter + '"]');
          if (target) target.click();
        }
        if (els.gridEl) {
          els.gridEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    applyFilters();
  }

  // Exposed for use by blog.html and blog/[article].html
  window.BlogRender = {
    getAllArticles: getAllArticles,
    getArticleBySlug: getArticleBySlug,
    getCategoryBySlug: getCategoryBySlug,
    getPublishedArticles: getPublishedArticles,
    formatDate: formatDate,
    computeReadingTime: computeReadingTime,
    renderArticle: renderArticle,
    enhanceArticlePage: enhanceArticlePage,
    initBlogListing: initBlogListing
  };
})();
