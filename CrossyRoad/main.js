/**
 * Crossy Road — JavaScript / Three.js
 * Faithful recreation of the Hipster Whale mobile original.
 */

'use strict';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const TILE  = 1;          // world-unit size of one tile
const HALF  = TILE / 2;
const COLS  = 17;         // visible columns (–8 … +8)
const WORLD_HALF = Math.floor(COLS / 2);

// Lane types
const LANE = { GRASS: 'grass', ROAD: 'road', RIVER: 'river' };

// Palette – voxel-style flat colours
const COLORS = {
  grassLight : 0x7ec850,
  grassDark  : 0x6ab840,
  road       : 0x444444,
  roadLine   : 0xeeeeee,
  river      : 0x3a9ad9,
  riverDark  : 0x2d80bb,
  log        : 0x8B5E3C,
  logEnd     : 0x6B4528,
  // cars
  car1: 0xe74c3c, car2: 0x3498db, car3: 0xf1c40f,
  car4: 0x2ecc71, car5: 0xe67e22, car6: 0x9b59b6,
  // trucks
  truck1: 0x95a5a6, truck2: 0x7f8c8d,
  // player
  playerBody : 0xf5c518,
  playerBeak : 0xff9500,
  playerEye  : 0x111111,
  playerFeet : 0xff9500,
};

// ─────────────────────────────────────────────
//  THREE.JS BOOTSTRAP
// ─────────────────────────────────────────────
const canvas   = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x87ceeb);

const scene = new THREE.Scene();
scene.fog   = new THREE.Fog(0x87ceeb, 10, 20);

// 3/4 front-facing perspective camera
// Sits slightly right of center, low angle, looking slightly left toward the player
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
function positionCamera(playerZ) {
  camera.position.set(4, 9, playerZ + 5);
  camera.lookAt(0, 0, playerZ - 1);
}

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(5, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 60;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top  = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

// Resize handler
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────
//  GEOMETRY HELPERS
// ─────────────────────────────────────────────
function box(w, h, d, color, opts = {}) {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mat  = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  if (opts.castShadow)    mesh.castShadow    = true;
  if (opts.receiveShadow) mesh.receiveShadow = true;
  return mesh;
}

function makeMaterial(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// ─────────────────────────────────────────────
//  WORLD / LANE GENERATION
// ─────────────────────────────────────────────
const lanes     = [];   // lane descriptors indexed by row (z = -row)
const laneObjs  = {};   // THREE.Group for tile meshes per row key
const vehicles  = [];   // { mesh, lane, x, speed, width }
const logs      = [];   // { mesh, lane, x, speed, width }

let generatedUpTo = 0;  // highest row generated so far

// Starting safe grass rows
function initWorld() {
  for (let r = -5; r <= 0; r++) generateLane(r);
  generateLanes(40);
  buildTreeBarrier();
}

// Solid wall of trees at row -1 — prevents the player from hopping backwards past spawn
function buildTreeBarrier() {
  const row = -1;
  const z   = -row; // z = 1
  const group = new THREE.Group();
  group.position.z = z;

  // Grass ground for this row
  const ground = box(COLS * TILE, 0.15, TILE, COLORS.grassDark, { receiveShadow: true });
  ground.position.y = -0.075;
  group.add(ground);

  // Tree at every column
  for (let col = -WORLD_HALF; col <= WORLD_HALF; col++) {
    group.add(makeTree(col, 0));
  }

  scene.add(group);
  laneObjs[row] = group;

  // Register as a blocking grass lane so isBlockedByTree works
  lanes[row + 5] = { row, type: LANE.GRASS, dir: 0 };
}

function generateLanes(count) {
  for (let i = 0; i < count; i++) {
    generatedUpTo++;
    generateLane(generatedUpTo);
  }
}

/**
 * Build one row at z = -row.
 * row 0 = spawn row (grass)
 * row > 0 = progression
 */
function generateLane(row) {
  let type;
  if (row <= 0) {
    type = LANE.GRASS;
  } else {
    // Weighted random: guarantee safe grass every few rows
    const r = Math.random();
    if (r < 0.28)      type = LANE.GRASS;
    else if (r < 0.64) type = LANE.ROAD;
    else               type = LANE.RIVER;
  }

  // Never more than 3 rivers or 4 roads in a row
  const recent = lanes.slice(-4);
  const streak = (t) => {
    let c = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i] && recent[i].type === t) c++; else break;
    }
    return c;
  };
  if (type === LANE.RIVER  && streak(LANE.RIVER)  >= 3) type = LANE.GRASS;
  if (type === LANE.ROAD   && streak(LANE.ROAD)   >= 4) type = LANE.GRASS;

  const laneData = { row, type, dir: Math.random() < 0.5 ? 1 : -1 };
  lanes[row + 5] = laneData; // offset so negative rows work

  buildLaneMesh(laneData);
  if (type === LANE.ROAD)   spawnCars(laneData);
  if (type === LANE.RIVER)  spawnLogs(laneData);
}

function getLane(row) {
  return lanes[row + 5];
}

function buildLaneMesh(ld) {
  const { row, type } = ld;
  const z = -row;
  const group = new THREE.Group();
  group.position.z = z;

  // Ground tile (full width)
  let groundColor;
  if (type === LANE.GRASS)  groundColor = (row % 2 === 0) ? COLORS.grassLight : COLORS.grassDark;
  else if (type === LANE.ROAD)  groundColor = COLORS.road;
  else groundColor = (row % 2 === 0) ? COLORS.river : COLORS.riverDark;

  const ground = box(COLS * TILE, 0.15, TILE, groundColor, { receiveShadow: true });
  ground.position.y = -0.075;
  group.add(ground);

  // Road dashes
  if (type === LANE.ROAD) {
    for (let c = -WORLD_HALF; c <= WORLD_HALF; c++) {
      if (c % 2 !== 0) continue;
      const dash = box(0.55, 0.01, 0.12, COLORS.roadLine);
      dash.position.set(c * TILE, 0.01, 0);
      group.add(dash);
    }
  }

  // Grass decorations (trees, bushes)
  if (type === LANE.GRASS && row > 0) {
    const count = Math.floor(Math.random() * 3) + 1;
    const usedCols = new Set();
    for (let i = 0; i < count; i++) {
      let col;
      do { col = Math.floor(Math.random() * COLS) - WORLD_HALF; }
      while (usedCols.has(col));
      usedCols.add(col);
      if (Math.random() < 0.6) {
        group.add(makeTree(col, 0));
      } else {
        group.add(makeBush(col, 0));
      }
    }
  }

  scene.add(group);
  laneObjs[row] = group;
}

function makeTree(col, zOff) {
  const g = new THREE.Group();
  g.userData.blocking = true;

  // Tiny stub trunk — barely visible under the foliage
  const trunk = box(0.28, 0.25, 0.28, 0x6b4226, { castShadow: true });
  trunk.position.set(col, 0.125, zOff);
  g.add(trunk);

  // Main foliage block — large, tall, single cube like the reference
  const main = box(0.85, 0.95, 0.85, 0x5a9e20, { castShadow: true });
  main.position.set(col, 0.73, zOff);
  g.add(main);

  // Highlight band across the middle (lighter strip visible in the reference)
  const band = box(0.86, 0.18, 0.86, 0x7ec82a);
  band.position.set(col, 0.68, zOff);
  g.add(band);

  // Slightly smaller top block to give a subtle layered look
  const top = box(0.75, 0.35, 0.75, 0x4e8c1a, { castShadow: true });
  top.position.set(col, 1.22, zOff);
  g.add(top);

  return g;
}

function makeBush(col, zOff) {
  const g = new THREE.Group();
  g.userData.blocking = true;
  const b = box(0.35, 0.25, 0.3, 0x196f3d, { castShadow: true });
  b.position.set(col, 0.125, zOff);
  g.add(b);
  return g;
}

// ─────────────────────────────────────────────
//  VEHICLES
// ─────────────────────────────────────────────
const CAR_COLORS = [
  0x7b68ee,  // medium purple (like the reference)
  0xe74c3c,  // red
  0x3498db,  // blue
  0x2ecc71,  // green
  0xf39c12,  // orange
  0xe91e8c,  // pink
  0x1abc9c,  // teal
  0xf1c40f,  // yellow
];
const TRUCK_COLORS = [
  0xc0392b,  // red cab
  0xe67e22,  // orange cab
  0x2980b9,  // blue cab
  0x27ae60,  // green cab
  0x8e44ad,  // purple cab
];

function spawnCars(ld) {
  const { row, dir } = ld;
  const z = -row;
  const isTruck   = Math.random() < 0.25;
  const count     = isTruck ? Math.floor(Math.random() * 2) + 1 : Math.floor(Math.random() * 4) + 2;
  const speed     = (Math.random() * 0.02 + 0.015) * dir;
  const spacing   = COLS / count;
  const color     = isTruck
    ? TRUCK_COLORS[Math.floor(Math.random() * TRUCK_COLORS.length)]
    : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];

  for (let i = 0; i < count; i++) {
    const startX = (i * spacing) - WORLD_HALF + Math.random() * spacing * 0.5;
    const mesh   = isTruck ? makeTruck(color, dir) : makeCar(color, dir);
    mesh.position.set(startX, 0, z);
    scene.add(mesh);

    vehicles.push({
      mesh,
      row,
      speed,
      width: isTruck ? 2.2 : 0.9,
      isTruck,
    });
  }
}

function makeCar(color, dir) {
  const g = new THREE.Group();

  // ── Main body — full-width boxy slab
  const body = box(0.9, 0.32, 0.62, color, { castShadow: true });
  body.position.y = 0.22;
  g.add(body);

  // ── Cabin — slightly narrower, darker shade of same color, sits on top
  // Darken the color by multiplying each channel
  const c = new THREE.Color(color);
  c.multiplyScalar(0.72);
  const cabin = box(0.5, 0.28, 0.56, c.getHex(), { castShadow: true });
  cabin.position.set(-0.05, 0.52, 0);
  g.add(cabin);

  // ── Side windows — dark cutouts on the cabin sides (z faces)
  const winMat = makeMaterial(0x111122);
  [-0.29, 0.29].forEach(z => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.02), winMat);
    win.position.set(-0.04, 0.54, z);
    g.add(win);
  });

  // ── Headlights — small white squares on front face
  const lightMat = makeMaterial(0xffffcc);
  [-0.16, 0.16].forEach(z => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.1), lightMat);
    light.position.set(0.47, 0.18, z);
    g.add(light);
  });

  // ── Wheels — four dark square-ish blocks at corners
  const wMat = makeMaterial(0x1a1a1a);
  const rimMat = makeMaterial(0x666666);
  [
    [ 0.32, 0.1,  0.34],
    [-0.32, 0.1,  0.34],
    [ 0.32, 0.1, -0.34],
    [-0.32, 0.1, -0.34],
  ].forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), wMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, y, z);
    g.add(w);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 8), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y, z);
    g.add(rim);
  });

  if (dir < 0) g.rotation.y = Math.PI;
  return g;
}

function makeTruck(color, dir) {
  const g = new THREE.Group();

  // ── Trailer (long, tall, white/light — the dominant part)
  const trailerW = 1.5;
  const trailerH = 0.55;
  const trailerD = 0.6;
  const trailer = box(trailerW, trailerH, trailerD, 0xdce3e8, { castShadow: true });
  trailer.position.set(-0.28, trailerH / 2 + 0.08, 0);
  g.add(trailer);

  // Trailer undercarriage / chassis
  const chassis = box(trailerW + 0.05, 0.1, trailerD - 0.05, 0x888888);
  chassis.position.set(-0.28, 0.1, 0);
  g.add(chassis);

  // ── Cab (short, boxy, colored — flat front face)
  const cabW = 0.45;
  const cabH = 0.52;
  const cabD = 0.58;
  const cab = box(cabW, cabH, cabD, color, { castShadow: true });
  cab.position.set(0.73, cabH / 2 + 0.08, 0);
  g.add(cab);

  // Cab windshield (dark tinted)
  const wind = box(0.07, 0.2, cabD - 0.08, 0x222244);
  wind.position.set(0.73 + cabW / 2 - 0.02, cabH * 0.72, 0);
  g.add(wind);

  // Cab roof visor
  const visor = box(cabW + 0.04, 0.06, cabD + 0.04, 0xaaaaaa);
  visor.position.set(0.73, cabH + 0.08 + 0.03, 0);
  g.add(visor);

  // Exhaust stack on cab top-left
  const stack = box(0.06, 0.18, 0.06, 0x555555);
  stack.position.set(0.6, cabH + 0.08 + 0.15, cabD / 2 - 0.06);
  g.add(stack);

  // ── Wheels — two axles on trailer, one on cab
  const wMat = makeMaterial(0x1a1a1a);
  const rimMat = makeMaterial(0x888888);
  const wheelPositions = [
    // Trailer rear axle
    [ -0.85, 0.12,  trailerD / 2 + 0.03 ],
    [ -0.85, 0.12, -trailerD / 2 - 0.03 ],
    // Trailer mid axle
    [ -0.2,  0.12,  trailerD / 2 + 0.03 ],
    [ -0.2,  0.12, -trailerD / 2 - 0.03 ],
    // Cab axle
    [  0.73, 0.12,  cabD / 2 + 0.03 ],
    [  0.73, 0.12, -cabD / 2 - 0.03 ],
  ];
  wheelPositions.forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8), wMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, y, z);
    g.add(w);
    // Rim highlight
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 8), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y, z);
    g.add(rim);
  });

  // Flip for leftward travel
  if (dir < 0) g.rotation.y = Math.PI;
  return g;
}

function addWheels(group, vehicleLen, r) {
  const wMat = makeMaterial(0x1a1a1a);
  const offsets = [
    [vehicleLen * 0.35, 0.09, 0.3],
    [-vehicleLen * 0.35, 0.09, 0.3],
    [vehicleLen * 0.35, 0.09, -0.3],
    [-vehicleLen * 0.35, 0.09, -0.3],
  ];
  offsets.forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 8), wMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, y, z);
    group.add(w);
  });
}

// ─────────────────────────────────────────────
//  LOGS / RIVER
// ─────────────────────────────────────────────
function spawnLogs(ld) {
  const { row, dir } = ld;
  const z   = -row;
  const speed = (Math.random() * 0.025 + 0.015) * dir;
  const count = Math.floor(Math.random() * 3) + 2;
  const spacing = COLS / count;

  for (let i = 0; i < count; i++) {
    const len = Math.random() < 0.4 ? 2.0 : 1.3;
    const startX = (i * spacing) - WORLD_HALF + Math.random() * spacing * 0.4;
    const mesh   = makeLog(len);
    mesh.position.set(startX, 0.12, z);
    scene.add(mesh);

    // width = true visual half-extent * 2 (stored on mesh by makeLog)
    const trueWidth = mesh.userData.halfExtent * 2;
    logs.push({ mesh, row, speed, width: trueWidth, len });
  }
}

function makeLog(len) {
  const g = new THREE.Group();
  const body = box(len, 0.22, 0.5, COLORS.log, { castShadow: true, receiveShadow: true });
  g.add(body);
  // End caps – their centre sits at ±len/2, their half-width is 0.04,
  // so the visual edge of the log is at ±(len/2 + 0.04).
  const CAP_W = 0.08;
  [-len / 2, len / 2].forEach(x => {
    const cap = box(CAP_W, 0.22, 0.5, COLORS.logEnd);
    cap.position.x = x;
    g.add(cap);
  });
  // Bark rings
  for (let i = -1; i <= 1; i++) {
    const ring = box(0.04, 0.24, 0.52, COLORS.logEnd);
    ring.position.x = i * (len * 0.28);
    g.add(ring);
  }
  // Store the true visual half-extent on the group so collision checks are exact
  g.userData.halfExtent = len / 2 + CAP_W / 2;
  return g;
}

// ─────────────────────────────────────────────
//  PLAYER
// ─────────────────────────────────────────────
const playerGroup = new THREE.Group();
scene.add(playerGroup);

function buildPlayer() {
  // Clear previous meshes
  while (playerGroup.children.length) playerGroup.remove(playerGroup.children[0]);

  const WHITE  = 0xf5f0f0;
  const ORANGE = 0xe8763a;
  const PINK   = 0xf06090;
  const DARK   = 0x221122;

  // ── Body — large white box, slightly wider than tall
  const body = box(0.58, 0.62, 0.52, WHITE, { castShadow: true });
  body.position.y = 0.41;
  playerGroup.add(body);

  // ── Neck stub — thin connector between body and head
  const neck = box(0.28, 0.14, 0.26, WHITE);
  neck.position.y = 0.79;
  playerGroup.add(neck);

  // ── Head — slightly smaller white box
  const head = box(0.44, 0.40, 0.40, WHITE, { castShadow: true });
  head.position.y = 1.06;
  playerGroup.add(head);

  // ── Comb — pink/magenta block on top of head
  const comb = box(0.20, 0.22, 0.18, PINK, { castShadow: true });
  comb.position.set(0, 1.37, 0.04);
  playerGroup.add(comb);

  // ── Beak — orange block protruding from front of head
  const beak = box(0.16, 0.12, 0.16, ORANGE, { castShadow: true });
  beak.position.set(0, 1.02, 0.27);
  playerGroup.add(beak);

  // ── Wattle — small pink blob below beak
  const wattle = box(0.12, 0.10, 0.10, PINK);
  wattle.position.set(0, 0.90, 0.26);
  playerGroup.add(wattle);

  // ── Eyes — dark square on each side of the head
  [-0.16, 0.16].forEach(x => {
    const eye = box(0.06, 0.07, 0.04, DARK);
    eye.position.set(x, 1.08, 0.21);
    playerGroup.add(eye);
  });

  // ── Wing nubs — small white blocks on the sides of the body
  [-0.33, 0.33].forEach(x => {
    const wing = box(0.08, 0.22, 0.30, 0xddd8d8);
    wing.position.set(x, 0.46, 0.02);
    playerGroup.add(wing);
  });

  // ── Legs — two orange pillars
  [-0.14, 0.14].forEach(x => {
    const leg = box(0.10, 0.22, 0.10, ORANGE, { castShadow: true });
    leg.position.set(x, 0.11, 0);
    playerGroup.add(leg);

    // Foot — wide flat slab splayed forward and back
    const foot = box(0.14, 0.07, 0.28, ORANGE, { castShadow: true });
    foot.position.set(x, 0.035, 0.04);
    playerGroup.add(foot);
  });
}

buildPlayer();

// Player state
const player = {
  row    : 0,
  col    : 0,
  alive  : true,
  onLog  : null,       // log object the player is riding
  moving : false,      // animation in progress
  targetRow : 0,
  targetCol : 0,
  startPos  : new THREE.Vector3(),
  endPos    : new THREE.Vector3(),
  hopT   : 0,
  hopDur : 0.08,       // seconds per hop — keep snappy
  facingDir: 1,        // 1 = forward (+z), -1 = back, etc. for rotation
};

function playerWorldPos(row, col) {
  return new THREE.Vector3(col * TILE, 0, -row);
}

function syncPlayerMesh() {
  const p = playerWorldPos(player.row, player.col);
  playerGroup.position.set(p.x, p.y, p.z);
}

syncPlayerMesh();

// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
const keys = {};
let inputQueue = null; // at most one buffered move

window.addEventListener('keydown', e => {
  if (!keys[e.code]) {
    keys[e.code] = true;
    handleInput(e.code);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Touch / swipe
let touchStartX = 0;
let touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < 12) {
    // Tap = hop forward
    handleInput('ArrowUp');
    return;
  }
  if (absDx > absDy) {
    handleInput(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  } else {
    handleInput(dy > 0 ? 'ArrowDown' : 'ArrowUp');
  }
}, { passive: true });

// D-pad buttons
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.classList.add('active');
    handleInput(map[btn.dataset.dir]);
  });
  btn.addEventListener('pointerup',  () => btn.classList.remove('active'));
  btn.addEventListener('pointerout', () => btn.classList.remove('active'));
});

function handleInput(code) {
  if (gameState !== 'playing') return;

  // Only care about movement keys
  if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(code)) return;

  if (player.moving) {
    // If the hop is mostly done, snap it to completion and move immediately —
    // this eliminates the feeling of waiting for the animation to finish.
    if (player.hopT / player.hopDur >= 0.6) {
      player.moving = false;
      player.row    = player.targetRow;
      player.col    = player.targetCol;
      playerGroup.position.copy(player.endPos);
      playerGroup.scale.set(1, 1, 1);
      inputQueue = null;
      executeMove(code);
    } else {
      // Too early — buffer it, overwriting any older queued input
      inputQueue = code;
    }
    return;
  }

  executeMove(code);
}

function executeMove(code) {
  let dRow = 0, dCol = 0;
  if      (code === 'ArrowUp'    || code === 'KeyW') { dRow = 1;  }
  else if (code === 'ArrowDown'  || code === 'KeyS') { dRow = -1; }
  else if (code === 'ArrowLeft'  || code === 'KeyA') { dCol = -1; }
  else if (code === 'ArrowRight' || code === 'KeyD') { dCol = 1;  }
  else return;

  const newRow = player.row + dRow;
  const newCol = player.col + dCol;

  // Clamp columns
  if (newCol < -WORLD_HALF || newCol > WORLD_HALF) return;

  // Grass tile occupied by tree / bush? (blocking)
  const targetLane = getLane(newRow);
  if (targetLane && targetLane.type === LANE.GRASS && isBlockedByTree(newRow, newCol)) return;

  // Start hop
  player.targetRow = newRow;
  player.targetCol = newCol;
  player.startPos.copy(playerGroup.position);
  const ep = playerWorldPos(newRow, newCol);
  player.endPos.set(ep.x, 0, ep.z);
  player.hopT   = 0;
  player.moving = true;
  player.onLog  = null; // detach from log during hop

  // Face direction
  if      (dRow > 0) playerGroup.rotation.y = Math.PI;
  else if (dRow < 0) playerGroup.rotation.y = 0;
  else if (dCol < 0) playerGroup.rotation.y = -Math.PI / 2;
  else if (dCol > 0) playerGroup.rotation.y =  Math.PI / 2;

  // Reset idle timer
  idleTimer = 0;

  // Advance score
  if (dRow > 0 && newRow > highScore.session) {
    highScore.session = newRow;
    updateScoreDisplay();
  }

  // Generate more world
  if (newRow + 20 > generatedUpTo) generateLanes(30);
}

// Track which grass cols have trees (set per row)
const treeMap = {}; // row -> Set of blocked cols

function isBlockedByTree(row, col) {
  const obj = laneObjs[row];
  if (!obj) return false;
  for (const child of obj.children) {
    if (!child.userData.blocking) continue;
    // The first child of both trees and bushes sits at the obstacle's column
    const firstChild = child.children[0];
    if (!firstChild) continue;
    const wx = firstChild.position.x;
    if (Math.abs(wx - col) < 0.45) return true;
  }
  return false;
}

// ─────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────
let gameState = 'start'; // 'start' | 'playing' | 'dead'
let idleTimer = 0;
const IDLE_DEATH_TIME = 4.5; // seconds until eagle takes you
let bestScore = 0;
const highScore = { session: 0 };

const startScreen  = document.getElementById('start-screen');
const deathScreen  = document.getElementById('death-screen');
const finalScoreEl = document.getElementById('final-score');
const bestScoreEl  = document.getElementById('best-score');
const deathTitleEl = document.getElementById('death-title');
const scoreDisplayEl = document.getElementById('score-display');

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

function startGame() {
  // Reset world
  vehicles.forEach(v => scene.remove(v.mesh));
  vehicles.length = 0;
  logs.forEach(l => scene.remove(l.mesh));
  logs.length = 0;
  Object.keys(laneObjs).forEach(k => { scene.remove(laneObjs[k]); delete laneObjs[k]; });
  lanes.length = 0;
  generatedUpTo = 0;

  // Reset player
  player.row = 0; player.col = 0;
  player.alive = true; player.moving = false; player.onLog = null;
  player.hopT = 0;
  deathAnimCbs.length = 0;
  inputQueue = null;
  playerGroup.rotation.set(0, 0, 0);
  playerGroup.scale.set(1, 1, 1);
  playerGroup.position.set(0, 0, 0);
  buildPlayer();
  syncPlayerMesh();

  // Reset score
  highScore.session = 0;
  idleTimer = 0;
  updateScoreDisplay();

  initWorld();
  positionCamera(0);
  clock.getDelta(); // flush any accumulated idle time so first frame dt is ~0

  startScreen.classList.add('hidden');
  deathScreen.classList.add('hidden');
  gameState = 'playing';
}

function killPlayer(reason) {
  if (!player.alive) return;
  player.alive = false;
  gameState = 'dead';

  deathTitleEl.textContent =
    reason === 'car'   ? 'SQUASHED!' :
    reason === 'river' ? 'SPLAT!'    :
    reason === 'eagle' ? 'SNATCHED!' : 'GAME OVER';

  const s = highScore.session;
  if (s > bestScore) bestScore = s;

  finalScoreEl.textContent = s;
  bestScoreEl.textContent  = bestScore;

  // Squish animation
  playerDeathAnim(reason);

  setTimeout(() => {
    deathScreen.classList.remove('hidden');
  }, 900);
}

function playerDeathAnim(reason) {
  let t = 0;
  const dur = 0.5;
  function tick(dt) {
    t += dt;
    const p = Math.min(t / dur, 1);
    if (reason === 'car') {
      playerGroup.scale.set(1 + p * 0.6, Math.max(1 - p * 0.85, 0.1), 1 + p * 0.6);
    } else if (reason === 'river') {
      playerGroup.scale.set(1, Math.max(1 - p, 0.05), 1);
      playerGroup.position.y -= dt * 0.5;
    } else if (reason === 'eagle') {
      playerGroup.position.y += dt * 5;
      playerGroup.scale.setScalar(1 - p * 0.5);
    }
    if (p < 1) deathAnimCbs.push(tick);
  }
  deathAnimCbs.push(tick);
}

const deathAnimCbs = [];

function updateScoreDisplay() {
  scoreDisplayEl.textContent = highScore.session;
}

// ─────────────────────────────────────────────
//  COLLISION DETECTION
// ─────────────────────────────────────────────
function checkCollisions() {
  if (!player.alive || player.moving) return;

  const px = playerGroup.position.x;
  const pz = playerGroup.position.z;
  const pr = player.row;

  const lane = getLane(pr);
  if (!lane) return;

  if (lane.type === LANE.ROAD) {
    // Check all vehicles in this row
    for (const v of vehicles) {
      if (v.row !== pr) continue;
      const vx = v.mesh.position.x;
      const hw = (v.width / 2) + 0.25;
      if (Math.abs(px - vx) < hw) {
        killPlayer('car');
        return;
      }
    }
  }

  if (lane.type === LANE.RIVER) {
    // Must be on a log
    let onALog = false;
    for (const l of logs) {
      if (l.row !== pr) continue;
      const lx = l.mesh.position.x;
      if (Math.abs(px - lx) <= l.width / 2) {
        onALog = true;
        player.onLog = l;
        break;
      }
    }
    if (!onALog) {
      killPlayer('river');
    }
  }
}

// ─────────────────────────────────────────────
//  UPDATE LOOP
// ─────────────────────────────────────────────
const clock = new THREE.Clock();

function update(dt) {
  if (gameState !== 'playing') return;

  // ── Death animations
  const cbs = deathAnimCbs.splice(0);
  cbs.forEach(fn => fn(dt));

  // ── Hop animation
  if (player.moving) {
    player.hopT += dt;
    const t = Math.min(player.hopT / player.hopDur, 1);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    playerGroup.position.lerpVectors(player.startPos, player.endPos, eased);
    // Arc
    const arc = Math.sin(t * Math.PI) * 0.45;
    playerGroup.position.y = player.endPos.y + arc;

    // Squish on land
    if (t > 0.85) {
      const squish = 1 - (t - 0.85) / 0.15 * 0.25;
      playerGroup.scale.set(1 / squish, squish, 1 / squish);
    } else if (t < 0.1) {
      const stretch = 1 + t / 0.1 * 0.2;
      playerGroup.scale.set(1 / stretch, stretch, 1 / stretch);
    } else {
      playerGroup.scale.set(1, 1, 1);
    }

    if (t >= 1) {
      player.moving   = false;
      player.row      = player.targetRow;
      player.col      = player.targetCol;
      playerGroup.position.copy(player.endPos);
      playerGroup.scale.set(1, 1, 1);

      // Flush queued input immediately on landing
      if (inputQueue !== null) {
        const queued = inputQueue;
        inputQueue = null;
        executeMove(queued);
      }
    }
  }

  // ── Vehicles
  for (const v of vehicles) {
    v.mesh.position.x += v.speed;
    // Wrap around world
    if (v.mesh.position.x >  WORLD_HALF + 1.5) v.mesh.position.x = -WORLD_HALF - 1.5;
    if (v.mesh.position.x < -WORLD_HALF - 1.5) v.mesh.position.x =  WORLD_HALF + 1.5;
  }

  // ── Logs + rider
  for (const l of logs) {
    l.mesh.position.x += l.speed;
    if (l.mesh.position.x >  WORLD_HALF + l.len) l.mesh.position.x = -WORLD_HALF - l.len;
    if (l.mesh.position.x < -WORLD_HALF - l.len) l.mesh.position.x =  WORLD_HALF + l.len;
  }

  // Carry player on log
  if (!player.moving && player.onLog) {
    playerGroup.position.x += player.onLog.speed;
    player.col = Math.round(playerGroup.position.x);
    if (playerGroup.position.x < -WORLD_HALF - 0.5 || playerGroup.position.x > WORLD_HALF + 0.5) {
      killPlayer('river');
      return;
    }
  }

  // ── Re-attach to log after landing (before collision check)
  if (!player.moving && player.onLog === null) {
    const lane = getLane(player.row);
    if (lane && lane.type === LANE.RIVER) {
      for (const l of logs) {
        if (l.row !== player.row) continue;
        const lx = l.mesh.position.x;
        if (Math.abs(playerGroup.position.x - lx) <= l.width / 2) {
          player.onLog = l;
          break;
        }
      }
    }
  }

  // ── Collisions (checked every frame)
  checkCollisions();

  // ── Idle timer
  if (!player.moving) {
    idleTimer += dt;
    if (idleTimer >= IDLE_DEATH_TIME) {
      killPlayer('eagle');
    }
  }

  // ── Camera smooth follow — track ground Z only (ignore hop arc in Y)
  // Interpolate between current and target row to get a smooth ground position
  const groundZ = player.moving
    ? -(player.row + (player.targetRow - player.row) * Math.min(player.hopT / player.hopDur, 1))
    : -player.row;
  const targetCamZ = groundZ + 5;
  camera.position.z += (targetCamZ - camera.position.z) * 10 * dt;
  camera.position.x = 4;
  camera.position.y = 9;
  sun.position.z = camera.position.z - 5;

  // Clean up far-behind lane meshes
  const cullRow = player.row - 12;
  Object.keys(laneObjs).forEach(k => {
    if (parseInt(k) < cullRow) {
      scene.remove(laneObjs[k]);
      delete laneObjs[k];
    }
  });
  // Remove vehicles / logs far behind
  for (let i = vehicles.length - 1; i >= 0; i--) {
    if (vehicles[i].row < cullRow) {
      scene.remove(vehicles[i].mesh);
      vehicles.splice(i, 1);
    }
  }
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].row < cullRow) {
      scene.remove(logs[i].mesh);
      logs.splice(i, 1);
    }
  }
}

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameState === 'playing') {
    update(dt);
    // Camera lookAt uses ground Z — ignores the hop arc so camera doesn't bob vertically
    const groundZ = player.moving
      ? -(player.row + (player.targetRow - player.row) * Math.min(player.hopT / player.hopDur, 1))
      : -player.row;
    camera.lookAt(0, 0, groundZ - 1);
  }

  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
positionCamera(0);
animate();
// Show start screen (already shown by default)
