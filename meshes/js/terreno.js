// terreno.js — el espacio que se gana: de la profundidad de cada fotograma se saca dónde hay suelo y dónde hay
// paredes, y se suma a un mapa del mundo (celdas de 25 cm). Solo se puede caminar sobre suelo que la película ha
// mostrado: si el plano enseña un pasillo, se llega hasta donde llega lo filmado, y ahí se acaba. El siguiente
// plano se coloca delante de donde te quedaste y su suelo continúa el camino. Lo ganado no se pierde.
const CELDA = 0.25;
export class Terreno {
  constructor(prof) { this.prof = prof; this.celdas = new Map(); this.ojo = 1.5; }
  clave(x, z) { return Math.floor(x / CELDA) + ',' + Math.floor(z / CELDA); }
  // un fotograma-espacio nuevo: reconstruir sus puntos en el mundo y clasificarlos
  anadir(capa, t) {
    const P = this.prof, d = P.datos(t), G = 72, H = 50, cm = capa.camMundo, [tx, ty] = capa.tan;
    const pts = new Float32Array(G * H * 3);
    for (let j = 0; j < H; j++) for (let i = 0; i < G; i++) {
      const u = i / (G - 1), v = j / (H - 1);
      const dd = d(u, v) / 255, z = 1 / ((1 - dd) / capa.lejos + dd / capa.cerca);
      const x = (u * 2 - 1) * tx * z, y = (1 - v * 2) * ty * z, zz = -z, o = (j * G + i) * 3;
      pts[o] = cm[0] * x + cm[4] * y + cm[8] * zz + cm[12];
      pts[o + 1] = cm[1] * x + cm[5] * y + cm[9] * zz + cm[13];
      pts[o + 2] = cm[2] * x + cm[6] * y + cm[10] * zz + cm[14];
    }
    const camY = cm[13], alturas = [], nuevas = new Map();
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < G - 1; i++) {
      const o = (j * G + i) * 3, a = (j * G + i + 1) * 3, b = ((j + 1) * G + i) * 3;
      const ux = pts[a] - pts[o], uy = pts[a + 1] - pts[o + 1], uz = pts[a + 2] - pts[o + 2];
      const vx = pts[b] - pts[o], vy = pts[b + 1] - pts[o + 1], vz = pts[b + 2] - pts[o + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; ny /= l;
      const x = pts[o], y = pts[o + 1], zw = pts[o + 2], k = this.clave(x, zw);
      const c = nuevas.get(k) || { suelo: null, muro: false };
      if (Math.abs(ny) > 0.75 && y < camY - 0.3) { c.suelo = c.suelo === null ? y : Math.max(c.suelo, y); alturas.push(camY - y); }
      else if (Math.abs(ny) < 0.35 && y > camY - 1.3 && y < camY + 0.4) c.muro = true;
      nuevas.set(k, c);
    }
    if (alturas.length > 20) { alturas.sort((a, b) => a - b); this.ojo = Math.min(2.5, Math.max(0.6, alturas[alturas.length >> 1])); }
    // lo que tienes bajo los pies (la cámara no se ve los pies): un círculo de suelo a tu altura
    const px = cm[12], pz = cm[14];
    for (let dz = -1.2; dz <= 1.2; dz += CELDA) for (let dx = -1.2; dx <= 1.2; dx += CELDA) {
      if (dx * dx + dz * dz > 1.44) continue;
      const k = this.clave(px + dx, pz + dz); if (!nuevas.has(k)) nuevas.set(k, { suelo: camY - this.ojo, muro: false });
    }
    // lo nuevo sustituye a lo viejo donde lo ve (como una foto de Viewfinder)
    for (const [k, c] of nuevas) {
      const v = this.celdas.get(k) || { suelo: null, muro: false };
      if (c.suelo !== null) { v.suelo = c.suelo; v.muro = c.muro && !c.suelo; } else if (c.muro) v.muro = true;
      this.celdas.set(k, v);
    }
    capa.ojo = this.ojo;
  }
  libre(x, z) { const c = this.celdas.get(this.clave(x, z)); return !!c && c.suelo !== null && !c.muro; }
  suelo(x, z) { const c = this.celdas.get(this.clave(x, z)); return c && c.suelo !== null ? c.suelo : null; }
  get ganado() { let n = 0; for (const c of this.celdas.values()) if (c.suelo !== null && !c.muro) n++; return n * CELDA * CELDA; }
}
