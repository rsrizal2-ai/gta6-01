// The living city: traffic cars looping the blocks, parked cars in lots,
// and pedestrians walking the sidewalks who flee crimes and report them.
// Parked cars live in lots only, never in a driving lane.
import * as THREE from 'three';
import { makeRng, clamp, wrapAngle, dist2D } from './rng.js';
import { Car, CAR_STYLES, CAR_COLORS } from './vehicles.js';
import { makeHumanoid, randomOutfit, poseHumanoid } from './characters.js';
import { blockCorners, blockCentre } from './city.js';

// Waypoints around a block, offset to the right-hand lane of each segment.
function laneLoop(i, j, clockwise) {
  const corners = blockCorners(i, j);
  if (!clockwise) corners.reverse();
  const pts = [];
  for (let s = 0; s < corners.length; s++) {
    const a = corners[s], b = corners[(s + 1) % corners.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    // Right of travel, 3m from the centreline.
    const rx = (-dz / len) * 3.0, rz = (dx / len) * 3.0;
    pts.push({ x: b.x + rx, z: b.z + rz });
  }
  return pts;
}

// Sidewalk loop: the same rectangle pulled onto the block's slab.
function walkLoop(i, j) {
  const c = blockCentre(i, j);
  return [
    { x: c.x - 17, z: c.z - 17 }, { x: c.x + 17, z: c.z - 17 },
    { x: c.x + 17, z: c.z + 17 }, { x: c.x - 17, z: c.z + 17 },
  ];
}

export class Traffic {
  constructor(scene, city, seed, hooks) {
    this.scene = scene;
    this.city = city;
    this.hooks = hooks;
    this.rng = makeRng(seed ^ 0x9e37);
    this.cars = [];
    this.parked = [];
    this.peds = [];
    this.styles = ['sedan', 'sedan', 'hatch', 'pickup', 'van', 'sport'];

    for (let n = 0; n < 10; n++) this.spawnTrafficCar(true);
    this.spawnParkedCars();
    for (let n = 0; n < 22; n++) this.spawnPed(true);
  }

  spawnTrafficCar(anywhere) {
    const i = this.rng.int(0, 7), j = this.rng.int(0, 7);
    const loop = laneLoop(i, j, this.rng.chance(0.5));
    const wp = this.rng.int(0, 3);
    const start = loop[wp];
    const style = this.rng.pick(this.styles);
    const car = new Car(this.scene, style, this.rng.pick(CAR_COLORS), start.x, start.z, 0);
    const next = loop[(wp + 1) % loop.length];
    car.heading = Math.atan2(-(next.x - start.x), -(next.z - start.z));
    // A driver figure in the seat, removed when the car is stolen.
    const driver = makeHumanoid(randomOutfit(this.rng));
    driver.group.scale.setScalar(0.92);
    driver.group.position.set(-0.42, 0.62, 0.25);
    poseHumanoid(driver, 'sit', 0);
    car.mesh.add(driver.group);
    car.driver = driver;
    this.cars.push({ car, loop, wp: (wp + 1) % loop.length, speed: this.rng.range(8, 12), stuckTimer: 0 });
    return car;
  }

  spawnParkedCars() {
    const lots = [
      { x: -82, z: -64, n: 4, dx: 3.2, dz: 0, heading: Math.PI },       // garage lot (inside the block, facing the road)
      { x: -130, z: 100, n: 3, dx: 3.2, dz: 0, heading: 0 },            // hospital lot
      { x: 130, z: 100, n: 3, dx: 3.2, dz: 0, heading: 0, police: true }, // precinct lot
      { x: -40, z: -26, n: 4, dx: 0, dz: 3.4, heading: Math.PI / 2 },   // plaza edge (inside the block, facing the road)
      { x: 60, z: 226, n: 4, dx: 3.2, dz: 0, heading: 0 },              // beach lot
      { x: 116, z: -116, n: 2, dx: 3.2, dz: 0, heading: Math.PI / 2 },  // Kroll lot
    ];
    for (const lot of lots) {
      for (let k = 0; k < lot.n; k++) {
        const style = lot.police ? 'cruiser' : this.rng.pick(this.styles);
        const color = lot.police ? 0x1a2a3a : this.rng.pick(CAR_COLORS);
        const car = new Car(this.scene, style, color, lot.x + lot.dx * k, lot.z + lot.dz * k, lot.heading);
        this.parked.push(car);
      }
    }
  }

  // All cars the player can steal or collide with.
  allCars() {
    return [...this.cars.map((t) => t.car), ...this.parked];
  }

  spawnPed(anywhere) {
    const i = this.rng.int(0, 7), j = this.rng.int(0, 7);
    const loop = walkLoop(i, j);
    const wp = this.rng.int(0, 3);
    const start = loop[wp];
    const parts = makeHumanoid(randomOutfit(this.rng));
    parts.group.position.set(start.x, 0, start.z);
    this.scene.add(parts.group);
    const ped = {
      parts, x: start.x, z: start.z, heading: 0, loop, wp: (wp + 1) % loop.length,
      speed: this.rng.range(1.4, 2.4), state: 'walk', phase: this.rng.range(0, 6),
      idleTimer: 0, fleeTimer: 0, downTimer: 0, barked: false,
    };
    parts.group.traverse((o) => { if (o.isMesh) o.userData.hit = { kind: 'ped', ref: ped }; });
    this.peds.push(ped);
    return ped;
  }

  // A driver pulled from a stolen car runs off; a witness may report it.
  ejectDriver(car, px, pz) {
    if (!car.driver) return;
    car.mesh.remove(car.driver.group);
    car.driver = null;
    const ped = this.spawnPed(false);
    ped.x = px; ped.z = pz;
    ped.parts.group.position.set(px, 0, pz);
    this.scare(px, pz, 6, true);
  }

  scare(x, z, radius, silent = false) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      if (dist2D(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee';
        ped.fleeTimer = 4 + Math.random() * 3;
        if (!silent && !ped.barked && this.hooks.onBark) {
          ped.barked = true;
          this.hooks.onBark(ped);
        }
      }
    }
  }

  witnessesNear(x, z, radius) {
    let n = 0;
    for (const ped of this.peds) {
      if (ped.state !== 'down' && dist2D(ped.x, ped.z, x, z) < radius) n++;
    }
    return n;
  }

  knockDown(ped) {
    ped.state = 'down';
    ped.downTimer = 30;
    poseHumanoid(ped.parts, 'fall', 0);
  }

  update(dt, player, allCars) {
    // --- traffic cars ---
    for (const t of this.cars) {
      const car = t.car;
      if (car.occupied || car.dead) continue;
      const target = t.loop[t.wp];
      const dx = target.x - car.x, dz = target.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 7) {
        t.wp = (t.wp + 1) % t.loop.length;
        continue;
      }
      const desired = Math.atan2(-dx, -dz);
      const steer = clamp(wrapAngle(desired - car.heading) * 2.2, -1, 1);
      // Brake for anything stopped ahead: the player, another car, a ped.
      let blocked = false;
      const f = car.forward;
      const checkAhead = (ox, oz, r) => {
        const rx = ox - car.x, rz = oz - car.z;
        const ahead = rx * f.x + rz * f.z;
        const side = Math.abs(rx * f.z - rz * f.x);
        return ahead > 0 && ahead < 10 && side < 2.2 + r;
      };
      if (player && !player.driving && checkAhead(player.x, player.z, 0.5)) blocked = true;
      for (const other of allCars) {
        if (other !== car && checkAhead(other.x, other.z, 1.2)) { blocked = true; break; }
      }
      if (!blocked) {
        for (const ped of this.peds) {
          if (ped.state !== 'down' && checkAhead(ped.x, ped.z, 0.4)) { blocked = true; break; }
        }
      }
      const throttle = blocked ? (car.speed > 0.5 ? -1 : 0) : 0.75;
      car.update(dt, { throttle, steer, handbrake: false }, this.city.collideCircle, allCars, this.hooks.carHooks);
      // Stuck against a corner: nudge to the next waypoint.
      if (Math.abs(car.speed) < 0.5 && !blocked) {
        t.stuckTimer += dt;
        if (t.stuckTimer > 3) { t.wp = (t.wp + 1) % t.loop.length; t.stuckTimer = 0; }
      } else t.stuckTimer = 0;
      // Recycle far-away cars near the player to keep the streets busy.
      if (player && dist2D(car.x, car.z, player.x, player.z) > 300) {
        const i = this.rng.int(0, 7), j = this.rng.int(0, 7);
        t.loop = laneLoop(i, j, this.rng.chance(0.5));
        t.wp = 0;
        car.x = t.loop[0].x; car.z = t.loop[0].z;
        car.speed = 0;
      }
    }

    // --- pedestrians ---
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          this.scene.remove(ped.parts.group);
          this.peds.splice(this.peds.indexOf(ped), 1);
          this.spawnPed(false);
        }
        continue;
      }
      let speed = 0;
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        speed = 5.2;
        // Run away from the nearest threat: keep the current heading, steer
        // around colliders by sliding; pick a fresh random heading on bump.
        const nx = ped.x + Math.sin(ped.heading) * speed * dt;
        const nz = ped.z + Math.cos(ped.heading) * speed * dt;
        const fixed = this.city.collideCircle(nx, nz, 0.4);
        if (fixed.x === nx && fixed.z === nz) { ped.x = nx; ped.z = nz; }
        else ped.heading += 1.7;
        ped.x = clamp(ped.x, -280, 280);
        ped.z = clamp(ped.z, -280, 290);
        if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.barked = false; }
        ped.phase += speed * dt * 1.9;
        poseHumanoid(ped.parts, 'run', ped.phase, 1);
      } else if (ped.state === 'idle') {
        ped.idleTimer -= dt;
        if (ped.idleTimer <= 0) ped.state = 'walk';
        poseHumanoid(ped.parts, 'idle', ped.phase, 0.4);
        ped.phase += dt;
      } else {
        const target = ped.loop[ped.wp];
        const dx = target.x - ped.x, dz = target.z - ped.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.2) {
          ped.wp = (ped.wp + 1) % ped.loop.length;
          if (Math.random() < 0.08) { ped.state = 'idle'; ped.idleTimer = 2 + Math.random() * 4; }
        } else {
          ped.heading = Math.atan2(dx, dz);
          speed = ped.speed;
          const nx = ped.x + (dx / dist) * speed * dt;
          const nz = ped.z + (dz / dist) * speed * dt;
          const fixed = this.city.collideCircle(nx, nz, 0.4);
          ped.x = fixed.x; ped.z = fixed.z;
          ped.phase += speed * dt * 1.9;
        }
        poseHumanoid(ped.parts, speed > 0 ? 'walk' : 'idle', ped.phase, 0.7);
      }
      ped.parts.group.position.set(ped.x, 0, ped.z);
      ped.parts.group.rotation.y = ped.heading;
    }
  }
}
