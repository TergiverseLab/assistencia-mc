// objetos.js — el primer ojo, el que usábamos antes: CenterNet (80 objetos COCO, en recuadros) más la silueta
// exacta de las personas (selfie segmentation). Gratuitos, sin internet. Aquí se traduce lo que ven al mismo
// formato que el otro ojo: un mapa de etiquetas del trozo visible, para que el dibujo no distinga entre ojos.
// Lo que no es objeto ni persona queda como «ojo» (sin nombre).
import { Vision } from './vision.js';
import { COCO_EN, COCO_0, SIN_VER } from './clases.js';

const NADIE = { bautizar: () => ({ palabra: '', historia: [] }), derivar() {} };
const FILA = new Map(COCO_EN.map((e, i) => [e, COCO_0 + i]));

export class OjoObjetos {
  constructor() { this.vision = new Vision(NADIE); this.listo = false; this.version = 0; this.ms = 0; this.motor = 'centernet + silueta'; this.ancho = 48; this.altoMapa = 96; }
  async cargar(avisar) { await this.vision.cargar(avisar); this.listo = true; }
  async ver(video, rec) {
    if (!this.listo || this.ocupado) return false;
    this.ocupado = true; const t0 = performance.now();
    try { await this.vision.ver(video); } finally { this.ocupado = false; }
    const W = this.ancho, H = this.altoMapa, mapa = new Uint8Array(W * H).fill(SIN_VER);
    const M = 256, mascara = this.vision.mascara;
    // de mayor a menor: lo pequeño queda encima
    const cosas = [...this.vision.cosas].sort((a, b) => b.caja[2] * b.caja[3] - a.caja[2] * a.caja[3]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = rec[0] + ((x + 0.5) / W) * rec[2], v = rec[1] + ((y + 0.5) / H) * rec[3];
      let k = SIN_VER;
      for (const c of cosas) {
        const [cx, cy, cw, ch] = c.caja;
        const e = ((u - cx - cw / 2) / (cw / 2)) ** 2 + ((v - cy - ch / 2) / (ch / 2)) ** 2;
        if (e <= 1 && c.etiqueta !== 'person') k = FILA.get(c.etiqueta) ?? k;
      }
      if (mascara && mascara[Math.min(M - 1, (v * M) | 0) * M + Math.min(M - 1, (u * M) | 0)] > 0.55) k = COCO_0;
      mapa[y * W + x] = k;
    }
    this.mapa = mapa; this.version++;
    const ms = performance.now() - t0; this.ms = this.ms ? this.ms * 0.8 + ms * 0.2 : ms;
    return true;
  }
  recuento() {
    if (!this.mapa) return [];
    const c = new Map(); for (const k of this.mapa) c.set(k, (c.get(k) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n / this.mapa.length]);
  }
}
