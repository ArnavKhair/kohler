/* Fixture illustrations shared by Kohler Viz (floorplan, product cards) and Kohler View (AR overlays).
   Drawn as simple SVG because no transparent product images are available. Colours come from CSS variables so a
   finish swap recolours them:  --fx-body (ceramic / cabinet)  --fx-metal (faucet, trim)  --fx-line (outline). */
(() => {
  const S = (vb, inner, cls = '') => `<svg class="fx ${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
  const B = 'fill="var(--fx-body,var(--c-swatch-white))" stroke="var(--fx-line,var(--c-primary-700))" stroke-width="1.2"';
  const M = 'fill="var(--fx-metal,var(--c-finish-chrome))" stroke="var(--fx-line,var(--c-primary-700))" stroke-width="1"';
  const L = 'fill="none" stroke="var(--fx-line,var(--c-primary-700))" stroke-width="1"';

  // footprint in feet (w x d) for the floorplan builder; wall:true means it sits against a wall (thin)
  const TYPES = {
    toilet: { label: 'Toilet', w: 2, d: 3,
      top: S('0 0 40 60', `<rect x="6" y="2" width="28" height="14" rx="3" ${B}/><ellipse cx="20" cy="38" rx="14" ry="19" ${B}/><ellipse cx="20" cy="39" rx="9" ry="13" ${L}/>`),
      front: S('0 0 100 120', `<rect x="22" y="6" width="56" height="34" rx="6" ${B}/><rect x="60" y="14" width="10" height="4" rx="2" ${M}/>
        <path d="M14 46h72c0 22-10 34-24 38v26H38V84C24 80 14 68 14 46z" ${B}/><path d="M14 46h72" ${L}/><rect x="34" y="108" width="32" height="6" rx="2" ${B}/>`) },
    vanity: { label: 'Vanity & mirror', w: 3, d: 2,
      top: S('0 0 60 40', `<rect x="2" y="4" width="56" height="34" rx="2" ${B}/><rect x="8" y="0" width="44" height="3" rx="1.5" ${M}/><ellipse cx="30" cy="22" rx="14" ry="10" ${L}/><circle cx="30" cy="7" r="2" ${M}/>`),
      front: S('0 0 140 110', `<rect x="6" y="30" width="128" height="10" rx="2" ${B}/><path d="M48 30c0 10 10 14 22 14s22-4 22-14" ${L}/>
        <rect x="12" y="40" width="116" height="62" ${B}/><path d="M70 40v62M18 70h46M76 70h46" ${L}/><rect x="36" y="58" width="10" height="3" rx="1.5" ${M}/><rect x="94" y="58" width="10" height="3" rx="1.5" ${M}/>
        <rect x="16" y="102" width="6" height="6" ${M}/><rect x="118" y="102" width="6" height="6" ${M}/>
        <path d="M66 30V14c0-6 12-6 12 0v4" fill="none" stroke="var(--fx-metal,var(--c-finish-chrome))" stroke-width="5" stroke-linecap="round"/>`) },
    faucet: { label: 'Faucet', w: 1, d: 1, wall: true, mount: 'vanity',
      top: S('0 0 20 20', `<circle cx="10" cy="10" r="6" ${M}/>`),
      front: S('0 0 80 100', `<rect x="22" y="88" width="36" height="8" rx="3" ${M}/><path d="M40 88V30c0-14 26-14 26 0v12" fill="none" stroke="var(--fx-line,var(--c-primary-700))" stroke-width="11" stroke-linecap="round"/>
        <path d="M40 88V30c0-14 26-14 26 0v12" fill="none" stroke="var(--fx-metal,var(--c-finish-chrome))" stroke-width="9" stroke-linecap="round"/>
        <rect x="14" y="66" width="18" height="6" rx="3" ${M}/><rect x="48" y="66" width="18" height="6" rx="3" ${M}/>`) },
    tub: { label: 'Bathtub', w: 3, d: 5,
      top: S('0 0 60 100', `<rect x="2" y="2" width="56" height="96" rx="24" ${B}/><rect x="10" y="12" width="40" height="76" rx="18" ${L}/><circle cx="30" cy="80" r="2.5" ${M}/>`),
      front: S('0 0 180 90', `<path d="M8 28h164c0 30-18 48-46 50H54C26 76 8 58 8 28z" ${B}/><path d="M8 28h164" ${L}/><path d="M18 34h144" ${L} opacity=".5"/>
        <rect x="44" y="76" width="10" height="10" rx="2" ${M}/><rect x="126" y="76" width="10" height="10" rx="2" ${M}/>
        <path d="M150 28V8c0-6 14-6 14 0" fill="none" stroke="var(--fx-metal,var(--c-finish-chrome))" stroke-width="4" stroke-linecap="round"/>`) },
    shower: { label: 'Shower', w: 3, d: 3,
      top: S('0 0 60 60', `<rect x="2" y="2" width="56" height="56" ${B}/><path d="M2 58L58 2" ${L} opacity=".4"/><circle cx="30" cy="30" r="3" ${M}/><circle cx="50" cy="10" r="4" ${M}/>`),
      front: S('0 0 100 160', `<rect x="10" y="6" width="80" height="148" rx="2" fill="var(--fx-body,var(--c-swatch-white))" fill-opacity=".35" stroke="var(--fx-line,var(--c-primary-700))" stroke-width="1.2"/>
        <path d="M70 6v18h-16" fill="none" stroke="var(--fx-metal,var(--c-finish-chrome))" stroke-width="4"/><ellipse cx="50" cy="26" rx="14" ry="4" ${M}/>
        <circle cx="62" cy="90" r="6" ${M}/><path d="M40 34l-6 40M50 34v40M60 34l6 40" stroke="var(--fx-line,var(--c-primary-700))" stroke-width=".6" stroke-dasharray="2 4" opacity=".6"/>
        <rect x="10" y="150" width="80" height="4" ${M}/>`) },
    mirror: { label: 'Mirror', w: 3, d: 1, wall: true, paletteHidden: true, // combined with the vanity in the floorplan
      top: S('0 0 60 20', `<rect x="2" y="7" width="56" height="6" rx="2" ${M}/>`),
      front: S('0 0 100 130', `<rect x="8" y="4" width="84" height="122" rx="42" ${M}/><rect x="15" y="11" width="70" height="108" rx="35" fill="var(--fx-glass,var(--c-finish-glass))" stroke="var(--fx-line,var(--c-primary-700))" stroke-width=".8"/>
        <path d="M30 40l18-16M30 56l30-28" stroke="var(--c-white)" stroke-width="3" opacity=".6" stroke-linecap="round"/>`) }
  };

  // architectural items: wall-only, not products. Drawn for a north wall (wall along the top edge, room below).
  // len = length along the wall (ft); depth = how far the drawing reaches into the room (ft)
  const W = 'stroke="var(--fx-line,var(--c-primary-700))"';
  Object.assign(TYPES, {
    door: { label: 'Door', arch: true, wallOnly: true, len: 3, depth: 3,
      top: S('0 0 60 60', `<rect x="0" y="0" width="60" height="4" fill="var(--c-white)"/><path d="M2 2v56" ${W} stroke-width="3"/><path d="M2 58A56 56 0 0 0 58 2" fill="none" ${W} stroke-width="1" stroke-dasharray="3 3"/>`) },
    window: { label: 'Window', arch: true, wallOnly: true, len: 3, depth: .35,
      top: S('0 0 60 7', `<rect x="0" y=".5" width="60" height="6" fill="var(--c-white)" ${W} stroke-width="1"/><path d="M0 3.5h60" stroke="var(--c-info)" stroke-width="1.5"/>`) },
    fan: { label: 'Exhaust fan', arch: true, wallOnly: true, len: 1, depth: .6,
      top: S('0 0 20 12', `<rect x="1" y="1" width="18" height="10" rx="1.5" fill="var(--c-white)" ${W} stroke-width="1"/><path d="M4 4h12M4 6h12M4 8h12" ${W} stroke-width=".8"/>`) }
  });

  // 3D stand-in sizes for Kohler Viz's layout scene (feet). TYPICAL US sizes, not measured from each SKU: replace with
  // Kohler's product data feed (height, depth, width per product) when available. h = height above the floor.
  const SIZE3D = {
    toilet: { h: 2.6, seat: 1.4, w: 1.6, d: 2.5 },
    vanity: { h: 2.85, w: 2.9, d: 1.8 },          // cabinet + top; the basin sits in the top
    mirror: { h: 3.3, w: 2, bottom: 3.9 },         // hung above the vanity
    faucet: { h: .55 },
    tub: { h: 1.75, w: 2.7, d: 5 },
    shower: { h: 6.6, tray: .2, head: 6.8 },
    door: { h: 6.7 }, window: { sill: 3.2, top: 6.6 }, fan: { h: .9, top: 7.6 },
    ceiling: 8
  };

  // finish swatches (names are generic finish families; colours from tokens.css)
  const FINISHES = {
    metal: [
      { id: 'chrome', label: 'Polished Chrome', var: '--c-finish-chrome' },
      { id: 'black', label: 'Matte Black', var: '--c-finish-black' },
      { id: 'brass', label: 'Brushed Brass', var: '--c-finish-brass' },
      { id: 'nickel', label: 'Brushed Nickel', var: '--c-finish-nickel' }
    ],
    body: [
      { id: 'white', label: 'White', var: '--c-swatch-white' },
      { id: 'biscuit', label: 'Biscuit', var: '--c-biscuit' },
      { id: 'almond', label: 'Almond', var: '--c-almond' },
      { id: 'thunder', label: 'Thunder Grey', var: '--c-thunder-gray' }
    ]
  };

  window.KohlerFixtures = { TYPES, FINISHES, SIZE3D };
})();
