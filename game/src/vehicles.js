// Parametric cars and arcade driving physics. Six body styles share one
// physics model: throttle, steering that bites with speed, a handbrake that
// breaks traction, and circle-vs-world collision with a slide.
import * as THREE from 'three';
import { clamp, damp } from './rng.js';

export const CAR_STYLES = {
  sedan: { len: 4.4, wid: 1.9, h: 0.62, cabin: 0.55, accel: 11, top: 30, grip: 2.6 },
  hatch: { len: 3.8, wid: 1.8, h: 0.6, cabin: 0.55, accel: 10, top: 27, grip: 2.8 },
  pickup: { len: 4.8, wid: 2.0, h: 0.7, cabin: 0.6, accel: 9, top: 26, grip: 2.3 },
  van: { len: 4.9, wid: 2.0, h: 1.1, cabin: 0.5, accel: 8, top: 24, grip: 2.1 },
  sport: { len: 4.2, wid: 1.9, h: 0.5, cabin: 0.45, accel: 16, top: 40, grip: 3.2 },
  cruiser: { len: 4.5, wid: 1.9, h: 0.62, cabin: 0.55, accel: 13, top: 34, grip: 2.9 },
};
export const CAR_COLORS = [0xc0392b, 0x2e5f8a, 0xe8e8e8, 0x333333, 0xe8c33c, 0x4a8a5a, 0x8a4a7a, 0xd97a2e, 0x9ab8c8, 0x6a8a9a];

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8);
const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8b8b8 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2e3a });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6cc });
const tailMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0x440000 });

export function makeCarModel(style, color) {
  const spec = CAR_STYLES[style];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  g.userData.paint = paint;
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, spec.h, spec.len), paint);
  body.position.y = 0.42 + spec.h / 2;
  body.castShadow = true;
  g.add(body);
  const cabinLen = spec.len * 0.45;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.86, spec.cabin, cabinLen), paint);
  cabin.position.set(0, 0.42 + spec.h + spec.cabin / 2 - 0.06, -spec.len * 0.05);
  cabin.castShadow = true;
  g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.88, spec.cabin * 0.7, cabinLen * 0.92), glassMat);
  glass.position.copy(cabin.position);
  glass.position.y -= 0.02;
  g.add(glass);
  if (style === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.8, 0.3, spec.len * 0.32), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bed.position.set(0, 0.42 + spec.h + 0.1, spec.len * 0.28);
    g.add(bed);
  }
  // Headlights and taillights.
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lightMat);
    head.position.set(s * (spec.wid / 2 - 0.3), 0.72, -spec.len / 2 - 0.02);
    g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat.clone());
    tail.position.set(s * (spec.wid / 2 - 0.3), 0.72, spec.len / 2 + 0.02);
    g.add(tail);
    if (!g.userData.tails) g.userData.tails = [];
    g.userData.tails.push(tail);
  }
  // Wheels on steer pivots at the front, fixed pivots at the rear.
  const wheels = [];
  const axle = spec.len / 2 - 0.85;
  for (const [wx, wz, steerable] of [[-1, -1, true], [1, -1, true], [-1, 1, false], [1, 1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx * (spec.wid / 2 - 0.14), 0.36, wz * axle);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    pivot.add(hub);
    g.add(pivot);
    wheels.push({ pivot, wheel, steerable });
  }
  let lightbar = null;
  if (style === 'cruiser') {
    lightbar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    lightbar.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.28, 0.14, 0);
    lightbar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0x2050ff }));
    blue.position.set(0.28, 0.14, 0);
    lightbar.add(blue);
    lightbar.position.set(0, 0.42 + spec.h + spec.cabin + 0.02, -spec.len * 0.05);
    g.add(lightbar);
    lightbar.userData = { red, blue };
  }
  return { group: g, wheels, tails: g.userData.tails || [], lightbar, spec };
}

export class Car {
  constructor(scene, style, color, x, z, heading) {
    this.style = style;
    this.color = color;
    const model = makeCarModel(style, color);
    this.mesh = model.group;
    this.wheels = model.wheels;
    this.tails = model.tails;
    this.lightbar = model.lightbar;
    this.spec = model.spec;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.mesh.traverse((o) => { if (o.isMesh) o.userData.hit = { kind: 'car', ref: this }; });
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.health = 100;
    this.dead = false;
    this.isPolice = style === 'cruiser';
    this.driver = null;      // humanoid parts of the traffic driver, if any
    this.occupied = false;   // the player is driving
    this.flash = 0;          // lightbar phase
    this.smokeTimer = 0;
    this.impactCooldown = 0;
  }

  get forward() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; }

  // drive: {throttle -1..1, steer -1..1, handbrake}. collide: city's
  // collideCircle. others: other cars for car-vs-car pushes. hooks: effects.
  update(dt, drive, collide, others, hooks) {
    const spec = this.spec;
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const targetSteer = drive.steer * 0.55;
    this.steer = damp(this.steer, targetSteer, 8, dt);
    const handbrake = drive.handbrake && Math.abs(this.speed) > 2;

    if (!this.dead) {
      if (drive.throttle > 0) this.speed += spec.accel * drive.throttle * dt;
      else if (drive.throttle < 0) {
        if (this.speed > 0.5) this.speed += spec.accel * 1.6 * drive.throttle * dt; // brake
        else this.speed = Math.max(-10, this.speed + spec.accel * 0.6 * drive.throttle * dt); // reverse
      }
    }
    // Drag and rolling resistance; handbrake kills speed and grip.
    const drag = handbrake ? 3.2 : 0.55;
    this.speed -= this.speed * drag * dt;
    if (Math.abs(this.speed) < 0.05 && drive.throttle === 0) this.speed = 0;
    this.speed = clamp(this.speed, -10, spec.top);

    const grip = handbrake ? spec.grip * 0.45 : spec.grip;
    // Signed speed flips the turn automatically when reversing.
    this.heading -= this.steer * grip * dt * clamp(this.speed / 9, -1, 1);

    const f = this.forward;
    const nx = this.x + f.x * this.speed * dt;
    const nz = this.z + f.z * this.speed * dt;
    // Two axle circles against the world; a hard stop costs speed + health.
    const axleOff = spec.len / 2 - 0.85;
    let hit = false;
    for (const off of [-axleOff, axleOff]) {
      const px = nx - f.x * off, pz = nz - f.z * off;
      const fixed = collide(px, pz, 1.35);
      if (fixed.x !== px || fixed.z !== pz) {
        hit = true;
        const pushX = fixed.x - px, pushZ = fixed.z - pz;
        this.x = nx + pushX; this.z = nz + pushZ;
      }
    }
    if (!hit) { this.x = nx; this.z = nz; }
    // Car-vs-car: soft circle push.
    for (const other of others) {
      if (other === this) continue;
      const dx = this.x - other.x, dz = this.z - other.z;
      const d = Math.hypot(dx, dz);
      const min = 2.6;
      if (d < min && d > 0.01) {
        const push = (min - d) * 0.5;
        this.x += (dx / d) * push; this.z += (dz / d) * push;
        hit = true;
      }
    }
    if (hit && Math.abs(this.speed) > 6 && this.impactCooldown <= 0) {
      this.impactCooldown = 0.4;
      const dmg = Math.min(30, Math.abs(this.speed) * 1.1);
      this.health -= dmg;
      if (hooks && hooks.onImpact) hooks.onImpact(this, dmg);
      this.speed *= 0.35;
    } else if (hit) {
      this.speed *= 1 - Math.min(1, 3 * dt);
    }
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      if (hooks && hooks.onDisabled) hooks.onDisabled(this);
    }

    // World edge: the island ends at the water, except the causeway lane.
    const onCauseway = Math.abs(this.x - 26) < 7 && this.z < -CITY_EDGE_GUARD();
    const limit = 320;
    if (onCauseway) {
      this.x = clamp(this.x, 19, 33);
      this.z = Math.max(this.z, -322);
    } else {
      this.x = clamp(this.x, -limit, limit);
      this.z = clamp(this.z, -limit, limit);
    }

    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += (this.speed / 0.36) * dt;
    for (const w of this.wheels) {
      w.wheel.rotation.x = this.wheelSpin;
      if (w.steerable) w.pivot.rotation.y = this.steer;
    }
    const braking = drive.throttle < 0 && this.speed > 0.5;
    for (const t of this.tails) t.material.emissive.setHex(braking ? 0xff2020 : 0x440000);

    if (this.lightbar) {
      this.flash += dt * 9;
      const phase = Math.sin(this.flash) > 0;
      this.lightbar.userData.red.visible = phase;
      this.lightbar.userData.blue.visible = !phase;
    }
    // Damage smoke hook for the effects system.
    if (this.health < 45 && !this.dead) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.09;
        if (hooks && hooks.onSmoke) hooks.onSmoke(this);
      }
    }
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}

function CITY_EDGE_GUARD() { return 234; }
