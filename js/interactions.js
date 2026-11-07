/* Page interactions for the concept landing page. Runs after js/render.js has built the page.
   Sticky header, mega menus, overlays (search / store finder / mobile menu), mock newsletter, scroll reveal.
   Nothing here sends or stores data. */
(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  function stickyHeader() {
    const nav = document.getElementById('mainnav');
    if (!nav) return;
    // offsetTop of a stuck element follows the scroll, so measure where the nav starts from the brand bar above it
    const anchor = nav.previousElementSibling;
    let top = 0, lastY = scrollY, ticking = false;
    const measure = () => { top = anchor ? anchor.getBoundingClientRect().bottom + scrollY : 0; };
    const update = () => {
      const y = scrollY;
      nav.classList.toggle('is-stuck', y > top);
      // hide while scrolling down past the hero, reveal on any scroll up; never hide with a menu open
      const menuOpen = !!document.querySelector('.mainnav__link[aria-expanded="true"]');
      if (!menuOpen) nav.classList.toggle('is-hidden', y > lastY && y > top + 400);
      lastY = y; ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    addEventListener('resize', measure);
    measure(); update();
  }

  function megaMenus() {
    const triggers = [...document.querySelectorAll('.mainnav__link[aria-controls]')];
    const scrim = document.querySelector('.mega-scrim');
    let openBtn = null, enterT, leaveT;

    const close = (focus = false) => {
      if (!openBtn) return;
      const panel = document.getElementById(openBtn.getAttribute('aria-controls'));
      openBtn.setAttribute('aria-expanded', 'false');
      panel.classList.remove('is-open');
      panel.hidden = true;
      scrim.classList.remove('is-open'); scrim.hidden = true;
      if (focus) openBtn.focus();
      openBtn = null;
    };
    const open = btn => {
      clearTimeout(enterT); clearTimeout(leaveT);
      if (openBtn === btn) return;
      const switching = !!openBtn;
      close();
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'true');
      panel.hidden = false; scrim.hidden = false;
      panel.classList.toggle('no-anim', switching); // no re-animation when sliding between tabs
      requestAnimationFrame(() => { panel.classList.add('is-open'); scrim.classList.add('is-open'); });
      openBtn = btn;
      document.getElementById('mainnav').classList.remove('is-hidden');
    };

    triggers.forEach(btn => {
      const item = btn.parentElement;
      btn.addEventListener('click', () => (openBtn === btn ? close() : open(btn)));
      btn.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); open(btn); document.getElementById(btn.getAttribute('aria-controls')).querySelector('a')?.focus(); }
      });
      // hover intent: short delay in, slightly longer delay out (desktop pointers only)
      item.addEventListener('pointerenter', () => {
        if (!finePointer.matches) return;
        clearTimeout(leaveT);
        enterT = setTimeout(() => open(btn), openBtn ? 0 : 140);
      });
      item.addEventListener('pointerleave', () => {
        if (!finePointer.matches) return;
        clearTimeout(enterT);
        leaveT = setTimeout(() => close(), 220);
      });
    });

    scrim.addEventListener('click', () => close());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && openBtn) close(true); });
    // close when focus leaves the open menu (keyboard users tabbing away)
    document.addEventListener('focusin', e => { if (openBtn && !openBtn.parentElement.contains(e.target)) close(); });
    addEventListener('resize', () => close());
  }

  function overlays() {
    const map = { search: 'ov-search', store: 'ov-store', menu: 'ov-menu' };
    const lock = on => document.documentElement.classList.toggle('has-overlay', on);

    const openDialog = (id, opener) => {
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      const d = document.getElementById(id);
      if (!d) return;
      d._opener = opener;
      d.showModal(); lock(true);
      requestAnimationFrame(() => d.classList.add('is-open'));
      (d.querySelector('input') || d.querySelector('[data-close]')).focus();
    };
    const closeDialog = d => {
      if (reduceMotion) { d.close(); return; }
      d.classList.remove('is-open');
      setTimeout(() => d.close(), 250);
    };

    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (a && a.dataset.action === 'view') {
        // Kohler View is mobile only (sitemap): phones go straight to the AR app, desktop gets a QR handoff
        if (isMobile.matches) { location.href = 'view.html'; return; }
        openDialog('ov-qr', a); drawQR();
        return;
      }
      if (a && map[a.dataset.action]) openDialog(map[a.dataset.action], a);
      const c = e.target.closest('[data-close]');
      if (c) closeDialog(c.closest('dialog'));
    });
    document.querySelectorAll('dialog.overlay').forEach(d => {
      d.addEventListener('click', e => { if (e.target === d) closeDialog(d); }); // backdrop click
      d.addEventListener('cancel', e => { e.preventDefault(); closeDialog(d); }); // Esc, with exit animation
      // Esc inside a filled search field only clears it by default; close the overlay in one press instead
      d.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeDialog(d); } });
      d.addEventListener('close', () => { d.classList.remove('is-open'); lock(false); d._opener?.focus(); });
    });

    // search: chips fill the field; "submit" explains it's a prototype
    const q = document.getElementById('search-q');
    document.querySelectorAll('[data-fill]').forEach(ch => ch.addEventListener('click', () => { q.value = ch.dataset.fill; q.focus(); }));
    document.querySelector('.search-form')?.addEventListener('submit', () => {
      const note = document.querySelector('[data-search-note]');
      note.classList.remove('flash'); void note.offsetWidth; note.classList.add('flash');
    });

    // store finder: require input, then show sample results
    const sf = document.querySelector('.store-form');
    sf?.addEventListener('submit', () => {
      const input = sf.querySelector('input'), field = input.closest('.field');
      const ok = input.value.trim().length > 1;
      field.classList.toggle('field--error', !ok);
      let hint = field.querySelector('.field__hint');
      if (!ok) {
        if (!hint) { hint = document.createElement('span'); hint.className = 'field__hint'; hint.id = 'store-hint'; field.append(hint); input.setAttribute('aria-describedby', 'store-hint'); }
        hint.textContent = 'Enter a city, state or ZIP code.';
        input.focus();
      } else hint?.remove();
      document.querySelector('.store-results').hidden = !ok;
    });
  }

  function newsletter() {
    const f = document.querySelector('.newsletter');
    if (!f) return;
    const input = f.querySelector('input'), msg = f.querySelector('.newsletter__msg');
    f.addEventListener('submit', () => {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
      f.classList.toggle('is-invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok) { msg.textContent = f.dataset.invalid; input.focus(); return; }
      f.classList.add('is-done');
      msg.innerHTML = '';
      const strong = document.createElement('strong'); strong.textContent = f.dataset.thanks;
      const small = document.createElement('span'); small.textContent = ' ' + f.dataset.thanksNote;
      msg.append(strong, small);
      input.value = '';
    });
    input.addEventListener('input', () => { if (f.classList.contains('is-invalid')) { f.classList.remove('is-invalid'); msg.textContent = ''; input.removeAttribute('aria-invalid'); } });
  }

  function reveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const targets = [...document.querySelectorAll('.teaser__body, .intro-block, .feature-card, .banner-split, .banner-caption, .xp-tile, .experience__head, .section > .container > .carousel__head')];
    targets.forEach(el => {
      el.classList.add('reveal');
      // stagger cards within the same grid
      const sibs = el.parentElement.querySelectorAll(':scope > .feature-card');
      if (el.classList.contains('feature-card')) el.style.setProperty('--d', [...sibs].indexOf(el) % 2 * 90 + 'ms');
    });
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach(el => io.observe(el));
  }

  // breakpoint split from the sitemap: <=1023px is the "mobile" experience
  const isMobile = matchMedia('(max-width: 1023px)');

  function tileLabels() {
    const set = () => document.querySelectorAll('[data-label-mobile]').forEach(el => {
      el.textContent = isMobile.matches ? el.dataset.labelMobile : el.dataset.labelDesktop;
    });
    set(); isMobile.addEventListener('change', set);
  }

  // QR code for the desktop -> phone handoff. Library is loaded only when needed.
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  let qrLoading;
  function drawQR() {
    const box = document.querySelector('[data-qr]'), urlEl = document.querySelector('[data-qr-url]');
    if (!box) return;
    const url = new URL('view.html', location.href).href;
    urlEl.textContent = url.replace(/^https?:\/\//, '');
    if (box.dataset.done === url) return;
    qrLoading = qrLoading || new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = QR_LIB; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
    qrLoading.then(() => {
      const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
      box.dataset.done = url;
    }).catch(() => { box.innerHTML = '<p class="overlay__note">QR code unavailable offline. Use the link below.</p>'; });
  }

  const init = () => { stickyHeader(); megaMenus(); overlays(); newsletter(); reveal(); tileLabels(); };
  document.documentElement.dataset.rendered ? init() : document.addEventListener('page:rendered', init, { once: true });
})();
