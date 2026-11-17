// Dani Vega on foot: WASD movement relative to the camera, run, jump,
// weapon state, health and cash, and the interactable the F key would use.
// Driving is handled by the car; this module hides the mesh while driving.
import * as THREE from 'three';
import { clamp, angleLerp, wrapAngle } from './rng.js';
import { makeHumanoid, makePistol, poseHumanoid } from './characters.js';

export const DANI_OUTFIT = { skin: 0xd9a066, shirt: 0x2e8a8a, pants: 0x2e3a4a, hair: 0x2a2018 };

export class Player {
  constructor(scene, x, z) {
    this.parts = makeHumanoid(DANI_OUTFIT);
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.heading = 0; // facing = (sin h, cos h)
    this.walkPhase = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.cash = 150;
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = 60;
    this.ammoReserve = 120;
    this.driving = null;   // Car being driven, or null
    this.interactTarget = null;
    this.interactHint = '';
    this.attackCooldown = 0;
    this.hurtTimer = 0;
    this.dead = false;

    this.pistol = makePistol();
    this.pistol.rotation.x = Math.PI / 2;
    this.pistol.position.set(0, -0.62, 0.05);
    this.pistol.visible = false;
    this.parts.armR.add(this.pistol);
  }

  get pos() { return { x: this.x, z: this.z }; }
  get facing() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  muzzlePos() {
    const f = this.facing;
    return new THREE.Vector3(this.x + f.x * 0.9, 1.45, this.z + f.z * 0.9);
  }

  update(dt, input, camYaw, collide, aiming) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.driving) {
      this.mesh.visible = false;
      this.x = this.driving.x;
      this.z = this.driving.z;
      return;
    }
    this.mesh.visible = true;
    const axes = input.moveAxes();
    // Movement is relative to the camera yaw: forward is away from the
    // camera, strafe is perpendicular to the view direction.
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const mx = axes.x * cos - axes.y * sin;
    const mz = -axes.x * sin - axes.y * cos;
    const moving = Math.hypot(mx, mz) > 0.01;
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? 8.5 : 5.0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      const nx2 = mx / len, nz2 = mz / len;
      const targetHeading = Math.atan2(nx2, nz2);
      this.heading = aiming ? angleLerp(this.heading, camYaw + Math.PI, 12 * dt) : angleLerp(this.heading, targetHeading, 12 * dt);
      const nx = this.x + nx2 * speed * dt;
      const nz = this.z + nz2 * speed * dt;
      const fixed = collide(nx, nz, 0.55);
      this.x = fixed.x; this.z = fixed.z;
      this.walkPhase += speed * dt * 1.9;
    } else if (aiming) {
      this.heading = angleLerp(this.heading, camYaw + Math.PI, 12 * dt);
    }
    // Jump and gravity.
    if (input.pressed('Space') && this.grounded) {
      this.vy = 8.2;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 24 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    }
    // Island bounds (the causeway lane and the pier reach further).
    const onCauseway = Math.abs(this.x - 26) < 7;
    const onPier = Math.abs(this.x + 26) < 5;
    this.x = clamp(this.x, -300, 300);
    this.z = clamp(this.z, onCauseway ? -320 : -300, onPier ? 306 : 300);

    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    const pose = aiming ? 'aim' : moving ? (running ? 'run' : 'walk') : 'idle';
    poseHumanoid(this.parts, pose, this.walkPhase, moving ? (running ? 1 : 0.7) : 0.4);
    this.pistol.visible = this.weapon === 'pistol';
  }

  damage(amount) {
    if (this.dead) return false;
    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0.35;
    if (this.health <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  startDriving(car) {
    this.driving = car;
    car.occupied = true;
    this.mesh.visible = false;
  }

  stopDriving() {
    if (!this.driving) return;
    const car = this.driving;
    car.occupied = false;
    this.driving = null;
    // Step out on the car's left side.
    const f = car.forward;
    this.x = car.x + f.z * 2.0;
    this.z = car.z - f.x * 2.0;
    this.heading = Math.atan2(f.x, f.z) + Math.PI;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
  }
}
