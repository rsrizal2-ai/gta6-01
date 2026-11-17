// The whole 2D layer: health, cash, wanted stars, weapon, speed, the
// mission tracker, the canvas minimap, the event feed, dialogue, banners,
// and every menu screen. DOM is updated only when a value changes.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(cb) {
    this.cb = cb;
    this.cache = {};
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.dialogueName = '';
    this.bannerTimer = 0;
    this.returnTo = 'start';

    $('btn-new').addEventListener('click', () => cb.onNewGame());
    $('btn-continue').addEventListener('click', () => cb.onContinue());
    $('btn-controls').addEventListener('click', () => this.showScreen('controls', 'start'));
    $('btn-controls-pause').addEventListener('click', () => this.showScreen('controls', 'pause'));
    $('btn-back-controls').addEventListener('click', () => this.showScreen(this.returnTo));
    $('btn-resume').addEventListener('click', () => cb.onResume());
    $('btn-save').addEventListener('click', () => cb.onSave());
    $('btn-menu').addEventListener('click', () => cb.onQuitToMenu());
    $('btn-respawn').addEventListener('click', () => cb.onRespawn());
    $('btn-release').addEventListener('click', () => cb.onRelease());
    $('btn-freeroam').addEventListener('click', () => cb.onFreeRoam());
    $('btn-menu-complete').addEventListener('click', () => cb.onQuitToMenu());

    this.minimap = $('minimap').getContext('2d');
  }

  setText(id, value) {
    if (this.cache[id] === value) return;
    this.cache[id] = value;
    $(id).textContent = value;
  }

  showScreen(name, returnTo) {
    if (returnTo) this.returnTo = returnTo;
    for (const id of ['menu-start', 'menu-pause', 'menu-controls', 'screen-wasted', 'screen-busted', 'screen-complete']) {
      $(id).classList.toggle('visible', id === name);
    }
    $('hud').classList.toggle('hidden', name === 'menu-start' || name === 'screen-complete');
  }

  setContinueVisible(visible) {
    $('btn-continue').style.display = visible ? '' : 'none';
  }

  setObjective(title, text) {
    this.setText('mission-title', title);
    this.setText('mission-objective', text);
    $('mission-tracker').classList.toggle('visible', Boolean(title || text));
  }

  addFeed(text) {
    const feed = $('feed');
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.textContent = text;
    feed.prepend(div);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 600); }, 5200);
  }

  showDialogue(name, lines) {
    this.dialogueName = name;
    this.dialogueQueue = [...lines];
    this.advanceDialogue();
  }

  advanceDialogue() {
    const line = this.dialogueQueue.shift();
    if (line === undefined) {
      $('dialogue').classList.remove('visible');
      return;
    }
    this.setText('dialogue-name', this.dialogueName);
    this.setText('dialogue-text', line);
    $('dialogue').classList.add('visible');
    this.dialogueTimer = 3.8;
  }

  showBanner(title, sub) {
    this.setText('banner-title', title);
    this.setText('banner-sub', sub || '');
    $('banner').classList.add('visible');
    this.bannerTimer = 3.0;
  }

  setHint(text) {
    this.setText('hint', text);
    $('hint').classList.toggle('visible', Boolean(text));
  }

  damageFlash() {
    const v = $('vignette');
    v.classList.remove('flash');
    void v.offsetWidth;
    v.classList.add('flash');
  }

  update(dt, s) {
    this.setText('cash', `$${s.cash}`);
    this.setText('stars', '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted));
    $('stars').classList.toggle('hot', s.wanted > 0);
    this.setText('medals', `☀ ${s.medallions}/10`);
    this.setText('health-text', `${Math.ceil(s.health)}`);
    const pct = Math.max(0, (s.health / s.maxHealth) * 100);
    if (this.cache.healthPct !== pct) {
      this.cache.healthPct = pct;
      $('health-fill').style.width = `${pct}%`;
      $('health-fill').classList.toggle('low', pct < 30);
    }
    this.setText('weapon', s.weapon === 'pistol' ? 'PISTOL' : 'FISTS');
    this.setText('ammo', s.weapon === 'pistol' ? `${s.ammo} / ${s.ammoReserve}` : '');
    this.setText('speed', s.driving ? `${Math.round(Math.abs(s.speed) * 2.4)} mph` : '');
    if (s.targetDist !== null && s.targetDist !== undefined) {
      this.setText('mission-dist', `${Math.round(s.targetDist)}m`);
    } else {
      this.setText('mission-dist', '');
    }
    $('crosshair').classList.toggle('visible', s.aiming);
    const bust = $('bust-meter');
    if (s.bustProgress > 0) {
      bust.classList.add('visible');
      $('bust-fill').style.width = `${Math.min(100, s.bustProgress * 100)}%`;
    } else {
      bust.classList.remove('visible');
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.advanceDialogue();
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').classList.remove('visible');
    }
  }

  // Top-down map: roads, blocks, water, landmarks, the player arrow, the
  // objective diamond, police, and the remaining medallions.
  drawMinimap(world) {
    const g = this.minimap;
    const S = 220, RANGE = 480;
    const toMap = (x, z) => [(x + RANGE / 2) * (S / RANGE), (z + RANGE / 2) * (S / RANGE)];
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#1d2b1d';
    g.fillRect(0, 0, S, S);
    // Water bands north and south, beach strip.
    g.fillStyle = '#2e8ba8';
    g.fillRect(0, 0, S, toMap(0, -234)[1]);
    g.fillRect(0, toMap(0, 234)[1], S, S);
    g.fillStyle = '#e6cf9a';
    g.fillRect(0, toMap(0, 234)[1], S, toMap(0, 262)[1] - toMap(0, 234)[1]);
    // Blocks.
    g.fillStyle = '#3a4a3a';
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const [x, z] = toMap(-182 + i * 52 - 20, -182 + j * 52 - 20);
        g.fillRect(x, z, 40 * (S / RANGE), 40 * (S / RANGE));
      }
    }
    // Roads.
    g.strokeStyle = '#555560';
    g.lineWidth = 12 * (S / RANGE);
    for (let k = -4; k <= 4; k++) {
      const [x] = toMap(k * 52, 0);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      const [, z] = toMap(0, k * 52);
      g.beginPath(); g.moveTo(0, z); g.lineTo(S, z); g.stroke();
    }
    // Landmark letters.
    g.font = 'bold 9px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const marks = [
      ['garage', 'G', '#ff9e64'], ['sprayShop', 'S', '#d98ae8'],
      ['hospital', 'H', '#ffffff'], ['police', 'P', '#7fb2d9'], ['kroll', 'K', '#ffd23c'],
    ];
    for (const [key, letter, color] of marks) {
      const L = world.landmarks[key];
      if (!L) continue;
      const [x, z] = toMap(L.x, L.z);
      g.fillStyle = color;
      g.fillText(letter, x, z);
    }
    // Remaining medallions.
    g.fillStyle = '#ffd23c';
    for (const m of world.medallions) {
      const [x, z] = toMap(m.x, m.z);
      g.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police.
    for (const c of world.cruisers) {
      const [x, z] = toMap(c.x, c.z);
      g.fillStyle = '#ff4040';
      g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill();
    }
    for (const c of world.cops) {
      const [x, z] = toMap(c.x, c.z);
      g.fillStyle = '#6080ff';
      g.beginPath(); g.arc(x, z, 2.5, 0, 7); g.fill();
    }
    // Objective diamond, pulsing.
    if (world.target) {
      const [x, z] = toMap(world.target.x, world.target.z);
      const r = 5 + Math.sin(world.time * 4) * 1.5;
      g.fillStyle = '#ffd23c';
      g.beginPath();
      g.moveTo(x, z - r); g.lineTo(x + r, z); g.lineTo(x, z + r); g.lineTo(x - r, z);
      g.closePath(); g.fill();
      g.strokeStyle = '#7a5a00';
      g.stroke();
    }
    // Player arrow, rotated by heading (map north is -z).
    const [px, pz] = toMap(world.playerX, world.playerZ);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.atan2(Math.sin(world.heading), -Math.cos(world.heading)));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#222222';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
    // Border ring.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, 7); g.stroke();
  }
}
