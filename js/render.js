/* Renders a page from JSON so copy and section order can change without touching markup.
   Usage: <main id="main" data-content="content/current.json"></main> + <script src="js/render.js" defer></script>
   Add ?edit to the URL to label every section with its id. Needs http(s), not file:// (fetch). */
(() => {
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // escape, then lift trademark marks into <sup> the way kohler.com sets them
  const txt = v => esc(v).replace(/[®™℠]/g, m => `<sup>${m}</sup>`);
  const attr = v => esc(v);

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
  };

  const BTN = { light: 'btn btn--light', 'on-photo': 'btn btn--on-photo', 'on-dark': 'btn btn--on-dark',
    primary: 'btn btn--primary', secondary: 'btn btn--secondary', link: 'link-underline link-underline--on-dark' };
  const actions = (list = []) => list.length
    ? `<div class="teaser__actions">${list.map(a => `<a class="${BTN[a.style] || BTN.primary}" href="${attr(a.href)}">${txt(a.label)}</a>`).join('')}</div>` : '';
  const img = (i, cls = '') => i && i.src ? `<img class="${cls}" src="${attr(i.src)}" alt="${attr(i.alt || '')}" decoding="async">` : '';
  const wrap = (s, cls, inner) => `<section class="${cls}" id="${attr(s.id)}" data-section="${attr(s.id)}" data-type="${attr(s.type)}">${inner}${s.note ? `<aside class="edit-note">${esc(s.note)}</aside>` : ''}</section>`;
  const h = (lvl, cls, t) => `<h${lvl} class="${cls}">${txt(t)}</h${lvl}>`;

  const SECTIONS = {
    teaser: s => wrap(s, `teaser teaser--${s.layout || 'left'}`,
      `<div class="teaser__media"${s.overlay != null ? ` style="--ov:${Number(s.overlay)}"` : ''}>${img(s.image)}</div>
       <div class="container"><div class="teaser__body">
         ${s.eyebrow ? `<p class="t-caption" style="margin:0">${txt(s.eyebrow)}</p>` : ''}
         ${h(s.heading || 2, `teaser__title ${s.heading === 1 ? 't-h1' : 't-h2'}`, s.title)}
         ${s.desc ? `<p class="teaser__desc t-title-l">${txt(s.desc)}</p>` : ''}
         ${actions(s.actions)}
       </div></div>`),

    featureCards: s => wrap(s, 'section section--dark', `<div class="container">
       ${s.title ? `<div class="carousel__head" style="margin-top:0">${h(2, 't-h2', s.title)}</div>` : ''}
       <div class="feature-cards">${s.cards.map(c => `
         <a class="feature-card" href="${attr(c.link.href)}">${img(c.image)}
           <div class="feature-card__body">${h(3, 'feature-card__title', c.title)}
             <span class="link-underline link-underline--on-dark">${txt(c.link.label)}</span></div></a>`).join('')}
       </div></div>`),

    bannerSplit: s => wrap(s, 'section section--dark', `<div class="container">
       <div class="banner-split ${s.textSide === 'right' ? 'banner-split--text-right' : ''}">
         <div class="banner-split__media">${img(s.image)}</div>
         <div class="banner-split__body">${h(2, '', s.title)}${s.desc ? `<p>${txt(s.desc)}</p>` : ''}${actions(s.actions)}</div>
       </div></div>`),

    bannerCaption: s => wrap(s, 'section section--dark', `<div class="container">
       <div class="banner-caption">
         <div class="banner-caption__media">${img(s.image)}</div>
         <div class="banner-caption__body">${h(2, '', s.title)}${s.desc ? `<p>${txt(s.desc)}</p>` : ''}${actions(s.actions)}</div>
       </div></div>`),

    // product carousel with placeholder tiles (no product images are bundled)
    carousel: s => wrap(s, 'section carousel', `<div class="container">
       <div class="carousel__head" style="margin-top:0">${h(2, 't-h4', s.title)}
         <div style="display:flex;gap:var(--sp-m);align-items:center">
           ${s.link ? `<a class="link-underline" href="${attr(s.link.href)}">${txt(s.link.label)}</a>` : ''}
           <div class="carousel__nav"><button class="carousel__btn" data-dir="-1" aria-label="Previous">${ICONS.prev}</button><button class="carousel__btn" data-dir="1" aria-label="Next">${ICONS.next}</button></div>
         </div></div>
       <div class="carousel__track" tabindex="0" aria-label="${attr(s.title)}">${(s.items || []).map(p => `
         <a class="card" href="${attr(p.href || '#')}"><div class="card__img">${img(p.image)}</div>
           <div class="card__title">${txt(p.title)}</div>${p.meta ? `<div class="card__meta">${txt(p.meta)}</div>` : ''}</a>`).join('')}
       </div></div>`),

    // "See Kohler in your bathroom": services + the two web apps. Tiles use href, or data-action for overlays/handoffs
    experienceHub: s => wrap(s, 'section experience', `<div class="container">
       <div class="experience__head">
         ${s.eyebrow ? `<span class="badge badge--new">${txt(s.eyebrow)}</span>` : ''}${h(2, 't-h2', s.title)}
         ${s.desc ? `<p class="t-p-l">${txt(s.desc)}</p>` : ''}</div>
       <div class="experience-hub">${s.tiles.map(t => {
         const tag = t.href ? 'a' : 'button';
         const act = t.href ? `href="${attr(t.href)}"` : `type="button" data-action="${attr(t.action)}"${t.action === 'store' ? ' aria-haspopup="dialog"' : ''}`;
         return `<${tag} class="xp-tile ${t.size === 'wide' ? 'xp-tile--wide' : ''}" ${act} data-tile="${attr(t.id)}">
           <span class="xp-tile__media">${img(t.image)}</span>
           <span class="xp-tile__body">
             ${t.badge ? `<span class="badge badge--new">${txt(t.badge)}</span>` : ''}
             <span class="xp-tile__title">${txt(t.title)}</span>
             <span class="xp-tile__desc">${txt(t.desc)}</span>
             <span class="link-underline xp-tile__cta"${t.labelDesktop ? ` data-label-mobile="${attr(t.label)}" data-label-desktop="${attr(t.labelDesktop)}"` : ''}>${txt(t.label)}</span>
           </span></${tag}>`; }).join('')}
       </div></div>`),

    // simple centered statement block for concept pages
    intro: s => wrap(s, `section ${s.dark ? 'section--dark' : ''}`, `<div class="container intro-block">
       ${s.eyebrow ? `<p class="t-caption" style="margin:0">${txt(s.eyebrow)}</p>` : ''}${h(2, 't-h2', s.title)}
       ${s.desc ? `<p class="t-p-l" style="margin:0">${txt(s.desc)}</p>` : ''}${actions(s.actions)}</div>`)
  };

  const CLOSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const links = list => list.map(l => `<li><a href="${attr(l.href)}">${txt(l.label)}</a></li>`).join('');

  const mega = (n, i) => !n.menu ? '' : `
    <div class="mega" id="mega-${i}" role="region" aria-label="${attr(n.label)}" hidden><div class="container mega__inner">
      ${n.menu.columns.map(col => `<div class="mega__col"><p class="mega__title">${txt(col.title)}</p><ul>${links(col.links)}</ul></div>`).join('')}
      ${n.menu.feature ? `<a class="mega__feature" href="${attr(n.menu.feature.href)}">
        <span class="mega__img"><img src="${attr(n.menu.feature.image)}" alt="" decoding="async"></span>
        <span class="t-caption">${txt(n.menu.feature.eyebrow)}</span>
        <span class="mega__feature-title">${txt(n.menu.feature.title)}</span>
        <span class="link-underline">${txt(n.menu.feature.cta)}</span></a>` : ''}
    </div></div>`;

  const dialogHead = (id, title) => `<div class="overlay__head"><h2 class="overlay__title" id="${id}-h">${txt(title)}</h2>
      <button class="icon-btn" type="button" data-close aria-label="Close">${CLOSE}</button></div>`;

  const header = c => `
    <div class="concept-banner" role="note">${txt(c.banner)}</div>
    <div class="brandbar"><div class="container"><ul>${c.brands.map(b => `<li><a href="${attr(b.href)}"${b.current ? ' aria-current="true"' : ''}>${txt(b.label)}</a></li>`).join('')}</ul></div></div>
    <header class="mainnav" id="mainnav"><div class="container">
      <a class="logo" href="${attr(c.logo.href)}" aria-label="Kohler home (prototype)">${txt(c.logo.label)}</a>
      <nav aria-label="Main"><ul class="mainnav__list">${c.nav.map((n, i) => `
        <li class="mainnav__item">${n.menu
          ? `<button class="mainnav__link" type="button" aria-expanded="false" aria-controls="mega-${i}">${txt(n.label)}</button>${mega(n, i)}`
          : `<a class="mainnav__link" href="${attr(n.href)}">${txt(n.label)}</a>`}</li>`).join('')}
      </ul></nav>
      <div class="utils">${c.utils.map(u => `<button class="utils__btn utils__btn--${attr(u.action)}" type="button" data-action="${attr(u.action)}" aria-haspopup="dialog">${ICONS[u.icon] || ''}<span>${txt(u.label)}</span></button>`).join('')}</div>
    </div></header>
    <div class="mega-scrim" hidden></div>

    <dialog class="overlay overlay--top" id="ov-search" aria-labelledby="ov-search-h"><div class="overlay__panel container">
      ${dialogHead('ov-search', 'Search')}
      <form class="search-form" role="search" onsubmit="return false">
        <label class="visually-hidden" for="search-q">${txt(c.search.placeholder)}</label>
        ${ICONS.search}<input id="search-q" type="search" placeholder="${attr(c.search.placeholder)}" autocomplete="off">
      </form>
      <p class="overlay__label">Popular searches</p>
      <ul class="chips">${c.search.popular.map(p => `<li><button type="button" class="chip" data-fill="${attr(p)}">${txt(p)}</button></li>`).join('')}</ul>
      <p class="overlay__note" aria-live="polite" data-search-note>${txt(c.search.note)}</p>
    </div></dialog>

    <dialog class="overlay overlay--right" id="ov-store" aria-labelledby="ov-store-h"><div class="overlay__panel">
      ${dialogHead('ov-store', c.store.title)}
      <p class="overlay__text">${txt(c.store.text)}</p>
      <form class="store-form" onsubmit="return false" novalidate>
        <div class="field"><label for="store-q">${txt(c.store.label)}</label><input id="store-q" type="text" inputmode="text" autocomplete="off"></div>
        <button class="btn btn--primary" type="submit">${txt(c.store.cta)}</button>
      </form>
      <div class="store-results" aria-live="polite" hidden>
        <ul>${c.store.sample.map(s => `<li class="store-card"><strong>${txt(s.name)}</strong><span>${txt(s.address)}</span><span class="store-card__hours">${txt(s.hours)}</span></li>`).join('')}</ul>
        <p class="overlay__note">${txt(c.store.note)}</p>
      </div>
    </div></dialog>

    <dialog class="overlay overlay--right" id="ov-menu" aria-labelledby="ov-menu-h"><div class="overlay__panel">
      ${dialogHead('ov-menu', 'Menu')}
      <nav class="drawer-nav" aria-label="Main (mobile)">${c.nav.map(n => n.menu
        ? `<details><summary>${txt(n.label)}${CHEV}</summary>${n.menu.columns.map(col => `<p class="mega__title">${txt(col.title)}</p><ul>${links(col.links)}</ul>`).join('')}</details>`
        : `<a href="${attr(n.href)}">${txt(n.label)}</a>`).join('')}</nav>
      <div class="drawer-utils"><button type="button" class="link-underline" data-action="store">Find a Store</button></div>
    </div></dialog>
    <dialog class="overlay overlay--center" id="ov-qr" aria-labelledby="ov-qr-h"><div class="overlay__panel qr-panel">
      ${dialogHead('ov-qr', 'Kohler View')}
      <div class="qr-panel__body">
        <div class="qr-code" data-qr aria-label="QR code that opens Kohler View on your phone" role="img"></div>
        <div class="qr-panel__copy">
          <span class="badge badge--new">Mobile only</span>
          <p class="t-title-l">Kohler View uses your phone camera to place products in your bathroom. Scan this QR code on your phone to use it.</p>
          <p class="overlay__note">Or open <span class="qr-url" data-qr-url></span> on your phone.</p>
          <a class="link-underline" href="view.html?demo=1">Preview on this device</a>
        </div>
      </div>
    </div></dialog>`;

  const footer = c => `
    <footer class="footer"><div class="container">
      <div class="footer__top">
        <form class="newsletter" onsubmit="return false" novalidate aria-label="Newsletter (prototype, does not submit)"
          data-invalid="${attr(c.newsletter.invalid)}" data-thanks="${attr(c.newsletter.thanks)}" data-thanks-note="${attr(c.newsletter.thanksNote)}">
          <p>${txt(c.newsletter.text)}</p>
          <div class="newsletter__row"><label class="visually-hidden" for="nl-email">${txt(c.newsletter.placeholder)}</label>
            <input id="nl-email" type="email" placeholder="${attr(c.newsletter.placeholder)}" autocomplete="off" aria-describedby="nl-msg">
            <button type="submit">${txt(c.newsletter.submit)}</button></div>
          <p class="newsletter__msg" id="nl-msg" aria-live="polite"></p>
        </form>
        <div class="followus"><h2>Follow Us</h2><ul>${c.social.map(s => `<li><a href="${attr(s.href)}" aria-label="${attr(s.label)}">${txt(s.abbr)}</a></li>`).join('')}</ul></div>
      </div>
      <div class="footer__cols">${c.footerCols.map(col => `<div><h2>${txt(col.title)}</h2>${col.links.map(l => `<a href="${attr(l.href)}">${txt(l.label)}</a>`).join('')}</div>`).join('')}</div>
      <div class="footer__legal">${c.legal.map(l => `<a href="${attr(l.href)}">${txt(l.label)}</a>`).join('')}<span class="footer__copy">${txt(c.copyright)}</span></div>
      <p class="footer__disclaimer">${txt(c.disclaimer)}</p>
    </div></footer>`;

  const wireCarousels = root => root.querySelectorAll('.carousel').forEach(el => {
    const track = el.querySelector('.carousel__track');
    const btns = el.querySelectorAll('.carousel__btn');
    const sync = () => { btns[0].disabled = track.scrollLeft < 4; btns[1].disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4; };
    btns.forEach(b => b.addEventListener('click', () => track.scrollBy({ left: b.dataset.dir * track.clientWidth, behavior: 'smooth' })));
    track.addEventListener('scroll', sync, { passive: true }); sync();
  });

  async function render() {
    const main = document.getElementById('main');
    if (!main || !main.dataset.content) return; // app pages (viz/view) render their own UI
    const src = main.dataset.content;
    try { if (document.fonts.check('16px "Helvetica Now Text"') && !document.fonts.check('16px "__no_such_font__"')) document.documentElement.classList.add('has-brand-font'); } catch (e) {}
    if (new URLSearchParams(location.search).has('edit')) document.documentElement.classList.add('is-edit');
    try {
      const [chrome, page] = await Promise.all([fetch('content/chrome.json'), fetch(src)].map(p => p.then(r => { if (!r.ok) throw new Error(r.url + ' ' + r.status); return r.json(); })));
      document.title = page.page.title + ' | prototype';
      main.insertAdjacentHTML('beforebegin', header(chrome));
      main.innerHTML = page.sections.filter(s => !s.hidden).map(s => SECTIONS[s.type] ? SECTIONS[s.type](s) : `<p class="render-error container">Unknown section type "${esc(s.type)}" (${esc(s.id)})</p>`).join('');
      main.insertAdjacentHTML('afterend', footer(chrome));
      wireCarousels(main);
      document.documentElement.dataset.rendered = '1';
      document.dispatchEvent(new CustomEvent('page:rendered', { detail: page }));
    } catch (e) {
      main.innerHTML = `<div class="container render-error">Could not load content (${esc(e.message)}).<br>Run <code>python serve.py</code> in this folder and open http://localhost:8000/ (pages can't load JSON from file://).</div>`;
    }
  }
  window.KohlerUI = { esc, txt, attr, ICONS, img, actions, header, footer, BTN };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', render) : render();
})();
