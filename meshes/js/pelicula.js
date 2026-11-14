// pelicula.js — la película: un <video> que se carga desde el ordenador y una textura con su fotograma actual.
import { textura } from './gl.js';
export class Pelicula {
  constructor(gl) { this.gl = gl; this.v = document.createElement('video'); this.v.muted = false; this.v.playsInline = true; this.v.loop = true; this.tex = textura(gl, gl.LINEAR); }
  async cargar(archivo) {
    this.v.src = URL.createObjectURL(archivo);
    await new Promise((ok, mal) => { this.v.onloadeddata = ok; this.v.onerror = () => mal(new Error('el navegador no puede leer este vídeo')); });
    this.duracion = this.v.duration;
  }
  // sube el fotograma actual a su textura y devuelve una copia propia si se pide (para un fotograma-espacio)
  actualizar() { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.v); }
  copia() {
    const gl = this.gl, t = textura(gl, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.v);
    return t;
  }
  get t() { return this.v.currentTime; }
}
