// Dani's story: five jobs for the fixer Sal Marín, from a first fare to a
// five-star run for the causeway. Each mission is a list of steps; the
// beacon, the minimap blip and the HUD tracker all read the current step.
// Ten sun medallions hide around the island as a side hunt.
import * as THREE from 'three';
import { dist2D } from './rng.js';
import { makeHumanoid, poseHumanoid, randomOutfit } from './characters.js';
import { tagHittable } from './combat.js';
import { Car } from './vehicles.js';

const SAL_OUTFIT = { skin: 0xd9a066, shirt: 0xe8e8e8, pants: 0x8a7a5a, hair: 0xb8b8b8 };
const GUARD_OUTFIT = { skin: 0x8a5a33, shirt: 0x222222, pants: 0x333333, hair: 0x111111 };

const MEDALLION_SPOTS = [
  [-26, 300], [-33, -26], [26, 26], [120, 250], [-160, 250],
  [130, -150], [-150, 60], [-60, -100], [26, -225], [200, 120],
];

export class Missions {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.index = 0;          // next mission to start
    this.active = null;      // {def, step}
    this.completed = 0;
    this.medallions = new Array(MEDALLION_SPOTS.length).fill(false);
    this.medallionMeshes = [];
    this.guards = [];
    this.missionCar = null;
    this.prop = null;        // package / ledger case mesh
    this.clientPed = null;
    this.dialogueTimer = 0;
    this.dialogueQueue = [];
    this.failed = false;

    this.buildBeacon();
    this.buildMedallions();
    this.buildSal();
  }

  // Fresh state for a new game: props and guards gone, medallions restored.
  reset() {
    this.clearMissionProps();
    this.index = 0;
    this.completed = 0;
    this.active = null;
    this.failed = false;
    this.medallions = new Array(MEDALLION_SPOTS.length).fill(false);
    for (const m of this.medallionMeshes) m.visible = true;
    this.beacon.visible = false;
    this.dialogueQueue = [];
  }

  // ---- static dressing -------------------------------------------------
  buildBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.0, 16, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 8;
    g.add(beam);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.8),
      new THREE.MeshBasicMaterial({ color: 0xffd23c }),
    );
    gem.position.y = 6;
    g.add(gem);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.18, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23c }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    g.add(ring);
    g.visible = false;
    this.scene.add(g);
    this.beacon = g;
    this.beaconGem = gem;
  }

  buildMedallions() {
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23c });
    MEDALLION_SPOTS.forEach(([x, z], i) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 1.1, z);
      m.rotation.x = Math.PI / 2.4;
      this.scene.add(m);
      this.medallionMeshes.push(m);
    });
  }

  buildSal() {
    const parts = makeHumanoid(SAL_OUTFIT);
    const sal = this.ctx.city.landmarks.sal;
    parts.group.position.set(sal.x, 0, sal.z);
    parts.group.rotation.y = Math.PI;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x8a7a5a }));
    cap.position.y = 2.0;
    parts.group.add(cap);
    this.scene.add(parts.group);
    this.sal = { parts, x: sal.x, z: sal.z, phase: 0 };
  }

  // ---- mission definitions ----------------------------------------------
  definitions() {
    const L = this.ctx.city.landmarks;
    return [
      {
        name: 'First Fare', reward: 200,
        briefing: ['Dani! My best driver. A client waits at the plaza — get them to the marina, smooth and quick.', 'The whole city watches how you drive. Make it look easy.'],
        steps: [
          { type: 'goto', target: L.plaza, radius: 8, text: 'Pick up the client at the plaza' },
          { type: 'goto', target: L.pier, radius: 10, text: 'Drive the client to the marina pier' },
        ],
        doneLine: 'Clean run, Dani. The client says you drive like the wind. There will be more work.',
      },
      {
        name: 'Repo Run', reward: 350,
        briefing: ['Kroll\u2019s crew parked a gold Comet GT at the tower lot. It belongs to a friend of mine.', 'Bring it home to the garage. Try not to scratch it — and expect trouble.'],
        steps: [
          { type: 'enterCar', text: 'Steal the gold Comet GT at the Kroll lot' },
          { type: 'deliverCar', target: L.garage, radius: 9, text: 'Deliver the Comet GT to Marín Motors' },
        ],
        doneLine: 'Beautiful. My friend will be very happy — and Kroll will be very confused.',
      },
      {
        name: 'Hot Delivery', reward: 400,
        briefing: ['A package waits by the pier shack. The precinct has ears: the moment you lift it, they will be on you.', 'Lose them or outrun them, then bring the package to the plaza.'],
        steps: [
          { type: 'pickup', target: L.pierEnd, radius: 3, text: 'Collect the package at the pier' },
          { type: 'goto', target: L.plaza, radius: 9, text: 'Deliver the package to the plaza' },
        ],
        doneLine: 'Delivered, heat and all. You are becoming a legend on this island, Dani.',
      },
      {
        name: 'The Ledger', reward: 600,
        briefing: ['Kroll keeps his real books in a case at the tower site. His guards are armed, Dani.', 'Take the ledger, get clear of the site, and bring it to me. Careful now.'],
        steps: [
          { type: 'goto', target: L.kroll, radius: 26, text: 'Reach the Kroll Tower site' },
          { type: 'grab', target: L.kroll, radius: 3.5, text: 'Take the ledger from the tower frame' },
          { type: 'escape', target: L.kroll, radius: 45, text: 'Get clear of the construction site' },
          { type: 'talk', text: 'Bring the ledger to Sal' },
        ],
        doneLine: 'This ledger ends Kroll. You did good, Dani. Now we finish this.',
      },
      {
        name: 'Last Bridge Out', reward: 1000,
        briefing: ['Kroll knows. The whole precinct is coming for you.', 'Take the causeway north and do not stop. I will meet you on the other side. Go!'],
        steps: [
          { type: 'reach', target: L.causeway, radius: 10, text: 'Escape across the causeway — do not stop!' },
        ],
        doneLine: 'You made it. Cayo Verde is yours now, Dani.',
      },
    ];
  }

  get currentStep() {
    return this.active ? this.active.def.steps[this.active.step] : null;
  }

  get currentTarget() {
    const step = this.currentStep;
    if (!step) return null;
    if (step.type === 'enterCar' && this.missionCar) return { x: this.missionCar.x, z: this.missionCar.z };
    if (step.type === 'talk') return { x: this.sal.x, z: this.sal.z };
    return step.target || null;
  }

  // ---- flow --------------------------------------------------------------
  talkToSal() {
    const { hud, audio } = this.ctx;
    if (this.active && this.currentStep.type === 'talk') {
      this.advanceStep();
      return;
    }
    if (this.active) {
      hud.showDialogue('Sal', ['You have a job running, Dani. Check the tracker — and drive safe.']);
      return;
    }
    if (this.index >= 5) {
      hud.showDialogue('Sal', ['The island is quiet, Dani. Enjoy it. You earned it.']);
      return;
    }
    this.startMission(this.index);
  }

  startMission(i) {
    const def = this.definitions()[i];
    this.active = { def, step: 0 };
    this.failed = false;
    this.ctx.hud.showDialogue('Sal', def.briefing);
    this.ctx.hud.showBanner(def.name, `Job ${i + 1} of 5 — $${def.reward}`);
    this.ctx.audio.jingle(true);
    if (i === 0) this.spawnClient();
    if (i === 1) this.spawnMissionCar();
    if (i === 3) this.spawnGuards();
    if (i === 4) this.ctx.police.setWanted(5);
    this.onStepEnter();
  }

  onStepEnter() {
    const step = this.currentStep;
    if (!step) return;
    const { hud } = this.ctx;
    hud.setObjective(this.active.def.name, step.text);
    if (step.type === 'pickup') this.spawnProp(step.target, 0x3cb8b0);
    if (step.type === 'grab') this.spawnProp(step.target, 0xc0392b);
    if (step.type === 'goto' && this.active.def.name === 'First Fare' && this.active.step === 1 && this.clientPed) {
      this.scene.remove(this.clientPed.parts.group);
      this.clientPed = null;
      hud.addFeed('The client is aboard. Drive smoothly.');
    }
  }

  advanceStep() {
    this.active.step++;
    if (this.active.step >= this.active.def.steps.length) {
      this.completeMission();
    } else {
      this.onStepEnter();
    }
  }

  completeMission() {
    const { player, hud, audio } = this.ctx;
    const def = this.active.def;
    player.cash += def.reward;
    this.completed++;
    this.index = Math.max(this.index, this.completed);
    hud.showBanner('JOB DONE', `${def.name} — +$${def.reward}`);
    hud.showDialogue('Sal', [def.doneLine]);
    audio.jingle(true);
    this.clearMissionProps();
    const wasLast = this.completed >= 5;
    this.active = null;
    hud.setObjective('', '');
    if (this.ctx.onMissionComplete) this.ctx.onMissionComplete(def, wasLast);
  }

  failMission(reason) {
    const { hud } = this.ctx;
    hud.showBanner('JOB FAILED', reason);
    this.ctx.audio.jingle(false);
    this.clearMissionProps();
    this.active = null;
    hud.setObjective('', '');
  }

  clearMissionProps() {
    if (this.missionCar) {
      this.scene.remove(this.missionCar.mesh);
      this.missionCar = null;
    }
    if (this.prop) {
      this.scene.remove(this.prop);
      this.prop = null;
    }
    for (const g of this.guards) {
      this.scene.remove(g.parts.group);
    }
    this.guards = [];
    if (this.clientPed) {
      this.scene.remove(this.clientPed.parts.group);
      this.clientPed = null;
    }
  }

  spawnClient() {
    const L = this.ctx.city.landmarks;
    const parts = makeHumanoid(randomOutfit(this.ctx.rng));
    parts.group.position.set(L.plaza.x + 6, 0, L.plaza.z + 6);
    this.scene.add(parts.group);
    this.clientPed = { parts, phase: 0 };
  }

  spawnMissionCar() {
    const L = this.ctx.city.landmarks;
    const car = new Car(this.scene, 'sport', 0xd4af37, L.krollLot.x, L.krollLot.z, Math.PI / 2);
    car.isMissionCar = true;
    this.missionCar = car;
    if (this.ctx.onMissionCar) this.ctx.onMissionCar(car);
  }

  spawnProp(target, color) {
    if (this.prop) this.scene.remove(this.prop);
    const prop = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), new THREE.MeshLambertMaterial({ color }));
    box.position.y = 0.8;
    box.castShadow = true;
    prop.add(box);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 }),
    );
    glow.position.y = 0.8;
    prop.add(glow);
    prop.position.set(target.x, 0, target.z);
    this.scene.add(prop);
    this.prop = prop;
  }

  spawnGuards() {
    const L = this.ctx.city.landmarks;
    const spots = [[-12, -12], [12, -12], [0, 14]];
    for (const [ox, oz] of spots) {
      const parts = makeHumanoid(GUARD_OUTFIT);
      parts.group.position.set(L.kroll.x + ox, 0, L.kroll.z + oz);
      this.scene.add(parts.group);
      const guard = { parts, x: L.kroll.x + ox, z: L.kroll.z + oz, hp: 3, shootTimer: 1 + Math.random(), phase: 0, down: false };
      tagHittable(parts.group, 'guard', guard);
      this.guards.push(guard);
    }
  }

  // ---- per-frame ----------------------------------------------------------
  update(dt, time) {
    const { player, hud, audio, police } = this.ctx;
    // Sal idles at the garage.
    this.sal.phase += dt;
    poseHumanoid(this.sal.parts, 'idle', this.sal.phase, 0.4);
    if (this.clientPed) {
      this.clientPed.phase += dt;
      poseHumanoid(this.clientPed.parts, 'idle', this.clientPed.phase, 0.4);
    }
    // Beacon follows the current target.
    const target = this.currentTarget;
    if (target && !this.failed) {
      this.beacon.visible = true;
      this.beacon.position.set(target.x, 0, target.z);
      this.beaconGem.position.y = 6 + Math.sin(time * 2.2) * 0.5;
      this.beaconGem.rotation.y += dt * 2;
    } else {
      this.beacon.visible = false;
    }
    // Medallions spin; collecting one pays $50.
    let collected = 0;
    this.medallionMeshes.forEach((m, i) => {
      if (this.medallions[i]) { m.visible = false; collected++; return; }
      m.rotation.z += dt * 1.5;
      m.position.y = 1.1 + Math.sin(time * 2 + i) * 0.15;
      if (!player.driving && dist2D(player.x, player.z, m.position.x, m.position.z) < 2.2) {
        this.medallions[i] = true;
        m.visible = false;
        player.cash += 50;
        audio.pickup();
        hud.addFeed(`Sun Medallion ${collected + 1}/10 — +$50`);
        if (collected + 1 >= 10) {
          player.cash += 500;
          hud.showBanner('ALL MEDALLIONS', 'The sun smiles on you — +$500');
        }
        if (this.ctx.onMedallion) this.ctx.onMedallion(this.medallions);
      }
    });
    // Mission prop bobbing.
    if (this.prop) {
      this.prop.rotation.y += dt * 1.2;
      this.prop.position.y = Math.sin(time * 2) * 0.1;
    }
    // Guards shoot at Dani while mission 4 runs.
    for (const g of this.guards) {
      if (g.down) continue;
      const d = dist2D(g.x, g.z, player.x, player.z);
      g.shootTimer -= dt;
      if (d < 38 && g.shootTimer <= 0 && !player.dead) {
        g.shootTimer = 2.2 + Math.random() * 0.8;
        g.parts.group.rotation.y = Math.atan2(player.x - g.x, player.z - g.z);
        poseHumanoid(g.parts, 'aim', g.phase, 0.4);
        this.ctx.combat.enemyFire(
          new THREE.Vector3(g.x, 1.45, g.z),
          new THREE.Vector3(player.x, 1.2, player.z),
          0.32, 9,
          { onPlayerHit: (dmg) => { if (this.ctx.onPlayerHit) this.ctx.onPlayerHit(dmg); } },
        );
      } else if (d >= 38) {
        poseHumanoid(g.parts, 'idle', g.phase, 0.4);
        g.phase += dt;
      }
    }
    if (!this.active) return;
    // Mission car wrecked: the repo job fails.
    if (this.missionCar && this.missionCar.dead && this.active.def.name === 'Repo Run') {
      this.failMission('The Comet GT was wrecked.');
      return;
    }
    // Step completion checks.
    const step = this.currentStep;
    const px = player.x, pz = player.z;
    switch (step.type) {
      case 'goto':
      case 'deliver':
      case 'reach':
        if (dist2D(px, pz, step.target.x, step.target.z) < step.radius) this.advanceStep();
        break;
      case 'enterCar':
        if (player.driving === this.missionCar) {
          police.reportCrime('steal', px, pz, true);
          hud.addFeed('The Comet GT is yours. Lose the heat and bring it home.');
          this.advanceStep();
        }
        break;
      case 'deliverCar':
        if (player.driving === this.missionCar && dist2D(px, pz, step.target.x, step.target.z) < step.radius) this.advanceStep();
        break;
      case 'pickup':
        if (!player.driving && this.prop && dist2D(px, pz, step.target.x, step.target.z) < step.radius) {
          this.scene.remove(this.prop);
          this.prop = null;
          police.setWanted(2);
          hud.addFeed('Package collected — the precinct is on you!');
          this.advanceStep();
        }
        break;
      case 'grab':
        if (!player.driving && this.prop && dist2D(px, pz, step.target.x, step.target.z) < step.radius) {
          this.scene.remove(this.prop);
          this.prop = null;
          hud.addFeed('Ledger taken. Get clear of the site!');
          this.advanceStep();
        }
        break;
      case 'escape':
        if (dist2D(px, pz, step.target.x, step.target.z) > step.radius) this.advanceStep();
        break;
      case 'talk':
        // Completed by talking to Sal (talkToSal).
        break;
      default:
        break;
    }
  }
}
