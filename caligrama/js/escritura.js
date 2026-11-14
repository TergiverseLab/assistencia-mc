// escritura.js — de lo que se ve al búfer del bosque.
// El bosque renderiza la escena en un búfer del tamaño de la rejilla donde cada celda guarda
// (tipo de cosa, luz, id de la cosa); luego una pasada de texto escribe en cada celda la letra que le toca
// de la historia de esa cosa, con la opacidad de su luz. Aquí ese mismo búfer se rellena desde la cámara:
//  · cosas: la caja del detector recortada por contraste con su borde (elipse + diferencia de tono);
//  · cuerpos: la máscara de silueta;
//  · el resto: el fondo, la hierba del bosque; donde la escena es clara, nada (el cielo blanco).
import { relato } from './relatos.js';
import { tipoDe, indiceTipo, TIPO_FONDO, TIPO_PERSONA } from './tipos.js';

const T_FONDO = indiceTipo(TIPO_FONDO), T_PERSONA = indiceTipo(TIPO_PERSONA);
export const ID_FONDO = 0, ID_CUERPO = 1;

export class Escritura {
  constructor() { this.cols = 0; this.filas = 0; this.interior = false; this.cuerpo = null; this.relatos = new Map(); }

  tam(cols, filas) {
    this.cols = cols; this.filas = filas; const n = cols * filas;
    this.tipo = new Uint8Array(n); this.luz = new Uint8Array(n); this.id = new Uint8Array(n);
    this.region = new Int16Array(n); this.lum = new Float32Array(n);
  }

  _uv(c, f, rec, espejo) {
    let x = (c + 0.5) / this.cols; if (espejo) x = 1 - x;
    return [rec[0] + x * rec[2], rec[1] + ((f + 0.5) / this.filas) * rec[3]];
  }
  _caja(caja, rec, espejo) {
    let x0 = (caja[0] - rec[0]) / rec[2], x1 = (caja[0] + caja[2] - rec[0]) / rec[2];
    if (espejo) [x0, x1] = [1 - x1, 1 - x0];
    const y0 = (caja[1] - rec[1]) / rec[3], y1 = (caja[1] + caja[3] - rec[1]) / rec[3];
    return [x0 * this.cols, y0 * this.filas, x1 * this.cols, y1 * this.filas];
  }

  // la historia de una cosa, rehecha solo cuando su nombre cambia
  _relato(cosa, idCelda, t) {
    const n = cosa.nombre;
    let r = this.relatos.get(idCelda);
    if (!r || r.cambio !== n.cambio || r.palabra !== n.palabra) {
      r = { ...relato(n), cambio: n.cambio, palabra: n.palabra, rojoHasta: (n.cambio || t) + 2.4 };
      this.relatos.set(idCelda, r);
    }
    r.visto = t;
    return r;
  }

  escribir(t, cosas, mascara, rec, espejo) {
    const { cols, filas, region, lum, tipo, luz, id } = this;
    region.fill(-1);
    const regiones = [];
    // 1 · objetos, de mayor a menor (lo pequeño queda encima)
    const objetos = cosas.filter((c) => c.etiqueta !== 'person').sort((a, b) => b.caja[2] * b.caja[3] - a.caja[2] * a.caja[3]);
    for (const o of objetos) {
      const k = regiones.length; regiones.push(o);
      const [x0, y0, x1, y1] = this._caja(o.caja, rec, espejo);
      const c0 = Math.max(0, Math.floor(x0)), c1 = Math.min(cols - 1, Math.ceil(x1)), f0 = Math.max(0, Math.floor(y0)), f1 = Math.min(filas - 1, Math.ceil(y1));
      if (c1 <= c0 || f1 <= f0) continue;
      let s = 0, n = 0;
      for (let c = c0; c <= c1; c++) { s += lum[f0 * cols + c] + lum[f1 * cols + c]; n += 2; }
      for (let f = f0; f <= f1; f++) { s += lum[f * cols + c0] + lum[f * cols + c1]; n += 2; }
      const borde = s / n, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      for (let f = f0; f <= f1; f++) for (let c = c0; c <= c1; c++) {
        const e = ((c + 0.5 - cx) / rx) ** 2 + ((f + 0.5 - cy) / ry) ** 2, i = f * cols + c;
        if (e <= 1 && (e < 0.4 || Math.abs(lum[i] - borde) > 0.09)) region[i] = k;
      }
    }
    // 2 · cuerpos: la máscara manda; cada celda va a la persona más cercana, o a un cuerpo sin detectar
    if (mascara) {
      const M = 256;
      const personas = cosas.filter((c) => c.etiqueta === 'person').map((p) => { const k = regiones.length; regiones.push(p); return { k, r: this._caja(p.caja, rec, espejo) }; });
      let kCuerpo = -1;
      for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) {
        const [u, v] = this._uv(c, f, rec, espejo);
        if (mascara[Math.min(M - 1, Math.floor(v * M)) * M + Math.min(M - 1, Math.floor(u * M))] < 0.55) continue;
        let elegido = -1, mejor = 1e9;
        for (const p of personas) {
          const [x0, y0, x1, y1] = p.r;
          const d = Math.max(0, x0 - c, c - x1) + Math.max(0, y0 - f, f - y1);
          if (d < mejor) { mejor = d; elegido = p.k; }
        }
        if (elegido < 0 || mejor > 6) {
          if (kCuerpo < 0) {
            if (!this.cuerpo || t - this.cuerpo.visto > 2) this.cuerpo = this._cuerpo(t);
            this.cuerpo.visto = t; kCuerpo = regiones.length; regiones.push(this.cuerpo);
          }
          elegido = kCuerpo;
        }
        region[f * cols + c] = elegido;
      }
    }
    // 3 · el búfer: tipo, luz, id — como el render target del bosque
    const tiposRegion = regiones.map((r) => indiceTipo(r.etiqueta === 'person' ? TIPO_PERSONA : tipoDe(r.etiqueta)));
    const idsRegion = regiones.map((r) => (r === this.cuerpo ? ID_CUERPO : 2 + (r.id % 250)));
    this.historias = new Map();
    regiones.forEach((r, k) => this.historias.set(idsRegion[k], this._relato(r, idsRegion[k], t)));
    const inv = this.interior;
    for (let i = 0; i < region.length; i++) {
      const l = lum[i], k = region[i];
      if (k >= 0) {
        // las cosas: casi opacas, sombreadas por su propia luz (el lit = .65 + .35·N·L del bosque)
        tipo[i] = tiposRegion[k]; id[i] = idsRegion[k];
        luz[i] = 255 * (inv ? 0.32 + 0.45 * l : 0.62 + 0.38 * (1 - l));
      } else {
        // el fondo: la hierba se escribe donde hay sombra o borde; lo claro queda en blanco, como el cielo
        const c = i % cols, f = (i / cols) | 0;
        const borde = c < cols - 1 && f < filas - 1 ? Math.abs(l - lum[i + 1]) + Math.abs(l - lum[i + cols]) : 0;
        const sombra = Math.max(0, ((inv ? l : 1 - l) - 0.3) / 0.7);
        const v = Math.min(1, sombra * sombra * 0.9 + borde * 2.2);
        tipo[i] = T_FONDO; id[i] = ID_FONDO; luz[i] = 255 * v * (inv ? 0.55 : 0.7);
      }
    }
    // olvidar historias de cosas que ya no están
    for (const [k, r] of this.relatos) if (t - r.visto > 5) this.relatos.delete(k);
    return regiones.length;
  }

  _cuerpo(t) {
    const nombre = this.nombrador.bautizar('person', 0.35); nombre.cambio = t;
    return { id: 0, etiqueta: 'person', confianza: 0.35, caja: [0, 0, 1, 1], visto: t, nombre };
  }
}
