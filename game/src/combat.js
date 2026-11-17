// Fists and the pistol. Hitscan shots raycast against the root objects the
// caller passes (peds, cops, guards, cars — each mesh carries userData.hit)
// and the city's building meshes, so walls block bullets; melee sweeps an
// arc in front of Dani. Damage, tracers and hit sparks live here.
import * as THREE from 'three';
import { dist2D } from './rng.js';

// Tag every mesh under a root so a raycast hit identifies its owner.
export function tagHittable(root, kind, ref) {
  root.traverse((o) => { if (o.isMesh) o.userData.hit = { kind, ref }; });
}

export class Combat {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.raycaster = new THREE.Raycaster();
  }

  // origin: Vector3, dir: normalized Vector3, roots: hittable root objects.
  // Returns the hit {kind, ref} or null.
  firePistol(origin, dir, roots, solids, hooks) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = 70;
    const meshes = [];
    for (const root of roots) {
      root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    }
    const hits = this.raycaster.intersectObjects([...meshes, ...solids], false);
    const end = origin.clone().add(dir.clone().multiplyScalar(70));
    let hitData = null;
    if (hits.length > 0) {
      const h = hits[0];
      end.copy(h.point);
      const data = h.object.userData.hit;
      if (data) {
        hitData = data;
        this.effects.burst(h.point.x, h.point.y, h.point.z, 0xff5533, 8, 3, 0.4, 6);
        if (hooks.onHit) hooks.onHit(data, h.point);
      } else {
        this.effects.burst(h.point.x, h.point.y, h.point.z, 0xd8c8a8, 6, 2.5, 0.35, 7);
      }
    }
    this.effects.tracer(origin.x, origin.y, origin.z, end.x, end.y, end.z);
    this.effects.muzzle(origin.x, origin.y, origin.z);
    this.effects.shake(0.12);
    this.audio.shot();
    return hitData;
  }

  // Enemy fire: inaccurate by design, with a visible tracer either way.
  enemyFire(from, to, accuracy, damage, hooks) {
    const hit = Math.random() < accuracy;
    const end = hit ? to.clone() : to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4));
    const dir = end.clone().sub(from).normalize();
    this.effects.tracer(from.x, from.y, from.z, end.x, end.y, end.z);
    this.effects.muzzle(from.x, from.y, from.z);
    this.audio.shot();
    if (hit && hooks.onPlayerHit) hooks.onPlayerHit(damage, from);
    return hit;
  }

  // Melee arc: 2.3m reach, 110 degrees. targets: [{x, z, kind, ref}].
  // Returns the entries struck.
  melee(attackerX, attackerZ, heading, targets, hooks) {
    const struck = [];
    for (const t of targets) {
      const d = dist2D(attackerX, attackerZ, t.x, t.z);
      if (d > 2.3) continue;
      const ang = Math.atan2(t.x - attackerX, t.z - attackerZ);
      let diff = ang - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.0) continue;
      struck.push(t);
      this.effects.burst(t.x, 1.3, t.z, 0xffcc66, 6, 2.5, 0.3, 6);
      if (hooks.onHit) hooks.onHit(t, new THREE.Vector3(t.x, 1.3, t.z));
    }
    this.audio.punch();
    this.effects.shake(0.08);
    return struck;
  }
}
