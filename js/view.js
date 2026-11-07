/* Kohler View: place KOHLER products in your bathroom with the phone camera (prototype, mobile only).
   Flow (Arnav's sitemap): intro -> "Allow kohler.com to use the camera?" -> Yes: AR tool
                                                                         -> No: offer Kohler Viz -> Continue | Not interested
   Desktop (>1023px) gets a QR handoff instead. Camera frames are never recorded or uploaded; a capture is saved to the
   device only when the user taps Save. If the camera is unavailable, a sample bathroom photo stands in. */
(() => {
  const UI = window.KohlerUI, FX = window.KohlerFixtures, T = FX.TYPES;
  const { esc, txt, attr } = UI;
  const root = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const isMobile = matchMedia('(max-width: 1023px)');
  const SAMPLE_ROOM = 'assets/images/Inspired-Banner-with-Image-version-3-and-4-aaf30563__KOHLER-Inspired-Banner-With-Image-variation-3-and-4-ML-Max.webp';
  const BG = 'assets/images/Large-Double-Featured-Content-Cards-aag77373__Large-Double-Featured-Content-Cards-Desktop.webp';
  const SIZE = { toilet: .42, vanity: .66, faucet: .22, tub: .84, shower: .46, mirror: .36 }; // share of screen width
  let chrome, D, stream = null, usingSample = false;
  const items = []; let selected = null, cat = 'toilet';

  const I = {
    x: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    cam: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="4"/></svg>'
  };
  const banner = () => `<div class="concept-banner" role="note">${txt(chrome.banner)}</div>`;
  const top = (light) => `<div class="view-top"><span class="logo">KOHLER</span><a class="icon-btn ${light ? '' : 'icon-btn--dark'}" href="./" aria-label="Close Kohler View">${I.x}</a></div>`;

  // ---------- screens ----------
  const SCREENS = {
    desktop() {
      document.body.classList.remove('view-page');
      return `${banner()}<main class="view-desktop"><div class="view-desktop__card">
        <div class="qr-code" data-qr role="img" aria-label="QR code that opens Kohler View on your phone"></div>
        <div><span class="badge badge--new">Mobile only</span>
          <h1 style="margin-top:var(--sp-s)">Kohler View</h1>
          <p class="t-title-l" style="color:var(--c-primary-800)">Kohler View uses your phone camera to place products in your bathroom. Scan this QR code on your phone to use it.</p>
          <p class="overlay__note">Or open <span class="qr-url" data-qr-url></span> on your phone.</p>
          <p style="display:flex;gap:var(--sp-m);flex-wrap:wrap;margin:0"><a class="link-underline" href="?demo=1">Preview on this device</a><a class="link-underline" href="viz.html">Try Kohler Viz instead</a><a class="link-underline" href="./">Back to kohler.com</a></p>
        </div></div></main>
        <footer class="app-footer"><div class="container">${txt(chrome.disclaimer)}</div></footer>`;
    },
    intro: () => `${banner()}<main class="view-screen">
        <div class="view-screen__bg"><img src="${BG}" alt=""></div>${top()}
        <h1>Kohler View</h1>
        <p>Kohler View uses your phone camera to place products in your bathroom.</p>
        <button class="btn btn--light" data-go="perm">Get Started</button>
        <p class="overlay__note" style="color:var(--c-gray-400)">Prototype. Sample products. Nothing is recorded or uploaded.</p>
      </main>`,
    perm: () => `${banner()}<main class="view-screen">
        <div class="view-screen__bg"><img src="${BG}" alt=""></div>${top()}
        <div class="perm-card" role="dialog" aria-labelledby="perm-h" aria-describedby="perm-d">
          <span style="color:var(--c-brand-600)">${I.cam}</span>
          <strong id="perm-h">Allow kohler.com to use the camera?</strong>
          <p id="perm-d" class="t-p-m">Kohler View needs your camera to show products in your room. Video stays on your phone.</p>
          <div class="perm-card__btns"><button class="btn btn--secondary btn--m" data-go="no">No</button><button class="btn btn--primary btn--m" data-act="allow">Yes</button></div>
        </div></main>`,
    no: () => `${banner()}<main class="view-screen">
        <div class="view-screen__bg"><img src="assets/images/Home-Page-Hero-Video-Full-Bleed-aaj61614__Home-Page-Hero-Video-Full-Bleed-Desktop.webp" alt=""></div>${top()}
        <span class="badge badge--new">Kohler Viz</span>
        <h1>We also have Kohler Viz</h1>
        <p>Describe or recreate your bathroom space and design your dream bathroom using AI. No camera needed.</p>
        <a class="btn btn--light" href="viz.html">Continue</a>
        <a class="btn btn--on-dark" href="./">Not Interested</a>
      </main>`,
    ar: () => `${banner()}<main class="ar" id="ar">
        ${usingSample ? `<img class="ar__feed" id="feed" src="${SAMPLE_ROOM}" alt="Sample bathroom (camera unavailable)">` : `<video class="ar__feed" id="feed" autoplay playsinline muted></video>`}
        <div class="ar__layer" id="layer" aria-label="Your room. Products you place appear here."></div>
        <div class="ar__top"><a class="icon-btn icon-btn--dark" href="./" data-act="exit" aria-label="Close Kohler View">${I.x}</a>
          <span class="ar__pill">${usingSample ? 'Sample room · camera unavailable' : 'Kohler View · live camera'}</span>
          <a class="ar__pill" href="viz.html">Kohler Viz</a></div>
        <div class="ar__hint" id="hint">Choose a product below to place it</div>
        <div class="ar__tools" id="tools" hidden>
          <button class="icon-btn icon-btn--dark" data-act="bigger" aria-label="Make bigger">${I.plus}</button>
          <button class="icon-btn icon-btn--dark" data-act="smaller" aria-label="Make smaller">${I.minus}</button>
          <button class="icon-btn icon-btn--dark" data-act="turn" aria-label="Rotate">${I.rotate}</button>
          <button class="icon-btn icon-btn--dark" data-act="delete" aria-label="Remove product">${I.trash}</button>
        </div>
        <div class="ar__flash" id="flash"></div>
        <section class="ar__sheet" aria-label="Products">
          <div class="ar__grab"></div>
          <div class="tabs" role="tablist" id="cats"></div>
          <div class="ar__products" id="prods"></div>
          <div class="ar__finish" id="finish"></div>
          <div class="ar__bottom"><span class="overlay__note" id="count">Drag to move · pinch to resize · twist to rotate</span>
            <button class="shutter" data-act="capture" aria-label="Capture this view"></button>
            <span class="overlay__note" style="text-align:right">Sample products</span></div>
        </section>
      </main>`
  };

  function show(name) {
    stopIfLeaving(name);
    document.body.classList.toggle('view-page', name !== 'desktop');
    root.innerHTML = SCREENS[name]();
    if (name === 'desktop') drawQR();
    if (name === 'ar') initAR();
    root.querySelector('h1, .perm-card strong')?.setAttribute('tabindex', '-1');
    root.querySelector('h1, .perm-card strong')?.focus();
  }
  function stopIfLeaving(name) { if (name !== 'ar' && stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

  async function allow() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      usingSample = false;
    } catch (e) { usingSample = true; }
    history.pushState({ s: 'ar' }, '', '#ar');
    show('ar');
    if (usingSample) toast('Camera unavailable, showing a sample room');
  }

  // ---------- AR ----------
  const products = type => D.collections[type].flatMap(c => c.products.map(p => ({ ...p, collection: c.name }))).slice(0, 8);
  function initAR() {
    const feed = document.getElementById('feed');
    // keep the prototype banner visible above the full-screen camera
    document.documentElement.style.setProperty('--banner-h', (document.querySelector('.concept-banner')?.offsetHeight || 0) + 'px');
    if (stream) feed.srcObject = stream;
    document.getElementById('cats').innerHTML = Object.keys(T).filter(t => !T[t].arch).map(t => `<button class="tab" role="tab" aria-selected="${t === cat}" data-cat="${t}">${txt(T[t].label)}</button>`).join('');
    renderProducts(); renderFinish(); items.forEach(drawItem);
    const layer = document.getElementById('layer');
    layer.addEventListener('pointerdown', e => { if (e.target === layer) select(null); });
  }
  function renderProducts() {
    document.getElementById('prods').innerHTML = products(cat).map(p => `<button class="ar-prod" data-add="${attr(p.id)}" data-type="${cat}">
      <span class="ar-prod__img" style="${fxVars(p.finishType, defaultFinish(p.finishType))}">${p.image ? `<span class="pimg"><img src="${attr(p.image)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('is-fallback')">${T[cat].front}</span>` : T[cat].front}</span><span>${txt(p.name)}</span></button>`).join('');
  }
  const defaultFinish = ft => (ft === 'metal' ? 'chrome' : 'white');
  const fxVars = (ft, fin) => {
    const list = FX.FINISHES[ft], f = list.find(x => x.id === fin) || list[0];
    return ft === 'metal' ? `--fx-metal:var(${f.var});--fx-body:var(--c-swatch-white)` : `--fx-body:var(${f.var});--fx-metal:var(--c-finish-chrome)`;
  };
  function renderFinish() {
    const el = document.getElementById('finish'), it = items.find(i => i.id === selected);
    if (!it) { el.innerHTML = ''; return; }
    const list = FX.FINISHES[it.finishType];
    if (it.cutout) { // real product photo: show the finishes it comes in (a photo can't be recoloured)
      const avail = (it.finishes || []).map(id => list.find(f => f.id === id)).filter(Boolean);
      el.innerHTML = `<span>Available in</span>${avail.map(f => `<span class="swatch swatch--l" style="background:var(${f.var})" title="${attr(f.label)}"></span>`).join('')}<span>${txt(it.sku || '')}</span>`;
      return;
    }
    el.innerHTML = `<span>Finish</span>${list.map(f => `<button style="background:var(${f.var})" aria-label="${attr(f.label)}" title="${attr(f.label)}" aria-pressed="${it.finish === f.id}" data-finish="${f.id}"></button>`).join('')}<span>${txt(list.find(f => f.id === it.finish).label)}</span>`;
  }
  function addProduct(pid, type) {
    const p = products(type).find(x => x.id === pid);
    const layer = document.getElementById('layer'), r = layer.getBoundingClientRect();
    const it = { id: 'i' + Date.now().toString(36), pid, type, name: p.name, sku: p.sku, cutout: p.cutout || null, finishes: p.finishes, finishType: p.finishType, finish: defaultFinish(p.finishType),
      x: r.width / 2, y: r.height * .42, s: 1, rot: 0, w: Math.round(r.width * SIZE[type]) };
    items.push(it); drawItem(it); select(it.id);
    document.getElementById('hint').style.opacity = 0;
  }
  function drawItem(it) {
    const layer = document.getElementById('layer'); let el = layer.querySelector(`[data-id="${it.id}"]`);
    if (!el) {
      el = document.createElement('div'); el.className = 'ar-item'; el.dataset.id = it.id; el.tabIndex = 0;
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', it.name + ', placed product. Select to adjust.');
      if (it.cutout) {
        // real KOHLER cut-out (transparent PNG from Kohler's image server, CORS-enabled so captures work)
        el.innerHTML = `<img class="ar-photo" src="${attr(it.cutout)}" crossorigin="anonymous" alt="" draggable="false">`;
        el.querySelector('img').addEventListener('error', () => { it.cutout = null; el.innerHTML = T[it.type].front; renderFinish(); }, { once: true });
      } else el.innerHTML = T[it.type].front;
      layer.append(el); gestures(el, it);
    }
    el.style.cssText = `--w:${it.w}px;${fxVars(it.finishType, it.finish)};transform:translate(${it.x - it.w / 2}px,${it.y - it.w / 2}px) rotate(${it.rot}deg) scale(${it.s})`;
    el.classList.toggle('is-selected', it.id === selected);
  }
  function select(id) {
    selected = id; items.forEach(drawItem);
    document.getElementById('tools').hidden = !id; renderFinish();
    document.getElementById('count').textContent = id ? 'Drag to move · pinch to resize · twist to rotate' : `${items.length} product${items.length === 1 ? '' : 's'} placed`;
  }
  function gestures(el, it) {
    const pts = new Map(); let start = null;
    const snap = () => { const a = [...pts.values()]; return { a, cx: a.reduce((s, p) => s + p.x, 0) / a.length, cy: a.reduce((s, p) => s + p.y, 0) / a.length,
      dist: a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0, ang: a.length > 1 ? Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x) * 180 / Math.PI : 0 }; };
    const begin = () => { const s = snap(); start = { ...s, x: it.x, y: it.y, s: it.s, rot: it.rot }; };
    el.addEventListener('pointerdown', e => { e.stopPropagation(); el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); select(it.id); el.classList.add('is-dragging'); begin(); });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = snap(); it.x = start.x + (s.cx - start.cx); it.y = start.y + (s.cy - start.cy);
      if (pts.size > 1 && start.dist) { it.s = Math.max(.3, Math.min(3, start.s * s.dist / start.dist)); it.rot = start.rot + (s.ang - start.ang); }
      drawItem(it);
    });
    const end = e => { pts.delete(e.pointerId); el.classList.remove('is-dragging'); if (pts.size) begin(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', e => {
      const k = e.key, mv = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[k];
      if (mv) { e.preventDefault(); it.x += mv[0]; it.y += mv[1]; } else if (k === '+' || k === '=') it.s = Math.min(3, it.s * 1.1);
      else if (k === '-') it.s = Math.max(.3, it.s / 1.1); else if (k === 'r' || k === 'R') it.rot += 15;
      else if (k === 'Delete' || k === 'Backspace') { remove(it.id); return; } else return;
      drawItem(it);
    });
    el.addEventListener('focus', () => select(it.id));
  }
  function remove(id) { const i = items.findIndex(x => x.id === id); if (i > -1) items.splice(i, 1); document.querySelector(`.ar-item[data-id="${id}"]`)?.remove(); select(null); }

  // capture: composite camera frame (or sample photo) + products onto a canvas, kept on the device
  function resolveVars(svg, el) {
    const cs = getComputedStyle(el); let out = svg, guard = 0;
    while (out.includes('var(') && guard++ < 10) out = out.replace(/var\((--[\w-]+)(?:,([^()]*))?\)/g, (m, name, fb) => cs.getPropertyValue(name).trim() || (fb || '').trim() || 'none');
    const vb = el.querySelector('svg').viewBox.baseVal, w = el.offsetWidth;
    return out.replace('<svg ', `<svg width="${w}" height="${Math.round(w * vb.height / vb.width)}" `);
  }
  async function capture() {
    const flash = document.getElementById('flash'); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    const layer = document.getElementById('layer'), feed = document.getElementById('feed'), r = layer.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1), c = document.createElement('canvas'); c.width = r.width * dpr; c.height = r.height * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const sw = feed.videoWidth || feed.naturalWidth, sh = feed.videoHeight || feed.naturalHeight;
    if (sw && sh) { const k = Math.max(r.width / sw, r.height / sh); g.drawImage(feed, (r.width - sw * k) / 2, (r.height - sh * k) / 2, sw * k, sh * k); }
    else { g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-primary-800'); g.fillRect(0, 0, r.width, r.height); }
    for (const it of items) {
      const el = layer.querySelector(`[data-id="${it.id}"]`), photo = el.querySelector('img.ar-photo');
      let im, w = it.w, h;
      if (photo && photo.complete && photo.naturalWidth) { im = photo; h = w * photo.naturalHeight / photo.naturalWidth; }
      else {
        const svgEl = el.querySelector('svg'), vb = svgEl.viewBox.baseVal;
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(resolveVars(svgEl.outerHTML, el));
        im = new Image(); await new Promise(res => { im.onload = res; im.onerror = res; im.src = src; });
        h = w * vb.height / vb.width;
      }
      g.save(); g.translate(it.x, it.y - it.w / 2 + h / 2); g.rotate(it.rot * Math.PI / 180); g.scale(it.s, it.s);
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18; g.shadowOffsetY = 12; g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
    }
    let url; try { url = c.toDataURL('image/jpeg', .9); } catch (e) { url = ''; }
    const names = items.map(i => i.name);
    document.getElementById('ar').insertAdjacentHTML('beforeend', `<div class="capture-sheet" role="dialog" aria-labelledby="cap-h"><div class="capture-sheet__card">
      <strong id="cap-h">Your bathroom with KOHLER</strong>
      ${url ? `<img src="${url}" alt="Captured view with placed products">` : ''}
      <p class="t-p-s" style="margin:0">${names.length ? txt(names.join(', ')) : 'No products placed yet.'}</p>
      <div class="capture-sheet__btns"><button class="btn btn--secondary btn--m" data-act="close-cap">Keep Designing</button>
        ${url ? `<a class="btn btn--primary btn--m" href="${url}" download="kohler-view.jpg">Save to Phone</a>` : ''}</div>
      <a class="link-underline" href="https://www.kohler.com/en/services/bathroom-design-services" style="justify-self:start">Talk to a Kohler designer</a>
    </div></div>`);
  }
  function toast(msg) {
    let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.classList.add('is-on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  // QR for desktop visitors
  function drawQR() {
    const box = document.querySelector('[data-qr]'), url = new URL('view.html', location.href).href;
    document.querySelector('[data-qr-url]').textContent = url.replace(/^https?:\/\//, '');
    const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    sc.onload = () => { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); };
    sc.onerror = () => { box.innerHTML = '<p class="overlay__note">QR code unavailable offline.</p>'; };
    document.head.append(sc);
  }

  // ---------- events ----------
  root.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'); if (go) { history.pushState({ s: go.dataset.go }, '', '#' + go.dataset.go); show(go.dataset.go); return; }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'allow') allow();
    const it = items.find(i => i.id === selected);
    if (it && a === 'bigger') { it.s = Math.min(3, it.s * 1.15); drawItem(it); }
    if (it && a === 'smaller') { it.s = Math.max(.3, it.s / 1.15); drawItem(it); }
    if (it && a === 'turn') { it.rot += 15; drawItem(it); }
    if (it && a === 'delete') remove(it.id);
    if (a === 'capture') capture();
    if (a === 'close-cap') e.target.closest('.capture-sheet').remove();
    if (a === 'exit') stopIfLeaving('');
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; document.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-selected', b === c)); renderProducts(); }
    const add = e.target.closest('[data-add]'); if (add) addProduct(add.dataset.add, add.dataset.type);
    const f = e.target.closest('[data-finish]'); if (f && it) { it.finish = f.dataset.finish; drawItem(it); renderFinish(); }
  });
  addEventListener('popstate', () => { const s = (location.hash || '#intro').slice(1); show(['intro', 'perm', 'no'].includes(s) ? s : 'intro'); });
  addEventListener('pagehide', () => stopIfLeaving(''));

  async function init() {
    try { [chrome, D] = await Promise.all(['content/chrome.json', 'content/viz.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); }))); }
    catch (e) { root.innerHTML = `<p class="render-error container">Could not load Kohler View. Run python serve.py.</p>`; return; }
    if (!isMobile.matches && !params.has('demo')) { show('desktop'); return; }
    const s = (location.hash || '').slice(1);
    show(['perm', 'no'].includes(s) ? s : 'intro');
  }
  init();
})();
