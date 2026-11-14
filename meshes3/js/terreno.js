// terreno.js — el mapa de lo construido, para caminar (celdas de 50 cm): dónde hay suelo, a qué altura, y qué
// está ocupado por objetos o paredes. Se va sumando con cada fotograma solidificado; nada se pierde.
const CELDA = 0.5, OJO = 1.6;
export class Terreno {
  constructor() { this.celdas = new Map(); }
  clave(x, z) { return Math.floor(x / CELDA) + ',' + Math.floor(z / CELDA); }
  sumar(puntos) {
    for (const p of puntos) {
      if (p.tipo !== 'suelo') continue;
      const { suelo, ade, der, fondo, ancho, cam } = p, n = suelo.n;
      for (let f = -2; f <= fondo; f += CELDA * 0.7) for (let s = -ancho; s <= ancho; s += CELDA * 0.7) {
        const x = cam[0] + ade[0] * f + der[0] * s, z = cam[2] + ade[2] * f + der[2] * s, y = (suelo.d - n[0] * x - n[2] * z) / n[1];
        const k = this.clave(x, z), c = this.celdas.get(k);
        if (!c) this.celdas.set(k, { suelo: y, ocupado: false }); else if (c.suelo === null || y > c.suelo) c.suelo = y;
      }
    }
    for (const p of puntos) {
      if (p.tipo === 'suelo') continue;
      const c = this.celdas.get(this.clave(p.x, p.z)); if (!c || c.suelo === null) continue;
      const h = p.y - c.suelo; if (h > 0.15 && h < 2.4) c.ocupado = true;
    }
  }
  // el sitio donde está el jugador nunca queda ocupado (no se queda encerrado al solidificar)
  liberar(x, z) { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = this.celdas.get(this.clave(x + dx * CELDA, z + dz * CELDA)); if (c) c.ocupado = false; } }
  libre(x, z) { const c = this.celdas.get(this.clave(x, z)); return !!c && c.suelo !== null && !c.ocupado; }
  altura(x, z) { const c = this.celdas.get(this.clave(x, z)); return c && c.suelo !== null ? c.suelo + OJO : null; }
  get ganado() { let n = 0; for (const c of this.celdas.values()) if (c.suelo !== null && !c.ocupado) n++; return n * CELDA * CELDA; }
}
