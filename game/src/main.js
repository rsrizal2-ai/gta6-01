// Cayo Verde: boot, the fixed-step loop, the camera rig, and every system
// wired together — driving, stealing, wanted heat, missions, combat, menus
// and saving. The game runs from static files with no network requests.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { makeRng, clamp, damp, dist2D } from './rng.js';
import { applyShot } from './shots.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { poseHumanoid } from './characters.js';

const STEP = 1 / 60;

class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.seed = Number(params.get('seed')) || 7;
    this.shotName = params.get('shot') || null;
    this.rng = makeRng(this.seed ^ 0x51ab);
    this.time = 0;
    this.playTime = 0;
    this.mode = 'menu'; // menu | playing | paused | wasted | busted | complete
    this.camYaw = 0.6;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.menuAngle = 0.6;
    this.scriptedDrive = null;
    this.extraCars = [];
    this.pickups = [];
    this.reloadTimer = 0;
    this.lastCar = null;
    this.lastExitTime = -999;
    this.muted = false;
    this.frame = 0;

    // --- renderer / scene ---
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(60, 30, 60);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // --- world and systems ---
    this.city = buildCity(this.scene, this.seed);
    this.effects = new Effects(this.scene);
    this.audio = new AudioSys();
    this.input = new Input(this.renderer.domElement);
    const L = this.city.landmarks;
    this.player = new Player(this.scene, L.garage.x + 2, L.garage.z + 14);
    this.player.heading = Math.PI;

    const carHooks = {
      onImpact: (car, dmg) => this.onCarImpact(car, dmg),
      onDisabled: (car) => this.onCarDisabled(car),
      onSmoke: (car) => this.effects.smoke(car.x, 1.2, car.z, 1.2),
    };
    this.traffic = new Traffic(this.scene, this.city, this.seed, {
      carHooks,
      onBark: () => this.hud.addFeed(this.rng.pick(['Hey! My car!', 'Somebody call the police!', 'Watch it!', 'Did you see that?!'])),
    });
    this.police = new Police(this.scene, this.city, {
      carHooks,
      onWanted: (stars, reason) => this.hud.addFeed(`Wanted level ${stars} — ${{ steal: 'car stolen', assault: 'assault', shoot: 'shots fired', kill: 'pedestrian down', ram: 'cruiser rammed', copHit: 'officer hit' }[reason] || reason}`),
      onCleared: (reason) => {
        if (reason === 'evaded') this.hud.showBanner('YOU EVADED THE POLICE', 'The heat is off... for now.');
        if (reason === 'respray') this.hud.showBanner('CLEAN SLATE', 'New colour, no heat.');
      },
      onBusted: () => this.onBusted(),
    });
    this.combat = new Combat(this.scene, this.effects, this.audio);
    this.hud = new HUD({
      onNewGame: () => this.startGame(true),
      onContinue: () => this.startGame(false),
      onResume: () => this.setMode('playing'),
      onSave: () => this.doSave(true),
      onQuitToMenu: () => this.quitToMenu(),
      onRespawn: () => this.onRespawn(),
      onRelease: () => this.onRelease(),
      onFreeRoam: () => this.setMode('playing'),
    });
    this.missions = new Missions({
      scene: this.scene, city: this.city, player: this.player, police: this.police,
      combat: this.combat, effects: this.effects, audio: this.audio, hud: this.hud,
      rng: this.rng,
      onMissionComplete: (def, wasLast) => this.onMissionComplete(def, wasLast),
      onMissionCar: (car) => { this.extraCars.push(car); },
      onMedallion: () => this.doSave(false),
      onPlayerHit: (dmg) => this.damagePlayer(dmg),
    });

    this.hud.setContinueVisible(hasSave());
    this.hud.showScreen('menu-start');
    this.audio.music(true);

    // Clicking the canvas locks the mouse for camera control while playing.
    this.renderer.domElement.addEventListener('click', () => {
      if (this.mode === 'playing') this.input.requestLock();
      this.audio.ensure();
    });

    window.__game = this;
    this.accumulator = 0;
    this.lastNow = performance.now();
    this.raycaster = new THREE.Raycaster();

    // Staged screenshots run the real sim, then flag readiness.
    if (this.shotName) {
      this.startGame(true, true);
      applyShot(this, this.shotName);
      this.renderOnce();
      window.__shotReady = true;
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- mode / flow ----
  setMode(mode) {
    this.mode = mode;
    if (mode !== 'playing') this.input.releaseLock();
    if (mode === 'playing') this.hud.showScreen(null);
  }

  startGame(fresh, silent = false) {
    this.audio.ensure();
    this.audio.click();
    if (this.player.driving) this.player.stopDriving();
    this.player.x = this.city.landmarks.garage.x + 2;
    this.player.z = this.city.landmarks.garage.z + 14;
    this.player.heading = Math.PI;
    this.player.health = 100;
    this.player.cash = 150;
    this.player.weapon = 'fists';
    this.player.ammo = 60;
    this.player.ammoReserve = 120;
    this.player.dead = false;
    this.police.clearWanted('reset');
    this.missions.reset();
    this.clearPickups();
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.playTime = 0;
    if (!fresh) {
      const s = loadGame();
      if (s) {
        this.player.cash = s.cash ?? 150;
        this.player.health = s.health ?? 100;
        this.player.x = s.x ?? this.player.x;
        this.player.z = s.z ?? this.player.z;
        this.missions.index = s.missionIndex ?? 0;
        this.missions.completed = s.completed ?? 0;
        if (Array.isArray(s.medallions)) {
          s.medallions.forEach((got, i) => {
            this.missions.medallions[i] = got;
            if (got) this.missions.medallionMeshes[i].visible = false;
          });
        }
        this.playTime = s.playTime ?? 0;
      }
    }
    this.setMode('playing');
    if (!silent) {
      this.hud.addFeed('Talk to Sal at Marín Motors to start your first job.');
      this.hud.addFeed('WASD to move · F to interact · 1/2 for weapons.');
    }
  }

  quitToMenu() {
    this.audio.click();
    this.doSave(false);
    this.hud.setContinueVisible(hasSave());
    this.hud.showScreen('menu-start');
    this.setMode('menu');
  }

  doSave(announce) {
    const ok = saveGame({
      cash: this.player.cash,
      health: this.player.health,
      x: this.player.x, z: this.player.z,
      missionIndex: this.missions.index,
      completed: this.missions.completed,
      medallions: this.missions.medallions,
      playTime: this.playTime,
    });
    if (announce) {
      this.hud.addFeed(ok ? 'Game saved.' : 'Could not save (storage unavailable).');
      this.audio.click();
    }
    return ok;
  }

  onMissionComplete(def, wasLast) {
    this.doSave(false);
    if (wasLast) {
      const mins = Math.floor(this.playTime / 60);
      const medals = this.missions.medallions.filter(Boolean).length;
      document.getElementById('complete-stats').textContent =
        `Cash $${this.player.cash} · Medallions ${medals}/10 · ${mins} min on the island.`;
      this.hud.showScreen('screen-complete');
      this.setMode('complete');
    }
  }

  damagePlayer(amount) {
    if (this.mode !== 'playing' || this.player.dead) return;
    this.hud.damageFlash();
    this.effects.shake(0.2);
    if (this.player.damage(amount)) {
      this.audio.jingle(false);
      this.police.clearWanted('wasted');
      this.hud.showScreen('screen-wasted');
      this.setMode('wasted');
    }
  }

  onRespawn() {
    this.audio.click();
    this.player.health = 100;
    this.player.cash = Math.max(0, this.player.cash - 200);
    this.player.dead = false;
    const h = this.city.landmarks.hospital;
    this.player.x = h.x; this.player.z = h.z;
    this.player.heading = 0;
    this.setMode('playing');
    this.hud.addFeed('The hospital patched you up. Bill: $200.');
  }

  onBusted() {
    if (this.mode !== 'playing') return;
    this.audio.jingle(false);
    if (this.player.driving) this.player.stopDriving();
    this.player.cash = Math.max(0, this.player.cash - 150);
    this.police.clearWanted('busted');
    this.hud.showScreen('screen-busted');
    this.setMode('busted');
  }

  onRelease() {
    this.audio.click();
    const p = this.city.landmarks.police;
    this.player.x = p.x; this.player.z = p.z + 6;
    this.player.heading = 0;
    this.setMode('playing');
    this.hud.addFeed('You walked free. Bail: $150.');
  }

  // ---- cars ----
  allCars() {
    return [...this.traffic.allCars(), ...this.police.cruisers, ...this.extraCars];
  }

  onCarImpact(car, dmg) {
    const near = dist2D(car.x, car.z, this.player.x, this.player.z) < 30;
    if (near) this.audio.crash();
    if (car.occupied) this.effects.shake(0.3);
    this.effects.burst(car.x, 1, car.z, 0xffcc66, 10, 4, 0.4, 8);
    if (car.isPolice && this.player.driving) this.police.addWanted(1, 'ram');
  }

  onCarDisabled(car) {
    this.effects.smoke(car.x, 1.4, car.z, 2);
    if (car.driver) this.traffic.ejectDriver(car, car.x, car.z);
    if (car.occupied) this.hud.addFeed('The engine is dead. Time to find another ride.');
  }

  // ---- interactions ----
  computeInteract() {
    const p = this.player;
    const L = this.city.landmarks;
    if (p.driving) {
      const car = p.driving;
      if (dist2D(car.x, car.z, L.sprayShop.x, L.sprayShop.z) < 8 && Math.abs(car.speed) < 3) {
        return { type: 'spray', hint: p.cash >= 100 ? 'F — Repaint $100 (clears wanted)' : 'Repaint costs $100' };
      }
      return { type: 'exit', hint: 'F — Exit car' };
    }
    if (dist2D(p.x, p.z, this.missions.sal.x, this.missions.sal.z) < 4.5) {
      return { type: 'sal', hint: 'F — Talk to Sal' };
    }
    if (dist2D(p.x, p.z, L.garage.x, L.garage.z) < 5) {
      return { type: 'save', hint: 'F — Save game' };
    }
    let best = null, bestD = 3.6;
    for (const car of this.allCars()) {
      if (car.occupied) continue;
      const d = dist2D(p.x, p.z, car.x, car.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (best) {
      const familiar = this.lastCar === best && this.time - this.lastExitTime < 30;
      return { type: 'enter', car: best, hint: familiar ? 'F — Get in the car' : 'F — Steal the car' };
    }
    return null;
  }

  doInteract(target) {
    const p = this.player;
    this.audio.click();
    if (target.type === 'exit') {
      this.lastCar = p.driving;
      this.lastExitTime = this.time;
      p.stopDriving();
      this.camYaw = p.heading + Math.PI;
    } else if (target.type === 'enter') {
      const car = target.car;
      if (car.driver) this.traffic.ejectDriver(car, car.x, car.z);
      const familiar = this.lastCar === car && this.time - this.lastExitTime < 30;
      if (!familiar) {
        if (car.isPolice) this.police.addWanted(2, 'copHit');
        else if (!car.isMissionCar) {
          const witnessed = this.traffic.witnessesNear(car.x, car.z, 30) > 0 || this.police.cruisers.length > 0;
          this.police.reportCrime('steal', car.x, car.z, witnessed);
        }
      }
      p.startDriving(car);
      this.camYaw = car.heading;
    } else if (target.type === 'sal') {
      this.missions.talkToSal();
    } else if (target.type === 'save') {
      this.doSave(true);
    } else if (target.type === 'spray') {
      const car = p.driving;
      if (p.cash < 100) { this.hud.addFeed('Not enough cash for a repaint.'); return; }
      p.cash -= 100;
      const paint = car.mesh.userData.paint;
      const next = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      if (paint) paint.color.setHex(next);
      car.color = next;
      this.police.clearWanted('respray');
      this.effects.burst(car.x, 1.5, car.z, 0xd98ae8, 24, 3, 0.7, 3);
      this.audio.pickup();
    }
  }

  // ---- combat ----
  hittableRoots() {
    const roots = [];
    for (const ped of this.traffic.peds) if (ped.state !== 'down') roots.push(ped.parts.group);
    for (const cop of this.police.cops) if (!cop.down) roots.push(cop.parts.group);
    for (const g of this.missions.guards) if (!g.down) roots.push(g.parts.group);
    for (const car of this.allCars()) roots.push(car.mesh);
    return roots;
  }

  handleHit(data, point) {
    const p = this.player;
    const witnessed = this.traffic.witnessesNear(p.x, p.z, 30) > 0 || this.police.cruisers.length > 0;
    if (data.kind === 'ped') {
      const ped = data.ref;
      this.traffic.knockDown(ped);
      this.dropCash(ped.x, ped.z, 10 + Math.floor(Math.random() * 20));
      this.traffic.scare(ped.x, ped.z, 18);
      this.police.reportCrime(p.weapon === 'pistol' ? 'kill' : 'assault', ped.x, ped.z, witnessed);
    } else if (data.kind === 'cop') {
      const cop = data.ref;
      cop.down = true;
      this.scene.remove(cop.parts.group);
      this.police.cops.splice(this.police.cops.indexOf(cop), 1);
      this.police.addWanted(2, 'copHit');
      this.hud.addFeed('Officer down! The precinct will remember that.');
    } else if (data.kind === 'guard') {
      const g = data.ref;
      g.hp -= 1;
      if (g.hp <= 0 && !g.down) {
        g.down = true;
        poseHumanoid(g.parts, 'fall', 0);
        this.dropCash(g.x, g.z, 25);
        this.hud.addFeed('Guard down.');
      }
    } else if (data.kind === 'car') {
      const car = data.ref;
      car.health -= 14;
      if (car.health <= 0 && !car.dead) {
        car.dead = true;
        this.onCarDisabled(car);
      }
    }
  }

  dropCash(x, z, amount) {
    const mesh = new THREE.Group();
    const bill = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.14, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x7ddb6a, emissive: 0x2a5a2a }),
    );
    bill.position.y = 0.4;
    mesh.add(bill);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, x, z, amount, timer: 25 });
  }

  clearPickups() {
    for (const pk of this.pickups) this.scene.remove(pk.mesh);
    this.pickups = [];
  }

  // ---- fixed step ----
  stepFixed(dt) {
    this.time += dt;
    const input = this.input;
    const p = this.player;

    // Global keys.
    if (input.pressed('KeyM')) {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      this.hud.addFeed(this.muted ? 'Sound muted.' : 'Sound on.');
    }
    if ((input.pressed('KeyP') || input.pressed('Escape')) && (this.mode === 'playing' || this.mode === 'paused')) {
      if (this.mode === 'playing') {
        this.setMode('paused');
        this.hud.showScreen('menu-pause');
      } else {
        this.setMode('playing');
      }
    }

    // Ambient world always ticks (menus show the living city behind them).
    this.city.update(dt, this.time);
    this.traffic.update(dt, p, this.allCars());
    this.effects.update(dt);

    if (this.mode === 'menu' || this.mode === 'complete') {
      this.menuAngle += dt * 0.045;
      this.missions.update(dt, this.time);
      this.updateCamera(dt, true);
      this.audio.engine(0, 0);
      this.audio.siren(false);
      this.audio.music(true);
      this.audio.update(dt, this.time);
      this.hud.update(dt, this.hudState());
      this.drawMinimap();
      input.endFrame();
      return;
    }
    if (this.mode !== 'playing') {
      input.endFrame();
      return;
    }
    this.playTime += dt;

    // Weapons.
    if (input.pressed('Digit1')) p.weapon = 'fists';
    if (input.pressed('Digit2')) p.weapon = 'pistol';
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const need = 60 - p.ammo;
        const take = Math.min(need, p.ammoReserve);
        p.ammo += take;
        p.ammoReserve -= take;
        this.hud.addFeed('Reloaded.');
      }
    } else if (input.pressed('KeyR') && p.weapon === 'pistol' && p.ammo < 60 && p.ammoReserve > 0) {
      this.reloadTimer = 1.2;
    }
    if (input.pressed('KeyH') && p.driving) this.audio.horn();

    const aiming = p.weapon === 'pistol' && !p.driving;
    p.update(dt, input, this.camYaw, this.city.collideCircle, aiming);

    // Driving.
    if (p.driving) {
      const car = p.driving;
      const axes = this.scriptedDrive ? { x: this.scriptedDrive.steer, y: this.scriptedDrive.throttle } : input.moveAxes();
      const drive = {
        throttle: axes.y,
        steer: axes.x,
        handbrake: input.down('Space'),
      };
      car.update(dt, drive, this.city.collideCircle, this.allCars(), {
        onImpact: (c, dmg) => this.onCarImpact(c, dmg),
        onDisabled: (c) => this.onCarDisabled(c),
        onSmoke: (c) => this.effects.smoke(c.x, 1.2, c.z, 1.2),
      });
      // Running over pedestrians is a crime the city sees.
      if (Math.abs(car.speed) > 4) {
        for (const ped of this.traffic.peds) {
          if (ped.state === 'down') continue;
          if (dist2D(ped.x, ped.z, car.x, car.z) < 2.3) {
            this.traffic.knockDown(ped);
            this.dropCash(ped.x, ped.z, 10 + Math.floor(Math.random() * 20));
            this.traffic.scare(ped.x, ped.z, 20);
            this.police.reportCrime('kill', ped.x, ped.z, true);
            this.effects.shake(0.35);
            this.audio.crash();
          }
        }
      }
      this.audio.engineOn = true;
      this.audio.engine(clamp(Math.abs(car.speed) / car.spec.top, 0, 1), drive.throttle);
    } else {
      this.audio.engineOn = false;
      this.audio.engine(0, 0);
    }

    // Interaction.
    const target = this.computeInteract();
    p.interactTarget = target;
    this.hud.setHint(target ? target.hint : '');
    if (input.pressed('KeyF') && target) this.doInteract(target);

    // Attacks (a click in the first instants after the pointer locks is the
    // locking click, not a shot; where lock never engages, nothing is lost).
    const lockGrace = performance.now() - (input.lockAcquiredAt || 0) < 200;
    if (input.mouseClicked && !lockGrace && !p.driving && p.attackCooldown <= 0 && this.reloadTimer <= 0) {
      if (p.weapon === 'pistol') {
        if (p.ammo <= 0) {
          if (p.ammoReserve > 0) this.reloadTimer = 1.2;
          else { this.hud.addFeed('Out of ammo.'); this.audio.click(); }
        } else {
          p.ammo -= 1;
          p.attackCooldown = 0.22;
          this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
          const dir = this.raycaster.ray.direction.clone();
          const witnessed = this.traffic.witnessesNear(p.x, p.z, 30) > 0 || this.police.cruisers.length > 0;
          this.police.reportCrime('shoot', p.x, p.z, witnessed);
          this.combat.firePistol(p.muzzlePos(), dir, this.hittableRoots(), this.city.solids, {
            onHit: (data, point) => this.handleHit(data, point),
          });
          this.traffic.scare(p.x, p.z, 26);
        }
      } else {
        p.attackCooldown = 0.45;
        const targets = [];
        for (const ped of this.traffic.peds) if (ped.state !== 'down') targets.push({ x: ped.x, z: ped.z, kind: 'ped', ref: ped });
        for (const cop of this.police.cops) if (!cop.down) targets.push({ x: cop.x, z: cop.z, kind: 'cop', ref: cop });
        for (const g of this.missions.guards) if (!g.down) targets.push({ x: g.x, z: g.z, kind: 'guard', ref: g });
        this.combat.melee(p.x, p.z, p.heading, targets, {
          onHit: (data) => this.handleHit(data, null),
        });
      }
    }

    // Cash pickups.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.timer -= dt;
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = Math.sin(this.time * 3) * 0.08;
      if (!p.driving && dist2D(p.x, p.z, pk.x, pk.z) < 1.8) {
        p.cash += pk.amount;
        this.audio.pickup();
        this.hud.addFeed(`+$${pk.amount}`);
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      } else if (pk.timer <= 0) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }

    this.police.update(dt, p, this.allCars());
    this.missions.update(dt, this.time);
    this.audio.siren(this.police.sirenWanted);
    this.audio.update(dt, this.time);
    this.updateCamera(dt, false);

    // The sun's shadow frustum follows the action.
    this.city.sun.target.position.set(p.x, 0, p.z);
    this.city.sun.position.set(p.x + 180, 260, p.z + 90);

    this.hud.update(dt, this.hudState());
    this.drawMinimap();
    input.endFrame();
  }

  hudState() {
    const p = this.player;
    const target = this.missions.currentTarget;
    return {
      cash: p.cash,
      wanted: this.police.wanted,
      health: p.health,
      maxHealth: p.maxHealth,
      weapon: p.weapon,
      ammo: p.ammo,
      ammoReserve: p.ammoReserve,
      speed: p.driving ? p.driving.speed : 0,
      driving: Boolean(p.driving),
      medallions: this.missions.medallions.filter(Boolean).length,
      targetDist: target ? dist2D(p.x, p.z, target.x, target.z) : null,
      bustProgress: this.police.bustTimer / 3,
      aiming: p.weapon === 'pistol' && !p.driving,
    };
  }

  drawMinimap() {
    const p = this.player;
    this.hud.drawMinimap({
      playerX: p.x,
      playerZ: p.z,
      heading: p.driving ? p.driving.heading + Math.PI : p.heading,
      target: this.missions.currentTarget,
      cruisers: this.police.cruisers,
      cops: this.police.cops.filter((c) => !c.down),
      landmarks: this.city.landmarks,
      medallions: this.missions.medallionMeshes
        .map((m, i) => ({ x: m.position.x, z: m.position.z, got: this.missions.medallions[i] }))
        .filter((m) => !m.got),
      time: this.time,
    });
  }

  updateCamera(dt, vista) {
    const p = this.player;
    if (vista) {
      const a = this.menuAngle;
      const tx = Math.cos(a) * 72, tz = Math.sin(a) * 72;
      this.camera.position.set(tx, 30, tz);
      this.camera.lookAt(-10, 5, -10);
      return;
    }
    const { dx, dy } = this.input.consumeMouse();
    this.camYaw -= dx * 0.0028;
    this.camPitch = clamp(this.camPitch + dy * 0.0022, 0.06, 1.05);
    const target = p.driving
      ? { x: p.driving.x, y: 1.9, z: p.driving.z }
      : { x: p.x, y: p.y + 1.6, z: p.z };
    const wantDist = p.driving ? 10.5 : (p.weapon === 'pistol' ? 6.2 : 7.5);
    this.camDist = damp(this.camDist, wantDist, 5, dt);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const shake = this.effects.shakeOffset();
    this.camera.position.set(
      target.x + Math.sin(this.camYaw) * cp * this.camDist + shake.x,
      target.y + sp * this.camDist + 0.5 + shake.y,
      target.z + Math.cos(this.camYaw) * cp * this.camDist,
    );
    this.camera.lookAt(target.x, target.y + 0.3, target.z);
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.frame++;
    if (this.mode === 'paused') {
      // The sim is frozen, but P/Esc must still resume the game.
      if (this.input.pressed('KeyP') || this.input.pressed('Escape')) this.setMode('playing');
      this.input.endFrame();
    } else {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.stepFixed(STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
    }
    this.renderOnce();
    if (this.frame === 2) window.__ready = true;
  }
}

new Game();
