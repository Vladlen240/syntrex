// Block 07 — interactive dot globe (Three.js): particle continents, dark ocean with a light rim,
// slow auto-spin, drag with inertia, Syntrex markers with glass cards (click a marker to open its card)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { feature } from 'https://unpkg.com/topojson-client@3.1.0/src/index.js';

const HUBS = [ // only the markets named in Block 02: Europe, Asia and North America
  // North America
  { city: 'Vancouver', country: 'Canada', lat: 49.3, lon: -123.1 },
  { city: 'Los Angeles', country: 'USA', lat: 34.1, lon: -118.2 },
  { city: 'Mexico City', country: 'Mexico', lat: 19.4, lon: -99.1 },
  { city: 'New York', country: 'USA', lat: 40.7, lon: -74.0 },
  { city: 'Miami', country: 'USA', lat: 25.8, lon: -80.2 },
  // Europe
  { city: 'Madrid', country: 'Spain', lat: 40.4, lon: -3.7 },
  { city: 'Rotterdam', country: 'Netherlands', lat: 51.9, lon: 4.5 },
  { city: 'Helsinki', country: 'Finland', lat: 60.2, lon: 24.9 },
  { city: 'Istanbul', country: 'Türkiye', lat: 41.0, lon: 29.0 },
  // Asia
  { city: 'Dubai', country: 'UAE', lat: 25.2, lon: 55.3 },
  { city: 'Mumbai', country: 'India', lat: 19.1, lon: 72.9 },
  { city: 'Bangkok', country: 'Thailand', lat: 13.8, lon: 100.5 },
  { city: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.8 },
  { city: 'Shanghai', country: 'China', lat: 31.2, lon: 121.5 },
  { city: 'Tokyo', country: 'Japan', lat: 35.7, lon: 139.7 },
];
// const LOGO = '<svg viewBox="0 0 58.45 70"><path fill-rule="evenodd" d="M14.61 41.01L41.54 57.14L41.54 47.87L7.73 27.62L7.73 24.87L7.73 12.87L0 17.5L0 32.26L14.61 41.01ZM12.31 50.62L36.95 65.37L29.23 70L0.08 52.54L7.8 47.91L12.31 50.62ZM21.49 4.63L29.21 0L58.37 17.46L50.64 22.09L21.48 4.63ZM16.9 22.13L16.9 12.86L58.45 37.75L58.45 52.51L50.71 57.14L50.71 42.38L31.51 30.88L16.9 22.13Z"/></svg>';

const root = document.querySelector('.quote__globe');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rad = (d) => d * Math.PI / 180;
const toXYZ = (lat, lon, r = 1) => new THREE.Vector3(
  r * Math.cos(rad(lat)) * Math.sin(rad(lon)), r * Math.sin(rad(lat)), r * Math.cos(rad(lat)) * Math.cos(rad(lon)));

// land mask: world outline rasterised into an equirectangular canvas, sampled per dot
async function landMask() {
  const topo = await fetch('https://unpkg.com/world-atlas@2.0.2/land-110m.json').then((r) => r.json());
  const land = feature(topo, topo.objects.land);
  const W = 1440, H = 720, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  // each polygon is filled on its own; rings that jump across the antimeridian are unwrapped
  // and drawn a second time shifted by 360 degrees, so no stripes run across the map
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const shift of [-360, 0, 360]) {
      g.beginPath();
      for (const ring of poly) {
        let prev = null, off = 0;
        ring.forEach(([lon, lat], i) => {
          if (prev !== null && Math.abs(lon - prev) > 180) off += lon > prev ? -360 : 360;
          prev = lon;
          g[i ? 'lineTo' : 'moveTo']((lon + off + shift + 180) / 360 * W, (90 - lat) / 180 * H);
        });
        // Antarctica runs all the way round: close it through the south pole, not across the map
        const a = ring[0][0], b = ring[ring.length - 1][0] + off;
        if (Math.abs(b - a) > 300) { g.lineTo((b + shift + 180) / 360 * W, H); g.lineTo((a + shift + 180) / 360 * W, H); }
        g.closePath();
      }
      g.fill('evenodd');
    }
  }
  const px = g.getImageData(0, 0, W, H).data;
  return (lat, lon) => px[(Math.min(H - 1, Math.floor((90 - lat) / 180 * H)) * W + Math.min(W - 1, Math.floor((lon + 180) / 360 * W))) * 4] > 127;
}

async function init() {
  const isLand = await landMask();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  root.querySelector('.globe__stars').after(renderer.domElement); // above the stars
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.z = 5.2;

  const tilt = new THREE.Group(), spin = new THREE.Group();
  tilt.rotation.x = rad(18); spin.rotation.y = rad(25); // opens on the Atlantic, as in Figma
  tilt.add(spin); scene.add(tilt);

  // ocean: procedural GLSL shader (soft grey clouds of noise, lit from the left) with a light rim
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 p = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix*p; }',
    fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v = 0., a = .5; for(int k=0;k<5;k++){ v += a*n(p); p *= 2.03; a *= .5; } return v; }
      void main(){
        float c = fbm(vP*2.2 + vec3(uTime*.02, 0., uTime*.015));
        float light = clamp(dot(vN, normalize(vec3(-.8,.25,.55)))*.6+.45, 0., 1.);
        vec3 col = mix(vec3(.02), vec3(.78), smoothstep(.3,.85,c)*light);
        float rim = pow(1.-max(dot(vN,vV),0.), 3.);
        gl_FragColor = vec4(col + rim*vec3(.7), 1.);
      }`,
  })));
  const ocean = spin.children[0];
  // particle continents as in the reference: random scatter (no grid), mixed sizes, dots float at
  // slightly different heights above the surface, so the limb gets a soft sparkling halo
  const pos = [], seed = [], N = 60000;
  for (let i = 0; i < N; i++) {
    const lat = Math.asin(Math.random() * 2 - 1) * 180 / Math.PI;
    const lon = Math.random() * 360 - 180;
    if (!isLand(lat, lon)) continue;
    const v = toXYZ(lat, lon, 1.004 + Math.pow(Math.random(), 3) * .05); pos.push(v.x, v.y, v.z); seed.push(Math.random());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  const dots = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: 1 }, uHover: { value: new THREE.Vector3(0, 0, 1) }, uAmt: { value: 0 } },
    // hover: dots around the cursor smoothly turn brand orange (no movement)
    vertexShader: `attribute float seed; uniform float uTime; uniform float uSize; uniform vec3 uHover; uniform float uAmt; varying float vA; varying float vL;
      void main(){
        float d = distance(normalize(position), uHover);
        float l = smoothstep(.42, 0., d) * uAmt;
        vec4 p = modelViewMatrix * vec4(position, 1.); vec3 n = normalize(normalMatrix * position);
        vA = smoothstep(-.1,.2,n.z)*(.8+.2*sin(uTime*1.6+seed*6.283)) + pow(1.-abs(n.z),6.)*.6;
        vL = l;
        gl_PointSize = uSize*(.55+seed*seed*.9); gl_Position = projectionMatrix*p; }`,
    fragmentShader: 'varying float vA; varying float vL; void main(){ float d = length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor = vec4(mix(vec3(1.), vec3(1., .369, 0.), clamp(vL*1.6,0.,1.)), vA*smoothstep(.5,.3,d)); }',
  });
  spin.add(new THREE.Points(geo, dots));

  // markers (HTML on top of the canvas, projected each frame)
  const layer = root.querySelector('.globe__layer');
  const pins = HUBS.map((h) => {
    const el = document.createElement('div');
    el.className = 'globe__pin';
    el.innerHTML = `<button class="globe__dot" type="button" aria-label="${h.city}, ${h.country}"></button>
      <div class="globe__card">${h.city}, ${h.country}</div>`;
    layer.append(el);
    // a tap toggles the card on touch screens; with a mouse it opens by proximity (see frame)
    const dot = el.querySelector('.globe__dot');
    dot.addEventListener('pointerdown', (e) => e.stopPropagation());
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = !el.classList.contains('is-open');
      pins.forEach((p) => p.el.classList.remove('is-open'));
      el.classList.toggle('is-open', on);
    });
    return { el, v: toXYZ(h.lat, h.lon, 1.01) };
  });
  root.addEventListener('click', () => pins.forEach((p) => p.el.classList.remove('is-open')));

  // crosshair cursor: two thin lines across the block + centre dot, snaps to a marker nearby
  const cross = root.querySelector('.globe__cross');
  let mx = -1, my = -1, cx = -1, cy = -1, hover = false;
  root.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; hover = true; });
  root.addEventListener('pointerleave', (e) => { hover = false; if (e.pointerType === 'mouse') root.querySelectorAll('.globe__pin.is-open').forEach((p) => p.classList.remove('is-open')); });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();

  // drag with inertia + auto-spin (paused while a card is open)
  let vx = 0, vy = 0, drag = null;
  root.addEventListener('pointerdown', (e) => { if (e.target.closest('.globe__pin')) return; drag = { x: e.clientX, y: e.clientY }; root.setPointerCapture(e.pointerId); root.classList.add('is-drag'); });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    vx = (e.clientX - drag.x) * .005; vy = (e.clientY - drag.y) * .005;
    spin.rotation.y += vx; tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + vy, -.9, .9);
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; root.classList.remove('is-drag'); };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);

  const size = () => {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // the planet picture (970x1080, globe 545px) was "cover": the globe scales the same way
    const phone = matchMedia('(max-width: 1023px)').matches;
    // phones: 20% bigger and centred between the lead text's last line and the bottom of the block
    const d = 545 * Math.max(w / 970, h / 1080) * (phone ? 1.2 : 1);
    camera.fov = 2 * Math.atan((h / d) / Math.sqrt(camera.position.z ** 2 - 1)) * 180 / Math.PI;
    const lead = root.querySelector('.quote__lead');
    const dy = phone && lead ? (lead.offsetTop + lead.offsetHeight) / 2 : 0;
    if (dy) camera.setViewOffset(w, h, 0, -dy, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    dots.uniforms.uSize.value = d / 545 * 2.2 * renderer.getPixelRatio();
  };
  new ResizeObserver(size).observe(root); size();

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  const tmp = new THREE.Vector3(), clock = new THREE.Clock();
  const frame = () => {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), .05);
    if (!visible) return;
    if (!drag) {
      vx *= .94; vy *= .94;
      spin.rotation.y += vx + (still || pins.some((p) => p.el.classList.contains('is-open')) ? 0 : dt * .08);
      tilt.rotation.x = THREE.MathUtils.clamp(tilt.rotation.x + vy, -.9, .9);
    }
    // lens follows the point of the globe under the cursor
    let on = false;
    if (hover && !drag) {
      ndc.set(mx / root.clientWidth * 2 - 1, 1 - my / root.clientHeight * 2);
      ray.setFromCamera(ndc, camera);
      const i = ray.intersectObject(ocean)[0];
      if (i) { hit.copy(i.point); spin.worldToLocal(hit).normalize(); dots.uniforms.uHover.value.lerp(hit, .35).normalize(); on = true; }
    }
    dots.uniforms.uAmt.value += ((on && !still ? 1 : 0) - dots.uniforms.uAmt.value) * .1;
    dots.uniforms.uTime.value = ocean.material.uniforms.uTime.value = still ? 0 : clock.elapsedTime;
    renderer.render(scene, camera);
    const w = root.clientWidth, h = root.clientHeight;
    for (const p of pins) {
      tmp.copy(p.v); spin.localToWorld(tmp);
      const front = tmp.z > .15; // hidden behind the globe
      tmp.project(camera);
      p.el.style.transform = `translate(${(tmp.x + 1) / 2 * w}px, ${(1 - tmp.y) / 2 * h}px)`;
      p.el.classList.toggle('is-back', !front);
      if (!front) p.el.classList.remove('is-open');
      p.x = (tmp.x + 1) / 2 * w; p.y = (1 - tmp.y) / 2 * h; p.front = front;
      if (p.el.classList.contains('is-open')) p.el.classList.toggle('is-left', p.x + p.el.querySelector('.globe__card').offsetWidth + 40 > w);
    }
    // cursor follows the mouse softly and is pulled to the closest visible marker within 6rem
    let tx = mx, ty = my;
    const snap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 6;
    let near = null;
    for (const p of pins) if (p.front && Math.hypot(p.x - mx, p.y - my) < snap) { tx = p.x; ty = p.y; near = p; }
    // the card opens the moment the cursor gets near a marker (no need to hit the small square),
    // so the globe stops at once; it closes when the cursor moves away, unless it is over the card
    if (hover && !drag && matchMedia('(hover: hover)').matches) {
      const card = (p) => { const r = p.el.querySelector('.globe__card').getBoundingClientRect(), o = root.getBoundingClientRect();
        return p.el.classList.contains('is-open') && mx >= r.left - o.left && mx <= r.right - o.left && my >= r.top - o.top && my <= r.bottom - o.top; };
      const keep = pins.find(card) || (near && Math.hypot(near.x - mx, near.y - my) < snap * .5 ? near : null);
      for (const p of pins) p.el.classList.toggle('is-open', p === keep);
    }
    if (cx < 0) { cx = tx; cy = ty; }
    cx += (tx - cx) * (still ? 1 : .25); cy += (ty - cy) * (still ? 1 : .25);
    cross.style.setProperty('--x', `${cx}px`); cross.style.setProperty('--y', `${cy}px`);
    cross.classList.toggle('is-on', hover);
    cross.classList.toggle('is-snap', tx !== mx || ty !== my);
  };
  frame();
}

// space behind the globe: fine grain + scattered stars of different size and brightness
function stars() {
  const c = document.createElement('canvas');
  c.className = 'globe__stars';
  root.prepend(c);
  const draw = () => {
    const dpr = Math.min(devicePixelRatio, 2), w = root.clientWidth, h = root.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); // same sky on every resize
    for (let i = 0; i < w * h / 90; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * .07})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
    for (let i = 0; i < w * h / 1400; i++) {
      const r = Math.pow(rnd(), 4) * 1.4 + .3;
      g.fillStyle = `rgba(255,255,255,${.25 + rnd() * .75})`;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2); g.fill();
    }
  };
  new ResizeObserver(draw).observe(root);
}

if (root) { stars(); init().catch((e) => console.error('globe:', e)); }
