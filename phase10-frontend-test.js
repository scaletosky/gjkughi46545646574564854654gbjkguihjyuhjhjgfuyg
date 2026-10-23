/**
 * TEST-ONLY harness for js/homepage-portfolio.js (Phase 10).
 * Loads the actual homepage markup fragment + the actual script file
 * into a jsdom document, mocks fetch with realistic API payloads, and
 * asserts on the real rendered DOM (card hrefs, media fallback chain,
 * empty/loading states, static copy kept, media URL handling).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  OK   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}`); }
}

const HOMEPAGE_FRAGMENT = `
<div class="section-head-row reveal">
  <div>
    <span class="kicker" id="home-portfolio-kicker">Selected work</span>
    <h2 class="section-heading" id="home-portfolio-heading">Recent projects we're proud of.</h2>
  </div>
  <a href="portfolio.html" class="btn btn-secondary" id="home-portfolio-button">View full portfolio</a>
</div>
<div class="portfolio-status" id="home-portfolio-loading"><span>Loading...</span></div>
<div class="portfolio-status" id="home-portfolio-empty" hidden><p>New projects will appear here soon.</p></div>
<div class="work-grid" id="home-portfolio-grid" data-stagger-group hidden></div>
`;

const scriptSrc = fs.readFileSync(path.join(__dirname, 'js/homepage-portfolio.js'), 'utf8');

async function runScenario(name, { fetchImpl, assertions }) {
  console.log(`\n=== ${name} ===`);
  const dom = new JSDOM(`<!doctype html><html><body>${HOMEPAGE_FRAGMENT}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/index.html',
  });
  const { window } = dom;
  window.fetch = fetchImpl;
  window.STSKAnalytics = { trackPortfolioView: () => {} };
  // jsdom doesn't implement IntersectionObserver.
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = window.matchMedia || (() => ({ matches: false }));
  // video.play() isn't implemented in jsdom.
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};

  dom.window.eval(scriptSrc);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  // Let the async fetch/render chain resolve.
  await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 20));

  assertions(dom.window.document);
  dom.window.close();
}

const unexpected = [];

async function main() {
  const featuredPayload = (projects) => ({
    ok: true,
    json: async () => ({ success: true, data: { projects } }),
  });
  // Page copy is static HTML now — any non-/featured request is unexpected.
  const unexpectedRequest = (url) => { unexpected.push(url); return { ok: false, json: async () => ({}) }; };

  await runScenario('Image project card: correct Case Study URL, not projectUrl', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([
          {
            _id: '1', title: 'Acme Rebrand', slug: 'acme-rebrand', category: 'Branding',
            shortDescription: 'A full identity refresh.', clientName: 'Acme Co',
            mediaType: 'image', image: '/uploads/acme.jpg',
            projectUrl: 'https://acme-live-site.example.com',
          },
        ]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const grid = doc.getElementById('home-portfolio-grid');
      assert(!grid.hidden, 'grid becomes visible after load');
      const card = grid.querySelector('.work-card');
      assert(Boolean(card), 'a .work-card was rendered');
      assert(card.getAttribute('href') === 'portfolio-project.html?slug=acme-rebrand', `href is internal Case Study URL, got: ${card.getAttribute('href')}`);
      assert(!card.getAttribute('href').includes('acme-live-site'), 'href does NOT point to external projectUrl');
      assert(!card.hasAttribute('target'), 'card does not open in new tab (no external redirect)');
      const img = card.querySelector('img.project-media');
      assert(Boolean(img) && img.src.includes('/uploads/acme.jpg'), 'image media rendered from project.image');
      assert(card.querySelector('.work-name').textContent === 'Acme Rebrand', 'title rendered');
      assert(card.querySelector('.work-client').textContent === 'Acme Co', 'clientName rendered when present');
    },
  });

  await runScenario('Video project: video->poster->image fallback chain (has video+poster)', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([
          {
            _id: '2', title: 'Motion Reel', slug: 'motion-reel', category: 'Digital Marketing',
            mediaType: 'video', video: '/uploads/reel.mp4', videoPoster: '/uploads/reel-poster.jpg',
          },
        ]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const video = doc.querySelector('video.project-media');
      assert(Boolean(video), 'video element rendered for mediaType=video');
      assert(video.getAttribute('src').includes('/uploads/reel.mp4'), 'video src is project.video');
      assert(video.getAttribute('poster').includes('/uploads/reel-poster.jpg'), 'poster is project.videoPoster');
      assert(video.hasAttribute('muted'), 'video is muted');
      assert(video.hasAttribute('playsinline'), 'video has playsinline');
      assert(video.hasAttribute('loop'), 'video loops');
    },
  });

  await runScenario('Video project with no poster falls back to placeholder poster', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([
          { _id: '3', title: 'No Poster Vid', slug: 'no-poster-vid', category: 'Other', mediaType: 'video', video: '/uploads/x.mp4' },
        ]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const video = doc.querySelector('video.project-media');
      assert(video.getAttribute('poster').includes('logo-mark-small.png'), `missing videoPoster falls back to placeholder, got: ${video.getAttribute('poster')}`);
    },
  });

  await runScenario('Missing image falls back to placeholder, no undefined/null rendered', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([
          { _id: '4', title: 'Bare Project', slug: 'bare-project', category: 'Other' },
        ]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const img = doc.querySelector('img.project-media');
      assert(img.src.includes('logo-mark-small.png'), 'missing image -> placeholder used');
      const html = doc.getElementById('home-portfolio-grid').innerHTML;
      // Only check rendered *text content* for leaked undefined/null,
      // not the full HTML — the media fallback's onerror handler
      // legitimately contains the literal JS token "null"
      // (this.onerror=null), which is not a data-binding leak.
      const textOnly = doc.getElementById('home-portfolio-grid').textContent;
      assert(!textOnly.includes('undefined') && !textOnly.includes('null'), `no literal undefined/null leaked into visible text, got: ${JSON.stringify(textOnly)}`);
      assert(!doc.querySelector('.work-client'), 'clientName block omitted entirely when absent');
      assert(!doc.querySelector('.work-desc'), 'description block omitted entirely when absent');
    },
  });

  await runScenario('Project with no slug: no broken "?slug=undefined" URL', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([
          { _id: '5', title: 'No Slug Project', category: 'Other', image: '/uploads/x.jpg' },
        ]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const card = doc.querySelector('.work-card');
      assert(card.getAttribute('href') === 'portfolio.html', `no slug -> falls back to portfolio.html, got: ${card.getAttribute('href')}`);
      assert(!card.getAttribute('href').includes('slug=undefined'), 'never emits slug=undefined');
    },
  });

  await runScenario('Zero projects -> empty state shown, no fake cards', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) return featuredPayload([]);
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const empty = doc.getElementById('home-portfolio-empty');
      const grid = doc.getElementById('home-portfolio-grid');
      assert(!empty.hidden, 'empty state is visible');
      assert(grid.hidden, 'grid stays hidden');
      assert(grid.innerHTML.trim() === '', 'no fake/placeholder cards injected');
    },
  });

  await runScenario('API failure -> graceful empty state, no crash', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) throw new Error('network down');
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const empty = doc.getElementById('home-portfolio-empty');
      assert(!empty.hidden, 'API failure falls back to empty state rather than crashing');
    },
  });

  await runScenario('Static heading/button untouched; no page-content request is made', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) return featuredPayload([{ _id: '6', title: 'X', slug: 'x', category: 'Other', image: '/i.jpg' }]);
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      assert(doc.getElementById('home-portfolio-kicker').textContent === 'Selected work', 'static kicker kept');
      assert(doc.getElementById('home-portfolio-heading').textContent === "Recent projects we're proud of.", 'static heading kept');
      const btn = doc.getElementById('home-portfolio-button');
      assert(btn.textContent === 'View full portfolio' && btn.getAttribute('href') === 'portfolio.html', 'static button kept');
      assert(unexpected.length === 0, `no requests other than /featured -> ${JSON.stringify(unexpected)}`);
    },
  });

  await runScenario('Hosted (absolute) video/poster URLs are NOT prefixed with the API base', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([{
          _id: '7', title: 'Hosted', slug: 'hosted', category: 'Other',
          video: 'https://cdn.example.com/reel.mp4', videoPoster: 'https://cdn.example.com/poster.jpg',
        }]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const video = doc.querySelector('video.project-media');
      assert(Boolean(video), 'video element rendered');
      assert(video.getAttribute('src') === 'https://cdn.example.com/reel.mp4', `video src untouched -> ${video.getAttribute('src')}`);
      assert(video.getAttribute('poster') === 'https://cdn.example.com/poster.jpg', `poster untouched -> ${video.getAttribute('poster')}`);
    },
  });

  await runScenario('Drive share link pasted into video field renders play-card, not a broken <video>', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([{
          _id: '8', title: 'Drive', slug: 'drive', category: 'Other', image: '/d.jpg',
          video: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing',
        }]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      assert(!doc.querySelector('video.project-media'), 'no <video> element for a Drive URL');
      assert(Boolean(doc.querySelector('.drive-video-card')), 'drive play-card rendered');
    },
  });

  await runScenario('Multiple projects render in API order, capped at 3 client-side too', {
    fetchImpl: async (url) => {
      if (url.includes('/featured')) {
        return featuredPayload([
          { _id: '1', title: 'One', slug: 'one', category: 'Other', image: '/1.jpg' },
          { _id: '2', title: 'Two', slug: 'two', category: 'Other', image: '/2.jpg' },
          { _id: '3', title: 'Three', slug: 'three', category: 'Other', image: '/3.jpg' },
          { _id: '4', title: 'Four (should never appear)', slug: 'four', category: 'Other', image: '/4.jpg' },
        ]);
      }
      return unexpectedRequest(url);
    },
    assertions: (doc) => {
      const cards = doc.querySelectorAll('.work-card');
      assert(cards.length === 3, `client also caps at 3 even if API somehow returns more, got ${cards.length}`);
      const titles = [...cards].map((c) => c.querySelector('.work-name').textContent);
      assert(JSON.stringify(titles) === JSON.stringify(['One', 'Two', 'Three']), `order preserved -> ${JSON.stringify(titles)}`);
    },
  });

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Frontend test harness crashed:', err);
  process.exit(1);
});
