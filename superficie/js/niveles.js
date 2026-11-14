// niveles.js — el ajuste automático de niveles, como el ojo que se acostumbra a la luz.
// Cuatro veces por segundo, una miniatura de la cámara (48 × 48, reducida por el navegador fuera de este hilo)
// va a niveles-trabajador.js, que devuelve el gris más oscuro y el más claro de la escena (percentiles 2 y 98).
// La pasada de luz estira ese tramo a todo el rango de la tinta: una habitación gris se escribe con negros y
// blancos. El hilo de la imagen no lee nunca píxeles de la cámara.
export class Niveles {
  constructor() {
    this.valor = [0, 1]; this.objetivo = [0, 1]; this.ultimo = 0; this.ocupado = false;
    this.trabajador = new Worker(new URL('./niveles-trabajador.js', import.meta.url));
    this.trabajador.onmessage = (e) => { this.objetivo = e.data; this.ocupado = false; };
  }
  medir(video, rec, t) {
    if (t - this.ultimo > 0.25 && !this.ocupado && video.videoWidth) {
      this.ultimo = t; this.ocupado = true;
      const vw = video.videoWidth, vh = video.videoHeight;
      createImageBitmap(video, Math.round(rec[0] * vw), Math.round(rec[1] * vh), Math.max(1, Math.round(rec[2] * vw)), Math.max(1, Math.round(rec[3] * vh)), { resizeWidth: 48, resizeHeight: 48, resizeQuality: 'low' })
        .then((img) => this.trabajador.postMessage(img, [img])).catch(() => { this.ocupado = false; });
    }
    // suave, para que la escritura no parpadee cuando la cámara cambia de exposición
    this.valor = this.valor.map((v, i) => v + (this.objetivo[i] - v) * 0.08);
    return this.valor;
  }
}
