// Every texture is painted on a canvas at load time: no image files, no
// network, and the whole city shares a small set of repeating materials.
import * as THREE from 'three';

function canvasTexture(w, h, paint, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Building face: flat wall colour, a grid of windows, some lit warm.
export function facadeTexture(base, floors, cols, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, w, 6);
    const cw = w / cols, ch = h / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng.chance(0.35);
        g.fillStyle = lit ? '#ffd98a' : '#2c3e50';
        g.fillRect(c * cw + cw * 0.25, f * ch + ch * 0.25, cw * 0.5, ch * 0.5);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(c * cw + cw * 0.25, f * ch + ch * 0.25, cw * 0.5, 2);
      }
    }
  });
}

export function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3a3a40';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Centre dashes run along the texture's vertical axis.
    g.fillStyle = '#e8c33c';
    for (let y = 0; y < h; y += 32) g.fillRect(w / 2 - 2, y + 6, 4, 18);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(6, 0, 3, h);
    g.fillRect(w - 9, 0, 3, h);
  }, 1, 8);
}

export function sidewalkTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#9a938a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke();
      g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
    }
  }, 4, 4);
}

export function sandTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e6cf9a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(120,90,40,${Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, 10, 10);
}

export function grassTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#5d8a4a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(30,60,20,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  }, 8, 8);
}

export function roofTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#6b6560';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, 0, 4, h);
  });
}

// Painted shop sign with the business name; used on landmark buildings.
export function signTexture(lines, bg, fg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((line, i) => {
      g.font = `bold ${n === 1 ? 64 : 44}px Arial, sans-serif`;
      g.fillText(line, w / 2, h * ((i + 0.5) / n));
    });
  });
}

export function billboardTexture(lines, bg, fg, accent) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, h - 28, w, 28);
    g.fillStyle = fg;
    g.textAlign = 'center';
    lines.forEach((line, i) => {
      g.font = `bold ${i === 0 ? 58 : 34}px Arial, sans-serif`;
      g.fillText(line, w / 2, 70 + i * 62);
    });
  });
}

// Golden-hour sky gradient for the sky dome.
export function skyTexture() {
  return canvasTexture(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2e5f8a');
    grad.addColorStop(0.45, '#7fb2d9');
    grad.addColorStop(0.72, '#f7c98b');
    grad.addColorStop(0.88, '#ff9e64');
    grad.addColorStop(1, '#ff8a5c');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// Soft round glow sprite for particles, muzzle flashes and beacons.
export function glowTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function smokeTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(200,200,200,0.85)');
    grad.addColorStop(0.6, 'rgba(160,160,160,0.45)');
    grad.addColorStop(1, 'rgba(150,150,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}
