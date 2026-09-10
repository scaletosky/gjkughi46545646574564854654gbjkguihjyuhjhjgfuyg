/* ============================================================
   Testimonial Spotlight — Homepage
   Replaces the previously hardcoded data-slides JSON on
   [data-testimonial-rotator] with real data from the Testimonial
   collection (enabled only, in display order). Mirrors
   js/homepage-portfolio.js's fetch/render/fail-safe approach.
   ============================================================ */

(function () {
  const API_BASE = window.STSK_API_BASE || '';

  const wrap = document.querySelector('[data-testimonial-rotator]');
  if (!wrap) return; // not on the homepage

  const quoteEl = wrap.querySelector('.testimonial-quote');
  const nameEl = wrap.querySelector('.name');
  const roleEl = wrap.querySelector('.role');
  const avatarEl = wrap.querySelector('.avatar-mark');
  const dotsWrap = wrap.querySelector('.testimonial-nav');

  let slides = [];
  let current = 0;
  let interval = null;

  function render(i) {
    const s = slides[i];
    if (!s) return;
    quoteEl.textContent = `"${s.quote}"`;
    nameEl.textContent = s.name;
    roleEl.textContent = [s.role, s.company].filter(Boolean).join(', ');
    avatarEl.textContent = s.initials || '';
    dotsWrap.querySelectorAll('.testimonial-dot').forEach((d, idx) => {
      d.classList.toggle('is-active', idx === i);
    });
  }

  function startAutoRotate() {
    clearInterval(interval);
    if (slides.length <= 1) return;
    interval = setInterval(() => {
      current = (current + 1) % slides.length;
      render(current);
    }, 6000);
  }

  function buildDots() {
    dotsWrap.innerHTML = '';
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'testimonial-dot' + (i === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', `Show testimonial ${i + 1}`);
      dot.addEventListener('click', () => {
        current = i;
        render(current);
        startAutoRotate();
      });
      dotsWrap.appendChild(dot);
    });
  }

  async function loadTestimonials() {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/testimonials`, { credentials: 'omit' });
    } catch {
      // Network failure: leave the section as-is (its markup starts with
      // no visible slide content) rather than showing fake/stale data.
      wrap.hidden = true;
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data || !data.success) {
      wrap.hidden = true;
      return;
    }

    slides = data.data.testimonials || [];

    if (slides.length === 0) {
      wrap.hidden = true;
      return;
    }

    buildDots();
    render(0);
    startAutoRotate();

    wrap.addEventListener('mouseenter', () => clearInterval(interval));
    wrap.addEventListener('mouseleave', startAutoRotate);
  }

  document.addEventListener('DOMContentLoaded', loadTestimonials);
})();
