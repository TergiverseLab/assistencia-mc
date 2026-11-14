// render.js — la pasada de texto del bosque caligramático, sobre un canvas 2D.
// Es el mismo bucle que dibuja el bosque: para cada celda de la rejilla mira (tipo, luz, id); si la luz pasa
// el umbral y el paso del tipo lo permite, toma la letra (fila*199 + columna + id*37) de la historia de esa
// cosa y la escribe en negro con la opacidad de su luz, agrupando en tiradas las letras seguidas del mismo
// estilo para no llamar a fillText por cada una. Las letras «infectadas» (aquí: la palabra recién mal vista)
// salen en rojo, en negrita y 2 px más grandes, como en el bosque. En modo interior, fondo negro y letra blanca.
import { REJILLA, TABLA, fuente } from './tipos.js';

const bA = [], rA = [], wA = [], wR = [];
for (let i = 0; i <= 20; i++) {
  bA[i] = `rgba(0,0,0,${(i / 20).toFixed(2)})`;
  rA[i] = `rgba(180,20,20,${Math.min(1, i / 20 + 0.15).toFixed(2)})`;
  wA[i] = `rgba(255,255,255,${(i / 20).toFixed(2)})`;
  wR[i] = `rgba(255,${Math.round(40 + i * 4)},${Math.round(30 + i * 2.5)},${Math.min(1, i / 20 + 0.15).toFixed(2)})`;
}
const relleno = new Map();
function padTxt(s) { // textos cortos: repetirlos para que el módulo no haga bandas
  if (s.length >= 80) return s;
  let r = relleno.get(s); if (r) return r;
  r = s; while (r.length < 80) r += s;
  relleno.set(s, r); return r;
}

export class Lienzo {
  constructor(canvas) {
    this.canvas = canvas;
    this.cx = canvas.getContext('2d', { alpha: false });
    this.interior = false; this.fantasma = 0;
  }

  // w,h en píxeles del canvas; letra = alto de la rejilla en px CSS; escala = píxeles de canvas por px CSS
  tam(w, h, letra, escalaPantalla) {
    this.canvas.width = w; this.canvas.height = h;
    const e = (letra / REJILLA) * escalaPantalla; this.escala = e;
    this.cx.font = fuente(['', REJILLA], e);
    this.CW = this.cx.measureText('M').width; this.CH = REJILLA * e * 1.25;
    this.cols = Math.max(2, Math.floor(w / this.CW)); this.filas = Math.max(2, Math.floor(h / this.CH));
    this.fuentes = TABLA.map((t) => (t ? fuente(t, e) : null));
    this.infectadas = TABLA.map((t) => (t ? fuente(['bold', t[1] + 2], e) : null));
    return [this.cols, this.filas];
  }

  dibujar(esc, t, fondoTexto, video, rec, espejo) {
    const { cx, cols, filas, CW, CH, interior } = this, W = this.canvas.width, H = this.canvas.height;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.fillStyle = interior ? '#000' : '#fff';
    cx.fillRect(0, 0, W, H);
    if (this.fantasma > 0 && video && video.videoWidth) { // la imagen, apenas, debajo de la letra (no está en el bosque; por defecto 0)
      cx.save(); cx.globalAlpha = this.fantasma;
      if (espejo) { cx.translate(W, 0); cx.scale(-1, 1); }
      const vw = video.videoWidth, vh = video.videoHeight;
      cx.drawImage(video, rec[0] * vw, rec[1] * vh, rec[2] * vw, rec[3] * vh, 0, 0, W, H);
      cx.restore();
    }
    cx.textBaseline = 'top';
    const { tipo, luz, id } = esc, historias = esc.historias;
    const negro = interior ? wA : bA, rojo = interior ? wR : rA;
    const umbral = interior ? 0.02 : 0.03;
    const fondo = padTxt(fondoTexto);
    let cF = '';
    for (let y = 0; y < filas; y++) {
      let run = '', runX = 0, runF = '', runA = -1, runInf = false;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, cfg = TABLA[tipo[i]];
        let ok = false;
        if (cfg) {
          const vis = luz[i] / 255;
          const cS = cfg[2], rS = cfg[3];
          if (vis >= umbral && (cS <= 1 || x % cS === 0) && (rS <= 1 || y % rS === 0)) {
            const k = id[i], h = k ? historias.get(k) : null;
            const orig = h ? h.texto : fondoTexto, txt = h ? padTxt(h.texto) : fondo;
            const rx = cS > 1 ? Math.floor(x / cS) : x;
            const ci = (y * 199 + rx + k * 37) % txt.length;
            const c = txt[ci];
            if (c !== ' ') {
              let inf = false;
              if (h && t < h.rojoHasta) { const oi = ci % orig.length; inf = oi < h.rojo || oi >= orig.length - 1 - h.rojo; }
              const f = inf ? this.infectadas[tipo[i]] : this.fuentes[tipo[i]];
              const a = Math.round(vis * 20) | 0;
              if (f === runF && a === runA && inf === runInf && x === runX + run.length) { run += c; ok = true; }
              else {
                if (run) cx.fillText(run, runX * CW, y * CH);
                run = c; runX = x; runF = f; runA = a; runInf = inf;
                if (cF !== f) { cx.font = f; cF = f; }
                cx.fillStyle = inf ? rojo[a] : negro[a];
                ok = true;
              }
            }
          }
        }
        if (!ok && run) { cx.fillText(run, runX * CW, y * CH); run = ''; }
      }
      if (run) cx.fillText(run, runX * CW, y * CH);
    }
  }
}
