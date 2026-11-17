// Particles, muzzle flashes, tracers and camera shake. One pooled Points
// cloud serves every burst so effects never allocate during play.
import * as THREE from 'three';
import { glowTexture, smokeTexture } from './textures.js';

const MAX_PARTICLES = 500;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = -100;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, map: glowTexture(), vertexColors: true, transparent: true,
      opacity: 0.95, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Smoke puffs: soft sprites pooled separately.
    this.smokePool = [];
    const smokeMat = new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.visible = false;
      s.scale.setScalar(1);
      scene.add(s);
      this.smokePool.push({ sprite: s, life: 0 });
    }
    this.smokeCursor = 0;

    // Muzzle flash sprite.
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd98a, transparent: true, depthWrite: false }));
    this.flash.visible = false;
    this.flash.scale.setScalar(1.1);
    scene.add(this.flash);
    this.flashTimer = 0;

    // Tracer lines, pooled.
    this.tracers = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerCursor = 0;
    this.trauma = 0;
  }

  burst(x, y, z, color, count, speed, life, gravity = 9, up = 0.6) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.velocities[i * 3] = Math.cos(a) * Math.cos(b) * s;
      this.velocities[i * 3 + 1] = Math.abs(Math.sin(b)) * s * up + speed * 0.25;
      this.velocities[i * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.colors[i * 3] = c.r; this.colors[i * 3 + 1] = c.g; this.colors[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
      this.gravity[i] = gravity;
    }
  }

  smoke(x, y, z, scale = 1) {
    const p = this.smokePool[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % this.smokePool.length;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.setScalar(scale);
    p.sprite.material.opacity = 0.5;
    p.sprite.visible = true;
    p.life = 0.9;
  }

  muzzle(x, y, z) {
    this.flash.position.set(x, y, z);
    this.flash.visible = true;
    this.flashTimer = 0.05;
  }

  tracer(ax, ay, az, bx, by, bz) {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = ax; pos[1] = ay; pos[2] = az;
    pos[3] = bx; pos[4] = by; pos[5] = bz;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  shakeOffset() {
    if (this.trauma <= 0.01) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma * 0.55;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.positions[i * 3 + 1] = -100; continue; }
      this.velocities[i * 3 + 1] -= this.gravity[i] * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.05) this.positions[i * 3 + 1] = 0.05;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (const p of this.smokePool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.sprite.position.y += dt * 1.4;
      p.sprite.scale.multiplyScalar(1 + dt * 1.5);
      p.sprite.material.opacity = Math.max(0, p.life * 0.55);
      if (p.life <= 0) p.sprite.visible = false;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life * 10);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }
}
