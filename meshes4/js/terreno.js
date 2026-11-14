// terreno.js — el mapa de lo construido, para caminar (celdas de 50 cm). Todo el mundo comparte un mismo suelo;
// cada fotograma solidificado suma el trozo de suelo que la imagen muestra, y sus objetos y paredes cierran el paso.
const CELDA = 0.5, OJO = 1.6;
export class Terreno {
  constructor() { this.celdas = new Map(); }
  clave(x, z) { return Math.floor(x / CELDA) + ',' + Math.floor(z / CELDA); }
  sumar(m) {
    for (const s of m.suelos) for (let f = s.f0; f <= s.f1; f += CELDA * 0.7) for (let l = s.s0; l <= s.s1; l += CELDA * 0.7) {
      const x = s.cam[0] + s.ade[0] * f + s.der[0] * l, z = s.cam[2] + s.ade[2] * f + s.der[2] * l, k = this.clave(x, z);
      if (!this.celdas.has(k)) this.celdas.set(k, { suelo: s.y, ocupado: false });
    }
    for (const [x, y, z] of m.puntos) { const c = this.celdas.get(this.clave(x, z)); if (c) { const h = y - c.suelo; if (h > 0.15 && h < 2.4) c.ocupado = true; } }
  }
  liberar(x, z) { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = this.celdas.get(this.clave(x + dx * CELDA, z + dz * CELDA)); if (c) c.ocupado = false; } }
  libre(x, z) { const c = this.celdas.get(this.clave(x, z)); return !!c && !c.ocupado; }
  altura(x, z) { const c = this.celdas.get(this.clave(x, z)); return c ? c.suelo + OJO : null; }
  get ganado() { let n = 0; for (const c of this.celdas.values()) if (!c.ocupado) n++; return n * CELDA * CELDA; }
}
