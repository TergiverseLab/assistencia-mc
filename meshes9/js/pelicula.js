// pelicula.js — la película: un <video> que se carga desde el ordenador y una textura con su fotograma actual.
import { textura } from './gl.js';
export class Pelicula {
  constructor(gl) { this.gl = gl; this.v = document.createElement('video'); this.v.muted = false; this.v.playsInline = true; this.v.loop = true;
    this.texs = [textura(gl, gl.LINEAR), textura(gl, gl.LINEAR)]; this.i = 0; this.nuevo = true;
    // aviso de cada fotograma nuevo de la película (24 por segundo), para no repetir el arrastre en la pantalla de 60
    const cb = () => { this.nuevo = true; this.v.requestVideoFrameCallback(cb); };
    if (this.v.requestVideoFrameCallback) this.v.requestVideoFrameCallback(cb);
  }
  get tex() { return this.texs[this.i]; }
  get antes() { return this.texs[this.i ^ 1]; }
  async cargar(archivo) {
    this.v.src = URL.createObjectURL(archivo);
    await new Promise((ok, mal) => { this.v.onloadeddata = ok; this.v.onerror = () => mal(new Error('el navegador no puede leer este vídeo')); });
    this.duracion = this.v.duration;
  }
  // sube el fotograma actual a su textura y devuelve una copia propia si se pide (para un fotograma-espacio)
  // sube el fotograma actual si es nuevo (el anterior queda en «antes»); devuelve si lo era
  actualizar() {
    if (!this.nuevo && this.v.requestVideoFrameCallback) return false;
    this.nuevo = false; this.i ^= 1;
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.v);
    return true;
  }
  copia() {
    const gl = this.gl, t = textura(gl, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.v);
    return t;
  }
  // copia reducida del fotograma actual (en la tarjeta gráfica), para los fotogramas que se quedan en el espacio
  copiaPequena(w = 640, h = 360) {
    const gl = this.gl, t = textura(gl, gl.LINEAR, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    if (!this.fL) { this.fL = gl.createFramebuffer(); this.fD = gl.createFramebuffer(); }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fL); gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fD); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.blitFramebuffer(0, 0, this.v.videoWidth, this.v.videoHeight, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    return t;
  }
  get t() { return this.v.currentTime; }
}
