// All sound is synthesized with WebAudio: engine drone, sirens, gunfire,
// pickups, jingles and a slow chord pad. No audio files, no network.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicOsc = null;
    this.musicGain = null;
    this.musicStep = 0;
    this.musicTimer = 0;
    this.sirenOn = false;
    this.engineOn = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Continuous engine drone; call every frame while driving.
  engine(speed01, throttle) {
    if (!this.ensure()) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const target = this.engineOn ? 0.05 + speed01 * 0.06 + Math.abs(throttle) * 0.03 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130 + Math.abs(throttle) * 25, this.ctx.currentTime, 0.06);
  }

  siren(on) {
    this.sirenOn = on;
    if (!this.ensure()) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  // Slow warm pad: one chord every four seconds, Am - F - C - G.
  music(on) {
    if (!on) {
      if (this.musicOsc) {
        try { this.musicOsc.stop(); } catch { /* stopped */ }
        this.musicOsc.disconnect();
        this.musicOsc = null;
      }
      return;
    }
    if (!this.ensure() || this.musicOsc) return;
    this.musicOsc = this.ctx.createOscillator();
    this.musicOsc.type = 'triangle';
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.035;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 700;
    this.musicOsc.connect(filt).connect(this.musicGain).connect(this.master);
    this.musicOsc.frequency.value = 220;
    this.musicOsc.start();
  }

  update(dt, t) {
    if (this.sirenOsc) {
      this.sirenOsc.frequency.value = Math.sin(t * 5.2) > 0 ? 720 : 540;
    }
    if (this.musicOsc) {
      this.musicTimer += dt;
      if (this.musicTimer > 4) {
        this.musicTimer = 0;
        const chords = [220, 174.6, 261.6, 196];
        this.musicStep = (this.musicStep + 1) % chords.length;
        this.musicOsc.frequency.setTargetAtTime(chords[this.musicStep], this.ctx.currentTime, 0.6);
      }
    }
  }

  blip(freq, dur, type = 'sine', gain = 0.15, slideTo = null) {
    if (!this.ensure()) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.02);
  }

  noise(dur, filterFreq, gain = 0.25) {
    if (!this.ensure()) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(this.master);
    src.start();
  }

  shot() { this.noise(0.16, 1600, 0.3); this.blip(120, 0.1, 'square', 0.12, 50); }
  punch() { this.noise(0.08, 500, 0.22); }
  pickup() { this.blip(880, 0.09); setTimeout(() => this.blip(1320, 0.12), 70); }
  click() { this.blip(660, 0.05, 'square', 0.07); }
  horn() { this.blip(370, 0.28, 'square', 0.09); this.blip(466, 0.28, 'square', 0.09); }
  crash() { this.noise(0.25, 900, 0.3); }
  jingle(win) {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.14), i * 110));
  }
}
