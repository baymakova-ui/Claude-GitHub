// =====================================================================
// ImmoCity Builder — app.js
// Part 1: Constants, Data Model, KPI Logic, Three.js Scene Setup
// =====================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------
const ADMIN_PASSWORD = 'immokanzlei2026';
const STORAGE_KEY = 'immocity_v1';
const MONTHS_DE = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember'
];

const ROLE_LABEL = {
  leader: 'Teamleiter · Strategie',
  seller: 'Verkäufer',
  worker: 'Mitarbeiter',
  photographer: 'Fotografin · Drohne'
};

// Default team — exactly as the user specified
const DEFAULT_EMPLOYEES = [
  { id: 'markus',   name: 'Markus',   role: 'leader',       color: '#f7d774', photo: null },
  { id: 'mario',    name: 'Mario',    role: 'seller',       color: '#d4af37', photo: null },
  { id: 'eren',     name: 'Eren',     role: 'seller',       color: '#e0b84b', photo: null },
  { id: 'robert',   name: 'Robert',   role: 'seller',       color: '#c9962b', photo: null },
  { id: 'liana',    name: 'Liana',    role: 'worker',       color: '#b8860b', photo: null },
  { id: 'jennifer', name: 'Jennifer', role: 'worker',       color: '#a87708', photo: null },
  { id: 'mathieu',  name: 'Mathieu',  role: 'worker',       color: '#8e6306', photo: null },
  { id: 'ksenya',   name: 'Ksenya',   role: 'worker',       color: '#d4af37', photo: null, admin: true },
  { id: 'olja',     name: 'Olja',     role: 'photographer', color: '#f7d774', photo: null }
];

// KPI rules
const RULES = {
  salesPerFloor: 1,           // 1 Verkauf = 1 Stockwerk (sellers)
  bricksPerHourPerDay: 6,     // base bricks per "hour-per-day" unit (workers)
  reviewsPerDecor: 3,         // 3 Bewertungen = 1 Schmuckelement
  strategyPerTier: 2,         // 2 Strategie-Blöcke = 1 zusätzlicher Tower-Tier (Markus)
  callsTargetGross: 80,
  callsTargetNet:   40
};

// ---------------------------------------------------------------------
// DATA MODEL & PERSISTENCE
// ---------------------------------------------------------------------
function emptyMonth() {
  return { sales: 0, callsGross: 0, callsNet: 0, days: 0, hours: 0, reviews: 0, strategy: 0 };
}

function defaultStore() {
  return {
    employees: DEFAULT_EMPLOYEES.map(e => ({ ...e })),
    metrics: {}, // metrics[empId][year][month] = {...}
    settings: { firstYear: new Date().getFullYear() }
  };
}

let store = loadStore();

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    // Merge defaults to ensure all employees exist (idempotent)
    const ids = new Set(parsed.employees?.map(e => e.id) || []);
    DEFAULT_EMPLOYEES.forEach(d => { if (!ids.has(d.id)) parsed.employees.push({ ...d }); });
    parsed.metrics = parsed.metrics || {};
    parsed.settings = parsed.settings || { firstYear: new Date().getFullYear() };
    return parsed;
  } catch (err) {
    console.warn('Store konnte nicht geladen werden, verwende Standard.', err);
    return defaultStore();
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err);
    showToast('Speichern fehlgeschlagen — Speicher voll?', 'error');
  }
}

function getMetric(empId, year, month) {
  return store.metrics?.[empId]?.[year]?.[month] || emptyMonth();
}

function setMetric(empId, year, month, data) {
  store.metrics[empId] = store.metrics[empId] || {};
  store.metrics[empId][year] = store.metrics[empId][year] || {};
  store.metrics[empId][year][month] = { ...emptyMonth(), ...data };
  saveStore();
}

function aggregateYear(empId, year) {
  const out = emptyMonth();
  const yearData = store.metrics?.[empId]?.[year] || {};
  for (let m = 0; m < 12; m++) {
    const d = yearData[m];
    if (!d) continue;
    out.sales      += +d.sales      || 0;
    out.callsGross += +d.callsGross || 0;
    out.callsNet   += +d.callsNet   || 0;
    out.days       += +d.days       || 0;
    out.hours      += +d.hours      || 0;
    out.reviews    += +d.reviews    || 0;
    out.strategy   += +d.strategy   || 0;
  }
  return out;
}

function getMetricForView(empId, year, month) {
  if (month === 'all') return aggregateYear(empId, year);
  return getMetric(empId, +year, +month);
}

// ---------------------------------------------------------------------
// KPI / BUILDING DERIVATIONS
// ---------------------------------------------------------------------
function hoursPerDay(m) {
  if (!m.days || m.days <= 0) return 0;
  return m.hours / m.days;
}

function computeBuilding(emp, m) {
  // Returns { floors, bricksPerDay, totalBricks, decor, towerTiers }
  const hpd = hoursPerDay(m);
  let floors = 0;
  let bricksPerDay = 0;
  let towerTiers = 0;

  if (emp.role === 'seller') {
    floors = Math.floor((+m.sales || 0) / RULES.salesPerFloor);
  } else if (emp.role === 'worker') {
    // 1 Stockwerk je 4 Stunden/Tag im Schnitt + Ziegel pro Tag
    floors = Math.max(1, Math.floor(hpd / 2));
    bricksPerDay = Math.round(hpd * RULES.bricksPerHourPerDay);
  } else if (emp.role === 'leader') {
    // Markus' Turm: Stockwerke aus Verkäufen + Tiers aus Strategie
    floors = Math.max(3, Math.floor((+m.sales || 0) / RULES.salesPerFloor) + 3);
    towerTiers = Math.floor((+m.strategy || 0) / RULES.strategyPerTier);
  } else if (emp.role === 'photographer') {
    // Olja: Stockwerke aus Bewertungen / Fotos (reviews = Foto-Sessions)
    floors = Math.max(2, Math.floor((+m.reviews || 0) / 5) + 2);
  }

  const totalBricks = bricksPerDay * (+m.days || 0);
  const decor = Math.floor((+m.reviews || 0) / RULES.reviewsPerDecor);

  return { floors, bricksPerDay, totalBricks, decor, towerTiers, hpd };
}

function leaderboardScore(emp, m) {
  const b = computeBuilding(emp, m);
  // Composite: floors weighted, decor adds, calls add small
  return b.floors * 10 + b.decor * 3 + Math.floor((+m.callsNet || 0) / 5) + b.towerTiers * 5;
}

// ---------------------------------------------------------------------
// SESSION / VIEW STATE
// ---------------------------------------------------------------------
const state = {
  currentUserId: null,
  isAdmin: false,
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  focusedEmpId: null,   // building currently centered in 3D
  buildings: new Map(), // empId -> { group, base, floors[], decor[], character, label }
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  clock: null,
  raycaster: null,
  pointer: null,
  drone: null,
  animTargets: []       // active tweens
};

function currentUser() {
  return store.employees.find(e => e.id === state.currentUserId) || null;
}

// ---------------------------------------------------------------------
// DOM HELPERS
// ---------------------------------------------------------------------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function showToast(msg, type = 'info') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    t.className = 'toast hidden';
  }, 2600);
}

function setScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id)?.classList.add('active');
}

function openModal(id)  { $('#' + id)?.classList.remove('hidden'); }
function closeModal(id) { $('#' + id)?.classList.add('hidden'); }

// Generic close-buttons
document.addEventListener('click', (e) => {
  const tgt = e.target.closest('[data-close-modal]');
  if (tgt) closeModal(tgt.dataset.closeModal);
});

// ---------------------------------------------------------------------
// THREE.JS SCENE — FOUNDATION (ground, sky, lights, camera, renderer)
// ---------------------------------------------------------------------
function initThree() {
  const container = $('#three-container');
  if (!container) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080c);
  scene.fog = new THREE.Fog(0x07080c, 40, 140);
  state.scene = scene;

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.1, 500
  );
  camera.position.set(28, 22, 36);
  state.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  state.renderer = renderer;

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.target.set(0, 4, 0);
  state.controls = controls;

  // Lights — warm gold key + cool fill, mimicking sunset on dark city
  const ambient = new THREE.AmbientLight(0x2a2418, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xf7d774, 1.4);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left   = -60;
  sun.shadow.camera.right  =  60;
  sun.shadow.camera.top    =  60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 150;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8aa3ff, 0.35);
  fill.position.set(-25, 18, -10);
  scene.add(fill);

  const rim = new THREE.PointLight(0xffd166, 0.9, 80, 2);
  rim.position.set(0, 14, 0);
  scene.add(rim);

  // Starry sky dome
  addStars(scene);

  // Ground — dark with subtle gold grid
  const groundGeo = new THREE.CircleGeometry(80, 64);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d10,
    roughness: 0.95,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(160, 80, 0x3a2e0e, 0x1a1508);
  grid.position.y = 0.01;
  scene.add(grid);

  // Central plaza disc — gold accent
  const plazaGeo = new THREE.RingGeometry(6.5, 7.0, 64);
  const plazaMat = new THREE.MeshBasicMaterial({ color: 0xb8860b, side: THREE.DoubleSide });
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  scene.add(plaza);

  state.clock = new THREE.Clock();
  state.raycaster = new THREE.Raycaster();
  state.pointer = new THREE.Vector2();

  // Resize
  window.addEventListener('resize', onResize);

  // Pointer pick — focuses building
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // Begin loop
  animate();
}

function addStars(scene) {
  const geo = new THREE.BufferGeometry();
  const count = 400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 120 + Math.random() * 40;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    positions[i*3]   = r * Math.sin(p) * Math.cos(t);
    positions[i*3+1] = Math.abs(r * Math.cos(p)) * 0.6 + 20;
    positions[i*3+2] = r * Math.sin(p) * Math.sin(t);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf7d774, size: 0.6, transparent: true, opacity: 0.85, depthWrite: false
  });
  scene.add(new THREE.Points(geo, mat));
}

function onResize() {
  const c = $('#three-container');
  if (!c || !state.renderer || !state.camera) return;
  state.camera.aspect = c.clientWidth / c.clientHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(c.clientWidth, c.clientHeight);
}

function onPointerDown(ev) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((ev.clientX - rect.left) / rect.width)  * 2 - 1;
  state.pointer.y = -((ev.clientY - rect.top)  / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);

  const groups = [];
  state.buildings.forEach(b => groups.push(b.group));
  const hits = state.raycaster.intersectObjects(groups, true);
  if (hits.length) {
    let g = hits[0].object;
    while (g.parent && !g.userData.empId) g = g.parent;
    if (g.userData.empId) focusBuilding(g.userData.empId);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = state.clock?.getDelta() || 0;
  const t  = state.clock?.getElapsedTime() || 0;

  // Tween manager
  for (let i = state.animTargets.length - 1; i >= 0; i--) {
    const a = state.animTargets[i];
    a.elapsed += dt;
    const k = Math.min(1, a.elapsed / a.duration);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    a.step(e);
    if (k >= 1) {
      a.done?.();
      state.animTargets.splice(i, 1);
    }
  }

  // Idle animations defined in Part 2 (drone hover, character bob)
  updateIdleAnimations?.(t, dt);

  state.controls?.update();
  state.renderer?.render(state.scene, state.camera);
}

function tween({ duration = 0.6, step, done }) {
  state.animTargets.push({ duration, elapsed: 0, step, done });
}

// =====================================================================
// PART 2a — CITY LAYOUT & BUILDING GEOMETRIES
// =====================================================================

const FLOOR_HEIGHT  = 1.6;
const BASE_RADIUS   = 1.6;
const PLOT_RADIUS   = 14;   // ring on which seller/worker plots sit
const MARKUS_POS    = new THREE.Vector3(0, 0, 0);
const OLJA_POS      = new THREE.Vector3(0, 0, 22);

// Shared materials (built once, recoloured per-employee)
const goldMat = () => new THREE.MeshStandardMaterial({
  color: 0xd4af37, metalness: 0.85, roughness: 0.25, emissive: 0x2a1f04, emissiveIntensity: 0.3
});
const darkMat = () => new THREE.MeshStandardMaterial({
  color: 0x141414, metalness: 0.4, roughness: 0.7
});
const windowMat = () => new THREE.MeshStandardMaterial({
  color: 0xf7d774, emissive: 0xf7d774, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.4
});

function plotPositionFor(emp, employees) {
  if (emp.role === 'leader') return MARKUS_POS.clone();
  if (emp.role === 'photographer') return OLJA_POS.clone();
  // Sellers + workers arranged on a ring, sellers on front half, workers on back half
  const sellers = employees.filter(e => e.role === 'seller');
  const workers = employees.filter(e => e.role === 'worker');
  const ring = emp.role === 'seller' ? sellers : workers;
  const idx = ring.findIndex(e => e.id === emp.id);
  const total = ring.length;
  const arc = emp.role === 'seller' ? Math.PI : Math.PI;       // half-circle each
  const offset = emp.role === 'seller' ? -Math.PI / 2 : Math.PI / 2;
  const a = offset + (idx + 0.5) * (arc / total);
  return new THREE.Vector3(Math.cos(a) * PLOT_RADIUS, 0, Math.sin(a) * PLOT_RADIUS);
}

// ---------- LABEL / LOGO SPRITE ------------------------------------
function makeLabelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const ctx = c.getContext('2d');
  // Plate
  ctx.fillStyle = 'rgba(10,10,10,0.92)';
  roundRect(ctx, 8, 8, 496, 144, 24); ctx.fill();
  // Gold border
  const grad = ctx.createLinearGradient(0, 0, 512, 160);
  grad.addColorStop(0, '#f7d774'); grad.addColorStop(1, '#b8860b');
  ctx.strokeStyle = grad; ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, 496, 144, 24); ctx.stroke();
  // Mini logo (gold house)
  ctx.strokeStyle = grad; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(48, 110); ctx.lineTo(48, 70); ctx.lineTo(88, 40);
  ctx.lineTo(128, 70); ctx.lineTo(128, 110); ctx.closePath();
  ctx.stroke();
  // Name
  ctx.fillStyle = '#f7d774';
  ctx.font = '700 56px Montserrat, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 80);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.8, 1.5, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ---------- BUILDING FACTORIES -------------------------------------
function buildSellerHouse(emp, info) {
  // Townhouse: stone base + N glowing floors + gold roof; floors animate up
  const group = new THREE.Group();
  group.userData.empId = emp.id;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BASE_RADIUS * 2.2, 1.0, BASE_RADIUS * 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85 })
  );
  base.position.y = 0.5;
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  const floors = [];
  for (let i = 0; i < info.floors; i++) {
    const floor = makeFloorMesh(emp, i);
    floor.position.y = 1 + i * FLOOR_HEIGHT - FLOOR_HEIGHT / 2; // grow up from base
    floor.scale.set(1, 0.001, 1); // animate in
    group.add(floor);
    floors.push(floor);
    // Animate scale up sequentially
    tween({
      duration: 0.5,
      step: (k) => { floor.scale.y = Math.max(0.001, k); floor.position.y = 1 + i * FLOOR_HEIGHT + (FLOOR_HEIGHT/2) * (k - 1); },
      done: () => { floor.scale.y = 1; floor.position.y = 1 + i * FLOOR_HEIGHT + FLOOR_HEIGHT/2; }
    });
  }

  // Gold pyramidal roof
  const roofY = 1 + info.floors * FLOOR_HEIGHT;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(BASE_RADIUS * 1.6, 1.2, 4),
    goldMat()
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = roofY + 0.6;
  roof.castShadow = true;
  group.add(roof);

  return { group, floors, roof, base };
}

function makeFloorMesh(emp, floorIdx) {
  const w = BASE_RADIUS * 2;
  const m = new THREE.Group();
  // Walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(w, FLOOR_HEIGHT * 0.95, w),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(emp.color || '#d4af37').multiplyScalar(0.35),
      roughness: 0.6, metalness: 0.2
    })
  );
  walls.castShadow = walls.receiveShadow = true;
  m.add(walls);
  // 4 glowing windows
  const wgeo = new THREE.PlaneGeometry(0.45, 0.55);
  const wmat = windowMat();
  for (let s = 0; s < 4; s++) {
    const win = new THREE.Mesh(wgeo, wmat);
    const ang = (s / 4) * Math.PI * 2 + Math.PI / 4;
    win.position.set(Math.cos(ang) * (w/2 + 0.01), 0, Math.sin(ang) * (w/2 + 0.01));
    win.lookAt(win.position.clone().multiplyScalar(2));
    m.add(win);
  }
  return m;
}

function buildWorkerHouse(emp, info) {
  // Brick-style cottage; bricks per day shown as visible courses
  const group = new THREE.Group();
  group.userData.empId = emp.id;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(BASE_RADIUS * 1.3, BASE_RADIUS * 1.5, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
  );
  base.position.y = 0.3; base.castShadow = base.receiveShadow = true;
  group.add(base);

  const floors = [];
  const totalH = Math.max(1, info.floors) * FLOOR_HEIGHT;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BASE_RADIUS * 2, totalH, BASE_RADIUS * 2),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(emp.color || '#b8860b').multiplyScalar(0.45),
      roughness: 0.75
    })
  );
  body.position.y = 0.6 + totalH / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  floors.push(body);

  // Brick courses — bricksPerDay visualized as lit dots wrapping the body
  const dots = Math.min(info.bricksPerDay, 24);
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      windowMat()
    );
    dot.position.set(
      Math.cos(a) * (BASE_RADIUS + 0.05),
      0.6 + totalH * 0.5 + Math.sin(i * 0.7) * (totalH / 3),
      Math.sin(a) * (BASE_RADIUS + 0.05)
    );
    group.add(dot);
  }

  // Roof — flat gold slab
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(BASE_RADIUS * 2.2, 0.2, BASE_RADIUS * 2.2),
    goldMat()
  );
  roof.position.y = 0.6 + totalH + 0.1; roof.castShadow = true;
  group.add(roof);

  return { group, floors, roof, base };
}

function buildLeaderTower(emp, info) {
  // Markus' Strategiezentrum — central tower with stacked tiers
  const group = new THREE.Group();
  group.userData.empId = emp.id;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 0.8, 16),
    goldMat()
  );
  base.position.y = 0.4; base.castShadow = base.receiveShadow = true;
  group.add(base);

  const floors = [];
  const trunkH = info.floors * FLOOR_HEIGHT;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.6, trunkH, 12),
    new THREE.MeshStandardMaterial({ color: 0x191512, roughness: 0.5, metalness: 0.5 })
  );
  trunk.position.y = 0.8 + trunkH / 2;
  trunk.castShadow = trunk.receiveShadow = true;
  group.add(trunk);
  floors.push(trunk);

  // Glowing window bands
  for (let i = 0; i < info.floors; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.06, 8, 32),
      windowMat()
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.8 + i * FLOOR_HEIGHT + FLOOR_HEIGHT * 0.5;
    group.add(ring);
  }

  // Strategy tiers — gold rings stacked on top
  let tierY = 0.8 + trunkH;
  for (let i = 0; i < info.towerTiers; i++) {
    const r = 1.2 - i * 0.12;
    const tier = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r + 0.15, 0.6, 12),
      goldMat()
    );
    tier.position.y = tierY + 0.3;
    tier.castShadow = true;
    group.add(tier);
    tierY += 0.7;
  }

  // Crown — gold spire with beacon
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 2.4, 12),
    goldMat()
  );
  spire.position.y = tierY + 1.2;
  group.add(spire);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xf7d774, emissive: 0xf7d774, emissiveIntensity: 2.5
    })
  );
  beacon.position.y = tierY + 2.6;
  beacon.userData.beacon = true;
  group.add(beacon);

  const beaconLight = new THREE.PointLight(0xf7d774, 1.6, 30, 2);
  beaconLight.position.copy(beacon.position);
  group.add(beaconLight);

  return { group, floors, roof: spire, base, beacon };
}

function buildPhotographerStudio(emp, info) {
  // Olja's studio — glass dome with helipad for the drone
  const group = new THREE.Group();
  group.userData.empId = emp.id;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.6, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 })
  );
  base.position.y = 0.3; base.castShadow = base.receiveShadow = true;
  group.add(base);

  const floors = [];
  const bodyH = info.floors * FLOOR_HEIGHT;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.0, bodyH, 16),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a20, roughness: 0.4, metalness: 0.6,
      emissive: 0x33260a, emissiveIntensity: 0.3
    })
  );
  body.position.y = 0.6 + bodyH / 2;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  floors.push(body);

  // Glass dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0xf7d774, transparent: true, opacity: 0.35,
      transmission: 0.6, roughness: 0.15, metalness: 0.2,
      emissive: 0xf7d774, emissiveIntensity: 0.15
    })
  );
  dome.position.y = 0.6 + bodyH;
  group.add(dome);

  // Helipad ring — landing target for drone
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.9, 24),
    new THREE.MeshBasicMaterial({ color: 0xf7d774, side: THREE.DoubleSide })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.6 + bodyH + 1.92;
  group.add(pad);

  return { group, floors, roof: dome, base, helipadY: pad.position.y };
}

// ---------- BUILD CITY (one building per employee) -----------------
function buildCity() {
  // Clear previous
  state.buildings.forEach(b => state.scene.remove(b.group));
  state.buildings.clear();

  const emp = currentUser();
  if (!emp) return;

  const view = state.month === 'all'
    ? aggregateYear(emp.id, state.year)
    : getMetric(emp.id, state.year, state.month);

  // Build current user's own building (and the rest of the city as neighbours)
  store.employees.forEach(e => {
    const m = state.month === 'all'
      ? aggregateYear(e.id, state.year)
      : getMetric(e.id, state.year, state.month);
    const info = computeBuilding(e, m);
    let built;
    if (e.role === 'seller')        built = buildSellerHouse(e, info);
    else if (e.role === 'worker')   built = buildWorkerHouse(e, info);
    else if (e.role === 'leader')   built = buildLeaderTower(e, info);
    else                            built = buildPhotographerStudio(e, info);

    const pos = plotPositionFor(e, store.employees);
    built.group.position.copy(pos);
    // Face the centre
    built.group.lookAt(new THREE.Vector3(0, built.group.position.y, 0));

    // Label sprite
    const label = makeLabelSprite(e.name);
    label.position.set(0, (info.floors + 1) * FLOOR_HEIGHT + 1.4, 0);
    built.group.add(label);
    built.label = label;

    // Decor: gold hedges around base for each "Bewertung-Schmuck"
    addDecor(built.group, info.decor);

    // Character placeholder slot — populated in Part 2b
    built.character = null;
    built.info = info;

    state.scene.add(built.group);
    state.buildings.set(e.id, built);
  });

  // Highlight current user's building
  highlightOwnBuilding();
}

function addDecor(group, decorCount) {
  const n = Math.min(decorCount, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const hedge = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xb8860b, emissive: 0x3a2a05, emissiveIntensity: 0.5,
        metalness: 0.6, roughness: 0.4
      })
    );
    hedge.position.set(Math.cos(a) * 2.4, 0.3, Math.sin(a) * 2.4);
    hedge.castShadow = true;
    group.add(hedge);
  }
}

function highlightOwnBuilding() {
  const me = state.currentUserId;
  state.buildings.forEach((b, id) => {
    const isMine = id === me;
    if (b.label) b.label.material.opacity = isMine ? 1 : 0.7;
    // Gold pulse light at base for current user
    if (isMine && !b.glow) {
      const glow = new THREE.PointLight(0xf7d774, 1.2, 8, 2);
      glow.position.set(0, 0.6, 0);
      b.group.add(glow);
      b.glow = glow;
    }
  });
}

// =====================================================================
// PART 2b — CHARACTER AVATARS, DRONE, FOCUS CAMERA, IDLE ANIMATIONS
// =====================================================================

// ---------- PHOTO → AVATAR TEXTURE ---------------------------------
// Strategy: take the uploaded photo, auto-crop to a square around the centre
// (heuristically the face), composite onto a stylized cartoon-head canvas
// with a soft gold rim, then use that texture as the FRONT face of the
// avatar's head. The back/sides get a procedural skin-tone fallback.
function photoToHeadTexture(photoDataUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!photoDataUrl) {
      resolve(makeFallbackHeadTexture(opts.color || '#f7d774'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 512;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');

      // Background — gold radial halo
      const halo = ctx.createRadialGradient(size/2, size/2, 60, size/2, size/2, size/2);
      halo.addColorStop(0, '#3a2c0a');
      halo.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // Auto-crop: take the largest centered square of the source photo,
      // weighted slightly toward the top (where faces usually are)
      const sw = img.naturalWidth, sh = img.naturalHeight;
      const side = Math.min(sw, sh);
      const sx = (sw - side) / 2;
      const sy = Math.max(0, (sh - side) / 2 - side * 0.08); // bias upward

      // Circular clip for a clean cartoon-head look
      ctx.save();
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 24, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, sx, sy, side, side, 12, 12, size - 24, size - 24);

      // Subtle gold tint overlay so it harmonises with theme
      ctx.fillStyle = 'rgba(247, 215, 116, 0.08)';
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      // Gold rim
      const rim = ctx.createLinearGradient(0, 0, size, size);
      rim.addColorStop(0, '#f7d774');
      rim.addColorStop(1, '#b8860b');
      ctx.strokeStyle = rim;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 18, 0, Math.PI * 2);
      ctx.stroke();

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      resolve(tex);
    };
    img.onerror = () => resolve(makeFallbackHeadTexture(opts.color || '#f7d774'));
    img.src = photoDataUrl;
  });
}

function makeFallbackHeadTexture(color) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  // Skin-tone disc with gold rim and stylized smile
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 12, 0, Math.PI * 2);
  ctx.fillStyle = '#e7c89a';
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(size*0.38, size*0.45, 10, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(size*0.62, size*0.45, 10, 0, Math.PI*2); ctx.fill();
  // Smile
  ctx.strokeStyle = '#3a1f0a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(size/2, size*0.58, 28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  // Gold rim
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#f7d774'); grad.addColorStop(1, '#b8860b');
  ctx.strokeStyle = grad; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2 - 8, 0, Math.PI * 2); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- AVATAR (3D CARTOON BODY) -------------------------------
async function buildCharacter(emp) {
  const group = new THREE.Group();
  group.userData.empId = emp.id;
  group.userData.kind = 'character';

  // Body (rounded torso) — color tinted by employee colour
  const bodyColor = new THREE.Color(emp.color || '#d4af37');
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.7, 6, 14),
    new THREE.MeshStandardMaterial({
      color: bodyColor.clone().multiplyScalar(0.6),
      roughness: 0.55, metalness: 0.25
    })
  );
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);

  // Suit lapel — gold V
  const lapel = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.45, 3),
    goldMat()
  );
  lapel.rotation.x = Math.PI;
  lapel.rotation.y = Math.PI / 6;
  lapel.position.set(0, 0.75, 0.32);
  group.add(lapel);

  // Head — sphere with photo texture on the front
  const headTex = await photoToHeadTexture(emp.photo, { color: emp.color });
  const headMat = new THREE.MeshStandardMaterial({
    map: headTex,
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.05
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), headMat);
  head.position.y = 1.35;
  head.castShadow = true;
  // Rotate so the textured face points forward (+Z)
  head.rotation.y = 0;
  group.add(head);

  // Gold "halo" / hat ring above head — adds the cartoon flair
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.04, 10, 24),
    goldMat()
  );
  halo.position.y = 1.65;
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  // Arms
  const armMat = new THREE.MeshStandardMaterial({
    color: bodyColor.clone().multiplyScalar(0.55), roughness: 0.6
  });
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 8), armMat);
  armL.position.set(-0.42, 0.75, 0); armL.rotation.z = 0.25;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42; armR.rotation.z = -0.25;
  group.add(armR);

  // Legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 });
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.55, 4, 8), legMat);
  legL.position.set(-0.16, 0.18, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);

  // Role accessories
  if (emp.role === 'leader') {
    // Markus: gold crown
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.16, 8, 1, true),
      goldMat()
    );
    crown.position.y = 1.78; group.add(crown);
  } else if (emp.role === 'photographer') {
    // Olja: tiny camera in front
    const cam = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.3 })
    );
    cam.position.set(0, 1.1, 0.4);
    group.add(cam);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12),
      goldMat()
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.1, 0.5);
    group.add(lens);
  }

  // Save handles for animation
  group.userData.parts = { head, halo, armL, armR, legL, legR, body };
  group.userData.idle = {
    bobOffset: Math.random() * Math.PI * 2,
    armSwing: Math.random() * Math.PI * 2
  };
  return group;
}

// Place characters in front of each building
async function populateCharacters() {
  const promises = [];
  state.buildings.forEach((b, empId) => {
    const emp = store.employees.find(e => e.id === empId);
    if (!emp) return;
    promises.push(
      buildCharacter(emp).then(ch => {
        // Position in front of building (slightly toward centre)
        ch.position.set(0, 0, BASE_RADIUS + 0.9);
        // Face the centre / camera
        ch.rotation.y = Math.PI;
        b.group.add(ch);
        b.character = ch;
      })
    );
  });
  await Promise.all(promises);
}

// ---------- OLJA'S DRONE -------------------------------------------
function buildDrone() {
  const g = new THREE.Group();
  // Central body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.7, roughness: 0.3 })
  );
  body.castShadow = true;
  g.add(body);
  // Gold camera underneath
  const cam = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    goldMat()
  );
  cam.position.y = -0.14;
  g.add(cam);
  // 4 arms + rotors
  const armMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.4 });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0xf7d774, transparent: true, opacity: 0.45,
    emissive: 0xf7d774, emissiveIntensity: 0.7
  });
  const rotors = [];
  [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([sx, sz]) => {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.06, 0.06), armMat
    );
    arm.position.set(0.28 * sx, 0, 0.28 * sz);
    arm.rotation.y = Math.atan2(sz, sx);
    g.add(arm);
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), rotorMat
    );
    rotor.position.set(0.46 * sx, 0.06, 0.46 * sz);
    g.add(rotor);
    rotors.push(rotor);
  });
  // Beacon LED
  const led = new THREE.PointLight(0xf7d774, 0.8, 6, 2);
  led.position.y = -0.2;
  g.add(led);

  g.userData.rotors = rotors;
  return g;
}

function spawnDrone() {
  if (state.drone) state.scene.remove(state.drone);
  const drone = buildDrone();
  // Start on Olja's helipad
  const studio = state.buildings.get('olja');
  if (studio) {
    drone.position.copy(studio.group.position);
    drone.position.y = studio.helipadY ?? 8;
  } else {
    drone.position.set(0, 12, 0);
  }
  state.scene.add(drone);
  state.drone = drone;
  // Set up flight plan: figure-8 around the city, dipping over each building
  state.drone.userData.path = buildDronePath();
  state.drone.userData.t = 0;
}

// Drone path: parametric curve weaving through all employee buildings
function buildDronePath() {
  const points = [];
  const ring = PLOT_RADIUS + 4;
  // Arc above each seller, then loop back over Markus, then over each worker, then home
  const sellers = store.employees.filter(e => e.role === 'seller');
  const workers = store.employees.filter(e => e.role === 'worker');

  // Olja's helipad (start)
  points.push(new THREE.Vector3(OLJA_POS.x, 9, OLJA_POS.z));
  // Over each seller
  sellers.forEach((e, i) => {
    const total = sellers.length;
    const a = -Math.PI / 2 + (i + 0.5) * (Math.PI / total);
    points.push(new THREE.Vector3(Math.cos(a) * ring, 8 + Math.sin(i) * 1.5, Math.sin(a) * ring));
  });
  // Loop above Markus
  points.push(new THREE.Vector3(0, 14, 0));
  points.push(new THREE.Vector3(3, 12, -3));
  // Over each worker
  workers.forEach((e, i) => {
    const total = workers.length;
    const a = Math.PI / 2 + (i + 0.5) * (Math.PI / total);
    points.push(new THREE.Vector3(Math.cos(a) * ring, 8 + Math.cos(i) * 1.5, Math.sin(a) * ring));
  });
  // Loop above Markus again
  points.push(new THREE.Vector3(-3, 12, 3));
  points.push(new THREE.Vector3(0, 14, 0));
  // Return home
  points.push(new THREE.Vector3(OLJA_POS.x, 9, OLJA_POS.z));

  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.3);
}

// ---------- IDLE ANIMATIONS (called from main loop) ----------------
function updateIdleAnimations(t, dt) {
  // Character bob + arm sway
  state.buildings.forEach((b) => {
    const ch = b.character;
    if (!ch) return;
    const idle = ch.userData.idle;
    const phase = t * 1.6 + idle.bobOffset;
    ch.position.y = Math.sin(phase) * 0.06;
    const swing = Math.sin(t * 2.4 + idle.armSwing) * 0.18;
    ch.userData.parts.armL.rotation.x = -swing;
    ch.userData.parts.armR.rotation.x =  swing;
    // Halo gentle rotation
    ch.userData.parts.halo.rotation.z = t * 0.6;
  });

  // Markus' beacon pulse
  const markus = state.buildings.get('markus');
  if (markus?.beacon) {
    const k = 0.6 + Math.abs(Math.sin(t * 1.4)) * 0.4;
    markus.beacon.material.emissiveIntensity = 1.5 + k * 1.5;
    markus.beacon.scale.setScalar(0.95 + k * 0.1);
  }

  // Drone flight along path
  const drone = state.drone;
  if (drone && drone.userData.path) {
    drone.userData.t = (drone.userData.t + dt * 0.04) % 1;
    const pt    = drone.userData.path.getPoint(drone.userData.t);
    const next  = drone.userData.path.getPoint((drone.userData.t + 0.005) % 1);
    drone.position.copy(pt);
    drone.lookAt(next);
    // Bobbing
    drone.position.y += Math.sin(t * 4) * 0.08;
    // Spin rotors
    drone.userData.rotors?.forEach((r, i) => {
      r.rotation.y += dt * (40 + (i % 2 ? 4 : -4));
    });
  }
}

// ---------- FOCUS CAMERA -------------------------------------------
function focusBuilding(empId) {
  const b = state.buildings.get(empId);
  if (!b) return;
  state.focusedEmpId = empId;
  state.currentUserId = empId; // viewing also re-targets HUD
  highlightOwnBuilding();

  const target = b.group.position.clone();
  target.y = 4;
  const dir = target.clone().normalize();
  const camTarget = target.clone().add(dir.multiplyScalar(8)).add(new THREE.Vector3(0, 6, 0));
  flyCameraTo(camTarget, target);

  // Also bounce the character once for greeting
  const ch = b.character;
  if (ch) {
    const baseY = 0;
    tween({
      duration: 0.7,
      step: (k) => {
        const lift = Math.sin(k * Math.PI) * 0.6;
        ch.position.y = baseY + lift;
      }
    });
  }

  // HUD update is wired in Part 3; stub-safe
  updateHUDForFocused?.();
  showGreetingFor?.(empId);
}

function flyCameraTo(camPos, lookAt) {
  const startPos = state.camera.position.clone();
  const startTarget = state.controls.target.clone();
  tween({
    duration: 1.0,
    step: (k) => {
      state.camera.position.lerpVectors(startPos, camPos, k);
      state.controls.target.lerpVectors(startTarget, lookAt, k);
      state.controls.update();
    }
  });
}

function flyToCityOverview() {
  flyCameraTo(new THREE.Vector3(28, 22, 36), new THREE.Vector3(0, 4, 0));
  state.focusedEmpId = null;
}

// ---------- REBUILD HOOK -------------------------------------------
// Called whenever year/month/employee data changes
async function rebuildCity() {
  buildCity();
  await populateCharacters();
  spawnDrone();
}

// =====================================================================
// END OF PART 2b — say "Continue" for Part 3:
// login flow, HUD, navigation, year/month switcher
// =====================================================================
