# Kohler landing-page redesign prototype

**Status (Nov 7, 2026):** The landing page follows Arnav's Figma sitemap (file `UX-Design-App-and-Web-App`, page "Sitemap", section "Arnav - Web App"). The two new web apps from that sitemap are built as mocked prototypes:
- **Kohler Viz** (`viz.html`): the AI bathroom visualizer, on desktop and mobile.
- **Kohler View** (`view.html`): the AR camera tool, mobile only. Desktop gets a QR code.

## What this is
A **prototype for a pitch**. The goal is to show Kohler a restructured landing page and two new web apps that help people see KOHLER products in their own bathroom. The pages must use Kohler's real design system so the proposal looks credible. The owner (Arnav) describes the changes, and they're made in static HTML/CSS plus a small amount of vanilla JS. It runs on localhost and deploys to GitHub Pages.

## Rules (please keep these)
1. **Every page carries the banner** `For prototype purposes only` (class `.concept-banner`) and `<meta name="robots" content="noindex">`. The footer keeps the "Kohler® is a trademark of Kohler Co." line.
2. **No working flows.** No real login, checkout, payment or data collection. Mock these with static screens and placeholder data. Forms use `onsubmit="return false"`.
3. **Do not copy Kohler's HTML or JS.** Rebuild with the components in this folder. The saved page in `source/` is reference only and is git-ignored, so it is never published.
4. **No fonts or files from Kohler or Apple are bundled** (see Fonts).
5. Use design tokens, not hard-coded values. Log every new component under "Inferred components" below.

## Run it
```
python serve.py          # then open http://localhost:8000/
```
The server exposes only the concept landing page (`/`), `viz.html`, `view.html` and the files they use. Everything else returns 404 (`current.html`, `design-system.html`, `source/`…). Pages load JSON, so they won't work from `file://`.

**Testing Kohler View on a phone:** the camera needs HTTPS, and a QR code that points to `localhost` won't open on a phone. Deploy to GitHub Pages (HTTPS) and scan the QR code from the desktop site. On a desktop browser, `view.html?demo=1` previews the mobile flow, using the webcam or a sample photo.

## Sitemap → pages
| Sitemap item | Built as |
|---|---|
| New collections | Kohler x Studio McGee teaser (page H1) |
| Signature lineup(s) | KOHLER® Collections teaser. **Assumption:** confirm, or send the lineup names |
| Browsing by products | "Browse by Product" grid |
| See Kohler in your bathroom [NEW] | `experienceHub` section with 5 tiles: Kohler View, Kohler Viz, Bathroom Sets, Bathroom Design, Find a Local Store |
| Dekoda / Saunas, Ice Baths / Footer | Existing sections |
| Kohler view [NEW] | Desktop: QR dialog. Mobile (≤1023px): `view.html`: intro → "Allow kohler.com to use the camera?" → **Yes:** AR tool / **No:** Kohler Viz offer → Continue (to Viz) or Not interested (to landing) |
| Kohler viz [NEW] | `viz.html`: intro → Step 1 Recreate (Describe it or Floorplan builder) → Step 2 Collect (Explore bathroom sets, or Pick your own via placeholders + local nav) → "See these in your bathroom" → Try another / Save → talk to designers + local stores |

**What's real and what's mocked**
- **Real KOHLER products:** Viz's "Pick your own" step, the bathroom sets and Kohler View use 20 verified KOHLER products
  (names, SKUs and product-page links). Their images are hotlinked from Kohler's image server
  (`kohler.scene7.com/is/image/PAWEB/...`). If Kohler changes an image, the card falls back to a drawing. Kohler View
  uses the transparent PNG versions (`fmt=png-alpha`) as AR cut-outs. The Claude™ 48" vanity image isn't transparent, so
  it uses a drawing in AR.
- **Free AI render:** "See these in your bathroom" calls **Pollinations** (`image.pollinations.ai`, mini `turbo`
  model). It's free and needs no API key. It isn't a Kohler service.
  - Only a **text prompt** is sent: room type, size and style, floorplan doors/windows/fan, product names and the
    description. Photos never leave the device, and the UI says so.
  - **Free-tier limits:**
    - About **one image every 40 seconds** per visitor/IP. The app waits out the cooldown, with a countdown on
      Regenerate and a "Waiting for the free AI model" message.
    - Pollinations **rejects `fetch()` from browsers** (it asks for a Turnstile token), so the image loads as a plain
      `<img>`.
    - The free tier adds a small "pollinations.ai" watermark.
  - If the service is busy, rate-limited or down, the result falls back to the curated sample photo with product pins
    and shows a notice.
  - Saved combinations keep the image URL and fall back to the sample photo if it no longer loads.
- **Still mocked:**
  - The "AI understood your bathroom" step is keyword matching.
  - Sets, scenes and pin positions are illustrative.
  - Camera frames, reference photos and captures never leave the device.
  - Saved combinations live in this browser's localStorage.

**Floorplan builder:**
- **Fixtures** (toilet, vanity & mirror, bathtub, shower) snap to a 1-ft grid and can be rotated.
- **Doors, windows and fans** are wall-only. They snap to the nearest wall while dragging, arrow keys move them along the
  wall, and R moves them to the next wall.
- The mirror is part of the vanity. Placing a vanity adds **faucet** and **mirror** slots in Step 2.
- Doors, windows and fans feed the AI prompt; they aren't product slots.

## Interactions (`js/interactions.js`)
- **Sticky header:** the brand bar scrolls away, the main nav sticks with a shadow, hides while you scroll down, and comes back as soon as you scroll up.
- **Mega menus:** desktop nav items open on hover (with a short delay) or click. ArrowDown moves into the panel, and Esc closes and returns focus. Clicking the dimmed page also closes it. Content is in `content/chrome.json` under `nav[].menu`, with optional `feature` cards.
- **Overlays** (native `<dialog>`, which traps focus; Esc and backdrop click close them):
  - Search: popular-search chips.
  - Find a Store: requires an entry, then shows **sample** results.
  - Mobile menu: below 1200px, with accordions.
- **Newsletter:** validates the email format, then shows a thank-you state. Nothing is sent or stored.
- **Motion:** sections fade up as they scroll into view, and the first hero image settles in on load. All motion is off when the OS "reduce motion" setting is on.

## Contents
| Path | What it is |
|---|---|
| `index.html` | Hub: links to every page, plus a side-by-side before/after preview. |
| `current.html` | **Baseline**: today's kohler.com home page, rebuilt from `content/current.json`. |
| `concept.html` | **Draft restructure**, rendered from `content/concept.json`. |
| `design-system.html` | Every token and component rendered. |
| `tokens.css` | Colors, type, spacing, grid, radii, shadows, motion (from kohler.com's `:root`), plus a few added tokens, all marked. |
| `components.css` | Website components. Built only from tokens. |
| `js/render.js` | Reads a page JSON and renders header, sections, footer and overlays. |
| `js/interactions.js` | Sticky header, mega menus, overlays, newsletter states, scroll reveal, Kohler View QR / mobile handoff. |
| `viz.html` + `js/viz.js` | Kohler Viz app (hash routes, so the back button works). Session state in sessionStorage. |
| `view.html` + `js/view.js` | Kohler View AR app: live camera, drag / pinch / twist placement, finishes, capture. |
| `js/fixtures.js` | SVG drawings: fixtures (top + front view, recoloured by finish) and wall-only door, window and fan for the floorplan. Used as fallbacks when a product photo can't load. |
| `apps.css` | App components (see Inferred components). |
| `content/viz.json` | App data: real KOHLER products per fixture (SKU, image, page URL, AR cut-out), bathroom sets, sample scenes and pins, copy, AI settings (`copy.ai`: endpoint, model, timeout, disclosure). |
| `content/chrome.json` | Brand bar, nav and mega-menu links, search chips, store-finder copy, newsletter messages, footer. |
| `content/current.json` / `concept.json` | One entry per page section: copy, CTAs, links, images. |
| `content/landing-outline.md` | Original outline of the live page (see the corrections below). |
| `assets/images/` | 13 real images from the saved page. |
| `serve.py` | Local server for the concept page only, with correct MIME types. |

## Editing content (no layout changes needed)
Each section in `content/*.json` looks like `{ "type": ..., "id": ..., ...copy }`.
- **Change copy:** edit the strings. ®, ™ and ℠ are set as superscripts automatically.
- **Reorder:** move the object up or down in `sections`.
- **Cut without losing it:** add `"hidden": true`.
- **Explain a change:** add `"note": "..."`. Notes appear only when the URL ends with `?edit`, which also labels each section with its `id` and type.
- **Section types:** `teaser` (full-bleed; `layout` center|bottom|left, `heading` 1 for the page H1, `overlay` 0–1, optional `eyebrow`), `featureCards` (2-up photo cards, optional `title`), `bannerSplit` (`textSide` left|right), `bannerCaption`, `intro` (centered statement, `dark` true|false), `carousel` (product tiles with placeholder images).
- **Button styles** (`actions[].style`): `light`, `on-photo`, `on-dark`, `primary`, `secondary`, `link`.
- **New section type:** add one template function to `SECTIONS` in `js/render.js` and its CSS to `components.css`.

## Corrections to `landing-outline.md` (checked against the saved HTML)
- **There are no product carousels.** Bestsellers, Toilets, Bathroom Faucets and Kitchen Faucets are a 2×2 grid of large photo cards on charcoal (`double-featured-content-cards`, each a one-slide `carousel two-column-layout fc-white`). Saunas and Ice Bath are a second pair. Every card's image is in `assets/images/`.
- **The hero does not rotate.** The page stacks four full-bleed video teasers (posters only here): Collections (H1), Studio McGee, Bathing, then Dekoda. Bathing and Dekoda come after the category grid. All four use the `hero-banner-des-medium-center` layout except Dekoda (`-bottom`, 35% overlay).
- **Image mapping, now confirmed from the markup:**
  - Collections: aak30996. Studio McGee: aaj61614. Bathing: aaj88077. Dekoda: aai55266.
  - Bestsellers: aag35780. Toilets: aag77373. Bathroom Faucets: aae97602. Kitchen Faucets: aak31040.
  - Saunas: aai21563. Ice Bath: aag43565.
  - Bathroom Sets: aad84172 (text left). Bathroom Design: aaf30563 (text right). Bring Design to Life: aae67468 (image left, caption right).
- All three bottom banners use Kohler's secondary button (`gbh-secondary-button`). They sit on charcoal backgrounds.

## Fonts
Kohler uses **Helvetica Now Text** (licensed, not included). `tokens.css` sets `"Helvetica Now Text", "Helvetica Neue", Helvetica, Arial`. Do not commit any font file. Kohler's tracking (e.g. -7.5px on the H1) is tuned for Helvetica Now and makes letters collide in Arial or Helvetica Neue. `tokens.css` therefore loosens all `--ls-*` values by about 45% unless `<html>` has the class `has-brand-font`. If the licensed web fonts are added, put the `@font-face` rules at the top of `tokens.css` and add `class="has-brand-font"` to each page's `<html>`.

## Images
13 images are in `assets/images/`. Product packshots and the KOHLER wordmark are not included. The wordmark is set in text. Product tiles (`carousel` type, `.card__img`) show grey placeholders unless you give them an `image`. Kohler's image server (`s7d1.scene7.com/...`, links in the saved HTML) works for hotlinking but can break at any time.

## Inferred components (verify against the live site)
Taken **directly** from Kohler's CSS: token values, button, input and focus styles, teaser-link underline, newsletter placement.

**Inferred** from class names and structure, with no stylesheet to check against:
- **Earlier:** brand bar and main nav layout, carousel (4-up, scroll-snap), footer 4 columns, tabs.
- **Website (Nov 7):**
  - Teaser layout modifiers `.teaser--center` and `--bottom`, and the overlay mix (radial + left + top gradients, `--ov`). The CTA treatment (white filled `btn--light` + white outline `btn--on-photo`) is a guess.
  - `.feature-cards` / `.feature-card` (title as H3, underline link).
  - `.banner-split` (`--text-right`) and `.banner-caption`.
  - `.btn--on-dark`, `.btn--light`.
  - `.section`, `.section--dark`. `--c-surface-dark` uses primary-800 because the exact "charcoal" value isn't in the saved CSS.
  - Carousel prev/next buttons, newsletter row, Follow Us circles (text initials instead of brand icons), legal row.
  - `.intro` statement block, edit-mode labels and notes.
  - Mobile sizes for hero and feature-card headings.
- **Web apps (`apps.css`, all inferred):** compact app header with step progress, sticky action bar, intro split, toggle chips, fixture chips, AI analysis box, photo drop zone, floorplan builder, choice cards, selectable set cards, fixture slots, sticky local nav with product strip, generating state, render with pins and tooltips, saved and next-step cards, AR viewport with tools, bottom-sheet product tray, finish swatches, shutter and capture sheet, camera pre-permission card, toast.
- **Landing additions:** `experienceHub` tiles, `.badge--new`, centered QR dialog.
- **Refinements:** wall-only floorplan items, real product photo cards (`.pimg`), AI render tabs, cooldown on Regenerate.
- **New tokens:** metal finish swatches (`--c-finish-*`) and `--c-error-on-dark`, both marked in `tokens.css`.
- **Not built:** country picker and video playback.

## Build plan
1. **Done:** design system, plus the landing page restructured to the Figma sitemap.
2. **Done (prototype):** Kohler Viz and Kohler View.
3. **Next:** Arnav's content changes. Edit `content/concept.json` for the landing page and `content/viz.json` for the apps. Confirm the "Signature lineup(s)" mapping.

## Owner
Arnav, UX design student. This is a portfolio and pitch piece.
