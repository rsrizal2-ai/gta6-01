// Cayo Verde: a procedural sun-soaked island city. A 9x9 road grid, pastel
// buildings, palms, a beach and pier to the south, a causeway to the north,
// and the story landmarks (garage, spray shop, hospital, precinct, the Kroll
// construction site). Everything is generated from one seed.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import {
  facadeTexture, roadTexture, sidewalkTexture, sandTexture, grassTexture,
  roofTexture, signTexture, billboardTexture, skyTexture,
} from './textures.js';

export const PITCH = 52;          // road centreline spacing
export const ROAD_HALF = 6;       // half road width
export const GRID = 8;            // blocks per axis
export const CITY_EDGE = 234;     // half extent of the street grid

// Block (i,j) centre, i and j in 0..7.
export function blockCentre(i, j) {
  return { x: -182 + i * PITCH, z: -182 + j * PITCH };
}
// Road intersection corners around block (i,j), clockwise from north-west.
export function blockCorners(i, j) {
  const x0 = -208 + i * PITCH, z0 = -208 + j * PITCH;
  return [
    { x: x0, z: z0 }, { x: x0 + PITCH, z: z0 },
    { x: x0 + PITCH, z: z0 + PITCH }, { x: x0, z: z0 + PITCH },
  ];
}

const PALETTE = ['#f2e3c6', '#f6c9a8', '#f2a9a0', '#a8d8c8', '#f9e79f', '#e8b4b8', '#c9d6a8', '#f5d0a9', '#b8cce0', '#e8d8b8'];
const ROOF_EDGE = ['#b8574a', '#4a7a8c', '#8c6a4a', '#5a8a5a', '#7a5a8c'];

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const solids = []; // building meshes, so combat raycasts stop at walls
  const group = new THREE.Group();
  scene.add(group);

  const addCollider = (x, z, hx, hz) => {
    colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
  };
  // Push a circle out of every collider it overlaps; returns corrected x/z.
  function collideCircle(x, z, r) {
    for (const c of colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) { x = c.maxX + r; continue; }
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      }
    }
    return { x, z };
  }

  // ---- sky, sun, haze -------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  sky.position.y = -40;
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  sun.position.set(180, 260, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0x9fc4e8, 0x8a6a4a, 0.85));
  scene.fog = new THREE.Fog(0xf2c184, 260, 760);

  // ---- ground planes --------------------------------------------------
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTexture() });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture() });
  const roadGeoH = new THREE.PlaneGeometry(CITY_EDGE * 2 + 24, ROAD_HALF * 2);
  const roadGeoV = new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_EDGE * 2 + 24);
  for (let k = -4; k <= 4; k++) {
    const hRoad = new THREE.Mesh(roadGeoH, roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.02, k * PITCH);
    hRoad.receiveShadow = true;
    group.add(hRoad);
    const vRoad = new THREE.Mesh(roadGeoV, roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.rotation.z = Math.PI / 2;
    vRoad.position.set(k * PITCH, 0.03, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
  }

  // Beach sand and the ocean, south; open water and the causeway, north.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1200, 60), new THREE.MeshLambertMaterial({ map: sandTexture() }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY_EDGE + 28);
  group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2e8ba8, transparent: true, opacity: 0.92 });
  const oceanS = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), waterMat);
  oceanS.rotation.x = -Math.PI / 2;
  oceanS.position.set(0, -0.4, CITY_EDGE + 58 + 250);
  group.add(oceanS);
  const oceanN = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), waterMat.clone());
  oceanN.rotation.x = -Math.PI / 2;
  oceanN.position.set(0, -0.4, -CITY_EDGE - 58 - 250);
  group.add(oceanN);

  // Causeway bridge deck to the north, the finale's escape route.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 90), roadMat);
  deck.position.set(26, 0.02, -CITY_EDGE - 44);
  deck.receiveShadow = true;
  group.add(deck);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 90), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
    rail.position.set(26 + side * 7, 0.6, -CITY_EDGE - 44);
    group.add(rail);
  }
  addCollider(26 - 7.5, -CITY_EDGE - 44, 0.5, 45);
  addCollider(26 + 7.5, -CITY_EDGE - 44, 0.5, 45);

  // ---- shared materials / geometries ----------------------------------
  const sidewalkMat = new THREE.MeshLambertMaterial({ map: sidewalkTexture() });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a, side: THREE.DoubleSide });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e2e34 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 7, 7);
  const frondGeo = new THREE.BoxGeometry(4.2, 0.08, 0.7);
  const lampPoleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 8);

  const facades = [];
  for (let v = 0; v < 6; v++) {
    facades.push(facadeTexture(PALETTE[v % PALETTE.length], 3 + (v % 4), 4, rng));
  }
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTexture() });

  function makePalm(x, z, s = 1) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = rng.range(-0.08, 0.08);
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (f / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.7, 7, Math.sin(a) * 1.7);
      frond.rotation.y = -a;
      frond.rotation.z = 0.42;
      frond.castShadow = true;
      palm.add(frond);
    }
    palm.position.set(x, 0, z);
    palm.scale.setScalar(s);
    return palm;
  }

  function makeLamp(x, z) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(lampPoleGeo, lampMat);
    pole.position.y = 3;
    lamp.add(pole);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = 6.2;
    lamp.add(bulb);
    lamp.position.set(x, 0, z);
    return lamp;
  }

  function makeBuilding(x, z, w, d, h, facadeIdx, edgeColor) {
    // One material: the trim slab covers the roof, so no face needs its own.
    const side = new THREE.MeshLambertMaterial({ map: facades[facadeIdx % facades.length] });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), side);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    solids.push(b);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), new THREE.MeshLambertMaterial({ color: edgeColor }));
    trim.position.set(x, h + 0.2, z);
    group.add(trim);
    addCollider(x, z, w / 2 + 0.2, d / 2 + 0.2);
    return b;
  }

  function makeSign(x, z, y, w, h, lines, bg, fg, rotY = 0) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: signTexture(lines, bg, fg) }),
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    group.add(sign);
    return sign;
  }

  // ---- blocks ---------------------------------------------------------
  const special = new Set(['2,2', '5,6', '1,5', '6,5', '6,1', '3,3', '4,4']);
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const { x: cx, z: cz } = blockCentre(i, j);
      const key = `${i},${j}`;
      // Sidewalk slab for the whole block.
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), sidewalkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.04, cz);
      slab.receiveShadow = true;
      group.add(slab);
      if (special.has(key)) continue;
      // One to three buildings per ordinary block, kept off the slab edge.
      const count = rng.int(1, 3);
      for (let b = 0; b < count; b++) {
        const w = rng.range(10, 16), d = rng.range(10, 16), h = rng.range(8, 30);
        const bx = cx + rng.range(-8, 8), bz = cz + rng.range(-8, 8);
        makeBuilding(bx, bz, w, d, h, rng.int(0, 5), ROOF_EDGE[rng.int(0, ROOF_EDGE.length - 1)]);
      }
      // One palm per ordinary block, at a slab corner.
      group.add(makePalm(cx + (rng.chance(0.5) ? -17 : 17), cz + (rng.chance(0.5) ? -17 : 17), rng.range(0.85, 1.15)));
    }
  }

  // Street lamps at every other intersection, clear of the driving lanes.
  for (let k = -4; k <= 4; k += 2) {
    for (let m = -4; m <= 4; m += 2) {
      group.add(makeLamp(k * PITCH + 8, m * PITCH + 8));
    }
  }

  // ---- plaza (block 3,3): fountain, benches, palms --------------------
  {
    const { x: cx, z: cz } = blockCentre(3, 3);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.6, 1.1, 20), new THREE.MeshLambertMaterial({ color: 0xcfc4ae }));
    basin.position.set(cx, 0.55, cz);
    basin.castShadow = true;
    group.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.3, 20), waterMat);
    water.position.set(cx, 1.0, cz);
    group.add(water);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3.4, 8), new THREE.MeshLambertMaterial({ color: 0xe8e0cc }));
    jet.position.set(cx, 2.2, cz);
    group.add(jet);
    addCollider(cx, cz, 5.6, 5.6);
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * Math.PI * 2 + Math.PI / 4;
      group.add(makePalm(cx + Math.cos(a) * 14, cz + Math.sin(a) * 14, 1.1));
    }
  }

  // ---- park (block 4,4): lawn, palms, footpaths -----------------------
  {
    const { x: cx, z: cz } = blockCentre(4, 4);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), grassMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(cx, 0.06, cz);
    group.add(lawn);
    for (let p = 0; p < 6; p++) {
      group.add(makePalm(cx + rng.range(-15, 15), cz + rng.range(-15, 15), rng.range(0.9, 1.25)));
    }
  }

  // ---- Marín Motors garage + lot (block 2,2) --------------------------
  const landmarks = {};
  {
    const { x: cx, z: cz } = blockCentre(2, 2);
    makeBuilding(cx - 4, cz - 8, 26, 14, 9, 1, '#b8574a');
    makeSign(cx - 4, cz - 0.8, 6.5, 20, 4, ['MARÍN MOTORS'], '#22303c', '#ffd98a');
    // Open service bay: a low canopy where the save point sits.
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x8c4a3a }));
    canopy.position.set(cx - 4, 4.6, cz + 8);
    canopy.castShadow = true;
    group.add(canopy);
    for (const px of [-10, 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), lampMat);
      post.position.set(cx + px, 2.3, cz + 12);
      group.add(post);
    }
    landmarks.garage = { x: cx - 4, z: cz + 8 };
    landmarks.sal = { x: cx - 4, z: cz + 2 };
  }

  // ---- Luz Auto Paint spray shop (block 5,6) --------------------------
  {
    const { x: cx, z: cz } = blockCentre(5, 6);
    makeBuilding(cx, cz - 9, 24, 12, 8, 3, '#4a7a8c');
    makeSign(cx, cz - 2.8, 6, 18, 3.6, ['LUZ AUTO PAINT'], '#7a2e6e', '#ffffff');
    // Paint bay: drive-in floor pad.
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshLambertMaterial({ color: 0x565a6e }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0.08, cz + 8);
    group.add(pad);
    landmarks.sprayShop = { x: cx, z: cz + 8 };
  }

  // ---- Hospital (block 1,5) -------------------------------------------
  {
    const { x: cx, z: cz } = blockCentre(1, 5);
    makeBuilding(cx, cz - 4, 26, 20, 16, 4, '#e8e8e8');
    makeSign(cx, cz + 6.4, 10, 16, 4, ['HOSPITAL'], '#ffffff', '#c0392b');
    landmarks.hospital = { x: cx, z: cz + 12 };
  }

  // ---- Central Precinct (block 6,5) ------------------------------------
  {
    const { x: cx, z: cz } = blockCentre(6, 5);
    makeBuilding(cx, cz - 4, 26, 20, 14, 5, '#3a4a6a');
    makeSign(cx, cz + 6.4, 9, 16, 4, ['POLICE'], '#22303c', '#9fc4e8');
    landmarks.police = { x: cx, z: cz + 12 };
  }

  // ---- Kroll Tower construction site (block 6,1) -----------------------
  {
    const { x: cx, z: cz } = blockCentre(6, 1);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
    for (const fx of [-8, 0, 8]) {
      for (const fz of [-8, 0, 8]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), frameMat);
        col.position.set(cx + fx, 11, cz + fz);
        col.castShadow = true;
        group.add(col);
      }
    }
    for (const fy of [6, 12, 18]) {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.8, 20), frameMat);
      floor.position.set(cx, fy, cz);
      floor.castShadow = true;
      group.add(floor);
    }
    addCollider(cx, cz, 10, 10);
    // Tower crane beside the frame.
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xe8a33c });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, 34, 1.6), craneMat);
    mast.position.set(cx + 15, 17, cz - 12);
    mast.castShadow = true;
    group.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 1.2), craneMat);
    jib.position.set(cx + 15, 33, cz - 12);
    group.add(jib);
    addCollider(cx + 15, cz - 12, 1.5, 1.5);
    // Site fence and crates.
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0xc87a2e });
    for (const [fx, fz, w, d] of [[cx, cz - 19, 40, 0.4], [cx, cz + 19, 40, 0.4], [cx - 19, cz, 0.4, 40], [cx + 19, cz, 0.4, 40]]) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fenceMat);
      fence.position.set(fx, 1.2, fz);
      group.add(fence);
    }
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
    for (let c = 0; c < 5; c++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), crateMat);
      const px = cx + rng.range(-15, 15), pz = cz + rng.range(-15, 15);
      crate.position.set(px, 1, pz);
      crate.rotation.y = rng.range(0, 1);
      crate.castShadow = true;
      group.add(crate);
      addCollider(px, pz, 1.2, 1.2);
    }
    makeSign(cx - 12, cz + 19.4, 4, 12, 2.6, ['KROLL TOWER'], '#333333', '#ffd98a');
    landmarks.kroll = { x: cx, z: cz };
    landmarks.krollLot = { x: cx - 14, z: cz + 6 }; // clear of the parked row at cz+14
  }

  // ---- Marina pier (south, off block column 3) -------------------------
  {
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 46), pierMat);
    pier.position.set(-26, 0.02, CITY_EDGE + 48);
    pier.receiveShadow = true;
    group.add(pier);
    for (const pz of [CITY_EDGE + 30, CITY_EDGE + 48, CITY_EDGE + 66]) {
      for (const px of [-29, -23]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), pierMat);
        post.position.set(px, -0.5, pz);
        group.add(post);
      }
    }
    const shack = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), new THREE.MeshLambertMaterial({ color: 0x4a7a8c }));
    shack.position.set(-26, 2.1, CITY_EDGE + 66);
    shack.castShadow = true;
    group.add(shack);
    addCollider(-26, CITY_EDGE + 66, 3.2, 2.7);
    landmarks.pier = { x: -26, z: CITY_EDGE + 58 };
    landmarks.pierEnd = { x: -26, z: CITY_EDGE + 44 };
  }

  // ---- billboards (kept out of intersections and road lanes) -----------
  const billboards = [
    { x: -182, z: -130, lines: ['VISIT CAYO VERDE', 'sun · salt · sirens'], bg: '#1e6f8c', fg: '#ffffff', accent: '#ffd98a' },
    { x: 130, z: 26, lines: ['LUZ AUTO PAINT', 'a new colour, a clean slate'], bg: '#7a2e6e', fg: '#ffffff', accent: '#ffd98a' },
    { x: -78, z: 182, lines: ['PLAYA VERDE', 'the island is yours'], bg: '#e8722a', fg: '#ffffff', accent: '#22303c' },
  ];
  for (const b of billboards) {
    const posts = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), lampMat);
    posts.position.set(b.x, 4.5, b.z);
    group.add(posts);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 8),
      new THREE.MeshBasicMaterial({ map: billboardTexture(b.lines, b.bg, b.fg, b.accent) }),
    );
    board.position.set(b.x, 12, b.z);
    board.rotation.y = Math.PI / 4;
    group.add(board);
    addCollider(b.x, b.z, 0.8, 0.8);
  }

  // ---- beach props: palms and umbrellas --------------------------------
  for (let p = 0; p < 14; p++) {
    group.add(makePalm(rng.range(-220, 220), CITY_EDGE + rng.range(6, 44), rng.range(0.9, 1.3)));
  }
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xe84a5a });
  for (let u = 0; u < 6; u++) {
    const ux = rng.range(-200, 200), uz = CITY_EDGE + rng.range(10, 40);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), trunkMat);
    pole.position.set(ux, 1.3, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 8), umbrellaMat);
    top.position.set(ux, 2.9, uz);
    top.castShadow = true;
    group.add(top);
    addCollider(ux, uz, 0.3, 0.3);
  }

  // ---- drifting clouds --------------------------------------------------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds = [];
  for (let c = 0; c < 9; c++) {
    const cloud = new THREE.Group();
    for (let s = 0; s < 4; s++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 12), 8, 6), cloudMat);
      puff.position.set(rng.range(-10, 10), rng.range(-2, 2), rng.range(-4, 4));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-400, 400), rng.range(120, 170), rng.range(-350, 350));
    scene.add(cloud);
    clouds.push(cloud);
  }

  landmarks.plaza = { x: -26, z: -26 };
  landmarks.park = { x: 26, z: 26 };
  landmarks.causeway = { x: 26, z: -CITY_EDGE - 80 };
  landmarks.beach = { x: 60, z: CITY_EDGE + 30 };

  function update(dt, t) {
    oceanS.position.y = -0.4 + Math.sin(t * 0.5) * 0.08;
    oceanN.position.y = -0.4 + Math.cos(t * 0.4) * 0.08;
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.6;
      if (cloud.position.x > 480) cloud.position.x = -480;
    }
    // Keep the shadow frustum near the action: main.js moves the target.
    sun.target.updateMatrixWorld();
  }

  return { group, colliders, collideCircle, landmarks, sun, solids, update };
}
