// The wanted system: crimes raise stars, cruisers pursue, foot cops chase
// and bust, and the heat dies down when the police lose sight of Dani —
// or when Luz repaints the car at the spray shop.
import * as THREE from 'three';
import { clamp, wrapAngle, dist2D } from './rng.js';
import { Car } from './vehicles.js';
import { makeHumanoid, poseHumanoid } from './characters.js';

const COP_OUTFIT = { skin: 0xf2c89b, shirt: 0x2a3a5a, pants: 0x1e2a3a, hair: 0x111111 };

export class Police {
  constructor(scene, city, hooks) {
    this.scene = scene;
    this.city = city;
    this.hooks = hooks;
    this.wanted = 0;
    this.lastSeen = -999;
    this.time = 0;
    this.cruisers = [];
    this.cops = [];
    this.bustTimer = 0;
    this.sirenWanted = false;
    this.losRay = new THREE.Raycaster();
  }

  // True when no building stands between the two ground points.
  hasLineOfSight(ax, az, bx, bz) {
    const origin = new THREE.Vector3(ax, 2, az);
    const target = new THREE.Vector3(bx, 1.5, bz);
    const dir = target.clone().sub(origin);
    const dist = dir.length();
    if (dist < 0.01) return true;
    this.losRay.set(origin, dir.normalize());
    this.losRay.far = dist;
    return this.losRay.intersectObjects(this.city.solids, false).length === 0;
  }

  addWanted(stars, reason) {
    if (stars <= 0) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    if (this.wanted > before && this.hooks.onWanted) this.hooks.onWanted(this.wanted, reason);
    this.lastSeen = this.time;
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.lastSeen = this.time;
  }

  clearWanted(reason) {
    if (this.wanted === 0) return;
    this.wanted = 0;
    this.bustTimer = 0;
    for (const c of this.cruisers) c.remove(this.scene);
    this.cruisers = [];
    for (const cop of this.cops) this.scene.remove(cop.parts.group);
    this.cops = [];
    if (this.hooks.onCleared) this.hooks.onCleared(reason);
  }

  // A crime is only reported when someone sees it — or a cruiser is near.
  reportCrime(kind, x, z, witnessed) {
    const stars = { steal: 1, assault: 1, shoot: 1, kill: 2, ram: 1, copHit: 2 }[kind] || 1;
    if (!witnessed && this.cruisers.length === 0 && this.wanted === 0) return false;
    this.addWanted(stars, kind);
    return true;
  }

  spawnCruiserNear(player) {
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 30;
    let x = player.x + Math.cos(a) * r;
    let z = player.z + Math.sin(a) * r;
    // Snap onto the nearest road so cruisers never appear inside a building.
    if (Math.abs(x % 52) < 26) x = Math.round(x / 52) * 52;
    else z = Math.round(z / 52) * 52;
    x = clamp(x, -220, 220); z = clamp(z, -220, 220);
    const car = new Car(this.scene, 'cruiser', 0x1a2a3a, x, z, Math.atan2(-(player.x - x), -(player.z - z)));
    this.cruisers.push(car);
    return car;
  }

  spawnCopNear(player) {
    const a = Math.random() * Math.PI * 2;
    const x = player.x + Math.cos(a) * 26;
    const z = player.z + Math.sin(a) * 26;
    const parts = makeHumanoid(COP_OUTFIT);
    // A peaked cap marks the police at a glance.
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x1e2a3a }));
    cap.position.y = 1.98;
    parts.group.add(cap);
    parts.group.position.set(x, 0, z);
    this.scene.add(parts.group);
    const cop = { parts, x, z, heading: 0, phase: 0, down: false };
    parts.group.traverse((o) => { if (o.isMesh) o.userData.hit = { kind: 'cop', ref: cop }; });
    this.cops.push(cop);
    return cop;
  }

  update(dt, player, allCars) {
    this.time += dt;
    const targetCruisers = this.wanted === 0 ? 0 : Math.min(4, this.wanted);
    const targetCops = this.wanted >= 3 && !player.driving ? 2 : 0;

    // Wrecked cruisers are towed away so fresh ones can join the chase.
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      if (this.cruisers[i].dead) {
        this.cruisers[i].remove(this.scene);
        this.cruisers.splice(i, 1);
      }
    }
    while (this.cruisers.length < targetCruisers) this.spawnCruiserNear(player);
    while (this.cruisers.length > targetCruisers) {
      const c = this.cruisers.pop();
      c.remove(this.scene);
    }
    while (this.cops.length < targetCops) this.spawnCopNear(player);
    while (this.cops.length > targetCops) {
      const cop = this.cops.pop();
      this.scene.remove(cop.parts.group);
    }

    let anyNear = false;
    // --- cruiser pursuit ---
    for (const car of this.cruisers) {
      const dx = player.x - car.x, dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 55 && this.hasLineOfSight(car.x, car.z, player.x, player.z)) anyNear = true;
      // Aim slightly ahead of a moving target.
      const lead = player.driving ? 0.5 : 0;
      const tx = player.x + (player.driving ? player.driving.forward.x * player.driving.speed * lead : 0);
      const tz = player.z + (player.driving ? player.driving.forward.z * player.driving.speed * lead : 0);
      const desired = Math.atan2(-(tx - car.x), -(tz - car.z));
      const steer = clamp(wrapAngle(desired - car.heading) * 2.4, -1, 1);
      const throttle = dist > 6 ? 1 : 0.4;
      car.update(dt, { throttle, steer, handbrake: false }, this.city.collideCircle, allCars, this.hooks.carHooks);
      if (dist > 240) {
        // Teleport a lost cruiser back into the chase.
        const a = Math.random() * Math.PI * 2;
        car.x = clamp(player.x + Math.cos(a) * 80, -220, 220);
        car.z = clamp(player.z + Math.sin(a) * 80, -220, 220);
        car.speed = 0;
      }
    }

    // --- foot cops ---
    let busting = false;
    for (const cop of this.cops) {
      if (cop.down) continue;
      const dx = player.x - cop.x, dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 55 && this.hasLineOfSight(cop.x, cop.z, player.x, player.z)) anyNear = true;
      if (player.driving) {
        poseHumanoid(cop.parts, 'idle', cop.phase, 0.4);
        cop.phase += dt;
        continue;
      }
      cop.heading = Math.atan2(dx, dz);
      if (dist > 2.2) {
        const speed = 6.6;
        const nx = cop.x + (dx / dist) * speed * dt;
        const nz = cop.z + (dz / dist) * speed * dt;
        const fixed = this.city.collideCircle(nx, nz, 0.45);
        cop.x = fixed.x; cop.z = fixed.z;
        cop.phase += speed * dt * 1.9;
        poseHumanoid(cop.parts, 'run', cop.phase, 1);
      } else {
        poseHumanoid(cop.parts, 'idle', cop.phase, 0.4);
        busting = true;
      }
      cop.parts.group.position.set(cop.x, 0, cop.z);
      cop.parts.group.rotation.y = cop.heading;
    }

    // --- bust / evade ---
    if (busting && this.wanted > 0) {
      this.bustTimer += dt;
      if (this.bustTimer > 3 && this.hooks.onBusted) {
        this.bustTimer = 0;
        this.hooks.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    if (anyNear) this.lastSeen = this.time;
    if (this.wanted > 0 && this.time - this.lastSeen > 10 + this.wanted * 3) {
      this.clearWanted('evaded');
    }
    this.sirenWanted = this.cruisers.length > 0;
  }
}
