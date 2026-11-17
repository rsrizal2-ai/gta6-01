// Parametric low-poly people: one builder makes the player, pedestrians and
// police from coloured boxes and spheres, with a shared walk/aim/fall pose
// animator so every character moves the same way.
import * as THREE from 'three';

const skinTones = [0xf2c89b, 0xd9a066, 0x8a5a33, 0x6e4423, 0xf7d7b0];
const shirtTones = [0xd94a4a, 0x4a7ad9, 0x4ad97a, 0xe8c33c, 0x9a4ad9, 0xe87a3c, 0x3cb8b0, 0xe8e8e8];
const pantsTones = [0x2e3a4a, 0x4a4a4a, 0x5a4a3a, 0x2e4a2e, 0x6a6a7a];

export function randomOutfit(rng) {
  return {
    skin: skinTones[rng.int(0, skinTones.length - 1)],
    shirt: shirtTones[rng.int(0, shirtTones.length - 1)],
    pants: pantsTones[rng.int(0, pantsTones.length - 1)],
    hair: [0x2a2018, 0x4a3220, 0x111111, 0x7a5a2a, 0xb8b8b8][rng.int(0, 4)],
  };
}

// Builds a ~1.8m person facing +Z. Returns the group plus named limb pivots.
export function makeHumanoid(outfit) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: outfit.skin });
  const shirt = new THREE.MeshLambertMaterial({ color: outfit.shirt });
  const pants = new THREE.MeshLambertMaterial({ color: outfit.pants });
  const hairMat = new THREE.MeshLambertMaterial({ color: outfit.hair });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 1.8;
  g.add(hair);

  const mkLimb = (mat, w, len, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  const armL = mkLimb(shirt, 0.18, 0.62, -0.42, 1.52);
  const armR = mkLimb(shirt, 0.18, 0.62, 0.42, 1.52);
  const legL = mkLimb(pants, 0.22, 0.78, -0.17, 0.84);
  const legR = mkLimb(pants, 0.22, 0.78, 0.17, 0.84);

  return { group: g, torso, head, armL, armR, legL, legR };
}

// pose: 'idle' | 'walk' | 'run' | 'aim' | 'fall' | 'sit'. phase advances
// with distance walked; speed01 scales the swing.
export function poseHumanoid(parts, pose, phase, speed01 = 1) {
  const swing = Math.sin(phase) * 0.65 * speed01;
  const swing2 = Math.sin(phase + Math.PI) * 0.65 * speed01;
  const p = parts;
  p.group.rotation.x = 0;
  p.group.position.y = 0;
  if (pose === 'walk' || pose === 'run') {
    p.legL.rotation.x = swing;
    p.legR.rotation.x = swing2;
    p.armL.rotation.x = swing2 * 0.8;
    p.armR.rotation.x = swing * 0.8;
    p.group.position.y = Math.abs(Math.cos(phase)) * 0.04 * speed01;
    p.torso.rotation.x = pose === 'run' ? 0.12 : 0.03;
  } else if (pose === 'aim') {
    p.legL.rotation.x = swing * 0.3;
    p.legR.rotation.x = swing2 * 0.3;
    p.armL.rotation.x = -Math.PI / 2 + 0.15;
    p.armR.rotation.x = -Math.PI / 2;
    p.armL.rotation.z = 0.25;
    p.armR.rotation.z = -0.1;
  } else if (pose === 'fall') {
    p.group.rotation.x = -Math.PI / 2 + 0.12;
    p.group.position.y = 0.25;
    p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.4;
    p.legL.rotation.x = 0.15; p.legR.rotation.x = -0.1;
  } else if (pose === 'sit') {
    p.legL.rotation.x = -1.35; p.legR.rotation.x = -1.35;
    p.armL.rotation.x = -0.5; p.armR.rotation.x = -0.5;
    p.group.position.y = -0.42;
  } else {
    // idle: gentle breathing sway
    p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
    p.armL.rotation.x = Math.sin(phase * 0.5) * 0.05;
    p.armR.rotation.x = Math.cos(phase * 0.5) * 0.05;
    p.torso.rotation.x = 0;
  }
}

// A simple pistol mesh held in the right hand while aiming.
export function makePistol() {
  const gun = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), dark);
  barrel.position.set(0, 0, 0.12);
  gun.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), dark);
  grip.position.set(0, -0.09, -0.02);
  grip.rotation.x = 0.25;
  gun.add(grip);
  return gun;
}
