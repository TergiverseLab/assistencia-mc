// vision.js — ver. Dos modelos, sin internet, en el propio móvil:
//  · CenterNet (80 clases COCO): qué cosas hay y dónde (recuadros).
//  · Selfie segmentation (MediaPipe): la silueta exacta de las personas, como máscara 256 × 256.
// Corren a su ritmo, en alternancia; el dibujo de letras va siempre a 30 fps con lo último que vieron.
// Un seguimiento sencillo (misma clase + solape) mantiene la identidad de cada cosa entre fotogramas,
// para que su nombre no cambie a cada parpadeo, sino cuando la deriva lo decida.
import { Human } from '../vendor/human.esm.js';

const iou = (a, b) => {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a[2] * a[3] + b[2] * b[3] - i + 1e-6);
};

export class Vision {
  constructor(nombrador) {
    this.nombrador = nombrador;
    this.cosas = []; // {id, etiqueta, caja:[x,y,w,h] en 0..1 del vídeo, confianza, visto, nombre:{palabra, historia…}}
    this.mascara = null; this.mascaraTam = 256; // Float32Array 256×256 (alfa de persona)
    this.siguienteId = 1;
    this.listo = false;
    this.ritmo = { obj: 0, seg: 0 };
  }

  async cargar(avisar) {
    this.human = new Human({
      backend: 'webgl', modelBasePath: new URL('../modelos/', import.meta.url).href,
      debug: false, async: true, warmup: 'none', cacheSensitivity: 0, filter: { enabled: false },
      face: { enabled: false }, body: { enabled: false }, hand: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false },
      object: { enabled: true, modelPath: 'centernet.json', minConfidence: 0.22, iouThreshold: 0.4, maxDetected: 12, skipFrames: 0, skipTime: 0 }
    });
    avisar('despertando la mirada…');
    await this.human.load();
    this.tf = this.human.tf;
    avisar('aprendiendo a ver cuerpos…');
    this.selfie = await this.tf.loadGraphModel(new URL('../modelos/selfie.json', import.meta.url).href);
    // calentar: el primer dibujo compila los shaders y tarda
    const z = this.tf.zeros([1, 256, 256, 3]); const r = this.selfie.execute(z); r.dispose(); z.dispose();
    this.listo = true;
  }

  // un ciclo de visión: alterna detector y segmentador para repartir la carga
  async ver(video) {
    if (!this.listo || this.ocupado || !video.videoWidth) return;
    this.ocupado = true;
    try {
      const t = performance.now() / 1000;
      if (this.turno = !this.turno) await this._objetos(video, t); else await this._siluetas(video);
    } catch (e) { console.warn('visión:', e); }
    this.ocupado = false;
  }

  async _siluetas(video) {
    const tf = this.tf; const t0 = performance.now();
    const salida = tf.tidy(() => {
      const img = tf.browser.fromPixels(video);
      // el tf de Human no trae los métodos encadenados: se llaman como funciones
      const x = tf.expandDims(tf.div(tf.image.resizeBilinear(img, [256, 256]), 255), 0);
      return tf.squeeze(this.selfie.execute(x));
    });
    this.mascara = await salida.data(); salida.dispose();
    this.ritmo.seg = performance.now() - t0;
  }

  async _objetos(video, t) {
    const t0 = performance.now();
    const res = await this.human.detect(video);
    this.ritmo.obj = performance.now() - t0;
    const W = video.videoWidth, H = video.videoHeight;
    const nuevas = (res.object || []).map((o) => ({ etiqueta: o.label, confianza: o.score, caja: [o.box[0] / W, o.box[1] / H, o.box[2] / W, o.box[3] / H] }));
    // emparejar con lo que ya se veía
    const libres = new Set(this.cosas);
    for (const n of nuevas) {
      let mejor = null, m = 0.25;
      for (const c of libres) if (c.etiqueta === n.etiqueta) { const s = iou(c.caja, n.caja); if (s > m) { m = s; mejor = c; } }
      if (mejor) {
        libres.delete(mejor);
        for (let k = 0; k < 4; k++) mejor.caja[k] += (n.caja[k] - mejor.caja[k]) * 0.6;
        mejor.confianza = n.confianza; mejor.visto = t;
      } else {
        const c = { id: this.siguienteId++, etiqueta: n.etiqueta, confianza: n.confianza, caja: n.caja.slice(), visto: t, nacio: t };
        c.nombre = this.nombrador.bautizar(n.etiqueta, n.confianza); c.nombre.cambio = t;
        this.cosas.push(c);
      }
    }
    // lo que deja de verse se queda un momento y luego se olvida
    this.cosas = this.cosas.filter((c) => t - c.visto < 1.2);
  }

  // la deriva corre con el reloj, no con la detección
  derivar(t) {
    for (const c of this.cosas) if (t - c.nombre.cambio > c.nombre.proxima) this.nombrador.derivar(c.nombre, c.etiqueta);
  }
}
