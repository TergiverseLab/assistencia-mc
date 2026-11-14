// terreno.js — por dónde se camina. Se camina libremente por todo el mundo; solo los objetos sólidos (manos, cuerpos,
// muebles) cierran el paso, en celdas de 50 cm. El fondo de cada fotograma se puede atravesar: es una imagen.
// También cuenta cuánto suelo filmado se ha construido (para el marcador).
const CELDA = 0.5, OJO = 1.6;
export class Terreno {
  constructor() { this.bloq = new Set(); this.suelo = new Set(); }
  clave(x, z) { return Math.floor(x / CELDA) + ',' + Math.floor(z / CELDA); }
  sumar(m) {
    const c = m.cajas;
    for (let i = 0; i < c.length; i += 4) for (let x = Math.floor(c[i] / CELDA); x <= Math.floor(c[i + 2] / CELDA); x++) for (let z = Math.floor(c[i + 1] / CELDA); z <= Math.floor(c[i + 3] / CELDA); z++) this.suelo.add(x + ',' + z);
    for (const [x, y, z] of m.puntos) { const h = y - m.sueloY; if (h > 0.15 && h < 2.4) this.bloq.add(this.clave(x, z)); }
  }
  liberar(x, z) { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.bloq.delete(this.clave(x + dx * CELDA, z + dz * CELDA)); }
  libre(x, z) { return !this.bloq.has(this.clave(x, z)); }
  altura() { return OJO; }
  get ganado() { return this.suelo.size * CELDA * CELDA; }
}
