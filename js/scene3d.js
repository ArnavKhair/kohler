/* Kohler Viz: stand-in 3D layout scene (render plan, Phase 1).
   Builds a simple three.js room from the floorplan data: walls with door and window openings, colour-coded stand-ins
   for each fixture (sized from fixtures.js SIZE3D), and preset cameras (from the door, from the far wall, close-ups).
   It exports 5:4 images per camera: a colour-coded "layout" render (sent to the image model as Image 1) and a depth
   render. It also projects each product's 3D box into an image, so the real product cut-out can be laid over the
   AI result (Phase 3).
   Units: 1 three.js unit = 1 ft. Plan x -> X (east), plan y -> Z (south), Y is up. A fixture's back is local -Z.
   three.js is loaded on demand from jsDelivr (pinned version); everything else here is plain JS. */
(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  const FX = window.KohlerFixtures, T = FX.TYPES, Z3 = FX.SIZE3D;
  let THREE = null, loading = null;
  const load = () => loading || (loading = import(THREE_URL).then(m => (THREE = m)));

  // one flat colour per product type; the caption names these colours so the model can map photos to stand-ins
  const CODE = {
    toilet: { hex: 0xf08a24, name: 'orange' }, vanity: { hex: 0x2f6fdb, name: 'blue' }, mirror: { hex: 0x8e44ad, name: 'purple' },
    faucet: { hex: 0xf4c430, name: 'yellow' }, tub: { hex: 0x27ae60, name: 'green' }, shower: { hex: 0xd64545, name: 'red' }
  };
  const ARCH = { wall: 0xe8e6e1, floor: 0xb9b4aa, ceiling: 0xf4f3f0, frame: 0x8a6d4b, glass: 0xbfe3ff, fan: 0xffffff, bg: 0xd9d6cf };
  const WALL_T = 0.33, ASPECT = 5 / 4, EYE = 5.3;
  const PRIORITY = ['vanity', 'tub', 'shower', 'toilet'];
  const LABEL = { vanity: 'Vanity', tub: 'Bathtub', shower: 'Shower', toilet: 'Toilet' };

  const fpDims = it => (it.r % 180 ? [T[it.type].d, T[it.type].w] : [T[it.type].w, T[it.type].d]);

  // ---------------------------------------------------------------- scene building
  function buildScene(plan) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ARCH.bg);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(plan.w * 0.3, 14, plan.d * 0.15); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-6, 6, plan.d + 6); scene.add(fill);

    const mat = (hex, extra) => new THREE.MeshLambertMaterial({ color: hex, ...extra });
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, .01), Math.max(h, .01), Math.max(d, .01)), m);
    const H = Z3.ceiling, W = plan.w, D = plan.d;
    const walls = { n: new THREE.Group(), s: new THREE.Group(), e: new THREE.Group(), w: new THREE.Group() };
    const corners = [];

    // floor + ceiling
    const floor = box(W, .05, D, mat(ARCH.floor)); floor.position.set(W / 2, -.025, D / 2); scene.add(floor);
    const ceil = box(W + 2 * WALL_T, .05, D + 2 * WALL_T, mat(ARCH.ceiling)); ceil.position.set(W / 2, H + .025, D / 2); scene.add(ceil);

    // walls with openings. "along" runs west->east on n/s walls and north->south on e/w walls
    const wallMat = mat(ARCH.wall), frameMat = mat(ARCH.frame), glassMat = mat(ARCH.glass, { transparent: true, opacity: .55, emissive: 0x6f9ec2, emissiveIntensity: .35 });
    const place = (side, a0, a1, y0, y1, depth, m, inset = 0) => {
      const len = a1 - a0, mid = (a0 + a1) / 2, h = y1 - y0, b = (side === 'n' || side === 's') ? box(len, h, depth, m) : box(depth, h, len, m);
      const off = WALL_T / 2 - inset;
      if (side === 'n') b.position.set(mid, y0 + h / 2, -off);
      if (side === 's') b.position.set(mid, y0 + h / 2, D + off);
      if (side === 'w') b.position.set(-off, y0 + h / 2, mid);
      if (side === 'e') b.position.set(W + off, y0 + h / 2, mid);
      walls[side].add(b); return b;
    };
    ['n', 's', 'e', 'w'].forEach(side => {
      const L = side === 'n' || side === 's' ? W : D;
      const opens = plan.items.filter(i => i.wall === side && (i.type === 'door' || i.type === 'window'))
        .map(i => ({ a: Math.max(0, i.pos), b: Math.min(L, i.pos + T[i.type].len), type: i.type,
          y0: i.type === 'door' ? 0 : Z3.window.sill, y1: i.type === 'door' ? Z3.door.h : Z3.window.top }))
        .sort((p, q) => p.a - q.a);
      let cur = 0;
      opens.forEach(o => {
        if (o.a < cur) return; // overlapping openings: keep the first
        if (o.a > cur) place(side, cur, o.a, 0, H, WALL_T, wallMat);
        if (o.y0 > 0) place(side, o.a, o.b, 0, o.y0, WALL_T, wallMat);
        place(side, o.a, o.b, o.y1, H, WALL_T, wallMat);
        // trim around the opening, and glass for windows
        place(side, o.a, o.b, o.y1, o.y1 + .15, WALL_T + .06, frameMat);
        place(side, o.a - .12, o.a, o.y0, o.y1 + .15, WALL_T + .06, frameMat);
        place(side, o.b, o.b + .12, o.y0, o.y1 + .15, WALL_T + .06, frameMat);
        if (o.type === 'window') { place(side, o.a, o.b, o.y0 - .1, o.y0, WALL_T + .12, frameMat); place(side, o.a, o.b, o.y0, o.y1, .04, glassMat); }
        cur = o.b;
      });
      if (cur < L) place(side, cur, L, 0, H, WALL_T, wallMat);
      // exhaust fans: a small grille high on the wall
      plan.items.filter(i => i.wall === side && i.type === 'fan').forEach(i => {
        place(side, i.pos + .1, i.pos + T.fan.len - .1, Z3.fan.top - Z3.fan.h, Z3.fan.top, .08, mat(ARCH.fan), WALL_T / 2 + .04);
      });
      scene.add(walls[side]);
    });
    [[-1, -1, 'n', 'w'], [1, -1, 'n', 'e'], [-1, 1, 's', 'w'], [1, 1, 's', 'e']].forEach(([sx, sz, a, b]) => {
      const c = box(WALL_T, H, WALL_T, wallMat);
      c.position.set(sx < 0 ? -WALL_T / 2 : W + WALL_T / 2, H / 2, sz < 0 ? -WALL_T / 2 : D + WALL_T / 2);
      c.userData.walls = [a, b]; scene.add(c); corners.push(c);
    });

    // fixtures. parts[key] = meshes of one product (used for projection); key matches Kohler Viz's slot keys
    const parts = {}, fixtures = [];
    const tag = (key, type, mesh) => { (parts[key] = parts[key] || { type, meshes: [] }).meshes.push(mesh); return mesh; };
    const cmat = (type, shade = 1) => { const c = new THREE.Color(CODE[type].hex); c.multiplyScalar(shade); return mat(c); };
    let firstVanity = true;
    plan.items.filter(i => !T[i.type].arch && CODE[i.type]).forEach(it => {
      const [fw, fd] = [T[it.type].w, T[it.type].d], [W2, D2] = fpDims(it);
      const g = new THREE.Group(); g.position.set(it.x + W2 / 2, 0, it.y + D2 / 2); g.rotation.y = -(it.r || 0) * Math.PI / 180;
      const back = -fd / 2, add = (key, type, mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(tag(key, type, mesh)); return mesh; };
      const z = Z3[it.type] || {};
      if (it.type === 'toilet') {
        const m = cmat('toilet');
        add(it.id, 'toilet', box(Math.min(z.w, fw) * .95, z.h - 1.2, .6, m), 0, 1.2 + (z.h - 1.2) / 2, back + .35);
        add(it.id, 'toilet', box(.9, 1.2, .5, m), 0, .6, back + .5);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.62, .45, z.seat, 24), m); bowl.scale.z = 1.35;
        add(it.id, 'toilet', bowl, 0, z.seat / 2, back + .65 + .84);
      } else if (it.type === 'vanity') {
        const sw = Math.min(z.w, fw), sd = Math.min(z.d, fd);
        add(it.id, 'vanity', box(sw, z.h - .15, sd, cmat('vanity')), 0, (z.h - .15) / 2, back + sd / 2);
        add(it.id, 'vanity', box(sw + .06, .15, sd + .04, cmat('vanity', 1.15)), 0, z.h - .075, back + sd / 2);
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .03, 24), cmat('vanity', .55)); basin.scale.z = .7;
        add(it.id, 'vanity', basin, 0, z.h + .005, back + sd / 2 + .1);
        // the mirror and faucet slots belong to the first vanity (Kohler Viz adds them as "auto-" slots)
        const mk = firstVanity ? 'auto-mirror' : it.id + '-mirror', fk = firstVanity ? 'auto-faucet' : it.id + '-faucet'; firstVanity = false;
        const mz = Z3.mirror;
        add(mk, 'mirror', box(Math.min(mz.w, sw * .85), mz.h, .08, cmat('mirror')), 0, mz.bottom + mz.h / 2, back + .04);
        const fm = cmat('faucet');
        add(fk, 'faucet', new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, Z3.faucet.h, 16), fm), 0, z.h + Z3.faucet.h / 2, back + .3);
        add(fk, 'faucet', box(.1, .08, .42, fm), 0, z.h + Z3.faucet.h - .04, back + .48);
      } else if (it.type === 'tub') {
        const sw = Math.min(z.w, fw), sd = Math.min(z.d, fd), t = .25, m = cmat('tub');
        add(it.id, 'tub', box(sw, .5, sd, cmat('tub', .75)), 0, .25, 0);
        add(it.id, 'tub', box(sw, z.h, t, m), 0, z.h / 2, -sd / 2 + t / 2);
        add(it.id, 'tub', box(sw, z.h, t, m), 0, z.h / 2, sd / 2 - t / 2);
        add(it.id, 'tub', box(t, z.h, sd, m), -sw / 2 + t / 2, z.h / 2, 0);
        add(it.id, 'tub', box(t, z.h, sd, m), sw / 2 - t / 2, z.h / 2, 0);
      } else if (it.type === 'shower') {
        add(it.id, 'shower', box(fw, z.tray, fd, cmat('shower', .8)), 0, z.tray / 2, 0);
        g.userData.shower = { fw, fd, id: it.id };
      }
      scene.add(g); g.updateMatrixWorld(true);
      fixtures.push({ id: it.id, type: it.type, group: g, fw, fd, W2, D2, x: it.x, y: it.y });
    });

    // showers: glass on the sides that do not touch a room wall, head + valve on a wall side
    fixtures.filter(f => f.type === 'shower').forEach(f => {
      const g = f.group, { fw, fd, id } = g.userData.shower, z = Z3.shower;
      const sides = [{ s: 'back', x: 0, z: -fd / 2, len: fw, rot: 0 }, { s: 'front', x: 0, z: fd / 2, len: fw, rot: 0 },
        { s: 'left', x: -fw / 2, z: 0, len: fd, rot: 1 }, { s: 'right', x: fw / 2, z: 0, len: fd, rot: 1 }];
      const touches = sd => { const p = g.localToWorld(new THREE.Vector3(sd.x, 0, sd.z)); return p.x < .2 || p.z < .2 || p.x > W - .2 || p.z > D - .2; };
      const glass = new THREE.MeshLambertMaterial({ color: CODE.shower.hex, transparent: true, opacity: .28 });
      let wallSide = null;
      sides.forEach(sd => {
        if (touches(sd)) { if (!wallSide || sd.s === 'back') wallSide = sd; return; }
        const pane = sd.rot ? box(.05, z.h, sd.len, glass) : box(sd.len, z.h, .05, glass);
        pane.position.set(sd.x, z.tray + z.h / 2, sd.z); g.add(tag(id, 'shower', pane));
      });
      wallSide = wallSide || sides[0];
      const m = cmat('shower'), inward = wallSide.rot ? [Math.sign(-wallSide.x) * .3, 0] : [0, Math.sign(-wallSide.z) * .3];
      const head = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .06, 20), m);
      head.position.set(wallSide.x + inward[0] * 1.6, z.head, wallSide.z + inward[1] * 1.6); g.add(tag(id, 'shower', head));
      const arm = wallSide.rot ? box(.5, .06, .06, m) : box(.06, .06, .5, m);
      arm.position.set(wallSide.x + inward[0] * .8, z.head + .05, wallSide.z + inward[1] * .8); g.add(tag(id, 'shower', arm));
      const valve = wallSide.rot ? box(.06, .55, .55, m) : box(.55, .55, .06, m);
      valve.position.set(wallSide.x + inward[0] * .1, 4, wallSide.z + inward[1] * .1); g.add(tag(id, 'shower', valve));
      g.updateMatrixWorld(true);
    });

    return { scene, walls, corners, ceil, parts, fixtures, plan };
  }

  // ---------------------------------------------------------------- preset cameras
  function presetCameras(S, wantedKeys) {
    const { plan, fixtures } = S, W = plan.w, D = plan.d;
    const center = new THREE.Vector3(W / 2, 3, D / 2);
    const inner = (side, along, inset) => ({ n: [along, inset], s: [along, D - inset], w: [inset, along], e: [W - inset, along] })[side];
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' };
    const door = plan.items.find(i => i.type === 'door');
    const dSide = door ? door.wall : 's', dAlong = door ? door.pos + T.door.len / 2 : (dSide === 'n' || dSide === 's' ? W : D) / 2;
    const cams = [];
    const [dx, dz] = inner(dSide, dAlong, .25);
    cams.push({ id: 'door', label: door ? 'From the door' : 'From the entrance', pos: new THREE.Vector3(dx, EYE, dz), look: center.clone(), fov: 72,
      phrase: `Eye-level view from the doorway on the ${WN[dSide]} wall, looking toward the ${WN[opp[dSide]]} wall.` });
    const oSide = opp[dSide], oAlong = (oSide === 'n' || oSide === 's' ? W : D) / 2, [ox, oz] = inner(oSide, oAlong, .4), [tx, tz] = inner(dSide, dAlong, 0);
    cams.push({ id: 'far', label: 'From the far wall', pos: new THREE.Vector3(ox, EYE, oz), look: new THREE.Vector3(tx, 3.2, tz), fov: 72,
      phrase: `Eye-level view from the ${WN[oSide]} wall, looking back toward the door on the ${WN[dSide]} wall.` });
    // close-ups of up to two fixtures (the ones with products first)
    const order = f => PRIORITY.indexOf(f.type) + (wantedKeys && !wantedKeys.includes(f.id) ? 10 : 0);
    [...fixtures].sort((a, b) => order(a) - order(b)).slice(0, 2).forEach(f => {
      const c = new THREE.Vector3(f.x + f.W2 / 2, 0, f.y + f.D2 / 2);
      let dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.group.rotation.y);
      const probe = c.clone().addScaledVector(dir, 2.5);
      if (probe.x < 0 || probe.z < 0 || probe.x > W || probe.z > D) dir = new THREE.Vector3(W / 2 - c.x, 0, D / 2 - c.z).normalize();
      const tH = { vanity: 3.4, toilet: 1.5, tub: 1.3, shower: 3.6 }[f.type], dist = Math.max(f.fw, f.fd) * .7 + ({ shower: 3.4, vanity: 3 }[f.type] || 2.6);
      const pos = c.clone().addScaledVector(dir, dist);
      pos.x = Math.min(W - .3, Math.max(.3, pos.x)); pos.z = Math.min(D - .3, Math.max(.3, pos.z)); pos.y = f.type === 'shower' || f.type === 'vanity' ? 4.9 : 4.4;
      cams.push({ id: 'close-' + f.id, key: f.id, label: 'Close-up: ' + LABEL[f.type], pos, look: new THREE.Vector3(c.x, tH, c.z), fov: 62,
        phrase: `Closer view of the ${LABEL[f.type].toLowerCase()}, from inside the room.` });
    });
    return cams;
  }
  const WN = { n: 'north', s: 'south', e: 'east', w: 'west' };

  // ---------------------------------------------------------------- viewer
  function makeCamera(c) {
    const cam = new THREE.PerspectiveCamera(c.fov || 60, ASPECT, .1, 60);
    cam.position.copy(c.pos); cam.lookAt(c.look); cam.updateMatrixWorld(); cam.updateProjectionMatrix(); return cam;
  }
  // hide the walls and ceiling between an outside camera and the room (cut-away overview)
  function cutaway(S, camPos) {
    const { plan } = S, out = { n: camPos.z < 0, s: camPos.z > plan.d, w: camPos.x < 0, e: camPos.x > plan.w };
    Object.entries(S.walls).forEach(([k, g]) => { g.visible = !out[k]; });
    S.corners.forEach(c => { c.visible = !c.userData.walls.some(w => out[w]); });
    S.ceil.visible = camPos.y < Z3.ceiling;
  }

  async function create(opts = {}) {
    await load();
    const view = { scene: null, cams: [], current: 'overview', orbit: { theta: .75, phi: .95, r: 0 } };
    let renderer = null, exporter = null, overviewCam = null, container = null, ro = null;
    // attach the interactive canvas to a container (call again after the page re-renders)
    function mount(el) {
      container = el;
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
        const cv = renderer.domElement; cv.className = 'scene3d__canvas'; cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', '3D layout preview of your bathroom');
        // drag to orbit (overview only), wheel to zoom
        let drag = null;
        cv.addEventListener('pointerdown', e => { if (view.current !== 'overview') return; drag = { x: e.clientX, y: e.clientY, t: view.orbit.theta, p: view.orbit.phi }; cv.setPointerCapture(e.pointerId); });
        cv.addEventListener('pointermove', e => {
          if (!drag) return;
          view.orbit.theta = drag.t - (e.clientX - drag.x) * .008; view.orbit.phi = Math.min(1.45, Math.max(.25, drag.p - (e.clientY - drag.y) * .006)); draw();
        });
        cv.addEventListener('pointerup', () => { drag = null; });
        cv.addEventListener('wheel', e => { if (view.current !== 'overview') return; e.preventDefault(); view.orbit.r = Math.min(40, Math.max(6, view.orbit.r * (e.deltaY > 0 ? 1.08 : .93))); draw(); }, { passive: false });
        ro = new ResizeObserver(() => draw());
      }
      el.append(renderer.domElement); ro.disconnect(); ro.observe(el); draw();
    }

    function overview() {
      const p = view.scene.plan, o = view.orbit;
      if (!o.r) o.r = Math.max(p.w, p.d) * 1.7 + 4;
      const c = new THREE.Vector3(p.w / 2, 2.6, p.d / 2);
      const pos = new THREE.Vector3(c.x + o.r * Math.sin(o.phi) * Math.sin(o.theta), c.y + o.r * Math.cos(o.phi), c.z + o.r * Math.sin(o.phi) * Math.cos(o.theta));
      overviewCam = overviewCam || new THREE.PerspectiveCamera(42, ASPECT, .1, 200);
      overviewCam.position.copy(pos); overviewCam.lookAt(c); overviewCam.updateMatrixWorld(); return overviewCam;
    }
    const camFor = id => { if (id === 'overview') return overview(); const c = view.cams.find(x => x.id === id); return c ? makeCamera(c) : overview(); };

    function draw() {
      if (!renderer || !view.scene || !container || !container.isConnected) return;
      const w = container.clientWidth; if (!w) return;
      renderer.setSize(w, Math.round(w / ASPECT), false);
      const cam = camFor(view.current); cam.aspect = ASPECT; cam.updateProjectionMatrix();
      cutaway(view.scene, cam.position);
      renderer.render(view.scene.scene, cam);
    }

    // export one camera as a PNG data URL. mode: 'layout' (colour-coded) or 'depth'
    function exportImage(id, { mode = 'layout', width = 1024 } = {}) {
      const height = Math.round(width / ASPECT);
      exporter = exporter || new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      exporter.setPixelRatio(1); exporter.setSize(width, height, false);
      const cam = camFor(id), S = view.scene;
      cutaway(S, cam.position);
      if (mode === 'depth') {
        const p = S.plan; cam.near = .3; cam.far = Math.hypot(p.w, p.d, Z3.ceiling) + 1; cam.updateProjectionMatrix();
        const bg = S.scene.background; S.scene.background = new THREE.Color(0x000000);
        S.scene.overrideMaterial = new THREE.MeshDepthMaterial();
        exporter.render(S.scene, cam);
        S.scene.overrideMaterial = null; S.scene.background = bg;
      } else exporter.render(S.scene, cam);
      const url = exporter.domElement.toDataURL('image/png');
      draw(); // restore the interactive view's cut-away state
      return url;
    }

    // where each product sits in a camera's image: normalised boxes (0..1, origin top-left)
    function project(id) {
      const cam = camFor(id); cam.aspect = ASPECT; cam.updateProjectionMatrix();
      const out = [], v = new THREE.Vector3(), camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
      Object.entries(view.scene.parts).forEach(([key, p]) => {
        const b = new THREE.Box3(); p.meshes.forEach(m => b.expandByObject(m));
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, behind = 0;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
          if (v.clone().sub(cam.position).dot(camDir) <= .05) { behind++; continue; }
          v.project(cam); const sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        if (behind === 8) return;
        const cx0 = Math.max(0, x0), cx1 = Math.min(1, x1), cy0 = Math.max(0, y0), cy1 = Math.min(1, y1);
        const area = Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0), full = Math.max(1e-6, (x1 - x0) * (y1 - y0));
        if (area < .002) return;
        out.push({ key, type: p.type, box: { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 }, inFrame: Math.min(1, area / full), partial: behind > 0 });
      });
      return out;
    }

    view.setPlan = (plan, wantedKeys) => {
      if (view.scene) view.scene.scene.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); });
      view.scene = buildScene(plan); view.cams = presetCameras(view.scene, wantedKeys);
      if (view.current !== 'overview' && !view.cams.some(c => c.id === view.current)) view.current = 'overview';
      draw(); return view.cams;
    };
    view.show = id => { view.current = id; draw(); };
    view.cameras = () => view.cams;
    view.exportImage = exportImage;
    view.project = project;
    view.redraw = draw;
    view.mount = mount;
    view.dispose = () => { ro && ro.disconnect(); renderer && renderer.dispose(); exporter && exporter.dispose(); renderer && renderer.domElement.remove(); };
    if (opts.plan) view.setPlan(opts.plan, opts.wantedKeys);
    return view;
  }

  // plain-language layout facts (used by the caption, and by the text-only Pollinations fallback: plan Phase 0)
  function describeLayout(plan) {
    const near = .6, lines = [];
    plan.items.filter(i => !T[i.type].arch && CODE[i.type]).forEach(it => {
      const [w, d] = fpDims(it), touch = [];
      if (it.y <= near) touch.push('north'); if (plan.d - (it.y + d) <= near) touch.push('south');
      if (it.x <= near) touch.push('west'); if (plan.w - (it.x + w) <= near) touch.push('east');
      const name = (LABEL[it.type] || it.type).toLowerCase();
      lines.push(touch.length >= 2 ? `the ${name} sits in the ${touch.slice(0, 2).join('-')} corner` : touch.length ? `the ${name} stands against the ${touch[0]} wall` : `the ${name} stands in the middle of the room`);
      if (it.type === 'vanity') lines.push('a mirror hangs above the vanity');
    });
    plan.items.filter(i => T[i.type].arch).forEach(i => lines.push(`${i.type === 'fan' ? 'an exhaust fan' : 'a ' + i.type} on the ${WN[i.wall]} wall`));
    return lines;
  }

  window.KohlerScene3D = { load, create, describeLayout, CODE, ASPECT, available: () => !!window.WebGLRenderingContext };
})();
