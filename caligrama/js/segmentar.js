// segmentar.js — el ojo de la escena, visto desde el hilo de la imagen.
// SegFormer-b0 entrenado en ADE20K (150 clases: pared, ventana, techo, lámpara, persona…). Todo el trabajo
// pesado ocurre en ojo-trabajador.js, en otro hilo; aquí solo se recorta y reduce el fotograma con
// createImageBitmap (que el navegador hace fuera de este hilo) y se recibe el mapa de etiquetas.
export class Segmentador {
  constructor() { this.listo = false; this.ocupado = false; this.version = 0; this.ms = 0; this.motor = ''; this.alto = 384; }

  cargar(avisar) {
    this.trabajador = new Worker(new URL('./ojo-trabajador.js', import.meta.url), { type: 'module' });
    const forzado = new URLSearchParams(location.search).get('modelo'); // para pruebas: ?modelo=ruta.onnx
    return new Promise((resolver, rechazar) => {
      this.trabajador.onmessage = (e) => {
        const r = e.data;
        if (r.tipo === 'aviso') avisar(r.texto);
        else if (r.tipo === 'listo') { this.motor = r.motor; this.listo = true; resolver(); }
        else if (r.tipo === 'error') { if (!this.listo) rechazar(new Error(r.texto)); else { console.warn('ojo:', r.texto); this.ocupado = false; } }
        else if (r.tipo === 'mapa') {
          this.mapa = r.mapa; this.ancho = r.w; this.altoMapa = r.h; this.version++;
          this.ms = this.ms ? this.ms * 0.8 + r.ms * 0.2 : r.ms; this.ocupado = false;
        }
      };
      this.trabajador.onerror = (e) => rechazar(new Error(e.message || 'el hilo del ojo falló'));
      this.trabajador.postMessage({ tipo: 'cargar', forzado: forzado ? new URL(forzado, location.href).href : null });
    });
  }

  // mandar el trozo visible de la cámara, reducido, al otro hilo (sin espejo; fila 0 = arriba)
  async ver(video, rec) {
    if (!this.listo || this.ocupado || !video.videoWidth) return;
    this.ocupado = true;
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      const sw = Math.max(1, Math.round(rec[2] * vw)), sh = Math.max(1, Math.round(rec[3] * vh));
      const H = this.alto, W = Math.max(96, Math.round((H * sw / sh) / 32) * 32);
      const imagen = await createImageBitmap(video, Math.round(rec[0] * vw), Math.round(rec[1] * vh), sw, sh, { resizeWidth: W, resizeHeight: H, resizeQuality: 'low' });
      this.trabajador.postMessage({ tipo: 'ver', imagen }, [imagen]);
    } catch (e) { console.warn('ojo:', e); this.ocupado = false; }
  }

  recuento() {
    if (!this.mapa) return [];
    const c = new Map(); for (const k of this.mapa) c.set(k, (c.get(k) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n / this.mapa.length]);
  }
}
