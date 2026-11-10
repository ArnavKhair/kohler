/* Kohler Viz: AI bathroom visualizer (prototype). Flow follows Arnav's Figma sitemap:
   intro -> Step 1 recreate (describe | floorplan) -> Step 2 collect (sets | pick your own + local nav)
   -> "See these in your bathroom" (mock generation) -> try another / save -> designers + stores.
   Rendering (see "V2 Kohler Viz Realistic Bathroom Render Plan"): the room is built as a stand-in 3D scene (js/scene3d.js),
   rendered from preset angles, and each layout image + the real product photos + a short role caption go to an
   image-editing model through the team's serverless function (content/ai-config.json -> proxyUrl). Without a proxyUrl
   it falls back to Pollinations (free, text-only). The 3D layout with real product cut-outs is the fallback. */
(() => {
  const UI = window.KohlerUI, FX = window.KohlerFixtures;
  const { esc, txt, attr } = UI;
  const T = FX.TYPES;
  const S3 = window.KohlerScene3D;
  const app = document.getElementById('app');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let D, chrome;
  // AI render settings (content/ai-config.json). Never holds the API key or the passcode.
  let CFG = { proxyUrl: '', imageSize: '1K', aspectRatio: '5:4', maxAngles: 4, concurrency: 2, timeoutMs: 120000, cooldownMs: 15000, dailyLimit: 40 };
  const useProxy = () => !!CFG.proxyUrl;

  // ---------- state (sessionStorage for the session; saved combinations in localStorage) ----------
  const ss = {
    get: (k, d) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const ls = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const EXAMPLE_PLAN = { w: 8, d: 10, items: [
    { id: 'p1', type: 'tub', x: 0, y: 0, r: 0 }, { id: 'p2', type: 'vanity', x: 5, y: 0, r: 0 }, { id: 'p3', type: 'toilet', x: 6, y: 3, r: 0 },
    { id: 'p4', type: 'door', wall: 's', pos: 4 }, { id: 'p5', type: 'window', wall: 'n', pos: 0 }, { id: 'p6', type: 'fan', wall: 'e', pos: 6 } ] };
  const fresh = () => ({ mode: 'describe', describe: { text: '', room: '', style: '', size: '', analyzed: false, types: [] },
    plan: JSON.parse(JSON.stringify(EXAMPLE_PLAN)), sets: [], picks: {}, activeSlot: null, activeCol: 0,
    finish: { metal: 'chrome', body: 'white' }, result: null });
  let S = Object.assign(fresh(), ss.get('kohler-viz', {}));
  // migrate older sessions: the mirror is now part of the vanity in the floorplan
  S.plan.items = (S.plan.items || []).filter(i => i.type !== 'mirror' && T[i.type]);
  S.describe.types = (S.describe.types || []).filter(t => t !== 'mirror');
  const save = () => ss.set('kohler-viz', S);
  let photos = []; // object URLs only, never persisted or uploaded

  // ---------- helpers ----------
  const icon = {
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>'
  };
  const finishVars = (ft) => {
    const m = FX.FINISHES.metal.find(f => f.id === S.finish.metal) || FX.FINISHES.metal[0];
    const b = FX.FINISHES.body.find(f => f.id === S.finish.body) || FX.FINISHES.body[0];
    return `--fx-metal:var(${m.var});--fx-body:var(${ft === 'metal' ? '--c-swatch-white' : b.var})`;
  };
  const allProducts = () => Object.entries(D.collections).flatMap(([type, cols]) => cols.flatMap(c => c.products.map(p => ({ ...p, type, collection: c.name }))));
  const product = id => allProducts().find(p => p.id === id);
  const sceneById = id => D.scenes.find(s => s.id === id) || D.scenes[0];
  // real KOHLER product photo (hotlinked from Kohler's image server); the drawing shows if the image fails to load
  const prodImg = (p, type) => p && p.image
    ? `<span class="pimg"><img src="${attr(p.image)}" alt="${attr(p.name)}" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('is-fallback')">${T[type].front}</span>`
    : T[type].front;
  const firstProduct = type => (D.collections[type] || [])[0]?.products[0];
  const swatchesFor = p => (p.finishes || []).map(id => FX.FINISHES[p.finishType].find(f => f.id === id)).filter(Boolean)
    .map(f => `<span class="swatch" style="background:var(${f.var})" title="${attr(f.label)}"></span>`).join('');

  // fixtures the user has today, as slots: [{key, type}]
  function fixtures() {
    let list;
    if (S.mode === 'floorplan') list = S.plan.items.filter(i => !T[i.type].arch).map(i => ({ key: i.id, type: i.type }));
    else list = S.describe.types.map(t => ({ key: 'd-' + t, type: t }));
    // a vanity comes with a faucet and a mirror (the mirror is combined with the vanity in Step 1)
    if (list.some(f => f.type === 'vanity')) {
      if (!list.some(f => f.type === 'faucet')) list.push({ key: 'auto-faucet', type: 'faucet' });
      if (!list.some(f => f.type === 'mirror')) list.push({ key: 'auto-mirror', type: 'mirror', label: 'Mirror (above vanity)' });
    }
    const count = {};
    return list.map(f => { count[f.type] = (count[f.type] || 0) + 1; return { ...f, n: count[f.type] }; })
      .map(f => ({ ...f, label: f.label || T[f.type].label + (list.filter(x => x.type === f.type).length > 1 ? ' ' + f.n : '') }));
  }
  const archSummary = () => {
    if (S.mode !== 'floorplan') return '';
    const c = {}; S.plan.items.filter(i => T[i.type].arch).forEach(i => { c[i.type] = (c[i.type] || 0) + 1; });
    const names = { door: ['door', 'doors'], window: ['window', 'windows'], fan: ['fan', 'fans'] };
    return Object.entries(c).map(([t, n]) => `${n} ${names[t][n > 1 ? 1 : 0]}`).join(', ');
  };
  const roomSummary = () => {
    const f = fixtures().filter(x => !x.key.startsWith('auto-'));
    const base = S.mode === 'floorplan' ? `${S.plan.w} × ${S.plan.d} ft room` : (S.describe.room || 'Your bathroom');
    const arch = archSummary();
    return `${base}${f.length ? ' · ' + f.map(x => x.label).join(', ') : ''}${arch ? ' · ' + arch : ''}`;
  };

  // ---------- chrome ----------
  const ROUTES = ['intro', 'step-1', 'step-2', 'sets', 'pick', 'result', 'saved'];
  const stepOf = r => ({ 'intro': 0, 'step-1': 1, 'step-2': 2, 'sets': 2, 'pick': 2, 'result': 3, 'saved': 3 }[r] || 0);
  function header(route) {
    const n = stepOf(route), labels = ['Recreate', 'Collect', 'See it'];
    return `<div class="concept-banner" role="note">${txt(chrome.banner)}</div>
    <header class="app-header"><div class="container app-header__inner">
      <a class="logo" href="./" aria-label="Back to kohler.com (prototype)">KOHLER</a>
      <span class="app-header__name">Kohler Viz</span>
      <ol class="progress" aria-label="Progress">${labels.map((l, i) => `<li data-n="${i + 1}"${n === i + 1 ? ' aria-current="step"' : ''}${n > i + 1 ? ' class="is-done"' : ''}>${l}</li>`).join('')}</ol>
      <a class="app-header__exit" href="./">${icon.x}<span>Exit</span></a>
    </div></header>`;
  }
  const footer = () => `<footer class="app-footer"><div class="container">${txt(chrome.disclaimer)}</div></footer>`;

  // ---------- screens ----------
  const SCREENS = {
    intro() {
      const c = D.copy.intro;
      return `<section class="screen container"><div class="intro">
        <div class="intro__media"><img src="${attr(D.scenes[0].image)}" alt="Bathroom designed with Kohler Viz (sample)"></div>
        <div class="intro__body">
          <span class="eyebrow">${txt(c.eyebrow)}</span>
          <h1>${txt(c.title)}</h1><p>${txt(c.desc)}</p>
          <ol class="steps-list">${c.steps.map(s => `<li>${txt(s)}</li>`).join('')}</ol>
          <a class="btn btn--primary" href="#/step-1">${txt(c.cta)}</a>
        </div></div></section>`;
    },

    'step-1'() {
      const c = D.copy.step1;
      const fp = S.mode === 'floorplan';
      return `<section class="screen container${fp ? ' screen--fit' : ''}">
        <div class="screen-head"><span class="eyebrow">${txt(c.eyebrow)}</span><h1>${txt(c.title)}</h1><p>${txt(c.desc)}</p></div>
        <div class="tabs" role="tablist" aria-label="How to recreate your bathroom">
          <button class="tab" role="tab" id="tab-describe" aria-controls="panel-mode" aria-selected="${S.mode === 'describe'}" data-act="mode" data-mode="describe">Describe it</button>
          <button class="tab" role="tab" id="tab-floorplan" aria-controls="panel-mode" aria-selected="${S.mode === 'floorplan'}" data-act="mode" data-mode="floorplan">Floorplan builder</button>
        </div>
        <div class="${fp ? 'fp-split' : ''}">
          <div id="panel-mode" class="mode-panel" role="tabpanel" aria-labelledby="tab-${S.mode}">${fp ? floorplanUI() : describeUI()}</div>
          ${fp ? preview3dUI() : ''}
        </div>
      </section>${actionBar(roomSummary(), `<button class="btn btn--primary btn--m" data-act="to-step2" ${canContinue() ? '' : 'disabled'}>Continue</button>`)}`;
    },

    'step-2'() {
      const c = D.copy.step2, f = fixtures();
      return `<section class="screen container">
        <button class="back-link" data-act="go" data-to="step-1">${icon.back} Step 1: Recreate your bathroom</button>
        <div class="screen-head"><span class="eyebrow">${txt(c.eyebrow)}</span><h1>${txt(c.title)}</h1><p>${txt(c.desc)}</p></div>
        <p class="result__room" style="margin:0 0 var(--sp-l)">Your bathroom: <strong>${txt(roomSummary())}</strong></p>
        <div class="choices">
          <button class="choice" data-act="go" data-to="sets">
            <span class="choice__media"><img src="${attr(D.scenes[1].image)}" alt=""></span>
            <span class="choice__body"><span class="choice__title">Explore Bathroom Sets</span>
              <span class="choice__desc">Start from a complete, coordinated set of faucets, toilets, showers and more.</span>
              <span class="link-underline">See ${D.sets.length} sets</span></span></button>
          <button class="choice" data-act="go" data-to="pick">
            <span class="choice__media choice__media--fx" style="${finishVars('body')}">${f.slice(0, 3).map(x => prodImg(firstProduct(x.type), x.type)).join('')}</span>
            <span class="choice__body"><span class="choice__title">Pick Your Own Products</span>
              <span class="choice__desc">Choose a product for each fixture in your room: ${txt(f.map(x => x.label.toLowerCase()).join(', '))}.</span>
              <span class="link-underline">Choose products</span></span></button>
        </div></section>`;
    },

    sets() {
      const sel = S.sets;
      return `<section class="screen container">
        <button class="back-link" data-act="go" data-to="step-2">${icon.back} Step 2</button>
        <div class="screen-head"><span class="eyebrow">Explore bathroom sets</span><h1>Choose a Bathroom Set</h1><p>Select one or more sets. Kohler Viz will place them in your bathroom.</p></div>
        <div class="set-grid">${D.sets.map(s => `
          <button class="set-card" aria-pressed="${sel.includes(s.id)}" data-act="toggle-set" data-id="${attr(s.id)}">
            <span class="check-dot">${icon.check}</span>
            <span class="set-card__media"><img src="${attr(sceneById(s.scene).image)}" alt=""></span>
            <span class="set-card__body">
              <span class="set-card__name">${txt(s.name)}</span>
              <span class="set-card__meta">${txt(s.collection)} · ${Object.keys(s.items).length} products · Sample set</span>
              <span class="choice__desc">${txt(s.desc)}</span>
              <span class="set-card__items">${Object.keys(s.items).map(t => `<span>${txt(T[t].label)}</span>`).join('')}</span>
            </span></button>`).join('')}
        </div></section>
        ${actionBar(sel.length ? `<strong>${sel.length} set${sel.length > 1 ? 's' : ''} selected</strong> · ${txt(sel.map(id => D.sets.find(s => s.id === id).name).join(', '))}` : 'Select at least one set',
          `<button class="btn btn--primary btn--m" data-act="see" data-path="sets" ${sel.length ? '' : 'disabled'}>See These in Your Bathroom</button>`)}`;
    },

    pick() {
      const f = fixtures(), chosen = f.filter(x => S.picks[x.key]).length;
      return `<section class="screen container">
        <button class="back-link" data-act="go" data-to="step-2">${icon.back} Step 2</button>
        <div class="screen-head"><span class="eyebrow">Pick your own products</span><h1>Choose a Product for Each Fixture</h1><p>These are the fixtures in your bathroom today. Select one to browse the collections available for it.</p></div>
        ${S.activeSlot ? localNav(f.find(x => x.key === S.activeSlot)) : ''}
        <div class="slots">${f.map(x => {
          const p = S.picks[x.key] && product(S.picks[x.key]);
          return `<button class="slot ${p ? 'is-filled' : ''}" data-act="slot" data-key="${attr(x.key)}" aria-expanded="${S.activeSlot === x.key}" style="${finishVars(p ? p.finishType : 'body')}">
            ${p ? prodImg(p, x.type) : T[x.type].front}<span class="slot__type">${txt(x.label)}</span>
            <span class="slot__hint">${p ? txt(p.name) : 'Choose a ' + txt(T[x.type].label.toLowerCase())}</span></button>`; }).join('')}
        </div></section>
        ${actionBar(`<strong>${chosen} of ${f.length}</strong> fixtures chosen`, `<button class="btn btn--primary btn--m" data-act="see" data-path="pick" ${chosen ? '' : 'disabled'}>See These in Your Bathroom</button>`)}`;
    },

    result() {
      const r = S.result; if (!r) return SCREENS['step-2']();
      const sc = sceneById(r.scene);
      let n = 0;
      const items = r.items.map(it => ({ ...it, p: product(it.pid), pin: sc.pins[it.type] })).map(it => ({ ...it, num: it.pin ? ++n : null }));
      return `<section class="screen container">
        <div class="screen-head"><span class="eyebrow">Kohler Viz</span><h1>${txt(D.copy.result.title)}</h1><p class="result__room">${txt(r.room)}</p></div>
        <div class="result">
          <div class="result__media" id="result-media">${mediaHTML(r)}</div>
          <aside class="result__side">
            <div class="panel"><p class="panel__title">In this design</p>
              <ul class="result__list">${items.map(i => `<li><span class="num ${i.num ? '' : 'num--off'}">${i.num || '·'}</span>
                <span class="thumb" style="${finishVars(i.p.finishType)}">${prodImg(i.p, i.type)}</span>
                <span><strong>${txt(i.p.name)}</strong>${txt(i.p.sku ? i.p.sku + ' · ' : '')}${txt(i.p.collection)}${i.num || S.mediaTab !== 'photo' ? '' : ' · not visible in the sample photo'}${i.p.pageUrl ? ` · <a class="text-btn" href="${attr(i.p.pageUrl)}" target="_blank" rel="noopener">kohler.com</a>` : ''}</span></li>`).join('')}</ul></div>
            <div class="panel"><p class="panel__title">Finish</p>
              <div class="ar__finish" style="padding:0">${FX.FINISHES.metal.map(f => `<button style="background:var(${f.var})" aria-label="${attr(f.label)}" title="${attr(f.label)}" aria-pressed="${S.finish.metal === f.id}" data-act="finish" data-kind="metal" data-id="${f.id}"></button>`).join('')}</div>
              <p class="overlay__note" style="margin-top:var(--sp-2xs)">Regenerate to render the new finish.</p></div>
          </aside>
        </div></section>
        ${actionBar('Like it? Save it, or try another combination.', `<button class="btn btn--secondary btn--m" data-act="regenerate" data-cooldown>${icon.spark}&nbsp;Regenerate</button><button class="btn btn--secondary btn--m" data-act="another">Try Another Combination</button><button class="btn btn--primary btn--m" data-act="save">Save Combination</button>`)}`;
    },

    saved() {
      const list = ls.get('kohler-viz-saved', []), last = list[0], c = D.copy.saved;
      if (!last) return SCREENS['step-2']();
      return `<section class="screen container">
        <div class="saved-hero">
          <div class="saved-hero__img"><img src="${attr(last.aiUrl || sceneById(last.scene).image)}" alt="" onerror="this.onerror=null;this.src='${attr(sceneById(last.scene).image)}'"></div>
          <div class="screen-head" style="margin:0"><span class="eyebrow">${icon.check} Saved to this browser</span><h1>${txt(c.title)}</h1>
            <p>${txt(last.items.length)} products · ${txt(last.room)}</p>
            <button class="text-btn" data-act="another" style="justify-self:start">Try another combination</button></div>
        </div>
        <div class="next-steps">
          <div class="next-step"><p>${txt(c.designers)}</p><a class="btn btn--light" href="${attr(c.designersHref)}">${txt(c.designersCta)}</a></div>
          <div class="next-step"><p>${txt(c.stores)}</p><button class="btn btn--on-dark" data-act="stores">${txt(c.storesCta)}</button></div>
        </div>
        ${list.length > 1 ? `<h2 class="panel__title" style="margin-top:var(--sp-2xl)">Your saved combinations</h2>
          <div class="saved-list">${list.map(s => `<div class="saved-item"><img src="${attr(s.aiUrl || sceneById(s.scene).image)}" alt="" onerror="this.onerror=null;this.src='${attr(sceneById(s.scene).image)}'"><strong>${txt(s.title)}</strong><span>${txt(s.items.length)} products · ${txt(new Date(s.date).toLocaleDateString())}</span></div>`).join('')}</div>` : ''}
      </section>`;
    }
  };

  const disclosure = () => txt(useProxy() ? D.copy.ai.disclosure : D.copy.ai.disclosureFree);
  const actionBar = (summary, btns) => `<div class="action-bar"><div class="container action-bar__inner">
      <div class="action-bar__summary">${summary}</div><div class="action-bar__btns">${btns}</div></div></div>`;

  // ---------- step 1: describe ----------
  function describeUI() {
    const d = S.describe;
    const chipRow = (key, list) => `<div class="chip-group">${list.map(v => `<button type="button" class="chip" aria-pressed="${d[key] === v}" data-act="pick-chip" data-key="${key}" data-val="${attr(v)}">${txt(v)}</button>`).join('')}</div>`;
    return `<div class="two-col">
      <div class="form-stack">
        <div class="field"><div class="field__row"><label for="desc">Describe your bathroom</label><button type="button" class="text-btn" data-act="example">Use an example</button></div>
          <textarea id="desc" placeholder="e.g. A guest bath with a toilet, a single vanity and a shower over the tub…">${esc(d.text)}</textarea></div>
        <div class="field"><span>Room type</span>${chipRow('room', D.roomTypes)}</div>
        <div class="field"><span>Size</span>${chipRow('size', D.sizes)}</div>
        <div class="field"><span>Style you like</span>${chipRow('style', D.styles)}</div>
        <div class="field"><span>Reference photos (optional)</span>
          <label class="dropzone" id="drop"><input type="file" accept="image/*" multiple id="photos">
            <span><strong>Add photos of your bathroom</strong> or inspiration</span><span class="overlay__note">${txt(useProxy() ? D.copy.ai.photoNote : D.copy.ai.photoNoteFree)}</span></label>
          <div class="thumbs">${photos.map((u, i) => `<figure><img src="${attr(u)}" alt="Reference photo ${i + 1}"><button type="button" data-act="rm-photo" data-i="${i}" aria-label="Remove photo">${icon.x}</button></figure>`).join('')}</div></div>
      </div>
      <div class="ai-box" id="ai-box" aria-live="polite">${aiBox()}</div>
    </div>`;
  }
  function aiBox(loading) {
    const d = S.describe;
    if (loading) return `<div class="ai-box__head"><span class="ai-dot"></span> Reading your description…</div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:70%"></div>`;
    if (!d.analyzed) return `<div class="ai-box__head">${icon.spark} What Kohler Viz understood</div>
      <p class="t-p-s" style="margin:0">Describe your bathroom and Kohler Viz will list the fixtures you have today. You can edit the list.</p>
      <button class="btn btn--primary btn--s" data-act="analyze" style="justify-self:start">Analyze My Bathroom</button>`;
    const missing = Object.keys(T).filter(t => !d.types.includes(t) && !['faucet', 'mirror'].includes(t) && !T[t].arch);
    return `<div class="ai-box__head">${icon.spark} Kohler Viz found ${d.types.length} fixture${d.types.length === 1 ? '' : 's'}</div>
      <div class="chip-group">${d.types.map(t => `<span class="fixture-chip" style="${finishVars('body')}">${T[t].top}${txt(T[t].label)}<button type="button" data-act="rm-type" data-type="${t}" aria-label="Remove ${attr(T[t].label)}">${icon.x}</button></span>`).join('')}
        ${missing.length ? `<select class="add-select" data-act="add-type" aria-label="Add a fixture"><option value="">+ Add fixture</option>${missing.map(t => `<option value="${t}">${txt(T[t].label)}</option>`).join('')}</select>` : ''}</div>
      <p class="overlay__note">${[d.room, d.size, d.style].filter(Boolean).map(esc).join(' · ') || 'Add a room type, size and style for a better match.'}</p>
      <button class="text-btn" data-act="analyze" style="justify-self:start">Analyze again</button>`;
  }
  const canContinue = () => fixtures().length > 0 || (S.mode === 'describe' && !S.describe.analyzed && S.describe.text.trim().length > 0);
  function analyze(then) {
    const box = document.getElementById('ai-box');
    box.innerHTML = aiBox(true);
    const text = ' ' + (document.getElementById('desc').value || '').toLowerCase() + ' ';
    S.describe.text = document.getElementById('desc').value;
    setTimeout(() => {
      const found = [...new Set(Object.entries(D.keywords).filter(([, words]) => words.some(w => text.includes(w))).map(([t]) => (t === 'mirror' ? 'vanity' : t)))];
      S.describe.types = found.length ? found : ['toilet', 'vanity'];
      S.describe.analyzed = true; save();
      if (then) then(); else route();
    }, reduce ? 0 : 1100);
  }

  // ---------- step 1: floorplan ----------
  // Fixtures are {id,type,x,y,r} on a 1-ft grid. Doors, windows and fans are wall-only: {id,type,wall:'n'|'e'|'s'|'w',pos}
  const dims = it => (it.r % 180 ? [T[it.type].d, T[it.type].w] : [T[it.type].w, T[it.type].d]);
  const isWall = it => !!T[it.type].wallOnly;
  const WALLS = ['n', 'e', 's', 'w'], WALL_NAME = { n: 'north', e: 'east', s: 'south', w: 'west' };
  const wallLen = w => (w === 'n' || w === 's' ? S.plan.w : S.plan.d);
  let selected = null;

  function floorplanUI() {
    const p = S.plan;
    const fixturesPal = Object.entries(T).filter(([k, t]) => !t.arch && !t.paletteHidden && k !== 'faucet');
    const wallPal = Object.entries(T).filter(([, t]) => t.arch);
    const pal = (list, meta) => list.map(([k, t]) => `
        <button type="button" class="palette-item${t.arch ? ' palette-item--wall' : ''}" data-type="${k}" style="${finishVars('body')}">${t.top}<span>${txt(t.label)}<br><span class="overlay__note">${meta(t)}</span></span></button>`).join('');
    return `<div class="fp">
      <div class="fp__palette"><p>Fixtures</p>${pal(fixturesPal, t => `${t.w}×${t.d} ft`)}
        <p class="fp__palette-group">Walls · snap to a wall</p><div class="fp__walls">${pal(wallPal, t => `${t.len} ft`)}</div></div>
      <div class="fp__stage">
        <div class="fp__toolbar">
          <div class="field"><label for="fp-w">Width (ft)</label><input id="fp-w" type="number" min="4" max="20" value="${p.w}" data-act="dim"></div>
          <div class="field"><label for="fp-d">Length (ft)</label><input id="fp-d" type="number" min="4" max="20" value="${p.d}" data-act="dim"></div>
          <span class="spacer"></span>
          <button type="button" class="text-btn" data-act="fp-example">Start from example</button>
          <button type="button" class="text-btn" data-act="fp-clear">Clear room</button>
        </div>
        <div class="fp__canvas"><div class="fp-room" id="room" style="width:calc(var(--cell) * ${p.w});height:calc(var(--cell) * ${p.d})" aria-label="Floorplan, ${p.w} by ${p.d} feet">
          <span class="fp-room__dim fp-room__dim--w">${p.w} ft</span><span class="fp-room__dim fp-room__dim--d">${p.d} ft</span>
          ${p.items.map(it => (isWall(it) ? wallButton(it) : fixtureButton(it))).join('')}
        </div></div>
        <div class="fp__inspector" aria-live="polite">${inspector()}</div>
      </div></div>`;
  }
  function fixtureButton(it) {
    const [w, d] = dims(it);
    return `<button type="button" class="fp-item" data-id="${it.id}" aria-pressed="${selected === it.id}" aria-label="${attr(T[it.type].label)} at ${it.x}, ${it.y}"
      style="left:calc(var(--cell) * ${it.x});top:calc(var(--cell) * ${it.y});width:calc(var(--cell) * ${w});height:calc(var(--cell) * ${d});${finishVars('body')}">
      <span style="position:absolute;left:50%;top:50%;width:calc(var(--cell) * ${T[it.type].w});height:calc(var(--cell) * ${T[it.type].d});transform:translate(-50%,-50%) rotate(${it.r}deg)">${T[it.type].top}</span>
      <span class="fp-item__label">${txt(T[it.type].label)}</span></button>`;
  }
  // wall items: drawings are authored for the north wall (wall on the top edge); rotated for the other walls
  function wallGeom(it) {
    const t = T[it.type], L = t.len, D = t.depth, p = S.plan;
    return { n: { x: it.pos, y: 0, w: L, h: D, rot: 0 }, s: { x: it.pos, y: p.d - D, w: L, h: D, rot: 180 },
             w: { x: 0, y: it.pos, w: D, h: L, rot: -90 }, e: { x: p.w - D, y: it.pos, w: D, h: L, rot: 90 } }[it.wall];
  }
  const wallStyle = it => { const g = wallGeom(it); return `left:calc(var(--cell) * ${g.x});top:calc(var(--cell) * ${g.y});width:calc(var(--cell) * ${g.w});height:calc(var(--cell) * ${g.h})`; };
  const wallInner = it => {
    const t = T[it.type], g = wallGeom(it);
    return `${it.type === 'fan' ? '' : `<span class="fp-wallgap fp-wallgap--${it.wall} fp-wallgap--${it.type}"></span>`}
      <span class="fp-wallart" style="width:calc(var(--cell) * ${t.len});height:calc(var(--cell) * ${t.depth});transform:translate(-50%,-50%) rotate(${g.rot}deg)">${t.top}</span>`;
  };
  const wallButton = it => `<button type="button" class="fp-item fp-item--wall" data-id="${it.id}" data-wall-item="${it.type}" aria-pressed="${selected === it.id}"
      aria-label="${attr(T[it.type].label)} on the ${WALL_NAME[it.wall]} wall, ${it.pos} ft along" style="${wallStyle(it)}">${wallInner(it)}</button>`;

  function inspector() {
    const it = S.plan.items.find(i => i.id === selected);
    const fx = S.plan.items.filter(i => !isWall(i)).length, wl = S.plan.items.length - fx;
    if (!it) return `<span>${fx} fixture${fx === 1 ? '' : 's'}, ${wl} wall item${wl === 1 ? '' : 's'}. Click or drag an item to add it. Select one, then <span class="kbd">←↑→↓</span> move, <span class="kbd">R</span> rotate, <span class="kbd">Del</span> remove.</span>`;
    if (isWall(it)) return `<strong>${txt(T[it.type].label)} · ${WALL_NAME[it.wall]} wall</strong><button class="btn btn--secondary btn--s" data-act="fp-rotate">${icon.rotate}&nbsp;Next wall</button><button class="btn btn--secondary btn--s" data-act="fp-remove">${icon.trash}&nbsp;Remove</button>`;
    return `<strong>${txt(T[it.type].label)}</strong><button class="btn btn--secondary btn--s" data-act="fp-rotate">${icon.rotate}&nbsp;Rotate</button><button class="btn btn--secondary btn--s" data-act="fp-remove">${icon.trash}&nbsp;Remove</button>`;
  }
  const cellPx = () => parseFloat(getComputedStyle(document.getElementById('room')).getPropertyValue('--cell')) || 44;
  const clampItem = it => {
    if (isWall(it)) { it.pos = Math.max(0, Math.min(wallLen(it.wall) - T[it.type].len, it.pos)); return; }
    const [w, d] = dims(it); it.x = Math.max(0, Math.min(S.plan.w - w, it.x)); it.y = Math.max(0, Math.min(S.plan.d - d, it.y));
  };
  // nearest wall to a point (feet, room coordinates) and the position along it
  function snapToWall(type, fx, fy) {
    const p = S.plan, dist = { n: fy, s: p.d - fy, w: fx, e: p.w - fx };
    const wall = WALLS.reduce((a, b) => (dist[b] < dist[a] ? b : a));
    const along = wall === 'n' || wall === 's' ? fx : fy;
    const it = { type, wall, pos: Math.round(along - T[type].len / 2) }; clampItem(it); return it;
  }
  function freeSpot(type) {
    if (T[type].wallOnly) {
      const L = T[type].len;
      for (const wall of WALLS) for (let pos = 0; pos <= wallLen(wall) - L; pos++) {
        if (!S.plan.items.some(o => isWall(o) && o.wall === wall && pos < o.pos + T[o.type].len && pos + L > o.pos)) return { wall, pos };
      }
      return { wall: 'n', pos: 0 };
    }
    const it = { type, r: 0, x: 0, y: 0 }, [w, d] = dims(it);
    for (let y = 0; y <= S.plan.d - d; y++) for (let x = 0; x <= S.plan.w - w; x++) {
      if (!S.plan.items.some(o => { if (isWall(o)) return false; const [ow, od] = dims(o); return x < o.x + ow && x + w > o.x && y < o.y + od && y + d > o.y; })) return { x, y };
    }
    return { x: 0, y: 0 };
  }
  function addItem(type, pos) {
    const id = 'p' + Date.now().toString(36);
    const it = T[type].wallOnly ? { id, type, ...(pos || freeSpot(type)) } : { id, type, r: 0, ...(pos || freeSpot(type)) };
    clampItem(it); S.plan.items.push(it); selected = id; save(); refreshPlan();
  }
  let refreshing = false;
  function refreshPlan() {
    const panel = document.getElementById('panel-mode'); if (!panel || refreshing) return;
    refreshing = true;
    try { panel.innerHTML = floorplanUI(); } finally { refreshing = false; }
    bindPlan(); fitPlan();
    const bar = document.querySelector('.action-bar__summary'); if (bar) bar.innerHTML = esc(roomSummary());
    const cont = document.querySelector('[data-act="to-step2"]'); if (cont) cont.disabled = !canContinue();
    schedule3D();
    if (selected) document.querySelector(`.fp-item[data-id="${selected}"]`)?.focus({ preventScroll: true });
  }
  function bindPlan() {
    const room = document.getElementById('room'); if (!room) return;
    room.querySelectorAll('.fp-item').forEach(el => {
      el.addEventListener('pointerdown', e => {
        const it = S.plan.items.find(i => i.id === el.dataset.id), c = cellPx(), r = room.getBoundingClientRect();
        selected = it.id; el.setPointerCapture(e.pointerId); el.classList.add('is-dragging');
        document.querySelector('.fp__inspector').innerHTML = inspector();
        let move;
        if (isWall(it)) {
          // wall items slide along walls and jump to whichever wall is nearest the pointer
          move = ev => {
            const sw = snapToWall(it.type, (ev.clientX - r.left) / c, (ev.clientY - r.top) / c);
            it.wall = sw.wall; it.pos = sw.pos; el.style.cssText = wallStyle(it); el.innerHTML = wallInner(it); schedule3D();
          };
        } else {
          const offX = e.clientX - (r.left + it.x * c), offY = e.clientY - (r.top + it.y * c);
          move = ev => {
            it.x = Math.round((ev.clientX - r.left - offX) / c); it.y = Math.round((ev.clientY - r.top - offY) / c); clampItem(it);
            el.style.left = `calc(var(--cell) * ${it.x})`; el.style.top = `calc(var(--cell) * ${it.y})`; schedule3D();
          };
        }
        const up = () => { el.removeEventListener('pointermove', move); el.classList.remove('is-dragging'); save(); refreshPlan(); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up, { once: true });
      });
      el.addEventListener('keydown', e => {
        const it = S.plan.items.find(i => i.id === el.dataset.id), k = e.key;
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
        if (mv) {
          e.preventDefault();
          if (isWall(it)) it.pos += (mv[0] || mv[1]); else { it.x += mv[0]; it.y += mv[1]; }
          clampItem(it); selected = it.id; save(); refreshPlan();
        } else if (k === 'r' || k === 'R') { e.preventDefault(); rotateSel(it.id); }
        else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSel(it.id); }
      });
    });
    // drag from palette (click also adds)
    document.querySelectorAll('.palette-item').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const type = btn.dataset.type; let ghost = null; const sx = e.clientX, sy = e.clientY;
        btn.setPointerCapture(e.pointerId);
        const move = ev => {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          if (!ghost) { ghost = document.createElement('div'); ghost.className = 'fp-ghost'; ghost.style.cssText = finishVars('body'); ghost.innerHTML = T[type].top; document.body.append(ghost); }
          ghost.style.left = ev.clientX - 28 + 'px'; ghost.style.top = ev.clientY - 28 + 'px';
        };
        const up = ev => {
          btn.removeEventListener('pointermove', move);
          if (!ghost) { addItem(type); return; }
          ghost.remove();
          const r = room.getBoundingClientRect(), c = cellPx(), pad = c; // allow drops just outside a wall
          if (ev.clientX > r.left - pad && ev.clientX < r.right + pad && ev.clientY > r.top - pad && ev.clientY < r.bottom + pad) {
            const fx = (ev.clientX - r.left) / c, fy = (ev.clientY - r.top) / c;
            if (T[type].wallOnly) { const sw = snapToWall(type, fx, fy); addItem(type, { wall: sw.wall, pos: sw.pos }); }
            else addItem(type, { x: Math.round(fx - T[type].w / 2), y: Math.round(fy - T[type].d / 2) });
          }
        };
        btn.addEventListener('pointermove', move); btn.addEventListener('pointerup', up, { once: true });
      });
      btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addItem(btn.dataset.type); } });
    });
  }
  function rotateSel(id = selected) {
    const it = S.plan.items.find(i => i.id === id); if (!it) return;
    if (isWall(it)) it.wall = WALLS[(WALLS.indexOf(it.wall) + 1) % 4]; else it.r = (it.r + 90) % 360;
    clampItem(it); selected = id; save(); refreshPlan();
  }
  function removeSel(id = selected) { S.plan.items = S.plan.items.filter(i => i.id !== id); delete S.picks[id]; selected = null; save(); refreshPlan(); }

  // ---------- step 2: local nav ----------
  function localNav(slot) {
    if (!slot) return '';
    const cols = D.collections[slot.type], ci = Math.min(S.activeCol, cols.length - 1), col = cols[ci];
    const f = fixtures(), idx = f.findIndex(x => x.key === slot.key), next = f.slice(idx + 1).find(x => !S.picks[x.key]) || f.find(x => !S.picks[x.key] && x.key !== slot.key);
    return `<div class="local-nav" role="region" aria-label="${attr(slot.label)} collections">
      <div class="local-nav__head"><span class="local-nav__title">${txt(slot.label)}: choose a collection</span>
        <span style="display:flex;gap:var(--sp-xs);align-items:center">${next ? `<button class="text-btn" data-act="slot" data-key="${attr(next.key)}">Next: ${txt(next.label)} →</button>` : ''}
        <button class="icon-btn" data-act="close-nav" aria-label="Close collections">${icon.x}</button></span></div>
      <div class="tabs" role="tablist">${cols.map((c, i) => `<button class="tab" role="tab" aria-selected="${i === ci}" data-act="col" data-i="${i}">${txt(c.name)}</button>`).join('')}</div>
      <div class="product-strip">${col.products.map(p => `
        <button class="product-card" aria-pressed="${S.picks[slot.key] === p.id}" data-act="choose" data-key="${attr(slot.key)}" data-id="${attr(p.id)}">
          <span class="product-card__img" style="${finishVars(p.finishType)}">${prodImg(p, slot.type)}</span>
          <span class="product-card__name">${txt(p.name)}</span>
          <span class="product-card__meta"><span>${txt(p.sku || 'Sample product')}</span><span class="swatches">${swatchesFor(p)}</span></span>
        </button>`).join('')}</div>
    </div>`;
  }

  // ---------- 3D layout scene (render plan Phase 1) ----------
  // One shared viewer; its canvas is re-mounted whenever the page re-renders. three.js loads on first use.
  let viewer = null, viewerP = null, view3d = 'overview', raf3d = 0;
  const getViewer = () => viewerP || (viewerP = S3.create().then(v => (viewer = v)).catch(e => { viewerP = null; throw e; }));
  const legend = () => Object.entries(S3.CODE).map(([t, c]) => `<span class="legend-dot"><i style="background:#${c.hex.toString(16).padStart(6, '0')}"></i>${txt(T[t].label.replace(' & mirror', ''))}</span>`).join('');
  function preview3dUI() {
    return `<aside class="viewfinder" id="scene3d-wrap" aria-label="3D view of your room">
      <div class="viewfinder__head"><h2 class="viewfinder__title">3D view</h2><button type="button" class="text-btn" data-act="export-3d">Export images</button></div>
      <div class="viewfinder__stage">
        <div class="viewfinder__canvas" id="scene3d"><p class="overlay__note">Loading the 3D view…</p></div>
        <div class="viewfinder__nav">
          <button type="button" class="viewfinder__arrow" data-act="cam3d-step" data-dir="-1" aria-label="Previous view">${icon.back}</button>
          <span id="scene3d-label" aria-live="polite">Overview</span>
          <button type="button" class="viewfinder__arrow viewfinder__arrow--next" data-act="cam3d-step" data-dir="1" aria-label="Next view">${icon.back}</button>
        </div>
      </div>
      <p class="scene3d__legend" title="The other views are the angles Kohler Viz renders">${legend()}</p>
    </aside>`;
  }
  const camList = v => [{ id: 'overview', label: 'Overview' }, ...v.cameras()];
  function camChips(v) {
    const el = document.getElementById('scene3d-label'); if (!el) return;
    const list = camList(v), i = Math.max(0, list.findIndex(c => c.id === view3d));
    el.textContent = `${list[i].label}${view3d === 'overview' ? ' · drag to turn' : ''} · ${i + 1}/${list.length}`;
    document.getElementById('scene3d')?.classList.toggle('is-orbit', view3d === 'overview');
  }
  // size the floorplan grid so the whole editor fits above the action bar (desktop)
  function fitPlan() {
    const cv = document.querySelector('.screen--fit .fp__canvas'), room = document.getElementById('room'); if (!cv || !room) return;
    if (innerWidth < 1024) { room.style.removeProperty('--cell'); return; }
    let top = 0; for (let e = cv; e; e = e.offsetParent) top += e.offsetTop; // offsets ignore the entry animation's transform
    const bar = document.querySelector('.action-bar')?.offsetHeight || 0, insp = document.querySelector('.fp__inspector')?.offsetHeight || 0;
    const cs = getComputedStyle(cv), padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const availH = innerHeight - top - bar - insp - padV - 6 - 10, availW = cv.clientWidth - padH - 10; // stage gap + breathing room (dimension labels sit in the padding)
    const cell = Math.max(16, Math.min(44, Math.floor(Math.min(availH / S.plan.d, availW / S.plan.w))));
    room.style.setProperty('--cell', cell + 'px');
  }
  async function mount3d() {
    const el = document.getElementById('scene3d'); if (!el) return;
    try {
      const v = await getViewer(); if (!el.isConnected) return;
      el.innerHTML = ''; v.setPlan(S.plan);
      if (!v.cameras().some(c => c.id === view3d)) view3d = 'overview';
      v.mount(el); v.show(view3d); camChips(v);
    } catch (e) { el.innerHTML = '<p class="overlay__note">The 3D preview needs WebGL and an internet connection (three.js loads from jsDelivr).</p>'; }
  }
  // editing the plan updates the 3D view on the next frame
  function schedule3D() {
    if (!viewer || !document.getElementById('scene3d')) return;
    cancelAnimationFrame(raf3d);
    raf3d = requestAnimationFrame(() => { viewer.setPlan(S.plan); if (!viewer.cameras().some(c => c.id === view3d)) view3d = 'overview'; viewer.show(view3d); camChips(viewer); });
  }

  // describe mode has no floorplan: lay the described fixtures out against the walls of a typical room
  function autoPlan() {
    const size = S.describe.size || '', small = /^Small/.test(size) || S.describe.room === 'Powder room';
    const [w, d] = small ? [6, 7] : /^Large/.test(size) ? [10, 12] : [8, 10];
    const plan = { w, d, items: [{ id: 'a-door', type: 'door', wall: 's', pos: Math.floor(w / 2 - 1.5) }, { id: 'a-window', type: 'window', wall: 'n', pos: Math.floor(w / 2 - 1.5) }] };
    const keep = [{ x: plan.items[0].pos, y: d - 3, w: 3, h: 3 }]; // keep the door swing clear
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const order = ['tub', 'shower', 'vanity', 'toilet'];
    fixtures().filter(f => !f.key.startsWith('auto-') && order.includes(f.type)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).forEach(f => {
      const sym = f.type === 'tub' || f.type === 'shower';
      for (const [wall, r0] of [['n', 0], ['e', 90], ['w', 270], ['s', 180]]) {
        const r = f.type === 'tub' ? (wall === 'n' || wall === 's' ? 90 : 0) : sym ? 0 : r0;
        const [fw, fd] = dims({ type: f.type, r });
        const along = wall === 'n' || wall === 's' ? w - fw : d - fd;
        for (let a = 0; a <= along; a++) {
          const rect = { x: wall === 'e' ? w - fw : wall === 'w' ? 0 : a, y: wall === 's' ? d - fd : wall === 'n' ? 0 : a, w: fw, h: fd };
          if (keep.some(k => hit(k, rect))) continue;
          keep.push(rect); plan.items.push({ id: f.key, type: f.type, x: rect.x, y: rect.y, r }); return;
        }
      }
    });
    return plan;
  }
  const planForScene = () => (S.mode === 'floorplan' ? S.plan : autoPlan());
  // which product goes on which stand-in: scene keys are fixture ids plus 'auto-mirror' / 'auto-faucet' on the first vanity
  function assignKeys(plan, items) {
    const keys = [];
    plan.items.filter(i => !T[i.type].arch && S3.CODE[i.type]).forEach(i => {
      keys.push({ key: i.id, type: i.type });
      if (i.type === 'vanity' && !keys.some(k => k.key === 'auto-mirror')) keys.push({ key: 'auto-mirror', type: 'mirror' }, { key: 'auto-faucet', type: 'faucet' });
    });
    const out = {};
    items.forEach(it => { if (it.key && keys.some(k => k.key === it.key)) out[it.key] = it.pid; });
    items.filter(it => !Object.values(out).includes(it.pid)).forEach(it => { const k = keys.find(k => k.type === it.type && !out[k.key]); if (k) out[k.key] = it.pid; });
    return out;
  }

  // export dialog: the colour-coded layout and depth image for each preset camera, plus the scene data (plan Phase 1)
  async function exportDialog() {
    let v; try { v = await getViewer(); } catch (e) { toast('The 3D preview could not load'); return; }
    const plan = planForScene(); v.setPlan(plan);
    const files = v.cameras().flatMap(c => [
      { name: `kohler-viz-${c.id}-layout.png`, label: `${c.label} · layout`, url: v.exportImage(c.id, { mode: 'layout' }) },
      { name: `kohler-viz-${c.id}-depth.png`, label: `${c.label} · depth`, url: v.exportImage(c.id, { mode: 'depth' }) }]);
    const data = { room: { w: plan.w, d: plan.d, ceiling: FX.SIZE3D.ceiling, units: 'ft' }, items: plan.items,
      cameras: v.cameras().map(c => ({ id: c.id, label: c.label, fov: c.fov, position: c.pos.toArray(), lookAt: c.look.toArray(), phrase: c.phrase })), layout: S3.describeLayout(plan) };
    files.push({ name: 'kohler-viz-scene.json', label: 'Scene data (JSON)', url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 1)) });
    v.setPlan(S.plan); v.show(view3d);
    openDialog('ov-export', `<h2 class="overlay__title">Layout images</h2>`, `
      <p class="overlay__text">${files.length - 1} images, 5:4, one layout and one depth render per preset camera.</p>
      <div class="export-grid">${files.map(f => `<a class="export-item" href="${attr(f.url)}" download="${attr(f.name)}">${f.url.startsWith('data:image') ? `<img src="${attr(f.url)}" alt="">` : '<span class="export-item__json">{ }</span>'}<span>${txt(f.label)}</span></a>`).join('')}</div>
      <button type="button" class="btn btn--primary btn--m" data-dl-all>Download All</button>`, d => {
      d.querySelector('[data-dl-all]').addEventListener('click', () => [...d.querySelectorAll('.export-item')].forEach((a, i) => setTimeout(() => a.click(), i * 250)));
    });
  }
  function openDialog(id, head, body, bind) {
    document.getElementById(id)?.remove();
    const d = document.createElement('dialog'); d.className = 'overlay overlay--center'; d.id = id;
    d.innerHTML = `<div class="overlay__panel"><div class="overlay__head">${head}<button type="button" class="icon-btn" data-close aria-label="Close">${icon.x}</button></div>${body}</div>`;
    document.body.append(d);
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    bind && bind(d); d.showModal(); d.classList.add('is-open'); return d;
  }

  // ---------- generate / result / save ----------
  function buildResult(path) {
    let items = [], scene;
    if (path === 'sets') {
      const sets = S.sets.map(id => D.sets.find(s => s.id === id));
      sets.forEach(s => Object.entries(s.items).forEach(([type, pid]) => { if (!items.some(i => i.type === type)) items.push({ type, pid }); }));
      scene = sets[0].scene; S.finish = { ...sets[0].finish };
    } else {
      items = fixtures().filter(x => S.picks[x.key]).map(x => ({ key: x.key, type: x.type, pid: S.picks[x.key] }));
      const types = items.map(i => i.type);
      const score = sc => types.filter(t => sc.pins[t]).length + (S.describe.room === 'Powder room' && sc.id === 'powder' ? .5 : 0);
      scene = [...D.scenes].sort((a, b) => score(b) - score(a))[0].id;
    }
    // seed 0 = the first render of this room + products, so identical requests hit the cache; Regenerate bumps it
    S.result = { path, items, scene, room: roomSummary(), seed: 0, ai: null }; S.mediaTab = null; save();
  }

  // ---------- AI render ----------
  // AI images are large data URLs, so they live in memory only (lost on reload; the 3D layout is shown instead)
  const aiStore = new Map(), standinStore = new Map(), standinTried = new Set();
  const akey = (r, id) => `${r.seed}|${id}`;
  const plain = name => name.replace(/^(Claude™|Veil™|Purist®|Artifacts®|Components®|Underscore®|Castia®|Essential|Verdera™)\s*/, '').replace(/[®™]/g, '').trim();
  const metalLabel = () => (FX.FINISHES.metal.find(f => f.id === S.finish.metal) || FX.FINISHES.metal[0]).label.toLowerCase();
  const TYPE_WORD = { toilet: 'toilet', vanity: 'vanity with sink', mirror: 'mirror', faucet: 'sink faucet', tub: 'bathtub', shower: 'shower fixtures' };
  const pass = {
    get: () => { try { return sessionStorage.getItem('kohler-viz-pass') || ''; } catch (e) { return ''; } },
    set: v => { try { v ? sessionStorage.setItem('kohler-viz-pass', v) : sessionStorage.removeItem('kohler-viz-pass'); } catch (e) {} }
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const daily = { used: () => { const d = ls.get('kohler-viz-ai-day', {}); return d.day === today() ? d.n : 0; }, add: () => ls.set('kohler-viz-ai-day', { day: today(), n: daily.used() + 1 }) };

  // Image 1 is the layout (or the user's photo); Images 2+ are the product photos. The caption only assigns roles.
  function buildCaption(cam, plan, refs, photoMode) {
    const metal = metalLabel(), style = (S.describe.style || 'modern').toLowerCase();
    const roles = refs.map((p, i) => `Image ${i + 2} is the ${TYPE_WORD[p.type]} (KOHLER ${plain(p.name)}${p.finishType === 'metal' ? ', ' + metal + ' finish' : ''})${photoMode ? '' : `, shown as the ${S3.CODE[p.type].name} block`}`);
    if (photoMode) return `Image 1 is a photo of the user's own bathroom. Keep the same room, camera angle, walls, floor, window and lighting. Replace the matching fixtures in the photo with these KOHLER products, keeping their shape and finish: ${roles.join('; ')}. Photorealistic, no people, no text, no watermark.`;
    return `Image 1 is a 3D layout of ${/^(8|11|18)$/.test(String(plan.w)) ? 'an' : 'a'} ${plan.w} by ${plan.d} foot bathroom with an 8 foot ceiling. Keep the exact camera angle, room shape, door and window, and keep every object where it is, at the same size. The coloured blocks are stand-ins: replace each one with the real product. ${roles.join('. ')}. Layout: ${S3.describeLayout(plan).join('; ')}. ${cam.phrase} Make it a photorealistic ${style} bathroom with painted walls, a tiled floor and soft natural daylight. No coloured blocks, no people, no text, no logos, no watermark.`;
  }
  // free fallback (render plan Phase 0): text only, but with wall placement and a camera phrase
  function buildPrompt(r, plan, cam) {
    const metal = metalLabel();
    const things = r.items.map(it => { const p = product(it.pid); return (p.finishType === 'metal' ? metal + ' ' : '') + plain(p.name).toLowerCase(); });
    const style = (S.describe.style || 'modern').toLowerCase();
    const room = S.mode === 'floorplan' ? `${plan.w} by ${plan.d} foot bathroom` : `${(S.describe.room || 'bathroom').toLowerCase()}${S.describe.size ? ', ' + S.describe.size.replace(/\s*\(.*\)/, '').toLowerCase() : ''}`;
    const layout = plan ? ' Layout: ' + S3.describeLayout(plan).join(', ') + '.' : '';
    const extra = S.mode === 'describe' && S.describe.text ? ' The room: ' + S.describe.text.slice(0, 200) : '';
    return `Photorealistic interior photograph of a ${style} ${room}, featuring ${things.join(', ')}.${layout}${cam ? ' ' + cam.phrase : ''}${extra} Soft natural light, high detail, no people, no text, no logos, no watermark.`;
  }
  const freeUrl = (r, prompt) => `${D.copy.ai.endpoint}${encodeURIComponent(prompt)}?width=1024&height=820&model=${D.copy.ai.model}&nologo=true&private=true&seed=${r.seed}`;
  const COOLDOWN = () => (useProxy() ? CFG.cooldownMs : 40000); // Pollinations' free tier: about one image per 40 s
  const aiCooldown = () => Math.max(0, (ls.get('kohler-viz-ai-next', 0) || 0) - Date.now());
  const setNext = ms => ls.set('kohler-viz-ai-next', Date.now() + ms);
  // Pollinations rejects browser fetch() (Turnstile), but plain <img> loads work; keep a reference so it stays cached
  const aiImgs = [];
  const loadFree = url => new Promise(res => {
    const im = new Image(); aiImgs.push(im);
    const t = setTimeout(() => { im.src = ''; res('timeout'); }, D.copy.ai.timeoutMs);
    im.onload = () => { clearTimeout(t); res(im.naturalWidth ? 'ok' : 'error'); };
    im.onerror = () => { clearTimeout(t); res('error'); };
    im.src = url;
  });
  async function callProxy(body) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), CFG.timeoutMs);
    try {
      const res = await fetch(CFG.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Passcode': pass.get() }, body: JSON.stringify(body), signal: ctl.signal });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) return { error: 'auth' };
      if (res.status === 429) return { error: 'limit' };
      if (!res.ok || !j.image || !j.image.data) return { error: 'error', message: j.error };
      return { src: `data:${j.image.mimeType || 'image/png'};base64,${j.image.data}`, cached: !!j.cached };
    } catch (e) { return { error: 'error' }; } finally { clearTimeout(t); }
  }
  // the user's first photo, downscaled to a JPEG (only sent after consent)
  const photoData = () => new Promise(res => {
    const im = new Image();
    im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      res({ mimeType: 'image/jpeg', data: c.toDataURL('image/jpeg', .85).split(',')[1] }); };
    im.onerror = () => res(null); im.src = photos[0];
  });
  const refImage = p => p.image.replace(/wid=\d+/, 'wid=1000');
  // run tasks with a small concurrency limit
  async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); })); }

  // The AI runs in the background while the result page is open. Each angle starts as 'pending' and shows a loading
  // state in its tab; finished angles can be viewed while the rest are still rendering.
  let aiRun = null, aiWait = 0;
  function startAI() {
    const r = S.result, token = {}; aiRun = token;
    const live = () => aiRun === token && S.result === r;
    const update = () => { if (live()) { save(); refreshResult(); } };
    r.ai = { engine: useProxy() ? 'proxy' : 'free', photo: false, angles: [], preparing: true };
    (async () => {
      const plan = planForScene(), assign = assignKeys(plan, r.items), gate = r.gate || {};
      let v = null; try { v = await getViewer(); } catch (e) {}
      if (!live()) return;
      const cams = v ? v.setPlan(plan, Object.keys(assign)).slice(0, CFG.maxAngles) : [];
      const photoMode = useProxy() && gate.photo && photos.length > 0;
      const angles = photoMode ? [{ id: 'photo', label: 'Your photo' }] : cams.map(c => ({ id: c.id, label: c.label }));
      if (!v && !useProxy()) angles.push({ id: 'free', label: 'AI render' });
      // stand-in layout image + projected product boxes for every 3D angle (loading backdrop, fallback, Phase 3 overlay)
      if (v) angles.forEach(a => {
        if (a.id === 'photo') return;
        a.boxes = v.project(a.id).filter(b => assign[b.key]).map(b => ({ key: b.key, pid: assign[b.key], box: b.box }));
        standinStore.set(akey(r, a.id), v.exportImage(a.id, { mode: 'layout', width: 1024 }));
      });
      const ai = { engine: r.ai.engine, photo: !!photoMode, angles };
      if (ai.engine === 'free') { angles.forEach((a, i) => Object.assign(a, i ? { status: 'standin', reason: 'standin' } : { status: 'pending' })); }
      else if (!gate.pass) angles.forEach(a => Object.assign(a, { status: 'standin', reason: 'nopass' }));
      else angles.forEach(a => { a.status = 'pending'; });
      ai.targets = angles.filter(a => a.status === 'pending').length;
      r.ai = ai; update();

      if (ai.engine === 'free') {
        // one AI view (the first angle); the others show the 3D layout
        const first = angles[0]; if (!first) return;
        let wait = aiCooldown();
        while (wait > 0 && live()) { aiWait = Math.ceil(wait / 1000); waitText(); await new Promise(z => setTimeout(z, Math.min(1000, wait))); wait = aiCooldown(); }
        aiWait = 0; waitText();
        const url = freeUrl(r, buildPrompt(r, v ? plan : null, cams[0])), t0 = Date.now(), status = await loadFree(url);
        setNext(COOLDOWN());
        Object.assign(first, status === 'ok' ? { status: 'ok', src: url, ms: Date.now() - t0 } : { status: 'failed', reason: status === 'timeout' ? 'error' : 'limit' });
        return update();
      }
      if (!gate.pass) return;
      const layoutPhoto = photoMode ? await photoData() : null;
      let authFailed = false;
      await pool(angles, CFG.concurrency, async a => {
        if (!live()) return;
        if (authFailed) { Object.assign(a, { status: 'failed', reason: 'auth' }); return update(); }
        if (daily.used() >= CFG.dailyLimit) { Object.assign(a, { status: 'failed', reason: 'daily' }); return update(); }
        const cam = cams.find(c => c.id === a.id);
        const visible = a.boxes ? a.boxes.map(b => b.pid) : Object.values(assign);
        const refs = [...new Set(photoMode ? r.items.map(i => i.pid) : visible)].map(product).filter(p => p && p.image).slice(0, 9);
        const body = { caption: buildCaption(cam, plan, refs, photoMode),
          layout: photoMode ? layoutPhoto : { mimeType: 'image/png', data: standinStore.get(akey(r, a.id)).split(',')[1] },
          products: refs.map(p => ({ role: p.type, name: p.name, sku: p.sku, url: refImage(p) })),
          aspectRatio: CFG.aspectRatio, imageSize: CFG.imageSize, variant: r.seed, view: a.id };
        if (!body.layout) { Object.assign(a, { status: 'failed', reason: 'error' }); return update(); }
        const t0 = Date.now();
        let res = await callProxy(body);
        if (res.error === 'error' && live()) res = await callProxy(body); // retry once, then fall back to the 3D layout
        if (res.src) { aiStore.set(akey(r, a.id), res.src); if (!res.cached) daily.add(); Object.assign(a, { status: 'ok', ms: Date.now() - t0, cached: res.cached }); }
        else { if (res.error === 'auth') { authFailed = true; pass.set(''); } Object.assign(a, { status: 'failed', reason: res.error }); }
        update();
      });
      if (live()) setNext(COOLDOWN());
    })().catch(() => {}).finally(() => {
      if (aiRun !== token) return;
      aiRun = null; aiWait = 0;
      if (S.result === r) { settleInterrupted(); save(); refreshResult(); }
    });
  }
  // anything still 'pending' without a running job (reload, crash) becomes a failed angle with a clear message
  function settleInterrupted() {
    const r = S.result; if (!r || !r.ai || aiRun) return false;
    const stale = r.ai.preparing || r.ai.angles.some(a => a.status === 'pending');
    if (r.ai.preparing) r.ai = { engine: r.ai.engine, angles: [], interrupted: true };
    r.ai.angles.forEach(a => { if (a.status === 'pending') Object.assign(a, { status: 'failed', reason: 'interrupted' }); });
    return stale;
  }
  // the free model's cooldown countdown, updated in place
  function waitText() {
    const el = document.querySelector('.render__loading strong[data-wait]');
    if (el) el.textContent = aiWait ? `Waiting for the free AI model… ${aiWait}s` : D.copy.ai.rendering;
  }
  // re-render only the media column, so the page does not jump while angles arrive
  function refreshResult() {
    if (!location.hash.startsWith('#/result') || !S.result) return;
    const m = document.getElementById('result-media'); if (!m) return;
    m.innerHTML = mediaHTML(S.result); cooldownButton(); ensureStandins();
  }

  function mediaHTML(r) {
    const c = D.copy.ai, sc = sceneById(r.scene), ai = r.ai || { angles: [], interrupted: true }, angles = ai.angles;
    let n = 0;
    const items = r.items.map(it => ({ ...it, p: product(it.pid), pin: sc.pins[it.type] })).map(it => ({ ...it, num: it.pin ? ++n : null }));
    const tab = S.mediaTab === 'photo' || (!angles.length && !ai.preparing) ? 'photo' : ((angles.find(a => a.id === S.mediaTab) || angles[0] || {}).id || 'preparing');
    const a = angles.find(x => x.id === tab), img = angleImage(r, a), pending = !!(a && a.status === 'pending');
    const msg = ai.preparing || pending ? '' : ai.interrupted ? c.interrupted : !a ? (tab === 'photo' && angles.length ? '' : c.failed) : img.lost ? c.lost : img.ai ? '' : c[a.reason] || c.failed;
    // Phase 3: real product cut-outs laid over the image at each product's projected position
    const overlayOn = img.ai ? S.overlayAi === true : S.overlayStandin !== false;
    const boxes = (a && !pending && a.boxes) || [];
    const typeOf = pid => (r.items.find(i => i.pid === pid) || {}).type;
    const inView = [...new Set(((a && a.boxes) || []).map(b => b.pid))].map(product).filter(Boolean);
    const cutouts = overlayOn ? [...boxes].sort((x, y) => y.box.w * y.box.h - x.box.w * x.box.h).map(b => {
      const p = product(b.pid);
      return p && p.cutout ? `<img class="cutout" src="${attr(p.cutout)}" alt="" loading="lazy" onerror="this.remove()" style="left:${(b.box.x * 100).toFixed(2)}%;top:${(b.box.y * 100).toFixed(2)}%;width:${(b.box.w * 100).toFixed(2)}%;height:${(b.box.h * 100).toFixed(2)}%">` : '';
    }).join('') : '';
    const loading = (label, wait) => `<div class="render__loading" role="status"><span class="spinner" aria-hidden="true"></span><strong${wait ? ' data-wait' : ''}>${txt(label)}</strong><span>${txt(c.renderingHint)}</span></div>`;
    let media;
    if (tab === 'photo') media = `<div class="render" id="render"><img src="${attr(sc.image)}" alt="Sample photo with the selected products marked">
        ${items.filter(i => i.num).map(i => `<button class="pin" style="left:${i.pin[0]}%;top:${i.pin[1]}%;animation-delay:${200 + i.num * 120}ms" data-act="pin" data-num="${i.num}" aria-expanded="false" aria-label="${attr(i.num + ': ' + i.p.name)}">${i.num}</button>`).join('')}
        <span class="render__label">${txt(D.copy.result.label)}</span></div>`;
    else if (tab === 'preparing') media = `<div class="render render--angle is-loading">${loading(c.preparing)}</div>`;
    else if (pending) media = `<div class="render render--angle is-loading">${img.src ? `<img src="${attr(img.src)}" alt="">` : ''}${loading(aiWait ? `Waiting for the free AI model… ${aiWait}s` : c.rendering, true)}</div>`;
    else media = `<div class="render render--angle" id="render">${img.src ? `<img src="${attr(img.src)}" alt="${attr((img.ai ? 'AI-generated illustration of your bathroom, ' : '3D layout of your bathroom, ') + a.label.toLowerCase())}">` : '<div class="render__empty skeleton"></div>'}
        ${cutouts}<span class="render__label">${txt(img.ai ? c.label : c.standinLabel)}</span></div>
      ${boxes.length ? `<label class="overlay-toggle"><input type="checkbox" data-act="overlay" data-kind="${img.ai ? 'ai' : 'standin'}" ${overlayOn ? 'checked' : ''}> ${txt(c.overlayLabel)}</label>` : ''}`;
    const left = angles.filter(x => x.status === 'pending').length, total = ai.targets || 0;
    const progress = ai.preparing ? `<div class="render-progress" role="status"><span>${txt(c.preparing)}</span><div class="render-progress__bar"><span style="width:8%"></span></div></div>`
      : left ? `<div class="render-progress" role="status"><span><strong>${total - left} of ${total} angles ready.</strong> ${txt(total - left ? c.readyHint : c.renderingHint)}</span><div class="render-progress__bar"><span style="width:${Math.max(8, (total - left) / total * 100)}%"></span></div></div>` : '';
    return `<div class="tabs media-tabs" role="tablist" aria-label="Preview angle">
        ${angles.map(x => `<button class="tab${x.status === 'pending' ? ' is-pending' : ''}" role="tab" aria-selected="${tab === x.id}" data-act="media" data-tab="${attr(x.id)}">${txt(x.label)}${x.status === 'pending' ? '<span class="tab-spin" aria-label=" (rendering)"></span>' : ''}</button>`).join('')}
        ${ai.preparing ? `<button class="tab is-pending" role="tab" aria-selected="${tab === 'preparing'}" disabled>${txt(c.preparingTab)}<span class="tab-spin" aria-hidden="true"></span></button>` : ''}
        <button class="tab" role="tab" aria-selected="${tab === 'photo'}" data-act="media" data-tab="photo">Sample photo</button>
      </div>
      ${progress}
      ${msg ? `<p class="ai-note ai-note--warn">${txt(msg)}</p>` : ''}
      ${media}
      ${inView.length && tab !== 'photo' ? `<div class="view-strip" aria-label="Real products in this view">${inView.map(p => `<span class="view-strip__item" style="${finishVars(p.finishType)}">${prodImg(p, typeOf(p.id))}<span>${txt(plain(p.name))}</span></span>`).join('')}</div>` : ''}
      <p class="ai-note">${disclosure()}</p>`;
  }
  // results restored after a reload: rebuild the 3D layout images (the AI images are gone)
  async function ensureStandins() {
    const r = S.result; if (!r || !r.ai || aiRun) return;
    const miss = r.ai.angles.filter(a => a.id !== 'photo' && a.id !== 'free' && !standinStore.has(akey(r, a.id)) && !standinTried.has(akey(r, a.id)));
    if (!miss.length) return;
    miss.forEach(a => standinTried.add(akey(r, a.id)));
    try {
      const v = await getViewer(), plan = planForScene(); v.setPlan(plan, Object.keys(assignKeys(plan, r.items)));
      miss.forEach(a => { if (v.cameras().some(c => c.id === a.id)) standinStore.set(akey(r, a.id), v.exportImage(a.id, { mode: 'layout', width: 1024 })); });
      if (location.hash.startsWith('#/result')) route(true);
    } catch (e) {}
  }
  // passcode + photo consent, asked before anything is sent (null = dialog dismissed)
  function gate() {
    if (!useProxy()) return Promise.resolve({ pass: false, photo: false });
    const needPass = !pass.get(), canPhoto = S.mode === 'describe' && photos.length > 0, c = D.copy.ai;
    if (!needPass && !canPhoto) return Promise.resolve({ pass: true, photo: false });
    return new Promise(resolve => {
      let answer = null;
      const d = openDialog('ov-gate', `<h2 class="overlay__title">${txt(c.gateTitle)}</h2>`, `<form class="gate" novalidate>
        ${needPass ? `<div class="field"><label for="gate-pass">${txt(c.gatePass)}</label><input id="gate-pass" type="password" autocomplete="off"><span class="overlay__note">${txt(c.gatePassHelp)}</span></div>` : ''}
        ${canPhoto ? `<label class="gate__consent"><input type="checkbox" id="gate-photo"><span>${txt(c.gateConsent)}<br><span class="overlay__note">${txt(c.gateConsentHelp)}</span></span></label>` : ''}
        <p class="overlay__note">${txt(c.disclosure)}</p>
        <div class="gate__btns"><button type="button" class="btn btn--secondary btn--m" data-gate="skip">${txt(c.gateSkip)}</button><button type="submit" class="btn btn--primary btn--m">${txt(c.gateGo)}</button></div></form>`, dlg => {
        dlg.querySelector('[data-gate="skip"]').addEventListener('click', () => { answer = { pass: false, photo: false }; dlg.close(); });
        dlg.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          const input = dlg.querySelector('#gate-pass');
          if (input) { const v = input.value.trim(); input.closest('.field').classList.toggle('field--error', !v); if (!v) { input.focus(); return; } pass.set(v); }
          answer = { pass: true, photo: !!dlg.querySelector('#gate-photo')?.checked }; dlg.close();
        });
        dlg.addEventListener('close', () => resolve(answer));
      });
      d.querySelector('input')?.focus();
    });
  }
  async function beginGenerate() {
    const g = await gate(); if (!g) return;
    S.result.gate = g; S.mediaTab = null; startAI(); save();
    if (location.hash.startsWith('#/result')) route(true); else location.hash = '#/result';
  }
  let cdTimer;
  function cooldownButton() {
    clearInterval(cdTimer);
    const btn = document.querySelector('[data-cooldown]'); if (!btn) return;
    const label = `${icon.spark}&nbsp;Regenerate`;
    const tickCd = () => {
      const sec = Math.ceil(aiCooldown() / 1000), busy = !!aiRun;
      btn.disabled = busy || sec > 0; btn.innerHTML = busy ? `${icon.spark}&nbsp;Rendering…` : sec > 0 ? `${icon.spark}&nbsp;Regenerate in ${sec}s` : label;
      if (!busy && !sec) clearInterval(cdTimer);
    };
    tickCd(); cdTimer = setInterval(tickCd, 1000);
  }
  // the image for an angle: AI render if we have it, otherwise the 3D layout
  function angleImage(r, a) {
    if (!a) return {};
    const ai = a.status === 'ok' ? (r.ai.engine === 'free' ? a.src : aiStore.get(akey(r, a.id))) : null;
    return { ai, src: ai || standinStore.get(akey(r, a.id)) || (a.id === 'photo' ? photos[0] : null), lost: a.status === 'ok' && !ai };
  }
  // small JPEG copy for saved combinations (localStorage is small)
  const thumb = src => new Promise(res => {
    if (!src || !src.startsWith('data:')) return res(src || null);
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * im.naturalHeight / im.naturalWidth); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .8)); };
    im.onerror = () => res(null); im.src = src;
  });
  async function saveCombo() {
    const list = ls.get('kohler-viz-saved', []);
    const r = S.result, title = r.path === 'sets' ? S.sets.map(id => D.sets.find(s => s.id === id).name).join(' + ') : 'My product picks';
    const angles = (r.ai && r.ai.angles) || [], best = angles.find(a => angleImage(r, a).ai) || angles[0];
    const img = await thumb(best && angleImage(r, best).src);
    list.unshift({ id: Date.now(), date: Date.now(), title, scene: r.scene, room: r.room, items: r.items.map(i => i.pid), aiUrl: img });
    if (!ls.set('kohler-viz-saved', list.slice(0, 6))) ls.set('kohler-viz-saved', list.slice(0, 6).map((x, i) => (i ? { ...x, aiUrl: null } : x)));
    toast('Combination saved to this browser');
    location.hash = '#/saved';
  }
  function toast(msg) {
    let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.classList.add('is-on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  // store finder: reuse the site's store dialog markup from render.js
  function storeDialog() {
    let d = document.getElementById('ov-store');
    if (!d) {
      const tpl = document.createElement('template'); tpl.innerHTML = UI.header(chrome);
      d = tpl.content.getElementById('ov-store'); document.body.append(d);
      d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
      d.querySelector('.store-form').addEventListener('submit', () => {
        const input = d.querySelector('input'), ok = input.value.trim().length > 1;
        input.closest('.field').classList.toggle('field--error', !ok);
        d.querySelector('.store-results').hidden = !ok; if (!ok) input.focus();
      });
    }
    d.showModal(); d.classList.add('is-open'); d.querySelector('input').focus();
  }

  // ---------- events ----------
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const a = el.dataset.act;
    if (a === 'go') location.hash = '#/' + el.dataset.to;
    if (a === 'mode') { S.mode = el.dataset.mode; save(); route(); }
    if (a === 'pick-chip') { const k = el.dataset.key; S.describe[k] = S.describe[k] === el.dataset.val ? '' : el.dataset.val; S.describe.text = document.getElementById('desc').value; save(); route(); }
    if (a === 'example') { document.getElementById('desc').value = D.describeExample; S.describe.text = D.describeExample; save(); const c = document.querySelector('[data-act="to-step2"]'); if (c) c.disabled = !canContinue(); }
    if (a === 'analyze') analyze();
    if (a === 'rm-type') { S.describe.types = S.describe.types.filter(t => t !== el.dataset.type); save(); route(); }
    if (a === 'rm-photo') { URL.revokeObjectURL(photos[el.dataset.i]); photos.splice(+el.dataset.i, 1); route(); }
    if (a === 'to-step2') {
      S.describe.text = document.getElementById('desc')?.value ?? S.describe.text; save();
      // describing without analysing first: run the (mock) analysis, then continue
      if (S.mode === 'describe' && !S.describe.analyzed) { el.disabled = true; el.textContent = 'Analyzing…'; document.getElementById('ai-box').scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); analyze(() => { location.hash = '#/step-2'; }); }
      else location.hash = '#/step-2';
    }
    if (a === 'fp-rotate') rotateSel();
    if (a === 'fp-remove') removeSel();
    if (a === 'fp-example') { S.plan = JSON.parse(JSON.stringify(EXAMPLE_PLAN)); selected = null; save(); refreshPlan(); }
    if (a === 'fp-clear') { S.plan.items = []; selected = null; save(); refreshPlan(); }
    if (a === 'toggle-set') { const id = el.dataset.id; S.sets = S.sets.includes(id) ? S.sets.filter(x => x !== id) : [...S.sets, id]; save(); route(true); }
    if (a === 'slot') { S.activeSlot = S.activeSlot === el.dataset.key ? null : el.dataset.key; S.activeCol = 0; save(); route(true); if (S.activeSlot) document.querySelector('.local-nav')?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
    if (a === 'close-nav') { S.activeSlot = null; save(); route(true); }
    if (a === 'col') { S.activeCol = +el.dataset.i; save(); route(true); }
    if (a === 'choose') { const k = el.dataset.key; S.picks[k] = S.picks[k] === el.dataset.id ? undefined : el.dataset.id; if (!S.picks[k]) delete S.picks[k]; save(); route(true); }
    if (a === 'see') { buildResult(el.dataset.path); beginGenerate(); }
    if (a === 'regenerate') { S.result.seed = (S.result.seed || 0) + 1; save(); beginGenerate(); }
    if (a === 'cam3d-step' && viewer) { const list = camList(viewer), i = list.findIndex(c => c.id === view3d); view3d = list[(i + +el.dataset.dir + list.length) % list.length].id; viewer.show(view3d); camChips(viewer); }
    if (a === 'export-3d') exportDialog();
    if (a === 'media') { S.mediaTab = el.dataset.tab; save(); refreshResult(); }
    if (a === 'another') { aiRun = null; S.sets = []; S.picks = {}; S.activeSlot = null; S.result = null; save(); location.hash = '#/step-2'; }
    if (a === 'save') { el.disabled = true; saveCombo(); }
    if (a === 'stores') storeDialog();
    if (a === 'finish') { S.finish[el.dataset.kind] = el.dataset.id; save(); route(true); }
    if (a === 'pin') {
      const open = el.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.pin').forEach(p => p.setAttribute('aria-expanded', 'false')); document.querySelector('.pin-tip')?.remove();
      if (!open) {
        const it = S.result.items.filter(i => sceneById(S.result.scene).pins[i.type])[+el.dataset.num - 1], p = product(it.pid);
        el.setAttribute('aria-expanded', 'true');
        const lx = parseFloat(el.style.left), side = lx < 25 ? ' pin-tip--left' : lx > 75 ? ' pin-tip--right' : '';
        el.insertAdjacentHTML('afterend', `<div class="pin-tip${side}" style="left:${el.style.left};top:${el.style.top}"><strong>${txt(p.name)}</strong>${txt(p.sku || '')} · ${txt(p.collection)}${p.pageUrl ? `<br><a class="text-btn" href="${attr(p.pageUrl)}" target="_blank" rel="noopener">View on kohler.com</a>` : ''}</div>`);
      }
    }
  });
  app.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.act === 'overlay') { S[el.dataset.kind === 'ai' ? 'overlayAi' : 'overlayStandin'] = el.checked; save(); refreshResult(); return; }
    if (el.dataset.act === 'add-type' && el.value) { S.describe.types.push(el.value); save(); route(); }
    if (el.dataset.act === 'dim') { S.plan.w = Math.max(4, Math.min(20, +document.getElementById('fp-w').value || 8)); S.plan.d = Math.max(4, Math.min(20, +document.getElementById('fp-d').value || 10)); S.plan.items.forEach(clampItem); save(); refreshPlan(); }
    if (el.id === 'photos') { [...el.files].slice(0, 6 - photos.length).forEach(f => photos.push(URL.createObjectURL(f))); route(); }
  });
  app.addEventListener('input', e => { if (e.target.id === 'desc') { S.describe.text = e.target.value; save(); const c = document.querySelector('[data-act="to-step2"]'); if (c) c.disabled = !canContinue(); } });
  app.addEventListener('dragover', e => { const z = e.target.closest('.dropzone'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
  app.addEventListener('dragleave', e => e.target.closest('.dropzone')?.classList.remove('is-over'));
  app.addEventListener('drop', e => { const z = e.target.closest('.dropzone'); if (!z) return; e.preventDefault(); [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')).slice(0, 6 - photos.length).forEach(f => photos.push(URL.createObjectURL(f))); route(); });

  // ---------- router ----------
  function route(keepScroll) {
    let r = (location.hash.replace(/^#\/?/, '') || 'intro').split('?')[0];
    if (r === 'generate') r = 'result'; // old links
    if (!ROUTES.includes(r)) r = 'intro';
    const needsRoom = ['step-2', 'sets', 'pick', 'result'];
    if (needsRoom.includes(r) && !fixtures().length) r = 'step-1';
    if (r === 'result' && !S.result) r = 'step-2';
    if (r === 'saved' && !ls.get('kohler-viz-saved', []).length) r = 'step-2';
    const y = scrollY;
    document.getElementById('app-header').innerHTML = header(r);
    app.innerHTML = SCREENS[r]();
    document.title = 'Kohler Viz | prototype';
    if (keepScroll) { scrollTo(0, y); app.querySelectorAll('.screen').forEach(s => s.style.animation = 'none'); }
    else { scrollTo(0, 0); app.querySelector('h1')?.focus?.(); }
    if (r === 'step-1' && S.mode === 'floorplan') { bindPlan(); fitPlan(); mount3d(); }
    if (r === 'result') { cooldownButton(); ensureStandins(); }
  }

  async function init() {
    try {
      [chrome, D] = await Promise.all(['content/chrome.json', 'content/viz.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); })));
    } catch (e) { app.innerHTML = `<div class="container render-error">Could not load Kohler Viz (${esc(e.message)}). Run <code>python serve.py</code> and open http://localhost:8000/viz.html</div>`; return; }
    // ai-config.local.json (git-ignored, local preview only) overrides ai-config.json, e.g. to point at a local proxy
    for (const u of ['content/ai-config.json', 'content/ai-config.local.json']) {
      try { const res = await fetch(u); if (res.ok) CFG = { ...CFG, ...(await res.json()) }; } catch (e) {}
    }
    document.getElementById('app-footer').innerHTML = footer();
    addEventListener('hashchange', () => route());
    addEventListener('resize', () => { fitPlan(); });
    if (settleInterrupted()) save();
    route();
  }
  init();
})();
