# Homepage Media — Asset Attribution Log

This file tracks every external, non-original media asset used on the
homepage (`index.html`), per the Phase 10 licensing workflow. Every row
must be filled in **before** an asset is committed to `assets/home/`.

Do not commit an asset to this folder without a corresponding row here.

| Filename | Section used | Source | Source URL | License | Commercial use OK? | Downloaded by / date |
|---|---|---|---|---|---|---|
| hero-main.jpg / hero-main.webp | Hero (index.html) | _(fill in — Unsplash/Pexels/Pixabay page you downloaded from)_ | _(paste the exact photo page URL here)_ | _(confirm license type shown on the download page)_ | ✅ (confirm before publishing) | User, 2026-09-10 |

## Status

One asset is live: the hero photo above. Resized to 1920px wide and
compressed (JPEG ~245KB, WebP ~131KB) from the original 6154×4216
upload; served via `<picture>` with WebP + JPEG fallback.

**Action needed:** fill in the Source / Source URL / License columns
for `hero-main.jpg` above before this goes live publicly.

All other homepage media slots (services, industries, "what we
create", about) are still in their empty/placeholder state — see
below. The decorative mock UI graphics that used to sit under the
hero, and the small mock line/browser/dot graphics inside each
service card, have been removed at the user's request so the section
reads cleanly while waiting for real photos.

Reason: this environment's outbound network access is restricted to
package/code registries (npm, PyPI, GitHub, etc.) and cannot reach
Unsplash, Pexels, Pixabay, or other image/video CDNs. Real assets need
to be sourced and added by someone with access to those sites (or the
sandbox network allowlist needs to include them), then dropped into
the folders below.

## Folder convention

```
assets/home/images/   → homepage photography (.webp preferred, .jpg fallback)
assets/home/videos/   → homepage video loops (.webm preferred, .mp4 fallback)
```

Use clean, descriptive filenames, e.g.:

```
business-team-strategy.webp
restaurant-digital-brand.webp
fashion-brand-content.webp
real-estate-marketing.webp
mobile-app-business.webp
digital-advertising-campaign.webp
creator-content.webp
```

## How to fill a slot

Each slot in `index.html` is marked with an HTML comment, e.g.:

```html
<!-- MEDIA SLOT: hero-main
     Suggested: 5–12s muted loop or a single strong photo of a
     creative/marketing team at work.
     To activate: add assets/home/videos/hero-main.webm (+ .mp4
     fallback) or assets/home/images/hero-main.webp, then uncomment
     the <video>/<img> markup directly below and remove the
     .media-slot--empty class from the parent. -->
```

To activate a slot:

1. Verify the source license permits commercial website use.
2. Download the asset, optimize it (WebP/AVIF for images, WebM+MP4
   for video), and save it under `assets/home/images/` or
   `assets/home/videos/` using a descriptive filename.
3. Add a row to the attribution table above.
4. In `index.html`, uncomment the real `<img>`/`<picture>`/`<video>`
   markup inside the matching `MEDIA SLOT` comment and remove the
   `media-slot--empty` modifier class from its container so the CSS
   fallback (gradient/SVG) is replaced by the real media.
5. Write meaningful `alt` text (or empty `alt=""` if the image is
   purely decorative and adjacent text already conveys the meaning).
6. Never caption a stock photo as an actual Scale To Sky client,
   employee, or project unless it is verified true.
