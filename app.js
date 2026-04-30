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

// Stub — real version in Part 2
function focusBuilding(empId) {
  state.focusedEmpId = empId;
  // Full focus camera animation arrives in Part 2
}

// =====================================================================
// END OF PART 1 — wait for "Continue" to receive Part 2:
// 3D buildings, characters, photo→avatar, animations
// =====================================================================
