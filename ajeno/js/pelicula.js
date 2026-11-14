// pelicula.js — saca fotogramas de una película del móvil para el banco.
// La recorre por pasadas: primero 1 fotograma cada pocos minutos, por toda la película; luego los huecos
// intermedios, y así sucesivamente. Desde los primeros segundos el banco ya tiene escenas de toda la película,
// y se va densificando mientras se usa. Cada fotograma sale recortado al centro, con la forma de la pantalla.
export class Pelicula {
  constructor(archivo, aspecto, ancho, alto, entregar) {
    this.v = document.createElement('video');
    this.v.muted = true; this.v.playsInline = true; this.v.preload = 'auto';
    this.v.src = URL.createObjectURL(archivo);
    this.nombre = archivo.name; this.aspecto = aspecto; this.ancho = ancho; this.alto = alto; this.entregar = entregar;
    this.sacados = 0; this.parar = false;
  }
  async abrir() {
    await new Promise((ok, mal) => { this.v.onloadedmetadata = ok; this.v.onerror = () => mal(new Error('el móvil no sabe leer este vídeo (prueba con un .mp4)')); });
    if (!isFinite(this.v.duration) || this.v.duration <= 0) throw new Error('vídeo sin duración');
  }
  ir(t) {
    return new Promise((ok) => {
      const fin = () => { this.v.removeEventListener('seeked', fin); ok(); };
      this.v.addEventListener('seeked', fin); this.v.currentTime = t;
      setTimeout(fin, 1500); // por si el móvil no avisa
    });
  }
  // momentos de la película en orden de pasadas: 1/2, 1/4 y 3/4, 1/8, 3/8…
  *momentos(max) {
    const dur = this.v.duration - 0.1;
    for (let paso = 1; paso <= 1 << 16; paso *= 2) {
      for (let i = 1; i < paso * 2; i += 2) { yield (i / (paso * 2)) * dur; if (--max <= 0) return; }
    }
  }
  async recorrer(max, quedaSitio) {
    const vw = this.v.videoWidth, vh = this.v.videoHeight, ap = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (ap > this.aspecto) { sw = vh * this.aspecto; sx = (vw - sw) / 2; } else { sh = vw / this.aspecto; sy = (vh - sh) / 2; }
    for (const t of this.momentos(max)) {
      if (this.parar || !quedaSitio()) break;
      await this.ir(t);
      try {
        const img = await createImageBitmap(this.v, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), { resizeWidth: this.ancho, resizeHeight: this.alto, resizeQuality: 'medium' });
        this.entregar(img); this.sacados++;
      } catch (e) { /* fotograma ilegible: el siguiente */ }
    }
  }
}
